import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';

const INSTALL_DATE_KEY = '@nextouch_install_date';
const INSTALL_HASH_KEY = '@nextouch_install_hash';
const PRO_SESSION_KEY = '@nextouch_pro_session';
const TRIAL_DAYS = 14;

export interface LicenseStatus {
    isPro: boolean;
    isTrialActive: boolean;
    daysRemaining: number;
    needsAds: boolean;
}

/**
 * Get device fingerprint (survives reinstall on Android)
 */
async function getDeviceFingerprint(): Promise<string> {
    const androidId = Application.getAndroidId() || 'unknown';
    return androidId;
}

/**
 * Create a hash to validate the install date wasn't tampered with
 */
async function createInstallHash(dateStr: string): Promise<string> {
    const fingerprint = await getDeviceFingerprint();
    const combined = `${dateStr}:${fingerprint}:nextouch_salt_2024`;
    const hash = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        combined
    );
    return hash.substring(0, 16);
}

/**
 * Records the install date with anti-tamper hash
 */
export async function recordInstallDate(): Promise<void> {
    const existing = await AsyncStorage.getItem(INSTALL_DATE_KEY);
    if (!existing) {
        const now = new Date().toISOString();
        const hash = await createInstallHash(now);
        await AsyncStorage.setItem(INSTALL_DATE_KEY, now);
        await AsyncStorage.setItem(INSTALL_HASH_KEY, hash);
    }
}

/**
 * Gets the validated install date (checks for tampering)
 */
async function getValidatedInstallDate(): Promise<Date | null> {
    const dateStr = await AsyncStorage.getItem(INSTALL_DATE_KEY);
    const storedHash = await AsyncStorage.getItem(INSTALL_HASH_KEY);

    if (!dateStr) return null;

    // Validate hash to detect tampering
    const expectedHash = await createInstallHash(dateStr);
    if (storedHash !== expectedHash) {
        // Tampering detected - treat as if trial expired long ago
        console.warn('Install date tampering detected');
        return new Date(0); // Return epoch = trial expired
    }

    return new Date(dateStr);
}

/**
 * Gets the number of days since install
 */
export async function getDaysSinceInstall(): Promise<number> {
    const installDate = await getValidatedInstallDate();
    if (!installDate) {
        await recordInstallDate();
        return 0;
    }
    const now = new Date();
    const diffMs = now.getTime() - installDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    return diffDays;
}

/**
 * Set Pro status for current session (received from desktop)
 */
export async function setProSession(isPro: boolean): Promise<void> {
    await AsyncStorage.setItem(PRO_SESSION_KEY, isPro ? 'true' : 'false');
}

/**
 * Check if current session is Pro (from last desktop connection)
 */
export async function isProSession(): Promise<boolean> {
    const session = await AsyncStorage.getItem(PRO_SESSION_KEY);
    return session === 'true';
}

/**
 * Gets the full license status for the app
 */
export async function getLicenseStatus(): Promise<LicenseStatus> {
    const isPro = await isProSession();
    const daysSinceInstall = await getDaysSinceInstall();
    const isTrialActive = daysSinceInstall < TRIAL_DAYS;
    const daysRemaining = Math.max(0, TRIAL_DAYS - daysSinceInstall);

    // User needs ads if: not Pro session AND trial expired
    const needsAds = !isPro && !isTrialActive;

    return {
        isPro,
        isTrialActive,
        daysRemaining,
        needsAds,
    };
}

/**
 * FOR TESTING: Reset trial (only works in dev)
 */
export async function resetTrial(): Promise<void> {
    if (__DEV__) {
        await AsyncStorage.removeItem(INSTALL_DATE_KEY);
        await AsyncStorage.removeItem(INSTALL_HASH_KEY);
        await AsyncStorage.removeItem(PRO_SESSION_KEY);
    }
}
