import React, { useEffect, useLayoutEffect, useState, useRef } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, TextInput, StatusBar, ImageBackground } from 'react-native';
import * as ScreenOrientation from 'expo-screen-orientation';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useSharedValue } from 'react-native-reanimated';
import { client } from '../services/P2PClient';
import { colors } from '../styles/theme';
import { router } from 'expo-router';
import TutorialOverlay, { shouldShowTutorial } from '../components/TutorialOverlay';



export default function TouchpadScreen() {
    const [isConnected, setConnected] = useState(false);
    const [showTutorial, setShowTutorial] = useState(false);

    // Force landscape orientation immediately (before paint)
    useLayoutEffect(() => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    }, []);

    useEffect(() => {
        // Check if first launch (show tutorial)
        shouldShowTutorial().then(show => setShowTutorial(show));

        return () => {
            // Unlock on unmount
            ScreenOrientation.unlockAsync();
        };
    }, []);

    const lastX = useSharedValue(0);
    const lastY = useSharedValue(0);

    // State
    const lastTapTime = useRef(0);
    const isDragging = useRef(false);
    const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingClickCount = useRef(0);

    useEffect(() => {
        const unsub = client.onStatusChange((status, message) => {
            setConnected(status === 'connected');
            if (status === 'error') {
                alert(message || 'Connection Error');
                router.replace('/');
            }
        });
        return unsub;
    }, []);

    const sendMove = (dx: number, dy: number) => {
        client.move(dx, dy);
    };

    const sendClick = (button: 'left' | 'right') => {
        client.click(button);
    };

    const sendScroll = (dx: number, dy: number) => {
        client.scroll(dx, dy);
    };

    // Called on pan start - if second touch within 300ms, start drag immediately
    const checkAndStartDrag = () => {
        const now = Date.now();
        const timeSinceLastTap = now - lastTapTime.current;

        if (timeSinceLastTap < 200) {
            // This is the second touch - IMMEDIATELY start drag
            // Cancel any pending clicks first
            if (clickTimer.current) {
                clearTimeout(clickTimer.current);
                clickTimer.current = null;
            }
            pendingClickCount.current = 0;

            isDragging.current = true;
            client.send('mousedown', { button: 'left' });
        }
    };

    const endDrag = () => {
        if (isDragging.current) {
            isDragging.current = false;
            client.send('mouseup', { button: 'left' });
        }
    };

    // Handle tap - queue click with small delay for double-click detection
    const handleTap = () => {
        lastTapTime.current = Date.now();
        pendingClickCount.current += 1;

        if (clickTimer.current) {
            clearTimeout(clickTimer.current);
        }

        clickTimer.current = setTimeout(() => {
            const clicks = pendingClickCount.current;
            pendingClickCount.current = 0;
            clickTimer.current = null;

            if (!isDragging.current) {
                for (let i = 0; i < clicks; i++) {
                    sendClick('left');
                }
            }
        }, 200);
    };

    // Single finger pan
    const pan = Gesture.Pan()
        .minDistance(0)
        .maxPointers(1)
        .onStart(() => {
            'worklet';
            lastX.value = 0;
            lastY.value = 0;
            runOnJS(checkAndStartDrag)();
        })
        .onUpdate((e) => {
            'worklet';
            const dx = e.translationX - lastX.value;
            const dy = e.translationY - lastY.value;
            lastX.value = e.translationX;
            lastY.value = e.translationY;
            runOnJS(sendMove)(dx, dy);
        })
        .onEnd(() => {
            'worklet';
            runOnJS(endDrag)();
        });

    // Single tap
    const singleTap = Gesture.Tap()
        .maxDuration(200)
        .onEnd(() => {
            'worklet';
            runOnJS(handleTap)();
        });

    // Two finger tap = right click
    const twoFingerTap = Gesture.Tap()
        .minPointers(2)
        .maxDistance(10)
        .onEnd(() => {
            'worklet';
            runOnJS(sendClick)('right');
        });

    // Two finger scroll
    const scrollLastX = useSharedValue(0);
    const scrollLastY = useSharedValue(0);

    const twoFingerScroll = Gesture.Pan()
        .minPointers(2)
        .onStart(() => {
            'worklet';
            scrollLastX.value = 0;
            scrollLastY.value = 0;
        })
        .onUpdate((e) => {
            'worklet';
            const dx = e.translationX - scrollLastX.value;
            const dy = e.translationY - scrollLastY.value;
            scrollLastX.value = e.translationX;
            scrollLastY.value = e.translationY;
            runOnJS(sendScroll)(dx, dy);
        });

    const gestures = Gesture.Race(
        Gesture.Simultaneous(twoFingerTap, twoFingerScroll),
        Gesture.Race(pan, singleTap)
    );

    // Keyboard overlay state
    const [showKeyboard, setShowKeyboard] = useState(false);
    const [keyboardPage, setKeyboardPage] = useState<'letters' | 'symbols'>('letters');
    const [shift, setShift] = useState(false);
    const [capsLock, setCapsLock] = useState(false);
    const lastShiftTap = useRef(0);

    const handleShiftPress = () => {
        const now = Date.now();
        if (now - lastShiftTap.current < 300) {
            // Double-tap: toggle caps lock
            setCapsLock(!capsLock);
            setShift(false);
        } else {
            // Single tap: toggle shift (only if caps lock is off)
            if (capsLock) {
                setCapsLock(false);
            } else {
                setShift(!shift);
            }
        }
        lastShiftTap.current = now;
    };

    const isUpperCase = shift || capsLock;

    const sendKey = (k: string) => {
        if (isUpperCase && k.length === 1 && k.match(/[a-z]/)) {
            client.typeText(k.toUpperCase());
            if (!capsLock) setShift(false); // Only turn off shift, not caps lock
        } else {
            client.typeText(k);
        }
    };

    // Backspace hold-to-repeat
    const backspaceHoldTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const backspaceRepeatInterval = useRef<ReturnType<typeof setInterval> | null>(null);

    const handleBackspacePressIn = () => {
        // Send first backspace immediately
        client.typeText('{BACKSPACE}');

        // After 800ms, start repeating at 10/second
        backspaceHoldTimer.current = setTimeout(() => {
            backspaceRepeatInterval.current = setInterval(() => {
                client.typeText('{BACKSPACE}');
            }, 100); // 10 per second = every 100ms
        }, 800);
    };

    const handleBackspacePressOut = () => {
        if (backspaceHoldTimer.current) {
            clearTimeout(backspaceHoldTimer.current);
            backspaceHoldTimer.current = null;
        }
        if (backspaceRepeatInterval.current) {
            clearInterval(backspaceRepeatInterval.current);
            backspaceRepeatInterval.current = null;
        }
    };

    return (
        <GestureHandlerRootView style={styles.container}>
            <StatusBar hidden />

            {/* Wide notch button with burger menu */}
            <TouchableOpacity onPress={() => router.replace('/')} style={styles.backHandle}>
                <View style={styles.burgerContainer}>
                    <View style={styles.burgerLine} />
                    <View style={styles.burgerLine} />
                    <View style={styles.burgerLine} />
                </View>
            </TouchableOpacity>

            {/* Status dot - top right - green/red */}
            <View style={[styles.statusDot, { backgroundColor: isConnected ? '#00ff00' : '#ff0000' }]} />

            {/* Keyboard toggle - top right */}
            <TouchableOpacity
                onPress={() => setShowKeyboard(!showKeyboard)}
                style={styles.keyboardHandle}
            >
                <Text style={styles.keyboardIcon}>⌨️</Text>
            </TouchableOpacity>

            <GestureDetector gesture={gestures}>
                <Animated.View style={styles.touchArea}>
                    <Text style={styles.hint}>Full Screen Touchpad</Text>
                </Animated.View>
            </GestureDetector>

            {/* Smartphone-style Keyboard */}
            {showKeyboard && (
                <View style={styles.keyboardOverlay}>
                    {keyboardPage === 'letters' ? (
                        <>
                            {/* Row 0: Numbers always on top */}
                            <View style={styles.keyRow}>
                                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(k => (
                                    <TouchableOpacity key={k} style={styles.key} onPress={() => sendKey(k)}>
                                        <Text style={styles.keyText}>{k}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {/* Row 1: QWERTYUIOP */}
                            <View style={styles.keyRow}>
                                {['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'].map(k => (
                                    <TouchableOpacity key={k} style={styles.key} onPress={() => sendKey(k)}>
                                        <Text style={styles.keyText}>{isUpperCase ? k.toUpperCase() : k}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {/* Row 2: ASDFGHJKL */}
                            <View style={styles.keyRow}>
                                <View style={styles.halfSpacer} />
                                {['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'].map(k => (
                                    <TouchableOpacity key={k} style={styles.key} onPress={() => sendKey(k)}>
                                        <Text style={styles.keyText}>{isUpperCase ? k.toUpperCase() : k}</Text>
                                    </TouchableOpacity>
                                ))}
                                <View style={styles.halfSpacer} />
                            </View>
                            {/* Row 3: Shift + ZXCVBNM + Backspace */}
                            <View style={styles.keyRow}>
                                <TouchableOpacity
                                    style={[styles.key, styles.wideKey, shift && styles.activeKey, capsLock && styles.capsLockKey]}
                                    onPress={handleShiftPress}
                                >
                                    <Text style={styles.iconText}>{capsLock ? '⇪' : '⇧'}</Text>
                                </TouchableOpacity>
                                {['z', 'x', 'c', 'v', 'b', 'n', 'm'].map(k => (
                                    <TouchableOpacity key={k} style={styles.key} onPress={() => sendKey(k)}>
                                        <Text style={styles.keyText}>{isUpperCase ? k.toUpperCase() : k}</Text>
                                    </TouchableOpacity>
                                ))}
                                <TouchableOpacity
                                    style={[styles.key, styles.wideKey]}
                                    onPressIn={handleBackspacePressIn}
                                    onPressOut={handleBackspacePressOut}
                                >
                                    <Text style={styles.keyText}>⌫</Text>
                                </TouchableOpacity>
                            </View>
                            {/* Row 4: 123 + Space + Enter */}
                            <View style={styles.keyRow}>
                                <TouchableOpacity style={[styles.key, styles.wideKey]} onPress={() => setKeyboardPage('symbols')}>
                                    <Text style={styles.keyText}>123</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.key, styles.spaceKey]} onPress={() => client.typeText(' ')}>
                                    <Text style={styles.keyText}>space</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.key, styles.wideKey]} onPress={() => client.typeText('{ENTER}')}>
                                    <Text style={styles.iconText}>↵</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : (
                        <>
                            {/* Symbols Page - Row 1: Numbers */}
                            <View style={styles.keyRow}>
                                {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(k => (
                                    <TouchableOpacity key={k} style={styles.key} onPress={() => sendKey(k)}>
                                        <Text style={styles.keyText}>{k}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {/* Row 2: Symbols */}
                            <View style={styles.keyRow}>
                                {['-', '/', ':', ';', '(', ')', '$', '&', '@', '"'].map(k => (
                                    <TouchableOpacity key={k} style={styles.key} onPress={() => sendKey(k)}>
                                        <Text style={styles.keyText}>{k}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {/* Row 3: More Symbols */}
                            <View style={styles.keyRow}>
                                {['.', ',', '?', '!', '\'', '#', '%', '^', '*', '+'].map(k => (
                                    <TouchableOpacity key={k} style={styles.key} onPress={() => sendKey(k)}>
                                        <Text style={styles.keyText}>{k}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {/* Row 4: Special keys */}
                            <View style={styles.keyRow}>
                                <TouchableOpacity style={[styles.key, styles.wideKey]} onPress={() => setKeyboardPage('letters')}>
                                    <Text style={styles.keyText}>ABC</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.key} onPress={() => client.typeText('{TAB}')}>
                                    <Text style={styles.keyText}>Tab</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.key} onPress={() => client.typeText('{ESC}')}>
                                    <Text style={styles.keyText}>Esc</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[styles.key, styles.spaceKey]} onPress={() => client.typeText(' ')}>
                                    <Text style={styles.keyText}>space</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.key, styles.wideKey]}
                                    onPressIn={handleBackspacePressIn}
                                    onPressOut={handleBackspacePressOut}
                                >
                                    <Text style={styles.keyText}>⌫</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                </View>
            )}

            {/* First-time tutorial overlay */}
            {showTutorial && (
                <TutorialOverlay onComplete={() => setShowTutorial(false)} />
            )}
        </GestureHandlerRootView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: 'black',
    },
    // Back button - curvy notch dripping from top edge
    // Back button - wide notch with burger menu
    backHandle: {
        position: 'absolute',
        top: 0,
        alignSelf: 'center',
        left: '50%',
        marginLeft: -70,
        width: 140,
        height: 28, // Slightly taller for burger lines
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    // The white background container matching the old 'handleBar' look but holding lines
    burgerContainer: {
        width: 130,
        height: 26,
        backgroundColor: 'white',
        borderBottomLeftRadius: 12,
        borderBottomRightRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column', // Stack lines vertically
        paddingVertical: 5,
        gap: 3, // Space between lines
    },
    burgerLine: {
        width: 40, // Width of the black lines
        height: 3,
        backgroundColor: 'black',
        borderRadius: 1.5,
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        position: 'absolute',
        top: 12,
        left: 15,
        zIndex: 10,
    },
    keyboardHandle: {
        position: 'absolute',
        top: 5,
        right: 15,
        padding: 5,
        zIndex: 10,
    },
    keyboardIcon: {
        fontSize: 24,
    },
    touchArea: {
        flex: 1,
        backgroundColor: 'black',
        justifyContent: 'center',
        alignItems: 'center',
    },
    hint: {
        color: 'rgba(255,255,255,0.1)',
        fontSize: 20,
    },
    keyboardOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.95)',
        padding: 15,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.2)',
    },
    hiddenInput: {
        height: 1,
        opacity: 0,
        position: 'absolute',
    },
    textInput: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 10,
        padding: 15,
        fontSize: 18,
        color: 'white',
        marginBottom: 10,
    },
    specialKeys: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        flexWrap: 'wrap',
    },
    specialKey: {
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderRadius: 8,
        marginHorizontal: 5,
        marginVertical: 5,
    },
    closeKey: {
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    specialKeyText: {
        color: 'white',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Custom keyboard styles
    keyRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginVertical: 1,
        paddingHorizontal: 4,
    },
    key: {
        flex: 1,
        backgroundColor: 'rgba(255, 255, 255, 0.12)',
        height: 46,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 6,
        marginHorizontal: 2,
    },
    keyText: {
        color: 'white',
        fontSize: 16,
    },
    iconText: {
        color: 'white',
        fontSize: 22,
    },
    wideKey: {
        flex: 1.5,
    },
    spaceKey: {
        flex: 4,
    },
    halfSpacer: {
        flex: 0.5,
    },
    activeKey: {
        backgroundColor: 'rgba(255,255,255,0.35)',
    },
    capsLockKey: {
        backgroundColor: 'rgba(255,255,255,0.5)',
    },
});

