import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';

const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 Days
const STORAGE_KEY = '@nextouch_trial';

interface TrialData {
    firstRun: number;
    lastSeen: number;
    deviceHash: string;
    tampered?: boolean;
}

/**
 * Generate a device-specific hash to prevent data copying
 */
async function getDeviceHash(installTime: number): Promise<string> {
    const bundleId = Application.applicationId || 'nextouch';
    const combined = `${bundleId}:${installTime}:nextouch-trial-v1`;
    const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        combined
    );
    return hash.substring(0, 16);
}

/**
 * Get the OS-level installation time (cannot be faked without reinstall)
 */
async function getOSInstallTime(): Promise<number | null> {
    try {
        const installTime = await Application.getInstallationTimeAsync();
        return installTime ? installTime.getTime() : null;
    } catch (e) {
        return null;
    }
}

/**
 * Initialize or retrieve trial data
 * Uses OS install time as primary source (unfakeable)
 */
export async function getTrialData(): Promise<TrialData> {
    const now = Date.now();

    // Get OS-level install time (best source, user cannot change)
    const osInstallTime = await getOSInstallTime();

    // Get stored data from AsyncStorage
    let storedData: Partial<TrialData> = {};
    try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
            storedData = JSON.parse(stored);
        }
    } catch (e) { }

    let firstRun: number;
    let lastSeen: number;
    let deviceHash: string;
    let tampered = false;

    if (osInstallTime) {
        // Use OS install time (most reliable)
        firstRun = osInstallTime;
        lastSeen = storedData.lastSeen || now;
        deviceHash = await getDeviceHash(firstRun);

        // If stored hash doesn't match, data was copied from another device
        if (storedData.deviceHash && storedData.deviceHash !== deviceHash) {
            console.log('Trial: Hash mismatch - data restored from backup');
            tampered = true;
        }
    } else if (storedData.firstRun) {
        // Fallback to stored data (less reliable)
        firstRun = storedData.firstRun;
        lastSeen = storedData.lastSeen || now;
        deviceHash = storedData.deviceHash || await getDeviceHash(firstRun);
    } else {
        // Fresh install
        firstRun = now;
        lastSeen = now;
        deviceHash = await getDeviceHash(firstRun);
    }

    // Anti-clock-backward detection
    if (now < lastSeen - 60000) { // 1 minute tolerance
        console.log('Trial: Clock manipulation detected');
        tampered = true;
    }

    // Save updated data
    const trialData: TrialData = { firstRun, lastSeen: now, deviceHash, tampered };
    try {
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trialData));
    } catch (e) { }

    return trialData;
}

/**
 * Check if trial has expired
 */
export async function isTrialExpired(): Promise<boolean> {
    const trialData = await getTrialData();
    const now = Date.now();

    // Tampered = instant expire
    if (trialData.tampered) {
        return true;
    }

    return (now - trialData.firstRun) > TRIAL_DURATION_MS;
}

/**
 * Get remaining trial time in days (for UI display)
 */
export async function getTrialDaysRemaining(): Promise<number> {
    const trialData = await getTrialData();
    const now = Date.now();
    const elapsed = now - trialData.firstRun;
    const remaining = TRIAL_DURATION_MS - elapsed;
    return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}
