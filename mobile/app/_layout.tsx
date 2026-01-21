import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { colors } from '../styles/theme';
import { useEffect } from 'react';
// Safe import for AdMob (skips in Expo Go)
export default function Layout() {

    return (
        <>
            <StatusBar style="light" backgroundColor="black" />
            <Stack
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.black },
                    animation: 'fade',
                }}
            >
                <Stack.Screen name="index" />
                <Stack.Screen name="touchpad" options={{ orientation: 'landscape' }} />
            </Stack>
        </>
    );
}
