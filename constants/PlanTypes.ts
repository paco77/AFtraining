import { Exercise, MuscleGroup } from './ExerciseData';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SplitType = 'Torso/Pierna' | 'Tracción/Empuje' | 'Personalizado';

/** An exercise assigned to a training day with sets and reps */
export interface PlannedExercise {
    id?: string;          // DB ID (optional for new exercises)
    exercise: Exercise;
    sets: number;         // Manual input
    minReps: number;      // Range min
    maxReps: number;      // Range max
    instruction?: string; // Optional coaching comment
    supersetId?: string;  // Group ID for Biseries/Triseries
}

/** Log for a single set (actual reps + weight achieved) */
export interface SetLog {
    reps: number;
    weight: number;     // kg
}

/** Log for a complete exercise within a day */
export interface ExerciseLog {
    exerciseId: string;
    setLogs: SetLog[];
}

/** A single training session for a day */
export interface SessionLog {
    sessionNumber: number;
    date: string;       // ISO date string
    exercises: ExerciseLog[];
    comment?: string;
}

/** Log for a whole training day (supports multiple sessions) */
export interface DayLog {
    dayNumber: number;
    sessions: SessionLog[];
}

export interface TrainingDay {
    id?: string;
    dayNumber: number;
    label: string;
    muscleGroups: MuscleGroup[];
    exercises: PlannedExercise[];
    targetVolumes?: Record<string, number>;
}

export interface MonthlyPlan {
    id: string;
    userId?: string;    // ID of the user this plan belongs to (Coach/Creator)
    assignedClientId?: string; // ID of the client this plan is for
    month: string;
    year: number;
    daysPerWeek: number;
    splitType: SplitType;
    days: TrainingDay[];
    logs?: DayLog[];    // workout logs per day
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const MONTHS = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
] as const;

export const SPLIT_TYPES: { type: SplitType; label: string; description: string; icon: string }[] = [
    {
        type: 'Torso/Pierna',
        label: 'Torso / Pierna',
        description: 'Alterna entre tren superior e inferior. Ideal para 3-4 días/semana.',
        icon: '🔄',
    },
    {
        type: 'Tracción/Empuje',
        label: 'Tracción / Empuje',
        description: 'Separa movimientos de empuje y tracción + piernas. Ideal para 3-6 días.',
        icon: '⚡',
    },
    {
        type: 'Personalizado',
        label: 'Personalizado',
        description: 'Elige los grupos musculares de cada día a tu gusto.',
        icon: '✏️',
    },
];

// ─── Split Templates ──────────────────────────────────────────────────────────

/** Generate day labels + muscle group assignment for a given split & frequency */
export function generateDays(splitType: SplitType, daysPerWeek: number): TrainingDay[] {
    const days: TrainingDay[] = [];

    if (splitType === 'Torso/Pierna') {
        for (let i = 0; i < daysPerWeek; i++) {
            const isTorso = i % 2 === 0;
            days.push({
                dayNumber: i + 1,
                label: isTorso ? `Día ${i + 1} — Torso` : `Día ${i + 1} — Pierna`,
                muscleGroups: isTorso
                    ? ['Pecho', 'Espalda', 'Hombros', 'Bícep', 'Trícep']
                    : ['Cuádriceps', 'Isquios', 'Glúteos', 'Core'],
                exercises: [],
                targetVolumes: {},
            });
        }
    } else if (splitType === 'Tracción/Empuje') {
        const cycle: { label: string; groups: MuscleGroup[] }[] = [
            { label: 'Empuje', groups: ['Pecho', 'Hombros', 'Trícep'] },
            { label: 'Tracción', groups: ['Espalda', 'Bícep', 'Core'] },
            { label: 'Pierna', groups: ['Cuádriceps', 'Isquios', 'Glúteos', 'Core'] },
        ];
        for (let i = 0; i < daysPerWeek; i++) {
            const c = cycle[i % cycle.length];
            days.push({
                dayNumber: i + 1,
                label: `Día ${i + 1} — ${c.label}`,
                muscleGroups: c.groups,
                exercises: [],
                targetVolumes: {},
            });
        }
    } else {
        // Personalizado — empty groups, user fills them in
        for (let i = 0; i < daysPerWeek; i++) {
            days.push({
                dayNumber: i + 1,
                label: `Día ${i + 1}`,
                muscleGroups: [],
                exercises: [],
                targetVolumes: {},
            });
        }
    }

    return days;
}
