import { borderRadius, Spacing, Typography } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { Pause, Play, RotateCcw } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    Vibration,
    View
} from 'react-native';

const PRESETS = [30, 45, 60, 90, 120, 180];

export default function RestScreen() {
    const { colors } = useTheme();
    const [timeLeft, setTimeLeft] = useState(60);
    const [isActive, setIsActive] = useState(false);
    const [totalTime, setTotalTime] = useState(60);

    const progressAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        let interval: any = null;

        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0) {
            handleComplete();
        }

        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isActive, timeLeft]);

    useEffect(() => {
        // Animate progress circle
        Animated.timing(progressAnim, {
            toValue: timeLeft / totalTime,
            duration: 1000,
            easing: Easing.linear,
            useNativeDriver: false,
        }).start();
    }, [timeLeft, totalTime]);

    const handleComplete = () => {
        setIsActive(false);
        Vibration.vibrate([0, 500, 200, 500]);
        // Optional: Add sound notification here if needed
    };

    const toggleTimer = () => setIsActive(!isActive);

    const resetTimer = () => {
        setIsActive(false);
        setTimeLeft(totalTime);
        progressAnim.setValue(1);
    };

    const selectPreset = (seconds: number) => {
        setIsActive(false);
        setTotalTime(seconds);
        setTimeLeft(seconds);
    };

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>


            <View style={styles.timerContainer}>
                <View style={[styles.circleBg, { borderColor: colors.border }]}>
                    <Animated.View
                        style={[
                            styles.progressCircle,
                            {
                                borderColor: colors.primary,
                                transform: [{
                                    scale: progressAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [1.05, 1],
                                    })
                                }]
                            }
                        ]}
                    />
                    <Text style={[styles.timerText, { color: colors.text }]}>
                        {formatTime(timeLeft)}
                    </Text>
                    <Text style={[styles.label, { color: colors.textMuted }]}>
                        {isActive ? 'Descansando...' : 'Listo'}
                    </Text>
                </View>
            </View>

            <View style={styles.controls}>
                <TouchableOpacity
                    style={[styles.controlBtn, { backgroundColor: colors.surfaceLight }]}
                    onPress={resetTimer}
                >
                    <RotateCcw size={24} color={colors.text} />
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.mainBtn, { backgroundColor: colors.primary }]}
                    onPress={toggleTimer}
                >
                    {isActive ? (
                        <Pause size={32} color="#000" fill="#000" />
                    ) : (
                        <Play size={32} color="#000" fill="#000" />
                    )}
                </TouchableOpacity>

                <View style={styles.controlBtnPlaceholder} />
            </View>

            <View style={styles.presetsContainer}>
                <Text style={[styles.presetTitle, { color: colors.text }]}>Ajustes Rápidos</Text>
                <View style={styles.presetGrid}>
                    {PRESETS.map((seconds) => (
                        <TouchableOpacity
                            key={seconds}
                            style={[
                                styles.presetBtn,
                                {
                                    backgroundColor: totalTime === seconds ? colors.primary : colors.surface,
                                    borderColor: colors.border
                                }
                            ]}
                            onPress={() => selectPreset(seconds)}
                        >
                            <Text style={[
                                styles.presetBtnText,
                                { color: totalTime === seconds ? '#000' : colors.text }
                            ]}>
                                {seconds}s
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: Spacing.xl,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
        gap: 12,
    },
    title: {
        fontSize: Typography.lg,
        fontWeight: '800',
        textAlign: 'center',
    },
    timerContainer: {
        width: 280,
        height: 280,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 50,
    },
    circleBg: {
        width: 260,
        height: 260,
        borderRadius: 130,
        borderWidth: 10,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    progressCircle: {
        position: 'absolute',
        width: 280,
        height: 280,
        borderRadius: 140,
        borderWidth: 4,
        borderStyle: 'dashed',
    },
    timerText: {
        fontSize: 64,
        fontWeight: '900',
        fontVariant: ['tabular-nums'],
    },
    label: {
        fontSize: Typography.sm,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginTop: 8,
    },
    controls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 40,
        marginBottom: 60,
    },
    mainBtn: {
        width: 80,
        height: 80,
        borderRadius: 40,
        justifyContent: 'center',
        alignItems: 'center',
        ...Platform.select({
            ios: {
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
            },
            android: {
                elevation: 4,
            },
            web: {
                boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.3)',
            },
        }),
    },
    controlBtn: {
        width: 54,
        height: 54,
        borderRadius: 27,
        justifyContent: 'center',
        alignItems: 'center',
    },
    controlBtnPlaceholder: {
        width: 54,
    },
    presetsContainer: {
        width: '100%',
    },
    presetTitle: {
        fontSize: Typography.md,
        fontWeight: '700',
        marginBottom: 16,
        textAlign: 'center',
    },
    presetGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
        justifyContent: 'center',
    },
    presetBtn: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        minWidth: 80,
        alignItems: 'center',
    },
    presetBtnText: {
        fontSize: Typography.md,
        fontWeight: '700',
    },
});
