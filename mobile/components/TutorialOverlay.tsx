import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, useWindowDimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@nextouch_tutorial_seen';

interface TutorialOverlayProps {
    onComplete: () => void;
}

export default function TutorialOverlay({ onComplete }: TutorialOverlayProps) {
    const { width, height } = useWindowDimensions(); // Gets current dimensions (landscape)
    const [currentStep, setCurrentStep] = useState(0);

    // Tutorial steps with positions matching actual UI elements
    const TUTORIAL_STEPS = [
        {
            id: 'status',
            title: 'Connection Status',
            description: 'Green = connected\nRed = disconnected',
            // Slide 1: dot closer to corner (4px from edges)
            highlightX: 5,
            highlightY: 3,
            highlightSize: 26,
            textX: 40,
            textY: 40,
        },
        {
            id: 'keyboard',
            title: 'Keyboard',
            description: 'Tap to toggle\non-screen keyboard',
            // Slide 2: at right edge (margin-left: 0px means right-aligned)
            highlightX: width - 25,
            highlightY: 5,
            highlightSize: 45,
            textX: width - 200,
            textY: 55,
        },
        {
            id: 'exit',
            title: 'Exit / Menu',
            description: 'Tap to return\nto QR scanner',
            // Slide 3: 7% of white box width (130px * 0.07 ≈ 9px) to the right
            highlightX: (width / 2) - 65 + 12,
            highlightY: -2,
            highlightW: 140,
            highlightH: 32,
            textX: (width / 2) - 80,
            textY: 45,
        },
        {
            id: 'move',
            title: 'Move Cursor',
            description: 'Swipe with one finger\nto move the mouse',
            // Slides 4-6: whole screen border
            highlightX: 0,
            highlightY: 0,
            highlightW: width + 15,
            highlightH: height + 15,
            textX: width * 0.35,
            textY: height * 0.4,
        },
        {
            id: 'click',
            title: 'Click',
            description: 'Tap once = left click\nTwo-finger tap = right click',
            highlightX: 0,
            highlightY: 0,
            highlightW: width + 15,
            highlightH: height + 15,
            textX: width * 0.35,
            textY: height * 0.4,
        },
        {
            id: 'drag',
            title: 'Drag',
            description: 'Tap twice quickly,\nhold on second tap,\nthen move finger',
            highlightX: 0,
            highlightY: 0,
            highlightW: width + 15,
            highlightH: height + 15,
            textX: width * 0.35,
            textY: height * 0.35,
        },
    ];

    const step = TUTORIAL_STEPS[currentStep];

    const handleTap = async () => {
        if (currentStep < TUTORIAL_STEPS.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            // Mark tutorial as seen
            await AsyncStorage.setItem(STORAGE_KEY, 'true');
            onComplete();
        }
    };

    // Get highlight style based on step
    const getHighlightStyle = () => {
        if (step.highlightW && step.highlightH) {
            // Rectangle highlight
            return {
                left: step.highlightX,
                top: step.highlightY,
                width: step.highlightW,
                height: step.highlightH,
                borderRadius: 8,
            };
        } else {
            // Circle highlight
            return {
                left: step.highlightX,
                top: step.highlightY,
                width: step.highlightSize,
                height: step.highlightSize,
                borderRadius: step.highlightSize! / 2,
            };
        }
    };

    return (
        <TouchableOpacity
            style={styles.container}
            activeOpacity={1}
            onPress={handleTap}
        >
            {/* Blur overlay */}
            <BlurView intensity={50} style={StyleSheet.absoluteFill} tint="dark" />

            {/* Dark overlay for extra dimming */}
            <View style={styles.darkOverlay} />

            {/* Highlight cutout (clear area) */}
            <View style={[styles.highlight, getHighlightStyle()]} />

            {/* Text box */}
            <View style={[styles.textBox, {
                left: step.textX,
                top: step.textY
            }]}>
                <Text style={styles.title}>{step.title}</Text>
                <Text style={styles.description}>{step.description}</Text>
            </View>

            {/* Progress indicator */}
            <View style={styles.progress}>
                {TUTORIAL_STEPS.map((_, i) => (
                    <View
                        key={i}
                        style={[
                            styles.dot,
                            i === currentStep && styles.activeDot
                        ]}
                    />
                ))}
            </View>

            {/* Tap hint */}
            <Text style={styles.hint}>Tap anywhere to continue</Text>
        </TouchableOpacity>
    );
}

// Helper to check if tutorial should be shown
export async function shouldShowTutorial(): Promise<boolean> {
    try {
        const seen = await AsyncStorage.getItem(STORAGE_KEY);
        return seen !== 'true';
    } catch {
        return true;
    }
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFillObject,
        zIndex: 1000,
    },
    darkOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    highlight: {
        position: 'absolute',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderColor: 'white',
    },
    line: {
        position: 'absolute',
        backgroundColor: 'white',
    },
    textBox: {
        position: 'absolute',
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.3)',
        minWidth: 160,
    },
    title: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 4,
    },
    description: {
        color: 'rgba(255,255,255,0.8)',
        fontSize: 14,
        lineHeight: 20,
    },
    progress: {
        position: 'absolute',
        bottom: 40,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    activeDot: {
        backgroundColor: 'white',
    },
    hint: {
        position: 'absolute',
        bottom: 15,
        left: 0,
        right: 0,
        textAlign: 'center',
        color: 'rgba(255,255,255,0.5)',
        fontSize: 12,
    },
});
