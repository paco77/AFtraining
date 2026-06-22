export interface FatSecretFood {
    food_id: string | number;
    food_name: string;
    food_description: string;
    food_type?: string;
    food_url?: string;
}

export interface MealFood {
    id?: number | string;
    fatsecret_food_id: string | number;
    name: string;
    serving_size: number;
    serving_unit: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    base_calories?: number;
    base_protein?: number;
    base_carbs?: number;
    base_fat?: number;
}

export interface NutritionPlanMeal {
    id?: number | string;
    name: string; // Ej: Desayuno, Almuerzo, Cena
    time?: string; // Hora opcional
    foods: MealFood[];
}

export interface NutritionPlan {
    id: number | string;
    coach_id: string;
    client_id: string | null;
    name: string;
    description?: string;
    tdee?: number;
    target_calories?: number;
    total_calories: number;
    total_protein: number;
    total_carbs: number;
    total_fat: number;
    meals: NutritionPlanMeal[];
    created_at?: string;
    updated_at?: string;
}
