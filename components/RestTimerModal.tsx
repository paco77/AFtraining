import { Colors, Fonts, Spacing, borderRadius } from '@/constants/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { X, Zap } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { Dimensions, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, DropShadow, RadialGradient, Stop } from 'react-native-svg';

const { width } = Dimensions.get('window');
const CIRCLE_SIZE = width * 0.65;
const RADIUS = (CIRCLE_SIZE - 20) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface RestTimerModalProps {
    visible: boolean;
    onClose: () => void;
    initialSeconds?: number;
}

export default function RestTimerModal({ visible, onClose, initialSeconds = 90 }: RestTimerModalProps) {
    const [timeLeft, setTimeLeft] = useState(initialSeconds);
    const [isActive, setIsActive] = useState(true);

    useEffect(() => {
        if (!visible) {
            setTimeLeft(initialSeconds);
            setIsActive(true);
            return;
        }
    }, [visible, initialSeconds]);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft <= 0) {
            setIsActive(false);
        }
        return () => clearInterval(interval);
    }, [isActive, timeLeft]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const addTime = (amount: number) => {
        setTimeLeft((prev) => prev + amount);
    };

    const togglePause = () => setIsActive(!isActive);

    const handleSkip = () => {
        setTimeLeft(0);
        setIsActive(false);
        onClose();
    };

    const progress = Math.max(0, Math.min(1, timeLeft / initialSeconds));
    const strokeDashoffset = CIRCUMFERENCE - progress * CIRCUMFERENCE;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            transparent={true}
            onRequestClose={onClose}
        >
            <View style={styles.overlay}>
                <View style={styles.modalContainer}>
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <X size={24} color={Colors.textMuted} />
                        </TouchableOpacity>
                        <Text style={styles.title}>Temporizador de Descanso</Text>
                        <View style={{ width: 24 }} />
                    </View>

                    {/* Timer Circle */}
                    <View style={styles.timerWrapper}>
                        <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
                            <Defs>
                                {/* Glowing Effect simulation */}
                                <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                                    <Stop offset="80%" stopColor={Colors.primary} stopOpacity="0.4" />
                                    <Stop offset="100%" stopColor={Colors.primary} stopOpacity="0" />
                                </RadialGradient>
                            </Defs>
                            
                            {/* Track Background */}
                            <Circle
                                cx={CIRCLE_SIZE / 2}
                                cy={CIRCLE_SIZE / 2}
                                r={RADIUS}
                                stroke={Colors.surface_container}
                                strokeWidth="8"
                                fill="transparent"
                            />

                            {/* Progress Ring */}
                            <Circle
                                cx={CIRCLE_SIZE / 2}
                                cy={CIRCLE_SIZE / 2}
                                r={RADIUS}
                                stroke={Colors.primary}
                                strokeWidth="12"
                                fill="transparent"
                                strokeDasharray={CIRCUMFERENCE}
                                strokeDashoffset={strokeDashoffset}
                                strokeLinecap="round"
                                transform={`rotate(-90 ${CIRCLE_SIZE / 2} ${CIRCLE_SIZE / 2})`}
                            />
                        </Svg>

                        {/* Centered Content */}
                        <View style={styles.timerContent}>
                            <Text style={styles.timeText}>{formatTime(timeLeft)}</Text>
                            <Text style={styles.statusText}>
                                {isActive ? 'DESCANSANDO' : 'PAUSADO'}
                            </Text>
                        </View>
                    </View>

                    {/* Controls */}
                    <View style={styles.modifiersRow}>
                        <TouchableOpacity style={styles.modBtn} onPress={() => addTime(-30)}>
                            <Text style={styles.modBtnText}>-30s</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.modBtn} onPress={() => addTime(30)}>
                            <Text style={styles.modBtnText}>+30s</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Action Buttons */}
                    <View style={styles.actionsContainer}>
                        <TouchableOpacity activeOpacity={0.8} onPress={togglePause} style={{width: '100%', marginBottom: 12}}>
                            <LinearGradient
                                colors={['#5DA6FF', '#8364CE']}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.primaryBtn}
                            >
                                <Text style={styles.primaryBtnText}>
                                    {isActive ? 'Pausar' : 'Reanudar'}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        <TouchableOpacity style={styles.secondaryBtn} onPress={handleSkip}>
                            <Text style={styles.secondaryBtnText}>Saltar Descanso</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Footer AI Info */}
                    <View style={styles.footerInfo}>
                        <View style={styles.footerLeft}>
                            <Zap size={14} color={Colors.tertiary} />
                            <Text style={styles.footerTextPrimary}>RECUPERACIÓN ÓPTIMA</Text>
                        </View>
                        <Text style={styles.footerTextBrand}>KINETIC AI</Text>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(4, 11, 22, 0.85)', // Very dark matching theme background
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.md,
    },
    modalContainer: {
        width: '100%',
        backgroundColor: '#0a1118', // surface
        borderRadius: 24,
        paddingTop: Spacing.lg,
        paddingBottom: 0,
        borderWidth: 1,
        borderColor: Colors.surface_container,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.lg,
        marginBottom: 30,
    },
    closeBtn: {
        padding: 4,
    },
    title: {
        fontFamily: Fonts.headline,
        fontSize: 16,
        color: Colors.text,
        fontWeight: '800',
    },
    timerWrapper: {
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 30,
    },
    timerContent: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    timeText: {
        fontFamily: Fonts.display,
        fontSize: 64,
        fontWeight: '900',
        color: Colors.text,
        letterSpacing: -2,
    },
    statusText: {
        fontFamily: Fonts.body,
        fontSize: 12,
        fontWeight: '700',
        color: Colors.textMuted,
        letterSpacing: 2,
        marginTop: -4,
    },
    modifiersRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 16,
        marginBottom: 40,
    },
    modBtn: {
        backgroundColor: '#0f1a28', // surface_container
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 12,
        minWidth: 90,
        alignItems: 'center',
    },
    modBtnText: {
        fontFamily: Fonts.headline,
        fontSize: 16,
        fontWeight: '800',
        color: Colors.text,
    },
    actionsContainer: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: 30,
    },
    primaryBtn: {
        width: '100%',
        height: 56,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    primaryBtnText: {
        fontFamily: Fonts.headline,
        fontSize: 18,
        fontWeight: '800',
        color: Colors.text,
    },
    secondaryBtn: {
        width: '100%',
        height: 56,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: Colors.outline,
    },
    secondaryBtnText: {
        fontFamily: Fonts.headline,
        fontSize: 18,
        fontWeight: '800',
        color: Colors.text,
    },
    footerInfo: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#0d1522', // surface_low
        paddingVertical: 16,
        paddingHorizontal: Spacing.lg,
        borderTopWidth: 1,
        borderTopColor: Colors.surface_lowest,
    },
    footerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    footerTextPrimary: {
        fontFamily: Fonts.body,
        fontSize: 10,
        fontWeight: '700',
        color: Colors.textMuted,
        letterSpacing: 1,
    },
    footerTextBrand: {
        fontFamily: Fonts.body,
        fontSize: 10,
        fontWeight: '800',
        color: Colors.textMuted,
        letterSpacing: 1,
    },
});
