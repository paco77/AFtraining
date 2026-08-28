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
    if (typeof str === 'number') return isNaN(str) ? 0 : str;
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
    return isNaN(parsed) ? 0 : parsed;
};

export const saveNutritionPlan = async (rawData: any) => {
    try {
        let parsedMeals = [];
        try {
            parsedMeals = typeof rawData.meals_data === 'string' ? JSON.parse(rawData.meals_data) : (rawData.meals || rawData.meals_data || []);
        } catch (e) {
            console.error('Failed to parse meals_data', e);
        }

        const formattedMeals = (parsedMeals || []).map((meal: any) => ({
            name: meal.name || 'Comida',
            foods: (meal.foods || []).map((food: any) => {
                const isNumericId = food.id && !isNaN(Number(food.id)) && !String(food.id).includes('manual') && !String(food.id).includes('fs_');
                const rawAmount = food.amountText !== undefined && food.amountText !== null ? String(food.amountText) : (food.servingSize ? String(food.servingSize) : '1');
                const parsedServingSize = parseQuantity(rawAmount) || 1;
                const multiplier = (food.amountMultiplier === undefined || isNaN(Number(food.amountMultiplier))) ? 1 : Number(food.amountMultiplier);
                const safeUnit = food.unit || (typeof food.servingSize === 'string' ? food.servingSize.replace(/[0-9.]/g, '').trim() : '') || 'g';

                return {
                    fatsecret_food_id: isNumericId ? Number(food.id) : (String(food.id || '').startsWith('manual') ? String(food.id) : null),
                    name: food.name || 'Alimento',
                    serving_size: String(parsedServingSize),
                    serving_unit: safeUnit,
                    calories: (Number(food.calories) || 0) * multiplier,
                    protein: (Number(food.protein) || 0) * multiplier,
                    carbs: (Number(food.carbs) || 0) * multiplier,
                    fat: (Number(food.fat) || 0) * multiplier,
                };
            })
        }));

        const totalCals = Number(rawData.target_calories) || Number(rawData.total_calories) || 0;
        const proteinGrams = Number(rawData.protein_grams) || Number(rawData.total_protein) || 0;
        const lipidGrams = Number(rawData.lipid_grams) || Number(rawData.total_fat) || 0;
        const carbGrams = Number(rawData.carb_grams) || Number(rawData.total_carbs) || 0;

        const pPct = totalCals > 0 ? (proteinGrams * 4 / totalCals * 100).toFixed(0) : '0';
        const fPct = totalCals > 0 ? (lipidGrams * 9 / totalCals * 100).toFixed(0) : '0';
        const cPct = totalCals > 0 ? (carbGrams * 4 / totalCals * 100).toFixed(0) : '0';

        const clientIdVal = rawData.client_id !== undefined && rawData.client_id !== null && rawData.client_id !== 'template'
            ? (isNaN(Number(rawData.client_id)) ? rawData.client_id : Number(rawData.client_id))
            : null;

        const planData = {
            client_id: clientIdVal,
            name: rawData.name || `Plan Nutricional - ${rawData.date || new Date().toISOString().split('T')[0]}`,
            description: (rawData.description ? `${rawData.description}\n\n` : '') + `Objetivo: ${rawData.objective || 'Mantenimiento'} | Fórmula: ${rawData.formula || 'mifflin'} | Macros (%): P${pPct} F${fPct} C${cPct} | Calorías Objetivo: ${totalCals}kcal`,
            tdee: Number(rawData.tdee) || 0,
            target_calories: totalCals,
            gender: rawData.gender || 'Hombre',
            weight: Number(rawData.weight) || 0,
            height: Number(rawData.height) || 0,
            age: Number(rawData.age) || 0,
            activity_level: Number(rawData.activity_level) || 1.2,
            formula: rawData.formula || 'mifflin',
            objective: rawData.objective || 'Mantenimiento',
            caloric_adjustment: Number(rawData.caloric_adjustment) || 0,
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

        const formattedMeals = (parsedMeals || []).map((meal: any) => ({
            name: meal.name || 'Comida',
            foods: (meal.foods || []).map((food: any) => {
                const isNumericId = food.id && !isNaN(Number(food.id)) && !String(food.id).includes('manual') && !String(food.id).includes('fs_');
                const rawAmount = food.amountText !== undefined && food.amountText !== null ? String(food.amountText) : (food.servingSize ? String(food.servingSize) : '1');
                const parsedServingSize = parseQuantity(rawAmount) || 1;
                const multiplier = (food.amountMultiplier === undefined || isNaN(Number(food.amountMultiplier))) ? 1 : Number(food.amountMultiplier);
                const safeUnit = food.unit || (typeof food.servingSize === 'string' ? food.servingSize.replace(/[0-9.]/g, '').trim() : '') || 'g';

                return {
                    fatsecret_food_id: isNumericId ? Number(food.id) : (String(food.id || '').startsWith('manual') ? String(food.id) : null),
                    name: food.name || 'Alimento',
                    serving_size: String(parsedServingSize),
                    serving_unit: safeUnit,
                    calories: (Number(food.calories) || 0) * multiplier,
                    protein: (Number(food.protein) || 0) * multiplier,
                    carbs: (Number(food.carbs) || 0) * multiplier,
                    fat: (Number(food.fat) || 0) * multiplier,
                };
            })
        }));

        const totalCals = Number(rawData.target_calories) || Number(rawData.total_calories) || 0;
        const proteinGrams = Number(rawData.protein_grams) || Number(rawData.total_protein) || 0;
        const lipidGrams = Number(rawData.lipid_grams) || Number(rawData.total_fat) || 0;
        const carbGrams = Number(rawData.carb_grams) || Number(rawData.total_carbs) || 0;

        const pPct = totalCals > 0 ? (proteinGrams * 4 / totalCals * 100).toFixed(0) : '0';
        const fPct = totalCals > 0 ? (lipidGrams * 9 / totalCals * 100).toFixed(0) : '0';
        const cPct = totalCals > 0 ? (carbGrams * 4 / totalCals * 100).toFixed(0) : '0';

        const clientIdVal = rawData.client_id !== undefined && rawData.client_id !== null && rawData.client_id !== 'template'
            ? (isNaN(Number(rawData.client_id)) ? rawData.client_id : Number(rawData.client_id))
            : null;

        const planData = {
            client_id: clientIdVal,
            name: rawData.name || `Plan Nutricional - ${rawData.date || new Date().toISOString().split('T')[0]}`,
            description: rawData.objective ? ((rawData.description ? `${rawData.description}\n\n` : '') + `Objetivo: ${rawData.objective} | Fórmula: ${rawData.formula} | Macros (%): P${pPct} F${fPct} C${cPct} | Calorías Objetivo: ${totalCals}kcal`) : rawData.description,
            tdee: Number(rawData.tdee) || 0,
            target_calories: totalCals,
            gender: rawData.gender || 'Hombre',
            weight: Number(rawData.weight) || 0,
            height: Number(rawData.height) || 0,
            age: Number(rawData.age) || 0,
            activity_level: Number(rawData.activity_level) || 1.2,
            formula: rawData.formula || 'mifflin',
            objective: rawData.objective || 'Mantenimiento',
            caloric_adjustment: Number(rawData.caloric_adjustment) || 0,
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
