// ─── Types ────────────────────────────────────────────────────────────────────

export type MuscleGroup = string;
export type Level = 'Principiante' | 'Intermedio';

export interface Exercise {
    id: string;
    name: string;
    muscleGroup: MuscleGroup;
    equipment: string;
    description: string;
    primaryMuscles: string[];
    secondaryMuscles: string[];
    benefits: string[];
    level: Level;
    isCustom: boolean;
}

// ─── Muscle Groups ────────────────────────────────────────────────────────────

/** @deprecated Use the muscleGroups from PlanContext instead */
export const MUSCLE_GROUPS: MuscleGroup[] = [];

// ─── Exercise Library ─────────────────────────────────────────────────────────

/** @deprecated Use the allExercises from PlanContext instead */
export const EXERCISE_LIBRARY: Exercise[] = [];
