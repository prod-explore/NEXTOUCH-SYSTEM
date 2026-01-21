import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Linking } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { colors } from '../styles/theme';
import { client } from '../services/P2PClient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts, Orbitron_700Bold } from '@expo-google-fonts/orbitron';

import { isTrialExpired, getTrialDaysRemaining } from '../services/TrialManager';

const { width } = Dimensions.get('window');
const CAMERA_SIZE = Math.min(width * 0.6, 280); // Smaller square, max 280px

export default function ConnectScreen() {
    const [permission, requestPermission] = useCameraPermissions();
    const [scanned, setScanned] = useState(false);
    const [fontsLoaded] = useFonts({ Orbitron_700Bold });
    const [trialExpired, setTrialExpired] = useState(false);
    const [daysRemaining, setDaysRemaining] = useState(7);

    useEffect(() => {
        // Lock to portrait
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);

        // Check trial status
        (async () => {
            const expired = await isTrialExpired();
            const days = await getTrialDaysRemaining();
            setTrialExpired(expired);
            setDaysRemaining(days);
        })();
    }, []);

    useEffect(() => {
        if (!permission) requestPermission();
    }, [permission]);

    const handleBarCodeScanned = ({ data }: { data: string }) => {
        if (scanned) return;
        try {
            const config = JSON.parse(data);
            // Support both old format (ip) and new format (ips array)
            const ips = config.ips || (config.ip ? [config.ip] : null);
            if (ips && config.port && config.token) {
                setScanned(true);
                client.connect(ips, config.port, config.token);
                router.replace('/touchpad');
            }
        } catch (e) { }
    };

    if (!permission || !permission.granted) {
        return (
            <View style={styles.container}>
                <Text style={styles.title}>Camera Permission Required</Text>
                <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
                    <Text style={styles.permissionButtonText}>Grant Permission</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // Trial Expired Screen
    if (trialExpired) {
        return (
            <View style={styles.container}>
                <Text style={styles.appName}>Nextouch</Text>
                <View style={styles.expiredContainer}>
                    <Text style={styles.expiredIcon}>⏰</Text>
                    <Text style={styles.expiredTitle}>Trial Expired</Text>
                    <Text style={styles.expiredText}>
                        Your 7-day free trial has ended.{'\n'}
                        Upgrade to Pro for unlimited usage.
                    </Text>
                    <TouchableOpacity
                        style={styles.proButton}
                        onPress={() => Linking.openURL('https://nextouch.futumore.pl/#pricing')}
                    >
                        <Text style={styles.proButtonText}>Get Pro — $2.99</Text>
                    </TouchableOpacity>
                    <Text style={styles.proNote}>One-time payment • Lifetime access</Text>
                </View>
            </View>
        );
    }


    return (
        <View style={styles.container}>
            {/* App Name */}
            <Text style={styles.appName}>Nextouch</Text>

            {/* Title */}
            <Text style={styles.title}>Scan to Connect</Text>

            {/* Camera with outer frame */}
            <View style={styles.frameContainer}>
                {/* White corner decorations - OUTSIDE camera */}
                <View style={[styles.corner, styles.tl]} />
                <View style={[styles.corner, styles.tr]} />
                <View style={[styles.corner, styles.bl]} />
                <View style={[styles.corner, styles.br]} />

                {/* Camera View */}
                <View style={styles.cameraContainer}>
                    <CameraView
                        style={styles.camera}
                        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                        barcodeScannerSettings={{
                            barcodeTypes: ["qr"],
                        }}
                    />
                </View>
            </View>

            {/* Instructions */}
            <View style={styles.instructions}>
                <Text style={styles.step}>1. Same WiFi, hotspot, or USB tethering</Text>
                <Text style={styles.hint}>(works without internet)</Text>
                <Text style={styles.step}>2. Open receiver app</Text>
                <Text style={styles.step}>3. Scan QR code</Text>

                <TouchableOpacity
                    style={styles.getDesktopButton}
                    onPress={() => Linking.openURL('https://nextouch.futumore.pl/#download')}
                >
                    <Text style={styles.getDesktopText}>Need Desktop App?</Text>
                </TouchableOpacity>
            </View>

            {/* Banner Ad */}
            <View style={{ position: 'absolute', bottom: 0, width: '100%' }}>

            </View>

            {/* DEV: Reset tutorial button */}
            <TouchableOpacity
                style={styles.devButton}
                onPress={async () => {
                    await AsyncStorage.removeItem('@nextouch_tutorial_seen');
                }}
            >
                <Text style={styles.devButtonText}>Reset Tutorial</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    appName: {
        position: 'absolute',
        top: '11%',
        color: 'white',
        fontSize: 32,
        fontFamily: 'Orbitron_700Bold',
        letterSpacing: 3,
    },
    title: {
        color: 'white',
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 30,
    },
    frameContainer: {
        width: CAMERA_SIZE + 20,
        height: CAMERA_SIZE + 20,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    cameraContainer: {
        width: CAMERA_SIZE,
        height: CAMERA_SIZE,
        borderRadius: 12,
        overflow: 'hidden',
    },
    camera: {
        width: '100%',
        height: '100%',
    },
    corner: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderColor: 'white',
    },
    tl: {
        top: 0, left: 0,
        borderTopWidth: 3, borderLeftWidth: 3,
    },
    tr: {
        top: 0, right: 0,
        borderTopWidth: 3, borderRightWidth: 3,
    },
    bl: {
        bottom: 0, left: 0,
        borderBottomWidth: 3, borderLeftWidth: 3,
    },
    br: {
        bottom: 0, right: 0,
        borderBottomWidth: 3, borderRightWidth: 3,
    },
    instructions: {
        marginTop: 40,
        alignItems: 'flex-start',
    },
    step: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 16,
        marginVertical: 6,
    },
    hint: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 13,
        marginLeft: 16,
        marginBottom: 4,
    },
    stepDone: {
        color: colors.success,
        fontSize: 16,
        marginVertical: 6,
        fontWeight: 'bold',
    },
    permissionButton: {
        backgroundColor: colors.amethyst,
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
        marginTop: 20,
    },
    permissionButtonText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    devButton: {
        position: 'absolute',
        bottom: 10,
        alignSelf: 'center',
        padding: 8,
    },
    devButtonText: {
        color: 'rgba(255,255,255,0.2)',
        fontSize: 10,
    },
    // Trial Expired Styles
    expiredContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 40,
    },
    expiredIcon: {
        fontSize: 64,
        marginBottom: 20,
    },
    expiredTitle: {
        color: '#ff4444',
        fontSize: 28,
        fontWeight: 'bold',
        marginBottom: 16,
    },
    expiredText: {
        color: 'rgba(255,255,255,0.7)',
        fontSize: 16,
        textAlign: 'center',
        lineHeight: 24,
        marginBottom: 30,
    },
    proButton: {
        backgroundColor: '#4CAF50',
        paddingHorizontal: 32,
        paddingVertical: 14,
        borderRadius: 8,
        marginBottom: 12,
    },
    proButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    proNote: {
        color: 'rgba(255,255,255,0.4)',
        fontSize: 12,
    },
    getDesktopButton: {
        marginTop: 20,
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.2)',
    },
    getDesktopText: {
        color: 'white',
        fontSize: 14,
    },
});
