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
import React, { useCallback, useMemo, useState } from 'react';
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

type WizardStep = 1 | 2 | 3;

const STEP_TITLES: Record<WizardStep, string> = {
    1: 'Datos del Plan',
    2: 'Tiempos de Comida',
    3: 'Agregar Alimentos',
};

// ─── Step Indicator ───────────────────────────────────────────────────────────
const StepIndicator = ({ current, total }: { current: number; total: number }) => (
    <View style={styles.stepIndicator}>
        {Array.from({ length: total }, (_, i) => (
            <View
                key={i}
                style={[
                    styles.stepDot,
                    i + 1 === current && styles.stepDotActive,
                    i + 1 < current && styles.stepDotDone,
                ]}
            />
        ))}
    </View>
);

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function NutritionScreen() {
    const { plans, fetchPlans, addPlan, deletePlan, searchFoods, getFoodDetails } = useNutrition();
    const { currentUser, clients } = useUser();

    const [refreshing, setRefreshing] = useState(false);
    const [showWizard, setShowWizard] = useState(false);
    const [step, setStep] = useState<WizardStep>(1);

    // Wizard State - Step 1
    const [assignedClientId, setAssignedClientId] = useState<string | null>(null);
    const [planName, setPlanName] = useState('');
    const [planDescription, setPlanDescription] = useState('');

    // Wizard State - Step 2 (Comidas)
    const [meals, setMeals] = useState<Omit<NutritionPlanMeal, 'id'>[]>([
        { name: 'Desayuno', foods: [] },
        { name: 'Almuerzo', foods: [] },
        { name: 'Cena', foods: [] }
    ]);

    // Wizard State - Step 3 (Alimentos)
    const [selectedMealIdx, setSelectedMealIdx] = useState<number>(0);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<FatSecretFood[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    const isCoach = currentUser?.role === 'coach';

    // Filters
    const filteredPlans = useMemo(() => {
        if (!currentUser) return [];
        if (isCoach) return plans; // El coach ve los planes que ha creado
        return plans.filter(p => String(p.client_id) === String(currentUser.id));
    }, [plans, currentUser, isCoach]);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await fetchPlans();
        setRefreshing(false);
    }, [fetchPlans]);

    const openWizard = () => {
        setStep(1);
        setAssignedClientId(null);
        setPlanName('');
        setPlanDescription('');
        setMeals([
            { name: 'Desayuno', foods: [] },
            { name: 'Almuerzo', foods: [] },
            { name: 'Cena', foods: [] }
        ]);
        setSearchQuery('');
        setSearchResults([]);
        setShowWizard(true);
    };

    const closeWizard = () => {
        setShowWizard(false);
    };

    const handleSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        const results = await searchFoods(searchQuery);
        setSearchResults(results);
        setIsSearching(false);
    };

    const parseFatSecretNutrients = (description: string) => {
        let macrosDict = { calories: 0, fat: 0, carbs: 0, protein: 0 };
        if (!description) return macrosDict;

        const matchCalories = description.match(/Calories:\s*([\d.]+)kcal/i);
        const matchFat = description.match(/Fat:\s*([\d.]+)g/i);
        const matchCarbs = description.match(/Carbs:\s*([\d.]+)g/i);
        const matchProtein = description.match(/Protein:\s*([\d.]+)g/i);

        if (matchCalories) macrosDict.calories = parseFloat(matchCalories[1]) || 0;
        if (matchFat) macrosDict.fat = parseFloat(matchFat[1]) || 0;
        if (matchCarbs) macrosDict.carbs = parseFloat(matchCarbs[1]) || 0;
        if (matchProtein) macrosDict.protein = parseFloat(matchProtein[1]) || 0;

        return macrosDict;
    };

    const handleUpdateServing = (mealIdx: number, foodIdx: number, newServing: number) => {
        const updatedMeals = [...meals];
        const food = updatedMeals[mealIdx].foods[foodIdx];

        if (food.base_calories === undefined) {
            const ratioTo100g = 100 / food.serving_size;
            food.base_calories = food.calories * ratioTo100g;
            food.base_protein = food.protein * ratioTo100g;
            food.base_carbs = food.carbs * ratioTo100g;
            food.base_fat = food.fat * ratioTo100g;
        }

        const ratio = newServing / 100;

        food.serving_size = newServing;
        food.calories = food.base_calories! * ratio;
        food.protein = food.base_protein! * ratio;
        food.carbs = food.base_carbs! * ratio;
        food.fat = food.base_fat! * ratio;

        setMeals(updatedMeals);
    };

    const handleAddFood = async (food: FatSecretFood) => {
        try {
            const macros = parseFatSecretNutrients(food.food_description);

            const newFood: MealFood = {
                fatsecret_food_id: food.food_id,
                name: food.food_name,
                serving_size: 100,
                serving_unit: 'g',
                calories: macros.calories,
                protein: macros.protein,
                carbs: macros.carbs,
                fat: macros.fat,
                base_calories: macros.calories,
                base_protein: macros.protein,
                base_carbs: macros.carbs,
                base_fat: macros.fat,
            };

            const updatedMeals = [...meals];
            updatedMeals[selectedMealIdx].foods.push(newFood);
            setMeals(updatedMeals);
            showToast.success('Alimento agregado a ' + updatedMeals[selectedMealIdx].name);
        } catch (error) {
            showToast.error('Error al agregar alimento');
        }
    };

    const handleRemoveFood = (mealIdx: number, foodIdx: number) => {
        const updatedMeals = [...meals];
        updatedMeals[mealIdx].foods.splice(foodIdx, 1);
        setMeals(updatedMeals);
    };

    const addMealItem = () => {
        setMeals([...meals, { name: 'Comida Extra', foods: [] }]);
    };

    const calculateTotals = () => {
        let cal = 0, pro = 0, carb = 0, fat = 0;
        meals.forEach(m => {
            m.foods.forEach(f => {
                cal += f.calories;
                pro += f.protein;
                carb += f.carbs;
                fat += f.fat;
            });
        });
        return { cal, pro, carb, fat };
    };

    const savePlan = async () => {
        if (!planName.trim()) {
            Alert.alert('Error', 'Ingresa un nombre para el plan.');
            return;
        }

        const totals = calculateTotals();
        const payload: Omit<NutritionPlan, 'id' | 'created_at' | 'updated_at'> = {
            coach_id: currentUser?.id || '0',
            client_id: assignedClientId,
            name: planName,
            description: planDescription,
            total_calories: totals.cal,
            total_protein: totals.pro,
            total_carbs: totals.carb,
            total_fat: totals.fat,
            meals: meals
        };

        try {
            await addPlan(payload);
            closeWizard();
        } catch (error) {
            // Toast handled by context
        }
    };

    const goNext = () => {
        if (step === 1 && !planName.trim()) {
            Alert.alert('Requerido', 'Por favor ingresa un nombre para el plan.');
            return;
        }
        if (step < 3) setStep((s) => (s + 1) as WizardStep);
    };

    const goBack = () => {
        if (step > 1) setStep((s) => (s - 1) as WizardStep);
    };

    // Render Steps
    const renderStep1 = () => (
        <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.stepLabel}>🎯 ¿Para quién es esta dieta?</Text>
            {isCoach && (
                <View style={styles.clientSelector}>
                    {clients.map((client: any) => (
                        <TouchableOpacity
                            key={client.id}
                            style={[styles.clientChip, assignedClientId === client.id && styles.clientChipActive]}
                            onPress={() => setAssignedClientId(client.id)}
                        >
                            <Text style={[styles.clientChipText, assignedClientId === client.id && styles.clientChipTextActive]}>
                                {client.name.split(' ')[0]}
                            </Text>
                        </TouchableOpacity>
                    ))}
                    <TouchableOpacity
                        style={[styles.clientChip, assignedClientId === null && styles.clientChipActive]}
                        onPress={() => setAssignedClientId(null)}
                    >
                        <Text style={[styles.clientChipText, assignedClientId === null && styles.clientChipTextActive]}>Template</Text>
                    </TouchableOpacity>
                </View>
            )}

            <Text style={[styles.stepLabel, { marginTop: Spacing.lg }]}>📋 Nombre del Plan</Text>
            <TextInput
                style={styles.input}
                placeholder="Ej. Plan Volumen"
                placeholderTextColor={Colors.textMuted}
                value={planName}
                onChangeText={setPlanName}
            />

            <Text style={[styles.stepLabel, { marginTop: Spacing.lg }]}>📝 Descripción</Text>
            <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                placeholder="Objetivos o notas generales..."
                placeholderTextColor={Colors.textMuted}
                value={planDescription}
                onChangeText={setPlanDescription}
                multiline
            />
        </ScrollView>
    );

    const renderStep2 = () => (
        <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.stepLabel}>🍽️ Configura las Comidas</Text>
            {meals.map((meal, idx) => (
                <View key={idx} style={styles.mealConfigCard}>
                    <TextInput
                        style={styles.mealInput}
                        value={meal.name}
                        onChangeText={(val) => {
                            const updated = [...meals];
                            updated[idx].name = val;
                            setMeals(updated);
                        }}
                    />
                    <TouchableOpacity
                        onPress={() => {
                            const updated = meals.filter((_, i) => i !== idx);
                            setMeals(updated);
                        }}
                    >
                        <Trash2 size={20} color={Colors.danger} />
                    </TouchableOpacity>
                </View>
            ))}
            <TouchableOpacity style={styles.addMealBtn} onPress={addMealItem}>
                <Plus size={16} color={Colors.primary} />
                <Text style={styles.addMealBtnText}>Añadir tiempo de comida</Text>
            </TouchableOpacity>
        </ScrollView>
    );

    const renderStep3 = () => (
        <View style={styles.stepContent}>
            <Text style={styles.stepLabel}>🥗 Buscar y Agregar Alimentos</Text>

            {/* Meal Selector */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16, maxHeight: 40 }}>
                {meals.map((meal, idx) => (
                    <TouchableOpacity
                        key={idx}
                        style={[styles.mealChip, selectedMealIdx === idx && styles.mealChipActive]}
                        onPress={() => setSelectedMealIdx(idx)}
                    >
                        <Text style={[styles.mealChipText, selectedMealIdx === idx && styles.mealChipTextActive]}>
                            {meal.name}
                        </Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {/* Current Meal Foods */}
            <View style={styles.currentMealContainer}>
                <Text style={styles.currentMealTitle}>En {meals[selectedMealIdx].name}:</Text>
                {meals[selectedMealIdx].foods.length === 0 ? (
                    <Text style={styles.noFoodsText}>Sin alimentos agregados.</Text>
                ) : (
                    meals[selectedMealIdx].foods.map((f, fIdx) => (
                        <View key={fIdx} style={styles.foodRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.foodRowName}>{f.name}</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                    <TextInput
                                        style={styles.gramsInput}
                                        keyboardType="numeric"
                                        value={f.serving_size?.toString()}
                                        onChangeText={(val) => handleUpdateServing(selectedMealIdx, fIdx, parseFloat(val) || 0)}
                                    />
                                    <Text style={styles.gramsLabel}>{f.serving_unit} · {Math.round(f.calories)} kcal</Text>
                                </View>
                            </View>
                            <TouchableOpacity onPress={() => handleRemoveFood(selectedMealIdx, fIdx)}>
                                <X size={20} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    ))
                )}
            </View>

            {/* USDA Search Form */}
            <View style={styles.searchRow}>
                <TextInput
                    style={styles.searchInput}
                    placeholder="Ej. Pechuga de pollo asada"
                    placeholderTextColor={Colors.textMuted}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                />
                <TouchableOpacity style={styles.searchBtn} onPress={handleSearch} disabled={isSearching}>
                    <Search size={20} color="#000" />
                </TouchableOpacity>
            </View>

            {isSearching && <Text style={{ color: Colors.primary, marginVertical: 10 }}>Buscando...</Text>}

            {/* Search Results */}
            <FlatList
                data={searchResults}
                keyExtractor={(item) => item.food_id.toString()}
                renderItem={({ item }) => (
                    <View style={styles.searchResultItem}>
                        <View style={{ flex: 1, paddingRight: 10 }}>
                            <Text style={styles.resultName}>{item.food_name}</Text>
                            <Text style={styles.resultDesc} numberOfLines={2}>{item.food_description}</Text>
                        </View>
                        <TouchableOpacity style={styles.addFoodBtn} onPress={() => handleAddFood(item)}>
                            <Plus size={16} color={Colors.primary} />
                        </TouchableOpacity>
                    </View>
                )}
                contentContainerStyle={{ paddingBottom: 60 }}
                showsVerticalScrollIndicator={false}
            />
        </View>
    );

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

            {filteredPlans.length === 0 ? (
                <ScrollView contentContainerStyle={styles.emptyState} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}>
                    <View style={styles.emptyIconContainer}>
                        <Apple size={36} color={Colors.textMuted} />
                    </View>
                    <Text style={styles.emptyText}>Sin dietas todavía</Text>
                    <Text style={styles.emptySubtext}>Crea o asigna el primer plan de nutrición</Text>
                    {isCoach && (
                        <TouchableOpacity style={styles.emptyCta} onPress={openWizard}>
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
                    renderItem={({ item }) => (
                        <View style={styles.planCard}>
                            <View style={styles.planHeader}>
                                <Text style={styles.planTitle}>{item.name}</Text>
                                {isCoach && (
                                    <TouchableOpacity onPress={() => deletePlan(item.id)}>
                                        <Trash2 size={18} color={Colors.danger} />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <Text style={styles.planMacros}>🍎 {Math.round(item.total_calories)} kcal · P: {Math.round(item.total_protein)}g · C: {Math.round(item.total_carbs)}g</Text>
                            <View style={styles.planMeals}>
                                {item.meals.map((m, i) => (
                                    <View key={i} style={styles.planMealRow}>
                                        <Text style={styles.planMealTitle}>{m.name}</Text>
                                        <Text style={styles.planMealFoods}>{m.foods.length} alimentos</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                />
            )}

            {isCoach && (
                <TouchableOpacity style={styles.fab} onPress={openWizard}>
                    <Plus size={24} color="#000" />
                </TouchableOpacity>
            )}

            <Modal visible={showWizard} animationType="slide" transparent>
                <View style={styles.wizardOverlay}>
                    <KeyboardAvoidingView style={styles.wizardContent} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                        <View style={styles.wizardHandle} />
                        <View style={styles.wizardHeader}>
                            <View>
                                <Text style={styles.wizardTitle}>{STEP_TITLES[step]}</Text>
                                <Text style={styles.wizardStep}>Paso {step} de 3</Text>
                            </View>
                            <TouchableOpacity style={styles.wizardClose} onPress={closeWizard}>
                                <X size={18} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <StepIndicator current={step} total={3} />

                        <View style={styles.wizardBody}>
                            {step === 1 && renderStep1()}
                            {step === 2 && renderStep2()}
                            {step === 3 && renderStep3()}
                        </View>

                        <View style={styles.wizardFooter}>
                            {step > 1 ? (
                                <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                                    <ArrowLeft size={16} color={Colors.text} />
                                    <Text style={styles.backBtnText}>Atrás</Text>
                                </TouchableOpacity>
                            ) : <View />}

                            {step < 3 ? (
                                <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
                                    <Text style={styles.nextBtnText}>Siguiente</Text>
                                    <ArrowRight size={16} color="#000" />
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.nextBtn} onPress={savePlan}>
                                    <Check size={16} color="#000" />
                                    <Text style={styles.nextBtnText}>Guardar</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>
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

    // Wizard
    wizardOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    wizardContent: { backgroundColor: Colors.surface, borderTopLeftRadius: borderRadius.xl, borderTopRightRadius: borderRadius.xl, height: '85%' },
    wizardHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: Colors.border, alignSelf: 'center', marginVertical: Spacing.sm },
    wizardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: Spacing.md, marginBottom: Spacing.sm },
    wizardTitle: { color: Colors.text, fontSize: 22, fontWeight: '800' },
    wizardStep: { color: Colors.textMuted, fontSize: 16, marginTop: 2 },
    wizardClose: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surfaceLight, justifyContent: 'center', alignItems: 'center' },

    stepIndicator: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: Spacing.md, paddingHorizontal: Spacing.md },
    stepDot: { flex: 1, height: 3, borderRadius: 2, backgroundColor: Colors.border },
    stepDotActive: { backgroundColor: Colors.primary },
    stepDotDone: { backgroundColor: 'rgba(191, 255, 10, 0.35)' },

    wizardBody: { flex: 1, paddingHorizontal: Spacing.md },
    stepContent: { flex: 1 },
    stepLabel: { color: Colors.text, fontSize: 16, fontWeight: '700', marginBottom: Spacing.sm },

    input: { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, borderRadius: borderRadius.md, paddingHorizontal: 16, paddingVertical: 12, color: Colors.text, fontSize: 16 },

    clientSelector: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    clientChip: { backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 16, paddingVertical: 10, borderRadius: borderRadius.md },
    clientChipActive: { backgroundColor: 'rgba(191,255,10,0.1)', borderColor: Colors.primary },
    clientChipText: { color: Colors.textMuted, fontWeight: '600' },
    clientChipTextActive: { color: Colors.primary },

    mealConfigCard: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12, backgroundColor: Colors.cardBg, padding: 12, borderRadius: borderRadius.md, borderWidth: 1, borderColor: Colors.border },
    mealInput: { flex: 1, color: Colors.text, fontSize: 16 },
    addMealBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, justifyContent: 'center', borderRadius: borderRadius.md, backgroundColor: Colors.surfaceLight },
    addMealBtnText: { color: Colors.primary, fontWeight: '600' },

    mealChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: borderRadius.full, backgroundColor: Colors.surfaceLight, marginRight: 8 },
    mealChipActive: { backgroundColor: Colors.primary },
    mealChipText: { color: Colors.textMuted, fontWeight: '600' },
    mealChipTextActive: { color: '#000' },

    currentMealContainer: { backgroundColor: Colors.surfaceLight, padding: 12, borderRadius: borderRadius.md, marginBottom: 16 },
    currentMealTitle: { color: Colors.text, fontWeight: '700', marginBottom: 8 },
    noFoodsText: { color: Colors.textMuted, fontStyle: 'italic', fontSize: 12 },
    foodRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: Colors.border, paddingVertical: 8 },
    foodRowName: { color: Colors.text, fontWeight: '600', fontSize: 14 },
    foodRowSub: { color: Colors.textMuted, fontSize: 12 },
    gramsInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, width: 60, textAlign: 'center', fontSize: 13, backgroundColor: Colors.cardBg, color: Colors.text },
    gramsLabel: { fontSize: 12, color: Colors.textMuted, marginLeft: 6 },

    searchRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
    searchInput: { flex: 1, backgroundColor: Colors.cardBg, borderWidth: 1, borderColor: Colors.border, borderRadius: borderRadius.md, paddingHorizontal: 16, color: Colors.text },
    searchBtn: { backgroundColor: Colors.primary, width: 48, borderRadius: borderRadius.md, alignItems: 'center', justifyContent: 'center' },

    searchResultItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.cardBg, padding: 12, borderRadius: borderRadius.md, marginBottom: 8, borderWidth: 1, borderColor: Colors.border },
    resultName: { color: Colors.text, fontWeight: '600', fontSize: 14 },
    resultDesc: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },
    addFoodBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surfaceLight, justifyContent: 'center', alignItems: 'center' },

    // Footer
    wizardFooter: { flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.md, borderTopWidth: 1, borderTopColor: Colors.border },
    backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: Colors.surfaceLight, borderRadius: borderRadius.md },
    backBtnText: { color: Colors.text, fontWeight: '600' },
    nextBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: Colors.primary, borderRadius: borderRadius.md },
    nextBtnText: { color: '#000', fontWeight: '700' },
});
