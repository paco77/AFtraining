import { MonthlyPlan, PlannedExercise } from '@/constants/PlanTypes';
import { Colors, Spacing } from '@/constants/theme';
import { useUser } from '@/context/UserContext';
import api from '@/services/api';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
    ArrowLeft,
    ChevronDown,
    ChevronUp,
    ClipboardList,
    Dumbbell,
    Target,
    TrendingUp,
    User
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

export default function PlanDetails() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { clients, currentUser } = useUser();

    const [plan, setPlan] = useState<MonthlyPlan | null>(null);
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedSessions, setExpandedSessions] = useState<Set<number>>(new Set());
    const [expandedDays, setExpandedDays] = useState<Set<number>>(new Set([1])); // Day 1 expanded by default

    const client = useMemo(() => {
        if (!plan) return null;
        return clients.find(c => c.id === plan.assignedClientId);
    }, [clients, plan]);

    const fetchData = useCallback(async () => {
        if (!id) return;
        try {
            setLoading(true);
            const planRes = await api.get(`plans/${id}`);
            const planData = planRes.data.data;

            // Map plan data from snake_case to camelCase
            const mappedPlan: MonthlyPlan = {
                id: String(planData.id),
                month: planData.month,
                year: planData.year,
                assignedClientId: String(planData.assigned_client_id),
                daysPerWeek: planData.days_per_week,
                splitType: planData.split_type,
                days: (planData.training_days || []).map((td: any) => ({
                    id: String(td.id),
                    dayNumber: td.day_number,
                    label: td.label,
                    muscleGroups: td.muscle_groups || [],
                    exercises: (td.planned_exercises || []).map((pe: any) => ({
                        id: String(pe.id),
                        exercise: {
                            id: String(pe.exercise?.id),
                            name: pe.exercise?.name || 'Ejercicio',
                            muscleGroup: pe.exercise?.muscle_group || 'Core',
                            isCustom: !!pe.exercise?.is_custom
                        },
                        sets: pe.sets,
                        minReps: pe.min_reps,
                        maxReps: pe.max_reps,
                        instruction: pe.instruction
                    }))
                }))
            };

            setPlan(mappedPlan);

            // Fetch history. If user is coach, we must specify client_id
            const params: any = {};
            if (currentUser?.role === 'coach' || currentUser?.role === 'admin') {
                params.client_id = mappedPlan.assignedClientId;
            }
            
            const historyResponse = await api.get('workouts/history', { params });

            const allHistory = historyResponse.data.data || [];
            console.log(`[Debug] Fetched ${allHistory.length} total sessions for client ${mappedPlan.assignedClientId}`);

            // For now, let's show ALL history to ensure the coach sees something
            // We'll mark sessions that belong to this plan
            const enrichedHistory = allHistory.map((session: any) => {
                const sPlanId = session.training_day?.monthly_plan_id ||
                    session.trainingDay?.monthly_plan_id ||
                    session.training_day?.monthlyPlanId ||
                    session.trainingDay?.monthlyPlanId;
                return {
                    ...session,
                    isFromCurrentPlan: String(sPlanId) === String(id)
                };
            });

            setHistory(enrichedHistory);

            if (enrichedHistory.length === 0) {
                console.warn("[Debug] No sessions found for client:", mappedPlan.assignedClientId);
            }
        } catch (error: any) {
            console.error('Error fetching plan details:', error.response?.data || error);
            if (error.response?.status === 403) {
                console.warn("[Debug] Authorization error fetching history for client");
            }
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const toggleDay = (dayNumber: number) => {
        const newExpanded = new Set(expandedDays);
        if (newExpanded.has(dayNumber)) {
            newExpanded.delete(dayNumber);
        } else {
            newExpanded.add(dayNumber);
        }
        setExpandedDays(newExpanded);
    };

    const toggleSession = (sessionId: number) => {
        const newExpanded = new Set(expandedSessions);
        if (newExpanded.has(sessionId)) {
            newExpanded.delete(sessionId);
        } else {
            newExpanded.add(sessionId);
        }
        setExpandedSessions(newExpanded);
    };

    const getExerciseHistory = (plannedExerciseId: string) => {
        // Find all logs for this specific planned exercise across history
        const logs: any[] = [];
        history.forEach(session => {
            session.exercise_logs?.forEach((exLog: any) => {
                if (String(exLog.planned_exercise?.id) === String(plannedExerciseId)) {
                    logs.push({
                        date: session.start_time,
                        sets: exLog.setLogs || exLog.set_logs || exLog.sets || []
                    });
                }
            });
        });
        return logs;
    };

    const renderExercise = (pe: PlannedExercise) => {
        const exerciseHistory = getExerciseHistory(String(pe.id));
        const lastSession = exerciseHistory.length > 0 ? exerciseHistory[0] : null;

        return (
            <View key={pe.id} style={styles.exerciseCard}>
                <View style={styles.exerciseHeader}>
                    <View style={styles.exerciseIconBg}>
                        <Dumbbell size={16} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.exerciseName}>{pe.exercise.name}</Text>
                        <Text style={styles.exerciseMuscle}>{pe.exercise.muscleGroup}</Text>
                    </View>
                    <View style={styles.targetBadge}>
                        <Target size={12} color={Colors.accent} />
                        <Text style={styles.targetText}>{pe.sets}x{pe.minReps}-{pe.maxReps}</Text>
                    </View>
                </View>

                {pe.instruction && (
                    <Text style={styles.instructionText}>{pe.instruction}</Text>
                )}

                {exerciseHistory.length > 0 ? (
                    <View style={styles.historySection}>
                        <View style={styles.historyLabelRow}>
                            <TrendingUp size={12} color={Colors.primary} />
                            <Text style={styles.historyLabel}>Último registro ({new Date(lastSession.date).toLocaleDateString()}):</Text>
                        </View>
                        <View style={styles.setsList}>
                            {lastSession.sets.map((set: any, idx: number) => (
                                <View key={idx} style={[styles.setInfo, { backgroundColor: Colors.surfaceLight }]}>
                                    <Text style={styles.setNumber}>S{set.set_number}</Text>
                                    <View style={styles.setMetrics}>
                                        <Text style={styles.metricValue}>{set.reps} <Text style={styles.metricLabel}>reps</Text></Text>
                                        <View style={styles.metricDivider} />
                                        <Text style={styles.metricValue}>{set.weight} <Text style={styles.metricLabel}>kg</Text></Text>
                                    </View>
                                </View>
                            ))}
                        </View>
                    </View>
                ) : (
                    <View style={styles.noHistoryBadge}>
                        <Text style={styles.noHistoryText}>Sin registros todavía</Text>
                    </View>
                )}
            </View>
        );
    };

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.loadingText}>Cargando detalles del plan...</Text>
            </View>
        );
    }

    if (!plan) {
        return (
            <View style={styles.centered}>
                <Text style={styles.errorText}>No se pudo cargar el plan</Text>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>Volver</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{
                headerShown: true,
                headerTitle: 'Detalle del Plan',
                headerTransparent: true,
                headerTintColor: '#fff',
                headerLeft: () => (
                    <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
                        <ArrowLeft size={24} color="#fff" />
                    </TouchableOpacity>
                ),
            }} />
            <StatusBar barStyle="light-content" />

            <View style={styles.topHeader}>
                <View style={styles.planSummary}>
                    <View style={styles.planIconCircle}>
                        <ClipboardList size={28} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.planTitleMain}>{plan.month} {plan.year}</Text>
                        <View style={styles.clientRow}>
                            <User size={14} color={Colors.textMuted} />
                            <Text style={styles.clientNameText}>{client?.name || 'Cargando cliente...'}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.planMetaGrid}>
                    <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>Frecuencia</Text>
                        <Text style={styles.metaValue}>{plan.daysPerWeek} días/sem</Text>
                    </View>
                    <View style={styles.metaDivider} />
                    <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>División</Text>
                        <Text style={styles.metaValue}>{plan.splitType}</Text>
                    </View>
                    <View style={styles.metaDivider} />
                    <View style={styles.metaItem}>
                        <Text style={styles.metaLabel}>Progreso</Text>
                        <Text style={styles.metaValue}>{history.length} sesiones</Text>
                        <Text style={{ fontSize: 8, color: Colors.textMuted }}>ID:{id}</Text>
                    </View>
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                <Text style={styles.sectionTitle}>Estructura de Entrenamiento</Text>

                {(plan.days || []).sort((a: any, b: any) => a.dayNumber - b.dayNumber).map((day: any) => (
                    <View key={day.id} style={styles.daySection}>
                        <TouchableOpacity
                            style={[
                                styles.dayHeader,
                                expandedDays.has(day.dayNumber) && styles.dayHeaderExpanded
                            ]}
                            onPress={() => toggleDay(day.dayNumber)}
                            activeOpacity={0.8}
                        >
                            <View style={styles.dayTitleWrap}>
                                <View style={[styles.dayNumberCircle, { backgroundColor: Colors.primary + '15' }]}>
                                    <Text style={styles.dayNumberText}>{day.dayNumber}</Text>
                                </View>
                                <View>
                                    <Text style={styles.dayLabel}>{day.label}</Text>
                                    <Text style={styles.dayMuscles}>{day.muscleGroups?.join(' • ') || day.muscle_groups?.join(' • ')}</Text>
                                </View>
                            </View>
                            {expandedDays.has(day.dayNumber) ? (
                                <ChevronUp size={20} color={Colors.textMuted} />
                            ) : (
                                <ChevronDown size={20} color={Colors.textMuted} />
                            )}
                        </TouchableOpacity>

                        {expandedDays.has(day.dayNumber) && (
                            <View style={styles.dayExercises}>
                                {day.exercises?.map((pe: any) => renderExercise(pe))}
                            </View>
                        )}
                    </View>
                ))}

                <Text style={[styles.sectionTitle, { marginTop: 30 }]}>Sesiones Realizadas</Text>
                <View style={styles.historyList}>
                    {history.length > 0 ? history.map((session: any) => {
                        const isExpanded = expandedSessions.has(session.id);
                        return (
                            <View key={session.id} style={styles.sessionHistoryCard}>
                                <TouchableOpacity
                                    style={styles.sessionHistoryHeader}
                                    onPress={() => toggleSession(session.id)}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.sessionInfoLeft}>
                                        <View style={[styles.sessionDot, { backgroundColor: session.isFromCurrentPlan ? Colors.primary : Colors.textMuted }]} />
                                        <View>
                                            <Text style={styles.sessionLabel}>{session.training_day?.label || 'Sesión'}</Text>
                                            <Text style={styles.sessionDate}>
                                                {new Date(session.start_time).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </Text>
                                        </View>
                                    </View>
                                    {isExpanded ? <ChevronUp size={20} color={Colors.textMuted} /> : <ChevronDown size={20} color={Colors.textMuted} />}
                                </TouchableOpacity>

                                {isExpanded && (
                                    <View style={styles.sessionDetailsBox}>
                                        {session.exercise_logs?.map((exLog: any, idx: number) => (
                                            <View key={idx} style={styles.exLogItem}>
                                                <Text style={styles.exLogName}>{exLog.planned_exercise?.exercise?.name || 'Ejercicio'}</Text>
                                                <View style={styles.setLogsGrid}>
                                                    {(exLog.setLogs || exLog.set_logs || exLog.sets || []).map((set: any, sIdx: number) => (
                                                        <View key={sIdx} style={[styles.setLogBadge, { backgroundColor: Colors.surfaceLight }]}>
                                                            <Text style={styles.setLogText}>
                                                                S{set.set_number}: <Text style={{ color: Colors.text, fontWeight: '700' }}>{set.reps}</Text> reps • <Text style={{ color: Colors.text, fontWeight: '700' }}>{set.weight}</Text>kg
                                                            </Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            </View>
                                        ))}
                                        {session.comments && (
                                            <View style={[styles.sessionComment, { backgroundColor: Colors.surfaceLight }]}>
                                                <Text style={styles.commentText}>"{session.comments}"</Text>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>
                        );
                    }) : (
                        <View style={styles.noHistoryBadge}>
                            <Text style={styles.noHistoryText}>No se encontraron sesiones registradas todavía.</Text>
                        </View>
                    )}
                </View>

                <View style={{ height: 60 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    topHeader: {
        backgroundColor: Colors.surface,
        paddingTop: 80,
        paddingBottom: 25,
        paddingHorizontal: Spacing.md,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    headerBack: {
        marginLeft: 10,
    },
    planSummary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 25,
    },
    planIconCircle: {
        width: 60,
        height: 60,
        borderRadius: 20,
        backgroundColor: 'rgba(204, 255, 0, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    planTitleMain: {
        fontSize: 24,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: -0.5,
    },
    clientRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    clientNameText: {
        fontSize: 15,
        color: Colors.textMuted,
        fontWeight: '600',
    },
    planMetaGrid: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 20,
        padding: 15,
    },
    metaItem: {
        flex: 1,
        alignItems: 'center',
    },
    metaLabel: {
        fontSize: 11,
        color: Colors.textMuted,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
    },
    metaValue: {
        fontSize: 14,
        color: '#fff',
        fontWeight: '800',
    },
    metaDivider: {
        width: 1,
        height: 20,
        backgroundColor: Colors.border,
    },
    scrollContent: {
        padding: Spacing.md,
        paddingTop: 25,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: Colors.text,
        marginBottom: 20,
        marginLeft: 4,
    },
    daySection: {
        marginBottom: 16,
        borderRadius: 24,
        backgroundColor: Colors.surface,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    dayHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 18,
    },
    dayHeaderExpanded: {
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    dayTitleWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 15,
    },
    dayNumberCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    dayNumberText: {
        fontSize: 14,
        fontWeight: '900',
        color: Colors.primary,
    },
    dayLabel: {
        fontSize: 16,
        fontWeight: '800',
        color: Colors.text,
    },
    dayMuscles: {
        fontSize: 12,
        color: Colors.textMuted,
        fontWeight: '600',
        marginTop: 2,
    },
    dayExercises: {
        padding: 15,
        gap: 12,
        backgroundColor: 'rgba(255,255,255,0.01)',
    },
    exerciseCard: {
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderRadius: 18,
        padding: 15,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    exerciseHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    exerciseIconBg: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: 'rgba(204, 255, 0, 0.08)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    exerciseName: {
        fontSize: 15,
        fontWeight: '800',
        color: Colors.text,
    },
    exerciseMuscle: {
        fontSize: 11,
        color: Colors.textMuted,
        fontWeight: '600',
    },
    targetBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        backgroundColor: 'rgba(255, 107, 0, 0.08)',
        borderRadius: 8,
    },
    targetText: {
        fontSize: 12,
        color: Colors.accent,
        fontWeight: '800',
    },
    instructionText: {
        marginTop: 12,
        fontSize: 13,
        color: Colors.textMuted,
        lineHeight: 18,
        fontStyle: 'italic',
        paddingLeft: 4,
    },
    historySection: {
        marginTop: 15,
        paddingTop: 15,
        borderTopWidth: 1,
        borderTopColor: 'rgba(255,255,255,0.05)',
    },
    historyLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 10,
    },
    historyLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.primary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    setsList: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    setInfo: {
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    setNumber: {
        fontSize: 10,
        fontWeight: '900',
        color: Colors.textMuted,
    },
    setMetrics: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
    },
    metricValue: {
        fontSize: 13,
        fontWeight: '800',
        color: Colors.text,
    },
    metricLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: Colors.textMuted,
    },
    metricDivider: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.border,
    },
    noHistoryBadge: {
        marginTop: 12,
        paddingVertical: 4,
        paddingHorizontal: 8,
        alignSelf: 'flex-start',
    },
    noHistoryText: {
        fontSize: 11,
        color: Colors.textMuted,
        fontWeight: '600',
        fontStyle: 'italic',
    },
    historyList: {
        gap: 12,
    },
    sessionHistoryCard: {
        backgroundColor: Colors.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: 'hidden',
    },
    sessionHistoryHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
    },
    sessionInfoLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    sessionDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    sessionLabel: {
        fontSize: 16,
        fontWeight: '800',
        color: Colors.text,
    },
    sessionDate: {
        fontSize: 12,
        color: Colors.textMuted,
        fontWeight: '600',
        marginTop: 2,
    },
    sessionDetailsBox: {
        padding: 16,
        paddingTop: 0,
        gap: 12,
    },
    exLogItem: {
        backgroundColor: 'rgba(255,255,255,0.02)',
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.05)',
    },
    exLogName: {
        fontSize: 14,
        fontWeight: '800',
        color: Colors.text,
        marginBottom: 8,
    },
    setLogsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    setLogBadge: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    setLogText: {
        fontSize: 11,
        color: Colors.textMuted,
        fontWeight: '600',
    },
    sessionComment: {
        marginTop: 4,
        padding: 12,
        borderRadius: 12,
        fontStyle: 'italic',
    },
    commentText: {
        fontSize: 13,
        color: Colors.textMuted,
        fontStyle: 'italic',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
        padding: 40,
    },
    loadingText: {
        marginTop: 15,
        color: Colors.textMuted,
        fontWeight: '600',
    },
    errorText: {
        color: Colors.textMuted,
        fontSize: 16,
        marginBottom: 20,
    },
    backBtn: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 30,
        paddingVertical: 12,
        borderRadius: 12,
    },
    backBtnText: {
        color: '#000',
        fontWeight: 'bold',
    },
});
