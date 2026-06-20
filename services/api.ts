import axios from 'axios';
import { Platform } from 'react-native';
import Storage from './storage';

// Nota: 10.0.2.2 es el host para el emulador de Android. 
// Para dispositivos físicos, usa tu IP local (ej: http://192.168.1.XX:8000/api)
const getBaseUrl = () => {
    // Si la app está compilada para producción, se conecta directamente al servidor oficial
    if (!__DEV__) {
        return 'https://aftraining.skecomponent.mx/api/';
    }

    // Definimos la IP local de tu máquina para que funcione en emuladores y dispositivos físicos en desarrollo
    const localIp = '192.168.100.125';

    if (Platform.OS === 'android') {
        // En Android, 10.0.2.2 es el alias para localhost, pero para dispositivos físicos usamos la IP real
        return `http://${localIp}:8000/api/`;
    }
    if (Platform.OS === 'web') {
        const origin = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        // Si el origen ya es una IP o estamos en producción, podríamos usarlo, 
        // pero para desarrollo local usamos la IP de la API
        return `http://${localIp}:8000/api/`;
    }
    return `http://${localIp}:8000/api/`;
};

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

export const saveNutritionPlan = async (rawData: any) => {
    try {
        let parsedMeals = [];
        try {
            parsedMeals = typeof rawData.meals_data === 'string' ? JSON.parse(rawData.meals_data) : rawData.meals_data;
        } catch (e) {
            console.error('Failed to parse meals_data', e);
        }

        const formattedMeals = parsedMeals.map((meal: any) => ({
            name: meal.name,
            foods: meal.foods.map((food: any) => ({
                fatsecret_food_id: String(food.id),
                name: food.name,
                serving_size: parseFloat(food.servingSize) || 1,
                serving_unit: food.servingSize.replace(/[0-9.]/g, '').trim() || 'portion',
                calories: food.calories * (food.amountMultiplier || 1),
                protein: food.protein * (food.amountMultiplier || 1),
                carbs: food.carbs * (food.amountMultiplier || 1),
                fat: food.fat * (food.amountMultiplier || 1),
            }))
        }));

        const planData = {
            client_id: rawData.client_id,
            name: `Plan Nutricional - ${rawData.date}`,
            description: `Objetivo: ${rawData.objective} | Fórmula: ${rawData.formula} | Macros (%): P${(rawData.protein_grams * 4 / rawData.target_calories * 100).toFixed(0)} F${(rawData.lipid_grams * 9 / rawData.target_calories * 100).toFixed(0)} C${(rawData.carb_grams * 4 / rawData.target_calories * 100).toFixed(0)} | Calorías Objetivo: ${rawData.target_calories}kcal`,
            meals: formattedMeals
        };

        const response = await api.post('/nutrition-plans', planData);
        return response.data;
    } catch (error) {
        console.error('Error saving nutrition plan:', error);
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
