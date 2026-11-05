import { Colors, Spacing } from '@/constants/theme';
import { useNutrition } from '@/context/NutritionContext';
import { usePlans } from '@/context/PlanContext';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import api from '@/services/api';
import { formatDisplayDate, getSafeTimestamp } from '@/services/dateUtils';
import { showToast } from '@/services/toast';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
    ArrowLeft,
    CalendarDays,
    ChevronDown,
    ChevronUp,
    Dumbbell,
    Edit,
    Trash2,
    Ruler,
    Scale,
    Target,
    Trophy,
    User,
    Zap,
    History as HistoryIcon,
    PlayCircle
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    ActivityIndicator,
    Alert,
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
    const { colors, mode } = useTheme();
    const { clients, refreshProfile, deleteClient } = useUser();
    const insets = useSafeAreaInsets();
    const { plans, fetchHistory, fetchPlans } = usePlans();
    
    const styles = useMemo(() => getStyles(colors, mode), [mode, colors]);

    const [history, setHistory] = useState<any[]>([]);
    const [loadingHistory, setLoadingHistory] = useState(true);
    const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
    const [expandedNutritionPlan, setExpandedNutritionPlan] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const client = useMemo(() => clients.find(c => c.id === id), [clients, id]);

    const clientPlans = useMemo(() => {
        if (!client) return [];
        return plans.filter(p => String(p.assignedClientId) === String(client.id));
    }, [plans, client?.id]);

    const { plans: nutritionPlans, deletePlan, fetchPlans: fetchNutritionPlans } = useNutrition();

    const clientNutritionPlans = useMemo(() => {
        if (!client) return [];
        return nutritionPlans.filter(p => String(p.client_id) === String(client.id));
    }, [nutritionPlans, client?.id]);

    const [progressHistory, setProgressHistory] = useState<any[]>([]);
    const [loadingProgress, setLoadingProgress] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const loadHistory = async () => {
            if (isMounted) setLoadingHistory(true);
            const data = await fetchHistory(client?.id);
            if (isMounted) {
                setHistory(data || []);
                setLoadingHistory(false);
            }
        };

        const loadProgress = async () => {
            if (isMounted) setLoadingProgress(true);
            try {
                const response = await api.get(`clients/${client?.id}/progress`);
                let data = Array.isArray(response.data) ? response.data : response.data.data || [];

                if (client && (client.weight || client.height)) {
                    const initialDate = client?.created_at || (client as any)?.created_at;
                    data.push({
                        id: 'initial_bio',
                        weight: client.weight,
                        recorded_at: initialDate,
                        created_at: initialDate,
                        comments: 'Biometría Inicial',
                        measurements: {
                            Altura: client.height ? `${client.height} cm` : undefined,
                            Edad: client.age ? `${client.age} años` : undefined
                        }
                    });
                }

                data.sort((a: any, b: any) => {
                    const dateA = getSafeTimestamp(a.recorded_at || a.created_at);
                    const dateB = getSafeTimestamp(b.recorded_at || b.created_at);
                    return dateB - dateA;
                });

                if (isMounted) {
                    setProgressHistory(data);
                }
            } catch (error) {
                console.error("Error loading progress", error);
            } finally {
                if (isMounted) {
                    setLoadingProgress(false);
                }
            }
        };

        if (client?.id) {
            loadHistory();
            loadProgress();
        }

        return () => {
            isMounted = false;
        };
    }, [client?.id]);

    const handleDeleteNutritionPlan = (planId: string | number) => {
        Alert.alert(
            'Eliminar Plan',
            '¿Estás seguro de que deseas eliminar este plan de alimentación? Esta acción no se puede deshacer.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deletePlan(planId);
                        } catch (error) {
                            // Error handled by context
                        }
                    }
                }
            ]
        );
    };

    const handleDeleteClient = () => {
        if (!client) return;

        showToast.confirm(
            'Eliminar Cliente',
            `¿Estás seguro de que deseas eliminar permanentemente a "${client.name}"? Se borrarán todos sus planes, nutrición, historial, fotos y cuenta de forma irreversible.`,
            [
                {
                    text: 'Eliminar permanentemente',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            setIsDeleting(true);
                            await deleteClient(String(client.id));
                            if (fetchPlans) fetchPlans().catch(() => {});
                            if (fetchNutritionPlans) fetchNutritionPlans().catch(() => {});
                            showToast.success('Cliente y todos sus datos eliminados correctamente');
                            router.replace('/(tabs)');
                        } catch (error: any) {
                            setIsDeleting(false);
                            const msg = error.response?.data?.message || 'Error al eliminar el cliente';
                            showToast.error(msg);
                        }
                    }
                },
                {
                    text: 'Cancelar',
                    style: 'cancel'
                }
            ]
        );
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
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 20 }]}>
                <TouchableOpacity style={[styles.headerBack, { top: Math.max(insets.top, 20) + 12 }]} onPress={() => router.back()}>
                    <ArrowLeft size={24} color="#fff" />
                </TouchableOpacity>

                <View style={[styles.headerActions, { top: Math.max(insets.top, 20) + 12 }]}>
                    <TouchableOpacity style={styles.headerBtn} onPress={() => router.push(`/client/edit/${client.id}`)}>
                        <Edit size={20} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.headerBtn, styles.headerDeleteBtn]} onPress={handleDeleteClient} disabled={isDeleting}>
                        {isDeleting ? (
                            <ActivityIndicator size="small" color={colors.danger || '#ef4444'} />
                        ) : (
                            <Trash2 size={20} color={colors.danger || '#ef4444'} />
                        )}
                    </TouchableOpacity>
                </View>

                <View style={styles.profileBox}>
                    <View style={styles.avatarLarge}>
                        {client.profilePhotoUrl ? (
                            <Image
                                source={{ uri: client.profilePhotoUrl }}
                                style={styles.avatarImage}
                            />
                        ) : (
                            <User size={48} color={colors.primary} />
                        )}
                    </View>
                    <Text style={styles.name}>{client.name}</Text>
                    <Text style={styles.username}>@{client.username}</Text>
                    {client.phone && <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>{client.phone}</Text>}

                    <View style={styles.badgeRow}>
                        <View style={styles.badge}>
                            <Trophy size={14} color={colors.primary} />
                            <Text style={styles.badgeText}>{client.trainingTime || 'Nuevo'}</Text>
                        </View>
                    </View>
                </View>
            </View>

            <ScrollView
                style={styles.content}
                contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 24) + 40 }}
                showsVerticalScrollIndicator={false}
            >
                {/* Physical Stats Grid */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Biometría Inicial</Text>
                    <View style={styles.statsGrid}>
                        <View style={styles.statCard}>
                            <Scale size={20} color={colors.primary} />
                            <Text style={styles.statLabel}>Peso Inicial</Text>
                            <Text style={styles.statValue}>{client.weight || '--'} <Text style={styles.unit}>kg</Text></Text>
                        </View>
                        <View style={styles.statCard}>
                            <Ruler size={20} color={colors.primary} />
                            <Text style={styles.statLabel}>Altura</Text>
                            <Text style={styles.statValue}>{client.height || '--'} <Text style={styles.unit}>cm</Text></Text>
                        </View>
                        <View style={styles.statCard}>
                            <Target size={20} color={colors.primary} />
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
                            <Target size={20} color={colors.primary} />
                        </View>
                        <Text style={styles.infoText}>
                            {client.objectives || 'Sin objetivos definidos todavía.'}
                        </Text>
                    </View>
                </View>

                {/* ── Última Sesión ───────────────── */}
                {history && history.length > 0 && (
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Última Sesión de Entrenamiento</Text>
                        <TouchableOpacity style={{ marginTop: 8 }} onPress={() => router.push({ pathname: '/client/history/[id]', params: { id: String(client.id) } } as any)} activeOpacity={0.9}>
                            <View style={{ overflow: 'hidden', backgroundColor: colors.surface, borderRadius: 16, borderColor: colors.border, borderWidth: 1 }}>
                                <View style={{ padding: Spacing.md }}>
                                    <View style={{ backgroundColor: colors.textMuted + '30', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 12 }}>
                                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '800' }}>COMPLETADO</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
                                                {new Date(history[0].date || history[0].created_at || Date.now()).toLocaleDateString()}
                                            </Text>
                                            <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>
                                                Ver historial completo de sesiones
                                            </Text>
                                        </View>
                                        <View style={{ backgroundColor: colors.surfaceLight, borderRadius: 24, padding: 4 }}>
                                            <View style={{ backgroundColor: colors.border, borderRadius: 20 }}>
                                                <HistoryIcon size={24} color={colors.textMuted} style={{ padding: 4 }} />
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            </View>
                        </TouchableOpacity>
                    </View>
                )}

                {/* ── Progreso Histórico ───────────────── */}
                <View style={styles.section}>


                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
                        <Text style={[styles.sectionTitle, { marginTop: 0 }]}>Historial de Evaluaciones</Text>
                        <TouchableOpacity onPress={() => router.push({ pathname: '/client/evaluations/[id]', params: { id: String(client.id) } } as any)}>
                            <Text style={{ color: colors.primary, fontWeight: '700', fontSize: 14 }}>Ver todas</Text>
                        </TouchableOpacity>
                    </View>
                    {loadingProgress ? (
                        <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
                    ) : progressHistory.length > 0 ? (
                        <View style={styles.historyList}>
                            {progressHistory.slice(0, 1).map((prog, idx) => {
                                const thumb = prog.front_photo_url || prog.front_photo_path || prog.front_photo || prog.side_photo_url || prog.side_photo_path || prog.side_photo;
                                return (
                                <TouchableOpacity 
                                    key={prog.id || idx} 
                                    style={styles.historyCard}
                                    activeOpacity={0.7}
                                    onPress={() => router.push({
                                        pathname: '/client/progress/detail',
                                        params: { item: JSON.stringify(prog), clientId: String(client?.id || '') }
                                    })}
                                >
                                    <View style={styles.historyDot} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.historyDate}>
                                            {formatDisplayDate(prog.recorded_at || prog.created_at, prog.id === 'initial_bio' ? 'Registro Inicial' : 'Sin fecha')}
                                        </Text>
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
                                    {thumb && (
                                        <Image source={{ uri: thumb }} style={{ width: 60, height: 80, borderRadius: 8, marginLeft: 12, resizeMode: 'cover' }} />
                                    )}
                                </TouchableOpacity>
                                );
                            })}
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
                                        <CalendarDays size={20} color={colors.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.cpTitle}>{plan.month} {plan.year}</Text>
                                        <Text style={styles.cpSub}>{plan.splitType} · {plan.daysPerWeek} días/sem</Text>
                                    </View>
                                    <View style={styles.cpStatRow}>
                                        <Dumbbell size={12} color={colors.primary} />
                                        <Text style={styles.cpStatText}>{totalEx}</Text>
                                        <Zap size={12} color={colors.accent || colors.primary} />
                                        <Text style={styles.cpStatText}>{totalSessions}</Text>
                                    </View>
                                    {isExpanded ? <ChevronUp size={18} color={colors.textMuted} /> : <ChevronDown size={18} color={colors.textMuted} />}
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
                            <CalendarDays size={24} color={colors.textMuted} />
                            <Text style={styles.cpEmptyText}>No hay planes asignados</Text>
                        </View>
                    )}
                </View>
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Planes de Alimentación</Text>
                    {clientNutritionPlans.length > 0 ? clientNutritionPlans.map(plan => {
                        let parsedMeals: any[] = [];
                        if (Array.isArray(plan.meals)) {
                            parsedMeals = plan.meals;
                        } else if (typeof plan.meals === 'string') {
                            try { parsedMeals = JSON.parse(plan.meals); } catch (e) { }
                        } else if ((plan as any).meals_data && typeof (plan as any).meals_data === 'string') {
                            try { parsedMeals = JSON.parse((plan as any).meals_data); } catch (e) { }
                        }
                        const totalMeals = parsedMeals.length;
                        const dateText = plan.created_at ? new Date(plan.created_at).toLocaleDateString() : '';
                        const isExpanded = expandedNutritionPlan === plan.id;
                        return (
                            <View key={plan.id} style={styles.cpCard}>
                                <TouchableOpacity
                                    style={styles.cpHeader}
                                    onPress={() => setExpandedNutritionPlan(isExpanded ? null : String(plan.id))}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.cpIconBg}>
                                        <CalendarDays size={20} color={colors.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.cpTitle}>Plan {dateText}</Text>
                                        <Text style={styles.cpSub}>{totalMeals} tiempos de comida</Text>
                                        {plan.tdee || plan.target_calories ? (
                                            <Text style={[styles.cpSub, { color: colors.text }]}>
                                                Gasto cal total: {plan.tdee || '--'} kcal | Objetivo: {plan.target_calories || '--'} kcal
                                            </Text>
                                        ) : null}
                                    </View>
                                    <View style={styles.cpStatRow}>
                                        <Text style={styles.cpStatText}>{plan.total_calories} kcal</Text>
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 12, marginRight: 8 }}>
                                        <TouchableOpacity
                                            onPress={() => router.push({ pathname: '/client/nutrition/[id]', params: { id: String(client.id), planId: String(plan.id) } } as any)}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        >
                                            <Edit size={18} color={colors.textMuted} />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => handleDeleteNutritionPlan(plan.id)}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                        >
                                            <Trash2 size={18} color={colors.danger} />
                                        </TouchableOpacity>
                                    </View>

                                    {isExpanded ? <ChevronUp size={20} color={colors.textMuted} /> : <ChevronDown size={20} color={colors.textMuted} />}
                                </TouchableOpacity>

                                {isExpanded && (
                                    <View style={styles.cpDaysList}>
                                        {(plan.gender || plan.weight || plan.objective) && (
                                            <View style={styles.planDetailsContainer}>
                                                <Text style={styles.planDetailsTitle}>Detalles del Cálculo:</Text>
                                                <View style={styles.planDetailsGrid}>
                                                    {plan.gender && <Text style={styles.planDetailText}>• Género: {plan.gender}</Text>}
                                                    {plan.age && <Text style={styles.planDetailText}>• Edad: {plan.age} años</Text>}
                                                    {plan.weight && <Text style={styles.planDetailText}>• Peso: {plan.weight} kg</Text>}
                                                    {plan.height && <Text style={styles.planDetailText}>• Altura: {plan.height} cm</Text>}
                                                    {plan.activity_level && <Text style={styles.planDetailText}>• Nivel Actividad: {plan.activity_level}</Text>}
                                                    {plan.formula && <Text style={styles.planDetailText}>• Fórmula: {plan.formula === 'mifflin' ? 'Mifflin-St Jeor' : plan.formula === 'harris' ? 'Harris-Benedict' : 'Tinsley'}</Text>}
                                                    {plan.objective && <Text style={styles.planDetailText}>• Objetivo: {plan.objective}</Text>}
                                                    {plan.caloric_adjustment != null && <Text style={styles.planDetailText}>• Ajuste Calórico: {plan.caloric_adjustment} kcal</Text>}
                                                </View>
                                            </View>
                                        )}

                                        {parsedMeals.map((meal: any, index: number) => (
                                            <View key={meal.id || index} style={styles.cpDayRow}>
                                                <Text style={styles.cpDayLabel}>{meal.name}</Text>
                                                {meal.foods && meal.foods.length > 0 && (
                                                    <View style={styles.cpDayExercises}>
                                                        {meal.foods.map((food: any, idx: number) => (
                                                            <Text key={food.id || idx} style={styles.cpExTextWhite} numberOfLines={1}>
                                                                {idx + 1}. {food.name} · {food.serving_size} {food.serving_unit}
                                                            </Text>
                                                        ))}
                                                    </View>
                                                )}
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        );
                    }) : (
                        <View style={styles.cpEmpty}>
                            <CalendarDays size={24} color={colors.textMuted} />
                            <Text style={styles.cpEmptyText}>No hay planes de alimentación asignados</Text>
                        </View>
                    )}
                </View>

                <View style={styles.actionSection}>
                    <TouchableOpacity
                        style={styles.actionButton}
                        activeOpacity={0.8}
                        onPress={() => router.push({
                            pathname: '/client/progress/[id]',
                            params: { id: String(client.id) }
                        })}
                    >
                        <Scale size={20} color={colors.primary} />
                        <Text style={styles.actionButtonText}>Registrar progreso manual</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={styles.actionButton}
                        activeOpacity={0.8}
                        onPress={() => router.push({
                            pathname: '/client/nutrition/[id]',
                            params: { id: String(client.id) }
                        })}
                    >
                        <CalendarDays size={20} color={colors.primary} />
                        <Text style={styles.actionButtonText}>Asignar plan de alimentación</Text>
                    </TouchableOpacity>
                </View>

                {/* Zona de peligro - Eliminar Cliente */}
                <View style={styles.dangerCard}>
                    <View style={styles.dangerHeader}>
                        <Trash2 size={20} color={colors.danger || '#ef4444'} />
                        <Text style={styles.dangerTitle}>Zona de peligro</Text>
                    </View>
                    <Text style={styles.dangerText}>
                        Al eliminar a este cliente se borrarán de forma definitiva todos sus planes de entrenamiento, planes de nutrición, registros de progreso, fotos e historial completo. Esta acción no se puede deshacer.
                    </Text>
                    <TouchableOpacity
                        style={[styles.deleteBtn, isDeleting && { opacity: 0.7 }]}
                        activeOpacity={0.8}
                        onPress={handleDeleteClient}
                        disabled={isDeleting}
                    >
                        {isDeleting ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <>
                                <Trash2 size={18} color="#fff" />
                                <Text style={styles.deleteBtnText}>Eliminar Cliente y Todo su Historial</Text>
                            </>
                        )}
                    </TouchableOpacity>
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const getStyles = (Colors: any, mode?: 'dark' | 'light') => StyleSheet.create({
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
    headerActions: {
        position: 'absolute',
        top: 50,
        right: 20,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    headerBtn: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: 'rgba(255,255,255,0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerDeleteBtn: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
    },
    dangerCard: {
        backgroundColor: mode === 'dark' ? 'rgba(239, 68, 68, 0.08)' : '#fef2f2',
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(239, 68, 68, 0.25)' : '#fecaca',
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
    },
    dangerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    dangerTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.danger || '#ef4444',
    },
    dangerText: {
        fontSize: 13,
        lineHeight: 19,
        color: Colors.textMuted,
        marginBottom: 16,
    },
    deleteBtn: {
        backgroundColor: Colors.danger || '#ef4444',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        borderRadius: 14,
        gap: 8,
    },
    deleteBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 15,
    },
    profileBox: {
        alignItems: 'center',
    },
    avatarLarge: {
        width: 100,
        height: 100,
        borderRadius: 35,
        backgroundColor: Colors.primary + '18',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 15,
        borderWidth: 1,
        borderColor: Colors.primary + '30',
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
        color: mode === 'dark' ? '#000' : '#FFF',
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
        backgroundColor: Colors.primary + '18',
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
        backgroundColor: Colors.primary + '18',
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
        backgroundColor: Colors.primary + '18',
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
    cpExTextWhite: {
        fontSize: 13,
        color: Colors.text,
        marginBottom: 4,
        fontWeight: '500',
    },
    cpDayExercises: {
        gap: 4,
        marginTop: 4,
    },
    planDetailsContainer: {
        backgroundColor: Colors.surfaceLight,
        padding: 12,
        borderRadius: 12,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    planDetailsTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: 8,
    },
    planDetailsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    planDetailText: {
        fontSize: 12,
        color: Colors.textMuted,
        width: '48%',
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
