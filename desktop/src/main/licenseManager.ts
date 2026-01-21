import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { app } from 'electron';

const LICENSE_FILE = path.join(app.getPath('userData'), 'license.json');

// License validation server
const LICENSE_SERVER_URL = 'https://nextouch.futumore.pl/api/validate-license';

interface LicenseData {
    key: string;
    activatedAt: string;
    isPro: boolean;
    machineId: string;
}

/**
 * Get a unique machine identifier
 */
function getMachineId(): string {
    const os = require('os');
    const crypto = require('crypto');
    const cpus = os.cpus().map((c: any) => c.model).join('');
    const hostname = os.hostname();
    const combined = `${cpus}:${hostname}:nextouch`;
    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 32);
}

const CONFIG_FILE = path.join(app.getPath('userData'), 'config.json');
const REGISTRY_KEY = 'HKCU\\Software\\Nextouch';
const TRIAL_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 Days

interface TrialData {
    firstRun: number;
    lastSeen: number;
    machineHash: string;
    tampered?: boolean;
}

/**
 * Read from Windows Registry
 */
function readRegistry(valueName: string): string | null {
    try {
        const { execSync } = require('child_process');
        const result = execSync(
            `reg query "${REGISTRY_KEY}" /v ${valueName}`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        const match = result.match(/REG_SZ\s+(.+)/);
        return match ? match[1].trim() : null;
    } catch (e) {
        return null;
    }
}

/**
 * Write to Windows Registry
 */
function writeRegistry(valueName: string, value: string): boolean {
    try {
        const { execSync } = require('child_process');
        execSync(
            `reg add "${REGISTRY_KEY}" /v ${valueName} /t REG_SZ /d "${value}" /f`,
            { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
        );
        return true;
    } catch (e) {
        return false;
    }
}

/**
 * Generate a tamper-proof hash for this machine + install time
 */
function generateTrialHash(firstRun: number): string {
    const crypto = require('crypto');
    const machineId = getMachineId();
    const combined = `${machineId}:${firstRun}:nextouch-trial-v1`;
    return crypto.createHash('sha256').update(combined).digest('hex').substring(0, 16);
}

/**
 * Initialize or retrieve trial data from multiple sources
 * Priority: Registry > Config File > New Install
 */
function getTrialData(): TrialData {
    const now = Date.now();

    // Try Registry first (most persistent)
    const regFirstRun = readRegistry('InstallTime');
    const regLastSeen = readRegistry('LastSeen');
    const regHash = readRegistry('Hash');

    // Try config file as backup
    let fileData: Partial<TrialData> = {};
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            fileData = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        }
    } catch (e) { }

    // Determine firstRun from best available source
    let firstRun: number;
    let lastSeen: number;
    let machineHash: string;
    let tampered = false;

    if (regFirstRun) {
        // Registry has data
        firstRun = parseInt(regFirstRun, 10);
        lastSeen = regLastSeen ? parseInt(regLastSeen, 10) : now;
        machineHash = regHash || generateTrialHash(firstRun);

        // Validate hash matches this machine
        if (machineHash !== generateTrialHash(firstRun)) {
            console.log('Trial: Hash mismatch - config copied from another machine');
            tampered = true;
        }
    } else if (fileData.firstRun) {
        // Only file exists - migrate to registry
        firstRun = fileData.firstRun;
        lastSeen = fileData.lastSeen || now;
        machineHash = fileData.machineHash || generateTrialHash(firstRun);

        // Validate
        if (machineHash !== generateTrialHash(firstRun)) {
            tampered = true;
        }

        // Migrate to registry
        writeRegistry('InstallTime', String(firstRun));
        writeRegistry('Hash', machineHash);
    } else {
        // Fresh install
        firstRun = now;
        lastSeen = now;
        machineHash = generateTrialHash(firstRun);

        // Save to both locations
        writeRegistry('InstallTime', String(firstRun));
        writeRegistry('Hash', machineHash);
    }

    // Anti-clock-backward detection
    if (now < lastSeen - 60000) { // Allow 1 minute tolerance
        console.log('Trial: Clock manipulation detected (time went backward)');
        tampered = true;
    }

    // Update lastSeen
    writeRegistry('LastSeen', String(now));

    // Save to config file as backup
    const trialData: TrialData = { firstRun, lastSeen: now, machineHash, tampered };
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(trialData));
    } catch (e) { }

    return trialData;
}

export function isTrialExpired(): boolean {
    if (isPro()) return false; // Pro users never expire

    const trialData = getTrialData();
    const now = Date.now();

    // Tampered = instant expire
    if (trialData.tampered) {
        return true;
    }

    return (now - trialData.firstRun) > TRIAL_DURATION;
}

/**
 * Load license from disk
 */
export function loadLicense(): LicenseData | null {
    try {
        if (fs.existsSync(LICENSE_FILE)) {
            const data = fs.readFileSync(LICENSE_FILE, 'utf-8');
            return JSON.parse(data);
        }
    } catch (e) {
        console.error('Failed to load license:', e);
    }
    return null;
}

/**
 * Check if user has Pro license (cached)
 */
export function isPro(): boolean {
    const license = loadLicense();
    return license?.isPro === true;
}

/**
 * Validate license key online (one-time check)
 * Returns: { valid: boolean, message: string }
 */
export async function validateLicenseOnline(key: string): Promise<{ valid: boolean; message: string }> {
    const machineId = getMachineId();

    return new Promise((resolve) => {
        const postData = JSON.stringify({ key, machineId });

        const url = new URL(LICENSE_SERVER_URL);
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.valid) {
                        // Save license locally
                        const licenseData: LicenseData = {
                            key,
                            activatedAt: new Date().toISOString(),
                            isPro: true,
                            machineId
                        };
                        fs.writeFileSync(LICENSE_FILE, JSON.stringify(licenseData, null, 2));
                    }
                    resolve({ valid: result.valid, message: result.message || '' });
                } catch (e) {
                    resolve({ valid: false, message: 'Invalid server response' });
                }
            });
        });

        req.on('error', (e) => {
            console.error('License validation error:', e);
            resolve({ valid: false, message: 'Network error. Check your connection.' });
        });

        req.setTimeout(10000, () => {
            req.destroy();
            resolve({ valid: false, message: 'Connection timeout' });
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Simple format check for license keys (NXTH-XXXX-XXXX-XXXX)
 */
export function isValidKeyFormat(key: string): boolean {
    const pattern = /^NXTH-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
    return pattern.test(key.toUpperCase());
}

/**
 * Clear license (for testing)
 */
export function clearLicense(): void {
    try {
        if (fs.existsSync(LICENSE_FILE)) {
            fs.unlinkSync(LICENSE_FILE);
        }
    } catch (e) {
        console.error('Failed to clear license:', e);
    }
}
