import { Colors, Spacing, MuscleGroupColors } from '@/constants/theme';
import { useUser } from '@/context/UserContext';
import { saveNutritionPlan, searchFatSecretFoods } from '@/services/api';
import { showToast } from '@/services/toast';
import { Picker } from '@react-native-picker/picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calculator, Plus, Save, Search, X } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Keyboard,
} from 'react-native';
import PieChart from 'react-native-pie-chart';

interface FoodItem {
    id: string;
    name: string;
    servingSize: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    unit?: string; // e.g. 'g' or 'pz'
    amountMultiplier?: number; // Cals/macros multiplier
    amountText?: string; // Stores the raw string input to fix deletion issues in UI
}

interface Meal {
    id: string;
    name: string;
    foods: FoodItem[];
}

export default function NutritionCalculatorScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { clients } = useUser();

    const client = clients.find(c => c.id === id);

    // Form inputs
    const [gender, setGender] = useState('Hombre');
    const [weight, setWeight] = useState(client?.weight?.toString() || '');
    const [height, setHeight] = useState(client?.height?.toString() || '');
    const [age, setAge] = useState(client?.age?.toString() || '');

    const [activityLevel, setActivityLevel] = useState('1.2');
    const [formula, setFormula] = useState('mifflin');
    const [objective, setObjective] = useState('Mantenimiento');
    const [caloricAdjustment, setCaloricAdjustment] = useState('0');

    // Macro adjustment settings
    const [proteinPerKg, setProteinPerKg] = useState('2.2');
    const [lipidsPerKg, setLipidsPerKg] = useState('0.8');

    // Computed values
    const [tdee, setTdee] = useState(0);
    const [targetCalories, setTargetCalories] = useState(0);
    const [macros, setMacros] = useState({
        proteinGrams: 0,
        proteinCals: 0,
        lipidGrams: 0,
        lipidCals: 0,
        carbGrams: 0,
        carbCals: 0
    });

    // Diet Builder State
    const [meals, setMeals] = useState<Meal[]>([
        { id: 'desayuno', name: 'Desayuno', foods: [] },
        { id: 'almuerzo', name: 'Almuerzo', foods: [] },
        { id: 'cena', name: 'Cena', foods: [] }
    ]);

    // Modal Search State
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [activeMealId, setActiveMealId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        if (client) {
            setWeight(client.weight?.toString() || '');
            setHeight(client.height?.toString() || '');
            setAge(client.age?.toString() || '');
        }
    }, [client]);

    const calculateRequirements = () => {
        const w = parseFloat(weight);
        const h = parseFloat(height);
        const a = parseInt(age);
        const activity = parseFloat(activityLevel);
        const adjustment = parseFloat(caloricAdjustment) || 0;

        if (!w || !h || !a) {
            Alert.alert('Error', 'Por favor ingresa peso, altura y edad.');
            return;
        }

        let rmr = 0;

        if (formula === 'mifflin') {
            if (gender === 'Hombre') {
                rmr = (10 * w) + (6.25 * h) - (5 * a) + 5;
            } else {
                rmr = (10 * w) + (6.25 * h) - (5 * a) - 161;
            }
        } else if (formula === 'harris') {
            if (gender === 'Hombre') {
                rmr = 66.5 + (13.75 * w) + (5.003 * h) - (6.75 * a);
            } else {
                rmr = 655.1 + (9.563 * w) + (1.850 * h) - (4.676 * a);
            }
        } else if (formula === 'tinsley') {
            rmr = (24.8 * w) + 10;
        }

        const calculatedTdee = Math.round(rmr * activity);
        const calculatedTarget = calculatedTdee + adjustment;

        setTdee(calculatedTdee);
        setTargetCalories(calculatedTarget);

        calculateMacros(calculatedTarget, w);
    };

    const calculateMacros = (totalCal: number, w: number) => {
        const pPerKg = parseFloat(proteinPerKg) || 0;
        const lPerKg = parseFloat(lipidsPerKg) || 0;

        const pGrams = pPerKg * w;
        const pCals = pGrams * 4;

        const lGrams = lPerKg * w;
        const lCals = lGrams * 9;

        const remainingCals = totalCal - pCals - lCals;
        const cCals = Math.max(0, remainingCals);
        const cGrams = cCals / 4;

        setMacros({
            proteinGrams: pGrams,
            proteinCals: pCals,
            lipidGrams: lGrams,
            lipidCals: lCals,
            carbGrams: cGrams,
            carbCals: cCals
        });
    };

    useEffect(() => {
        if (targetCalories > 0 && weight) {
            calculateMacros(targetCalories, parseFloat(weight));
        }
    }, [proteinPerKg, lipidsPerKg, targetCalories]);

    // Diet Builder Logic
    const openSearchForMeal = (mealId: string) => {
        setActiveMealId(mealId);
        setSearchQuery('');
        setSearchResults([]);
        setIsSearchModalOpen(true);
    };

    const performSearch = async () => {
        if (!searchQuery.trim()) return;
        setIsSearching(true);
        try {
            const data = await searchFatSecretFoods(searchQuery);
            console.log("Raw FatSecret Response:", JSON.stringify(data, null, 2));
            const foods = data || [];
            setSearchResults(Array.isArray(foods) ? foods : [foods]);
        } catch (error) {
            Alert.alert('Error', 'No se pudieron buscar los alimentos');
        } finally {
            setIsSearching(false);
        }
    };

    const parseFatSecretNutrients = (description: string) => {
        let macrosDict = { calories: 0, fat: 0, carbs: 0, protein: 0 };
        if (!description) return macrosDict;

        const matchCalories = description.match(/(?:Calories|Calorías):\s*([\d.,]+)\s*kcal/i);
        const matchFat = description.match(/(?:Fat|Grasa):\s*([\d.,]+)\s*g/i);
        const matchCarbs = description.match(/(?:Carbs|Carbh|Carbohidratos):\s*([\d.,]+)\s*g/i);
        const matchProtein = description.match(/(?:Protein|Prot|Proteína):\s*([\d.,]+)\s*g/i);

        if (matchCalories) macrosDict.calories = parseFloat(matchCalories[1].replace(',', '.')) || 0;
        if (matchFat) macrosDict.fat = parseFloat(matchFat[1].replace(',', '.')) || 0;
        if (matchCarbs) macrosDict.carbs = parseFloat(matchCarbs[1].replace(',', '.')) || 0;
        if (matchProtein) macrosDict.protein = parseFloat(matchProtein[1].replace(',', '.')) || 0;

        return macrosDict;
    };

    const addFoodToMeal = (foodData: any) => {
        const parsed = parseFatSecretNutrients(foodData.food_description);

        const newFood: FoodItem = {
            id: foodData.food_id?.toString() || Math.random().toString(),
            name: foodData.food_name || 'Unknown Food',
            servingSize: '100g',
            calories: parsed.calories,
            fat: parsed.fat,
            carbs: parsed.carbs,
            protein: parsed.protein,
            unit: 'g',
            amountMultiplier: 1,
            amountText: '100',
        };

        setMeals(prev => prev.map(m => {
            if (m.id === activeMealId) {
                return { ...m, foods: [...m.foods, newFood] };
            }
            return m;
        }));

        Keyboard.dismiss();
        setIsSearchModalOpen(false);
        showToast.success('Alimento añadido a ' + activeMealId);
    };

    const removeFoodFromMeal = (mealId: string, index: number) => {
        setMeals(prev => prev.map(m => {
            if (m.id === mealId) {
                const newFoods = [...m.foods];
                newFoods.splice(index, 1);
                return { ...m, foods: newFoods };
            }
            return m;
        }));
    };

    const updateFoodAmount = (mealId: string, index: number, textValue: string) => {
        setMeals(prev => prev.map(m => {
            if (m.id === mealId) {
                const newFoods = [...m.foods];
                newFoods[index].amountText = textValue;
                const parsed = parseFloat(textValue.replace(',', '.'));
                const value = isNaN(parsed) ? 0 : parsed;

                if (newFoods[index].unit === 'pz') {
                    newFoods[index].amountMultiplier = value;
                } else {
                    newFoods[index].amountMultiplier = value / 100;
                }
                return { ...m, foods: newFoods };
            }
            return m;
        }));
    };

    const toggleFoodUnit = (mealId: string, index: number) => {
        setMeals(prev => prev.map(m => {
            if (m.id === mealId) {
                const newFoods = [...m.foods];
                const currentFood = { ...newFoods[index] }; // create shallow copy
                const currentUnit = currentFood.unit || 'g';
                if (currentUnit === 'g') {
                    currentFood.unit = 'pz';
                    currentFood.amountMultiplier = 1; // Default to 1 piece
                    currentFood.amountText = '1';
                } else {
                    currentFood.unit = 'g';
                    currentFood.amountMultiplier = 1; // Default to 100g
                    currentFood.amountText = '100';
                }
                newFoods[index] = currentFood;
                return { ...m, foods: newFoods };
            }
            return m;
        }));
    };

    const handleSavePlan = async () => {
        try {
            const planData = {
                client_id: id,
                gender,
                weight: parseFloat(weight),
                height: parseFloat(height),
                age: parseInt(age),
                activity_level: parseFloat(activityLevel),
                formula,
                objective,
                caloric_adjustment: parseFloat(caloricAdjustment),
                tdee,
                target_calories: targetCalories,
                protein_per_kg: parseFloat(proteinPerKg),
                lipids_per_kg: parseFloat(lipidsPerKg),
                protein_grams: macros.proteinGrams,
                lipid_grams: macros.lipidGrams,
                carb_grams: macros.carbGrams,
                meals_data: JSON.stringify(meals), // Stored as JSON string
                date: new Date().toISOString().split('T')[0]
            };

            await saveNutritionPlan(planData);
            showToast.success('Plan nutricional guardado correctamente.');
        } catch (error) {
            Alert.alert('Error', 'Hubo un error al guardar el plan en el servidor.');
        }
    };

    // Calculate Global Accumulators
    const totalAccumulated = meals.reduce((acc, meal) => {
        meal.foods.forEach(f => {
            const mult = f.amountMultiplier || 1;
            acc.calories += f.calories * mult;
            acc.protein += f.protein * mult;
            acc.carbs += f.carbs * mult;
            acc.fat += f.fat * mult;
        });
        return acc;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

    if (!client) {
        return (
            <View style={styles.container}>
                <Text style={{ marginTop: 50, textAlign: 'center' }}>Cargando cliente...</Text>
            </View>
        );
    }

    const series = [
        { value: Math.max(1, macros.proteinCals), color: MuscleGroupColors['Pecho'] || Colors.danger },         // Using Red for Protein
        { value: Math.max(1, macros.carbCals), color: MuscleGroupColors['Hombros'] || Colors.accent },     // Using Yellow/Accent for Carbs
        { value: Math.max(1, macros.lipidCals), color: MuscleGroupColors['Cuádriceps'] || '#00C853' } // Using Blue/Green for Fats
    ];

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <Stack.Screen options={{ headerShown: false }} />
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Plan de Alimentación</Text>

                {tdee > 0 ? (
                    <TouchableOpacity onPress={handleSavePlan} style={styles.saveBtnTop}>
                        <Save size={20} color={Colors.primary} />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 24 }} />
                )}
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* 1. Form Section */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>1. Datos Básicos</Text>

                    <Text style={styles.label}>Género:</Text>
                    <View style={styles.pickerContainer}>
                        <Picker selectedValue={gender} onValueChange={setGender} style={styles.picker}>
                            <Picker.Item label="Hombre" value="Hombre" />
                            <Picker.Item label="Mujer" value="Mujer" />
                        </Picker>
                    </View>

                    <View style={styles.row}>
                        <View style={styles.col}>
                            <Text style={styles.label}>Peso (kg):</Text>
                            <TextInput style={styles.input} keyboardType="numeric" value={weight} onChangeText={setWeight} />
                        </View>
                        <View style={styles.col}>
                            <Text style={styles.label}>Altura (cm):</Text>
                            <TextInput style={styles.input} keyboardType="numeric" value={height} onChangeText={setHeight} />
                        </View>
                    </View>

                    <View style={styles.row}>
                        <View style={styles.col}>
                            <Text style={styles.label}>Edad (años):</Text>
                            <TextInput style={styles.input} keyboardType="numeric" value={age} onChangeText={setAge} />
                        </View>
                        <View style={styles.col}>
                            <Text style={styles.label}>Nivel de Actividad:</Text>
                            <View style={[styles.pickerContainer, { marginTop: 0, marginBottom: 12 }]}>
                                <Picker selectedValue={activityLevel} onValueChange={setActivityLevel} style={styles.picker}>
                                    <Picker.Item label="Sedentario (1.2)" value="1.2" />
                                    <Picker.Item label="Ligero (1.375)" value="1.375" />
                                    <Picker.Item label="Moderado (1.55)" value="1.55" />
                                    <Picker.Item label="Fuerte (1.725)" value="1.725" />
                                    <Picker.Item label="Muy Fuerte (1.9)" value="1.9" />
                                </Picker>
                            </View>
                        </View>
                    </View>

                    <Text style={styles.label}>Fórmula de Gasto Calórico:</Text>
                    <View style={styles.pickerContainer}>
                        <Picker selectedValue={formula} onValueChange={setFormula} style={styles.picker}>
                            <Picker.Item label="Mifflin-St Jeor" value="mifflin" />
                            <Picker.Item label="Harris-Benedict" value="harris" />
                            <Picker.Item label="Tinsley" value="tinsley" />
                        </Picker>
                    </View>

                    <Text style={styles.label}>Objetivo:</Text>
                    <View style={styles.pickerContainer}>
                        <Picker selectedValue={objective} onValueChange={(val) => {
                            setObjective(val);
                            if (val === 'Mantenimiento') setCaloricAdjustment('0');
                            else if (val === 'Volumen') setCaloricAdjustment('300');
                            else if (val === 'Definición') setCaloricAdjustment('-300');
                        }} style={styles.picker}>
                            <Picker.Item label="Mantenimiento" value="Mantenimiento" />
                            <Picker.Item label="Volumen (+)" value="Volumen" />
                            <Picker.Item label="Definición (-)" value="Definición" />
                        </Picker>
                    </View>

                    <Text style={styles.label}>Ajuste Calórico (kcal):</Text>
                    <TextInput style={styles.input} keyboardType="numbers-and-punctuation" value={caloricAdjustment} onChangeText={setCaloricAdjustment} />

                    <TouchableOpacity style={styles.calcBtn} onPress={calculateRequirements}>
                        <Calculator size={18} color="#fff" />
                        <Text style={styles.calcBtnText}>Calcular Requerimientos</Text>
                    </TouchableOpacity>
                </View>

                {/* 2. Results Section */}
                {tdee > 0 && (
                    <View style={styles.sectionResult}>
                        <Text style={styles.sectionTitleCenter}>2. Tus Requerimientos Nutricionales</Text>
                        <Text style={styles.subtitleCenter}>
                            Aquí tienes un resumen de las necesidades calóricas del cliente y la distribución de macronutrientes calculada.
                        </Text>

                        <Text style={styles.resultTitle}>Resumen de Calorías y Macros</Text>

                        <View style={styles.statsRow}>
                            <Text style={styles.macroBoldMuted}>TDEE (Gasto Calórico Total): </Text>
                            <Text style={styles.macroValue}>{tdee} kcal</Text>
                        </View>
                        <View style={styles.statsRow}>
                            <Text style={styles.macroBoldMuted}>Calorías Objetivo: </Text>
                            <Text style={styles.macroValue}>{targetCalories} kcal</Text>
                        </View>

                        <View style={{ height: 16 }} />

                        <View style={styles.statsRow}>
                            <Text style={[styles.macroBold, { color: MuscleGroupColors['Pecho'] || Colors.danger }]}>Proteínas: </Text>
                            <Text style={styles.macroValue}>{macros.proteinGrams.toFixed(1)} g ({macros.proteinCals.toFixed(0)} kcal)</Text>
                        </View>
                        <View style={styles.statsRow}>
                            <Text style={[styles.macroBold, { color: MuscleGroupColors['Hombros'] || Colors.accent }]}>Carbohidratos: </Text>
                            <Text style={styles.macroValue}>{macros.carbGrams.toFixed(1)} g ({macros.carbCals.toFixed(0)} kcal)</Text>
                        </View>
                        <View style={styles.statsRow}>
                            <Text style={[styles.macroBold, { color: MuscleGroupColors['Cuádriceps'] || '#00C853' }]}>Lípidos: </Text>
                            <Text style={styles.macroValue}>{macros.lipidGrams.toFixed(1)} g ({macros.lipidCals.toFixed(0)} kcal)</Text>
                        </View>

                        <View style={styles.chartAndAdjustContainer}>
                            {/* Adjustment Box */}
                            <View style={styles.adjustmentBox}>
                                <Text style={styles.adjustmentTitle}>Ajuste de Macros (g/kg)</Text>
                                <Text style={styles.adjustmentSub}>Personaliza la ingesta de proteínas y lípidos por kg de peso corporal.</Text>

                                <View style={styles.adjRow}>
                                    <Text style={styles.adjLabel}>Proteínas (g/kg):</Text>
                                    <TextInput style={styles.adjInput} keyboardType="numeric" value={proteinPerKg} onChangeText={setProteinPerKg} />
                                </View>
                                <View style={styles.adjRow}>
                                    <Text style={styles.adjLabel}>Lípidos (g/kg):</Text>
                                    <TextInput style={styles.adjInput} keyboardType="numeric" value={lipidsPerKg} onChangeText={setLipidsPerKg} />
                                </View>
                                <View style={styles.adjRow}>
                                    <Text style={styles.adjLabel}>Carbohidratos (g/kg):</Text>
                                    <TextInput style={[styles.adjInput, { backgroundColor: Colors.surface, color: Colors.textMuted }]} editable={false} value={(macros.carbGrams / parseFloat(weight)).toFixed(1)} />
                                </View>
                            </View>

                            {/* Donut Chart */}
                            <View style={styles.chartBox}>
                                <PieChart
                                    widthAndHeight={140}
                                    series={series}
                                    cover={{ radius: 0.5, color: Colors.background }}
                                />
                                <View style={styles.legendRow}>
                                    <View style={[styles.legendDot, { backgroundColor: MuscleGroupColors['Pecho'] || Colors.danger }]} /><Text style={styles.legendText}>Proteínas</Text>
                                    <View style={[styles.legendDot, { backgroundColor: MuscleGroupColors['Hombros'] || Colors.accent }]} /><Text style={styles.legendText}>Carbohidratos</Text>
                                </View>
                                <View style={styles.legendRow}>
                                    <View style={[styles.legendDot, { backgroundColor: MuscleGroupColors['Cuádriceps'] || '#00C853' }]} /><Text style={styles.legendText}>Lípidos</Text>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {/* 3. Meal Builder Section */}
                {tdee > 0 && (
                    <View style={styles.dietBuilderSection}>
                        <View style={styles.builderHeader}>
                            <Text style={styles.builderTitle}>3. Planificador de Comidas</Text>

                            <View style={styles.accumulatedTotalsBox}>
                                <View style={styles.accCol}>
                                    <Text style={styles.accLabel}>Cals</Text>
                                    <Text style={[styles.accValue, totalAccumulated.calories > targetCalories ? { color: Colors.danger } : { color: Colors.text }]}>
                                        {totalAccumulated.calories.toFixed(0)} <Text style={{ fontSize: 10, color: Colors.textMuted }}>/{targetCalories}</Text>
                                    </Text>
                                </View>
                                <View style={styles.accCol}>
                                    <Text style={styles.accLabel}>Prot</Text>
                                    <Text style={styles.accValue}>{totalAccumulated.protein.toFixed(1)}g</Text>
                                </View>
                                <View style={styles.accCol}>
                                    <Text style={styles.accLabel}>Carb</Text>
                                    <Text style={styles.accValue}>{totalAccumulated.carbs.toFixed(1)}g</Text>
                                </View>
                                <View style={styles.accCol}>
                                    <Text style={styles.accLabel}>Gras</Text>
                                    <Text style={styles.accValue}>{totalAccumulated.fat.toFixed(1)}g</Text>
                                </View>
                            </View>
                        </View>

                        <View style={styles.mealsContainer}>
                            {meals.map(meal => (
                                <View key={meal.id} style={styles.mealCard}>
                                    <View style={styles.mealHeader}>
                                        <Text style={styles.mealName}>{meal.name}</Text>

                                        {/* Subtotal of Meal */}
                                        <View style={styles.mealSubtotals}>
                                            <Text style={styles.mealSubText}>
                                                {meal.foods.reduce((acc, f) => acc + (f.calories * (f.amountMultiplier || 1)), 0).toFixed(0)} kcal
                                            </Text>
                                        </View>
                                    </View>

                                    {meal.foods.length > 0 && (
                                        <View style={styles.foodList}>
                                            {meal.foods.map((food, idx) => (
                                                <View key={idx} style={styles.foodRow}>
                                                    <View style={{ flex: 1, paddingRight: 10 }}>
                                                        <Text style={styles.foodName}>{food.name}</Text>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
                                                            <TextInput
                                                                style={styles.gramsInput}
                                                                keyboardType="numeric"
                                                                value={food.amountText !== undefined ? food.amountText : ((food.unit === 'pz' ? (food.amountMultiplier || 1) : ((food.amountMultiplier || 1) * 100))).toString()}
                                                                onChangeText={(val) => updateFoodAmount(meal.id, idx, val)}
                                                            />
                                                            <TouchableOpacity onPress={() => toggleFoodUnit(meal.id, idx)} style={styles.unitToggle}>
                                                                <Text style={styles.gramsLabel}>{food.unit === 'pz' ? 'pz' : 'g'}</Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
                                                    <View style={styles.foodMacros}>
                                                        <Text style={styles.macroMiniLabel}>P</Text>
                                                        <Text style={styles.macroMiniValue}>{(food.protein * (food.amountMultiplier || 1)).toFixed(1)}</Text>
                                                        <Text style={styles.macroMiniLabel}>C</Text>
                                                        <Text style={styles.macroMiniValue}>{(food.carbs * (food.amountMultiplier || 1)).toFixed(1)}</Text>
                                                        <Text style={styles.macroMiniLabel}>G</Text>
                                                        <Text style={styles.macroMiniValue}>{(food.fat * (food.amountMultiplier || 1)).toFixed(1)}</Text>
                                                    </View>
                                                    <TouchableOpacity style={styles.deleteFoodBtn} onPress={() => removeFoodFromMeal(meal.id, idx)}>
                                                        <X size={16} color={Colors.danger} />
                                                    </TouchableOpacity>
                                                </View>
                                            ))}
                                        </View>
                                    )}

                                    <TouchableOpacity style={styles.addFoodBtn} onPress={() => openSearchForMeal(meal.id)}>
                                        <Plus size={16} color={Colors.primary} />
                                        <Text style={styles.addFoodText}>Añadir Artículo</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    </View>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

            {/* Food Search Modal */}
            <Modal
                visible={isSearchModalOpen}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setIsSearchModalOpen(false)}
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Buscar Alimento</Text>
                        <TouchableOpacity onPress={() => setIsSearchModalOpen(false)}>
                            <X size={24} color={Colors.text} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.searchBar}>
                        <Search size={20} color={Colors.textMuted} />
                        <TextInput
                            style={styles.searchInput}
                            placeholder="Buscar alimento..."
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            onSubmitEditing={performSearch}
                            autoCapitalize="none"
                            autoFocus
                        />
                        <TouchableOpacity style={styles.searchActionBtn} onPress={performSearch}>
                            <Text style={{ color: '#fff', fontWeight: 'bold' }}>Buscar</Text>
                        </TouchableOpacity>
                    </View>

                    {isSearching ? (
                        <ActivityIndicator style={{ marginTop: 40 }} size="large" color={Colors.primary} />
                    ) : (
                        <ScrollView style={styles.searchResults}>
                            {searchResults.map((item, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    style={styles.searchItem}
                                    onPress={() => addFoodToMeal(item)}
                                >
                                    <Text style={styles.searchItemName}>{item.food_name}</Text>
                                    <Text style={styles.searchItemDesc}>{item.food_description}</Text>
                                </TouchableOpacity>
                            ))}
                            {searchResults.length === 0 && searchQuery !== '' && (
                                <Text style={styles.noResultsText}>No se encontraron resultados para "{searchQuery}"</Text>
                            )}
                        </ScrollView>
                    )}
                </View>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        paddingBottom: 20,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    backBtn: {
        padding: 8,
        backgroundColor: Colors.surfaceLight,
        borderRadius: 12,
    },
    saveBtnTop: {
        padding: 8,
        backgroundColor: Colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: Colors.text,
    },
    scrollContent: {
        padding: Spacing.md,
    },
    section: {
        backgroundColor: Colors.surface,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: 20,
    },
    sectionResult: {
        backgroundColor: Colors.background,
        paddingVertical: 10,
        marginBottom: 20,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: Colors.text,
        marginBottom: 16,
    },
    sectionTitleCenter: {
        fontSize: 20,
        fontWeight: '900',
        color: Colors.primary,
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitleCenter: {
        fontSize: 13,
        color: Colors.textMuted,
        textAlign: 'center',
        marginBottom: 24,
        lineHeight: 20,
    },
    unitToggle: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: Colors.surface,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: Colors.border,
        marginLeft: 4,
    },
    label: {
        fontSize: 13,
        fontWeight: '700',
        color: Colors.textMuted,
        marginBottom: 6,
    },
    input: {
        backgroundColor: Colors.surfaceLight,
        borderRadius: 12,
        color: Colors.text,
        fontSize: 15,
        paddingHorizontal: 16,
        paddingVertical: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    pickerContainer: {
        backgroundColor: Colors.surfaceLight,
        borderRadius: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'transparent',
        overflow: 'hidden',
    },
    picker: {
        height: 50,
        color: Colors.text,
        marginHorizontal: 0,
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    col: {
        flex: 1,
    },
    calcBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.primary,
        paddingVertical: 14,
        borderRadius: 12,
        marginTop: 10,
        gap: 8,
    },
    calcBtnText: {
        color: '#fff',
        fontWeight: '800',
        fontSize: 15,
    },
    resultTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: Colors.text,
        marginBottom: 12,
    },
    statsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
    },
    macroBold: {
        fontSize: 15,
        fontWeight: '800',
    },
    macroBoldMuted: {
        fontSize: 15,
        fontWeight: '800',
        color: Colors.primary,
    },
    macroValue: {
        fontSize: 15,
        color: Colors.text,
        fontWeight: '500',
    },
    chartAndAdjustContainer: {
        flexDirection: 'column',
        marginTop: 24,
        gap: 20,
    },
    adjustmentBox: {
        backgroundColor: Colors.surfaceLight,
        borderRadius: 16,
        padding: 16,
    },
    adjustmentTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: Colors.primary,
        marginBottom: 4,
    },
    adjustmentSub: {
        fontSize: 12,
        color: Colors.textMuted,
        marginBottom: 16,
    },
    adjRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    adjLabel: {
        fontSize: 13,
        color: Colors.text,
        fontWeight: '500',
        flex: 1,
    },
    adjInput: {
        backgroundColor: Colors.surface,
        borderRadius: 8,
        width: 100,
        paddingVertical: 8,
        paddingHorizontal: 10,
        textAlign: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
        color: Colors.text,
    },
    chartBox: {
        alignItems: 'center',
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 20,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    legendRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        gap: 12,
    },
    legendDot: {
        width: 12,
        height: 6,
        borderRadius: 3,
        marginRight: -6,
    },
    legendText: {
        fontSize: 11,
        color: Colors.textMuted,
        fontWeight: '600',
    },
    dietBuilderSection: {
        marginTop: 10,
    },
    builderHeader: {
        marginBottom: 20,
    },
    builderTitle: {
        fontSize: 18,
        fontWeight: '900',
        color: Colors.text,
        marginBottom: 12,
    },
    accumulatedTotalsBox: {
        flexDirection: 'row',
        backgroundColor: Colors.surfaceLight,
        padding: 12,
        borderRadius: 12,
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    accCol: {
        alignItems: 'center',
    },
    accLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.textMuted,
        textTransform: 'uppercase',
    },
    accValue: {
        fontSize: 15,
        fontWeight: '900',
        color: Colors.text,
        marginTop: 4,
    },
    mealsContainer: {
        gap: 16,
    },
    mealCard: {
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    mealHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    mealName: {
        fontSize: 16,
        fontWeight: '800',
        color: Colors.text,
    },
    mealSubtotals: {
        backgroundColor: 'rgba(0,0,0,0.05)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
    },
    mealSubText: {
        fontSize: 12,
        fontWeight: '700',
        color: Colors.text,
    },
    foodList: {
        marginBottom: 12,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        paddingTop: 8,
        gap: 8,
    },
    foodRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.background,
        padding: 10,
        borderRadius: 10,
    },
    foodName: {
        fontSize: 13,
        fontWeight: '700',
        color: Colors.primary,
        marginBottom: 2,
    },
    gramsInput: {
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: 6,
        paddingHorizontal: 8,
        paddingVertical: 2,
        width: 60,
        textAlign: 'center',
        fontSize: 12,
        backgroundColor: Colors.surface,
    },
    gramsLabel: {
        fontSize: 12,
        color: Colors.textMuted,
        marginLeft: 4,
    },
    foodMacros: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginRight: 10,
    },
    macroMiniLabel: {
        fontSize: 10,
        color: Colors.textMuted,
        fontWeight: 'bold',
    },
    macroMiniValue: {
        fontSize: 11,
        fontWeight: '700',
        marginRight: 4,
    },
    deleteFoodBtn: {
        padding: 6,
    },
    addFoodBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 8,
    },
    addFoodText: {
        color: Colors.primary,
        fontWeight: '700',
        fontSize: 14,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: Colors.background,
        paddingTop: Platform.OS === 'ios' ? 20 : 0,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: Colors.text,
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        gap: 10,
        backgroundColor: Colors.surface,
    },
    searchInput: {
        flex: 1,
        backgroundColor: Colors.surfaceLight,
        height: 44,
        borderRadius: 10,
        paddingHorizontal: 12,
        fontSize: 15,
        color: Colors.text,
    },
    searchActionBtn: {
        backgroundColor: Colors.primary,
        height: 44,
        paddingHorizontal: 16,
        justifyContent: 'center',
        borderRadius: 10,
    },
    searchResults: {
        flex: 1,
        padding: Spacing.md,
    },
    searchItem: {
        backgroundColor: Colors.surface,
        padding: 16,
        borderRadius: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    searchItemName: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.primary,
        marginBottom: 4,
    },
    searchItemDesc: {
        fontSize: 12,
        color: Colors.textMuted,
    },
    noResultsText: {
        textAlign: 'center',
        marginTop: 40,
        color: Colors.textMuted,
        fontSize: 14,
    }
});
