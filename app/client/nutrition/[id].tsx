import { CatalogFood, FoodPortion } from '@/constants/NutritionTypes';
import { Colors, MuscleGroupColors, Spacing } from '@/constants/theme';
import { useNutrition } from '@/context/NutritionContext';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { saveNutritionPlan, updateNutritionPlan } from '@/services/api';
import { showToast } from '@/services/toast';
import { Picker } from '@react-native-picker/picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
    BookOpen,
    Calculator,
    Check,
    ChevronLeft,
    ClipboardCheck,
    Database,
    Flag,
    Flame,
    Plus,
    RefreshCw,
    Search,
    SlidersHorizontal,
    Trash2,
    User,
    Utensils,
    UtensilsCrossed,
    X,
} from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface FoodItem {
    id: string;
    name: string;
    servingSize: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    unit?: string; // e.g. 'g', 'ml', 'cda', 'taza', 'pz'
    amountMultiplier?: number; // Kept as 1 when macros represent current amountText
    amountText?: string; // Stores the raw string input (supports fractions like '1/2', '1 1/2')
    baseQty?: number;
    baseCalories?: number;
    baseProtein?: number;
    baseCarbs?: number;
    baseFat?: number;
    catalogFoodKey?: string;
}

interface Meal {
    id: string;
    name: string;
    foods: FoodItem[];
}

interface PortionBaseInfo {
    id?: number | string;
    effectiveBaseQty: number;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    hint: string;
}

const FOOD_UNITS = [
    { label: 'Gramos (g)', value: 'g', short: 'g' },
    { label: 'Mililitros (ml)', value: 'ml', short: 'ml' },
    { label: 'Taza (1 taza)', value: 'taza', short: 'taza' },
    { label: 'Pieza (1 pieza)', value: 'pz', short: 'pz' },
    { label: 'Cucharada (1 cda)', value: 'cda', short: 'cda' },
    { label: 'Cucharadita (cdita)', value: 'cdita', short: 'cdita' },
    { label: 'Porción', value: 'porcion', short: 'porc' },
    { label: 'Rebanada', value: 'rebanada', short: 'reb' },
    { label: 'Scoop / Medida', value: 'scoop', short: 'scoop' },
    { label: 'Vaso', value: 'vaso', short: 'vaso' },
    { label: 'Lata', value: 'lata', short: 'lata' },
];

const QUICK_QTY_CHIPS = ['1/4', '1/3', '1/2', '3/4', '1', '1 1/2', '2', '100'];

const safeFloat = (val: any, fallback = 0): number => {
    if (val === undefined || val === null) return fallback;
    if (typeof val === 'number') return isNaN(val) || !isFinite(val) ? fallback : val;
    const str = String(val).trim().replace(',', '.');
    if (!str) return fallback;
    const parsed = parseFloat(str);
    return isNaN(parsed) || !isFinite(parsed) ? fallback : parsed;
};

const safeInt = (val: any, fallback = 0): number => {
    if (val === undefined || val === null) return fallback;
    if (typeof val === 'number') return isNaN(val) || !isFinite(val) ? fallback : Math.round(val);
    const str = String(val).trim().replace(',', '.');
    if (!str) return fallback;
    const parsed = parseInt(str, 10);
    return isNaN(parsed) ? fallback : parsed;
};

const parseQuantity = (str: any): number => {
    if (str === undefined || str === null) return 0;
    if (typeof str === 'number') return isNaN(str) || !isFinite(str) ? 0 : str;
    const cleaned = String(str).trim().replace(',', '.');
    if (!cleaned) return 0;

    // Mixed fractions e.g. "1 1/2"
    if (cleaned.includes(' ') || cleaned.includes('-')) {
        const parts = cleaned.split(/[\s-]+/).filter(Boolean);
        if (parts.length === 2) {
            const whole = safeFloat(parts[0]);
            const frac = parseQuantity(parts[1]);
            return whole + frac;
        }
    }

    // Simple fraction e.g. "1/2"
    if (cleaned.includes('/')) {
        const [numStr, denStr] = cleaned.split('/');
        const num = safeFloat(numStr);
        const den = safeFloat(denStr);
        if (den !== 0) {
            return num / den;
        }
        return 0;
    }

    return safeFloat(cleaned);
};

