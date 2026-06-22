import { MealFood, NutritionPlan, NutritionPlanMeal, FatSecretFood } from '@/constants/NutritionTypes';
import { Colors, Spacing, borderRadius } from '@/constants/theme';
import { useNutrition } from '@/context/NutritionContext';
import { useUser } from '@/context/UserContext';
import { showToast } from '@/services/toast';
import {
    Apple,
    ArrowLeft,
    ArrowRight,
    Check,
    Plus,
    Search,
    Trash2,
    X
} from 'lucide-react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useMemo, useState, useEffect } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
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

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NutritionScreen() {
    const { plans, fetchPlans, addPlan, deletePlan, searchFoods, getFoodDetails } = useNutrition();
    const { currentUser, clients } = useUser();
    const router = useRouter();
    const { filter } = useLocalSearchParams();

    const [refreshing, setRefreshing] = useState(false);
    const [expandedNutritionPlan, setExpandedNutritionPlan] = useState<string | number | null>(null);
    const [coachFilter, setCoachFilter] = useState<'all' | 'me' | 'templates'>('all');

    useEffect(() => {
        if (filter === 'me') {
            setCoachFilter('me');
        }
    }, [filter]);

    const isCoach = currentUser?.role === 'coach';

    const filteredPlans = useMemo(() => {
        if (!currentUser) return [];
        if (isCoach) {
            if (coachFilter === 'me') {
                return plans.filter(p => String(p.client_id) === String(currentUser.id));
            }
            if (coachFilter === 'templates') {
                return plans.filter(p => p.client_id === null);
            }
            return plans;
        }
        return plans.filter(p => String(p.client_id) === String(currentUser.id));
    }, [plans, currentUser, isCoach, coachFilter]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchPlans();
        setRefreshing(false);
    }, [fetchPlans]);

    const handleCreatePlan = () => {
        router.push({
            pathname: '/client/nutrition/[id]',
            params: { id: String(currentUser?.id || '') }
        });
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            
            {isCoach && (
                <View style={{ flexDirection: 'row', padding: Spacing.md, gap: 8, paddingBottom: 0 }}>
                    <TouchableOpacity 
                        style={[styles.clientChip, coachFilter === 'all' && styles.clientChipActive]} 
                        onPress={() => setCoachFilter('all')}
                    >
                        <Text style={[styles.clientChipText, coachFilter === 'all' && styles.clientChipTextActive]}>Todos</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.clientChip, coachFilter === 'me' && styles.clientChipActive]} 
                        onPress={() => setCoachFilter('me')}
                    >
                        <Text style={[styles.clientChipText, coachFilter === 'me' && styles.clientChipTextActive]}>Mis Dietas</Text>
                    </TouchableOpacity>
                    <TouchableOpacity 
                        style={[styles.clientChip, coachFilter === 'templates' && styles.clientChipActive]} 
                        onPress={() => setCoachFilter('templates')}
                    >
                        <Text style={[styles.clientChipText, coachFilter === 'templates' && styles.clientChipTextActive]}>Plantillas</Text>
                    </TouchableOpacity>
                </View>
            )}

            {filteredPlans.length === 0 ? (
                <ScrollView contentContainerStyle={styles.emptyState} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
                    <View style={styles.emptyIconContainer}>
                        <Apple size={36} color={Colors.textMuted} />
                    </View>
                    <Text style={styles.emptyText}>Sin dietas todavía</Text>
                    <Text style={styles.emptySubtext}>Crea o asigna el primer plan de nutrición</Text>
                    {isCoach && (
                        <TouchableOpacity style={styles.emptyCta} onPress={handleCreatePlan}>
                            <Plus size={16} color="#000" />
                            <Text style={styles.emptyCtaText}>Crear Dieta</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>
            ) : (
                <FlatList
                    data={filteredPlans}
                    keyExtractor={(item) => item.id.toString()}
                    contentContainerStyle={styles.plansList}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} />}
                    renderItem={({ item }) => {
                        const isExpanded = expandedNutritionPlan === item.id;
                        return (
                            <View style={styles.planCard}>
                                <TouchableOpacity 
                                    activeOpacity={0.7} 
                                    onPress={() => setExpandedNutritionPlan(isExpanded ? null : item.id)}
                                >
                                    <View style={styles.planHeader}>
                                        <Text style={styles.planTitle}>{item.name}</Text>
                                        {isCoach && (
                                            <TouchableOpacity onPress={() => deletePlan(item.id)}>
                                                <Trash2 size={18} color={Colors.danger} />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                    <Text style={styles.planMacros}>🍎 {Math.round(item.total_calories)} kcal · P: {Math.round(item.total_protein)}g · C: {Math.round(item.total_carbs)}g</Text>
                                    {!isExpanded && (
                                        <View style={styles.planMeals}>
                                            {item.meals.map((m, i) => (
                                                <View key={i} style={styles.planMealRow}>
                                                    <Text style={styles.planMealTitle}>{m.name}</Text>
                                                    <Text style={styles.planMealFoods}>{m.foods.length} alimentos</Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </TouchableOpacity>

                                {isExpanded && (
                                    <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 16 }}>
                                        {(item.gender || item.weight || item.objective) && (
                                            <View style={styles.planDetailsContainer}>
                                                <Text style={styles.planDetailsTitle}>Detalles del Cálculo:</Text>
                                                <View style={styles.planDetailsGrid}>
                                                    {item.gender && <Text style={styles.planDetailText}>• Género: {item.gender}</Text>}
                                                    {item.age && <Text style={styles.planDetailText}>• Edad: {item.age} años</Text>}
                                                    {item.weight && <Text style={styles.planDetailText}>• Peso: {item.weight} kg</Text>}
                                                    {item.height && <Text style={styles.planDetailText}>• Altura: {item.height} cm</Text>}
                                                    {item.activity_level && <Text style={styles.planDetailText}>• Nivel Actividad: {item.activity_level}</Text>}
                                                    {item.formula && <Text style={styles.planDetailText}>• Fórmula: {item.formula === 'mifflin' ? 'Mifflin-St Jeor' : item.formula === 'harris' ? 'Harris-Benedict' : 'Tinsley'}</Text>}
                                                    {item.objective && <Text style={styles.planDetailText}>• Objetivo: {item.objective}</Text>}
                                                    {item.caloric_adjustment != null && <Text style={styles.planDetailText}>• Ajuste Calórico: {item.caloric_adjustment} kcal</Text>}
                                                </View>
                                            </View>
                                        )}

                                        {item.meals?.map((meal: any, index: number) => (
                                            <View key={meal.id || index} style={{ marginBottom: 12 }}>
                                                <Text style={{ fontSize: 16, fontWeight: '700', color: Colors.text, marginBottom: 8 }}>{meal.name}</Text>
                                                {meal.foods && meal.foods.length > 0 && (
                                                    <View style={{ paddingLeft: 8 }}>
                                                        {meal.foods.map((food: any, idx: number) => (
                                                            <Text key={food.id || idx} style={{ fontSize: 13, color: '#FFFFFF', marginBottom: 4, fontWeight: '500' }}>
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
                    }}
                />
            )}

            {isCoach && (
                <TouchableOpacity style={styles.fab} onPress={handleCreatePlan}>
                    <Plus size={24} color="#000" />
                </TouchableOpacity>
            )}

        </KeyboardAvoidingView>
    );
}

// ─── Styles ───
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.background },

    // Empty State
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
    emptyIconContainer: { width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.cardBg, justifyContent: 'center', alignItems: 'center', marginBottom: Spacing.md, borderWidth: 1, borderColor: Colors.border },
    emptyText: { color: Colors.text, fontSize: 18, fontWeight: '700' },
    emptySubtext: { color: Colors.textMuted, fontSize: 14, marginTop: 6, marginBottom: Spacing.lg },
    emptyCta: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.primary, paddingHorizontal: 20, paddingVertical: 12, borderRadius: borderRadius.lg },
    emptyCtaText: { color: '#000', fontSize: 18, fontWeight: '700' },

    // Plan Card
    plansList: { padding: Spacing.md, paddingBottom: 100 },
    planCard: { backgroundColor: Colors.cardBg, borderRadius: borderRadius.lg, padding: Spacing.md, marginBottom: 12, borderWidth: 1, borderColor: Colors.border },
    planHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
    planTitle: { color: Colors.text, fontSize: 18, fontWeight: '700' },
    planMacros: { color: Colors.textMuted, fontSize: 14, marginBottom: 12 },
    planMeals: { gap: 6, borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 12 },
    planMealRow: { flexDirection: 'row', justifyContent: 'space-between' },
    planMealTitle: { color: Colors.text, fontSize: 14, fontWeight: '600' },
    planMealFoods: { color: Colors.primary, fontSize: 12 },

    fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 5 },

    planDetailsContainer: {
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        padding: 12,
        borderRadius: 12,
        marginBottom: 16,
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
});
