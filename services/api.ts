import axios from 'axios';
import { Platform } from 'react-native';
import Storage from './storage';

// Nota: 10.0.2.2 es el host para el emulador de Android. 
// Para dispositivos físicos, usa tu IP local (ej: http://192.168.1.XX:8000/api)
export const getBaseUrl = () => {
    // Si la app está compilada para producción, se conecta directamente al servidor oficial
    if (!__DEV__) {
        return 'https://aftraining.skecomponent.mx/api/';
    }

    // Para probar directamente en tu servidor local
    return 'https://aftraining.skecomponent.mx/api/';
};

export const API_HOST = getBaseUrl().replace('/api/', '');

const api = axios.create({
    baseURL: getBaseUrl(),
    timeout: 10000, // 10 segundos de límite para evitar bloqueos
    headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
    },
});

// Interceptor para añadir el token a las peticiones
api.interceptors.request.use(async (config) => {
    const token = await Storage.getItem('auth_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.url && config.url.startsWith('/')) {
        config.url = config.url.substring(1);
    }

    // Debug: Log the full URL
    const separator = config.baseURL?.endsWith('/') || config.url?.startsWith('/') ? '' : '/';
    const fullUrl = `${config.baseURL || ''}${separator}${config.url || ''}`;
    console.log(`[API Request] ${config.method?.toUpperCase()} ${fullUrl}`);

    return config;
});

// Interceptor para manejar respuestas, especialmente errores de autenticación (401)
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response) {
            const status = error.response.status;
            // Solo logeamos como error real si es un fallo del servidor (500+)
            if (status >= 500) {
                console.error(`[API Server Error] ${status} | ${error.config?.url}`);
            } else {
                // 422, 401, etc son errores de 'lógica' o 'validación' esperados
                console.log(`[API Info] Status: ${status} | ${error.config?.url}`);
            }
        } else {
            console.error('[API Connection Error]:', error.message);
        }

        if (error.response && error.response.status === 401) {
            const token = await Storage.getItem('auth_token');
            if (token) {
                // Solo advertimos y limpiamos si realmente había un token que falló
                console.warn('Sesión expirada o token inválido (401). Limpiando almacenamiento.');
                await Storage.deleteItem('auth_token');
                await Storage.deleteItem('user_data');
            }
        }
        return Promise.reject(error);
    }
);

export const searchFatSecretFoods = async (query: string) => {
    try {
        const response = await api.get('/fatsecret/search', { params: { query } });
        return response.data;
    } catch (error) {
        console.error('Error searching FatSecret foods:', error);
        throw error;
    }
};

export const getFatSecretFoodDetails = async (id: string) => {
    try {
        const response = await api.get(`/fatsecret/food/${id}`);
        return response.data;
    } catch (error) {
        console.error('Error getting FatSecret food details:', error);
        throw error;
    }
};

export const parseQuantity = (str: string | number): number => {
    if (typeof str === 'number') return isNaN(str) || !isFinite(str) ? 0 : str;
    if (!str || typeof str !== 'string') return 0;
    const cleaned = str.trim().replace(',', '.');
    if (!cleaned) return 0;

    // Check for mixed fraction like "1 1/2", "2 1/3", "1-1/2"
    if (cleaned.includes(' ') || cleaned.includes('-')) {
        const parts = cleaned.split(/[\s-]+/).filter(Boolean);
        if (parts.length === 2) {
            const whole = parseFloat(parts[0]);
            const frac = parseQuantity(parts[1]);
            if (!isNaN(whole) && !isNaN(frac)) {
                return whole + frac;
            }
        }
    }

    // Check for simple fraction like "1/2", "1/3", "1/4", "3/4"
    if (cleaned.includes('/')) {
        const [numStr, denStr] = cleaned.split('/');
        const num = parseFloat(numStr);
        const den = parseFloat(denStr);
        if (!isNaN(num) && !isNaN(den) && den !== 0) {
            return num / den;
        }
        return 0;
    }

    const parsed = parseFloat(cleaned);
    return isNaN(parsed) || !isFinite(parsed) ? 0 : parsed;
};

const safeNum = (v: any, fallback = 0): number => {
    const n = Number(v);
    return isNaN(n) || !isFinite(n) ? fallback : n;
};

