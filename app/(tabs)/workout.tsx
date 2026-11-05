import { ExternalVideoCard, openVideoLink } from '@/components/ExternalVideoCard';
import { SafeVideo } from '@/components/SafeVideo';
import { ExerciseLog, MONTHS, PlannedExercise, SetLog } from '@/constants/PlanTypes';
import { borderRadius, Colors, Fonts, Spacing } from '@/constants/theme';
import { usePlans } from '@/context/PlanContext';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { API_HOST } from '@/services/api';
import { formatToLocalISO } from '@/services/dateUtils';
import { showToast } from '@/services/toast';
import { isExternalVideoLink, getVideoThumbnail } from '@/services/videoLinks';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import {
    Activity,
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronUp,
    Clock,
    CloudAlert,
    Dumbbell,
    ExternalLink,
    FileText,
    Flag,
    Info,
    Maximize2,
    MoreVertical,
    Play,
    Plus,
    RotateCcw,
    Scale,
    Timer,
    X,
    Youtube,
    Zap
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    AppState,
    Dimensions,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Header Session Duration Timer ──────────────────────────────────────────
const GlobalWorkoutTimer = ({ sessionStartTime, durationRef }: { sessionStartTime: number | null, durationRef?: React.MutableRefObject<number> }) => {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!sessionStartTime) return;
        const tick = () => {
            const now = Date.now();
            const diff = Math.max(0, Math.floor((now - sessionStartTime) / 1000));
            setElapsed(diff);
            if (durationRef) durationRef.current = diff;
        };
        tick();
        const int = setInterval(tick, 1000);
        return () => clearInterval(int);
    }, [sessionStartTime, durationRef]);

    const { colors, mode } = useTheme();
    const workoutStyles = useMemo(() => getWorkoutStyles(colors, mode), [colors, mode]);

    if (!sessionStartTime) return null;

    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    const h = Math.floor(elapsed / 3600);

    return (
        <View style={workoutStyles.headerTimerBadge}>
            <Timer size={14} color={mode === 'dark' ? '#38BDF8' : colors.primary} style={{ marginRight: 5 }} />
            <Text style={workoutStyles.headerTimerText}>
                {h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`}
            </Text>
        </View>
    );
};

export default function WorkoutScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, mode } = useTheme();
    const workoutStyles = useMemo(() => getWorkoutStyles(colors, mode), [colors, mode]);

    const {
        plans,
        activeSessionDay,
        activePlanId,
        sessionLogs,
        setSessionLogs,
        completedSets,
        setCompletedSets,
        comment,
        setComment,
        startWorkoutSession,
        finishWorkoutSession,
        discardWorkoutSession,
        saveLog,
        pendingOfflineLogs,
        syncOfflineLogs,
        sessionStartTime,
        fetchPlans,
        allExercises,
        isLoadingPlans
    } = usePlans();

    const { currentUser } = useUser();
    const [selectedDayIdx, setSelectedDayIdx] = useState(0);
    const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
    const [activeGroupSubIndex, setActiveGroupSubIndex] = useState<Record<string, number>>({});
    const [refreshing, setRefreshing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Modals
    const [noteModalVisible, setNoteModalVisible] = useState(false);
    const [infoModalExercise, setInfoModalExercise] = useState<PlannedExercise | null>(null);
    const [optionsPush, setOptionsPush] = useState<{
        title: string;
        message: string;
        isDestructive?: boolean;
        options: Array<{
            text: string;
            style?: 'default' | 'destructive' | 'cancel' | 'primary';
            onPress: () => void;
        }>;
    } | null>(null);

    const sessionDurationRef = useRef(0);
    const mainScrollRef = useRef<any>(null);
    const seqScrollRef = useRef<any>(null);

    // In-page Rest Timer State with wall-clock background persistence
    const [restTimerSeconds, setRestTimerSeconds] = useState(90);
    const [restTimerTotal, setRestTimerTotal] = useState(90);
    const [isRestTimerRunning, setIsRestTimerRunning] = useState(false);
    const restTimerEndTimeRef = useRef<number | null>(null);

    const updateTimerStorage = useCallback((endTime: number | null, total: number) => {
        if (endTime && endTime > Date.now()) {
            AsyncStorage.setItem('@af_rest_timer_data', JSON.stringify({ endTime, total })).catch(() => {});
        } else {
            AsyncStorage.removeItem('@af_rest_timer_data').catch(() => {});
        }
    }, []);

    // Restore active timer on mount if one was running
    useEffect(() => {
        AsyncStorage.getItem('@af_rest_timer_data').then(raw => {
            if (!raw) return;
            try {
                const data = JSON.parse(raw);
                if (data.endTime) {
                    const remaining = Math.max(0, Math.ceil((data.endTime - Date.now()) / 1000));
                    if (remaining > 0) {
                        restTimerEndTimeRef.current = data.endTime;
                        setRestTimerTotal(data.total || 90);
                        setRestTimerSeconds(remaining);
                        setIsRestTimerRunning(true);
                    } else {
                        AsyncStorage.removeItem('@af_rest_timer_data').catch(() => {});
                    }
                }
            } catch (e) {}
        });
    }, []);

    // Rest Timer Countdown Effect (based on wall-clock timestamp)
    useEffect(() => {
        if (!isRestTimerRunning) return;

        const tick = () => {
            if (!restTimerEndTimeRef.current) return;
            const remaining = Math.max(0, Math.ceil((restTimerEndTimeRef.current - Date.now()) / 1000));
            setRestTimerSeconds(remaining);
            if (remaining <= 0) {
                setIsRestTimerRunning(false);
                restTimerEndTimeRef.current = null;
                updateTimerStorage(null, restTimerTotal);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            }
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [isRestTimerRunning, restTimerTotal, updateTimerStorage]);

    // Resync when app returns from background / screen unlocked
    useEffect(() => {
        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active' && restTimerEndTimeRef.current) {
                const remaining = Math.max(0, Math.ceil((restTimerEndTimeRef.current - Date.now()) / 1000));
                setRestTimerSeconds(remaining);
                if (remaining <= 0) {
                    setIsRestTimerRunning(false);
                    restTimerEndTimeRef.current = null;
                    updateTimerStorage(null, restTimerTotal);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                } else {
                    setIsRestTimerRunning(true);
                }
            }
        });
        return () => subscription.remove();
    }, [restTimerTotal, updateTimerStorage]);

    const startRestTimer = (seconds?: number) => {
        const s = seconds || restTimerTotal || 90;
        const endTime = Date.now() + s * 1000;
        restTimerEndTimeRef.current = endTime;
        setRestTimerTotal(s);
        setRestTimerSeconds(s);
        setIsRestTimerRunning(true);
        updateTimerStorage(endTime, s);
    };

    const handleAdjustRestTimer = (deltaSeconds: number) => {
        if (isRestTimerRunning && restTimerEndTimeRef.current) {
            const nextEndTime = Math.max(Date.now(), restTimerEndTimeRef.current + deltaSeconds * 1000);
            restTimerEndTimeRef.current = nextEndTime;
            const remaining = Math.max(0, Math.ceil((nextEndTime - Date.now()) / 1000));
            setRestTimerSeconds(remaining);
            updateTimerStorage(nextEndTime, restTimerTotal);
        } else {
            setRestTimerSeconds(s => Math.max(0, s + deltaSeconds));
        }
    };

    const handleResetRestTimer = () => {
        const s = restTimerTotal || 90;
        if (isRestTimerRunning) {
            const nextEndTime = Date.now() + s * 1000;
            restTimerEndTimeRef.current = nextEndTime;
            setRestTimerSeconds(s);
            updateTimerStorage(nextEndTime, s);
        } else {
            setRestTimerSeconds(s);
        }
    };

    const handleToggleRestTimer = () => {
        if (isRestTimerRunning) {
            // Pause
            setIsRestTimerRunning(false);
            restTimerEndTimeRef.current = null;
            updateTimerStorage(null, restTimerTotal);
        } else {
            // Resume or start
            const currentSecs = restTimerSeconds > 0 ? restTimerSeconds : (restTimerTotal || 90);
            const nextEndTime = Date.now() + currentSecs * 1000;
            restTimerEndTimeRef.current = nextEndTime;
            setRestTimerSeconds(currentSecs);
            setIsRestTimerRunning(true);
            updateTimerStorage(nextEndTime, restTimerTotal);
        }
    };

    // User Plans
    const userPlans = useMemo(() => {
        if (!currentUser) return [];
        const filtered = plans.filter(p => String(p.assignedClientId) === String(currentUser.id));
        return filtered.sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return MONTHS.indexOf(b.month as any) - MONTHS.indexOf(a.month as any);
        });
    }, [plans, currentUser?.id]);

    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

    const activePlan = useMemo(() => {
        if (userPlans.length === 0) return null;
        return userPlans.find(p => p.id === selectedPlanId) || userPlans[0];
    }, [userPlans, selectedPlanId]);

    // Restore selected plan and day if there is an active session
    useEffect(() => {
        if (activePlanId) {
            setSelectedPlanId(activePlanId);
        }
    }, [activePlanId]);

    useEffect(() => {
        if (activePlan && activeSessionDay !== null) {
            const sessionDayIdx = activePlan.days.findIndex(d => d.dayNumber === activeSessionDay);
            if (sessionDayIdx !== -1) {
                setSelectedDayIdx(sessionDayIdx);
            }
        }
    }, [activePlan, activeSessionDay]);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        try {
            if (fetchPlans) await fetchPlans();
        } finally {
            setRefreshing(false);
        }
    }, [fetchPlans]);

    const currentDay = activePlan?.days[selectedDayIdx];
    const isSessionActive = activeSessionDay !== null;

    // List of exercises in current day
    const dayExercises: PlannedExercise[] = useMemo(() => {
        return currentDay?.exercises || [];
    }, [currentDay]);

    // Group exercises into single exercises or supersets (Biseries / Triseries)
    const groupedExercises = useMemo(() => {
        if (!currentDay || !currentDay.exercises) return [];
        const result: { isGroup: boolean; id: string; items: PlannedExercise[] }[] = [];
        const seenSupersets = new Set<string>();

        currentDay.exercises.forEach((ex, idx) => {
            if (ex.supersetId) {
                if (!seenSupersets.has(ex.supersetId)) {
                    seenSupersets.add(ex.supersetId);
                    const groupItems = currentDay.exercises.filter(e => e.supersetId === ex.supersetId);
                    result.push({ id: ex.supersetId, isGroup: true, items: groupItems });
                }
            } else {
                result.push({ isGroup: false, id: String(ex.id || ex.exercise?.id || idx), items: [ex] });
            }
        });
        return result;
    }, [currentDay]);

    // Current Active Group and Sub-Exercise
    const currentGroup = groupedExercises[activeExerciseIndex] || groupedExercises[0];
    const currentSubIdx = (currentGroup && activeGroupSubIndex[currentGroup.id]) || 0;
    const activeExercise: PlannedExercise | undefined = (currentGroup?.items && currentGroup.items[currentSubIdx]) || currentGroup?.items?.[0] || dayExercises[0];
    const activeExerciseId = String(activeExercise?.id || activeExercise?.exercise?.id || '');

    // Reset group index when selected day changes
    useEffect(() => {
        setActiveExerciseIndex(0);
        setActiveGroupSubIndex({});
    }, [selectedDayIdx]);

    // Helper to get media for any exercise (direct video, GIF, image or YouTube thumbnail)
    const getExerciseMedia = useCallback((pe: PlannedExercise | undefined) => {
        if (!pe) return { rawUrl: null, videoUrl: null, isExternal: false, isMp4: false, thumbnail: null };
        const fullExerciseDef = allExercises.find(e =>
            String(e.id) === String(pe.exercise?.id) ||
            (e.name && pe.exercise?.name && e.name.toLowerCase() === pe.exercise.name.toLowerCase())
        );
        const rawUrl = pe.videoUrl || pe.exercise?.videoUrl || fullExerciseDef?.videoUrl;
        if (!rawUrl) return { rawUrl: null, videoUrl: null, isExternal: false, isMp4: false, thumbnail: null };

        const isExternal = isExternalVideoLink(rawUrl);
        const isMp4 = !isExternal && (rawUrl.toLowerCase().includes('.mp4') || rawUrl.toLowerCase().includes('.mov'));
        const resolvedUri = isExternal
            ? rawUrl
            : rawUrl.startsWith('http')
                ? rawUrl
                : `${API_HOST}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
        const thumbnail = isExternal ? getVideoThumbnail(rawUrl) : resolvedUri;

        return {
            rawUrl,
            videoUrl: resolvedUri,
            isExternal,
            isMp4,
            thumbnail
        };
    }, [allExercises]);

    // Helper to group any list of exercises into singles and supersets (Biseries/Triseries)
    const groupExercisesList = useCallback((exercises: PlannedExercise[] = []) => {
        const result: { isGroup: boolean; id: string; items: PlannedExercise[] }[] = [];
        const seenSupersets = new Set<string>();

        exercises.forEach((ex, idx) => {
            if (ex.supersetId) {
                if (!seenSupersets.has(ex.supersetId)) {
                    seenSupersets.add(ex.supersetId);
                    const groupItems = exercises.filter(e => e.supersetId === ex.supersetId);
                    result.push({ id: ex.supersetId, isGroup: true, items: groupItems });
                }
            } else {
                result.push({ isGroup: false, id: String(ex.id || ex.exercise?.id || idx), items: [ex] });
            }
        });
        return result;
    }, []);

    // Auto-scroll sequence bar when active exercise index changes
    useEffect(() => {
        if (seqScrollRef.current && activeExerciseIndex >= 0) {
            seqScrollRef.current.scrollTo({
                x: Math.max(0, activeExerciseIndex * 170 - 20),
                animated: true
            });
        }
    }, [activeExerciseIndex]);

    // History for an exercise
    const getExerciseHistory = (exerciseId: string) => {
        if (!activePlan || !activePlan.logs) return null;
        const allSessions: { date: string; exLog: any }[] = [];
        activePlan.logs.forEach(dayLog => {
            dayLog.sessions?.forEach(session => {
                const exLog = session.exercises.find((e: any) => String(e.exerciseId) === String(exerciseId));
                if (exLog) {
                    allSessions.push({ date: session.date, exLog });
                }
            });
        });
        if (allSessions.length === 0) return null;
        allSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return allSessions[0];
    };

    const exerciseHistory = useMemo(() => {
        if (!activeExerciseId) return null;
        return getExerciseHistory(activeExerciseId);
    }, [activeExerciseId, activePlan]);

    const recentSession = useMemo(() => {
        if (!activePlan || !activePlan.logs || !activeSessionDay) return null;
        const dayLog = activePlan.logs.find(l => l.dayNumber === activeSessionDay);
        if (!dayLog || !dayLog.sessions || dayLog.sessions.length === 0) return null;
        const sorted = [...dayLog.sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return sorted[0];
    }, [activePlan, activeSessionDay]);

    const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
    const [showRecentSessionModal, setShowRecentSessionModal] = useState(false);

    // Start workout session
    const handleStartSession = () => {
        if (activePlan && currentDay) {
            if (activeSessionDay !== null) {
                showToast.warning('Ya tienes una sesión activa en progreso.');
                return;
            }
            const initialLogs: Record<string, SetLog[]> = {};
            currentDay.exercises.forEach(ex => {
                const exId = String(ex.id || ex.exercise.id);
                initialLogs[exId] = Array(Number(ex.sets) || 3).fill(null).map(() => ({ reps: '', weight: '', weightLb: '' }));
            });
            startWorkoutSession(activePlan.id, currentDay.dayNumber, initialLogs);
            setActiveExerciseIndex(0);
            setActiveGroupSubIndex({});
        }
    };

    // Update set value
    const handleUpdateSet = (exerciseId: string, setIndex: number, field: keyof SetLog | 'rpe', value: string) => {
        const cleanValue = value.replace(',', '.');
        setSessionLogs(prev => {
            const exerciseLogs = [...(prev[exerciseId] || [])];
            const newLog: any = { ...exerciseLogs[setIndex], [field]: cleanValue };

            if (field === 'weight') {
                const numValue = parseFloat(cleanValue) || 0;
                newLog.weightLb = cleanValue === '' ? '' : numValue > 0 ? parseFloat((numValue * 2.20462).toFixed(1)) : 0;
            } else if (field === 'weightLb') {
                const numValue = parseFloat(cleanValue) || 0;
                newLog.weight = cleanValue === '' ? '' : numValue > 0 ? parseFloat((numValue / 2.20462).toFixed(1)) : 0;
            }

            exerciseLogs[setIndex] = newLog;
            return { ...prev, [exerciseId]: exerciseLogs };
        });
    };

    // Toggle set completion and trigger timer
    const handleToggleSetCheck = (exerciseId: string, setIndex: number) => {
        const key = `${exerciseId}-${setIndex}`;
        setCompletedSets(prev => {
            const nextStatus = !prev[key];
            if (nextStatus) {
                // Auto-start rest timer
                startRestTimer();
            }
            return { ...prev, [key]: nextStatus };
        });
    };

    // Add new set to active exercise
    const handleAddSet = (exerciseId: string) => {
        setSessionLogs(prev => {
            const current = prev[exerciseId] || [];
            return {
                ...prev,
                [exerciseId]: [...current, { reps: '', weight: '', weightLb: '' }]
            };
        });
    };

    // Save and advance to next exercise or group
    const handleNextExercise = () => {
        if (currentGroup?.isGroup && currentSubIdx < currentGroup.items.length - 1) {
            setActiveGroupSubIndex(prev => ({ ...prev, [currentGroup.id]: currentSubIdx + 1 }));
            mainScrollRef.current?.scrollTo({ y: 0, animated: true });
        } else if (activeExerciseIndex < groupedExercises.length - 1) {
            setActiveExerciseIndex(prev => prev + 1);
            mainScrollRef.current?.scrollTo({ y: 0, animated: true });
        } else {
            handlePromptFinishSession();
        }
    };

    // Finish session handler
    const confirmFinish = async () => {
        if (!activePlan || activeSessionDay === null) return;
        setIsSaving(true);
        try {
            const exercises: ExerciseLog[] = Object.entries(sessionLogs).map(([exId, sets]) => ({
                exerciseId: exId,
                setLogs: sets.map((s: any) => ({
                    ...s,
                    reps: Number(s.reps) || 0,
                    weight: Number(s.weight) || 0,
                    weightLb: Number(s.weightLb) || 0
                }))
            }));

            const startDate = sessionStartTime ? new Date(sessionStartTime) : new Date();
            const durationMinutes = sessionStartTime ? Math.max(1, Math.floor((Date.now() - sessionStartTime) / 60000)) : undefined;

            const dayLog = {
                dayNumber: activeSessionDay,
                sessions: [{
                    sessionNumber: 1,
                    date: formatToLocalISO(startDate),
                    duration: durationMinutes,
                    exercises: exercises,
                    comment: comment
                }]
            };

            await saveLog(activePlan.id, dayLog);
            await finishWorkoutSession();

            // Clear rest timer on session completion
            AsyncStorage.removeItem('@af_rest_timer_data').catch(() => {});
            restTimerEndTimeRef.current = null;
            setIsRestTimerRunning(false);

            showToast.success('¡Sesión finalizada y registrada correctamente!');
            router.replace('/(tabs)');
        } catch (error: any) {
            console.error('Error al guardar la sesión de entrenamiento:', error);
            showToast.error(error?.message || 'Error al guardar la sesión de entrenamiento');
        } finally {
            setIsSaving(false);
        }
    };

    const handlePromptFinishSession = () => {
        let totalSets = 0;
        let completedSetsCount = 0;

        dayExercises.forEach(pe => {
            const exId = String(pe.id || pe.exercise.id);
            const sets = sessionLogs[exId] || Array(Number(pe.sets) || 3).fill(null);
            totalSets += sets.length;
            sets.forEach((_, idx) => {
                if (completedSets[`${exId}-${idx}`]) {
                    completedSetsCount++;
                }
            });
        });

        const pendingSetsCount = Math.max(0, totalSets - completedSetsCount);
        const hasUnfinishedSets = pendingSetsCount > 0;

        const sessionOptions: any[] = [];
        if (recentSession) {
            sessionOptions.push({
                text: 'Ver última sesión',
                onPress: () => {
                    setOptionsPush(null);
                    setShowRecentSessionModal(true);
                }
            });
        }

        if (hasUnfinishedSets) {
            sessionOptions.push({
                text: 'Sí, terminar sin llenar lo faltante',
                style: 'primary',
                onPress: () => {
                    setOptionsPush(null);
                    confirmFinish();
                }
            });
            sessionOptions.push({
                text: 'Continuar entrenando',
                style: 'cancel',
                onPress: () => setOptionsPush(null)
            });
            sessionOptions.push({
                text: 'Descartar Sesión',
                style: 'destructive',
                onPress: () => {
                    setOptionsPush(null);
                    AsyncStorage.removeItem('@af_rest_timer_data').catch(() => {});
                    restTimerEndTimeRef.current = null;
                    setIsRestTimerRunning(false);
                    discardWorkoutSession();
                    router.replace('/(tabs)');
                }
            });

            setOptionsPush({
                title: 'Series sin terminar',
                message: `Tienes ${pendingSetsCount} ${pendingSetsCount === 1 ? 'serie pendiente' : 'series pendientes'} sin completar (sin activar la bandera). ¿Deseas terminar la sesión sin llenar lo faltante?`,
                options: sessionOptions
            });
        } else {
            sessionOptions.push({
                text: 'Sí, Finalizar y Guardar',
                style: 'primary',
                onPress: () => {
                    setOptionsPush(null);
                    confirmFinish();
                }
            });
            sessionOptions.push({
                text: 'Continuar entrenando',
                style: 'cancel',
                onPress: () => setOptionsPush(null)
            });
            sessionOptions.push({
                text: 'Descartar Sesión',
                style: 'destructive',
                onPress: () => {
                    setOptionsPush(null);
                    AsyncStorage.removeItem('@af_rest_timer_data').catch(() => {});
                    restTimerEndTimeRef.current = null;
                    setIsRestTimerRunning(false);
                    discardWorkoutSession();
                    router.replace('/(tabs)');
                }
            });

            setOptionsPush({
                title: 'Finalizar sesión',
                message: `Has completado todas las series planificadas (${completedSetsCount}/${totalSets}). ¿Deseas finalizar y guardar tu sesión?`,
                options: sessionOptions
            });
        }
    };

    // Calculate Volume and 1RM for active exercise
    const activeExerciseLogs: any[] = sessionLogs[activeExerciseId] || [];
    const completedExerciseLogs = activeExerciseLogs.filter((_, idx) => completedSets[`${activeExerciseId}-${idx}`]);

    const activeExerciseVolume = useMemo(() => {
        return completedExerciseLogs.reduce((acc, log) => {
            const w = Number(log.weight) || 0;
            const r = Number(log.reps) || 0;
            return acc + (w * r);
        }, 0);
    }, [completedExerciseLogs]);

    const activeExercise1RM = useMemo(() => {
        return completedExerciseLogs.reduce((max1RM, log) => {
            const w = Number(log.weight) || 0;
            const r = Number(log.reps) || 0;
            if (w <= 0 || r <= 0) return max1RM;
            const est = r === 1 ? w : w * (1 + r / 30);
            return Math.max(max1RM, Math.round(est * 10) / 10);
        }, 0);
    }, [completedExerciseLogs]);

    // Format timer seconds as MM:SS
    const formatTimeMMSS = (sec: number) => {
        const m = Math.floor(sec / 60).toString().padStart(2, '0');
        const s = (sec % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    // ─────────────────────────────────────────────────────────────────────────
    // VISTA: CARGANDO O SIN PLAN ACTIVO
    // ─────────────────────────────────────────────────────────────────────────
    if (isLoadingPlans && !activePlan) {
        return (
            <View style={[workoutStyles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 12, color: colors.textMuted, fontSize: 14 }}>Cargando planes de entrenamiento...</Text>
            </View>
        );
    }

    if (!activePlan) {
        return (
            <View style={[workoutStyles.container, { justifyContent: 'center', alignItems: 'center', padding: 24 }]}>
                <CalendarDays size={52} color={colors.primary} style={{ marginBottom: 16 }} />
                <Text style={{ color: colors.text, fontSize: 20, fontWeight: '800', textAlign: 'center' }}>Sin plan activo</Text>
                <Text style={{ color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 }}>
                    No hemos encontrado un plan de entrenamiento activo asignado a tu cuenta.
                </Text>
                <TouchableOpacity
                    style={[workoutStyles.primaryBlueBtn, { marginTop: 24, paddingHorizontal: 24 }]}
                    onPress={() => router.replace('/(tabs)')}
                >
                    <Text style={workoutStyles.primaryBlueBtnText}>Volver al Inicio</Text>
                </TouchableOpacity>
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VISTA: "TUS PLANES" (CUANDO NO HAY SESIÓN ACTIVA)
    // ─────────────────────────────────────────────────────────────────────────
    if (!isSessionActive) {
        return (
            <View style={workoutStyles.container}>
                {/* Header Superior */}
                <View style={[workoutStyles.topNav, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
                    <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={workoutStyles.backIconBtn}>
                        <ArrowLeft size={22} color="#FFFFFF" />
                    </TouchableOpacity>
                    <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={workoutStyles.topNavTitle}>Tus Planes</Text>
                        <Text style={workoutStyles.topNavSubtitle}>{(activePlan as any).name || `${activePlan.month} ${activePlan.year}`}</Text>
                    </View>
                </View>

                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2563EB" />}
                >
                    {/* Selector de Meses/Planes */}
                    {userPlans.length > 1 && (
                        <View style={{ marginBottom: 16 }}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                                {userPlans.map(plan => {
                                    const isSel = activePlan.id === plan.id;
                                    return (
                                        <TouchableOpacity
                                            key={plan.id}
                                            style={[workoutStyles.planTabChip, isSel && workoutStyles.planTabChipActive]}
                                            onPress={() => { setSelectedPlanId(plan.id); setSelectedDayIdx(0); }}
                                        >
                                            <Text style={[workoutStyles.planTabChipText, isSel && workoutStyles.planTabChipTextActive]}>
                                                {plan.month} {plan.year}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </View>
                    )}

                    {/* Notas del Plan */}
                    <View style={workoutStyles.planNoteCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Info size={16} color="#38BDF8" />
                            <Text style={workoutStyles.planNoteTitle}>NOTAS DEL PLAN</Text>
                        </View>
                        <Text style={workoutStyles.planNoteText}>
                            {activePlan.comment || 'Sigue la progresión de cargas y anota tus repeticiones en cada sesión.'}
                        </Text>
                    </View>

                    {/* Lista de Días */}
                    <Text style={workoutStyles.sectionHeaderTitle}>DÍAS DE ENTRENAMIENTO</Text>
                    <View style={{ gap: 12 }}>
                        {activePlan.days.map((day, idx) => {
                            const isSelected = selectedDayIdx === idx;
                            const muscleText = day.muscleGroups?.length ? day.muscleGroups.join(', ') : 'Cuerpo Completo';

                            return (
                                <TouchableOpacity
                                    key={day.dayNumber}
                                    style={[workoutStyles.dayCard, isSelected && workoutStyles.dayCardSelected]}
                                    onPress={() => setSelectedDayIdx(idx)}
                                    activeOpacity={0.85}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                            <View style={[workoutStyles.dayNumberCircle, isSelected && workoutStyles.dayNumberCircleSelected]}>
                                                <Text style={[workoutStyles.dayNumberCircleText, isSelected && { color: '#FFFFFF' }]}>
                                                    {day.dayNumber}
                                                </Text>
                                            </View>
                                            <View>
                                                <Text style={workoutStyles.dayTitle}>{day.label || `Día ${day.dayNumber}`}</Text>
                                                <Text style={workoutStyles.daySubtitle}>{muscleText}</Text>
                                            </View>
                                        </View>
                                        <View style={workoutStyles.exerciseCountBadge}>
                                            <Text style={workoutStyles.exerciseCountBadgeText}>{day.exercises?.length || 0} EJERCICIOS</Text>
                                        </View>
                                    </View>

                                    {/* Lista previa de ejercicios del día seleccionado */}
                                    {isSelected && day.exercises?.length > 0 && (
                                        <View style={workoutStyles.dayExercisesPreview}>
                                            {groupExercisesList(day.exercises).map((grp, gIdx) => {
                                                if (grp.isGroup) {
                                                    const isTriserie = grp.items.length >= 3;
                                                    const groupColor = isTriserie ? '#10B981' : '#EF4444';
                                                    return (
                                                        <View key={'grp-' + grp.id + '-' + gIdx} style={[workoutStyles.previewGroupContainer, { borderLeftColor: groupColor }]}>
                                                            <View style={[workoutStyles.previewGroupTag, { backgroundColor: groupColor }]}>
                                                                <Text style={workoutStyles.previewGroupTagText}>{isTriserie ? 'TRISERIE' : 'BISERIE'}</Text>
                                                            </View>
                                                            {grp.items.map((pe, exIdx) => (
                                                                <View key={pe.exercise?.id || exIdx} style={workoutStyles.previewExerciseRow}>
                                                                    <Text style={[workoutStyles.previewBullet, { color: groupColor }]}>•</Text>
                                                                    <Text style={workoutStyles.previewExerciseName} numberOfLines={1}>
                                                                        {pe.exercise?.name}
                                                                    </Text>
                                                                    <Text style={workoutStyles.previewExerciseSets}>
                                                                        {pe.sets} × {pe.minReps}-{pe.maxReps}
                                                                    </Text>
                                                                </View>
                                                            ))}
                                                        </View>
                                                    );
                                                }
                                                const pe = grp.items[0];
                                                return (
                                                    <View key={pe.exercise?.id || gIdx} style={workoutStyles.previewExerciseRow}>
                                                        <Text style={workoutStyles.previewBullet}>•</Text>
                                                        <Text style={workoutStyles.previewExerciseName} numberOfLines={1}>
                                                            {pe.exercise?.name}
                                                        </Text>
                                                        <Text style={workoutStyles.previewExerciseSets}>
                                                            {pe.sets} × {pe.minReps}-{pe.maxReps}
                                                        </Text>
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>

                {/* Botón Flotante Inferior: Iniciar Entrenamiento */}
                <View style={[workoutStyles.fixedBottomBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                    <TouchableOpacity
                        style={workoutStyles.primaryBlueBtn}
                        onPress={handleStartSession}
                        activeOpacity={0.85}
                    >
                        <Play size={18} color="#FFFFFF" fill="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={workoutStyles.primaryBlueBtnText}>COMENZAR ENTRENAMIENTO</Text>
                    </TouchableOpacity>
                </View>
            </View>
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VISTA: "SESIÓN ACTIVA" (DISEÑO IDÉNTICO AL MOCKUP)
    // ─────────────────────────────────────────────────────────────────────────
    return (
        <View style={workoutStyles.container}>
            {/* Top Navigation Bar */}
            <View style={[workoutStyles.topNav, { paddingTop: Math.max(insets.top, 16) + 4 }]}>
                <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={workoutStyles.backIconBtn}>
                    <ArrowLeft size={22} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={{ flex: 1, marginHorizontal: 8 }}>
                    <Text style={workoutStyles.topNavTitle} numberOfLines={1}>
                        {currentDay?.label || `Día ${currentDay?.dayNumber}`}
                    </Text>
                    <Text style={workoutStyles.topNavSubtitle} numberOfLines={1}>
                        {currentDay?.muscleGroups?.length ? currentDay.muscleGroups.join(', ') : 'Sesión en Vivo'}
                    </Text>
                </View>

                {/* Session Elapsed Timer */}
                <GlobalWorkoutTimer sessionStartTime={sessionStartTime} durationRef={sessionDurationRef} />

                {/* Pending Offline Logs Indicator */}
                {pendingOfflineLogs > 0 && (
                    <TouchableOpacity
                        style={workoutStyles.offlineSyncBadge}
                        onPress={() => {
                            showToast.info('Sincronizando entrenamientos pendientes...');
                            syncOfflineLogs();
                        }}
                    >
                        <CloudAlert size={14} color="#000" />
                        <Text style={workoutStyles.offlineSyncText}>{pendingOfflineLogs}</Text>
                    </TouchableOpacity>
                )}

                {/* More Options Button */}
                <TouchableOpacity
                    style={workoutStyles.moreBtn}
                    onPress={handlePromptFinishSession}
                >
                    <MoreVertical size={20} color="#94A3B8" />
                </TouchableOpacity>
            </View>

            <ScrollView
                ref={mainScrollRef}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 95 }}
                keyboardShouldPersistTaps="handled"
            >
                {/* ── 1. TEMPORIZADOR DE DESCANSO (Top Card) ────────────────────────── */}
                <View style={workoutStyles.restTimerCard}>
                    {/* Header */}
                    <View style={workoutStyles.restTimerHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Clock size={16} color="#94A3B8" />
                            <Text style={workoutStyles.restTimerLabel}>Temporizador de Descanso</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                            <Text style={workoutStyles.restTimerDigits}>{formatTimeMMSS(restTimerSeconds)}</Text>
                            <Text style={workoutStyles.restTimerTag}>REST</Text>
                        </View>
                    </View>

                    {/* Progress Bar */}
                    <View style={workoutStyles.restProgressTrack}>
                        <View
                            style={[
                                workoutStyles.restProgressFill,
                                {
                                    width: `${restTimerTotal > 0 ? Math.min(100, Math.max(0, (restTimerSeconds / restTimerTotal) * 100)) : 0}%`
                                }
                            ]}
                        />
                    </View>

                    {/* Action Controls Row */}
                    <View style={workoutStyles.restControlsRow}>
                        <TouchableOpacity
                            style={workoutStyles.restSmallBtn}
                            onPress={() => handleAdjustRestTimer(-15)}
                            activeOpacity={0.7}
                        >
                            <Text style={workoutStyles.restSmallBtnText}>-15s</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={workoutStyles.restSmallBtn}
                            onPress={() => handleAdjustRestTimer(15)}
                            activeOpacity={0.7}
                        >
                            <Text style={workoutStyles.restSmallBtnText}>+15s</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={workoutStyles.restSmallBtn}
                            onPress={handleResetRestTimer}
                            activeOpacity={0.7}
                        >
                            <RotateCcw size={14} color="#94A3B8" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={workoutStyles.restOrangeActionBtn}
                            onPress={handleToggleRestTimer}
                            activeOpacity={0.8}
                        >
                            <Text style={workoutStyles.restOrangeActionBtnText}>
                                {isRestTimerRunning ? 'PAUSAR' : 'INICIAR'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ── 2. SECUENCIA DEL ENTRENAMIENTO ──────────────────────────────── */}
                <View style={workoutStyles.sequenceSection}>
                    <View style={workoutStyles.sequenceHeader}>
                        <Text style={workoutStyles.sequenceTitle}>SECUENCIA DEL ENTRENAMIENTO</Text>
                        <Text style={workoutStyles.sequenceCounter}>
                            {activeExerciseIndex + 1} DE {groupedExercises.length}
                        </Text>
                    </View>

                    <ScrollView
                        ref={seqScrollRef}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 10, paddingRight: 16 }}
                    >
                        {groupedExercises.map((group, idx) => {
                            const isSelected = idx === activeExerciseIndex;
                            if (!group.isGroup) {
                                const ex = group.items[0];
                                const media = getExerciseMedia(ex);
                                return (
                                    <TouchableOpacity
                                        key={group.id || idx}
                                        style={[
                                            workoutStyles.seqChip,
                                            isSelected ? workoutStyles.seqChipActive : workoutStyles.seqChipInactive
                                        ]}
                                        onPress={() => setActiveExerciseIndex(idx)}
                                        activeOpacity={0.8}
                                    >
                                        <View style={workoutStyles.seqChipTopRow}>
                                            <View style={[
                                                workoutStyles.seqNumberBadge,
                                                isSelected && workoutStyles.seqNumberBadgeActive
                                            ]}>
                                                <Text style={[
                                                    workoutStyles.seqNumberText,
                                                    isSelected && { color: '#2563EB' }
                                                ]}>
                                                    {idx + 1}
                                                </Text>
                                            </View>
                                            <View style={[
                                                workoutStyles.seqThumbContainer,
                                                isSelected && workoutStyles.seqThumbContainerActive
                                            ]}>
                                                {media.thumbnail ? (
                                                    <Image
                                                        source={{ uri: media.thumbnail }}
                                                        style={workoutStyles.seqThumbImage}
                                                        contentFit="cover"
                                                        autoplay={false}
                                                    />
                                                ) : media.isExternal && media.rawUrl ? (
                                                    <ExternalVideoCard
                                                        url={media.rawUrl}
                                                        variant="thumb"
                                                        pressable={false}
                                                        style={workoutStyles.seqThumbImage}
                                                    />
                                                ) : (
                                                    <View style={workoutStyles.seqThumbPlaceholder}>
                                                        <Dumbbell size={14} color={isSelected ? '#FFFFFF' : '#64748B'} />
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                        <Text
                                            style={[
                                                workoutStyles.seqExerciseName,
                                                isSelected && workoutStyles.seqExerciseNameActive
                                            ]}
                                            numberOfLines={1}
                                        >
                                            {ex.exercise?.name || 'Ejercicio'}
                                        </Text>
                                        <Text style={[
                                            workoutStyles.seqSeriesText,
                                            isSelected && workoutStyles.seqSeriesTextActive
                                        ]}>
                                            {ex.sets || 3} SERIES
                                        </Text>
                                    </TouchableOpacity>
                                );
                            }

                            // Group: Biserie or Triserie
                            const isTriserie = group.items.length >= 3;
                            const groupColor = isTriserie ? '#10B981' : '#EF4444';
                            const groupLabel = isTriserie ? 'TRISERIE' : 'BISERIE';

                            return (
                                <TouchableOpacity
                                    key={group.id || idx}
                                    style={[
                                        workoutStyles.seqChip,
                                        workoutStyles.seqChipGroup,
                                        isSelected
                                            ? [workoutStyles.seqChipGroupActive, { borderColor: groupColor }]
                                            : workoutStyles.seqChipInactive
                                    ]}
                                    onPress={() => setActiveExerciseIndex(idx)}
                                    activeOpacity={0.8}
                                >
                                    <View style={workoutStyles.seqChipTopRow}>
                                        <View style={[
                                            workoutStyles.seqGroupBadge,
                                            { backgroundColor: isSelected ? groupColor : (mode === 'dark' ? '#1E293B' : '#F1F5F9') }
                                        ]}>
                                            <Text style={[
                                                workoutStyles.seqGroupBadgeText,
                                                { color: isSelected ? '#FFFFFF' : groupColor }
                                            ]}>
                                                {groupLabel}
                                            </Text>
                                        </View>
                                        <View style={[
                                            workoutStyles.seqGroupThumbWrapper,
                                            isSelected && { borderColor: groupColor }
                                        ]}>
                                            {group.items.slice(0, 3).map((gEx, subIdx) => {
                                                const gMedia = getExerciseMedia(gEx);
                                                return (
                                                    <View key={subIdx} style={workoutStyles.seqGroupThumbItem}>
                                                        {gMedia.thumbnail ? (
                                                            <Image
                                                                source={{ uri: gMedia.thumbnail }}
                                                                style={workoutStyles.seqThumbImage}
                                                                contentFit="cover"
                                                                autoplay={false}
                                                            />
                                                        ) : (
                                                            <Dumbbell size={10} color="#64748B" />
                                                        )}
                                                    </View>
                                                );
                                            })}
                                        </View>
                                    </View>
                                    <Text
                                        style={[
                                            workoutStyles.seqExerciseName,
                                            isSelected && workoutStyles.seqExerciseNameActive
                                        ]}
                                        numberOfLines={1}
                                    >
                                        {group.items.map(e => e.exercise?.name).join(' + ')}
                                    </Text>
                                    <Text style={[
                                        workoutStyles.seqSeriesText,
                                        isSelected && workoutStyles.seqSeriesTextActive
                                    ]}>
                                        {group.items.length} EJERCICIOS • {group.items[0]?.sets || 3} SERIES
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                </View>

                {/* ── SUPERSET GROUP BANNER & SUB-EXERCISE SELECTOR ───────────────── */}
                {currentGroup?.isGroup && (
                    <View style={[
                        workoutStyles.supersetHeaderCard,
                        { borderLeftColor: currentGroup.items.length >= 3 ? '#10B981' : '#EF4444' }
                    ]}>
                        <View style={workoutStyles.supersetHeaderTopRow}>
                            <View style={[
                                workoutStyles.supersetTypeBadge,
                                { backgroundColor: currentGroup.items.length >= 3 ? '#10B981' : '#EF4444' }
                            ]}>
                                <Zap size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                                <Text style={workoutStyles.supersetTypeBadgeText}>
                                    {currentGroup.items.length >= 3 ? 'TRISERIE COMBINADA' : 'BISERIE COMBINADA'}
                                </Text>
                            </View>
                            <Text style={workoutStyles.supersetGroupCounter}>
                                GRUPO {activeExerciseIndex + 1} DE {groupedExercises.length}
                            </Text>
                        </View>

                        <Text style={workoutStyles.supersetDescription}>
                            Realiza 1 serie de cada ejercicio de forma consecutiva antes de tomar el descanso.
                        </Text>

                        {/* Sub-exercise selector tabs (A1, A2, A3) */}
                        <View style={workoutStyles.supersetTabsRow}>
                            {currentGroup.items.map((exItem, subIdx) => {
                                const isSubActive = subIdx === currentSubIdx;
                                const exId = String(exItem.id || exItem.exercise?.id);
                                const sets = sessionLogs[exId] || [];
                                const completedCount = sets.filter((_, sIdx) => !!completedSets[`${exId}-${sIdx}`]).length;
                                const totalCount = sets.length || Number(exItem.sets) || 3;
                                const activeColor = currentGroup.items.length >= 3 ? '#10B981' : '#EF4444';

                                return (
                                    <TouchableOpacity
                                        key={exId || subIdx}
                                        style={[
                                            workoutStyles.supersetTabBtn,
                                            isSubActive
                                                ? [workoutStyles.supersetTabBtnActive, { borderColor: activeColor }]
                                                : workoutStyles.supersetTabBtnInactive
                                        ]}
                                        onPress={() => setActiveGroupSubIndex(prev => ({ ...prev, [currentGroup.id]: subIdx }))}
                                        activeOpacity={0.8}
                                    >
                                        <View style={workoutStyles.supersetTabHeader}>
                                            <View style={[
                                                workoutStyles.supersetLetterBadge,
                                                { backgroundColor: isSubActive ? activeColor : (mode === 'dark' ? '#1E293B' : '#E2E8F0') }
                                            ]}>
                                                <Text style={[
                                                    workoutStyles.supersetLetterBadgeText,
                                                    { color: isSubActive ? '#FFFFFF' : colors.text }
                                                ]}>
                                                    A{subIdx + 1}
                                                </Text>
                                            </View>

                                            <View style={[
                                                workoutStyles.supersetStatusBadge,
                                                completedCount === totalCount && totalCount > 0 && { backgroundColor: 'rgba(16, 185, 129, 0.15)' }
                                            ]}>
                                                <Text style={[
                                                    workoutStyles.supersetStatusText,
                                                    completedCount === totalCount && totalCount > 0 && { color: '#10B981' }
                                                ]}>
                                                    {completedCount}/{totalCount}
                                                </Text>
                                            </View>
                                        </View>

                                        <Text
                                            style={[
                                                workoutStyles.supersetTabExerciseName,
                                                isSubActive && { color: colors.text, fontWeight: '800' }
                                            ]}
                                            numberOfLines={2}
                                        >
                                            {exItem.exercise?.name}
                                        </Text>

                                        <View style={[
                                            workoutStyles.supersetTabIndicator,
                                            isSubActive && { backgroundColor: activeColor }
                                        ]}>
                                            <Text style={[
                                                workoutStyles.supersetTabIndicatorText,
                                                isSubActive ? { color: '#FFFFFF' } : { color: colors.textMuted }
                                            ]}>
                                                {isSubActive ? 'ACTIVO' : 'CAMBIAR'}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                )}

                {/* ── 3. EJERCICIO PRINCIPAL CARD ─────────────────────────────────── */}
                {activeExercise && (
                    <View style={workoutStyles.exerciseMainCard}>
                        {/* Header */}
                        <View style={workoutStyles.exerciseCardHeader}>
                            <Text style={[
                                workoutStyles.exercisePrimaryTag,
                                currentGroup?.isGroup && { color: currentGroup.items.length >= 3 ? '#10B981' : '#EF4444' }
                            ]}>
                                {currentGroup?.isGroup
                                    ? `EJERCICIO A${currentSubIdx + 1} DE LA ${currentGroup.items.length >= 3 ? 'TRISERIE' : 'BISERIE'}`
                                    : `EJERCICIO PRINCIPAL #${activeExerciseIndex + 1}`
                                }
                            </Text>
                            <TouchableOpacity
                                onPress={() => setInfoModalExercise(activeExercise)}
                                style={{ padding: 4 }}
                            >
                                <Info size={18} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>

                        {/* Title & Muscles */}
                        <Text style={workoutStyles.exerciseTitleLarge}>
                            {activeExercise.exercise?.name}
                        </Text>
                        <Text style={workoutStyles.exerciseSubtitle}>
                            {activeExercise.exercise?.muscleGroup || 'Grupo Principal'} • Objetivo: {activeExercise.sets} × {activeExercise.minReps}-{activeExercise.maxReps}
                        </Text>

                        {/* Special Instruction if set by coach */}
                        {activeExercise.instruction ? (
                            <View style={workoutStyles.instructionCard}>
                                <Info size={14} color="#38BDF8" style={{ marginTop: 2, marginRight: 8 }} />
                                <Text style={workoutStyles.instructionText}>
                                    {activeExercise.instruction}
                                </Text>
                            </View>
                        ) : null}

                        {/* Visual / Video / Carátula con reproducción automática o miniatura */}
                        {(() => {
                            const activeMedia = getExerciseMedia(activeExercise);

                            // 1. Link de video externo (YouTube, Instagram, TikTok, etc.) -> Miniatura como antes
                            if (activeMedia.isExternal && activeMedia.rawUrl) {
                                return (
                                    <View style={workoutStyles.mediaWrapper}>
                                        <ExternalVideoCard
                                            url={activeMedia.rawUrl}
                                            variant="full"
                                            style={workoutStyles.externalVideoCardStyle}
                                        />
                                    </View>
                                );
                            }

                            // 2. Video directo (.mp4, .mov) -> SafeVideo con reproducción automática al estar seleccionado
                            if (activeMedia.isMp4 && activeMedia.videoUrl) {
                                return (
                                    <View style={workoutStyles.mediaWrapper}>
                                        <SafeVideo
                                            key={activeMedia.videoUrl}
                                            sourceUri={activeMedia.videoUrl}
                                            style={workoutStyles.videoPlayerStyle}
                                            contentFit="contain"
                                            isLooping={true}
                                        />
                                    </View>
                                );
                            }

                            // 3. GIF o imagen de carátula -> Image con autoplay
                            if (activeMedia.videoUrl) {
                                return (
                                    <View style={workoutStyles.mediaWrapper}>
                                        <Image
                                            key={activeMedia.videoUrl}
                                            source={{ uri: activeMedia.videoUrl }}
                                            style={workoutStyles.videoPlayerStyle}
                                            contentFit="contain"
                                            autoplay={true}
                                        />
                                    </View>
                                );
                            }

                            // 4. Si no tiene video ni carátula -> Cuadro demostrativo con botón de YouTube
                            return (
                                <View style={workoutStyles.demoVisualContainer}>
                                    <View style={workoutStyles.demoVisualOverlay}>
                                        <View style={workoutStyles.playIconCircle}>
                                            <Play size={18} color="#38BDF8" fill="#38BDF8" />
                                        </View>
                                        <Text style={workoutStyles.demoTitle}>
                                            Demostración técnica de {activeExercise.exercise?.name}
                                        </Text>
                                        <Text style={workoutStyles.demoFocus}>
                                            Enfoque: {activeExercise.exercise?.muscleGroup || 'Biomecánica y técnica limpia'}
                                        </Text>

                                        <TouchableOpacity
                                            style={workoutStyles.youtubeSearchBtn}
                                            onPress={() => {
                                                const query = encodeURIComponent(`tecnica ${activeExercise.exercise?.name}`);
                                                Linking.openURL(`https://www.youtube.com/results?search_query=${query}`);
                                            }}
                                            activeOpacity={0.8}
                                        >
                                            <Youtube size={16} color="#EF4444" fill="#EF4444" />
                                            <Text style={workoutStyles.youtubeSearchBtnText}>
                                                Buscar técnica en YouTube
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            );
                        })()}

                        {/* Historial Expandible de Última Sesión */}
                        {exerciseHistory ? (
                            <View style={workoutStyles.historyAccordionCard}>
                                <TouchableOpacity
                                    style={workoutStyles.historyAccordionHeader}
                                    onPress={() => setExpandedHistory(prev => ({ ...prev, [activeExerciseId]: !prev[activeExerciseId] }))}
                                    activeOpacity={0.8}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Clock size={14} color="#F59E0B" />
                                        <Text style={workoutStyles.historyAccordionTitle}>
                                            ÚLTIMA SESIÓN: {new Date(exerciseHistory.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                                        </Text>
                                    </View>
                                    {expandedHistory[activeExerciseId] ? (
                                        <ChevronUp size={18} color="#94A3B8" />
                                    ) : (
                                        <ChevronDown size={18} color="#94A3B8" />
                                    )}
                                </TouchableOpacity>

                                {expandedHistory[activeExerciseId] && (
                                    <View style={workoutStyles.historyAccordionBody}>
                                        {exerciseHistory.exLog.setLogs?.map((set: any, sIdx: number) => (
                                            <View
                                                key={sIdx}
                                                style={[
                                                    workoutStyles.historySetRow,
                                                    sIdx < exerciseHistory.exLog.setLogs.length - 1 && workoutStyles.historySetRowBorder
                                                ]}
                                            >
                                                <Text style={workoutStyles.historySetLabel}>Serie {sIdx + 1}</Text>
                                                <Text style={workoutStyles.historySetValue}>
                                                    {set.reps} reps, {set.weight} kg {set.weight ? `(${(Number(set.weight) * 2.20462).toFixed(1)} lb)` : ''}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        ) : (
                            <View style={workoutStyles.previousSessionStrip}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Clock size={13} color="#64748B" />
                                    <Text style={workoutStyles.prevSessionDateTitle}>REGISTRO INICIAL (HOY)</Text>
                                </View>
                            </View>
                        )}
                    </View>
                )}

                {/* ── 4. SERIES DE TRABAJO ────────────────────────────────────────── */}
                <View style={workoutStyles.setsCard}>
                    <View style={workoutStyles.setsHeaderRow}>
                        <Text style={workoutStyles.setsHeaderTitle}>Series de Trabajo</Text>
                    </View>

                    {/* Set Rows con inputs de peso (KG), peso (LB) y reps como antes */}
                    <View style={{ gap: 10 }}>
                        {activeExerciseLogs.map((log: any, idx: number) => {
                            const isCompleted = !!completedSets[`${activeExerciseId}-${idx}`];
                            const prevSet = exerciseHistory?.exLog?.setLogs?.[idx];

                            return (
                                <View
                                    key={idx}
                                    style={[
                                        workoutStyles.setRowCard,
                                        isCompleted && workoutStyles.setRowCardCompleted
                                    ]}
                                >
                                    <View style={workoutStyles.setRowMain}>
                                        {/* Set Number */}
                                        <Text style={[
                                            workoutStyles.setIndexText,
                                            isCompleted && { color: '#2563EB' }
                                        ]}>
                                            {idx + 1}
                                        </Text>

                                        {/* Peso (KG) */}
                                        <View style={workoutStyles.inputGroupDark}>
                                            <Text style={workoutStyles.inputLabelDark}>peso (KG)</Text>
                                            <TextInput
                                                style={[
                                                    workoutStyles.inputBoxDark,
                                                    isCompleted && workoutStyles.inputBoxCompleted
                                                ]}
                                                value={log.weight !== undefined && log.weight !== null && log.weight !== '' ? String(log.weight) : ''}
                                                keyboardType="decimal-pad"
                                                onChangeText={(val) => handleUpdateSet(activeExerciseId, idx, 'weight', val)}
                                                placeholder="--"
                                                placeholderTextColor="#334155"
                                            />
                                        </View>

                                        {/* Peso (LB) */}
                                        <View style={workoutStyles.inputGroupDark}>
                                            <Text style={workoutStyles.inputLabelDark}>peso (LB)</Text>
                                            <TextInput
                                                style={[
                                                    workoutStyles.inputBoxDark,
                                                    isCompleted && workoutStyles.inputBoxCompleted
                                                ]}
                                                value={log.weightLb !== undefined && log.weightLb !== null && log.weightLb !== '' ? String(log.weightLb) : ''}
                                                keyboardType="decimal-pad"
                                                onChangeText={(val) => handleUpdateSet(activeExerciseId, idx, 'weightLb', val)}
                                                placeholder="--"
                                                placeholderTextColor="#334155"
                                            />
                                        </View>

                                        {/* Reps */}
                                        <View style={workoutStyles.inputGroupDark}>
                                            <Text style={workoutStyles.inputLabelDark}>reps</Text>
                                            <TextInput
                                                style={[
                                                    workoutStyles.inputBoxDark,
                                                    isCompleted && workoutStyles.inputBoxCompleted
                                                ]}
                                                value={log.reps !== undefined && log.reps !== null && log.reps !== '' ? String(log.reps) : ''}
                                                keyboardType="decimal-pad"
                                                onChangeText={(val) => handleUpdateSet(activeExerciseId, idx, 'reps', val)}
                                                placeholder="--"
                                                placeholderTextColor="#334155"
                                            />
                                        </View>

                                        {/* Check Button */}
                                        <TouchableOpacity
                                            style={[
                                                workoutStyles.checkBtnDark,
                                                isCompleted && workoutStyles.checkBtnCompleted
                                            ]}
                                            onPress={() => handleToggleSetCheck(activeExerciseId, idx)}
                                            activeOpacity={0.8}
                                        >
                                            <Check size={18} color={isCompleted ? '#FFFFFF' : '#64748B'} />
                                        </TouchableOpacity>
                                    </View>

                                    {/* Subtitle: Previo */}
                                    {prevSet && (
                                        <Text style={workoutStyles.previousRowLabel}>
                                            Previo: {prevSet.weight || 0} kg {prevSet.weight ? `(${(Number(prevSet.weight) * 2.20462).toFixed(1)} lb)` : ''} × {prevSet.reps || 0} reps
                                        </Text>
                                    )}
                                </View>
                            );
                        })}
                    </View>

                    {/* + Agregar Serie de Trabajo Button */}
                    <TouchableOpacity
                        style={workoutStyles.addSetDashedBtn}
                        onPress={() => handleAddSet(activeExerciseId)}
                        activeOpacity={0.8}
                    >
                        <Plus size={16} color="#94A3B8" style={{ marginRight: 6 }} />
                        <Text style={workoutStyles.addSetDashedBtnText}>+ Agregar Serie de Trabajo</Text>
                    </TouchableOpacity>

                    {/* Bottom Stats Summary */}
                    <View style={workoutStyles.statsSummaryRow}>
                        {/* Volumen Ejercicio */}
                        <View style={workoutStyles.statSummaryCard}>
                            <View style={workoutStyles.statIconCircle}>
                                <Dumbbell size={16} color="#94A3B8" />
                            </View>
                            <View>
                                <Text style={workoutStyles.statSummaryLabel}>VOLUMEN EJERCICIO</Text>
                                <Text style={workoutStyles.statSummaryValue}>
                                    {activeExerciseVolume.toLocaleString()} <Text style={{ fontSize: 13, color: '#94A3B8' }}>kg</Text>
                                </Text>
                            </View>
                        </View>

                        {/* 1RM Estimado */}
                        <View style={workoutStyles.statSummaryCard}>
                            <View style={[workoutStyles.statIconCircle, { backgroundColor: 'rgba(249, 115, 22, 0.15)' }]}>
                                <Zap size={16} color="#F97316" />
                            </View>
                            <View>
                                <Text style={workoutStyles.statSummaryLabel}>1RM ESTIMADO</Text>
                                <Text style={[workoutStyles.statSummaryValue, { color: '#F97316' }]}>
                                    {activeExercise1RM} <Text style={{ fontSize: 13, color: '#94A3B8' }}>kg</Text>
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Superset Quick Action: Switch to next exercise in group or next group */}
                    {currentGroup?.isGroup && (
                        currentSubIdx < currentGroup.items.length - 1 ? (
                            <TouchableOpacity
                                style={[
                                    workoutStyles.supersetSwitchActionBtn,
                                    { borderColor: currentGroup.items.length >= 3 ? '#10B981' : '#EF4444' }
                                ]}
                                onPress={() => {
                                    setActiveGroupSubIndex(prev => ({ ...prev, [currentGroup.id]: currentSubIdx + 1 }));
                                    mainScrollRef.current?.scrollTo({ y: 0, animated: true });
                                }}
                                activeOpacity={0.8}
                            >
                                <ArrowRight size={16} color={currentGroup.items.length >= 3 ? '#10B981' : '#EF4444'} style={{ marginRight: 6 }} />
                                <Text style={[
                                    workoutStyles.supersetSwitchActionText,
                                    { color: currentGroup.items.length >= 3 ? '#10B981' : '#EF4444' }
                                ]}>
                                    Pasar a A{currentSubIdx + 2}: {currentGroup.items[currentSubIdx + 1]?.exercise?.name} ➔
                                </Text>
                            </TouchableOpacity>
                        ) : activeExerciseIndex < groupedExercises.length - 1 ? (
                            <TouchableOpacity
                                style={workoutStyles.nextGroupActionBtn}
                                onPress={() => {
                                    setActiveExerciseIndex(prev => prev + 1);
                                    mainScrollRef.current?.scrollTo({ y: 0, animated: true });
                                }}
                                activeOpacity={0.8}
                            >
                                <ArrowRight size={16} color={colors.text} style={{ marginRight: 6 }} />
                                <Text style={workoutStyles.nextGroupActionText}>
                                    Siguiente Grupo (#{activeExerciseIndex + 2}) ➔
                                </Text>
                            </TouchableOpacity>
                        ) : null
                    )}
                </View>
            </ScrollView>

            {/* ── 5. FIXED BOTTOM ACTION BAR ──────────────────────────────────── */}
            <View style={[workoutStyles.fixedActionFooter, { paddingBottom: Math.max(insets.bottom, 14) }]}>
                {/* Actions Row: Añadir Nota & Terminar Sesión */}
                <View style={workoutStyles.secondaryActionRow}>
                    <TouchableOpacity
                        style={workoutStyles.secondaryDarkBtn}
                        onPress={() => setNoteModalVisible(true)}
                        activeOpacity={0.8}
                    >
                        <FileText size={16} color="#94A3B8" style={{ marginRight: 6 }} />
                        <Text style={workoutStyles.secondaryDarkBtnText}>
                            {comment?.trim() ? 'Editar Nota' : 'Añadir Nota'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[workoutStyles.secondaryDarkBtn, { borderColor: 'rgba(249, 115, 22, 0.4)', backgroundColor: 'rgba(249, 115, 22, 0.12)' }]}
                        onPress={handlePromptFinishSession}
                        activeOpacity={0.8}
                    >
                        <Flag size={16} color="#F97316" style={{ marginRight: 6 }} />
                        <Text style={[workoutStyles.secondaryDarkBtnText, { color: '#F97316', fontWeight: '800' }]}>
                            Terminar Sesión
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* ── MODAL: NOTA DE LA SESIÓN ────────────────────────────────────── */}
            <Modal
                visible={noteModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setNoteModalVisible(false)}
            >
                <View style={workoutStyles.modalOverlay}>
                    <View style={workoutStyles.modalDialog}>
                        <View style={workoutStyles.modalDialogHeader}>
                            <Text style={workoutStyles.modalDialogTitle}>Notas de la Sesión</Text>
                            <TouchableOpacity onPress={() => setNoteModalVisible(false)}>
                                <X size={20} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={workoutStyles.modalTextArea}
                            placeholder="Anota cómo te sentiste, pesos, sensaciones o molestias..."
                            placeholderTextColor="#64748B"
                            multiline
                            value={comment}
                            onChangeText={setComment}
                        />
                        <TouchableOpacity
                            style={[workoutStyles.primaryBlueBtn, { marginTop: 16 }]}
                            onPress={() => setNoteModalVisible(false)}
                        >
                            <Text style={workoutStyles.primaryBlueBtnText}>Guardar Nota</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── MODAL: INFO DE EJERCICIO ────────────────────────────────────── */}
            <Modal
                visible={!!infoModalExercise}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setInfoModalExercise(null)}
            >
                <View style={workoutStyles.modalOverlay}>
                    <View style={workoutStyles.modalDialog}>
                        <View style={workoutStyles.modalDialogHeader}>
                            <Text style={workoutStyles.modalDialogTitle}>Detalles del Ejercicio</Text>
                            <TouchableOpacity onPress={() => setInfoModalExercise(null)}>
                                <X size={20} color="#94A3B8" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ maxHeight: 300 }}>
                            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '800', marginBottom: 4 }}>
                                {infoModalExercise?.exercise?.name}
                            </Text>
                            <Text style={{ color: colors.primary, fontSize: 13, fontWeight: '700', marginBottom: 12 }}>
                                {infoModalExercise?.exercise?.muscleGroup} • {infoModalExercise?.sets} Series × {infoModalExercise?.minReps}-{infoModalExercise?.maxReps} Reps
                            </Text>
                            {infoModalExercise?.instruction ? (
                                <Text style={{ color: colors.text, fontSize: 13, lineHeight: 20 }}>
                                    {infoModalExercise.instruction}
                                </Text>
                            ) : (
                                <Text style={{ color: colors.textMuted, fontSize: 13, fontStyle: 'italic' }}>
                                    Sin notas técnicas específicas asignadas por tu entrenador.
                                </Text>
                            )}
                        </ScrollView>
                        <TouchableOpacity
                            style={[workoutStyles.primaryBlueBtn, { marginTop: 16 }]}
                            onPress={() => setInfoModalExercise(null)}
                        >
                            <Text style={workoutStyles.primaryBlueBtnText}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── MODAL: ÚLTIMA SESIÓN REALIZADA ───────────────────────────────── */}
            <Modal
                visible={showRecentSessionModal}
                animationType="fade"
                transparent={true}
                onRequestClose={() => setShowRecentSessionModal(false)}
            >
                <View style={workoutStyles.modalOverlay}>
                    <View style={[workoutStyles.modalDialog, { maxHeight: '80%' }]}>
                        <View style={workoutStyles.modalDialogHeader}>
                            <Text style={workoutStyles.modalDialogTitle}>Última sesión realizada</Text>
                            <TouchableOpacity onPress={() => setShowRecentSessionModal(false)}>
                                <X size={20} color={colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        {!recentSession ? (
                            <Text style={{ color: colors.textMuted, paddingVertical: 20, textAlign: 'center' }}>
                                No hay registros de una sesión anterior para este día.
                            </Text>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <Text style={{ color: colors.textMuted, marginBottom: 12, fontWeight: '600', fontSize: 13 }}>
                                    Fecha: {new Date(recentSession.date).toLocaleDateString()}
                                </Text>
                                {recentSession.exercises?.map((exLog, idx) => {
                                    let exerciseName = 'Ejercicio desconocido';
                                    const plannedEx = currentDay?.exercises.find(pe => String(pe.id || pe.exercise.id) === String(exLog.exerciseId));
                                    if (plannedEx) {
                                        exerciseName = plannedEx.exercise.name;
                                    } else {
                                        const globalEx = allExercises.find(e => String(e.id) === String(exLog.exerciseId));
                                        if (globalEx) exerciseName = globalEx.name;
                                    }
                                    return (
                                        <View key={idx} style={{ marginBottom: 12, backgroundColor: mode === 'dark' ? '#080E1A' : '#F1F5F9', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
                                            <Text style={{ color: colors.primary, fontWeight: 'bold', marginBottom: 8, fontSize: 14 }}>{exerciseName}</Text>
                                            {exLog.setLogs?.map((set, sIdx) => (
                                                <Text key={sIdx} style={{ color: colors.text, fontSize: 12, marginBottom: 4 }}>
                                                    Serie {sIdx + 1}: {set.reps} reps, {set.weight} kg {set.weight ? `(${(Number(set.weight) * 2.20462).toFixed(1)} lb)` : ''}
                                                </Text>
                                            ))}
                                        </View>
                                    );
                                })}
                            </ScrollView>
                        )}

                        <TouchableOpacity
                            style={[workoutStyles.primaryBlueBtn, { marginTop: 16 }]}
                            onPress={() => setShowRecentSessionModal(false)}
                        >
                            <Text style={workoutStyles.primaryBlueBtnText}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── MODAL: OPTION PUSH DE CONFIRMACIÓN ──────────────────────────── */}
            <Modal
                visible={!!optionsPush}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setOptionsPush(null)}
            >
                <View style={workoutStyles.optionsPushBackdrop}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={() => setOptionsPush(null)}
                    />
                    <View style={workoutStyles.optionsPushCard}>
                        <View style={workoutStyles.optionsPushHandle} />
                        <View style={workoutStyles.optionsPushHeader}>
                            <View style={[
                                workoutStyles.optionsPushIconWrap,
                                optionsPush?.isDestructive && { backgroundColor: 'rgba(239, 68, 68, 0.15)' }
                            ]}>
                                <Flag size={20} color={optionsPush?.isDestructive ? '#EF4444' : '#2563EB'} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={workoutStyles.optionsPushTitle}>{optionsPush?.title}</Text>
                                <Text style={workoutStyles.optionsPushMessage}>{optionsPush?.message}</Text>
                            </View>
                        </View>

                        <View style={workoutStyles.optionsPushActions}>
                            {optionsPush?.options.map((opt, i) => {
                                const isDestructive = opt.style === 'destructive';
                                const isCancel = opt.style === 'cancel';
                                const isPrimary = opt.style === 'primary';

                                return (
                                    <TouchableOpacity
                                        key={i}
                                        style={[
                                            workoutStyles.optionsPushBtn,
                                            isPrimary && { backgroundColor: '#2563EB' },
                                            isDestructive && { backgroundColor: 'rgba(239, 68, 68, 0.12)', borderWidth: 1, borderColor: 'rgba(239, 68, 68, 0.3)' },
                                            isCancel && { backgroundColor: 'transparent' }
                                        ]}
                                        onPress={opt.onPress}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[
                                            workoutStyles.optionsPushBtnText,
                                            isPrimary && { color: '#FFFFFF', fontWeight: '800' },
                                            isDestructive && { color: '#EF4444', fontWeight: '800' },
                                            isCancel && { color: '#94A3B8', fontWeight: '600' }
                                        ]}>
                                            {opt.text}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ─── STYLES REFACTORIZADOS SEGÚN EL MOCKUP Y MODO CLARO ─────────────────────
const getWorkoutStyles = (colors: any, mode: 'dark' | 'light') => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.background,
    },
    topNav: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 12,
        backgroundColor: mode === 'dark' ? '#0B132B' : colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    backIconBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: mode === 'dark' ? '#1E293B' : colors.surface_container_low || '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    topNavTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.text,
    },
    topNavSubtitle: {
        fontSize: 12,
        color: colors.textMuted,
        fontWeight: '500',
        marginTop: 2,
    },
    headerTimerBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: mode === 'dark' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(37, 99, 235, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(37, 99, 235, 0.3)',
        marginRight: 6,
    },
    headerTimerText: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: 13,
        fontWeight: '800',
    },
    offlineSyncBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F59E0B',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 6,
    },
    offlineSyncText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#000000',
        marginLeft: 4,
    },
    moreBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
    },

    // ── Rest Timer Top Card ──────────────────────────────────────────────────
    restTimerCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        marginBottom: 16,
    },
    restTimerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    restTimerLabel: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.text,
    },
    restTimerDigits: {
        fontSize: 22,
        fontWeight: '900',
        color: '#F97316',
        letterSpacing: 0.5,
    },
    restTimerTag: {
        fontSize: 11,
        fontWeight: '800',
        color: '#F97316',
        marginLeft: 2,
    },
    restProgressTrack: {
        height: 4,
        backgroundColor: mode === 'dark' ? '#1E293B' : colors.border,
        borderRadius: 2,
        overflow: 'hidden',
        marginBottom: 14,
    },
    restProgressFill: {
        height: '100%',
        backgroundColor: '#F97316',
        borderRadius: 2,
    },
    restControlsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    restSmallBtn: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 8,
        backgroundColor: mode === 'dark' ? '#132144' : '#E2E8F0',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    restSmallBtnText: {
        color: mode === 'dark' ? '#CBD5E1' : colors.text,
        fontSize: 12,
        fontWeight: '700',
    },
    restOrangeActionBtn: {
        flex: 1,
        backgroundColor: '#EA580C',
        paddingVertical: 8,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    restOrangeActionBtnText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.5,
    },

    // ── Secuencia del Entrenamiento ──────────────────────────────────────────
    sequenceSection: {
        marginBottom: 16,
    },
    sequenceHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
        paddingHorizontal: 2,
    },
    sequenceTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.textMuted,
        letterSpacing: 0.8,
    },
    sequenceCounter: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.textMuted,
    },
    seqChip: {
        borderRadius: 14,
        padding: 12,
        width: 140,
        justifyContent: 'space-between',
    },
    seqChipActive: {
        backgroundColor: '#2563EB',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
    },
    seqChipInactive: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    seqChipTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    seqNumberBadge: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: mode === 'dark' ? '#1E293B' : '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    seqNumberBadgeActive: {
        backgroundColor: '#FFFFFF',
    },
    seqNumberText: {
        fontSize: 11,
        fontWeight: '800',
        color: mode === 'dark' ? '#94A3B8' : colors.textMuted,
    },
    seqThumbContainer: {
        width: 32,
        height: 32,
        borderRadius: 7,
        overflow: 'hidden',
        backgroundColor: mode === 'dark' ? '#060B14' : '#F1F5F9',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    seqThumbContainerActive: {
        borderColor: 'rgba(255, 255, 255, 0.45)',
        backgroundColor: '#1D4ED8',
    },
    seqThumbImage: {
        width: '100%',
        height: '100%',
    },
    seqThumbPlaceholder: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    seqExerciseName: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 4,
    },
    seqExerciseNameActive: {
        color: '#FFFFFF',
    },
    seqSeriesText: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.textMuted,
    },
    seqSeriesTextActive: {
        color: '#BFDBFE',
    },
    seqChipGroup: {
        minWidth: 165,
    },
    seqChipGroupActive: {
        borderWidth: 2,
    },
    seqGroupBadge: {
        paddingHorizontal: 7,
        paddingVertical: 2.5,
        borderRadius: 6,
        alignItems: 'center',
        justifyContent: 'center',
    },
    seqGroupBadgeText: {
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    seqGroupThumbWrapper: {
        flexDirection: 'row',
        height: 32,
        borderRadius: 7,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        backgroundColor: mode === 'dark' ? '#060B14' : '#F1F5F9',
    },
    seqGroupThumbItem: {
        width: 22,
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        borderRightWidth: 1,
        borderRightColor: mode === 'dark' ? '#1E293B' : colors.border,
    },

    // ── Superset Header & Selector in Active Session ────────────────────────
    supersetHeaderCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        borderLeftWidth: 5,
        marginBottom: 16,
    },
    supersetHeaderTopRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    supersetTypeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
    },
    supersetTypeBadgeText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '900',
        letterSpacing: 0.8,
    },
    supersetGroupCounter: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.textMuted,
    },
    supersetDescription: {
        fontSize: 12,
        color: colors.textMuted,
        lineHeight: 17,
        marginBottom: 14,
    },
    supersetTabsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    supersetTabBtn: {
        flex: 1,
        borderRadius: 14,
        padding: 10,
        borderWidth: 1.5,
    },
    supersetTabBtnActive: {
        backgroundColor: mode === 'dark' ? 'rgba(37, 99, 235, 0.12)' : '#EFF6FF',
    },
    supersetTabBtnInactive: {
        backgroundColor: mode === 'dark' ? '#080E1A' : '#F8FAFC',
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    supersetTabHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    supersetLetterBadge: {
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 6,
    },
    supersetLetterBadgeText: {
        fontSize: 11,
        fontWeight: '900',
    },
    supersetStatusBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        backgroundColor: mode === 'dark' ? '#1E293B' : '#E2E8F0',
    },
    supersetStatusText: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.textMuted,
    },
    supersetTabExerciseName: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.text,
        marginBottom: 6,
        minHeight: 30,
    },
    supersetTabIndicator: {
        paddingVertical: 3,
        paddingHorizontal: 6,
        borderRadius: 6,
        alignItems: 'center',
        backgroundColor: mode === 'dark' ? '#1E293B' : '#E2E8F0',
    },
    supersetTabIndicatorText: {
        fontSize: 9,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    supersetSwitchActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        marginTop: 12,
        backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC',
    },
    supersetSwitchActionText: {
        fontSize: 13,
        fontWeight: '800',
    },
    nextGroupActionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: mode === 'dark' ? '#334155' : colors.border,
        marginTop: 12,
        backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.03)' : '#F8FAFC',
    },
    nextGroupActionText: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.text,
    },

    // ── Ejercicio Principal Card ─────────────────────────────────────────────
    exerciseMainCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        marginBottom: 16,
    },
    exerciseCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    exercisePrimaryTag: {
        fontSize: 12,
        fontWeight: '800',
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        letterSpacing: 0.5,
    },
    exerciseTitleLarge: {
        fontSize: 22,
        fontWeight: '900',
        color: colors.text,
        letterSpacing: 0.3,
    },
    exerciseSubtitle: {
        fontSize: 12,
        color: colors.textMuted,
        fontWeight: '600',
        marginTop: 4,
    },
    instructionCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: mode === 'dark' ? 'rgba(56, 189, 248, 0.08)' : 'rgba(37, 99, 235, 0.08)',
        borderLeftWidth: 3,
        borderLeftColor: mode === 'dark' ? '#38BDF8' : colors.primary,
        padding: 10,
        borderRadius: 8,
        marginTop: 10,
        marginBottom: 2,
    },
    instructionText: {
        flex: 1,
        fontSize: 12,
        color: mode === 'dark' ? '#CBD5E1' : colors.text,
        lineHeight: 18,
        fontStyle: 'italic',
    },
    mediaWrapper: {
        marginVertical: 14,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#000000',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    externalVideoCardStyle: {
        width: '100%',
        height: 200,
        borderRadius: 14,
    },
    videoPlayerStyle: {
        width: '100%',
        height: 220,
        backgroundColor: '#000000',
    },
    demoVisualContainer: {
        height: 180,
        backgroundColor: mode === 'dark' ? '#060B14' : '#0F172A',
        borderRadius: 14,
        marginVertical: 14,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        overflow: 'hidden',
        justifyContent: 'center',
        alignItems: 'center',
    },
    demoVisualOverlay: {
        alignItems: 'center',
        paddingHorizontal: 16,
    },
    playIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        borderWidth: 1.5,
        borderColor: '#38BDF8',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
    },
    demoTitle: {
        color: '#F8FAFC',
        fontSize: 12,
        fontWeight: '700',
        textAlign: 'center',
    },
    demoFocus: {
        color: '#94A3B8',
        fontSize: 11,
        marginTop: 2,
        textAlign: 'center',
    },
    youtubeSearchBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: mode === 'dark' ? '#1E293B' : '#F1F5F9',
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#334155' : colors.border,
        marginTop: 10,
    },
    youtubeSearchBtnText: {
        color: mode === 'dark' ? '#FFFFFF' : colors.text,
        fontSize: 11,
        fontWeight: '700',
    },
    previousSessionStrip: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: mode === 'dark' ? 'rgba(15, 23, 42, 0.8)' : '#F8FAFC',
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    prevSessionDateTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: '#F59E0B',
    },
    prevSessionSetsSummary: {
        fontSize: 12,
        color: colors.textMuted,
        fontWeight: '600',
        marginTop: 3,
    },
    historyAccordionCard: {
        backgroundColor: mode === 'dark' ? '#060B14' : '#F8FAFC',
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        marginTop: 8,
    },
    historyAccordionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 12,
    },
    historyAccordionTitle: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '700',
    },
    historyAccordionBody: {
        paddingHorizontal: 12,
        paddingBottom: 10,
        paddingTop: 2,
    },
    historySetRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 6,
    },
    historySetRowBorder: {
        borderBottomWidth: 1,
        borderBottomColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    historySetLabel: {
        color: colors.text,
        fontSize: 12,
    },
    historySetValue: {
        color: '#2563EB',
        fontSize: 12,
        fontWeight: '700',
    },
    prBadge: {
        backgroundColor: 'rgba(234, 88, 12, 0.15)',
        borderWidth: 1,
        borderColor: '#EA580C',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    prBadgeText: {
        color: '#F97316',
        fontSize: 11,
        fontWeight: '800',
    },

    // ── Series de Trabajo ────────────────────────────────────────────────────
    setsCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        marginBottom: 20,
    },
    setsHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    setsHeaderTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.text,
    },
    setRowCard: {
        backgroundColor: mode === 'dark' ? 'rgba(15, 23, 42, 0.6)' : '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        padding: 10,
    },
    setRowCardCompleted: {
        backgroundColor: mode === 'dark' ? 'rgba(37, 99, 235, 0.08)' : 'rgba(37, 99, 235, 0.1)',
        borderColor: 'rgba(37, 99, 235, 0.35)',
    },
    setRowMain: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    setIndexText: {
        fontSize: 15,
        fontWeight: '900',
        color: colors.textMuted,
        width: 24,
        textAlign: 'center',
        marginTop: 14,
    },
    inputGroupDark: {
        flex: 1,
        marginHorizontal: 3,
    },
    inputLabelDark: {
        fontSize: 9,
        fontWeight: '700',
        color: colors.textMuted,
        marginBottom: 4,
        textAlign: 'center',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    inputBoxDark: {
        backgroundColor: mode === 'dark' ? '#060B14' : '#FFFFFF',
        color: colors.text,
        fontSize: 14,
        fontWeight: '800',
        textAlign: 'center',
        borderRadius: 8,
        height: 40,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    inputBoxCompleted: {
        borderColor: '#2563EB',
    },
    checkBtnDark: {
        width: 38,
        height: 40,
        borderRadius: 8,
        backgroundColor: mode === 'dark' ? '#1E293B' : '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 4,
        marginTop: 14,
    },
    checkBtnCompleted: {
        backgroundColor: '#2563EB',
    },
    previousRowLabel: {
        fontSize: 11,
        color: colors.textMuted,
        fontWeight: '500',
        marginTop: 6,
        marginLeft: 28,
    },
    addSetDashedBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: mode === 'dark' ? '#334155' : colors.border,
        borderRadius: 12,
        paddingVertical: 12,
        marginTop: 10,
    },
    addSetDashedBtnText: {
        color: colors.textMuted,
        fontSize: 13,
        fontWeight: '700',
    },
    statsSummaryRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 16,
    },
    statSummaryCard: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface,
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    statIconCircle: {
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: mode === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.12)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    statSummaryLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.textMuted,
        letterSpacing: 0.5,
    },
    statSummaryValue: {
        fontSize: 18,
        fontWeight: '900',
        color: colors.text,
        marginTop: 2,
    },

    // ── Fixed Bottom Actions ─────────────────────────────────────────────────
    fixedActionFooter: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: mode === 'dark' ? 'rgba(11, 19, 43, 0.95)' : 'rgba(255, 255, 255, 0.96)',
        borderTopWidth: 1,
        borderTopColor: mode === 'dark' ? '#1E293B' : colors.border,
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    primaryBlueActionBtn: {
        backgroundColor: '#2563EB',
        borderRadius: 14,
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 8,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 6,
    },
    primaryBlueActionBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    secondaryActionRow: {
        flexDirection: 'row',
        gap: 10,
    },
    secondaryDarkBtn: {
        flex: 1,
        height: 42,
        borderRadius: 12,
        backgroundColor: mode === 'dark' ? '#1E293B' : '#E2E8F0',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    secondaryDarkBtnText: {
        color: colors.text,
        fontSize: 13,
        fontWeight: '700',
    },

    // ── Tus Planes View Styles ───────────────────────────────────────────────
    planTabChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    planTabChipActive: {
        backgroundColor: '#2563EB',
        borderColor: '#2563EB',
    },
    planTabChipText: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.textMuted,
    },
    planTabChipTextActive: {
        color: '#FFFFFF',
    },
    planNoteCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderRadius: 12,
        padding: 14,
        borderLeftWidth: 4,
        borderLeftColor: mode === 'dark' ? '#38BDF8' : colors.primary,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        marginBottom: 16,
    },
    planNoteTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        letterSpacing: 1,
    },
    planNoteText: {
        fontSize: 13,
        color: colors.text,
        lineHeight: 18,
    },
    sectionHeaderTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.textMuted,
        letterSpacing: 1,
        marginBottom: 10,
    },
    dayCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    dayCardSelected: {
        borderColor: '#2563EB',
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
    },
    dayNumberCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: mode === 'dark' ? '#1E293B' : '#E2E8F0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    dayNumberCircleSelected: {
        backgroundColor: '#2563EB',
    },
    dayNumberCircleText: {
        fontSize: 14,
        fontWeight: '900',
        color: colors.textMuted,
    },
    dayTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.text,
    },
    daySubtitle: {
        fontSize: 12,
        color: colors.textMuted,
        fontWeight: '500',
        marginTop: 2,
    },
    exerciseCountBadge: {
        backgroundColor: mode === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(100, 116, 139, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    exerciseCountBadgeText: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.textMuted,
    },
    dayExercisesPreview: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: mode === 'dark' ? '#1E293B' : colors.border,
        gap: 6,
    },
    previewGroupContainer: {
        borderLeftWidth: 3,
        paddingLeft: 8,
        marginVertical: 4,
        borderRadius: 4,
    },
    previewGroupTag: {
        alignSelf: 'flex-start',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        marginBottom: 4,
    },
    previewGroupTagText: {
        color: '#FFFFFF',
        fontSize: 9,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    previewExerciseRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    previewBullet: {
        color: '#2563EB',
        fontSize: 14,
        marginRight: 6,
    },
    previewExerciseName: {
        flex: 1,
        color: colors.text,
        fontSize: 13,
        fontWeight: '600',
    },
    previewExerciseSets: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '500',
    },
    fixedBottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: mode === 'dark' ? 'rgba(11, 19, 43, 0.95)' : 'rgba(255, 255, 255, 0.96)',
        borderTopWidth: 1,
        borderTopColor: mode === 'dark' ? '#1E293B' : colors.border,
        paddingHorizontal: 16,
        paddingTop: 12,
    },
    primaryBlueBtn: {
        backgroundColor: '#2563EB',
        borderRadius: 14,
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    primaryBlueBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '900',
        letterSpacing: 0.5,
    },

    // ── Modals & Option Push ─────────────────────────────────────────────────
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        justifyContent: 'center',
        padding: 20,
    },
    modalDialog: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderRadius: 18,
        padding: 20,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    modalDialogHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    modalDialogTitle: {
        color: colors.text,
        fontSize: 17,
        fontWeight: '800',
    },
    modalTextArea: {
        backgroundColor: mode === 'dark' ? '#080E1A' : '#F8FAFC',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        color: colors.text,
        fontSize: 14,
        padding: 12,
        height: 120,
        textAlignVertical: 'top',
    },
    optionsPushBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        justifyContent: 'flex-end',
    },
    optionsPushCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 36 : 24,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    optionsPushHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: mode === 'dark' ? '#334155' : colors.border,
        alignSelf: 'center',
        marginBottom: 16,
    },
    optionsPushHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginBottom: 18,
    },
    optionsPushIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionsPushTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 2,
    },
    optionsPushMessage: {
        fontSize: 13,
        color: colors.textMuted,
        lineHeight: 18,
    },
    optionsPushActions: {
        gap: 8,
    },
    optionsPushBtn: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionsPushBtnText: {
        fontSize: 15,
        fontWeight: '700',
    },
});
