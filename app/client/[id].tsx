import { Colors, Spacing } from '@/constants/theme';
import { usePlans } from '@/context/PlanContext';
import { useUser } from '@/context/UserContext';
import api from '@/services/api';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
    ArrowLeft,
    CalendarDays,
    ChevronDown,
    ChevronUp,
    Dumbbell,
    Ruler,
    Scale,
    Target,
    Trophy,
    User,
    Zap
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Image,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

export default function ClientDetails() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { clients, refreshProfile } = useUser();
    const { plans, fetchHistory } = usePlans();

    const [history, setHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [expandedPlan, setExpandedPlan] = useState<string | null>(null);

    const client = useMemo(() => clients.find(c => c.id === id), [clients, id]);

    const clientPlans = useMemo(() => {
        if (!client) return [];
        return plans.filter(p => String(p.assignedClientId) === String(client.id));
    }, [plans, client?.id]);

    const [progressHistory, setProgressHistory] = useState<any[]>([]);
    const [loadingProgress, setLoadingProgress] = useState(true);

    useEffect(() => {
        if (client?.id) {
            loadHistory();
            loadProgress();
        }
    }, [client?.id]);

    const loadHistory = async () => {
        setLoadingHistory(true);
        const data = await fetchHistory(client?.id);
        setHistory(data || []);
        setLoadingHistory(false);
    };

    const loadProgress = async () => {
        setLoadingProgress(true);
        try {
            const response = await api.get(`clients/${client?.id}/progress`);
            let data = Array.isArray(response.data) ? response.data : response.data.data || [];

            if (client && (client.weight || client.height)) {
                data.push({
                    id: 'initial_bio',
                    weight: client.weight,
                    created_at: client.created_at || new Date().toISOString(),
                    comments: 'Biometría Inicial',
                    measurements: {
                        Altura: client.height ? `${client.height} cm` : undefined,
                        Edad: client.age ? `${client.age} años` : undefined
                    }
                });
            }

            data.sort((a: any, b: any) => {
                const dateA = new Date(a.created_at || a.recorded_at || 0).getTime();
                const dateB = new Date(b.created_at || b.recorded_at || 0).getTime();
                return dateB - dateA;
            });
            setProgressHistory(data);
            if (refreshProfile) {
                await refreshProfile();
            }
        } catch (error) {
            console.error('Error fetching progress:', error);
        } finally {
            setLoadingProgress(false);
        }
    };

    if (!client) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>No se encontró el cliente</Text>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <Text style={styles.backBtnText}>Volver</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar barStyle="light-content" />

            {/* Header / Profile Summary */}
            <View style={styles.header}>
                <TouchableOpacity style={styles.headerBack} onPress={() => router.back()}>
                    <ArrowLeft size={24} color="#fff" />
                </TouchableOpacity>

                <View style={styles.profileBox}>
                    <View style={styles.avatarLarge}>
                        {client.profilePhotoUrl ? (
                            <Image
                                source={{ uri: client.profilePhotoUrl }}
                                style={styles.avatarImage}
                            />
                        ) : (
                            <User size={48} color={Colors.primary} />
                        )}
                    </View>
                    <Text style={styles.name}>{client.name}</Text>
                    <Text style={styles.username}>@{client.username}</Text>

                    <View style={styles.badgeRow}>
                        <View style={styles.badge}>
                            <Trophy size={14} color={Colors.primary} />
                            <Text style={styles.badgeText}>{client.trainingTime || 'Nuevo'}</Text>
                        </View>
                    </View>
                </View>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Physical Stats Grid */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Biometría Inicial</Text>
                    <View style={styles.statsGrid}>
                        <View style={styles.statCard}>
                            <Scale size={20} color={Colors.primary} />
                            <Text style={styles.statLabel}>Peso Inicial</Text>
                            <Text style={styles.statValue}>{client.weight || '--'} <Text style={styles.unit}>kg</Text></Text>
                        </View>
                        <View style={styles.statCard}>
                            <Ruler size={20} color={Colors.primary} />
                            <Text style={styles.statLabel}>Altura</Text>
                            <Text style={styles.statValue}>{client.height || '--'} <Text style={styles.unit}>cm</Text></Text>
                        </View>
                        <View style={styles.statCard}>
                            <Target size={20} color={Colors.primary} />
                            <Text style={styles.statLabel}>Edad</Text>
                            <Text style={styles.statValue}>{client.age || '--'} <Text style={styles.unit}>años</Text></Text>
                        </View>
                    </View>
                </View>

                {/* Objectives */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Objetivos</Text>
                    <View style={styles.infoCard}>
                        <View style={styles.iconCircle}>
                            <Target size={20} color={Colors.primary} />
                        </View>
                        <Text style={styles.infoText}>
                            {client.objectives || 'Sin objetivos definidos todavía.'}
                        </Text>
                    </View>
                </View>

                {/* ── Progreso Histórico ───────────────── */}
                <View style={styles.section}>


                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
                        <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Historial de Evaluaciones</Text>
                        <TouchableOpacity onPress={() => router.push({ pathname: '/client/evaluations/[id]', params: { id: client.id } } as any)}>
                            <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 14 }}>Ver todas</Text>
                        </TouchableOpacity>
                    </View>
                    {loadingProgress ? (
                        <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
                    ) : progressHistory.length > 0 ? (
                        <View style={styles.historyList}>
                            {progressHistory.slice(0, 1).map((prog, idx) => (
                                <View key={prog.id || idx} style={styles.historyCard}>
                                    <View style={styles.historyDot} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.historyDate}>{new Date(prog.created_at || prog.recorded_at || Date.now()).toLocaleDateString()}</Text>
                                        <Text style={styles.historyWeight}>Peso: {prog.weight ? `${prog.weight} kg` : '--'}</Text>

                                        {prog.measurements && Object.keys(prog.measurements).length > 0 && (
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 4 }}>
                                                {Object.entries(prog.measurements).map(([k, v]) => (
                                                    <View key={k} style={{ backgroundColor: 'rgba(204, 255, 0, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                                                        <Text style={{ fontSize: 11, color: Colors.primary, fontWeight: '700' }}>{k}: {v as string}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}

                                        {prog.comments && <Text style={styles.historyComment}>"{prog.comments}"</Text>}
                                    </View>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View style={styles.cpEmpty}>
                            <Text style={styles.cpEmptyText}>Aún no hay progreso registrado.</Text>
                        </View>
                    )}
                </View>

                {/* ── Planes de Entrenamiento ───────────────── */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Planes de Entrenamiento</Text>
                    {clientPlans.length > 0 ? clientPlans.map(plan => {
                        const isExpanded = expandedPlan === plan.id;
                        const totalEx = plan.days.reduce((s, d) => s + d.exercises.length, 0);
                        const totalSessions = plan.logs?.reduce((s, l) => s + (l.sessions?.length ?? 0), 0) ?? 0;
                        return (
                            <View key={plan.id} style={styles.cpCard}>
                                <TouchableOpacity
                                    style={styles.cpHeader}
                                    onPress={() => setExpandedPlan(isExpanded ? null : plan.id)}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.cpIconBg}>
                                        <CalendarDays size={20} color={Colors.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.cpTitle}>{plan.month} {plan.year}</Text>
                                        <Text style={styles.cpSub}>{plan.splitType} · {plan.daysPerWeek} días/sem</Text>
                                    </View>
                                    <View style={styles.cpStatRow}>
                                        <Dumbbell size={12} color={Colors.primary} />
                                        <Text style={styles.cpStatText}>{totalEx}</Text>
                                        <Zap size={12} color={Colors.accent || Colors.primary} />
                                        <Text style={styles.cpStatText}>{totalSessions}</Text>
                                    </View>
                                    {isExpanded ? <ChevronUp size={18} color={Colors.textMuted} /> : <ChevronDown size={18} color={Colors.textMuted} />}
                                </TouchableOpacity>

                                {isExpanded && (
                                    <View style={styles.cpDaysList}>
                                        {plan.days.map(day => {
                                            const dayLog = plan.logs?.find(l => l.dayNumber === day.dayNumber);
                                            const sessCount = dayLog?.sessions?.length ?? 0;
                                            return (
                                                <View key={day.dayNumber} style={styles.cpDayRow}>
                                                    <View style={styles.cpDayHeader}>
                                                        <Text style={styles.cpDayLabel}>{day.label}</Text>
                                                        {sessCount > 0 && (
                                                            <View style={styles.cpSessBadge}>
                                                                <Text style={styles.cpSessBadgeText}>{sessCount} ses.</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                    <View style={styles.cpDayChips}>
                                                        {day.muscleGroups.map(g => (
                                                            <View key={g} style={styles.cpDayChip}>
                                                                <Text style={styles.cpDayChipText}>{g}</Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                    {day.exercises.length > 0 && (
                                                        <View style={styles.cpExList}>
                                                            {day.exercises.map((pe, idx) => (
                                                                <Text key={pe.exercise.id || idx} style={styles.cpExText} numberOfLines={1}>
                                                                    {idx + 1}. {pe.exercise.name} · {pe.sets}×{pe.minReps}-{pe.maxReps}
                                                                </Text>
                                                            ))}
                                                        </View>
                                                    )}
                                                </View>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>
                        );
                    }) : (
                        <View style={styles.cpEmpty}>
                            <CalendarDays size={24} color={Colors.textMuted} />
                            <Text style={styles.cpEmptyText}>No hay planes asignados</Text>
                        </View>
                    )}
                </View>

                <View style={styles.actionSection}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        activeOpacity={0.8}
                        onPress={() => router.push({
                            pathname: '/client/progress/[id]',
                            params: { id: client.id }
                        })}
                    >
                        <Scale size={20} color={Colors.primary} />
                        <Text style={styles.actionButtonText}>Registrar progreso manual</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionButton}
                        activeOpacity={0.8}
                        onPress={() => router.push({
                            pathname: '/client/nutrition/[id]',
                            params: { id: client.id }
                        })}
                    >
                        <CalendarDays size={20} color={Colors.primary} />
                        <Text style={styles.actionButtonText}>Asignar plan de alimentación</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        backgroundColor: Colors.surface,
        paddingTop: 60,
        paddingBottom: 30,
        paddingHorizontal: Spacing.md,
        alignItems: 'center',
        borderBottomLeftRadius: 30,
        borderBottomRightRadius: 30,
    },
    headerBack: {
        position: 'absolute',
        top: 50,
        left: 20,
        zIndex: 10,
    },
    profileBox: {
        alignItems: 'center',
    },
    avatarLarge: {
        width: 100,
        height: 100,
        borderRadius: 35,
        backgroundColor: 'rgba(204, 255, 0, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 15,
        borderWidth: 1,
        borderColor: 'rgba(204, 255, 0, 0.2)',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
        borderRadius: 35,
        resizeMode: 'cover',
    },
    name: {
        fontSize: 26,
        fontWeight: '900',
        color: Colors.text,
        letterSpacing: -0.5,
    },
    username: {
        fontSize: 16,
        color: Colors.textMuted,
        marginTop: 4,
    },
    badgeRow: {
        flexDirection: 'row',
        marginTop: 15,
    },
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
    },
    badgeText: {
        color: Colors.text,
        fontSize: 13,
        fontWeight: '700',
    },
    content: {
        flex: 1,
        paddingHorizontal: Spacing.md,
    },
    section: {
        marginTop: 30,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 15,
        paddingHorizontal: 4,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: Colors.text,
    },
    statsGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    statCard: {
        flex: 1,
        backgroundColor: Colors.surface,
        borderRadius: 20,
        padding: 15,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    statLabel: {
        fontSize: 12,
        color: Colors.textMuted,
        fontWeight: '700',
        marginTop: 8,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    statValue: {
        fontSize: 18,
        fontWeight: '900',
        color: Colors.text,
        marginTop: 4,
    },
    unit: {
        fontSize: 12,
        fontWeight: '500',
        color: Colors.textMuted,
    },
    emptyActivity: {
        height: 80,
        backgroundColor: Colors.surface,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: Colors.border,
    },
    emptyActivityText: {
        color: Colors.textMuted,
        fontSize: 14,
        fontWeight: '500',
    },
    historyList: {
        gap: 12,
    },
    historyItem: {
        flexDirection: 'row',
        backgroundColor: Colors.surface,
        borderRadius: 20,
        padding: 16,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    historyDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: Colors.primary,
        marginRight: 15,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 5,
    },
    historyInfo: {
        flex: 1,
    },
    historyLabel: {
        fontSize: 15,
        fontWeight: '800',
        color: Colors.text,
    },
    historyDate: {
        fontSize: 12,
        color: Colors.textMuted,
        marginTop: 2,
        fontWeight: '600',
    },
    historyExercises: {
        fontSize: 13,
        fontWeight: '700',
        color: Colors.primary,
        backgroundColor: 'rgba(204, 255, 0, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 10,
    },
    infoCard: {
        flexDirection: 'row',
        backgroundColor: Colors.surface,
        borderRadius: 20,
        padding: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
        gap: 15,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    photoGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    photoContainer: {
        flex: 1,
        alignItems: 'center',
    },
    photoPlaceholder: {
        width: '100%',
        aspectRatio: 3 / 4,
        backgroundColor: Colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: Colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    realPhoto: {
        width: '100%',
        aspectRatio: 3 / 4,
        borderRadius: 12,
        marginBottom: 8,
        resizeMode: 'cover',
    },
    photoLabel: {
        fontSize: 12,
        color: Colors.textMuted,
        fontWeight: '600',
    },
    historyCard: {
        flexDirection: 'row',
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        alignItems: 'center',
    },
    historyWeight: {
        fontSize: 16,
        color: Colors.primary,
        fontWeight: '800',
        marginBottom: 4,
    },
    historyComment: {
        fontSize: 14,
        color: Colors.text,
        fontStyle: 'italic',
    },
    infoText: {
        flex: 1,
        fontSize: 15,
        color: Colors.text,
        lineHeight: 22,
        fontWeight: '500',
    },
    contactCard: {
        backgroundColor: Colors.surface,
        borderRadius: 20,
        padding: 20,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    contactItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    contactText: {
        fontSize: 15,
        color: Colors.text,
        fontWeight: '600',
    },
    actionSection: {
        marginTop: 40,
        gap: 12,
    },
    actionButton: {
        flexDirection: 'row',
        height: 60,
        borderRadius: 18,
        backgroundColor: Colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    actionButtonText: {
        fontSize: 16,
        fontWeight: '800',
        color: Colors.text,
    },
    errorContainer: {
        flex: 1,
        backgroundColor: Colors.background,
        justifyContent: 'center',
        alignItems: 'center',
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
    // ── Client Plan Cards ───────────────────────────
    cpCard: {
        backgroundColor: Colors.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: 12,
        overflow: 'hidden',
    },
    cpHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 12,
    },
    cpIconBg: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(204, 255, 0, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cpTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text,
    },
    cpSub: {
        fontSize: 12,
        color: Colors.textMuted,
        marginTop: 2,
    },
    cpStatRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginRight: 8,
    },
    cpStatText: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.primary,
    },
    cpDaysList: {
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        paddingHorizontal: 16,
        paddingVertical: 10,
        gap: 14,
    },
    cpDayRow: {
        gap: 4,
    },
    cpDayHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    cpDayLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.text,
    },
    cpSessBadge: {
        backgroundColor: 'rgba(204, 255, 0, 0.12)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    cpSessBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.primary,
    },
    cpDayChips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    cpDayChip: {
        backgroundColor: 'rgba(204, 255, 0, 0.12)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    cpDayChipText: {
        fontSize: 11,
        fontWeight: '600',
        color: Colors.primary,
    },
    cpExList: {
        marginTop: 4,
        paddingLeft: 8,
    },
    cpExText: {
        fontSize: 12,
        color: Colors.textMuted,
        marginBottom: 2,
    },
    cpEmpty: {
        backgroundColor: Colors.surface,
        borderRadius: 20,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: Colors.border,
        padding: 24,
        alignItems: 'center',
        gap: 8,
    },
    cpEmptyText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.textMuted,
    },
});
