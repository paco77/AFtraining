// ─── Types ────────────────────────────────────────────────────────────────────

export type MuscleGroup = string;
export type Level = 'Principiante' | 'Intermedio';

export type ExercisePriority = 'alta' | 'media' | 'baja';

export interface ExercisePriorityInfo {
    priority: ExercisePriority;
    tier: number; // 1 = Alta (Compuesto), 2 = Media (Accesorio), 3 = Baja (Aislamiento)
    label: string;
    shortLabel: string;
    badgeColor: string;
    tag: string;
}

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
    videoUrl?: string;
}

/**
 * Intelligent priority evaluator for exercises based on exercise biomechanics:
 * Tier 1 (Alta / Compuesto): Heavy multi-joint movements (sentadillas, press banca, peso muerto, dominadas, press militar, hip thrust, etc.)
 * Tier 2 (Media / Accesorio): Multi-joint secondary / machine / unilateral exercises (jalones, remos, zancadas, prensa, hack, fondos, etc.)
 * Tier 3 (Baja / Aislamiento): Single-joint isolation movements (curls, extensiones, aperturas, elevaciones laterales, core, etc.)
 */
export const getExercisePriority = (ex: {
    name?: string | null;
    equipment?: string | null;
    secondaryMuscles?: string[] | string | null;
    benefits?: string[] | string | null;
}): ExercisePriorityInfo => {
    const n = (ex.name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // 1. Single-joint isolation movements (Tier 3)
    const isIsolation =
        n.includes('curl') ||
        n.includes('extension') ||
        n.includes('patada') ||
        n.includes('lateral') ||
        n.includes('frontal') ||
        n.includes('pajaro') ||
        n.includes('pec deck') ||
        n.includes('apertura') ||
        n.includes('contractora') ||
        n.includes('abductor') ||
        n.includes('aductor') ||
        n.includes('gemelo') ||
        n.includes('pantorrilla') ||
        n.includes('soleo') ||
        n.includes('crunch') ||
        n.includes('plancha') ||
        n.includes('plank') ||
        n.includes('rueda') ||
        n.includes('antebrazo') ||
        n.includes('vuelos') ||
        n.includes('martillo') ||
        n.includes('predicador') ||
        n.includes('concentrado') ||
        n.includes('pushdown') ||
        n.includes('copa') ||
        n.includes('frances') ||
        n.includes('sissy');

    // 2. Heavy multi-joint compounds (Tier 1)
    const isMajorCompound =
        ((n.includes('sentadilla') || n.includes('squat')) && !n.includes('sissy') && !n.includes('bulgara') && !n.includes('bulgarian') && !n.includes('hack')) ||
        (n.includes('press') && (n.includes('banca') || n.includes('bench') || n.includes('militar') || n.includes('overhead') || n.includes('plano'))) ||
        ((n.includes('peso muerto') || n.includes('deadlift')) && !n.includes('rumano') && !n.includes('romanian')) ||
        n.includes('dominada') ||
        n.includes('pull up') ||
        n.includes('pull-up') ||
        n.includes('chin up') ||
        n.includes('chin-up') ||
        n.includes('hip thrust') ||
        (n.includes('remo') && (n.includes('barra') || n.includes('t-bar') || n.includes('pendlay'))) ||
        n.includes('clean') ||
        n.includes('snatch');

    if (isMajorCompound && !isIsolation) {
        return {
            priority: 'alta',
            tier: 1,
            label: 'Prioridad Alta (Compuestos)',
            shortLabel: 'Alta',
            badgeColor: '#EF4444',
            tag: 'Compuesto',
        };
    }

    if (isIsolation) {
        return {
            priority: 'baja',
            tier: 3,
            label: 'Prioridad Baja (Aislamiento)',
            shortLabel: 'Aislamiento',
            badgeColor: '#10B981',
            tag: 'Aislamiento',
        };
    }

    // 3. Multi-joint secondary / accessory movements (Tier 2)
    return {
        priority: 'media',
        tier: 2,
        label: 'Prioridad Media (Accesorios)',
        shortLabel: 'Media',
        badgeColor: '#F59E0B',
        tag: 'Accesorio',
    };
};

// ─── Muscle Groups ────────────────────────────────────────────────────────────

/** Normalize group names for accent-insensitive, case-insensitive, singular/plural comparison */
export const normalizeGroupName = (g?: string | null): string => {
    if (!g) return '';
    const norm = g.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (norm.startsWith('bicep')) return 'bicep';
    if (norm.startsWith('tricep')) return 'tricep';
    if (norm.startsWith('cuadricep')) return 'cuadriceps';
    if (norm.startsWith('isquio') || norm.includes('femoral')) return 'isquios';
    if (norm.startsWith('gluteo')) return 'gluteos';
    if (norm.startsWith('hombro') || norm.startsWith('deltoid')) return 'hombros';
    if (norm.startsWith('pecho') || norm.startsWith('pectoral')) return 'pecho';
    if (norm.startsWith('espalda') || norm.startsWith('dorsal')) return 'espalda';
    if (norm.startsWith('core') || norm.startsWith('abdom')) return 'core';
    return norm;
};

/** Checks if two muscle group labels refer to the same group */
export const isSameMuscleGroup = (g1?: string | null, g2?: string | null): boolean => {
    if (!g1 || !g2) return false;
    return normalizeGroupName(g1) === normalizeGroupName(g2);
};

/**
 * Intelligent helper to infer the true muscle group from an exercise name.
 * Useful when exercises are created by voice or quick-add where the default group was incorrectly applied.
 */
export const inferMuscleGroupFromName = (name?: string | null): string | null => {
    if (!name) return null;
    const n = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();

    // 1. Isquios / Femorales first (because 'curl femoral' contains the word 'curl')
    if (n.includes('femoral') || n.includes('isquio') || n.includes('rumano') || n.includes('buenos dias') || n.includes('nordic') || (n.includes('moral') && (n.includes('acostado') || n.includes('sentado')))) {
        return 'Isquios';
    }

    // 2. Bíceps (any other curl, bicep, martillo, predicador, etc.)
    if (n.includes('bicep') || n.includes('curl') || n.includes('martillo') || n.includes('predicador') || n.includes('concentrado') || n.includes('braquial')) {
        return 'Bícep';
    }

    // 3. Tríceps
    if (n.includes('tricep') || n.includes('press frances') || n.includes('copa') || n.includes('patada de tricep') || n.includes('pushdown') || (n.includes('fondos') && (n.includes('tricep') || n.includes('banco')))) {
        return 'Trícep';
    }

    // 4. Cuádriceps
    if (n.includes('cuadricep') || n.includes('sentadilla') || n.includes('squat') || n.includes('prensa') || n.includes('extension de pierna') || n.includes('extension de cuadriceps') || n.includes('extensiones de pierna') || n.includes('extensiones de cuadriceps') || n.includes('zancada') || n.includes('bulgara') || n.includes('hack') || n.includes('step-up') || n.includes('aductor') || n.includes('sissy')) {
        return 'Cuádriceps';
    }

    // 5. Glúteos
    if (n.includes('gluteo') || n.includes('hip thrust') || n.includes('puente') || n.includes('abductor') || n.includes('patada')) {
        return 'Glúteos';
    }

    // 6. Pecho
    if (n.includes('pecho') || n.includes('banca') || n.includes('bench') || n.includes('press plano') || n.includes('press inclinado') || n.includes('press declinado') || n.includes('apertura') || n.includes('pec deck') || n.includes('cruce de polea') || n.includes('cross over') || n.includes('pet flyer') || n.includes('flexiones') || n.includes('lagartija') || (n.includes('fondos') && n.includes('pecho'))) {
        return 'Pecho';
    }

    // 7. Espalda
    if (n.includes('espalda') || n.includes('dominada') || n.includes('remo') || n.includes('remol') || n.includes('jalon') || n.includes('pull over') || n.includes('pullover') || n.includes('t-bar') || n.includes('polea al pecho') || n.includes('peso muerto')) {
        return 'Espalda';
    }

    // 8. Hombros
    if (n.includes('hombro') || n.includes('press militar') || n.includes('lateral') || n.includes('pajaro') || n.includes('elevacion frontal') || n.includes('elevaciones') || n.includes('face pull') || n.includes('deltoide') || n.includes('arnold') || n.includes('vuelos')) {
        return 'Hombros';
    }

    // 9. Core
    if (n.includes('abdomen') || n.includes('abdominal') || n.includes('crunch') || n.includes('plancha') || n.includes('plank') || n.includes('core') || n.includes('rueda') || n.includes('climber') || n.includes('hollow') || n.includes('vacio')) {
        return 'Core';
    }

    return null;
};

/**
 * Sanitizes an exercise's muscle group by checking if the name unmistakably belongs to a different muscle group.
 * Prevents bicep exercises from ever being categorized as Cuádriceps, etc.
 */
export const sanitizeExerciseGroup = (name: string, rawGroup?: string | null): string => {
    const inferred = inferMuscleGroupFromName(name);
    if (!rawGroup || rawGroup === 'Core') {
        return inferred || rawGroup || 'Core';
    }

    // If there is a clear contradiction (e.g., name is a Bicep curl, but rawGroup is Cuádriceps or Core),
    // prioritize the inferred group.
    if (inferred && !isSameMuscleGroup(inferred, rawGroup)) {
        const infNorm = normalizeGroupName(inferred);
        const rawNorm = normalizeGroupName(rawGroup);

        // High confidence corrections:
        // Arm vs Leg (e.g. Bicep/Tricep vs Cuádriceps/Isquios/Glúteos)
        const isArm = infNorm === 'bicep' || infNorm === 'tricep';
        const isLeg = rawNorm === 'cuadriceps' || rawNorm === 'isquios' || rawNorm === 'gluteos';
        if (isArm && isLeg) {
            return inferred;
        }

        const isChestBack = infNorm === 'pecho' || infNorm === 'espalda' || infNorm === 'hombros';
        if (isChestBack && isLeg) {
            return inferred;
        }

        if (isLeg && isArm) {
            return inferred;
        }
    }

    return rawGroup;
};

/** @deprecated Use the muscleGroups from PlanContext instead */
export const MUSCLE_GROUPS: MuscleGroup[] = [];

// ─── Exercise Library ─────────────────────────────────────────────────────────

/** @deprecated Use the allExercises from PlanContext instead */
export const EXERCISE_LIBRARY: Exercise[] = [];
