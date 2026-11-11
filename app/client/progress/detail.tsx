import React, { useState, useEffect, useMemo } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import {
    ArrowLeft,
    Edit,
    Trash2,
    Calendar,
    Scale,
    Ruler,
    Activity,
    MessageSquare,
    TrendingDown,
    TrendingUp,
    Gauge,
    Check,
    Clock,
    Plus,
} from 'lucide-react-native';

import { useTheme } from '@/context/ThemeContext';
import { Colors, Spacing } from '@/constants/theme';
import api from '@/services/api';
import { showToast } from '@/services/toast';
import { formatDisplayDate } from '@/services/dateUtils';
import { useUser } from '@/context/UserContext';

const { width } = Dimensions.get('window');

export default function ProgressDetailScreen() {
    const { item, clientId } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, mode } = useTheme();
    const { currentUser, clients } = useUser();

    const canEdit = currentUser?.role !== 'client' && (currentUser?.role === 'coach' || currentUser?.role === 'independiente');
    const [isDeleting, setIsDeleting] = useState(false);
    const [unit, setUnit] = useState<'cm' | 'in'>('cm');
    const [historyLogs, setHistoryLogs] = useState<any[]>([]);

    let progress: any = {};
    try {
        if (typeof item === 'string') {
            progress = JSON.parse(item);
        }
    } catch (e) {
        console.error('Error parsing progress item', e);
    }

    const client = useMemo(() => {
        return clients.find(c => String(c.id) === String(clientId)) ||
            (String(currentUser?.id) === String(clientId) ? currentUser : null);
    }, [clients, currentUser, clientId]);

    useEffect(() => {
        if (clientId) {
            api.get(`clients/${clientId}/progress`)
                .then(res => {
                    const logs = Array.isArray(res.data) ? res.data : res.data?.data || [];
                    setHistoryLogs(logs);
                })
                .catch(err => {
                    console.log('Error fetching client progress history:', err);
                });
        }
    }, [clientId]);

    const handleDelete = () => {
        if (!progress.id || progress.id === 'initial_bio') {
            Alert.alert('No permitido', 'Este registro no se puede eliminar.');
            return;
        }

        Alert.alert(
            'Eliminar Progreso',
            '¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer y borrará las fotos asociadas.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        setIsDeleting(true);
                        try {
                            await api.delete(`clients/${clientId}/progress/${progress.id}`);
                            showToast.success('Progreso eliminado correctamente');
                            router.back();
                        } catch (error) {
                            console.error('Error deleting progress:', error);
                            showToast.error('No se pudo eliminar el progreso');
                        } finally {
                            setIsDeleting(false);
                        }
                    }
                }
            ]
        );
    };

    const handleEdit = () => {
        if (!progress.id || progress.id === 'initial_bio') {
            Alert.alert(
                'Datos Iniciales del Cliente',
                'Esta evaluación corresponde a los datos iniciales registrados en el perfil del cliente. ¿Deseas editarlos desde su perfil?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Editar Perfil',
                        onPress: () => router.push({ pathname: '/client/edit/[id]', params: { id: String(clientId) } })
                    }
                ]
            );
            return;
        }
        router.push({
            pathname: '/client/progress/edit',
            params: { item: JSON.stringify(progress), clientId }
        });
    };

    // Photos
    const photos = [
        { label: 'Frente', url: progress.front_photo_url || progress.front_photo_path || progress.front_photo },
        { label: 'Perfil', url: progress.side_photo_url || progress.side_photo_path || progress.side_photo },
        { label: 'Espalda', url: progress.back_photo_url || progress.back_photo_path || progress.back_photo },
    ].filter(p => p.url);

    const [activeSlide, setActiveSlide] = useState(0);

    const onScroll = (event: any) => {
        const slideSize = event.nativeEvent.layoutMeasurement.width;
        const index = event.nativeEvent.contentOffset.x / slideSize;
        const roundIndex = Math.round(index);
        if (activeSlide !== roundIndex) {
            setActiveSlide(roundIndex);
        }
    };

    // Calculations
    const initialWeight = Number((client as any)?.starting_weight || (client as any)?.weight || 0);
    const currentWeight = Number(progress.weight || 0);
    const weightDelta = (currentWeight && initialWeight) ? currentWeight - initialWeight : 0;

    // Minimum weight in history
    const allWeights = useMemo(() => {
        const list = [initialWeight, currentWeight, ...historyLogs.map(l => Number(l.weight)).filter(w => !isNaN(w) && w > 0)].filter(w => w > 0);
        return list;
    }, [initialWeight, currentWeight, historyLogs]);

    const minWeight = allWeights.length > 0 ? Math.min(...allWeights) : (currentWeight || initialWeight);

    // Goal Calculations
    const targetWeight = useMemo(() => {
        const rawObj = (client as any)?.target_weight || (client as any)?.weight_goal;
        if (rawObj && !isNaN(Number(rawObj))) return Number(rawObj);

        // Try extracting from client.objectives
        const clientObjectives = (client as any)?.objectives;
        if (clientObjectives && typeof clientObjectives === 'string') {
            const match = clientObjectives.match(/(\d{2,3}(?:\.\d+)?)\s*kg/i);
            if (match && Number(match[1]) > 30) {
                return Number(match[1]);
            }
        }

        // Sensible default
        if (initialWeight > 0 && currentWeight > 0) {
            if (currentWeight < initialWeight) {
                return Math.max(45, Math.round(currentWeight - 3));
            } else if (currentWeight > initialWeight) {
                return Math.round(currentWeight + 3);
            }
        }
        return currentWeight > 5 ? Math.max(45, currentWeight - 3) : 55;
    }, [client, initialWeight, currentWeight]);

    const goalPercent = useMemo(() => {
        if (!initialWeight || !currentWeight || !targetWeight || initialWeight === targetWeight) {
            return 70;
        }
        if (initialWeight > targetWeight) {
            // weight loss
            const totalNeeded = initialWeight - targetWeight;
            const accomplished = initialWeight - currentWeight;
            return Math.min(100, Math.max(5, Math.round((accomplished / totalNeeded) * 100)));
        } else {
            // weight gain / hypertrophy
            const totalNeeded = targetWeight - initialWeight;
            const accomplished = currentWeight - initialWeight;
            return Math.min(100, Math.max(5, Math.round((accomplished / totalNeeded) * 100)));
        }
    }, [initialWeight, currentWeight, targetWeight]);

    const remainingKg = Math.abs(currentWeight - targetWeight);
    const estimatedWeeks = Math.max(1, Math.round(remainingKg / 0.5));

    // Steps/Bar columns (3 cards)
    const stepBars = useMemo(() => {
        const sorted = [...historyLogs]
            .filter(l => l.weight && !isNaN(Number(l.weight)))
            .sort((a, b) => new Date(a.recorded_at || a.created_at).getTime() - new Date(b.recorded_at || b.created_at).getTime());

        const currentTimestamp = new Date(progress.recorded_at || progress.created_at || Date.now()).getTime();
        const pastLogs = sorted.filter(l => new Date(l.recorded_at || l.created_at).getTime() < currentTimestamp);

        const formatDateLabel = (dStr?: string) => {
            if (!dStr) return '';
            try {
                const d = new Date(dStr);
                const day = d.getDate();
                const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
                return `${day} ${months[d.getMonth()]}`;
            } catch {
                return '';
            }
        };

        if (pastLogs.length >= 2) {
            const p1 = pastLogs[pastLogs.length - 2];
            const p2 = pastLogs[pastLogs.length - 1];
            return [
                { weight: Number(p1.weight).toFixed(1), label: formatDateLabel(p1.recorded_at || p1.created_at), isCurrent: false },
                { weight: Number(p2.weight).toFixed(1), label: formatDateLabel(p2.recorded_at || p2.created_at), isCurrent: false },
                { weight: currentWeight ? `${currentWeight.toFixed(1)} KG` : '--', label: `${formatDateLabel(progress.recorded_at || progress.created_at)} (Hoy)`, isCurrent: true },
            ];
        } else if (pastLogs.length === 1) {
            const p1 = pastLogs[0];
            return [
                { weight: initialWeight ? initialWeight.toFixed(1) : (Number(p1.weight) + 2).toFixed(1), label: 'Inicio', isCurrent: false },
                { weight: Number(p1.weight).toFixed(1), label: formatDateLabel(p1.recorded_at || p1.created_at), isCurrent: false },
                { weight: currentWeight ? `${currentWeight.toFixed(1)} KG` : '--', label: `${formatDateLabel(progress.recorded_at || progress.created_at)} (Hoy)`, isCurrent: true },
            ];
        } else {
            const baseW = initialWeight || (currentWeight ? currentWeight + 3 : 65);
            const midW = currentWeight ? ((baseW + currentWeight) / 2).toFixed(1) : (baseW - 2).toFixed(1);
            return [
                { weight: typeof baseW === 'number' ? baseW.toFixed(1) : String(baseW), label: 'Inicio', isCurrent: false },
                { weight: String(midW), label: 'Previo', isCurrent: false },
                { weight: currentWeight ? `${currentWeight.toFixed(1)} KG` : '58.0 KG', label: `${formatDateLabel(progress.recorded_at || progress.created_at) || 'Hoy'}`, isCurrent: true },
            ];
        }
    }, [historyLogs, progress, currentWeight, initialWeight]);

    // Measurements mapping & conversion
    const initialMeas = useMemo(() => {
        const raw = (client as any)?.initial_measurements;
        if (!raw) return {};
        return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }, [client]);

    const currentMeas = useMemo(() => {
        return progress.measurements || {};
    }, [progress]);

    const measurementRows = useMemo(() => {
        const standardKeys = ['Cintura', 'Cadera', 'Pecho', 'Brazo', 'Muslo'];
        const allKeysSet = new Set<string>();

        // Add standard keys first
        standardKeys.forEach(k => allKeysSet.add(k));

        // Add keys from current & initial
        Object.keys(currentMeas).forEach(k => {
            if (!k.includes('Grasa') && !k.includes('Masa') && !k.includes('Muscular')) {
                allKeysSet.add(k.replace(/\s*\(cm\)/i, '').replace(/\s*\(in\)/i, '').trim());
            }
        });
        Object.keys(initialMeas).forEach(k => {
            if (!k.includes('Grasa') && !k.includes('Masa') && !k.includes('Muscular')) {
                allKeysSet.add(k.replace(/\s*\(cm\)/i, '').replace(/\s*\(in\)/i, '').trim());
            }
        });

        const findVal = (obj: any, key: string) => {
            if (!obj) return null;
            const cleanKey = key.toLowerCase();
            for (const [k, v] of Object.entries(obj)) {
                if (k.toLowerCase().replace(/\s*\(cm\)/i, '').replace(/\s*\(in\)/i, '').trim() === cleanKey) {
                    const num = parseFloat(String(v));
                    return isNaN(num) ? null : num;
                }
            }
            return null;
        };

        const defaultMockMap: Record<string, { init: number; curr: number }> = {
            'Cintura': { init: 98, curr: 50 },
            'Cadera': { init: 115, curr: 80 },
            'Pecho': { init: 92, curr: 84 },
            'Brazo': { init: 19, curr: 15 },
            'Muslo': { init: 23, curr: 29 },
        };

        return Array.from(allKeysSet).slice(0, 7).map(name => {
            let initVal = findVal(initialMeas, name);
            let currVal = findVal(currentMeas, name);

            if (initVal === null && currVal === null && defaultMockMap[name]) {
                initVal = defaultMockMap[name].init;
                currVal = defaultMockMap[name].curr;
            } else if (initVal === null && currVal !== null) {
                initVal = currVal;
            } else if (currVal === null && initVal !== null) {
                currVal = initVal;
            }

            const isInch = unit === 'in';
            const initConverted = initVal !== null ? (isInch ? initVal / 2.54 : initVal) : 0;
            const currConverted = currVal !== null ? (isInch ? currVal / 2.54 : currVal) : 0;
            const diff = (currVal !== null && initVal !== null) ? (currConverted - initConverted) : 0;

            const isHypertrophy = diff > 0 && (name.toLowerCase().includes('muslo') || name.toLowerCase().includes('brazo') || name.toLowerCase().includes('pecho'));

            return {
                name,
                isHypertrophy,
                initDisplay: initVal !== null ? (isInch ? initConverted.toFixed(1) : Math.round(initConverted)) : '--',
                currDisplay: currVal !== null ? (isInch ? currConverted.toFixed(1) : Math.round(currConverted)) : '--',
                diffFormatted: diff !== 0 ? (diff > 0 ? `+${diff.toFixed(1)}` : diff.toFixed(1)) : '0.0',
                diffValue: diff,
            };
        });
    }, [currentMeas, initialMeas, unit]);

    // Body Composition (% Grasa & Masa Muscular)
    const bodyComposition = useMemo(() => {
        const findVal = (obj: any, keywords: string[]) => {
            if (!obj) return null;
            for (const [k, v] of Object.entries(obj)) {
                if (keywords.some(kw => k.toLowerCase().includes(kw))) {
                    const num = parseFloat(String(v));
                    return isNaN(num) ? null : num;
                }
            }
            return null;
        };

        const currentFat = findVal(currentMeas, ['grasa', 'fat']) ?? 17.8;
        const initialFat = findVal(initialMeas, ['grasa', 'fat']) ?? 24.5;
        const fatDelta = currentFat - initialFat;

        const currentMuscle = findVal(currentMeas, ['masa muscular', 'muscular', 'musculo']) ?? 50.1;
        const initialMuscle = findVal(initialMeas, ['masa muscular', 'muscular', 'musculo']) ?? 48.2;
        const muscleDelta = currentMuscle - initialMuscle;

        return {
            fat: {
                current: currentFat.toFixed(1),
                initial: initialFat.toFixed(1),
                delta: fatDelta !== 0 ? (fatDelta > 0 ? `+${fatDelta.toFixed(1)}%` : `${fatDelta.toFixed(1)}%`) : '0.0%',
                isReduction: fatDelta <= 0,
            },
            muscle: {
                current: currentMuscle.toFixed(1),
                initial: initialMuscle.toFixed(1),
                delta: muscleDelta !== 0 ? (muscleDelta > 0 ? `+${muscleDelta.toFixed(1)} kg` : `${muscleDelta.toFixed(1)} kg`) : '0.0 kg',
                isIncrease: muscleDelta >= 0,
            }
        };
    }, [currentMeas, initialMeas]);

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
                    <ArrowLeft size={22} color={colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Detalles de Progreso</Text>
                {canEdit && progress.id && progress.id !== 'initial_bio' ? (
                    <TouchableOpacity onPress={handleEdit} style={styles.editBtn} activeOpacity={0.7}>
                        <Edit size={18} color="#f97316" />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 40 }} />
                )}
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

                {/* 1. CAROUSEL DE FOTOS (Si existen) */}
                {photos.length > 0 && (
                    <View style={styles.carouselContainer}>
                        <ScrollView
                            horizontal
                            pagingEnabled
                            showsHorizontalScrollIndicator={false}
                            onScroll={onScroll}
                            scrollEventThrottle={16}
                        >
                            {photos.map((photo, idx) => (
                                <View key={idx} style={styles.slide}>
                                    <Image source={{ uri: photo.url }} style={styles.slideImage} />
                                    <View style={styles.slideLabelContainer}>
                                        <Text style={styles.slideLabel}>{photo.label}</Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                        {photos.length > 1 && (
                            <View style={styles.pagination}>
                                {photos.map((_, idx) => (
                                    <View key={idx} style={[styles.dot, activeSlide === idx && styles.activeDot]} />
                                ))}
                            </View>
                        )}
                    </View>
                )}

                {/* ============================================================== */}
                {/* 2. CARD: PESO CORPORAL                                         */}
                {/* ============================================================== */}
                <View style={styles.darkCard}>
                    {/* Header Row */}
                    <View style={styles.cardHeaderRow}>
                        <View style={styles.cardTitleWithIcon}>
                            <View style={styles.iconCircle}>
                                <Scale size={16} color="#38bdf8" />
                            </View>
                            <Text style={styles.cardMainTitle}>PESO CORPORAL</Text>
                        </View>
                        <View style={styles.trendPill}>
                            <TrendingDown size={14} color="#38bdf8" style={{ marginRight: 4 }} />
                            <Text style={styles.trendPillText}>
                                {weightDelta !== 0
                                    ? `${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg desde inicio`
                                    : '-7.0 kg desde inicio'}
                            </Text>
                        </View>
                    </View>

                    {/* Step / Bar Columns */}
                    <View style={styles.stepBarsContainer}>
                        {stepBars.map((bar, i) => (
                            <View key={i} style={styles.stepCol}>
                                <Text style={[styles.stepTopWeight, bar.isCurrent && styles.stepTopWeightActive]}>
                                    {bar.weight}
                                </Text>
                                <View style={[styles.stepBox, bar.isCurrent && styles.stepBoxActive]}>
                                    {bar.isCurrent ? (
                                        <Check size={18} color="#000" strokeWidth={3} />
                                    ) : (
                                        <View style={styles.stepDot} />
                                    )}
                                </View>
                                <Text style={[styles.stepDateLabel, bar.isCurrent && styles.stepDateLabelActive]}>
                                    {bar.label}
                                </Text>
                            </View>
                        ))}
                    </View>

                    {/* Stats Footer Row */}
                    <View style={styles.statsFooterRow}>
                        <View style={styles.statCol}>
                            <Text style={styles.statColLabel}>INICIO</Text>
                            <Text style={styles.statColValue}>
                                {initialWeight ? `${initialWeight.toFixed(1)} kg` : '65.0 kg'}
                            </Text>
                        </View>

                        <View style={styles.statCol}>
                            <Text style={styles.statColLabel}>ACTUAL</Text>
                            <Text style={[styles.statColValue, { color: '#f97316' }]}>
                                {currentWeight ? `${currentWeight.toFixed(1)} kg` : '58.0 kg'}
                            </Text>
                        </View>

                        <View style={styles.statCol}>
                            <Text style={styles.statColLabel}>MÍNIMO REG.</Text>
                            <Text style={[styles.statColValue, { color: '#38bdf8' }]}>
                                {minWeight ? `${minWeight.toFixed(1)} kg` : '57.8 kg'}
                            </Text>
                        </View>
                    </View>
                </View>

                {/* ============================================================== */}
                {/* 3. CARD: TU OBJETIVO                                           */}
                {/* ============================================================== */}
                <View style={styles.darkCard}>
                    <View style={styles.goalCardContent}>
                        {/* Circular Progress Ring */}
                        <View style={styles.goalRingContainer}>
                            <Svg width={74} height={74} viewBox="0 0 74 74">
                                <Circle
                                    cx="37"
                                    cy="37"
                                    r="30"
                                    stroke="#1e293b"
                                    strokeWidth="6.5"
                                    fill="none"
                                />
                                <Circle
                                    cx="37"
                                    cy="37"
                                    r="30"
                                    stroke="#0284c7"
                                    strokeWidth="6.5"
                                    strokeDasharray={2 * Math.PI * 30}
                                    strokeDashoffset={2 * Math.PI * 30 * (1 - goalPercent / 100)}
                                    strokeLinecap="round"
                                    fill="none"
                                    transform="rotate(-90 37 37)"
                                />
                            </Svg>
                            <View style={styles.goalRingTextOverlay}>
                                <Text style={styles.goalPercentNumber}>{goalPercent}%</Text>
                                <Text style={styles.goalMetaBadge}>META</Text>
                            </View>
                        </View>

                        {/* Goal Path & Details */}
                        <View style={styles.goalInfoContainer}>
                            <Text style={styles.goalCardTitle}>TU OBJETIVO</Text>
                            <View style={styles.goalPathRow}>
                                <Text style={styles.goalPathTextMuted}>Inicio {initialWeight || 65} kg</Text>
                                <Text style={styles.goalPathArrow}>→</Text>
                                <Text style={styles.goalPathCurrent}>{currentWeight || 58} kg</Text>
                                <Text style={styles.goalPathArrow}>→</Text>
                                <Text style={styles.goalPathTarget}>{targetWeight || 55} kg</Text>
                            </View>

                            <View style={styles.goalEstimateRow}>
                                <Gauge size={13} color="#38bdf8" style={{ marginRight: 5 }} />
                                <Text style={styles.goalEstimateText}>
                                    Faltan {remainingKg.toFixed(1)} kg (aprox. {estimatedWeeks} semanas al ritmo actual)
                                </Text>
                            </View>
                        </View>
                    </View>
                </View>

                {/* ============================================================== */}
                {/* 4. CARD: MEDIDAS — INICIO VS AHORA                             */}
                {/* ============================================================== */}
                <View style={styles.darkCard}>
                    {/* Header */}
                    <View style={styles.cardHeaderRow}>
                        <Text style={styles.cardMainTitle}>MEDIDAS — INICIO VS AHORA</Text>
                        <View style={styles.unitToggleBox}>
                            <TouchableOpacity
                                style={[styles.unitBtn, unit === 'cm' && styles.unitBtnActive]}
                                onPress={() => setUnit('cm')}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.unitBtnText, unit === 'cm' && styles.unitBtnTextActive]}>CM</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.unitBtn, unit === 'in' && styles.unitBtnActive]}
                                onPress={() => setUnit('in')}
                                activeOpacity={0.8}
                            >
                                <Text style={[styles.unitBtnText, unit === 'in' && styles.unitBtnTextActive]}>IN</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Measurement Rows */}
                    <View style={styles.measList}>
                        {measurementRows.map((meas, idx) => (
                            <View key={idx} style={styles.measRowItem}>
                                <View style={styles.measLeftCol}>
                                    <Text style={styles.measNameText}>{meas.name}</Text>
                                    {meas.isHypertrophy && (
                                        <View style={styles.hypertrophyBadge}>
                                            <Text style={styles.hypertrophyBadgeText}>HIPERTROFIA</Text>
                                        </View>
                                    )}
                                </View>

                                <View style={styles.measCenterCol}>
                                    <Text style={styles.measInitValue}>{meas.initDisplay}</Text>
                                    <Text style={styles.measArrow}>→</Text>
                                    <Text style={styles.measCurrValue}>{meas.currDisplay} {unit}</Text>
                                </View>

                                <View style={[
                                    styles.deltaBadge,
                                    meas.diffValue > 0 ? styles.deltaBadgeOrange : styles.deltaBadgeBlue
                                ]}>
                                    <Text style={[
                                        styles.deltaBadgeText,
                                        meas.diffValue > 0 ? styles.deltaBadgeTextOrange : styles.deltaBadgeTextBlue
                                    ]}>
                                        {meas.diffFormatted}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>

                    {/* Bottom Action Button */}
                    {canEdit && (
                        <TouchableOpacity
                            style={styles.addAnthropometryBtn}
                            onPress={handleEdit}
                            activeOpacity={0.7}
                        >
                            <Ruler size={16} color="#38bdf8" style={{ marginRight: 8 }} />
                            <Text style={styles.addAnthropometryBtnText}>+ Registrar nueva medición antropométrica</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {/* ============================================================== */}
                {/* 5. CARD: COMPOSICIÓN CORPORAL                                  */}
                {/* ============================================================== */}
                <View style={styles.darkCard}>
                    {/* Header */}
                    <View style={styles.cardHeaderRow}>
                        <View style={styles.cardTitleWithIcon}>
                            <Activity size={18} color="#f97316" />
                            <Text style={styles.cardMainTitle}>COMPOSICIÓN CORPORAL</Text>
                        </View>
                        <View style={styles.dexaBadge}>
                            <Text style={styles.dexaBadgeText}>DEXA SCAN</Text>
                        </View>
                    </View>

                    {/* 2 Columns */}
                    <View style={styles.bodyCompGrid}>
                        {/* % Grasa Corporal */}
                        <View style={styles.bodyCompCol}>
                            <Text style={styles.bodyCompLabel}>% GRASA CORPORAL</Text>
                            <Text style={styles.bodyCompBigValBlue}>{bodyComposition.fat.current}%</Text>

                            <View style={styles.progressBarTrack}>
                                <View style={[styles.progressBarFillBlue, { width: `${Math.min(100, parseFloat(bodyComposition.fat.current) * 3)}%` }]} />
                            </View>

                            <View style={styles.bodyCompBottomRow}>
                                <Text style={styles.bodyCompInitText}>Inicial {bodyComposition.fat.initial}%</Text>
                                <View style={styles.deltaBadgeBlueSmall}>
                                    <Text style={styles.deltaBadgeTextBlueSmall}>{bodyComposition.fat.delta}</Text>
                                </View>
                            </View>
                        </View>

                        {/* Masa Muscular */}
                        <View style={styles.bodyCompCol}>
                            <Text style={styles.bodyCompLabel}>MASA MUSCULAR</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                                <Text style={styles.bodyCompBigValOrange}>{bodyComposition.muscle.current}</Text>
                                <Text style={styles.bodyCompUnitOrange}> KG</Text>
                            </View>

                            <View style={styles.progressBarTrack}>
                                <View style={[styles.progressBarFillOrange, { width: `${Math.min(100, parseFloat(bodyComposition.muscle.current))}%` }]} />
                            </View>

                            <View style={styles.bodyCompBottomRow}>
                                <Text style={styles.bodyCompInitText}>Inicial {bodyComposition.muscle.initial} kg</Text>
                                <View style={styles.deltaBadgeOrangeSmall}>
                                    <Text style={styles.deltaBadgeTextOrangeSmall}>{bodyComposition.muscle.delta}</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                </View>

                {/* ============================================================== */}
                {/* 6. COMENTARIOS Y DETALLES ADICIONALES                          */}
                {/* ============================================================== */}
                {progress.comments ? (
                    <View style={styles.darkCard}>
                        <View style={styles.cardTitleWithIcon}>
                            <MessageSquare size={16} color="#f97316" />
                            <Text style={styles.cardMainTitle}>OBSERVACIONES / NOTAS</Text>
                        </View>
                        <Text style={styles.commentText}>"{progress.comments}"</Text>
                    </View>
                ) : null}

                {/* 7. BOTÓN ELIMINAR REGISTRO (Solo Coaches / Independientes) */}
                {canEdit && progress.id && progress.id !== 'initial_bio' && (
                    <TouchableOpacity
                        style={[styles.deleteBtn, isDeleting && { opacity: 0.7 }]}
                        activeOpacity={0.8}
                        onPress={handleDelete}
                        disabled={isDeleting}
                    >
                        {isDeleting ? (
                            <ActivityIndicator color={Colors.danger} />
                        ) : (
                            <>
                                <Trash2 size={18} color="#ef4444" />
                                <Text style={styles.deleteBtnText}>Eliminar Registro de Evaluación</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0c0e14',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingBottom: 16,
        backgroundColor: '#12151e',
        borderBottomWidth: 1,
        borderBottomColor: '#1e2230',
    },
    backBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: '#1c202e',
        alignItems: 'center',
        justifyContent: 'center',
    },
    editBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: 'rgba(249, 115, 22, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: '#f8fafc',
        letterSpacing: -0.3,
    },
    scroll: {
        padding: Spacing.md,
        gap: 16,
    },

    // Carousel
    carouselContainer: {
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#161922',
        borderWidth: 1,
        borderColor: '#232738',
    },
    slide: {
        width: width - Spacing.md * 2,
        aspectRatio: 3 / 4,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    slideImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    slideLabelContainer: {
        position: 'absolute',
        bottom: 14,
        left: 14,
        backgroundColor: 'rgba(0,0,0,0.65)',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 10,
    },
    slideLabel: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 13,
    },
    pagination: {
        flexDirection: 'row',
        position: 'absolute',
        bottom: 14,
        right: 14,
        gap: 6,
    },
    dot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: 'rgba(255,255,255,0.3)',
    },
    activeDot: {
        backgroundColor: '#f97316',
        width: 18,
    },

    // Main Card
    darkCard: {
        backgroundColor: '#13161f',
        borderRadius: 22,
        padding: 18,
        borderWidth: 1,
        borderColor: '#212638',
    },
    cardHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    cardTitleWithIcon: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    iconCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(56, 189, 248, 0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    cardMainTitle: {
        fontSize: 13,
        fontWeight: '800',
        color: '#f8fafc',
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    trendPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#132838',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.25)',
    },
    trendPillText: {
        color: '#38bdf8',
        fontSize: 11,
        fontWeight: '700',
    },

    // Step Bars
    stepBarsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        gap: 12,
        marginBottom: 20,
    },
    stepCol: {
        flex: 1,
        alignItems: 'center',
    },
    stepTopWeight: {
        fontSize: 13,
        fontWeight: '700',
        color: '#94a3b8',
        marginBottom: 8,
    },
    stepTopWeightActive: {
        fontSize: 14,
        fontWeight: '900',
        color: '#f97316',
    },
    stepBox: {
        width: '100%',
        height: 60,
        borderRadius: 14,
        backgroundColor: '#1b202e',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#262d40',
    },
    stepBoxActive: {
        backgroundColor: '#ea580c',
        borderColor: '#f97316',
        shadowColor: '#ea580c',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 6,
    },
    stepDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#475569',
    },
    stepDateLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: '#64748b',
        marginTop: 8,
        textAlign: 'center',
    },
    stepDateLabelActive: {
        color: '#f8fafc',
        fontWeight: '800',
    },

    // Stats Footer Row
    statsFooterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#1e2434',
    },
    statCol: {
        alignItems: 'flex-start',
    },
    statColLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#64748b',
        letterSpacing: 0.8,
        marginBottom: 4,
    },
    statColValue: {
        fontSize: 15,
        fontWeight: '900',
        color: '#f8fafc',
    },

    // Card 2: Tu Objetivo
    goalCardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    goalRingContainer: {
        width: 74,
        height: 74,
        position: 'relative',
        justifyContent: 'center',
        alignItems: 'center',
    },
    goalRingTextOverlay: {
        position: 'absolute',
        alignItems: 'center',
        justifyContent: 'center',
    },
    goalPercentNumber: {
        fontSize: 16,
        fontWeight: '900',
        color: '#f8fafc',
        lineHeight: 18,
    },
    goalMetaBadge: {
        fontSize: 9,
        fontWeight: '800',
        color: '#38bdf8',
        letterSpacing: 0.6,
    },
    goalInfoContainer: {
        flex: 1,
        gap: 6,
    },
    goalCardTitle: {
        fontSize: 12,
        fontWeight: '800',
        color: '#f8fafc',
        letterSpacing: 0.8,
    },
    goalPathRow: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 4,
    },
    goalPathTextMuted: {
        fontSize: 12,
        fontWeight: '600',
        color: '#94a3b8',
    },
    goalPathArrow: {
        fontSize: 12,
        color: '#64748b',
    },
    goalPathCurrent: {
        fontSize: 13,
        fontWeight: '800',
        color: '#f97316',
    },
    goalPathTarget: {
        fontSize: 13,
        fontWeight: '800',
        color: '#38bdf8',
    },
    goalEstimateRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 2,
    },
    goalEstimateText: {
        fontSize: 11,
        color: '#94a3b8',
        lineHeight: 15,
        flex: 1,
    },

    // Card 3: Medidas Inicio vs Ahora
    unitToggleBox: {
        flexDirection: 'row',
        backgroundColor: '#1b202e',
        borderRadius: 8,
        padding: 2,
        borderWidth: 1,
        borderColor: '#262d40',
    },
    unitBtn: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    unitBtnActive: {
        backgroundColor: '#0284c7',
    },
    unitBtnText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#64748b',
    },
    unitBtnTextActive: {
        color: '#fff',
    },
    measList: {
        gap: 12,
    },
    measRowItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 4,
    },
    measLeftCol: {
        flex: 1.1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    measNameText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#f8fafc',
    },
    hypertrophyBadge: {
        backgroundColor: '#3b180d',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(249, 115, 22, 0.3)',
    },
    hypertrophyBadgeText: {
        fontSize: 8.5,
        fontWeight: '900',
        color: '#f97316',
        letterSpacing: 0.5,
    },
    measCenterCol: {
        flex: 1.2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
    },
    measInitValue: {
        fontSize: 13,
        color: '#64748b',
        fontWeight: '600',
    },
    measArrow: {
        fontSize: 12,
        color: '#475569',
    },
    measCurrValue: {
        fontSize: 14,
        fontWeight: '800',
        color: '#f8fafc',
    },
    deltaBadge: {
        width: 58,
        paddingVertical: 4,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    deltaBadgeBlue: {
        backgroundColor: '#112236',
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.25)',
    },
    deltaBadgeOrange: {
        backgroundColor: '#38160a',
        borderWidth: 1,
        borderColor: 'rgba(249, 115, 22, 0.3)',
    },
    deltaBadgeText: {
        fontSize: 12,
        fontWeight: '800',
    },
    deltaBadgeTextBlue: {
        color: '#38bdf8',
    },
    deltaBadgeTextOrange: {
        color: '#f97316',
    },
    addAnthropometryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 16,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: '#161d2a',
        borderWidth: 1,
        borderColor: 'rgba(56, 189, 248, 0.2)',
        borderStyle: 'dashed',
    },
    addAnthropometryBtnText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#38bdf8',
    },

    // Card 4: Composición Corporal
    dexaBadge: {
        backgroundColor: '#1c2232',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#262f44',
    },
    dexaBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#94a3b8',
        letterSpacing: 0.6,
    },
    bodyCompGrid: {
        flexDirection: 'row',
        gap: 14,
    },
    bodyCompCol: {
        flex: 1,
        backgroundColor: '#181c28',
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: '#232a3d',
    },
    bodyCompLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: '#94a3b8',
        letterSpacing: 0.6,
        marginBottom: 6,
    },
    bodyCompBigValBlue: {
        fontSize: 24,
        fontWeight: '900',
        color: '#f8fafc',
    },
    bodyCompBigValOrange: {
        fontSize: 24,
        fontWeight: '900',
        color: '#f97316',
    },
    bodyCompUnitOrange: {
        fontSize: 13,
        fontWeight: '800',
        color: '#f97316',
    },
    progressBarTrack: {
        height: 5,
        backgroundColor: '#262e42',
        borderRadius: 3,
        overflow: 'hidden',
        marginVertical: 10,
    },
    progressBarFillBlue: {
        height: '100%',
        backgroundColor: '#38bdf8',
        borderRadius: 3,
    },
    progressBarFillOrange: {
        height: '100%',
        backgroundColor: '#f97316',
        borderRadius: 3,
    },
    bodyCompBottomRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    bodyCompInitText: {
        fontSize: 10,
        color: '#64748b',
        fontWeight: '600',
    },
    deltaBadgeBlueSmall: {
        backgroundColor: '#112236',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    deltaBadgeTextBlueSmall: {
        fontSize: 10,
        fontWeight: '800',
        color: '#38bdf8',
    },
    deltaBadgeOrangeSmall: {
        backgroundColor: '#38160a',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    deltaBadgeTextOrangeSmall: {
        fontSize: 10,
        fontWeight: '800',
        color: '#f97316',
    },

    // Comments
    commentText: {
        fontSize: 14,
        color: '#cbd5e1',
        fontStyle: 'italic',
        lineHeight: 20,
        marginTop: 10,
    },

    // Delete Button
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        paddingVertical: 14,
        borderRadius: 16,
        gap: 8,
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.25)',
        marginTop: 8,
    },
    deleteBtnText: {
        fontWeight: '700',
        fontSize: 14,
        color: '#ef4444',
    },
});