export const saveNutritionPlan = async (rawData: any) => {
    try {
        let parsedMeals = [];
        try {
            parsedMeals = typeof rawData.meals_data === 'string' ? JSON.parse(rawData.meals_data) : (rawData.meals || rawData.meals_data || []);
        } catch (e) {
            console.error('Failed to parse meals_data', e);
        }

        const formattedMeals = (parsedMeals || []).map((meal: any) => {
            if (!meal) return { name: 'Comida', foods: [] };
            return {
                name: meal.name || 'Comida',
                foods: ((meal && meal.foods) || []).map((food: any) => {
                    if (!food) return { fatsecret_food_id: null, name: 'Alimento', serving_size: '1', serving_unit: 'g', calories: 0, protein: 0, carbs: 0, fat: 0 };
                    const isNumericId = food.id && !isNaN(Number(food.id)) && !String(food.id).includes('manual') && !String(food.id).includes('fs_');
                    const rawAmount = food.amountText !== undefined && food.amountText !== null ? String(food.amountText) : (food.servingSize ? String(food.servingSize) : '1');
                    const parsedServingSize = parseQuantity(rawAmount) || 1;
                    const multiplier = (food.amountMultiplier === undefined || isNaN(Number(food.amountMultiplier))) ? 1 : safeNum(food.amountMultiplier, 1);
                    const safeUnit = food.unit || (typeof food.servingSize === 'string' ? food.servingSize.replace(/[0-9.]/g, '').trim() : '') || 'g';

                    return {
                        fatsecret_food_id: isNumericId ? Number(food.id) : (String(food.id || '').startsWith('manual') ? String(food.id) : null),
                        name: food.name || 'Alimento',
                        serving_size: String(parsedServingSize),
                        serving_unit: safeUnit,
                        calories: safeNum(food.calories) * multiplier,
                        protein: safeNum(food.protein) * multiplier,
                        carbs: safeNum(food.carbs) * multiplier,
                        fat: safeNum(food.fat) * multiplier,
                    };
                })
            };
        });

        const totalCals = safeNum(rawData.target_calories) || safeNum(rawData.total_calories);
        const proteinGrams = safeNum(rawData.protein_grams) || safeNum(rawData.total_protein);
        const lipidGrams = safeNum(rawData.lipid_grams) || safeNum(rawData.total_fat);
        const carbGrams = safeNum(rawData.carb_grams) || safeNum(rawData.total_carbs);

        const pPct = totalCals > 0 ? (proteinGrams * 4 / totalCals * 100).toFixed(0) : '0';
        const fPct = totalCals > 0 ? (lipidGrams * 9 / totalCals * 100).toFixed(0) : '0';
        const cPct = totalCals > 0 ? (carbGrams * 4 / totalCals * 100).toFixed(0) : '0';

        const clientIdVal = rawData.client_id !== undefined && rawData.client_id !== null && rawData.client_id !== 'template'
            ? (isNaN(Number(rawData.client_id)) ? rawData.client_id : Number(rawData.client_id))
            : null;

        const userNotes = rawData.notes !== undefined ? rawData.notes : '';
        const planData = {
            client_id: clientIdVal,
            name: rawData.name || `Plan Nutricional - ${rawData.date || new Date().toISOString().split('T')[0]}`,
            description: (userNotes ? `${userNotes}\n\n` : '') + `Objetivo: ${rawData.objective || 'Mantenimiento'} | Fórmula: ${rawData.formula || 'mifflin'} | Macros (%): P${pPct} F${fPct} C${cPct} | Calorías Objetivo: ${totalCals}kcal`,
            notes: userNotes,
            tdee: safeNum(rawData.tdee),
            target_calories: totalCals,
            gender: rawData.gender || 'Hombre',
            weight: safeNum(rawData.weight),
            height: safeNum(rawData.height),
            age: safeNum(rawData.age),
            activity_level: safeNum(rawData.activity_level, 1.2),
            formula: rawData.formula || 'mifflin',
            objective: rawData.objective || 'Mantenimiento',
            caloric_adjustment: safeNum(rawData.caloric_adjustment),
            total_calories: totalCals,
            total_protein: proteinGrams,
            total_carbs: carbGrams,
            total_fat: lipidGrams,
            meals: formattedMeals,
            meals_data: typeof rawData.meals_data === 'string' ? rawData.meals_data : JSON.stringify(rawData.meals_data || formattedMeals)
        };

        const response = await api.post('/nutrition-plans', planData);
        return response.data;
    } catch (error) {
        console.error('Error saving nutrition plan:', error);
        throw error;
    }
};

