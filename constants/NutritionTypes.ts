export interface FatSecretFood {
    food_id: string | number;
    food_name: string;
    food_description: string;
    food_type?: string;
    food_url?: string;
}

export interface FoodCategory {
    id: number | string;
    name: string;
    slug?: string;
}

export interface FoodPortion {
    id: number | string;
    portion_type: string;
    portion_detail?: string | null;
    base_quantity: number;
    base_unit: string;
    gram_weight?: number | null;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
}

export interface CatalogFood {
    key: string;
    food_category_id: number | string;
    category_name: string;
    subcategory?: string;
    name: string;
    state?: string;
    display_name?: string;
    portions: FoodPortion[];
}

export interface FoodCatalogResponse {
    categories: FoodCategory[];
    foods: CatalogFood[];
}

export interface MealFood {
    id?: number | string;
    fatsecret_food_id: string | number;
    name: string;
    serving_size: number | string;
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
    notes?: string;
    additional_comments?: string;
    tdee?: number;
    target_calories?: number;
    gender?: string;
    weight?: number | string;
    height?: number | string;
    age?: number | string;
    activity_level?: number | string;
    formula?: string;
    objective?: string;
    caloric_adjustment?: number | string;
    total_calories: number;
    total_protein: number;
    total_carbs: number;
    total_fat: number;
    meals: NutritionPlanMeal[];
    created_at?: string;
    updated_at?: string;
}
