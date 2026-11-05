import { getFatSecretFoodDetails, getFoodsCatalog, searchFatSecretFoods } from '@/services/api';
import Storage from '@/services/storage';
import { showToast } from '@/services/toast';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { CatalogFood, FatSecretFood, FoodCategory, NutritionPlan } from '../constants/NutritionTypes';
import api from '../services/api';
import { useUser } from './UserContext';

const FOOD_CATALOG_CACHE_KEY = '@af_cache_food_catalog';

interface NutritionContextData {
    plans: NutritionPlan[];
    loading: boolean;
    foodCategories: FoodCategory[];
    catalogFoods: CatalogFood[];
    catalogLoading: boolean;
    catalogError: string | null;
    fetchFoodCatalog: (force?: boolean) => Promise<void>;
    searchFoods: (query: string) => Promise<FatSecretFood[]>;
    getFoodDetails: (foodId: string) => Promise<any>;
    addPlan: (plan: Omit<NutritionPlan, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
    updatePlan: (id: string | number, plan: Partial<NutritionPlan>) => Promise<void>;
    deletePlan: (id: string | number) => Promise<void>;
    fetchPlans: () => Promise<void>;
}

const NutritionContext = createContext<NutritionContextData>({} as NutritionContextData);

export const NutritionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isInitialized, currentUser } = useUser();
    const [plans, setPlans] = useState<NutritionPlan[]>([]);
    const [loading, setLoading] = useState(false);

    const [foodCategories, setFoodCategories] = useState<FoodCategory[]>([]);
    const [catalogFoods, setCatalogFoods] = useState<CatalogFood[]>([]);
    const [catalogLoading, setCatalogLoading] = useState(false);
    const [catalogError, setCatalogError] = useState<string | null>(null);

    const fetchPlans = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/nutrition-plans');
            const data = response.data.data || response.data;
            setPlans(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error('Error fetching nutrition plans:', error);
            showToast.error('No se pudieron cargar los planes de alimentación');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchFoodCatalog = useCallback(async (force = false) => {
        if (!force && catalogFoods.length > 0) {
            return;
        }

        try {
            setCatalogLoading(true);
            setCatalogError(null);

            // Load from local cache first if empty so UI renders immediately
            if (catalogFoods.length === 0) {
                const cachedRaw = await Storage.getItem(FOOD_CATALOG_CACHE_KEY);
                if (cachedRaw) {
                    try {
                        const cached = JSON.parse(cachedRaw);
                        if (Array.isArray(cached?.foods) && cached.foods.length > 0) {
                            setFoodCategories(Array.isArray(cached.categories) ? cached.categories : []);
                            setCatalogFoods(cached.foods);
                        }
                    } catch {
                        // Ignore malformed cache
                    }
                }
            }

            const raw = await getFoodsCatalog();
            const payload = raw?.data && (raw.data.foods || raw.data.categories) ? raw.data : raw;
            const categories: FoodCategory[] = Array.isArray(payload?.categories) ? payload.categories : [];
            const foods: CatalogFood[] = Array.isArray(payload?.foods) ? payload.foods : (Array.isArray(payload) ? payload : []);

            setFoodCategories(categories);
            setCatalogFoods(foods);
            setCatalogError(null);

            if (foods.length > 0) {
                await Storage.setItem(FOOD_CATALOG_CACHE_KEY, JSON.stringify({ categories, foods }));
            }
        } catch (error: any) {
            const status = error?.response?.status;
            if (status === 404) {
                setCatalogError('El endpoint /api/foods/search aún no está disponible en el servidor.');
            } else {
                setCatalogError('No se pudo conectar al catálogo de alimentos.');
            }
        } finally {
            setCatalogLoading(false);
        }
    }, [catalogFoods.length]);

    useEffect(() => {
        if (isInitialized && currentUser) {
            fetchPlans();
            fetchFoodCatalog(true);
        } else if (isInitialized && !currentUser) {
            setPlans([]); // Clear plans on logout or no user
        }
    }, [isInitialized, currentUser, fetchPlans]);

    const searchFoods = async (query: string): Promise<FatSecretFood[]> => {
        try {
            const data = await searchFatSecretFoods(query);
            return Array.isArray(data) ? data : [data].filter(Boolean);
        } catch (error) {
            console.error('Error searching foods:', error);
            showToast.error('Error al buscar alimentos');
            return [];
        }
    };

    const getFoodDetails = async (foodId: string): Promise<any> => {
        try {
            const data = await getFatSecretFoodDetails(foodId);
            return data;
        } catch (error) {
            console.error('Error fetching food details:', error);
            showToast.error('Error al obtener detalles del alimento');
            return null;
        }
    };

    const addPlan = async (plan: Omit<NutritionPlan, 'id' | 'created_at' | 'updated_at'>) => {
        try {
            const response = await api.post('/nutrition-plans', plan);
            const newPlan = response.data.plan || response.data;
            setPlans(prev => [newPlan, ...prev]);
            showToast.success('Plan de alimentación creado exitosamente');
        } catch (error: any) {
            console.error('Error adding nutrition plan:', error.response?.data || error.message);
            showToast.error('Error al crear el plan de alimentación');
            throw error;
        }
    };

    const updatePlan = async (id: string | number, planData: Partial<NutritionPlan>) => {
        try {
            const response = await api.put(`/nutrition-plans/${id}`, planData);
            const updatedPlan = response.data.plan || response.data;
            setPlans(prev => prev.map(p => p.id === id ? updatedPlan : p));
            showToast.success('Plan de alimentación actualizado');
        } catch (error: any) {
            console.error('Error updating nutrition plan:', error.response?.data || error.message);
            showToast.error('Error al actualizar el plan');
            throw error;
        }
    };

    const deletePlan = async (id: string | number) => {
        try {
            await api.delete(`/nutrition-plans/${id}`);
            setPlans(prev => prev.filter(p => p.id !== id));
            showToast.success('Plan de alimentación eliminado');
        } catch (error) {
            console.error('Error deleting nutrition plan:', error);
            showToast.error('Error al eliminar el plan');
            throw error;
        }
    };

    return (
        <NutritionContext.Provider value={{
            plans,
            loading,
            foodCategories,
            catalogFoods,
            catalogLoading,
            catalogError,
            fetchFoodCatalog,
            searchFoods,
            getFoodDetails,
            addPlan,
            updatePlan,
            deletePlan,
            fetchPlans,
        }}>
            {children}
        </NutritionContext.Provider>
    );
};

export const useNutrition = () => useContext(NutritionContext);
