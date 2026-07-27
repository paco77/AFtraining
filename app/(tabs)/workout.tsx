import RestTimerModal from '@/components/RestTimerModal';
import { ExerciseLog, MONTHS, PlannedExercise, SetLog } from '@/constants/PlanTypes';
import { borderRadius, Colors, Fonts, Spacing } from '@/constants/theme';
import { usePlans } from '@/context/PlanContext';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { API_HOST } from '@/services/api';
import { showToast } from '@/services/toast';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ArrowLeft, CalendarDays, Check, CheckCheck, ChevronDown, ChevronUp, CloudAlert, Dumbbell, MoreVertical, Plus, Timer } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Video, ResizeMode } from 'expo-av';
import { ActivityIndicator, Alert, Dimensions, FlatList, KeyboardAvoidingView, Platform, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, Modal } from 'react-native';
const SCREEN_WIDTH = Dimensions.get('window').width;
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const SessionTimer = ({ sessionStartTime, durationRef }: { sessionStartTime: number | null, durationRef?: React.MutableRefObject<number> }) => {
    const [elapsed, setElapsed] = useState(0);
    const [isRunning, setIsRunning] = useState(false);

    useEffect(() => {
        if (!isRunning) return;
        const int = setInterval(() => {
            setElapsed(prev => {
                const next = prev + 1;
                if (durationRef) durationRef.current = next;
                return next;
            });
        }, 1000);
        return () => clearInterval(int);
    }, [isRunning, durationRef]);

    if (!sessionStartTime) return null;

    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    const h = Math.floor(elapsed / 3600);

    return (
        <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: isRunning ? 'rgba(204,255,0,0.15)' : 'rgba(255,255,255,0.1)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, marginRight: 8 }}
            onPress={() => setIsRunning(!isRunning)}
            activeOpacity={0.7}
        >
            <Timer size={16} color={isRunning ? "#CCFF00" : "#F8FAFC"} style={{ marginRight: 6 }} />
            <Text style={{ color: isRunning ? '#CCFF00' : '#F8FAFC', fontSize: 13, fontWeight: '700', fontFamily: Fonts.headline }}>
                {h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`}
            </Text>
        </TouchableOpacity>
    );
};

const RecentSessionCard = ({ session, currentDay }: { session: any, currentDay: any }) => {
    const [expanded, setExpanded] = useState(false);

    if (!session) return null;

    const dateStr = new Date(session.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
    const durationStr = session.duration ? `${session.duration} min` : '';

    return (
        <View style={{ marginHorizontal: 20, marginTop: 20, marginBottom: 10, borderRadius: 16, backgroundColor: Colors.surface, overflow: 'hidden' }}>
            <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setExpanded(!expanded)}
                style={{ padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
            >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary_container, justifyContent: 'center', alignItems: 'center' }}>
                        <Timer size={20} color={Colors.primary} />
                    </View>
                    <View>
                        <Text style={{ fontFamily: Fonts.headline, fontSize: 16, fontWeight: '700', color: '#FFF' }}>
                            Sesión Anterior
                        </Text>
                        <Text style={{ fontFamily: Fonts.body, fontSize: 13, color: Colors.textMuted }}>
                            {dateStr} {durationStr ? ` • ${durationStr}` : ''}
                        </Text>
                    </View>
                </View>
                {expanded ? <ChevronUp size={24} color={Colors.textMuted} /> : <ChevronDown size={24} color={Colors.textMuted} />}
            </TouchableOpacity>

            {expanded && (
                <View style={{ paddingHorizontal: 16, paddingBottom: 16 }}>
                    {session.comment && (
                        <Text style={{ fontFamily: Fonts.body, fontSize: 13, color: '#A0AEC0', fontStyle: 'italic', marginBottom: 12 }}>
                            "{session.comment}"
                        </Text>
                    )}
                    {session.exercises?.map((exLog: any, idx: number) => {
                        const plannedExercise = currentDay?.exercises?.find((e: any) => String(e.id) === String(exLog.exerciseId));
                        const exerciseDef = plannedExercise?.exercise;
                        const exName = exerciseDef?.name || 'Ejercicio Desconocido';
                        return (
                            <View key={idx} style={{ marginBottom: 12 }}>
                                <Text style={{ fontFamily: Fonts.headline, fontSize: 14, fontWeight: '600', color: Colors.secondary, marginBottom: 4 }}>
                                    {exName}
                                </Text>
                                <View style={{ backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 8 }}>
                                    {exLog.setLogs?.map((set: any, sIdx: number) => (
                                        <View key={sIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
                                            <Text style={{ fontFamily: Fonts.body, fontSize: 12, color: Colors.textMuted }}>Serie {sIdx + 1}</Text>
                                            <Text style={{ fontFamily: Fonts.body, fontSize: 12, color: '#FFF', fontWeight: '500' }}>
                                                {set.weight} {exerciseDef?.equipment === 'Body Weight' ? '' : 'kg'} × {set.reps} reps
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            </View>
                        );
                    })}
                </View>
            )}
        </View>
    );
};

export default function WorkoutScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors } = useTheme();
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
        updatePlan,
        pendingOfflineLogs,
        syncOfflineLogs,
        sessionStartTime,
        fetchPlans,
        allExercises
    } = usePlans();
    const { currentUser } = useUser();
    const [selectedDayIdx, setSelectedDayIdx] = useState(0);
    const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
    const [isTimerVisible, setTimerVisible] = useState(false);
    const [activeTimerSeconds, setActiveTimerSeconds] = useState(90);
    const [restTimes, setRestTimes] = useState<Record<string, string>>({});
    const [refreshing, setRefreshing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [showRecentSessionModal, setShowRecentSessionModal] = useState(false);
    const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});
    const sessionDurationRef = React.useRef(0);
    const exercisesListRef = React.useRef<FlatList>(null);

    // Grouping state
    const [isGroupingMode, setIsGroupingMode] = useState(false);
    const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);

    // Find active plan for current user (most recent one)
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
            if (activePlan) {
                // To refresh plans, we could call fetchPlans if available
                if (fetchPlans) await fetchPlans();
            }
        } finally {
            setRefreshing(false);
        }
    }, [activePlan]);

    useEffect(() => {
        if (exercisesListRef.current && currentDay?.exercises && currentDay.exercises.length > 0) {
            exercisesListRef.current.scrollToIndex({
                index: activeExerciseIndex,
                animated: true
            });
        }
    }, [activeExerciseIndex]);

    const currentDay = activePlan?.days[selectedDayIdx];
    const isSessionActive = activeSessionDay !== null;
    const isOnSessionDay = isSessionActive && activeSessionDay === currentDay?.dayNumber;

    const recentSession = useMemo(() => {
        if (!activePlan || !activePlan.logs || !activeSessionDay) return null;
        const dayLog = activePlan.logs.find(l => l.dayNumber === activeSessionDay);
        if (!dayLog || !dayLog.sessions || dayLog.sessions.length === 0) return null;
        // Sort sessions by date descending
        const sorted = [...dayLog.sessions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return sorted[0];
    }, [activePlan, activeSessionDay]);

    const getExerciseHistory = (exerciseId: string) => {
        if (!activePlan || !activePlan.logs) return null;
        
        const allSessions: { date: string; exLog: any }[] = [];
        activePlan.logs.forEach(dayLog => {
            dayLog.sessions?.forEach(session => {
                const exLog = session.exercises.find(e => String(e.exerciseId) === String(exerciseId));
                if (exLog) {
                    allSessions.push({ date: session.date, exLog });
                }
            });
        });

        if (allSessions.length === 0) return null;
        allSessions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        return allSessions[0];
    };

    const handleStartSession = () => {
        if (activePlan && currentDay) {
            const initialLogs: Record<string, SetLog[]> = {};
            currentDay.exercises.forEach(ex => {
                const exId = String(ex.id || ex.exercise.id);
                initialLogs[exId] = Array(Number(ex.sets) || 1).fill(null).map(() => ({ reps: '', weight: '', weightLb: '' }));
            });
            startWorkoutSession(activePlan.id, currentDay.dayNumber, initialLogs);
        }
    };

    const handleUpdateSet = (exerciseId: string, setIndex: number, field: keyof SetLog, value: string) => {
        // Permitir que el usuario ingrese comas como decimales y mantener el punto mientras teclea
        const cleanValue = value.replace(',', '.');

        setSessionLogs(prev => {
            const exerciseLogs = [...(prev[exerciseId] || [])];
            const newLog = { ...exerciseLogs[setIndex], [field]: cleanValue };

            if (field === 'weight') {
                const numValue = parseFloat(cleanValue) || 0;
                newLog.weightLb = cleanValue === '' ? '' : numValue > 0 ? parseFloat((numValue * 2.20462).toFixed(2)) : 0;
            } else if (field === 'weightLb') {
                const numValue = parseFloat(cleanValue) || 0;
                newLog.weight = cleanValue === '' ? '' : numValue > 0 ? parseFloat((numValue / 2.20462).toFixed(2)) : 0;
            }

            exerciseLogs[setIndex] = newLog;
            return { ...prev, [exerciseId]: exerciseLogs };
        });
    };

    const confirmFinish = async () => {
        if (!activePlan || activeSessionDay === null) return;
        setIsSaving(true);
        try {
            const exercises: ExerciseLog[] = Object.entries(sessionLogs).map(([exId, sets]) => ({
                exerciseId: exId,
                setLogs: sets.map(s => ({
                    ...s,
                    reps: Number(s.reps) || 0,
                    weight: Number(s.weight) || 0,
                    weightLb: Number(s.weightLb) || 0
                }))
            }));

            const durationMinutes = sessionStartTime ? Math.max(1, Math.floor((Date.now() - sessionStartTime) / 60000)) : undefined;

            const dayLog = {
                dayNumber: activeSessionDay,
                sessions: [{
                    sessionNumber: 1,
                    date: new Date().toISOString(),
                    duration: durationMinutes,
                    exercises: exercises,
                    comment: comment
                }]
            };

            await saveLog(activePlan.id, dayLog);
            await finishWorkoutSession();
        } finally {
            setIsSaving(false);
        }
    };

    const handleFinishSession = async () => {
        if (!activePlan || activeSessionDay === null) return;

        // Validation: at least one set logged?
        const hasLogs = Object.values(sessionLogs).some(sets => sets.some(s => Number(s.reps) > 0 || Number(s.weight) > 0));

        if (!hasLogs) {
            Alert.alert(
                "Sesión vacía",
                "No has registrado ninguna repetición ni peso. ¿Quieres finalizar igualmente?",
                [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Finalizar", style: "destructive", onPress: confirmFinish }
                ]
            );
        } else {
            confirmFinish();
        }
    };

    const handleBackToSession = () => {
        if (activePlan && activeSessionDay !== null) {
            const sessionDayIdx = activePlan.days.findIndex(d => d.dayNumber === activeSessionDay);
            if (sessionDayIdx !== -1) {
                setSelectedDayIdx(sessionDayIdx);
            }
        }
    };

    const BarbellPlateVisual = ({ weight }: { weight: number }) => {
        // Visual logic for plates (simplified)
        const hasPlates = weight > 0;
        return (
            <View style={styles.plateContainer}>
                <View style={[styles.barbellBar, { backgroundColor: colors.textMuted + '40' }]} />
                {hasPlates && (
                    <View style={styles.plateGroup}>
                        <View style={[styles.plate, { height: 24, width: 4, backgroundColor: '#E31C25' }]} />
                        <View style={[styles.platePlaceholder, { height: 16, width: 2, backgroundColor: colors.textMuted + '60' }]} />
                    </View>
                )}
            </View>
        );
    };

    const handleCreateGroup = async () => {
        if (!activePlan || !currentDay) return;
        if (selectedForGroup.length < 2 || selectedForGroup.length > 3) {
            Alert.alert('Error', 'Debes seleccionar 2 (Biserie) o 3 (Triserie) ejercicios.');
            return;
        }
        const supersetId = 'super_' + Date.now();
        const updatedDays = activePlan.days.map(d => {
            if (d.dayNumber === currentDay.dayNumber) {
                return {
                    ...d,
                    exercises: d.exercises.map(ex => {
                        const exId = String(ex.id || ex.exercise.id);
                        if (selectedForGroup.includes(exId)) {
                            return { ...ex, supersetId };
                        }
                        return ex;
                    })
                };
            }
            return d;
        });
        await updatePlan(activePlan.id, { days: updatedDays });
        setIsGroupingMode(false);
        setSelectedForGroup([]);
    };

    const handleRemoveGroup = async (supersetId: string) => {
        if (!activePlan || !currentDay) return;
        const updatedDays = activePlan.days.map(d => {
            if (d.dayNumber === currentDay.dayNumber) {
                return {
                    ...d,
                    exercises: d.exercises.map(ex => {
                        if (ex.supersetId === supersetId) {
                            return { ...ex, supersetId: undefined };
                        }
                        return ex;
                    })
                };
            }
            return d;
        });
        await updatePlan(activePlan.id, { days: updatedDays });
    };

    const groupedExercises = useMemo(() => {
        if (!currentDay) return [];
        const result: { isGroup: boolean; id: string; items: PlannedExercise[] }[] = [];
        let currentGroup: { id: string; isGroup: boolean; items: PlannedExercise[] } | null = null;

        currentDay.exercises.forEach(ex => {
            if (ex.supersetId) {
                if (currentGroup && currentGroup.id === ex.supersetId) {
                    currentGroup.items.push(ex);
                } else {
                    currentGroup = { id: ex.supersetId, isGroup: true, items: [ex] };
                    result.push(currentGroup);
                }
            } else {
                currentGroup = null;
                if (ex) result.push({ isGroup: false, id: String(ex.id || ex.exercise?.id), items: [ex] });
            }
        });
        return result;
    }, [currentDay]);

    const renderSingleExercise = (item: PlannedExercise, isInsideGroup: boolean = false) => {
        if (!item) return null;
        const exerciseId = String(item.id || item.exercise?.id);
        const logs = sessionLogs[exerciseId] || [];
        const isHistoryExpanded = !!expandedHistory[exerciseId];
        const exerciseHistory = getExerciseHistory(exerciseId);

        // Fetch the full exercise from the library to ensure we have the videoUrl
        const fullExerciseDef = allExercises.find(e => 
            String(e.id) === String(item.exercise?.id) || 
            (e.name && item.exercise?.name && e.name.toLowerCase() === item.exercise.name.toLowerCase())
        );
        const finalVideoUrl = item.exercise?.videoUrl || fullExerciseDef?.videoUrl;

        return (
            <View style={styles.exerciseContainerDark}>
                {finalVideoUrl ? (
                    finalVideoUrl.toLowerCase().includes('.mp4') ? (
                        <Video
                            source={{ uri: finalVideoUrl.startsWith('http') ? finalVideoUrl : `${API_HOST}${finalVideoUrl.startsWith('/') ? '' : '/'}${finalVideoUrl}` }}
                            style={{ width: '100%', height: 250, borderRadius: 16, marginBottom: 16, backgroundColor: '#0F172A' }}
                            useNativeControls
                            resizeMode={ResizeMode.CONTAIN}
                            isLooping
                        />
                    ) : (
                        <Image
                            source={{ uri: finalVideoUrl.startsWith('http') ? finalVideoUrl : `${API_HOST}${finalVideoUrl.startsWith('/') ? '' : '/'}${finalVideoUrl}` }}
                            style={{ width: '100%', height: 250, borderRadius: 16, marginBottom: 16, backgroundColor: '#0F172A' }}
                            contentFit="contain"
                        />
                    )
                ) : null}
                <View style={styles.exerciseTitleRowDark}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.exerciseTitleDark}>{item.exercise.name}</Text>
                        <Text style={styles.exerciseSubtitleDark}>ENFOQUE: {(item.exercise.muscleGroup || 'CUÁDRICEPS Y GLÚTEOS').toUpperCase()}</Text>
                        <Text style={{ color: '#94A3B8', fontSize: 13, marginTop: 4, fontWeight: '500' }}>
                            {item.sets} series {item.minReps}-{item.maxReps} reps {item.instruction ? `• ${item.instruction}` : ''}
                        </Text>
                    </View>
                    <View style={{ alignItems: 'center', marginLeft: 10 }}>
                        <Text style={{ color: Colors.textMuted, fontSize: 10, marginBottom: 4, fontWeight: '600' }}>Descanso (s)</Text>
                        <TextInput
                            style={{
                                backgroundColor: Colors.surface,
                                color: '#fff',
                                borderRadius: 6,
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                fontSize: 13,
                                width: 55,
                                textAlign: 'center',
                                borderWidth: 1,
                                borderColor: Colors.outline
                            }}
                            keyboardType="number-pad"
                            placeholder="90"
                            placeholderTextColor={Colors.textMuted}
                            value={restTimes[exerciseId] || ''}
                            onChangeText={(val) => setRestTimes(prev => ({ ...prev, [exerciseId]: val }))}
                        />
                    </View>
                </View>

                {/* Historial Expandible */}
                {exerciseHistory && (
                    <View style={{ marginHorizontal: 0, marginBottom: 16, backgroundColor: Colors.surface_lowest, borderRadius: 12, overflow: 'hidden' }}>
                        <TouchableOpacity 
                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12 }}
                            onPress={() => setExpandedHistory(prev => ({ ...prev, [exerciseId]: !isHistoryExpanded }))}
                        >
                            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Timer size={14} color="#94A3B8" style={{ marginRight: 6 }} />
                                <Text style={{ color: '#94A3B8', fontSize: 13, fontWeight: '700' }}>ÚLTIMA SESIÓN: {new Date(exerciseHistory.date).toLocaleDateString()}</Text>
                            </View>
                            {isHistoryExpanded ? <ChevronUp size={18} color="#94A3B8" /> : <ChevronDown size={18} color="#94A3B8" />}
                        </TouchableOpacity>
                        
                        {isHistoryExpanded && (
                            <View style={{ paddingHorizontal: 12, paddingBottom: 12, paddingTop: 4 }}>
                                {exerciseHistory.exLog.setLogs.map((set: any, sIdx: number) => (
                                    <View key={sIdx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: sIdx < exerciseHistory.exLog.setLogs.length - 1 ? 1 : 0, borderBottomColor: Colors.outline }}>
                                        <Text style={{ color: '#E2E8F0', fontSize: 13 }}>Serie {sIdx + 1}</Text>
                                        <Text style={{ color: '#2BB0FF', fontSize: 13, fontWeight: '700' }}>{set.reps} reps, {set.weight} kg {set.weight ? `(${ (Number(set.weight) * 2.20462).toFixed(1) } lb)` : ''}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                )}

                {logs.map((log, idx) => {
                    const actualIdx = idx;
                    const isCompleted = completedSets[`${exerciseId} -${actualIdx} `];
                    return (
                        <View key={`effective - ${idx} `} style={[styles.setRowDark, isCompleted && styles.setRowCompleted]}>
                            <Text style={[styles.setNumberTextDark, isCompleted && { color: Colors.primary }]}>{actualIdx + 1}</Text>
                            <View style={styles.inputGroupDark}>
                                <Text style={styles.inputLabelDark}>peso (KG)</Text>
                                <TextInput
                                    style={[styles.inputBoxDark, isCompleted && styles.inputBoxCompleted]}
                                    value={log.weight !== undefined && log.weight !== null && log.weight !== '' ? String(log.weight) : ''}
                                    keyboardType="decimal-pad"
                                    onChangeText={(val) => handleUpdateSet(exerciseId, actualIdx, 'weight', val)}
                                    placeholder="--"
                                    placeholderTextColor="#0F172A"
                                />
                            </View>
                            <View style={styles.inputGroupDark}>
                                <Text style={styles.inputLabelDark}>peso (LB)</Text>
                                <TextInput
                                    style={[styles.inputBoxDark, isCompleted && styles.inputBoxCompleted]}
                                    value={log.weightLb !== undefined && log.weightLb !== null && log.weightLb !== '' ? String(log.weightLb) : ''}
                                    keyboardType="decimal-pad"
                                    onChangeText={(val) => handleUpdateSet(exerciseId, actualIdx, 'weightLb', val)}
                                    placeholder="--"
                                    placeholderTextColor="#0F172A"
                                />
                            </View>
                            <View style={styles.inputGroupDark}>
                                <Text style={styles.inputLabelDark}>reps</Text>
                                <TextInput
                                    style={[styles.inputBoxDark, isCompleted && styles.inputBoxCompleted]}
                                    value={log.reps !== undefined && log.reps !== null && log.reps !== '' ? String(log.reps) : ''}
                                    keyboardType="decimal-pad"
                                    onChangeText={(val) => handleUpdateSet(exerciseId, actualIdx, 'reps', val)}
                                    placeholder="--"
                                    placeholderTextColor="#0F172A"
                                />
                            </View>
                            <TouchableOpacity
                                style={[styles.checkBtnDark, isCompleted && styles.checkBtnCompleted]}
                                onPress={() => {
                                    const key = `${exerciseId} -${actualIdx} `;
                                    setCompletedSets(prev => {
                                        const nextStatus = !prev[key];
                                        if (nextStatus) {
                                            const customRest = parseInt(restTimes[exerciseId]) || 90;
                                            setActiveTimerSeconds(customRest);
                                            setTimeout(() => setTimerVisible(true), 50);
                                        }
                                        return { ...prev, [key]: nextStatus };
                                    });
                                }}
                            >
                                {isCompleted ? <CheckCheck size={16} color="#000" /> : <Check size={14} color="#334155" />}
                            </TouchableOpacity>
                        </View>
                    );
                })}

                <TouchableOpacity
                    style={styles.addSerieBtnDark}
                    onPress={() => {
                        setSessionLogs(prev => {
                            const current = prev[exerciseId] || [];
                            return { ...prev, [exerciseId]: [...current, { reps: '', weight: '', weightLb: '' }] };
                        });
                    }}
                >
                    <Plus size={14} color="#2BB0FF" />
                    <Text style={styles.addSerieTextDark}>AGREGAR SERIE</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const renderGroupItem = ({ item }: { item: { isGroup: boolean; id: string; items: PlannedExercise[] } }) => {
        if (!item.isGroup) {
            const ex = item.items[0];
            const exId = String(ex.id || ex.exercise.id);
            const isSelected = selectedForGroup.includes(exId);

            return (
                <View style={{ marginBottom: 24, paddingHorizontal: isGroupingMode ? Spacing.sm : 0 }}>
                    {isGroupingMode && (
                        <TouchableOpacity
                            style={[styles.groupCheckbox, isSelected && styles.groupCheckboxActive]}
                            onPress={() => setSelectedForGroup(prev =>
                                prev.includes(exId) ? prev.filter(id => id !== exId) : [...prev, exId]
                            )}
                        >
                            <View style={[styles.checkboxInner, isSelected && { backgroundColor: '#CCFF00' }]} />
                        </TouchableOpacity>
                    )}
                    {renderSingleExercise(ex)}
                </View>
            );
        }

        const isTriserie = item.items.length >= 3;

        return (
            <View style={styles.supersetContainer}>
                <View style={styles.supersetHeader}>
                    <Text style={styles.supersetTitle}>{isTriserie ? 'TRISERIE' : 'BISERIE'}</Text>
                    {isSessionActive && (
                        <TouchableOpacity onPress={() => handleRemoveGroup(item.id)} style={styles.ungroupBtn}>
                            <Text style={styles.ungroupBtnText}>Desagrupar</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.supersetContent}>
                    {item.items.map((ex, idx) => (
                        <View key={String(ex.id || ex.exercise.id)}>
                            {renderSingleExercise(ex, true)}
                            {idx < item.items.length - 1 && (
                                <View style={styles.supersetDivider} />
                            )}
                        </View>
                    ))}
                </View>
            </View>
        );
    };

    if (!activePlan) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl }]}>
                <CalendarDays size={48} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Sin plan activo</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>No hemos encontrado un plan de entrenamiento activo para ti.</Text>
            </View>
        );
    }

    if (!isSessionActive) {
        return (
            <View style={{ flex: 1, backgroundColor: Colors.background }}>
                <View style={styles.topNavDark}>
                    <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.navBtn}>
                        <ArrowLeft size={24} color="#F8FAFC" />
                    </TouchableOpacity>
                    <Text style={styles.navTitleDark}>Tus Planes</Text>
                    <View style={{ width: 40 }} />
                </View>

                <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 10 }}>

                    {userPlans.length > 1 && (
                        <View style={{ marginBottom: 20 }}>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                                {userPlans.map(plan => (
                                    <TouchableOpacity
                                        key={plan.id}
                                        style={{
                                            paddingHorizontal: 16,
                                            paddingVertical: 8,
                                            borderRadius: 20,
                                            backgroundColor: activePlan.id === plan.id ? Colors.primary : Colors.surface,
                                            marginRight: 10
                                        }}
                                        onPress={() => { setSelectedPlanId(plan.id); setSelectedDayIdx(0); }}
                                    >
                                        <Text style={{
                                            fontFamily: Fonts.headline,
                                            fontSize: 14,
                                            fontWeight: '700',
                                            color: activePlan.id === plan.id ? '#000' : Colors.textMuted
                                        }}>
                                            {plan.month} {plan.year}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    )}

                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ gap: 16, paddingBottom: Math.max(120, insets.bottom + 100) }}
                        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                    >
                        {activePlan.days.map((day, idx) => {
                            const isSelected = selectedDayIdx === idx;
                            return (
                                <TouchableOpacity
                                    key={day.dayNumber}
                                    style={[
                                        { backgroundColor: Colors.surface, padding: 20, borderRadius: 16, borderWidth: 0, borderColor: Colors.surface_lowest },
                                        isSelected && { borderColor: Colors.primary, backgroundColor: Colors.primary_container }
                                    ]}
                                    onPress={() => setSelectedDayIdx(idx)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={{ fontFamily: Fonts.headline, fontSize: 18, fontWeight: '800', color: isSelected ? '#000' : '#FFF', marginBottom: 4 }}>
                                        {(() => {
                                            let base = day.label;
                                            let arr = day.muscleGroups || [];

                                            if (arr.length === 0) {
                                                const muscles = new Set<string>();
                                                day.exercises.forEach(pe => {
                                                    if (pe.exercise.muscleGroup) muscles.add(pe.exercise.muscleGroup);
                                                });
                                                arr = Array.from(muscles);
                                            }

                                            if (arr.length > 0 && !base.includes('—') && !base.includes('(')) {
                                                base += ` (${arr.join(', ')})`;
                                            }
                                            return base;
                                        })()}
                                    </Text>
                                    <Text style={{ fontFamily: Fonts.body, fontSize: 13, color: isSelected ? '#000' : Colors.textMuted, fontWeight: '500' }}>
                                        {day.exercises.length} Ejercicios disponibles
                                    </Text>
                                    {isSelected && day.exercises.length > 0 && (
                                        <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)' }}>
                                            {day.exercises.map((pe, exIdx) => (
                                                <Text key={pe.exercise.id} style={{ fontFamily: Fonts.body, fontSize: 13, color: '#000', marginBottom: 4 }} numberOfLines={1}>
                                                    • {pe.exercise.name} <Text style={{ color: 'rgba(0,0,0,0.6)' }}>({pe.sets}x{pe.minReps}-{pe.maxReps})</Text>
                                                </Text>
                                            ))}
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    <View style={{ position: 'absolute', bottom: 40, left: 20, right: 20 }}>
                        <TouchableOpacity
                            style={[styles.submitBtnDark, { shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }]}
                            onPress={handleStartSession}
                        >
                            <Text style={styles.submitBtnTextDark}>COMENZAR ENTRENAMIENTO</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
            <View style={styles.topNavDark}>
                <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.navBtn}>
                    <ArrowLeft size={24} color="#F8FAFC" />
                </TouchableOpacity>
                <Text style={[styles.navTitleDark, { flex: 1, marginHorizontal: 8 }]} numberOfLines={1}>
                    {(() => {
                        let base = currentDay?.label || 'Día de Entrenamiento';
                        if (currentDay && !base.includes('—') && !base.includes('(')) {
                            let arr = currentDay.muscleGroups || [];
                            if (arr.length === 0) {
                                const muscles = new Set<string>();
                                currentDay.exercises.forEach(pe => {
                                    if (pe.exercise.muscleGroup) muscles.add(pe.exercise.muscleGroup);
                                });
                                arr = Array.from(muscles);
                            }
                            if (arr.length > 0) {
                                base += ` (${arr.join(', ')})`;
                            }
                        }
                        return base;
                    })()}
                </Text>

                <SessionTimer sessionStartTime={sessionStartTime} durationRef={sessionDurationRef} />

                {pendingOfflineLogs > 0 && (
                    <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#eab308', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 8 }}
                        onPress={() => {
                            showToast.info('Sincronizando entrenamientos pendientes...');
                            syncOfflineLogs();
                        }}
                    >
                        <CloudAlert size={14} color="#000" />
                        <Text style={{ fontSize: 12, fontWeight: '700', marginLeft: 4, color: '#000' }}>{pendingOfflineLogs}</Text>
                    </TouchableOpacity>
                )}

                <TouchableOpacity
                    style={styles.navBtn}
                    onPress={() => {
                        const options: any[] = [];
                        if (recentSession) {
                            options.push({ text: "Ver última sesión", onPress: () => setShowRecentSessionModal(true) });
                        }
                        options.push({ text: "Cancelar sesión", style: "destructive", onPress: discardWorkoutSession });
                        options.push({ text: "Volver", style: "cancel" });

                        Alert.alert(
                            "Opciones de Sesión",
                            "¿Qué deseas hacer?",
                            options
                        );
                    }}
                >
                    <MoreVertical size={24} color="#F8FAFC" />
                </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
                {/* Carrusel superior de ejercicios */}
                {currentDay && currentDay.exercises.length > 0 && (
                    <View style={{ paddingVertical: 12, backgroundColor: Colors.background }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}>
                            {currentDay.exercises.map((pe, index) => {
                                const isSelected = index === activeExerciseIndex;
                                return (
                                    <TouchableOpacity
                                        key={index}
                                        style={[{
                                            width: 64,
                                            height: 64,
                                            borderRadius: 12,
                                            backgroundColor: Colors.surface,
                                            overflow: 'hidden',
                                            borderWidth: 2,
                                            borderColor: isSelected ? '#2BB0FF' : 'transparent'
                                        }]}
                                        onPress={() => setActiveExerciseIndex(index)}
                                    >
                                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                                            <Dumbbell size={24} color={isSelected ? '#2BB0FF' : Colors.textMuted} />
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                )}

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
                >
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 120 }}
                    >


                        {/* Ejercicio Activo */}
                        {currentDay && currentDay.exercises.length > 0 ? (
                            <View>
                                <FlatList
                                    ref={exercisesListRef}
                                    data={currentDay.exercises}
                                    horizontal
                                    pagingEnabled
                                    showsHorizontalScrollIndicator={false}
                                    keyExtractor={(item, idx) => `exercise-page-${item.id || idx}`}
                                    onMomentumScrollEnd={(e) => {
                                        const newIndex = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
                                        if (newIndex !== activeExerciseIndex) {
                                            setActiveExerciseIndex(newIndex);
                                        }
                                    }}
                                    getItemLayout={(data, index) => ({
                                        length: SCREEN_WIDTH,
                                        offset: SCREEN_WIDTH * index,
                                        index,
                                    })}
                                    renderItem={({ item }) => (
                                        <View style={{ width: SCREEN_WIDTH }}>
                                            {renderSingleExercise(item)}
                                        </View>
                                    )}
                                />
                            </View>
                        ) : (
                            <View style={styles.emptyExercises}>
                                <Dumbbell size={32} color={colors.textMuted} />
                                <Text style={[styles.emptyExercisesText, { color: colors.textMuted }]}>
                                    No hay ejercicios asignados para este día.
                                </Text>
                            </View>
                        )}

                        {/* Comentarios de la sesión */}
                        {currentDay && currentDay.exercises.length > 0 && (
                            <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
                                <Text style={styles.footerTitleDark}>COMENTARIOS DE LA SESIÓN</Text>
                                <TextInput
                                    style={styles.commentInputDark}
                                    placeholder="Escribe cómo te sentiste, molestias o mejoras para la próxima sesión..."
                                    placeholderTextColor="#334155"
                                    multiline
                                    value={comment}
                                    onChangeText={setComment}
                                />
                            </View>
                        )}
                    </ScrollView>
                </KeyboardAvoidingView>

                {/* Botón Guardar Sesión Fijo */}
                {currentDay && currentDay.exercises.length > 0 && (
                    <View style={{ position: 'absolute', bottom: Platform.OS === 'ios' ? 30 : 20, left: 16, right: 16 }}>
                        <TouchableOpacity
                            style={[{ backgroundColor: '#FFF', borderRadius: 12, height: 56, justifyContent: 'center', alignItems: 'center', shadowColor: '#FFF', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } }, isSaving && { opacity: 0.7 }]}
                            onPress={handleFinishSession}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <ActivityIndicator color="#000" />
                            ) : (
                                <Text style={{ color: '#000', fontFamily: Fonts.headline, fontSize: 16, fontWeight: '900', letterSpacing: 1 }}>GUARDAR SESIÓN</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            <RestTimerModal
                visible={isTimerVisible}
                onClose={() => setTimerVisible(false)}
                initialSeconds={activeTimerSeconds}
            />

            {/* Modal de Última Sesión */}
            <Modal visible={showRecentSessionModal} animationType="fade" transparent={true}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', padding: 20 }}>
                    <View style={{ backgroundColor: Colors.background, borderRadius: 16, padding: 20, maxHeight: '80%', borderWidth: 1, borderColor: Colors.surface }}>
                        <Text style={{ color: '#FFF', fontSize: 18, fontWeight: 'bold', marginBottom: 16 }}>Última sesión realizada</Text>
                        
                        {!recentSession ? (
                            <Text style={{ color: Colors.textMuted }}>No hay registros de una sesión anterior para este día.</Text>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <Text style={{ color: '#94A3B8', marginBottom: 12, fontWeight: '500' }}>
                                    Fecha: {new Date(recentSession.date).toLocaleDateString()}
                                </Text>
                                {recentSession.exercises.map((exLog, idx) => {
                                    let exerciseName = 'Ejercicio desconocido';
                                    const plannedEx = currentDay?.exercises.find(pe => String(pe.id || pe.exercise.id) === String(exLog.exerciseId));
                                    if (plannedEx) {
                                        exerciseName = plannedEx.exercise.name;
                                    } else {
                                        const globalEx = allExercises.find(e => String(e.id) === String(exLog.exerciseId));
                                        if (globalEx) exerciseName = globalEx.name;
                                    }
                                    return (
                                        <View key={idx} style={{ marginBottom: 16, backgroundColor: Colors.surface, padding: 12, borderRadius: 12 }}>
                                            <Text style={{ color: '#2BB0FF', fontWeight: 'bold', marginBottom: 8, fontSize: 15 }}>{exerciseName}</Text>
                                            {exLog.setLogs.map((set, sIdx) => (
                                                <Text key={sIdx} style={{ color: '#FFF', fontSize: 13, marginBottom: 4 }}>
                                                    Serie {sIdx + 1}: {set.reps} reps, {set.weight} kg {set.weight ? `(${ (Number(set.weight) * 2.20462).toFixed(1) } lb)` : ''}
                                                </Text>
                                            ))}
                                        </View>
                                    );
                                })}
                            </ScrollView>
                        )}
                        
                        <TouchableOpacity 
                            style={{ marginTop: 20, backgroundColor: '#0F172A', paddingVertical: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' }}
                            onPress={() => setShowRecentSessionModal(false)}
                        >
                            <Text style={{ color: '#FFF', fontWeight: '600' }}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    daySelectorWrapper: {
        borderBottomWidth: 0,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    daysScroll: {
        flexGrow: 0,
    },
    dayTab: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        marginHorizontal: Spacing.xs,
    },
    dayTabText: {
        fontFamily: Fonts.headline, fontSize: 14,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    header: {
        padding: Spacing.md,
        paddingTop: Spacing.md,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    planInfo: {
        fontFamily: Fonts.body, fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    dayTitle: {
        fontFamily: Fonts.display, fontSize: 22,
        fontWeight: '800',
    },
    startButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: borderRadius.full,
    },
    startButtonText: {
        color: '#000',
        fontWeight: '600',
        marginLeft: Spacing.xs,
    },
    mainButton: {
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    mainButtonText: {
        color: '#000',
        fontFamily: Fonts.headline, fontSize: 16,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    listContent: {
        paddingBottom: 40,
    },
    exerciseContainer: {
        marginBottom: 24,
    },
    exerciseImage: {
        height: 250,
        width: '100%',
    },
    imageOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    exerciseContent: {
        paddingHorizontal: Spacing.md,
        marginTop: -60,
    },
    exerciseTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    exerciseTitle: {
        fontFamily: Fonts.display, fontSize: 24,
        fontWeight: '900',
        flex: 1,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        marginTop: 8,
    },
    sectionTitle: {
        fontFamily: Fonts.headline, fontSize: 18,
        fontWeight: '800',
    },
    hideAction: {
        fontFamily: Fonts.headline, fontSize: 16,
        fontWeight: '700',
    },
    logTableHeader: {
        flexDirection: 'row',
        paddingHorizontal: 4,
        marginBottom: 8,
    },
    columnLabel: {
        fontFamily: Fonts.body, fontSize: 12,
        fontWeight: '700',
        flex: 1,
        textAlign: 'center',
    },
    logRowStylized: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    setNumberBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    setNumberText: {
        fontFamily: Fonts.headline, fontSize: 18,
        fontWeight: '900',
    },
    inputStylized: {
        flex: 1.5,
        height: 48,
        borderRadius: 12,
        textAlign: 'center',
        fontFamily: Fonts.display, fontSize: 20,
        fontWeight: '900',
    },
    plateContainer: {
        width: 40,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
    },
    barbellBar: {
        height: 2,
        width: 30,
        borderRadius: 1,
        position: 'absolute',
    },
    plateGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1,
    },
    plate: {
        borderRadius: 1,
    },
    platePlaceholder: {
        borderRadius: 0.5,
    },
    addSerieBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        gap: 12,
    },
    plusCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addSerieText: {
        fontFamily: Fonts.headline, fontSize: 16,
        fontWeight: '700',
    },
    emptyTitle: {
        fontFamily: Fonts.display, fontSize: 20,
        fontWeight: '800',
        marginTop: 16,
    },
    emptySub: {
        fontFamily: Fonts.headline, fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
    },
    emptyExercises: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
        gap: 12,
    },
    emptyExercisesText: {
        fontFamily: Fonts.headline, fontSize: 14,
        fontWeight: '500',
    },
    sessionDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginLeft: 2,
    },
    sessionNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: 8,
        marginHorizontal: Spacing.md,
        borderRadius: borderRadius.md,
        marginBottom: Spacing.sm,
        gap: 8,
    },
    sessionNoticeText: {
        fontFamily: Fonts.body, fontSize: 12,
        fontWeight: '700',
    },
    // ── Grouping UI Styles ──────────────────────────────────────────
    groupCheckbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: Colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        top: 20,
        right: 16,
        zIndex: 10,
        backgroundColor: Colors.cardBg,
    },
    groupCheckboxActive: {
        borderColor: Colors.surface_lowest,
    },
    checkboxInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    supersetContainer: {
        marginHorizontal: Spacing.md,
        marginBottom: 24,
        borderRadius: borderRadius.lg,
        borderWidth: 2,
        borderColor: Colors.surface_lowest,
        backgroundColor: Colors.cardBg,
        overflow: 'hidden',
    },
    supersetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(204, 255, 0, 0.15)',
        paddingHorizontal: Spacing.md,
        paddingVertical: 10,
    },
    supersetTitle: {
        fontFamily: Fonts.headline, fontSize: 16,
        fontWeight: '900',
        color: '#CCFF00',
        letterSpacing: 1,
    },
    ungroupBtn: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: borderRadius.sm,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    ungroupBtnText: {
        fontFamily: Fonts.body, fontSize: 12,
        fontWeight: '700',
        color: Colors.text,
    },
    supersetContent: {
        paddingTop: Spacing.md,
    },
    supersetDivider: {
        height: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        marginVertical: Spacing.sm,
    },
    groupModeBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.md,
        gap: 12,
    },
    startGroupBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(204, 255, 0, 0.15)',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: borderRadius.full,
        borderWidth: 0,
        borderColor: Colors.surface_lowest,
    },
    startGroupText: {
        fontFamily: Fonts.headline, fontSize: 14,
        fontWeight: '700',
        color: '#CCFF00',
    },
    cancelGroupBtn: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: borderRadius.full,
        backgroundColor: Colors.surface,
        borderWidth: 0,
        borderColor: Colors.border,
    },
    cancelGroupText: {
        fontFamily: Fonts.headline, fontSize: 14,
        fontWeight: '600',
        color: Colors.text,
    },
    confirmGroupBtn: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: borderRadius.full,
    },
    confirmGroupText: {
        fontFamily: Fonts.headline, fontSize: 14,
        fontWeight: '800',
    },
    // ── DARK THEME STYLES (Mockup) ─────────────────────────
    topNavDark: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: Spacing.md,
        backgroundColor: Colors.background,
        borderBottomWidth: 0,
        borderBottomColor: '#1E293B',
    },
    navBtn: {
        padding: 8,
    },
    navTitleDark: {
        fontFamily: Fonts.display, fontSize: 20,
        fontWeight: '800',
        color: Colors.primary,
        letterSpacing: 0.5,
    },
    listContentDark: {
        paddingTop: Spacing.lg,
        paddingBottom: 40,
    },
    exerciseContainerDark: {
        marginBottom: 24,
        backgroundColor: Colors.surface_container,
        borderRadius: 12,
        padding: Spacing.md,
        marginHorizontal: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.outline,
    },
    exerciseTitleRowDark: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    exerciseTitleDark: {
        fontFamily: Fonts.headline, fontSize: 18,
        fontWeight: '800',
        color: Colors.text,
        marginBottom: 4,
    },
    exerciseSubtitleDark: {
        fontFamily: Fonts.body, fontSize: 10,
        fontWeight: '600',
        color: Colors.textMuted,
        letterSpacing: 1,
    },
    setRowDark: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        backgroundColor: Colors.surface,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: Colors.outline,
    },
    setRowCompleted: {
        borderColor: Colors.primary,
        backgroundColor: Colors.surface_high,
    },
    setNumberTextDark: {
        fontFamily: Fonts.headline, fontSize: 18,
        fontWeight: '900',
        color: Colors.textMuted,
        width: 30,
        textAlign: 'center',
    },
    inputGroupDark: {
        flex: 1,
        marginHorizontal: 8,
    },
    inputLabelDark: {
        fontFamily: Fonts.body, fontSize: 10,
        fontWeight: '600',
        color: Colors.textMuted,
        marginBottom: 4,
    },
    inputBoxDark: {
        backgroundColor: Colors.surface_lowest,
        color: Colors.text,
        fontFamily: Fonts.headline, fontSize: 16,
        fontWeight: '800',
        textAlign: 'center',
        borderRadius: 4,
        height: 40,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    inputBoxCompleted: {
        borderBottomColor: Colors.primary,
    },
    checkBtnDark: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: Colors.surface_low,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkBtnCompleted: {
        backgroundColor: Colors.primary,
    },
    addSerieBtnDark: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: Colors.outline,
    },
    addSerieTextDark: {
        fontFamily: Fonts.body, fontSize: 12,
        fontWeight: '800',
        color: Colors.primary,
        marginLeft: 8,
        letterSpacing: 1,
    },
    footerDark: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.xl,
        paddingBottom: 60,
    },
    footerTitleDark: {
        fontFamily: Fonts.body, fontSize: 12,
        fontWeight: '800',
        color: Colors.textMuted,
        marginBottom: 12,
        letterSpacing: 1,
    },
    commentInputDark: {
        backgroundColor: Colors.surface_lowest,
        color: Colors.text,
        borderRadius: 12,
        padding: 16,
        minHeight: 120,
        textAlignVertical: 'top',
        fontFamily: Fonts.headline, fontSize: 14,
        borderWidth: 0,
        borderColor: Colors.surface_lowest,
        marginBottom: 24,
    },
    submitBtnDark: {
        backgroundColor: Colors.primary,
        borderRadius: 12,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
    },
    submitBtnTextDark: {
        color: '#000',
        fontFamily: Fonts.headline, fontSize: 16,
        fontWeight: '900',
        letterSpacing: 1,
    },
});