export const updateNutritionPlan = async (id: string | number, rawData: any) => {
    try {
        let parsedMeals = [];
        try {
            parsedMeals = typeof rawData.meals_data === 'string' ? JSON.parse(rawData.meals_data) : (rawData.meals || rawData.meals_data || []);
        } catch (e) {
            console.error('Failed to parse meals_data', e);
        }

        const formattedMeals = (parsedMeals || []).map((meal: any) => {
            if (!meal) return { name: 'Comida', foods: [] };
            return {
                name: meal.name || 'Comida',
                foods: ((meal && meal.foods) || []).map((food: any) => {
                    if (!food) return { fatsecret_food_id: null, name: 'Alimento', serving_size: '1', serving_unit: 'g', calories: 0, protein: 0, carbs: 0, fat: 0 };
                    const isNumericId = food.id && !isNaN(Number(food.id)) && !String(food.id).includes('manual') && !String(food.id).includes('fs_');
                    const rawAmount = food.amountText !== undefined && food.amountText !== null ? String(food.amountText) : (food.servingSize ? String(food.servingSize) : '1');
                    const parsedServingSize = parseQuantity(rawAmount) || 1;
                    const multiplier = (food.amountMultiplier === undefined || isNaN(Number(food.amountMultiplier))) ? 1 : safeNum(food.amountMultiplier, 1);
                    const safeUnit = food.unit || (typeof food.servingSize === 'string' ? food.servingSize.replace(/[0-9.]/g, '').trim() : '') || 'g';

                    return {
                        fatsecret_food_id: isNumericId ? Number(food.id) : (String(food.id || '').startsWith('manual') ? String(food.id) : null),
                        name: food.name || 'Alimento',
                        serving_size: String(parsedServingSize),
                        serving_unit: safeUnit,
                        calories: safeNum(food.calories) * multiplier,
                        protein: safeNum(food.protein) * multiplier,
                        carbs: safeNum(food.carbs) * multiplier,
                        fat: safeNum(food.fat) * multiplier,
                    };
                })
            };
        });

        const totalCals = safeNum(rawData.target_calories) || safeNum(rawData.total_calories);
        const proteinGrams = safeNum(rawData.protein_grams) || safeNum(rawData.total_protein);
        const lipidGrams = safeNum(rawData.lipid_grams) || safeNum(rawData.total_fat);
        const carbGrams = safeNum(rawData.carb_grams) || safeNum(rawData.total_carbs);

        const pPct = totalCals > 0 ? (proteinGrams * 4 / totalCals * 100).toFixed(0) : '0';
        const fPct = totalCals > 0 ? (lipidGrams * 9 / totalCals * 100).toFixed(0) : '0';
        const cPct = totalCals > 0 ? (carbGrams * 4 / totalCals * 100).toFixed(0) : '0';

        const clientIdVal = rawData.client_id !== undefined && rawData.client_id !== null && rawData.client_id !== 'template'
            ? (isNaN(Number(rawData.client_id)) ? rawData.client_id : Number(rawData.client_id))
            : null;

        const userNotesUpdate = rawData.notes !== undefined ? rawData.notes : '';
        const planData = {
            client_id: clientIdVal,
            name: rawData.name || `Plan Nutricional - ${rawData.date || new Date().toISOString().split('T')[0]}`,
            description: (userNotesUpdate ? `${userNotesUpdate}\n\n` : '') + `Objetivo: ${rawData.objective || 'Mantenimiento'} | Fórmula: ${rawData.formula || 'mifflin'} | Macros (%): P${pPct} F${fPct} C${cPct} | Calorías Objetivo: ${totalCals}kcal`,
            notes: userNotesUpdate,
            tdee: safeNum(rawData.tdee),
            target_calories: totalCals,
            gender: rawData.gender || 'Hombre',
            weight: safeNum(rawData.weight),
            height: safeNum(rawData.height),
            age: safeNum(rawData.age),
            activity_level: safeNum(rawData.activity_level, 1.2),
            formula: rawData.formula || 'mifflin',
            objective: rawData.objective || 'Mantenimiento',
            caloric_adjustment: safeNum(rawData.caloric_adjustment),
            total_calories: totalCals,
            total_protein: proteinGrams,
            total_carbs: carbGrams,
            total_fat: lipidGrams,
            meals: formattedMeals,
            meals_data: typeof rawData.meals_data === 'string' ? rawData.meals_data : JSON.stringify(rawData.meals_data || formattedMeals)
        };

        const response = await api.put(`/nutrition-plans/${id}`, planData);
        return response.data;
    } catch (error) {
        console.error('Error updating nutrition plan:', error);
        throw error;
    }
};

// ── Pasos Diarios ───────────────────────────────

export const getUserStepLogs = async () => {
    try {
        const response = await api.get('/steps');
        return response.data;
    } catch (error) {
        console.error('Error getting step logs:', error);
        throw error;
    }
};

export const saveUserSteps = async (steps: number, date?: string) => {
    try {
        const response = await api.post('/steps', { steps, date });
        return response.data;
    } catch (error) {
        console.error('Error saving user steps:', error);
        throw error;
    }
};

export default api;