const normalizeText = (str: any): string =>
    String(str || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

const normalizeUnit = (rawUnit?: string): string => {
    if (!rawUnit) return 'g';
    const u = rawUnit.trim().toLowerCase();
    if (u === 'cucharada') return 'cda';
    if (u === 'cucharadita') return 'cdita';
    if (u === 'tz') return 'taza';
    if (u === 'porc') return 'porcion';
    if (FOOD_UNITS.some((item) => item.value === u)) return u;
    return u;
};

const getShortUnitLabel = (unit?: string): string => {
    const norm = normalizeUnit(unit);
    const found = FOOD_UNITS.find((u) => u.value === norm);
    return found ? found.short : norm;
};

const formatMacroVal = (num: number): string => {
    if (!isFinite(num) || isNaN(num) || num <= 0) return '0';
    const rounded = Math.round(num * 10) / 10;
    return String(rounded);
};

const findPortionForUnit = (foodItem: CatalogFood | null, unitValue: string): PortionBaseInfo | null => {
    if (!foodItem || !Array.isArray(foodItem.portions) || foodItem.portions.length === 0) {
        return null;
    }
    const normUnit = normalizeUnit(unitValue);
    const portions = foodItem.portions;
    const portion100 = portions.find((p) => Number(p.base_quantity) === 100 || ['g', 'ml'].includes(normalizeUnit(p.base_unit)));
    const portionTaza = portions.find((p) => normalizeUnit(p.base_unit) === 'taza');
    const portionPz = portions.find((p) => normalizeUnit(p.base_unit) === 'pz');
    const portionCda = portions.find((p) => normalizeUnit(p.base_unit) === 'cda');

    if (normUnit === 'g' || normUnit === 'ml') {
        if (portion100) {
            return {
                id: portion100.id,
                calories: safeFloat(portion100.calories),
                protein: safeFloat(portion100.protein),
                carbs: safeFloat(portion100.carbs),
                fat: safeFloat(portion100.fat),
                effectiveBaseQty: 100,
                hint: `Base: ${portion100.portion_type} (${portion100.portion_detail || '100 ' + normUnit}) = ${portion100.calories} kcal`,
            };
        }
    }

    if (normUnit === 'taza' || normUnit === 'vaso') {
        if (portionTaza) {
            return {
                id: portionTaza.id,
                calories: safeFloat(portionTaza.calories),
                protein: safeFloat(portionTaza.protein),
                carbs: safeFloat(portionTaza.carbs),
                fat: safeFloat(portionTaza.fat),
                effectiveBaseQty: 1,
                hint: `1 ${normUnit} (${portionTaza.portion_detail || '240 ml'}) = ${portionTaza.calories} kcal`,
            };
        }
        if (portion100) {
            const factor = 2.4; // 240g/ml
            return {
                id: portion100.id,
                calories: safeFloat(portion100.calories) * factor,
                protein: safeFloat(portion100.protein) * factor,
                carbs: safeFloat(portion100.carbs) * factor,
                fat: safeFloat(portion100.fat) * factor,
                effectiveBaseQty: 1,
                hint: `Equivalencia aprox: 1 ${normUnit} (240 g/ml)`,
            };
        }
    }

    if (['pz', 'porcion', 'rebanada', 'scoop', 'lata'].includes(normUnit)) {
        if (portionPz) {
            return {
                id: portionPz.id,
                calories: safeFloat(portionPz.calories),
                protein: safeFloat(portionPz.protein),
                carbs: safeFloat(portionPz.carbs),
                fat: safeFloat(portionPz.fat),
                effectiveBaseQty: 1,
                hint: `${portionPz.portion_type} (${portionPz.portion_detail || '1 pieza'}) = ${portionPz.calories} kcal`,
            };
        }
        if (portionCda && normUnit === 'scoop') {
            return {
                id: portionCda.id,
                calories: safeFloat(portionCda.calories),
                protein: safeFloat(portionCda.protein),
                carbs: safeFloat(portionCda.carbs),
                fat: safeFloat(portionCda.fat),
                effectiveBaseQty: 1,
                hint: `Base: ${portionCda.portion_detail || '1 medida'} = ${portionCda.calories} kcal`,
            };
        }
        if (portion100) {
            const stdGrams = normUnit === 'rebanada' || normUnit === 'scoop' ? 30 : 100;
            const factor = stdGrams / 100;
            return {
                id: portion100.id,
                calories: safeFloat(portion100.calories) * factor,
                protein: safeFloat(portion100.protein) * factor,
                carbs: safeFloat(portion100.carbs) * factor,
                fat: safeFloat(portion100.fat) * factor,
                effectiveBaseQty: 1,
                hint: `Equivalencia aprox: 1 ${normUnit} (${stdGrams} g)`,
            };
        }
    }

    if (normUnit === 'cda') {
        if (portionCda) {
            return {
                id: portionCda.id,
                calories: safeFloat(portionCda.calories),
                protein: safeFloat(portionCda.protein),
                carbs: safeFloat(portionCda.carbs),
                fat: safeFloat(portionCda.fat),
                effectiveBaseQty: 1,
                hint: `1 cda (${portionCda.portion_detail || '15 g/ml'}) = ${portionCda.calories} kcal`,
            };
        }
        if (portion100) {
            const factor = 0.15; // 15g
            return {
                id: portion100.id,
                calories: safeFloat(portion100.calories) * factor,
                protein: safeFloat(portion100.protein) * factor,
                carbs: safeFloat(portion100.carbs) * factor,
                fat: safeFloat(portion100.fat) * factor,
                effectiveBaseQty: 1,
                hint: `Equivalencia aprox: 1 cda (15 g/ml)`,
            };
        }
    }

    if (normUnit === 'cdita') {
        if (portionCda) {
            return {
                id: portionCda.id,
                calories: safeFloat(portionCda.calories) / 3,
                protein: safeFloat(portionCda.protein) / 3,
                carbs: safeFloat(portionCda.carbs) / 3,
                fat: safeFloat(portionCda.fat) / 3,
                effectiveBaseQty: 1,
                hint: `1 cdita (1/3 de cda · ~5 g/ml)`,
            };
        }
        if (portion100) {
            const factor = 0.05; // 5g
            return {
                id: portion100.id,
                calories: safeFloat(portion100.calories) * factor,
                protein: safeFloat(portion100.protein) * factor,
                carbs: safeFloat(portion100.carbs) * factor,
                fat: safeFloat(portion100.fat) * factor,
                effectiveBaseQty: 1,
                hint: `Equivalencia aprox: 1 cdita (5 g/ml)`,
            };
        }
    }

    const fallback: FoodPortion = portions[0];
    return {
        id: fallback.id,
        calories: safeFloat(fallback.calories),
        protein: safeFloat(fallback.protein),
        carbs: safeFloat(fallback.carbs),
        fat: safeFloat(fallback.fat),
        effectiveBaseQty: safeFloat(fallback.base_quantity) || 1,
        hint: `Base: ${fallback.portion_type}${fallback.portion_detail ? ' (' + fallback.portion_detail + ')' : ''}`,
    };
};

export default function NutritionCalculatorScreen() {
    const { id, planId } = useLocalSearchParams();
    const router = useRouter();
    const { clients } = useUser();
    const insets = useSafeAreaInsets();
    const { width: screenWidth } = useWindowDimensions();
    const {
        plans,
        fetchPlans,
        foodCategories,
        catalogFoods,
        catalogLoading,
        catalogError,
        fetchFoodCatalog,
    } = useNutrition();
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode, screenWidth >= 520), [colors, mode, screenWidth]);
    const [isSaving, setIsSaving] = useState(false);

    const client = clients.find(c => String(c.id) === String(id));

    // Form inputs matching the reference design
    const [gender, setGender] = useState('Hombre');
    const [weight, setWeight] = useState(client?.weight?.toString() || '77.00');
    const [height, setHeight] = useState(client?.height?.toString() || '168.00');
    const [age, setAge] = useState(client?.age?.toString() || '42');

    const [activityLevel, setActivityLevel] = useState('1.2');
    const [formula, setFormula] = useState('mifflin');
    const [objective, setObjective] = useState('Definición');
    const [caloricAdjustment, setCaloricAdjustment] = useState('-300');

    // Macro adjustment multipliers
    const [proteinPerKg, setProteinPerKg] = useState('2.2');
    const [lipidsPerKg, setLipidsPerKg] = useState('0.8');
    const [showMacroFineTune, setShowMacroFineTune] = useState(false);

    // Collapsible for meal builder / diet planner
    const [showMealPlanner, setShowMealPlanner] = useState(false);

    // Notes / Comments input
    const [notes, setNotes] = useState('');
    const [additionalComments, setAdditionalComments] = useState('');

    // Computed values
    const [tdee, setTdee] = useState(0);
    const [targetCalories, setTargetCalories] = useState(0);
    const [macros, setMacros] = useState({
        proteinGrams: 0,
        proteinCals: 0,
        lipidGrams: 0,
        lipidCals: 0,
        carbGrams: 0,
        carbCals: 0,
    });

    // Diet Builder State
    const [meals, setMeals] = useState<Meal[]>([
        { id: 'desayuno', name: 'Desayuno', foods: [] },
        { id: 'almuerzo', name: 'Almuerzo', foods: [] },
        { id: 'cena', name: 'Cena', foods: [] },
    ]);

    // Modal Food Catalog & Calculator State
    const [isSearchModalOpen, setIsSearchModalOpen] = useState(false);
    const [activeMealId, setActiveMealId] = useState<string | null>(null);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [dbSearchQuery, setDbSearchQuery] = useState<string>('');
    const [selectedDbFood, setSelectedDbFood] = useState<CatalogFood | null>(null);
    const [selectedPortionIdx, setSelectedPortionIdx] = useState<number>(0);
    const [portionBase, setPortionBase] = useState<PortionBaseInfo | null>(null);

    const [modalFood, setModalFood] = useState({
        fatsecretId: '',
        name: '',
        quantity: '100',
        unit: 'g',
        calories: '0',
        protein: '0',
        carbs: '0',
        fat: '0',
    });

    const filteredCatalogFoods = useMemo(() => {
        const normQuery = normalizeText(dbSearchQuery.trim());
        return catalogFoods.filter((item) => {
            if (selectedCategoryId !== '' && String(item.food_category_id) !== String(selectedCategoryId)) {
                return false;
            }
            if (normQuery !== '') {
                const haystack = normalizeText(
                    `${item.name} ${item.state || ''} ${item.subcategory || ''} ${item.category_name || ''}`
                );
                return haystack.includes(normQuery);
            }
            return true;
        });
    }, [catalogFoods, selectedCategoryId, dbSearchQuery]);

    const macroFormulaBadgeText = useMemo(() => {
        if (!portionBase || portionBase.effectiveBaseQty <= 0) return 'Tiempo real';
        const currentQty = parseQuantity(modalFood.quantity);
        if (currentQty <= 0) return 'Tiempo real';
        const ratioPct = Math.round((currentQty / portionBase.effectiveBaseQty) * 100);
        return `${modalFood.quantity.trim()} ${modalFood.unit} (${ratioPct}% base)`;
    }, [portionBase, modalFood.quantity, modalFood.unit]);

    const calculateMacros = (totalCal: number, w: number) => {
        const safeW = safeFloat(w);
        if (safeW <= 0 || totalCal <= 0) {
            setMacros({
                proteinGrams: 0,
                proteinCals: 0,
                lipidGrams: 0,
                lipidCals: 0,
                carbGrams: 0,
                carbCals: 0,
            });
            return;
        }

        const pPerKg = safeFloat(proteinPerKg, 2.2);
        const lPerKg = safeFloat(lipidsPerKg, 0.8);

        const pGrams = safeFloat(pPerKg * safeW);
        const pCals = safeFloat(pGrams * 4);

        const lGrams = safeFloat(lPerKg * safeW);
        const lCals = safeFloat(lGrams * 9);

        const remainingCals = Math.max(0, totalCal - pCals - lCals);
        const cCals = safeFloat(remainingCals);
        const cGrams = safeFloat(cCals / 4);

        setMacros({
            proteinGrams: pGrams,
            proteinCals: pCals,
            lipidGrams: lGrams,
            lipidCals: lCals,
            carbGrams: cGrams,
            carbCals: cCals,
        });
    };

    const calculateRequirements = () => {
        const w = safeFloat(weight);
        const h = safeFloat(height);
        const a = safeInt(age);
        const activity = safeFloat(activityLevel, 1.2);
        const adjustment = safeFloat(caloricAdjustment, 0);

        if (!w || !h || !a) {
            Alert.alert('Error', 'Por favor ingresa peso, altura y edad válidos.');
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
        const calculatedTarget = Math.max(0, calculatedTdee + adjustment);

        setTdee(calculatedTdee);
        setTargetCalories(calculatedTarget);
        calculateMacros(calculatedTarget, w);
    };

    useEffect(() => {
        if (client) {
            if (client.weight) setWeight(client.weight.toString());
            if (client.height) setHeight(client.height.toString());
            if (client.age) setAge(client.age.toString());
        }

        if (planId) {
            const existingPlan = plans.find(p => String(p.id) === String(planId));
            if (existingPlan) {
                if (existingPlan.tdee) setTdee(safeFloat(existingPlan.tdee));
                if (existingPlan.target_calories) setTargetCalories(safeFloat(existingPlan.target_calories));

                if (existingPlan.gender) setGender(existingPlan.gender);
                if (existingPlan.weight) setWeight(existingPlan.weight.toString());
                if (existingPlan.height) setHeight(existingPlan.height.toString());
                if (existingPlan.age) setAge(existingPlan.age.toString());
                if (existingPlan.activity_level) setActivityLevel(existingPlan.activity_level.toString());
                if (existingPlan.formula) setFormula(existingPlan.formula);
                if (existingPlan.objective) setObjective(existingPlan.objective);
                if (existingPlan.caloric_adjustment) setCaloricAdjustment(existingPlan.caloric_adjustment.toString());
                if ((existingPlan as any).protein_per_kg) setProteinPerKg((existingPlan as any).protein_per_kg.toString());
                if ((existingPlan as any).lipids_per_kg) setLipidsPerKg((existingPlan as any).lipids_per_kg.toString());

                if (existingPlan.notes) {
                    setNotes(existingPlan.notes);
                } else if (existingPlan.description) {
                    const descParts = existingPlan.description.split('Objetivo:');
                    if (descParts[0] && descParts[0].trim()) {
                        setNotes(descParts[0].trim());
                    }
                }
                if (existingPlan.additional_comments) {
                    setAdditionalComments(existingPlan.additional_comments);
                }

                let rawMeals: any[] = [];
                if (Array.isArray(existingPlan.meals)) {
                    rawMeals = existingPlan.meals;
                } else if (typeof existingPlan.meals === 'string') {
                    try { rawMeals = JSON.parse(existingPlan.meals); } catch (e) { }
                } else if ((existingPlan as any).meals_data && typeof (existingPlan as any).meals_data === 'string') {
                    try { rawMeals = JSON.parse((existingPlan as any).meals_data); } catch (e) { }
                }

                if (rawMeals && rawMeals.length > 0) {
                    const mappedMeals = rawMeals.map((m: any) => ({
                        id: m?.id ? String(m.id) : (m?.name ? m.name.toLowerCase().replace(/\s+/g, '') : `meal_${Math.random()}`),
                        name: m?.name || 'Comida',
                        foods: ((m && m.foods) || []).map((f: any) => {
                            const rawServing = String(f?.serving_size ?? f?.amountText ?? '100');
                            const normU = normalizeUnit(f?.serving_unit || f?.unit || 'g');
                            const parsedBaseQty = parseQuantity(rawServing) || (['g', 'ml'].includes(normU) ? 100 : 1);
                            const cals = safeFloat(f?.calories);
                            const prot = safeFloat(f?.protein);
                            const carbs = safeFloat(f?.carbs);
                            const fat = safeFloat(f?.fat);

                            return {
                                id: String(f?.fatsecret_food_id || f?.id || `manual_${Math.random()}`),
                                name: f?.name || 'Alimento',
                                servingSize: `${rawServing} ${normU}`,
                                calories: cals,
                                protein: prot,
                                carbs: carbs,
                                fat: fat,
                                unit: normU,
                                amountMultiplier: 1,
                                amountText: rawServing,
                                baseQty: parsedBaseQty,
                                baseCalories: cals,
                                baseProtein: prot,
                                baseCarbs: carbs,
                                baseFat: fat,
                            };
                        })
                    }));
                    setMeals(mappedMeals);
                    if (mappedMeals.some((m: any) => m.foods?.length > 0)) {
                        setShowMealPlanner(true);
                    }
                }
            }
        } else {
            // Auto calculate requirements with initial or client values
            const initialW = client?.weight ? safeFloat(client.weight) : safeFloat(weight, 77);
            const initialH = client?.height ? safeFloat(client.height) : safeFloat(height, 168);
            const initialA = client?.age ? safeInt(client.age) : safeInt(age, 42);

            const rmr = (10 * initialW) + (6.25 * initialH) - (5 * initialA) + 5;
            const calcTdee = Math.round(rmr * 1.2);
            const calcTarget = Math.max(0, calcTdee - 300);

            setTdee(calcTdee);
            setTargetCalories(calcTarget);
            calculateMacros(calcTarget, initialW);
        }
    }, [client, planId, plans]);

    useEffect(() => {
        const wNum = safeFloat(weight);
        if (targetCalories > 0 && wNum > 0) {
            calculateMacros(targetCalories, wNum);
        }
    }, [proteinPerKg, lipidsPerKg, targetCalories, weight]);

    // Diet Builder Logic
    const addMealItem = () => {
        setMeals(prev => [...(prev || []), { id: `meal-${Date.now()}`, name: '', foods: [] }]);
    };

    const removeMealItem = (mealId: string) => {
        Keyboard.dismiss();
        setMeals(prev => (prev || []).filter(m => m && m.id !== mealId));
    };

    const renameMealItem = (mealId: string, newName: string) => {
        setMeals(prev => (prev || []).map(m => m && m.id === mealId ? { ...m, name: newName } : m));
    };

    const openSearchForMeal = (mealId: string) => {
        setActiveMealId(mealId);
        setSelectedCategoryId('');
        setDbSearchQuery('');
        setSelectedDbFood(null);
        setSelectedPortionIdx(0);
        setPortionBase(null);
        setModalFood({
            fatsecretId: '',
            name: '',
            quantity: '100',
            unit: 'g',
            calories: '0',
            protein: '0',
            carbs: '0',
            fat: '0',
        });
        if (catalogFoods.length === 0) {
            fetchFoodCatalog(true);
        }
        setIsSearchModalOpen(true);
    };

    const computeScaledModalMacros = (qtyText: string, base: PortionBaseInfo | null) => {
        if (!base || base.effectiveBaseQty <= 0) return null;
        const currentQty = parseQuantity(qtyText);
        if (currentQty <= 0) {
            return { calories: '0', protein: '0', carbs: '0', fat: '0' };
        }
        const ratio = currentQty / base.effectiveBaseQty;
        return {
            calories: formatMacroVal(base.calories * ratio),
            protein: formatMacroVal(base.protein * ratio),
            carbs: formatMacroVal(base.carbs * ratio),
            fat: formatMacroVal(base.fat * ratio),
        };
    };

    const selectDatabaseFood = (foodItem: CatalogFood, preferredPortionIndex = 0) => {
        if (!foodItem || !Array.isArray(foodItem.portions) || foodItem.portions.length === 0) return;

        const safeIdx = foodItem.portions[preferredPortionIndex] ? preferredPortionIndex : 0;
        const chosenPortion = foodItem.portions[safeIdx];
        const unit = normalizeUnit(chosenPortion.base_unit || 'g');
        const qtyStr = String(chosenPortion.base_quantity || (['g', 'ml'].includes(unit) ? 100 : 1));
        const effectiveBaseQty = safeFloat(chosenPortion.base_quantity) || (['g', 'ml'].includes(unit) ? 100 : 1);

        const baseInfo: PortionBaseInfo = {
            id: chosenPortion.id,
            effectiveBaseQty,
            calories: safeFloat(chosenPortion.calories),
            protein: safeFloat(chosenPortion.protein),
            carbs: safeFloat(chosenPortion.carbs),
            fat: safeFloat(chosenPortion.fat),
            hint: `Base: ${chosenPortion.portion_type}${chosenPortion.portion_detail ? ' (' + chosenPortion.portion_detail + ')' : ''} = ${chosenPortion.calories} kcal`,
        };

        setSelectedDbFood(foodItem);
        setSelectedPortionIdx(safeIdx);
        setPortionBase(baseInfo);

        const scaled = computeScaledModalMacros(qtyStr, baseInfo);

        setModalFood({
            fatsecretId: `db_${chosenPortion.id}`,
            name: foodItem.display_name || foodItem.name,
            quantity: qtyStr,
            unit,
            calories: scaled ? scaled.calories : formatMacroVal(baseInfo.calories),
            protein: scaled ? scaled.protein : formatMacroVal(baseInfo.protein),
            carbs: scaled ? scaled.carbs : formatMacroVal(baseInfo.carbs),
            fat: scaled ? scaled.fat : formatMacroVal(baseInfo.fat),
        });
    };

    const clearSelectedDbFood = () => {
        setSelectedDbFood(null);
        setPortionBase(null);
        setModalFood((prev) => ({
            ...prev,
            fatsecretId: '',
        }));
    };

    const handleModalQuantityChange = (newQty: string) => {
        setModalFood((prev) => {
            const scaled = computeScaledModalMacros(newQty, portionBase);
            if (scaled) {
                return {
                    ...prev,
                    quantity: newQty,
                    ...scaled,
                };
            }
            return { ...prev, quantity: newQty };
        });
    };

    const handleModalUnitChange = (newUnitValue: string) => {
        const normUnit = normalizeUnit(newUnitValue);
        let nextQty = modalFood.quantity;

        if (['g', 'ml'].includes(normUnit)) {
            if (nextQty === '1' || nextQty.includes('/')) {
                nextQty = '100';
            }
        } else if (nextQty === '100') {
            nextQty = '1';
        }

        if (selectedDbFood) {
            const matchingIdx = selectedDbFood.portions.findIndex(
                (p) => normalizeUnit(p.base_unit) === normUnit
            );
            if (matchingIdx >= 0) {
                setSelectedPortionIdx(matchingIdx);
            }
            const nextBase = findPortionForUnit(selectedDbFood, normUnit);
            setPortionBase(nextBase);
            const scaled = computeScaledModalMacros(nextQty, nextBase);
            setModalFood((prev) => ({
                ...prev,
                unit: normUnit,
                quantity: nextQty,
                fatsecretId: nextBase?.id ? `db_${nextBase.id}` : prev.fatsecretId,
                ...(scaled || {}),
            }));
        } else {
            setModalFood((prev) => ({
                ...prev,
                unit: normUnit,
                quantity: nextQty,
            }));
        }
    };

    const handleAddFoodSubmit = () => {
        const cleanName = modalFood.name.trim();
        const cleanQty = modalFood.quantity.trim();

        if (!cleanName || !cleanQty) {
            Alert.alert('Aviso', 'Selecciona o ingresa el nombre y la cantidad del alimento.');
            return;
        }

        if (!activeMealId) {
            Alert.alert('Error', 'No hay una comida seleccionada.');
            return;
        }

        const parsedQty = parseQuantity(cleanQty) || 1;
        const cals = safeFloat(modalFood.calories);
        const prot = safeFloat(modalFood.protein);
        const carbs = safeFloat(modalFood.carbs);
        const fat = safeFloat(modalFood.fat);

        const targetMeal = meals.find(m => m && m.id === activeMealId);
        const mealName = targetMeal?.name || 'la comida';

        const newFood: FoodItem = {
            id: modalFood.fatsecretId || `manual_${Date.now()}`,
            name: cleanName,
            servingSize: `${cleanQty} ${modalFood.unit}`,
            calories: cals,
            protein: prot,
            carbs: carbs,
            fat: fat,
            unit: modalFood.unit,
            amountMultiplier: 1,
            amountText: cleanQty,
            baseQty: portionBase ? portionBase.effectiveBaseQty : parsedQty,
            baseCalories: portionBase ? portionBase.calories : cals,
            baseProtein: portionBase ? portionBase.protein : prot,
            baseCarbs: portionBase ? portionBase.carbs : carbs,
            baseFat: portionBase ? portionBase.fat : fat,
            catalogFoodKey: selectedDbFood?.key,
        };

        setMeals(prev => (prev || []).map(m => {
            if (m && m.id === activeMealId) {
                return { ...m, foods: [...((m && m.foods) || []), newFood] };
            }
            return m;
        }));

        Keyboard.dismiss();
        setIsSearchModalOpen(false);
        showToast.success('Alimento añadido a ' + mealName);
    };

    const removeFoodFromMeal = (mealId: string, foodIndex: number) => {
        setMeals(prev => (prev || []).map(m => {
            if (m && m.id === mealId) {
                const newFoods = [...(m.foods || [])];
                newFoods.splice(foodIndex, 1);
                return { ...m, foods: newFoods };
            }
            return m;
        }));
    };

    const findLinkedCatalogFood = (food: FoodItem): CatalogFood | null => {
        if (!catalogFoods.length) return null;
        if (food.catalogFoodKey) {
            const byKey = catalogFoods.find((cf) => cf.key === food.catalogFoodKey);
            if (byKey) return byKey;
        }
        if (food.id && String(food.id).startsWith('db_')) {
            const pid = String(food.id).replace(/^db_/, '');
            const byPortion = catalogFoods.find((cf) =>
                cf.portions.some((p) => String(p.id) === pid)
            );
            if (byPortion) return byPortion;
        }
        const normName = normalizeText(food.name);
        return catalogFoods.find(
            (cf) => normalizeText(cf.display_name || cf.name) === normName || normalizeText(cf.name) === normName
        ) || null;
    };

    const updateFoodAmount = (mealId: string, foodIndex: number, newAmountText: string) => {
        setMeals(prev => (prev || []).map(m => {
            if (m && m.id === mealId) {
                const newFoods = [...(m.foods || [])];
                const currentFood = newFoods[foodIndex];
                if (!currentFood) return m;

                const val = parseQuantity(newAmountText);
                const refBaseQty = safeFloat(currentFood.baseQty) || (['g', 'ml'].includes(normalizeUnit(currentFood.unit)) ? 100 : 1);
                const ratio = val > 0 && refBaseQty > 0 ? val / refBaseQty : 0;

                const bCal = currentFood.baseCalories !== undefined ? currentFood.baseCalories : currentFood.calories;
                const bProt = currentFood.baseProtein !== undefined ? currentFood.baseProtein : currentFood.protein;
                const bCarb = currentFood.baseCarbs !== undefined ? currentFood.baseCarbs : currentFood.carbs;
                const bFat = currentFood.baseFat !== undefined ? currentFood.baseFat : currentFood.fat;

                newFoods[foodIndex] = {
                    ...currentFood,
                    calories: Math.round(bCal * ratio * 10) / 10,
                    protein: Math.round(bProt * ratio * 10) / 10,
                    carbs: Math.round(bCarb * ratio * 10) / 10,
                    fat: Math.round(bFat * ratio * 10) / 10,
                    amountMultiplier: 1,
                    amountText: newAmountText,
                    servingSize: `${newAmountText || '0'} ${currentFood.unit || 'g'}`,
                };
                return { ...m, foods: newFoods };
            }
            return m;
        }));
    };

    const toggleFoodUnit = (mealId: string, foodIndex: number) => {
        setMeals(prev => (prev || []).map(m => {
            if (m && m.id === mealId) {
                const newFoods = [...(m.foods || [])];
                const currentFood = newFoods[foodIndex];
                if (!currentFood) return m;

                const units = ['g', 'ml', 'taza', 'pz', 'cda', 'cdita', 'porcion'];
                const curUnit = normalizeUnit(currentFood.unit || 'g');
                const currentIndex = units.indexOf(curUnit);
                const nextUnit = units[(currentIndex + 1) % units.length];

                const isCurMetric = ['g', 'ml'].includes(curUnit);
                const isNextMetric = ['g', 'ml'].includes(nextUnit);

                let nextQtyVal = currentFood.amountText !== undefined
                    ? parseQuantity(currentFood.amountText)
                    : (isCurMetric ? 100 : 1);

                if (isNextMetric && !isCurMetric) {
                    nextQtyVal = 100;
                } else if (!isNextMetric && isCurMetric) {
                    nextQtyVal = 1;
                }

                const linkedCatalog = findLinkedCatalogFood(currentFood);
                if (linkedCatalog) {
                    const portionInfo = findPortionForUnit(linkedCatalog, nextUnit);
                    if (portionInfo && portionInfo.effectiveBaseQty > 0) {
                        const ratio = nextQtyVal / portionInfo.effectiveBaseQty;
                        newFoods[foodIndex] = {
                            ...currentFood,
                            id: portionInfo.id ? `db_${portionInfo.id}` : currentFood.id,
                            unit: nextUnit,
                            amountMultiplier: 1,
                            amountText: String(nextQtyVal),
                            servingSize: `${nextQtyVal} ${nextUnit}`,
                            baseQty: portionInfo.effectiveBaseQty,
                            baseCalories: portionInfo.calories,
                            baseProtein: portionInfo.protein,
                            baseCarbs: portionInfo.carbs,
                            baseFat: portionInfo.fat,
                            calories: Math.round(portionInfo.calories * ratio * 10) / 10,
                            protein: Math.round(portionInfo.protein * ratio * 10) / 10,
                            carbs: Math.round(portionInfo.carbs * ratio * 10) / 10,
                            fat: Math.round(portionInfo.fat * ratio * 10) / 10,
                        };
                        return { ...m, foods: newFoods };
                    }
                }

                // Fallback conversion for custom manual foods based on approximate gram weights
                const unitGramMap: Record<string, number> = {
                    g: 1,
                    ml: 1,
                    taza: 240,
                    vaso: 240,
                    pz: 100,
                    porcion: 100,
                    cda: 15,
                    cdita: 5,
                    rebanada: 30,
                    scoop: 30,
                    lata: 100,
                };
                const curQty = Math.max(0.01, parseQuantity(currentFood.amountText) || (isCurMetric ? 100 : 1));
                const curTotalGrams = curQty * (unitGramMap[curUnit] || 1);
                const nextTotalGrams = nextQtyVal * (unitGramMap[nextUnit] || 1);
                const scaleFactor = curTotalGrams > 0 ? nextTotalGrams / curTotalGrams : 1;

                const nextCal = Math.round(safeFloat(currentFood.calories) * scaleFactor * 10) / 10;
                const nextProt = Math.round(safeFloat(currentFood.protein) * scaleFactor * 10) / 10;
                const nextCarb = Math.round(safeFloat(currentFood.carbs) * scaleFactor * 10) / 10;
                const nextFat = Math.round(safeFloat(currentFood.fat) * scaleFactor * 10) / 10;

                newFoods[foodIndex] = {
                    ...currentFood,
                    unit: nextUnit,
                    amountMultiplier: 1,
                    amountText: String(nextQtyVal),
                    servingSize: `${nextQtyVal} ${nextUnit}`,
                    baseQty: nextQtyVal,
                    baseCalories: nextCal,
                    baseProtein: nextProt,
                    baseCarbs: nextCarb,
                    baseFat: nextFat,
                    calories: nextCal,
                    protein: nextProt,
                    carbs: nextCarb,
                    fat: nextFat,
                };
                return { ...m, foods: newFoods };
            }
            return m;
        }));
    };

    const handleSavePlan = async () => {
        if (!tdee || tdee <= 0) {
            Alert.alert('Error', 'Por favor calcula los requerimientos antes de guardar el plan.');
            return;
        }

        const executeSave = async (notifyWhatsApp = false) => {
            setIsSaving(true);
            try {
                const planData = {
                    client_id: id ? safeInt(id) : undefined,
                    name: `Plan Nutricional - ${objective}`,
                    description: `${notes.trim() ? notes.trim() + '\n\n' : ''}Objetivo: ${objective} | TDEE: ${tdee} kcal | Meta: ${targetCalories} kcal`,
                    gender: gender,
                    weight: safeFloat(weight),
                    height: safeFloat(height),
                    age: safeInt(age),
                    activity_level: safeFloat(activityLevel),
                    formula: formula,
                    objective: objective,
                    caloric_adjustment: safeFloat(caloricAdjustment),
                    tdee: tdee,
                    target_calories: targetCalories,
                    protein_per_kg: safeFloat(proteinPerKg),
                    lipids_per_kg: safeFloat(lipidsPerKg),
                    protein_grams: safeFloat(macros.proteinGrams),
                    lipid_grams: safeFloat(macros.lipidGrams),
                    carb_grams: safeFloat(macros.carbGrams),
                    notes: notes.trim(),
                    additional_comments: additionalComments.trim(),
                    meals_data: JSON.stringify(meals || []),
                    date: new Date().toISOString().split('T')[0]
                };

                if (planId) {
                    await updateNutritionPlan(planId as string, planData);
                    showToast.success('Plan nutricional actualizado correctamente.');
                } else {
                    await saveNutritionPlan(planData);
                    showToast.success('Plan nutricional guardado correctamente.');
                }

                if (notifyWhatsApp) {
                    const clientName = client ? client.name : 'Cliente';
                    const message = planId
                        ? `¡Hola ${clientName}! Tu plan de alimentación ha sido actualizado. Revísalo en la App AFTraining.`
                        : `¡Hola ${clientName}! Se ha creado un nuevo plan de alimentación para ti en la App AFTraining.`;

                    const encodedMessage = encodeURIComponent(message);
                    const url = (client && client.phone)
                        ? `whatsapp://send?phone=${client.phone}&text=${encodedMessage}`
                        : `whatsapp://send?text=${encodedMessage}`;

                    Linking.openURL(url).catch(() => {
                        Alert.alert('Error', 'No se pudo abrir WhatsApp');
                    });
                }

                await fetchPlans();
                router.back();
            } catch (error: any) {
                console.error('Error saving plan in screen:', error);
                const serverMsg = error.response?.data?.message || error.response?.data?.error || (error.response?.data?.errors ? Object.values(error.response.data.errors).flat().join('\n') : null) || error.message;
                Alert.alert('Error', serverMsg ? `Error al guardar: ${serverMsg}` : 'Hubo un error al guardar el plan en el servidor.');
            } finally {
                setIsSaving(false);
            }
        };

        if (id && id !== 'template') {
            Alert.alert(
                planId ? 'Actualizar Plan' : 'Guardar Plan',
                '¿Deseas avisar a este cliente por WhatsApp o simplemente guardar la información?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Solo guardar', onPress: () => executeSave(false) },
                    { text: 'Avisar por WhatsApp', onPress: () => executeSave(true) }
                ]
            );
        } else {
            executeSave(false);
        }
    };

    // Calculate energy distribution percentages
    const totalCalForPct = targetCalories > 0 ? targetCalories : 1;
    const proteinPct = targetCalories > 0 ? Math.round((macros.proteinCals / totalCalForPct) * 100) : 41;
    const carbPct = targetCalories > 0 ? Math.round((macros.carbCals / totalCalForPct) * 100) : 25;
    const lipidPct = targetCalories > 0 ? Math.max(0, 100 - proteinPct - carbPct) : 34;

    const wNum = safeFloat(weight);
    const carbPerKg = (wNum > 0 && macros.carbGrams > 0)
        ? (macros.carbGrams / wNum).toFixed(1)
        : (wNum > 0 ? '0.0' : '1.3');

    const pickerItemColor = mode === 'dark' ? '#FFFFFF' : '#0F172A';
    const pickerItemBg = mode === 'dark' ? '#0F1A2A' : '#FFFFFF';

    // Calculate Global Accumulators for meals
    const totalAccumulated = (meals || []).reduce((acc, meal) => {
        ((meal && meal.foods) || []).forEach(f => {
            if (!f) return;
            const mult = safeFloat(f.amountMultiplier, 1);
            acc.calories += safeFloat(f.calories) * mult;
            acc.protein += safeFloat(f.protein) * mult;
            acc.carbs += safeFloat(f.carbs) * mult;
            acc.fat += safeFloat(f.fat) * mult;
        });
        return {
            calories: safeFloat(acc.calories),
            protein: safeFloat(acc.protein),
            carbs: safeFloat(acc.carbs),
            fat: safeFloat(acc.fat),
        };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

    const getStateBadgeColors = (stateStr?: string) => {
        const norm = normalizeText(stateStr);
        if (norm.includes('cocido')) {
            return {
                bg: mode === 'dark' ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
                text: mode === 'dark' ? '#FCD34D' : '#92400E',
            };
        }
        if (norm.includes('crudo')) {
            return {
                bg: mode === 'dark' ? 'rgba(244, 63, 94, 0.2)' : '#FFE4E6',
                text: mode === 'dark' ? '#FDA4AF' : '#BE123C',
            };
        }
        return {
            bg: mode === 'dark' ? 'rgba(148, 163, 184, 0.18)' : '#F1F5F9',
            text: mode === 'dark' ? '#CBD5E1' : '#475569',
        };
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <Stack.Screen options={{ headerShown: false }} />

            {/* Top Navigation Bar */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.topBackBtn}>
                    <ChevronLeft size={24} color={colors.text} />
                </TouchableOpacity>

                <View style={styles.topBrandContainer}>
                    <Image source={require('@/assets/images/logo.png')} style={styles.topLogo} resizeMode="contain" />
                </View>

                <Text style={styles.topTitle}>Plan De Alimentación</Text>

                <View style={styles.topAvatarCircle}>
                    <User size={18} color="#0A1938" />
                </View>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {/* 1. Datos Básicos Card */}
                <View style={styles.card}>
                    <View style={styles.cardHeader}>
                        <View style={styles.cardHeaderLeft}>
                            <View style={styles.cardIconBox}>
                                <SlidersHorizontal size={18} color="#94A3B8" />
                            </View>
                            <Text style={styles.cardTitle}>1. Datos Básicos</Text>
                        </View>
                        <View style={styles.metabolismBadge}>
                            <Text style={styles.metabolismBadgeText}>METABOLISMO</Text>
                        </View>
                    </View>

                    {/* Género */}
                    <Text style={styles.fieldLabel}>Género:</Text>
                    <View style={styles.segmentedRow}>
                        <TouchableOpacity
                            style={[styles.segmentBtn, gender === 'Hombre' && styles.segmentBtnActive]}
                            onPress={() => setGender('Hombre')}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.segmentBtnText, gender === 'Hombre' && styles.segmentBtnTextActive]}>
                                ♂ Hombre
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.segmentBtn, gender === 'Mujer' && styles.segmentBtnActive]}
                            onPress={() => setGender('Mujer')}
                            activeOpacity={0.8}
                        >
                            <Text style={[styles.segmentBtnText, gender === 'Mujer' && styles.segmentBtnTextActive]}>
                                ♀ Mujer
                            </Text>
                        </TouchableOpacity>
                    </View>

                    {/* Peso & Altura */}
                    <View style={styles.fieldRow}>
                        <View style={styles.fieldCol}>
                            <Text style={styles.fieldLabel}>Peso (kg):</Text>
                            <View style={styles.inputWithSuffix}>
                                <TextInput
                                    style={styles.inputText}
                                    keyboardType="decimal-pad"
                                    value={weight}
                                    onChangeText={setWeight}
                                    placeholder="77.00"
                                    placeholderTextColor="#64748B"
                                />
                                <Text style={styles.suffixBadge}>KG</Text>
                            </View>
                        </View>

                        <View style={styles.fieldCol}>
                            <Text style={styles.fieldLabel}>Altura (cm):</Text>
                            <View style={styles.inputWithSuffix}>
                                <TextInput
                                    style={styles.inputText}
                                    keyboardType="decimal-pad"
                                    value={height}
                                    onChangeText={setHeight}
                                    placeholder="168.00"
                                    placeholderTextColor="#64748B"
                                />
                                <Text style={styles.suffixBadge}>CM</Text>
                            </View>
                        </View>
                    </View>

                    {/* Edad & Nivel Actividad */}
                    <View style={styles.fieldRow}>
                        <View style={styles.fieldCol}>
                            <Text style={styles.fieldLabel}>Edad (años):</Text>
                            <View style={styles.inputWithSuffix}>
                                <TextInput
                                    style={styles.inputText}
                                    keyboardType="numeric"
                                    value={age}
                                    onChangeText={setAge}
                                    placeholder="42"
                                    placeholderTextColor="#64748B"
                                />
                            </View>
                        </View>

                        <View style={styles.fieldCol}>
                            <Text style={styles.fieldLabel}>Nivel Actividad:</Text>
                            <View style={styles.pickerBox}>
                                <Picker
                                    selectedValue={activityLevel}
                                    onValueChange={setActivityLevel}
                                    dropdownIconColor={colors.primary}
                                    style={styles.picker}
                                >
                                    <Picker.Item label="(1.2) Sedentario" value="1.2" color={pickerItemColor} style={{ backgroundColor: pickerItemBg }} />
                                    <Picker.Item label="(1.375) Ligero" value="1.375" color={pickerItemColor} style={{ backgroundColor: pickerItemBg }} />
                                    <Picker.Item label="(1.55) Moderado" value="1.55" color={pickerItemColor} style={{ backgroundColor: pickerItemBg }} />
                                    <Picker.Item label="(1.725) Fuerte" value="1.725" color={pickerItemColor} style={{ backgroundColor: pickerItemBg }} />
                                    <Picker.Item label="(1.9) Muy Fuerte" value="1.9" color={pickerItemColor} style={{ backgroundColor: pickerItemBg }} />
                                </Picker>
                            </View>
                        </View>
                    </View>

                    {/* Fórmula de Gasto Calórico */}
                    <Text style={styles.fieldLabel}>Fórmula de Gasto Calórico:</Text>
                    <View style={styles.pickerBox}>
                        <Picker
                            selectedValue={formula}
                            onValueChange={setFormula}
                            dropdownIconColor={colors.primary}
                            style={styles.picker}
                        >
                            <Picker.Item label="Mifflin-St Jeor (Precisión estándar)" value="mifflin" color={pickerItemColor} style={{ backgroundColor: pickerItemBg }} />
                            <Picker.Item label="Harris-Benedict" value="harris" color={pickerItemColor} style={{ backgroundColor: pickerItemBg }} />
                            <Picker.Item label="Tinsley" value="tinsley" color={pickerItemColor} style={{ backgroundColor: pickerItemBg }} />
                        </Picker>
                    </View>

                    {/* Objetivo Nutricional */}
                    <Text style={styles.fieldLabel}>Objetivo Nutricional:</Text>
                    <View style={styles.objectiveRow}>
                        {[
                            { label: 'Definición (-)', value: 'Definición', adj: '-300' },
                            { label: 'Mantenimiento', value: 'Mantenimiento', adj: '0' },
                            { label: 'Volumen (+)', value: 'Volumen', adj: '300' },
                        ].map((item) => {
                            const isSel = objective === item.value;
                            return (
                                <TouchableOpacity
                                    key={item.value}
                                    style={[styles.objectiveChip, isSel && styles.objectiveChipActive]}
                                    onPress={() => {
                                        setObjective(item.value);
                                        setCaloricAdjustment(item.adj);
                                    }}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[styles.objectiveChipText, isSel && styles.objectiveChipTextActive]}>
                                        {item.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Ajuste Calórico */}
                    <View style={styles.labelRowBetween}>
                        <Text style={styles.fieldLabel}>Ajuste Calórico (kcal):</Text>
                        {safeFloat(caloricAdjustment) < 0 ? (
                            <View style={styles.badgeDeficit}>
                                <Text style={styles.badgeDeficitText}>Déficit Activo</Text>
                            </View>
                        ) : safeFloat(caloricAdjustment) > 0 ? (
                            <View style={styles.badgeSurplus}>
                                <Text style={styles.badgeSurplusText}>Superávit Activo</Text>
                            </View>
                        ) : null}
                    </View>

                    <View style={styles.inputWithSuffix}>
                        <TextInput
                            style={styles.inputText}
                            keyboardType="numbers-and-punctuation"
                            value={caloricAdjustment}
                            onChangeText={setCaloricAdjustment}
                            placeholder="-300"
                            placeholderTextColor="#64748B"
                        />
                        <Text style={styles.suffixBadge}>KCAL/DÍA</Text>
                    </View>

                    {/* Calcular Button */}
                    <TouchableOpacity style={styles.calculateBtn} onPress={calculateRequirements}>
                        <Calculator size={18} color="#0B132B" />
                        <Text style={styles.calculateBtnText}>Calcular Requerimientos</Text>
                    </TouchableOpacity>
                </View>

                {/* 2. Requerimientos Nutricionales Section */}
                <View style={styles.section2Header}>
                    <View style={styles.section2TitleRow}>
                        <Utensils size={22} color="#38BDF8" />
                        <Text style={styles.section2Title}>2. Requerimientos Nutricionales</Text>
                    </View>
                    <Text style={styles.section2Subtitle}>
                        Resumen de las necesidades calóricas basales y la distribución balanceada de macronutrientes calculada.
                    </Text>
                </View>

                {/* Sub-Card: TDEE */}
                <View style={styles.subCard}>
                    <View style={styles.subCardLeft}>
                        <Text style={styles.subCardLabel}>GASTO ENERGÉTICO DIARIO (TDEE)</Text>
                        <View style={styles.statRow}>
                            <Text style={styles.statBigNumber}>{tdee > 0 ? tdee.toLocaleString() : '1,938'}</Text>
                            <Text style={styles.statUnit}> kcal</Text>
                        </View>
                    </View>
                    <View style={styles.subCardIconCircle}>
                        <Flame size={20} color="#94A3B8" />
                    </View>
                </View>

                {/* Sub-Card: CALORÍAS OBJETIVO */}
                <View style={styles.subCard}>
                    <View style={styles.subCardLeft}>
                        <View style={styles.calTargetLabelRow}>
                            <Text style={styles.subCardLabel}>CALORÍAS OBJETIVO</Text>
                            <View style={styles.calAdjustmentBadge}>
                                <Text style={styles.calAdjustmentBadgeText}>
                                    {safeFloat(caloricAdjustment) > 0 ? `+${caloricAdjustment}` : caloricAdjustment} kcal
                                </Text>
                            </View>
                        </View>
                        <View style={styles.statRow}>
                            <Text style={styles.statBigNumber}>{targetCalories > 0 ? targetCalories.toLocaleString() : '1,638'}</Text>
                            <Text style={styles.statUnit}> kcal/día</Text>
                        </View>
                    </View>
                    <View style={styles.subCardIconCircle}>
                        <Flag size={20} color="#94A3B8" />
                    </View>
                </View>

                {/* Energy Distribution Bar */}
                <View style={styles.distHeaderRow}>
                    <Text style={styles.distLabel}>DISTRIBUCIÓN DE ENERGÍA</Text>
                    <Text style={styles.distValues}>
                        {proteinPct}% P • {carbPct}% C • {lipidPct}% G
                    </Text>
                </View>

                <View style={styles.segmentedProgressBar}>
                    <View style={[styles.progressSegment, { flex: Math.max(1, proteinPct), backgroundColor: '#3B82F6' }]} />
                    <View style={[styles.progressSegment, { flex: Math.max(1, carbPct), backgroundColor: '#F97316' }]} />
                    <View style={[styles.progressSegment, { flex: Math.max(1, lipidPct), backgroundColor: '#38BDF8' }]} />
                </View>

                {/* Macronutrient Cards */}
                <View style={styles.macroCard}>
                    <View style={styles.macroCardLeft}>
                        <View style={[styles.macroDot, { backgroundColor: '#3B82F6' }]} />
                        <View>
                            <Text style={styles.macroTitle}>Proteínas</Text>
                            <Text style={styles.macroSubtitle}>{proteinPerKg} g / kg peso</Text>
                        </View>
                    </View>
                    <View style={styles.macroCardRight}>
                        <Text style={styles.macroGramText}>
                            {macros.proteinGrams > 0 ? macros.proteinGrams.toFixed(1) : '169.4'} g
                        </Text>
                        <Text style={styles.macroKcalText}>
                            ({macros.proteinCals > 0 ? macros.proteinCals.toFixed(0) : '678'} kcal)
                        </Text>
                    </View>
                </View>

                <View style={styles.macroCard}>
                    <View style={styles.macroCardLeft}>
                        <View style={[styles.macroDot, { backgroundColor: '#F97316' }]} />
                        <View>
                            <Text style={styles.macroTitle}>Carbohidratos</Text>
                            <Text style={styles.macroSubtitle}>{carbPerKg} g / kg peso • Energía glucolítica</Text>
                        </View>
                    </View>
                    <View style={styles.macroCardRight}>
                        <Text style={[styles.macroGramText, { color: '#F97316' }]}>
                            {macros.carbGrams > 0 ? macros.carbGrams.toFixed(1) : '101.5'} g
                        </Text>
                        <Text style={styles.macroKcalText}>
                            ({macros.carbCals > 0 ? macros.carbCals.toFixed(0) : '406'} kcal)
                        </Text>
                    </View>
                </View>

                <View style={styles.macroCard}>
                    <View style={styles.macroCardLeft}>
                        <View style={[styles.macroDot, { backgroundColor: '#38BDF8' }]} />
                        <View>
                            <Text style={styles.macroTitle}>Lípidos / Grasas</Text>
                            <Text style={styles.macroSubtitle}>{lipidsPerKg} g / kg peso • Soporte hormonal</Text>
                        </View>
                    </View>
                    <View style={styles.macroCardRight}>
                        <Text style={styles.macroGramText}>
                            {macros.lipidGrams > 0 ? macros.lipidGrams.toFixed(1) : '61.6'} g
                        </Text>
                        <Text style={styles.macroKcalText}>
                            ({macros.lipidCals > 0 ? macros.lipidCals.toFixed(0) : '554'} kcal)
                        </Text>
                    </View>
                </View>

                {/* Panel Ajuste de Factores (g / kg peso) */}
                <View style={styles.fineTuneBox}>
                    <View style={styles.fineTuneHeader}>
                        <Text style={styles.fineTuneTitle}>Ajuste de Factores (g / kg peso)</Text>
                        <Text style={styles.fineTuneSubtitle}>
                            Gramos de macronutrientes por kg de peso corporal:
                        </Text>
                    </View>

                    <View style={styles.fineTuneRow}>
                        <View style={styles.fineTuneRowLeft}>
                            <View style={[styles.macroDot, { backgroundColor: '#3B82F6' }]} />
                            <Text style={styles.fineTuneLabel}>Proteínas (g/kg):</Text>
                        </View>
                        <TextInput
                            style={styles.fineTuneInput}
                            keyboardType="decimal-pad"
                            value={proteinPerKg}
                            onChangeText={setProteinPerKg}
                            placeholder="2.2"
                            placeholderTextColor="#64748B"
                        />
                    </View>

                    <View style={styles.fineTuneRow}>
                        <View style={styles.fineTuneRowLeft}>
                            <View style={[styles.macroDot, { backgroundColor: '#38BDF8' }]} />
                            <Text style={styles.fineTuneLabel}>Lípidos / Grasas (g/kg):</Text>
                        </View>
                        <TextInput
                            style={styles.fineTuneInput}
                            keyboardType="decimal-pad"
                            value={lipidsPerKg}
                            onChangeText={setLipidsPerKg}
                            placeholder="0.8"
                            placeholderTextColor="#64748B"
                        />
                    </View>

                    <View style={styles.fineTuneRow}>
                        <View style={styles.fineTuneRowLeft}>
                            <View style={[styles.macroDot, { backgroundColor: '#F97316' }]} />
                            <Text style={styles.fineTuneLabel}>Carbohidratos (g/kg):</Text>
                        </View>
                        <View style={styles.fineTuneReadOnly}>
                            <Text style={styles.fineTuneReadOnlyText}>
                                {carbPerKg} g/kg
                            </Text>
                        </View>
                    </View>
                </View>

                {/* 3. Planificador de Comidas Section */}
                <View style={styles.section2Header}>
                    <View style={styles.section2TitleRow}>
                        <UtensilsCrossed size={22} color="#38BDF8" />
                        <Text style={styles.section2Title}>3. Planificador de Comidas</Text>
                    </View>
                    <Text style={styles.section2Subtitle}>
                        Distribuye los requerimientos calóricos y macronutrientes a lo largo del día agregando alimentos a cada comida.
                    </Text>
                </View>

                {/* Accumulated Totals Card */}
                <View style={styles.card}>
                    <View style={styles.totalsHeaderRow}>
                        <Text style={styles.totalsTitle}>Balance Acumulado del Menú</Text>
                        <Text style={styles.totalsSubtitle}>
                            {totalAccumulated.calories.toFixed(0)} / {targetCalories} kcal
                        </Text>
                    </View>

                    <View style={styles.accumulatedTotalsBox}>
                        <View style={styles.accCol}>
                            <Text style={styles.accLabel}>Calorías</Text>
                            <Text style={[styles.accValue, totalAccumulated.calories > targetCalories && targetCalories > 0 ? { color: '#EF4444' } : { color: colors.text }]}>
                                {totalAccumulated.calories.toFixed(0)} <Text style={{ fontSize: 10, color: '#64748B' }}>kcal</Text>
                            </Text>
                        </View>
                        <View style={styles.accCol}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={[styles.macroDot, { backgroundColor: '#3B82F6', width: 6, height: 6 }]} />
                                <Text style={styles.accLabel}>Prot</Text>
                            </View>
                            <Text style={[styles.accValue, { color: '#3B82F6' }]}>{totalAccumulated.protein.toFixed(1)}g</Text>
                        </View>
                        <View style={styles.accCol}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={[styles.macroDot, { backgroundColor: '#F97316', width: 6, height: 6 }]} />
                                <Text style={styles.accLabel}>Carb</Text>
                            </View>
                            <Text style={[styles.accValue, { color: '#F97316' }]}>{totalAccumulated.carbs.toFixed(1)}g</Text>
                        </View>
                        <View style={styles.accCol}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <View style={[styles.macroDot, { backgroundColor: '#38BDF8', width: 6, height: 6 }]} />
                                <Text style={styles.accLabel}>Grasas</Text>
                            </View>
                            <Text style={[styles.accValue, { color: '#38BDF8' }]}>{totalAccumulated.fat.toFixed(1)}g</Text>
                        </View>
                    </View>
                </View>

                {/* Meals List */}
                {meals.map((meal) => {
                    const mealCals = (meal?.foods || []).reduce(
                        (acc, f) => acc + ((Number(f.calories) || 0) * (isNaN(f.amountMultiplier as any) ? 1 : (f.amountMultiplier || 1))),
                        0
                    );

                    return (
                        <View key={meal.id} style={styles.card}>
                            <View style={styles.mealCardHeader}>
                                <TextInput
                                    style={styles.mealNameInput}
                                    value={meal.name}
                                    onChangeText={(val) => renameMealItem(meal.id, val)}
                                    placeholder="Nombre de la comida..."
                                    placeholderTextColor="#64748B"
                                />
                                <View style={styles.mealHeaderRight}>
                                    <View style={styles.mealSubtotals}>
                                        <Text style={styles.mealSubText}>{mealCals.toFixed(0)} kcal</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => removeMealItem(meal.id)} style={styles.removeMealBtn}>
                                        <Trash2 size={16} color="#EF4444" />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {(meal?.foods && meal.foods.length > 0) ? (
                                <View style={styles.foodList}>
                                    {meal.foods.map((food, idx) => {
                                        const mult = isNaN(food.amountMultiplier as any) ? 1 : (food.amountMultiplier || 1);
                                        const pVal = ((food.protein || 0) * mult).toFixed(1);
                                        const cVal = ((food.carbs || 0) * mult).toFixed(1);
                                        const fVal = ((food.fat || 0) * mult).toFixed(1);
                                        const calVal = ((food.calories || 0) * mult).toFixed(0);

                                        return (
                                            <View key={idx} style={styles.foodRow}>
                                                <View style={{ flex: 1, paddingRight: 8 }}>
                                                    <Text style={styles.foodName}>{food.name}</Text>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                                                        <TextInput
                                                            style={styles.gramsInput}
                                                            keyboardType="numbers-and-punctuation"
                                                            value={String(food.amountText != null ? food.amountText : 100)}
                                                            onChangeText={(val) => updateFoodAmount(meal.id, idx, val)}
                                                            placeholder="Cant."
                                                            placeholderTextColor="#64748B"
                                                        />
                                                        <TouchableOpacity onPress={() => toggleFoodUnit(meal.id, idx)} style={styles.unitToggle}>
                                                            <Text style={styles.gramsLabel}>{getShortUnitLabel(food.unit)}</Text>
                                                        </TouchableOpacity>
                                                        <Text style={styles.foodCalBadge}>{calVal} kcal</Text>
                                                    </View>
                                                </View>
                                                <View style={styles.foodMacros}>
                                                    <View style={styles.macroPill}>
                                                        <Text style={[styles.macroPillLabel, { color: '#3B82F6' }]}>P</Text>
                                                        <Text style={styles.macroPillValue}>{pVal}</Text>
                                                    </View>
                                                    <View style={styles.macroPill}>
                                                        <Text style={[styles.macroPillLabel, { color: '#F97316' }]}>C</Text>
                                                        <Text style={styles.macroPillValue}>{cVal}</Text>
                                                    </View>
                                                    <View style={styles.macroPill}>
                                                        <Text style={[styles.macroPillLabel, { color: '#38BDF8' }]}>G</Text>
                                                        <Text style={styles.macroPillValue}>{fVal}</Text>
                                                    </View>
                                                </View>
                                                <TouchableOpacity style={styles.deleteFoodBtn} onPress={() => removeFoodFromMeal(meal.id, idx)}>
                                                    <X size={16} color="#EF4444" />
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })}
                                </View>
                            ) : null}

                            <TouchableOpacity style={styles.addFoodBtn} onPress={() => openSearchForMeal(meal.id)}>
                                <Plus size={16} color={colors.primary} />
                                <Text style={styles.addFoodText}>Añadir Alimento</Text>
                            </TouchableOpacity>
                        </View>
                    );
                })}

                {/* Add Meal Time Button */}
                <TouchableOpacity style={styles.addMealTimeBtn} onPress={addMealItem}>
                    <Plus size={16} color={colors.primary} />
                    <Text style={styles.addMealTimeBtnText}>Añadir tiempo de comida</Text>
                </TouchableOpacity>

                {/* Indicaciones y Comentarios Card */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>Indicaciones y Comentarios</Text>
                    <Text style={[styles.fieldLabel, { marginTop: 8 }]}>Notas para el cliente (ej. agua, horarios):</Text>
                    <TextInput
                        style={[styles.inputText, styles.textArea]}
                        multiline
                        numberOfLines={3}
                        placeholder="Ej. Tomar 2.5L de agua al día. Consumir la Comida 1 antes de entrenar..."
                        placeholderTextColor="#64748B"
                        value={notes}
                        onChangeText={setNotes}
                    />

                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Comentarios Adicionales:</Text>
                    <TextInput
                        style={[styles.inputText, styles.textArea]}
                        multiline
                        numberOfLines={3}
                        placeholder="Otros comentarios..."
                        placeholderTextColor="#64748B"
                        value={additionalComments}
                        onChangeText={setAdditionalComments}
                    />
                </View>

                {/* Primary Action Button: Guardar y Asignar a Cliente */}
                <TouchableOpacity
                    style={[styles.primaryAssignBtn, isSaving && { opacity: 0.7 }]}
                    onPress={handleSavePlan}
                    disabled={isSaving}
                >
                    {isSaving ? (
                        <ActivityIndicator color="#0A1938" />
                    ) : (
                        <>
                            <ClipboardCheck size={20} color="#0A1938" />
                            <Text style={styles.primaryAssignBtnText}>Guardar y Asignar a Cliente</Text>
                        </>
                    )}
                </TouchableOpacity>

                <Text style={styles.footerSyncText}>
                    Los valores se sincronizarán automáticamente con el diario del cliente en AF Training.
                </Text>

                <View style={{ height: 60 }} />
            </ScrollView>

            {/* Food Database Catalog & Macro Calculator Modal */}
            <Modal
                visible={isSearchModalOpen}
                animationType="slide"
                presentationStyle="pageSheet"
                onRequestClose={() => setIsSearchModalOpen(false)}
            >
                <KeyboardAvoidingView
                    style={[styles.modalContainer, { paddingTop: Platform.OS === 'android' ? Math.max(insets.top, 8) : 12 }]}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    {/* Modal Header */}
                    <View style={styles.modalHeader}>
                        <View style={styles.modalHeaderLeft}>
                            <View style={styles.modalHeaderIconBox}>
                                <BookOpen size={20} color={mode === 'dark' ? '#60A5FA' : '#2563EB'} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.modalTitle}>Añadir Alimento al Tiempo de Comida</Text>
                                <Text style={styles.modalSubtitle}>
                                    Consulta el catálogo nutricional por categoría o nombre y calcula sus macros automáticamente
                                </Text>
                            </View>
                        </View>
                        <TouchableOpacity
                            style={styles.modalCloseBtn}
                            onPress={() => setIsSearchModalOpen(false)}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            <X size={22} color={colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.modalScroll}
                        contentContainerStyle={styles.modalScrollContent}
                        keyboardShouldPersistTaps="handled"
                        nestedScrollEnabled
                        showsVerticalScrollIndicator={false}
                    >
                        {/* CATÁLOGO DE ALIMENTOS EN BASE DE DATOS */}
                        <View style={styles.dbCatalogBox}>
                            <View style={styles.dbCatalogHeaderRow}>
                                <View style={styles.dbCatalogTitleRow}>
                                    <Database size={15} color={mode === 'dark' ? '#34D399' : '#059669'} />
                                    <Text style={styles.dbCatalogTitleText}>
                                        CATÁLOGO DE ALIMENTOS EN BASE DE DATOS
                                    </Text>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <View style={styles.dbCountBadge}>
                                        <Text style={styles.dbCountBadgeText}>
                                            {catalogLoading && catalogFoods.length === 0
                                                ? 'Cargando...'
                                                : `${filteredCatalogFoods.length} alimento${filteredCatalogFoods.length === 1 ? '' : 's'}`}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        onPress={() => fetchFoodCatalog(true)}
                                        style={styles.dbRefreshBtn}
                                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                    >
                                        <RefreshCw size={13} color={mode === 'dark' ? '#34D399' : '#059669'} />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Filters: Category & Search by Name */}
                            <View style={styles.dbFiltersContainer}>
                                <View style={styles.dbFilterCategoryCol}>
                                    <Text style={styles.dbFilterLabel}>Filtrar por Categoría</Text>
                                    <View style={styles.dbPickerBox}>
                                        <Picker
                                            selectedValue={selectedCategoryId}
                                            onValueChange={(val) => setSelectedCategoryId(String(val))}
                                            dropdownIconColor={mode === 'dark' ? '#34D399' : '#059669'}
                                            style={styles.dbPicker}
                                        >
                                            <Picker.Item label="Todas las categorías" value="" color={pickerItemColor} style={{ backgroundColor: pickerItemBg }} />
                                            {foodCategories.map((cat) => (
                                                <Picker.Item
                                                    key={String(cat.id)}
                                                    label={cat.name}
                                                    value={String(cat.id)}
                                                    color={pickerItemColor}
                                                    style={{ backgroundColor: pickerItemBg }}
                                                />
                                            ))}
                                        </Picker>
                                    </View>
                                </View>

                                <View style={styles.dbFilterSearchCol}>
                                    <Text style={styles.dbFilterLabel}>Buscar Alimento por Nombre</Text>
                                    <View style={styles.dbSearchInputBox}>
                                        <Search size={16} color="#94A3B8" style={{ marginRight: 8 }} />
                                        <TextInput
                                            style={styles.dbSearchInput}
                                            placeholder="Ej. Pechuga de pollo, Arroz, Huevo, Leche..."
                                            placeholderTextColor="#94A3B8"
                                            value={dbSearchQuery}
                                            onChangeText={setDbSearchQuery}
                                        />
                                        {dbSearchQuery.length > 0 && (
                                            <TouchableOpacity
                                                onPress={() => setDbSearchQuery('')}
                                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                            >
                                                <X size={16} color="#94A3B8" />
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            </View>

                            {/* Catalog Results List */}
                            <View style={styles.dbResultsCard}>
                                {catalogLoading && catalogFoods.length === 0 ? (
                                    <View style={styles.dbEmptyState}>
                                        <ActivityIndicator size="small" color="#10B981" />
                                        <Text style={styles.dbEmptyText}>Cargando catálogo nutricional...</Text>
                                    </View>
                                ) : catalogFoods.length === 0 ? (
                                    <View style={styles.dbEmptyState}>
                                        <Text style={styles.dbEmptyText}>
                                            {catalogError || 'No hay alimentos cargados en el catálogo todavía.'}
                                        </Text>
                                        <TouchableOpacity
                                            style={styles.dbRetryBtn}
                                            onPress={() => fetchFoodCatalog(true)}
                                        >
                                            <Text style={styles.dbRetryBtnText}>Reintentar carga</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : filteredCatalogFoods.length === 0 ? (
                                    <View style={styles.dbEmptyState}>
                                        <Text style={styles.dbEmptyText}>
                                            No se encontraron alimentos con "{dbSearchQuery}". Puedes escribirlo manualmente abajo.
                                        </Text>
                                    </View>
                                ) : (
                                    <ScrollView
                                        style={styles.dbResultsScroll}
                                        nestedScrollEnabled
                                        keyboardShouldPersistTaps="handled"
                                    >
                                        {filteredCatalogFoods.slice(0, 80).map((item, idx) => {
                                            const baseP = item.portions?.[0];
                                            const isFoodSelected = selectedDbFood?.key === item.key;
                                            const stateColors = getStateBadgeColors(item.state);

                                            return (
                                                <TouchableOpacity
                                                    key={item.key || String(idx)}
                                                    style={[
                                                        styles.dbFoodItem,
                                                        idx > 0 && styles.dbFoodItemBorder,
                                                        isFoodSelected && styles.dbFoodItemSelected,
                                                    ]}
                                                    activeOpacity={0.75}
                                                    onPress={() => selectDatabaseFood(item, 0)}
                                                >
                                                    <View style={styles.dbFoodTopWrap}>
                                                        <Text style={styles.dbFoodName}>{item.name}</Text>
                                                        {item.state ? (
                                                            <View style={[styles.dbStateBadge, { backgroundColor: stateColors.bg }]}>
                                                                <Text style={[styles.dbStateBadgeText, { color: stateColors.text }]}>
                                                                    {item.state}
                                                                </Text>
                                                            </View>
                                                        ) : null}
                                                        {item.category_name ? (
                                                            <View style={styles.dbCatBadge}>
                                                                <Text style={styles.dbCatBadgeText}>
                                                                    {item.category_name}
                                                                    {item.subcategory ? ` · ${item.subcategory}` : ''}
                                                                </Text>
                                                            </View>
                                                        ) : null}
                                                    </View>

                                                    {baseP ? (
                                                        <View style={styles.dbBaseMacrosRow}>
                                                            <Text style={styles.dbBasePortionLabel}>
                                                                Por {baseP.portion_type}:{' '}
                                                                <Text style={styles.dbBaseKcalStrong}>{baseP.calories} kcal</Text>
                                                            </Text>
                                                            <Text style={styles.dbMacroProt}>P: {baseP.protein}g</Text>
                                                            <Text style={styles.dbMacroCarb}>C: {baseP.carbs}g</Text>
                                                            <Text style={styles.dbMacroFat}>G: {baseP.fat}g</Text>
                                                        </View>
                                                    ) : null}

                                                    {item.portions && item.portions.length > 0 ? (
                                                        <View style={styles.dbPortionsRow}>
                                                            <Text style={styles.dbChoosePortionText}>Elegir medida:</Text>
                                                            {item.portions.map((p, pIdx) => {
                                                                const isPillActive = isFoodSelected && selectedPortionIdx === pIdx;
                                                                return (
                                                                    <TouchableOpacity
                                                                        key={`${item.key}_p_${pIdx}`}
                                                                        style={[
                                                                            styles.dbPortionPill,
                                                                            isPillActive && styles.dbPortionPillActive,
                                                                        ]}
                                                                        activeOpacity={0.8}
                                                                        onPress={() => selectDatabaseFood(item, pIdx)}
                                                                    >
                                                                        <Text
                                                                            style={[
                                                                                styles.dbPortionPillText,
                                                                                isPillActive && styles.dbPortionPillTextActive,
                                                                            ]}
                                                                        >
                                                                            {p.portion_type}
                                                                            {p.portion_detail ? ` (${p.portion_detail})` : ''}
                                                                        </Text>
                                                                    </TouchableOpacity>
                                                                );
                                                            })}
                                                        </View>
                                                    ) : null}
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </ScrollView>
                                )}
                            </View>
                        </View>

                        {/* Banner del Alimento Seleccionado desde la BD */}
                        {selectedDbFood ? (
                            <View style={styles.selectedDbBanner}>
                                <View style={styles.selectedDbBannerTop}>
                                    <View style={{ flex: 1 }}>
                                        <View style={styles.selectedDbMetaRow}>
                                            <Check size={12} color="#059669" strokeWidth={3} />
                                            <Text style={styles.selectedDbCatTag}>
                                                {selectedDbFood.category_name}
                                                {selectedDbFood.subcategory ? ` · ${selectedDbFood.subcategory}` : ''}
                                                {selectedDbFood.state ? ` · ${selectedDbFood.state}` : ''}
                                            </Text>
                                        </View>
                                        <Text style={styles.selectedDbTitle}>{selectedDbFood.name}</Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.selectedDbClearBtn}
                                        onPress={clearSelectedDbFood}
                                    >
                                        <Text style={styles.selectedDbClearText}>Modo manual</Text>
                                    </TouchableOpacity>
                                </View>

                                <Text style={styles.selectedDbRefLabel}>Porciones de referencia:</Text>
                                <View style={styles.selectedDbPortionsWrap}>
                                    {selectedDbFood.portions.map((p, pIdx) => {
                                        const active = selectedPortionIdx === pIdx;
                                        return (
                                            <TouchableOpacity
                                                key={`banner_p_${pIdx}`}
                                                style={[
                                                    styles.selectedDbPortionBtn,
                                                    active && styles.selectedDbPortionBtnActive,
                                                ]}
                                                onPress={() => selectDatabaseFood(selectedDbFood, pIdx)}
                                            >
                                                <Text
                                                    style={[
                                                        styles.selectedDbPortionBtnText,
                                                        active && styles.selectedDbPortionBtnTextActive,
                                                    ]}
                                                >
                                                    {p.portion_type}
                                                    {p.portion_detail ? ` (${p.portion_detail})` : ''} · {p.calories} kcal
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        ) : null}

                        {/* Section Divider: CANTIDAD, UNIDAD Y CÁLCULO DE MACROS */}
                        <View style={styles.sectionDividerRow}>
                            <View style={styles.sectionDividerLine} />
                            <Text style={styles.sectionDividerText}>CANTIDAD, UNIDAD Y CÁLCULO DE MACROS</Text>
                            <View style={styles.sectionDividerLine} />
                        </View>

                        {/* Alimento seleccionado */}
                        <View style={styles.modalLabelRow}>
                            <Text style={styles.modalFieldLabel}>
                                Alimento seleccionado <Text style={styles.requiredStar}>*</Text>
                            </Text>
                        </View>
                        <View style={styles.modalInputBox}>
                            <TextInput
                                style={styles.inputText}
                                placeholder="Selecciona un alimento del buscador o escríbelo..."
                                placeholderTextColor="#64748B"
                                value={modalFood.name}
                                onChangeText={(val) => setModalFood((prev) => ({ ...prev, name: val }))}
                            />
                        </View>

                        {/* Cantidad y Unidad de Medida */}
                        <View style={styles.qtyUnitContainer}>
                            <View style={styles.qtyCol}>
                                <View style={styles.modalLabelRowBetween}>
                                    <Text style={styles.modalFieldLabel}>
                                        Cantidad <Text style={styles.requiredStar}>*</Text>
                                    </Text>
                                    <Text style={styles.fieldHint}>Ej: 100, 150, 1, 1/2, 2</Text>
                                </View>
                                <View style={styles.modalInputBox}>
                                    <TextInput
                                        style={styles.inputText}
                                        keyboardType="numbers-and-punctuation"
                                        placeholder="100"
                                        placeholderTextColor="#64748B"
                                        value={modalFood.quantity}
                                        onChangeText={handleModalQuantityChange}
                                    />
                                </View>

                                {/* Quick Quantity / Fraction Chips */}
                                <View style={styles.quickChipsRow}>
                                    {QUICK_QTY_CHIPS.map((chip) => {
                                        const isSelected = modalFood.quantity.trim() === chip;
                                        return (
                                            <TouchableOpacity
                                                key={chip}
                                                style={[styles.quickChip, isSelected && styles.quickChipActive]}
                                                onPress={() => handleModalQuantityChange(chip)}
                                            >
                                                <Text style={[styles.quickChipText, isSelected && styles.quickChipTextActive]}>
                                                    {chip}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>

                            <View style={styles.unitCol}>
                                <View style={styles.modalLabelRow}>
                                    <Text style={styles.modalFieldLabel}>Unidad de Medida</Text>
                                </View>
                                <View style={styles.pickerBox}>
                                    <Picker
                                        selectedValue={modalFood.unit}
                                        onValueChange={(val) => handleModalUnitChange(String(val))}
                                        dropdownIconColor={colors.primary}
                                        style={styles.picker}
                                    >
                                        {FOOD_UNITS.map((u) => (
                                            <Picker.Item
                                                key={u.value}
                                                label={u.label}
                                                value={u.value}
                                                color={pickerItemColor}
                                                style={{ backgroundColor: pickerItemBg }}
                                            />
                                        ))}
                                    </Picker>
                                </View>
                                {portionBase?.hint ? (
                                    <Text style={styles.portionHintText}>{portionBase.hint}</Text>
                                ) : null}
                            </View>
                        </View>

                        {/* CÁLCULO DE MACRONUTRIENTES SEGÚN CANTIDAD Y UNIDAD */}
                        <View style={styles.macroCalcContainer}>
                            <View style={styles.macroCalcHeaderRow}>
                                <Text style={styles.macroCalcTitle}>
                                    CÁLCULO DE MACRONUTRIENTES SEGÚN CANTIDAD Y UNIDAD
                                </Text>
                                <View style={styles.macroCalcRealtimeBadge}>
                                    <Text style={styles.macroCalcRealtimeText}>{macroFormulaBadgeText}</Text>
                                </View>
                            </View>

                            <View style={styles.macroCalcGrid}>
                                {/* Kcal */}
                                <View style={[styles.macroCalcBox, styles.macroBoxKcal]}>
                                    <Text style={styles.macroCalcBoxLabelKcal}>Kcal (Calorías)</Text>
                                    <TextInput
                                        style={styles.macroCalcInputKcal}
                                        keyboardType="decimal-pad"
                                        placeholder="0"
                                        placeholderTextColor="#94A3B8"
                                        value={modalFood.calories}
                                        onChangeText={(val) => setModalFood((prev) => ({ ...prev, calories: val }))}
                                    />
                                </View>

                                {/* Proteína */}
                                <View style={[styles.macroCalcBox, styles.macroBoxProt]}>
                                    <Text style={styles.macroCalcBoxLabelProt}>Proteína (g)</Text>
                                    <TextInput
                                        style={styles.macroCalcInputProt}
                                        keyboardType="decimal-pad"
                                        placeholder="0"
                                        placeholderTextColor="#93C5FD"
                                        value={modalFood.protein}
                                        onChangeText={(val) => setModalFood((prev) => ({ ...prev, protein: val }))}
                                    />
                                </View>

                                {/* Carbos */}
                                <View style={[styles.macroCalcBox, styles.macroBoxCarb]}>
                                    <Text style={styles.macroCalcBoxLabelCarb}>Carbos (g)</Text>
                                    <TextInput
                                        style={styles.macroCalcInputCarb}
                                        keyboardType="decimal-pad"
                                        placeholder="0"
                                        placeholderTextColor="#FCD34D"
                                        value={modalFood.carbs}
                                        onChangeText={(val) => setModalFood((prev) => ({ ...prev, carbs: val }))}
                                    />
                                </View>

                                {/* Grasa */}
                                <View style={[styles.macroCalcBox, styles.macroBoxFat]}>
                                    <Text style={styles.macroCalcBoxLabelFat}>Grasa (g)</Text>
                                    <TextInput
                                        style={styles.macroCalcInputFat}
                                        keyboardType="decimal-pad"
                                        placeholder="0"
                                        placeholderTextColor="#6EE7B7"
                                        value={modalFood.fat}
                                        onChangeText={(val) => setModalFood((prev) => ({ ...prev, fat: val }))}
                                    />
                                </View>
                            </View>
                        </View>

                        {/* Action Buttons: Cancelar & Añadir a la Comida */}
                        <View style={styles.modalActionsRow}>
                            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setIsSearchModalOpen(false)}>
                                <Text style={styles.modalCancelBtnText}>Cancelar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleAddFoodSubmit}>
                                <Plus size={18} color={mode === 'dark' ? '#000000' : '#FFFFFF'} />
                                <Text style={styles.modalSubmitBtnText}>Añadir a la Comida</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: any, mode: 'dark' | 'light', isWide: boolean) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingBottom: 16,
        backgroundColor: colors.background,
        justifyContent: 'space-between',
    },
    topBackBtn: {
        padding: 4,
        justifyContent: 'center',
        alignItems: 'center',
    },
    topBrandContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 6,
    },
    topLogo: {
        width: 32,
        height: 24,
    },
    topTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
        flex: 1,
        textAlign: 'center',
    },
    topAvatarCircle: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrollContent: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    card: {
        backgroundColor: colors.surface,
        borderRadius: 18,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 16,
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    cardIconBox: {
        width: 32,
        height: 32,
        borderRadius: 8,
        backgroundColor: colors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
    },
    metabolismBadge: {
        backgroundColor: colors.surfaceLight,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    metabolismBadgeText: {
        color: colors.textMuted,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    fieldLabel: {
        fontSize: 13,
        fontWeight: '600',
        color: colors.textMuted,
        marginBottom: 6,
    },
    labelRowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 6,
    },
    badgeDeficit: {
        backgroundColor: '#EA580C',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 10,
    },
    badgeDeficitText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
    },
    badgeSurplus: {
        backgroundColor: '#10B981',
        paddingHorizontal: 10,
        paddingVertical: 3,
        borderRadius: 10,
    },
    badgeSurplusText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
    },
    pickerBox: {
        backgroundColor: mode === 'dark' ? '#060D1A' : '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: mode === 'dark' ? 'rgba(93, 166, 255, 0.4)' : '#94A3B8',
        height: 50,
        justifyContent: 'center',
        marginBottom: 8,
        overflow: 'hidden',
    },
    picker: {
        color: mode === 'dark' ? '#FFFFFF' : '#0F172A',
        fontSize: 14.5,
        fontWeight: '700',
        marginHorizontal: -4,
    },
    segmentedRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
    },
    segmentBtn: {
        flex: 1,
        height: 48,
        borderRadius: 12,
        backgroundColor: mode === 'dark' ? '#060D1A' : '#FFFFFF',
        borderWidth: 1.5,
        borderColor: mode === 'dark' ? 'rgba(93, 166, 255, 0.3)' : '#CBD5E1',
        justifyContent: 'center',
        alignItems: 'center',
    },
    segmentBtnActive: {
        backgroundColor: mode === 'dark' ? 'rgba(93, 166, 255, 0.22)' : '#EFF6FF',
        borderColor: colors.primary,
        borderWidth: 2,
    },
    segmentBtnText: {
        fontSize: 14.5,
        fontWeight: '700',
        color: colors.textMuted,
    },
    segmentBtnTextActive: {
        color: mode === 'dark' ? '#5DA6FF' : '#1D4ED8',
        fontWeight: '800',
    },
    objectiveRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 12,
    },
    objectiveChip: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderRadius: 12,
        backgroundColor: mode === 'dark' ? '#060D1A' : '#FFFFFF',
        borderWidth: 1.5,
        borderColor: mode === 'dark' ? 'rgba(93, 166, 255, 0.3)' : '#CBD5E1',
        justifyContent: 'center',
        alignItems: 'center',
    },
    objectiveChipActive: {
        backgroundColor: mode === 'dark' ? 'rgba(93, 166, 255, 0.22)' : '#EFF6FF',
        borderColor: colors.primary,
        borderWidth: 2,
    },
    objectiveChipText: {
        fontSize: 12.5,
        fontWeight: '700',
        color: colors.textMuted,
        textAlign: 'center',
    },
    objectiveChipTextActive: {
        color: mode === 'dark' ? '#5DA6FF' : '#1D4ED8',
        fontWeight: '800',
    },
    fieldRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 0,
    },
    fieldCol: {
        flex: 1,
    },
    inputWithSuffix: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: mode === 'dark' ? '#060D1A' : '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: mode === 'dark' ? 'rgba(93, 166, 255, 0.4)' : '#94A3B8',
        height: 50,
        paddingHorizontal: 14,
        marginBottom: 12,
    },
    inputText: {
        flex: 1,
        color: mode === 'dark' ? '#FFFFFF' : '#0F172A',
        fontSize: 15,
        fontWeight: '700',
    },
    suffixBadge: {
        color: colors.textMuted,
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    calculateBtn: {
        backgroundColor: colors.primary,
        borderRadius: 12,
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        marginTop: 6,
    },
    calculateBtnText: {
        color: mode === 'dark' ? '#000000' : '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    section2Header: {
        marginTop: 10,
        marginBottom: 12,
    },
    section2TitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 4,
    },
    section2Title: {
        fontSize: 20,
        fontWeight: '800',
        color: colors.text,
    },
    section2Subtitle: {
        fontSize: 13,
        lineHeight: 18,
        color: colors.textMuted,
    },
    subCard: {
        backgroundColor: colors.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 16,
        marginBottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    subCardLeft: {
        flex: 1,
    },
    subCardLabel: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.5,
        color: colors.textMuted,
        marginBottom: 4,
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
    },
    statBigNumber: {
        fontSize: 26,
        fontWeight: '800',
        color: colors.text,
    },
    statUnit: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textMuted,
    },
    subCardIconCircle: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: colors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    calTargetLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 4,
    },
    calAdjustmentBadge: {
        backgroundColor: '#EA580C',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    calAdjustmentBadgeText: {
        color: '#FFFFFF',
        fontSize: 11,
        fontWeight: '800',
    },
    distHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 6,
        marginBottom: 8,
    },
    distLabel: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.5,
        color: colors.textMuted,
    },
    distValues: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.text,
    },
    segmentedProgressBar: {
        height: 8,
        borderRadius: 4,
        flexDirection: 'row',
        overflow: 'hidden',
        backgroundColor: colors.border,
        marginBottom: 16,
        gap: 2,
    },
    progressSegment: {
        height: '100%',
        borderRadius: 2,
    },
    macroCard: {
        backgroundColor: colors.surface,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        paddingVertical: 14,
        paddingHorizontal: 16,
        marginBottom: 10,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    macroCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    macroDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
    },
    macroTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.text,
    },
    macroSubtitle: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    macroCardRight: {
        alignItems: 'flex-end',
    },
    macroGramText: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.text,
    },
    macroKcalText: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    fineTuneBox: {
        backgroundColor: colors.surface,
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
        marginTop: 6,
        marginBottom: 16,
    },
    fineTuneHeader: {
        marginBottom: 12,
    },
    fineTuneTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.text,
    },
    fineTuneSubtitle: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    fineTuneRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    fineTuneRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    fineTuneLabel: {
        fontSize: 13,
        color: colors.text,
        fontWeight: '600',
    },
    fineTuneInput: {
        backgroundColor: colors.surfaceLight,
        borderRadius: 8,
        width: 80,
        paddingVertical: 6,
        paddingHorizontal: 8,
        textAlign: 'center',
        color: colors.text,
        fontWeight: '700',
        borderWidth: 1,
        borderColor: colors.border,
    },
    fineTuneReadOnly: {
        backgroundColor: colors.surfaceLight,
        borderRadius: 8,
        width: 80,
        paddingVertical: 6,
        paddingHorizontal: 8,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    fineTuneReadOnlyText: {
        color: '#F97316',
        fontSize: 12,
        fontWeight: '800',
    },
    primaryAssignBtn: {
        backgroundColor: colors.primary,
        borderRadius: 14,
        height: 52,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginTop: 14,
        marginBottom: 8,
    },
    primaryAssignBtnText: {
        color: mode === 'dark' ? '#000000' : '#FFFFFF',
        fontSize: 16,
        fontWeight: '800',
    },
    footerSyncText: {
        color: colors.textMuted,
        fontSize: 11,
        textAlign: 'center',
        marginTop: 4,
        marginBottom: 24,
        lineHeight: 16,
    },
    totalsHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 10,
    },
    totalsTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.text,
    },
    totalsSubtitle: {
        fontSize: 13,
        fontWeight: '800',
        color: colors.primary,
    },
    accumulatedTotalsBox: {
        flexDirection: 'row',
        backgroundColor: colors.surfaceLight,
        padding: 12,
        borderRadius: 12,
        justifyContent: 'space-between',
        borderWidth: 1,
        borderColor: colors.border,
    },
    accCol: {
        alignItems: 'center',
        flex: 1,
    },
    accLabel: {
        fontSize: 10,
        fontWeight: '800',
        color: colors.textMuted,
        textTransform: 'uppercase',
    },
    accValue: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.text,
        marginTop: 2,
    },
    mealCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    mealNameInput: {
        flex: 1,
        fontSize: 15,
        fontWeight: '800',
        color: colors.text,
        backgroundColor: colors.surfaceLight,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: colors.border,
        marginRight: 10,
    },
    mealHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    mealSubtotals: {
        backgroundColor: colors.surfaceLight,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
    },
    mealSubText: {
        fontSize: 12,
        fontWeight: '800',
        color: colors.primary,
    },
    removeMealBtn: {
        padding: 8,
        backgroundColor: colors.surfaceLight,
        borderRadius: 8,
    },
    foodList: {
        marginBottom: 10,
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingTop: 10,
        gap: 8,
    },
    foodRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surfaceLight,
        padding: 10,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
    },
    foodName: {
        fontSize: 13,
        fontWeight: '700',
        color: colors.text,
    },
    gramsInput: {
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
        minWidth: 55,
        textAlign: 'center',
        fontSize: 12,
        backgroundColor: colors.surface,
        color: colors.text,
        fontWeight: '700',
    },
    unitToggle: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        backgroundColor: colors.surface,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: colors.border,
        marginLeft: 4,
    },
    gramsLabel: {
        fontSize: 11,
        color: colors.textMuted,
        fontWeight: '600',
    },
    foodCalBadge: {
        color: colors.textMuted,
        fontSize: 11,
        fontWeight: '700',
        marginLeft: 8,
    },
    foodMacros: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        marginRight: 8,
    },
    macroPill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        paddingHorizontal: 5,
        paddingVertical: 2,
        borderRadius: 4,
        gap: 2,
    },
    macroPillLabel: {
        fontSize: 10,
        fontWeight: '800',
    },
    macroPillValue: {
        fontSize: 10,
        fontWeight: '700',
        color: colors.text,
    },
    deleteFoodBtn: {
        padding: 6,
    },
    addFoodBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: colors.surfaceLight,
        borderWidth: 1,
        borderColor: colors.border,
        borderStyle: 'dashed',
        marginTop: 4,
    },
    addFoodText: {
        color: colors.primary,
        fontWeight: '700',
        fontSize: 13,
    },
    addMealTimeBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 14,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        borderStyle: 'dashed',
        marginBottom: 16,
    },
    addMealTimeBtnText: {
        color: colors.primary,
        fontSize: 14,
        fontWeight: '800',
    },
    textArea: {
        height: 70,
        textAlignVertical: 'top',
        paddingTop: 10,
    },

    // ─── Food Catalog & Macro Calculator Modal Styles ───
    modalContainer: {
        flex: 1,
        backgroundColor: mode === 'dark' ? colors.background : '#FFFFFF',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: mode === 'dark' ? colors.surface : '#F8FAFC',
        gap: 10,
    },
    modalHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        flex: 1,
    },
    modalHeaderIconBox: {
        width: 38,
        height: 38,
        borderRadius: 12,
        backgroundColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.16)' : '#EFF6FF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalTitle: {
        fontSize: 16,
        fontWeight: '800',
        color: colors.text,
    },
    modalSubtitle: {
        fontSize: 11,
        color: colors.textMuted,
        marginTop: 2,
        lineHeight: 15,
    },
    modalCloseBtn: {
        padding: 6,
        borderRadius: 10,
        backgroundColor: mode === 'dark' ? colors.surfaceLight : '#F1F5F9',
    },
    modalScroll: {
        flex: 1,
    },
    modalScrollContent: {
        paddingHorizontal: 16,
        paddingTop: 14,
        paddingBottom: 40,
    },

    // DB Catalog Emerald Section
    dbCatalogBox: {
        backgroundColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.08)' : '#F0FDF9',
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
        borderRadius: 18,
        padding: 14,
        marginBottom: 14,
    },
    dbCatalogHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    dbCatalogTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        flexShrink: 1,
    },
    dbCatalogTitleText: {
        fontSize: 11.5,
        fontWeight: '800',
        letterSpacing: 0.4,
        color: mode === 'dark' ? '#6EE7B7' : '#064E3B',
        flexShrink: 1,
    },
    dbCountBadge: {
        backgroundColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.22)' : '#D1FAE5',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 14,
    },
    dbCountBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        color: mode === 'dark' ? '#6EE7B7' : '#047857',
    },
    dbRefreshBtn: {
        padding: 5,
        borderRadius: 8,
        backgroundColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.16)' : '#D1FAE5',
    },
    dbFiltersContainer: {
        flexDirection: isWide ? 'row' : 'column',
        gap: 10,
        marginBottom: 12,
    },
    dbFilterCategoryCol: {
        flex: isWide ? 5 : undefined,
    },
    dbFilterSearchCol: {
        flex: isWide ? 7 : undefined,
    },
    dbFilterLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: mode === 'dark' ? colors.textMuted : '#475569',
        marginBottom: 5,
    },
    dbPickerBox: {
        backgroundColor: mode === 'dark' ? '#041716' : '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.5)' : '#059669',
        height: 48,
        justifyContent: 'center',
        overflow: 'hidden',
    },
    dbPicker: {
        color: mode === 'dark' ? '#A7F3D0' : '#064E3B',
        fontSize: 14,
        fontWeight: '700',
        marginHorizontal: -4,
    },
    dbSearchInputBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: mode === 'dark' ? '#041716' : '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.45)' : '#059669',
        height: 48,
        paddingHorizontal: 12,
    },
    dbSearchInput: {
        flex: 1,
        color: mode === 'dark' ? '#FFFFFF' : '#0F172A',
        fontSize: 14,
        fontWeight: '600',
    },
    dbResultsCard: {
        backgroundColor: mode === 'dark' ? colors.surface : '#FFFFFF',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.25)' : '#D1FAE5',
        overflow: 'hidden',
    },
    dbResultsScroll: {
        maxHeight: 245,
    },
    dbEmptyState: {
        paddingVertical: 22,
        paddingHorizontal: 16,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    dbEmptyText: {
        fontSize: 12.5,
        color: colors.textMuted,
        textAlign: 'center',
        lineHeight: 18,
    },
    dbRetryBtn: {
        marginTop: 4,
        backgroundColor: '#10B981',
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 8,
    },
    dbRetryBtnText: {
        color: '#FFFFFF',
        fontSize: 12,
        fontWeight: '700',
    },
    dbFoodItem: {
        paddingVertical: 11,
        paddingHorizontal: 12,
    },
    dbFoodItemBorder: {
        borderTopWidth: 1,
        borderTopColor: mode === 'dark' ? colors.border : '#F1F5F9',
    },
    dbFoodItemSelected: {
        backgroundColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.14)' : '#ECFDF5',
    },
    dbFoodTopWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
    },
    dbFoodName: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.text,
    },
    dbStateBadge: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    dbStateBadgeText: {
        fontSize: 10,
        fontWeight: '700',
    },
    dbCatBadge: {
        backgroundColor: mode === 'dark' ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 6,
    },
    dbCatBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: mode === 'dark' ? '#A5B4FC' : '#4338CA',
    },
    dbBaseMacrosRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        marginTop: 5,
    },
    dbBasePortionLabel: {
        fontSize: 11.5,
        color: colors.textMuted,
    },
    dbBaseKcalStrong: {
        fontWeight: '800',
        color: colors.text,
    },
    dbMacroProt: {
        fontSize: 11.5,
        fontWeight: '700',
        color: mode === 'dark' ? '#60A5FA' : '#2563EB',
    },
    dbMacroCarb: {
        fontSize: 11.5,
        fontWeight: '700',
        color: mode === 'dark' ? '#FBBF24' : '#D97706',
    },
    dbMacroFat: {
        fontSize: 11.5,
        fontWeight: '700',
        color: mode === 'dark' ? '#34D399' : '#059669',
    },
    dbPortionsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 6,
        marginTop: 8,
    },
    dbChoosePortionText: {
        fontSize: 10.5,
        fontWeight: '600',
        color: colors.textMuted,
    },
    dbPortionPill: {
        backgroundColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.14)' : '#ECFDF5',
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.4)' : '#A7F3D0',
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
    },
    dbPortionPillActive: {
        backgroundColor: '#059669',
        borderColor: '#059669',
    },
    dbPortionPillText: {
        fontSize: 11,
        fontWeight: '700',
        color: mode === 'dark' ? '#6EE7B7' : '#047857',
    },
    dbPortionPillTextActive: {
        color: '#FFFFFF',
    },

    // Selected DB Food Reference Banner
    selectedDbBanner: {
        backgroundColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.1)' : '#ECFDF5',
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
        borderRadius: 14,
        padding: 12,
        marginBottom: 14,
    },
    selectedDbBannerTop: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 8,
    },
    selectedDbMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    selectedDbCatTag: {
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
        color: mode === 'dark' ? '#6EE7B7' : '#047857',
    },
    selectedDbTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.text,
        marginTop: 2,
    },
    selectedDbClearBtn: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: mode === 'dark' ? colors.surface : '#FFFFFF',
        borderWidth: 1,
        borderColor: mode === 'dark' ? colors.border : '#CBD5E1',
    },
    selectedDbClearText: {
        fontSize: 10.5,
        fontWeight: '700',
        color: colors.textMuted,
    },
    selectedDbRefLabel: {
        fontSize: 11,
        fontWeight: '700',
        color: mode === 'dark' ? '#6EE7B7' : '#047857',
        marginTop: 8,
        marginBottom: 6,
    },
    selectedDbPortionsWrap: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    selectedDbPortionBtn: {
        backgroundColor: mode === 'dark' ? colors.surface : '#FFFFFF',
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderRadius: 8,
    },
    selectedDbPortionBtnActive: {
        backgroundColor: '#059669',
        borderColor: '#059669',
    },
    selectedDbPortionBtnText: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.text,
    },
    selectedDbPortionBtnTextActive: {
        color: '#FFFFFF',
    },

    // Section Divider
    sectionDividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginVertical: 10,
    },
    sectionDividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: colors.border,
    },
    sectionDividerText: {
        fontSize: 10.5,
        fontWeight: '800',
        letterSpacing: 0.8,
        color: colors.textMuted,
    },

    modalLabelRow: {
        marginBottom: 6,
    },
    modalLabelRowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        marginBottom: 6,
    },
    modalFieldLabel: {
        fontSize: 12.5,
        fontWeight: '700',
        color: colors.text,
    },
    requiredStar: {
        color: '#EF4444',
        fontWeight: '800',
    },
    fieldHint: {
        fontSize: 10.5,
        color: colors.textMuted,
        fontWeight: '600',
    },
    modalInputBox: {
        backgroundColor: mode === 'dark' ? '#060D1A' : '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: mode === 'dark' ? 'rgba(93, 166, 255, 0.4)' : '#94A3B8',
        height: 48,
        paddingHorizontal: 14,
        marginBottom: 10,
        justifyContent: 'center',
    },
    qtyUnitContainer: {
        flexDirection: isWide ? 'row' : 'column',
        gap: 12,
        marginTop: 2,
    },
    qtyCol: {
        flex: isWide ? 1 : undefined,
    },
    unitCol: {
        flex: isWide ? 1 : undefined,
    },
    portionHintText: {
        fontSize: 11,
        fontWeight: '600',
        color: mode === 'dark' ? '#6EE7B7' : '#047857',
        marginBottom: 8,
    },
    quickChipsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 0,
        marginBottom: 10,
    },
    quickChip: {
        backgroundColor: mode === 'dark' ? colors.surfaceLight : '#F1F5F9',
        borderRadius: 8,
        paddingHorizontal: 9,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: colors.border,
    },
    quickChipActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    quickChipText: {
        color: colors.text,
        fontSize: 11.5,
        fontWeight: '700',
    },
    quickChipTextActive: {
        color: mode === 'dark' ? '#000000' : '#FFFFFF',
    },

    // Real-time Macro Calculation Breakdown Box
    macroCalcContainer: {
        backgroundColor: mode === 'dark' ? colors.surface : '#F8FAFC',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        padding: 14,
        marginTop: 6,
    },
    macroCalcHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    macroCalcTitle: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.4,
        color: colors.text,
        flexShrink: 1,
    },
    macroCalcRealtimeBadge: {
        backgroundColor: mode === 'dark' ? 'rgba(99, 102, 241, 0.2)' : '#EEF2FF',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
    },
    macroCalcRealtimeText: {
        fontSize: 10.5,
        fontWeight: '700',
        color: mode === 'dark' ? '#A5B4FC' : '#4F46E5',
    },
    macroCalcGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    macroCalcBox: {
        width: isWide ? '23.5%' : '48%',
        flexGrow: 1,
        borderRadius: 12,
        borderWidth: 1,
        paddingVertical: 10,
        paddingHorizontal: 8,
        alignItems: 'center',
    },
    macroBoxKcal: {
        backgroundColor: mode === 'dark' ? colors.surfaceLight : '#FFFFFF',
        borderColor: colors.border,
    },
    macroBoxProt: {
        backgroundColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.12)' : '#EFF6FF',
        borderColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.35)' : '#BFDBFE',
    },
    macroBoxCarb: {
        backgroundColor: mode === 'dark' ? 'rgba(245, 158, 11, 0.12)' : '#FFFBEB',
        borderColor: mode === 'dark' ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
    },
    macroBoxFat: {
        backgroundColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.12)' : '#ECFDF5',
        borderColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
    },
    macroCalcBoxLabelKcal: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.textMuted,
        marginBottom: 4,
    },
    macroCalcBoxLabelProt: {
        fontSize: 11,
        fontWeight: '700',
        color: mode === 'dark' ? '#60A5FA' : '#1D4ED8',
        marginBottom: 4,
    },
    macroCalcBoxLabelCarb: {
        fontSize: 11,
        fontWeight: '700',
        color: mode === 'dark' ? '#FBBF24' : '#B45309',
        marginBottom: 4,
    },
    macroCalcBoxLabelFat: {
        fontSize: 11,
        fontWeight: '700',
        color: mode === 'dark' ? '#34D399' : '#047857',
        marginBottom: 4,
    },
    macroCalcInputKcal: {
        width: '100%',
        textAlign: 'center',
        fontSize: 16,
        fontWeight: '900',
        color: colors.text,
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: mode === 'dark' ? colors.surface : '#F8FAFC',
        borderWidth: 1,
        borderColor: colors.border,
    },
    macroCalcInputProt: {
        width: '100%',
        textAlign: 'center',
        fontSize: 16,
        fontWeight: '900',
        color: mode === 'dark' ? '#60A5FA' : '#1D4ED8',
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: mode === 'dark' ? colors.surface : '#FFFFFF',
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(59, 130, 246, 0.3)' : '#BFDBFE',
    },
    macroCalcInputCarb: {
        width: '100%',
        textAlign: 'center',
        fontSize: 16,
        fontWeight: '900',
        color: mode === 'dark' ? '#FBBF24' : '#B45309',
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: mode === 'dark' ? colors.surface : '#FFFFFF',
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(245, 158, 11, 0.3)' : '#FDE68A',
    },
    macroCalcInputFat: {
        width: '100%',
        textAlign: 'center',
        fontSize: 16,
        fontWeight: '900',
        color: mode === 'dark' ? '#34D399' : '#047857',
        paddingVertical: 4,
        borderRadius: 8,
        backgroundColor: mode === 'dark' ? colors.surface : '#FFFFFF',
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(16, 185, 129, 0.3)' : '#A7F3D0',
    },

    modalActionsRow: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 18,
        marginBottom: 16,
    },
    modalCancelBtn: {
        flex: 1,
        height: 48,
        borderRadius: 12,
        backgroundColor: mode === 'dark' ? colors.surfaceLight : '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: colors.border,
    },
    modalCancelBtnText: {
        color: colors.textMuted,
        fontSize: 15,
        fontWeight: '700',
    },
    modalSubmitBtn: {
        flex: 2,
        height: 48,
        borderRadius: 12,
        backgroundColor: colors.primary,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    modalSubmitBtnText: {
        color: mode === 'dark' ? '#000000' : '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
});
