import { Exercise } from '@/constants/ExerciseData';
import { DayLog, MonthlyPlan, MONTHS } from '@/constants/PlanTypes';
import { showToast } from '@/services/toast';
import { Directory, File as ExpoFile, Paths } from 'expo-file-system';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from '../services/api';
import { useUser } from './UserContext';

// ─── Cache Config ─────────────────────────────────────────────────────────────
const CACHE_SUBDIR = 'af_cache';

interface PlanContextType {
    plans: MonthlyPlan[];
    setPlans: React.Dispatch<React.SetStateAction<MonthlyPlan[]>>;
    addPlan: (plan: Omit<MonthlyPlan, 'id'>) => Promise<void>;
    deletePlan: (id: string) => void;
    saveLog: (planId: string, log: DayLog) => void;
    fetchHistory: (clientId?: string) => Promise<any[]>;
    updatePlan: (planId: string, planData: Partial<MonthlyPlan>) => Promise<void>;
    fetchPlans: () => Promise<void>;
    addExercise: (exercise: Exercise) => Promise<Exercise | undefined>;
    // Session management
    activeSessionDay: number | null;
    startWorkoutSession: (dayNumber: number) => void;
    finishWorkoutSession: () => void;
    // Metadata
    allExercises: Exercise[];
    muscleGroups: string[];
    refreshMetadata: () => Promise<void>;
}

const PlanContext = createContext<PlanContextType>({
    plans: [],
    setPlans: () => { },
    addPlan: async () => { },
    deletePlan: () => { },
    saveLog: () => { },
    fetchHistory: async () => [],
    updatePlan: async () => { },
    fetchPlans: async () => { },
    activeSessionDay: null,
    startWorkoutSession: () => { },
    finishWorkoutSession: () => { },
    allExercises: [],
    muscleGroups: [],
    refreshMetadata: async () => { },
    addExercise: async () => undefined,
});

const mapApiExerciseToFrontend = (apiEx: any): Exercise => {
    return {
        id: String(apiEx.id),
        name: apiEx.name,
        muscleGroup: typeof apiEx.muscle_group === 'string'
            ? apiEx.muscle_group
            : apiEx.muscle_group?.name || 'Core',
        equipment: apiEx.equipment || '',
        description: apiEx.description || '',
        primaryMuscles: apiEx.primary_muscles || [],
        secondaryMuscles: apiEx.secondary_muscles || [],
        benefits: apiEx.benefits || [],
        level: apiEx.level || 'Principiante',
        isCustom: !!apiEx.is_custom
    };
};

const mapApiPlanToFrontend = (apiPlan: any): MonthlyPlan => {
    return {
        id: String(apiPlan.id),
        assignedClientId: String(apiPlan.assigned_client_id || apiPlan.client?.id || apiPlan.user_id),
        month: apiPlan.month,
        year: apiPlan.year,
        daysPerWeek: apiPlan.days_per_week,
        splitType: apiPlan.split_type,
        days: (apiPlan.training_days || apiPlan.trainingDays || []).map((td: any) => ({
            id: td.id ? String(td.id) : undefined,
            dayNumber: td.day_number,
            label: td.label,
            muscleGroups: td.muscle_groups || [],
            targetVolumes: td.target_volumes || {},
            exercises: (td.planned_exercises || td.exercises || td.plannedExercises || []).map((pe: any) => ({
                id: pe.id ? String(pe.id) : undefined,
                exercise: mapApiExerciseToFrontend(pe.exercise || {}),
                sets: pe.sets || 0,
                minReps: pe.min_reps || 0,
                maxReps: pe.max_reps || 0,
                instruction: pe.instruction,
                supersetId: pe.superset_id || pe.supersetId
            }))
        })),
        logs: apiPlan.logs || []
    };
};

// ─── Cache Helpers ────────────────────────────────────────────────────────────
const ensureCacheDir = () => {
    const dir = new Directory(Paths.document, CACHE_SUBDIR);
    if (!dir.exists) {
        dir.create({ intermediates: true });
    }
    return dir;
};

const saveToCache = (filename: string, data: any) => {
    try {
        const dir = ensureCacheDir();
        const file = new ExpoFile(dir, filename);
        if (file.exists) {
            file.delete();
        }
        file.create();
        file.write(JSON.stringify(data));
    } catch (e) {
        console.warn('Cache write failed:', e);
    }
};

const loadFromCache = async <T,>(filename: string): Promise<T | null> => {
    try {
        const file = new ExpoFile(Paths.document, CACHE_SUBDIR, filename);
        if (!file.exists) return null;
        const raw = await file.text();
        return JSON.parse(raw) as T;
    } catch (e) {
        console.warn('Cache read failed:', e);
        return null;
    }
};

export function PlanProvider({ children }: { children: React.ReactNode }) {
    const [plans, setPlans] = useState<MonthlyPlan[]>([]);
    const [allExercises, setAllExercises] = useState<Exercise[]>([]);
    const [muscleGroups, setMuscleGroups] = useState<string[]>([]);
    const { currentUser, isInitialized, logout } = useUser();

    const refreshMetadata = useCallback(async () => {
        if (!isInitialized || !currentUser) return;
        try {
            const [exResponse, mgResponse] = await Promise.all([
                api.get('exercises'),
                api.get('muscle-groups')
            ]);
            const exercises = exResponse.data.data.map(mapApiExerciseToFrontend);
            const groups = mgResponse.data.data.map((mg: any) => mg.name);
            setAllExercises(exercises);
            setMuscleGroups(groups);
            // Cache on success
            saveToCache('exercises.json', exercises);
            saveToCache('muscle_groups.json', groups);
        } catch (error) {
            console.error('Error fetching metadata:', error);
            // Fallback: load from cache
            const cachedEx = await loadFromCache<Exercise[]>('exercises.json');
            const cachedMg = await loadFromCache<string[]>('muscle_groups.json');
            if (cachedEx) setAllExercises(cachedEx);
            if (cachedMg) setMuscleGroups(cachedMg);
        }
    }, [currentUser, isInitialized]);

    const fetchPlans = useCallback(async () => {
        if (!isInitialized || !currentUser) return;

        try {
            const response = await api.get('plans');
            const rawPlans = response.data?.data || response.data || [];
            const mapped = (Array.isArray(rawPlans) ? rawPlans : []).map(mapApiPlanToFrontend);
            mapped.sort((a, b) => {
                if (a.year !== b.year) return b.year - a.year;
                return MONTHS.indexOf(b.month as any) - MONTHS.indexOf(a.month as any);
            });
            setPlans(mapped);
            // Cache on success
            saveToCache('plans.json', mapped);
        } catch (error: any) {
            const status = error.response?.status;
            if (!status || status >= 500) {
                console.error('Error fetching plans:', error);
            }
            if (status === 401) {
                logout();
                return;
            }
            // Fallback: load from cache
            const cached = await loadFromCache<MonthlyPlan[]>('plans.json');
            if (cached && cached.length > 0) {
                setPlans(cached);
                showToast.info('Sin conexión — mostrando plan guardado');
            }
        }
    }, [currentUser, isInitialized, logout]);

    const addPlan = useCallback(async (planData: Omit<MonthlyPlan, 'id'>) => {
        try {
            const payload = {
                assigned_client_id: planData.assignedClientId,
                month: planData.month,
                year: planData.year,
                days_per_week: planData.daysPerWeek,
                split_type: planData.splitType,
                days: planData.days.map(d => ({
                    label: d.label,
                    day_number: d.dayNumber,
                    muscle_groups: d.muscleGroups,
                    target_volumes: d.targetVolumes,
                    exercises: d.exercises.map(ex => ({
                        exercise_id: ex.exercise.id,
                        name: ex.exercise.name,
                        muscle_group: ex.exercise.muscleGroup,
                        sets: ex.sets,
                        min_reps: ex.minReps,
                        max_reps: ex.maxReps,
                        instruction: ex.instruction
                    }))
                }))
            };
            const response = await api.post('plans', payload);
            setPlans(prev => [...prev, mapApiPlanToFrontend(response.data.data)]);
            showToast.success('Plan creado con éxito');
        } catch (error) {
            showToast.error('Error al crear plan');
            console.error(error);
        }
    }, []);

    const updatePlan = useCallback(async (planId: string, planData: Partial<MonthlyPlan>) => {
        try {
            const payload = {
                assigned_client_id: planData.assignedClientId,
                month: planData.month,
                year: planData.year,
                days_per_week: planData.daysPerWeek,
                split_type: planData.splitType,
                days: planData.days?.map(d => ({
                    id: d.id,
                    label: d.label,
                    day_number: d.dayNumber,
                    muscle_groups: d.muscleGroups,
                    target_volumes: d.targetVolumes,
                    exercises: d.exercises.map(ex => ({
                        id: ex.id,
                        exercise_id: ex.exercise.id,
                        name: ex.exercise.name,
                        muscle_group: ex.exercise.muscleGroup,
                        sets: ex.sets,
                        min_reps: ex.minReps,
                        max_reps: ex.maxReps,
                        instruction: ex.instruction
                    }))
                }))
            };
            await api.put(`plans/${planId}`, payload);
            showToast.success('Plan actualizado');
            fetchPlans();
        } catch (error) {
            showToast.error('Error al actualizar plan');
            console.error(error);
        }
    }, [fetchPlans]);

    const addExercise = useCallback(async (exercise: Exercise): Promise<Exercise | undefined> => {
        try {
            const payload = {
                name: exercise.name,
                muscle_group: exercise.muscleGroup,
                equipment: exercise.equipment,
                description: exercise.description,
                primary_muscles: exercise.primaryMuscles,
                secondary_muscles: exercise.secondaryMuscles,
                benefits: exercise.benefits,
                level: exercise.level,
                is_custom: exercise.isCustom
            };
            const response = await api.post('exercises', payload);
            const newExercise = mapApiExerciseToFrontend(response.data.data || response.data);
            setAllExercises(prev => [...prev, newExercise]);

            // Sync cache with backend in background
            refreshMetadata();

            showToast.success('Ejercicio guardado en la biblioteca');
            return newExercise;
        } catch (error) {
            console.error('Error adding custom exercise:', error);
            showToast.error('Error al guardar el ejercicio');
            return undefined;
        }
    }, [refreshMetadata]);

    useEffect(() => {
        if (isInitialized && currentUser) {
            fetchPlans();
            refreshMetadata();
        }
    }, [fetchPlans, refreshMetadata, isInitialized, currentUser]);

    const deletePlan = useCallback(async (id: string) => {
        try {
            await api.delete(`plans/${id}`);
            setPlans((prev) => prev.filter((p) => p.id !== id));
            showToast.success('Plan eliminado');
        } catch (error) {
            showToast.error('Error al eliminar plan');
        }
    }, []);

    const saveLog = useCallback(async (planId: string, log: DayLog) => {
        try {
            const plan = plans.find(p => p.id === planId);
            const day = plan?.days.find(d => d.dayNumber === log.dayNumber);

            if (!day?.id) {
                showToast.error('No se encontró el ID del día');
                return;
            }

            const payload = {
                training_day_id: day.id,
                comments: log.sessions[0]?.comment || '',
                exercises: log.sessions[0]?.exercises
                    .map(exLog => ({
                        planned_exercise_id: exLog.exerciseId,
                        set_logs: exLog.setLogs
                            .map((set, idx) => ({
                                set_number: idx + 1,
                                weight: set.weight || 0,
                                reps: set.reps || 0
                            }))
                            .filter(set => set.weight > 0 || set.reps > 0)
                    }))
                    .filter(ex => ex.set_logs.length > 0)
            };

            await api.post('workouts/bulk', payload);
            showToast.success('Entrenamiento guardado');
            fetchPlans();
            fetchHistory(); // Refresh history as well
        } catch (error: any) {
            const status = error.response?.status;
            if (!status || status >= 500) {
                console.error('[saveLog] Error:', error.response?.data || error);
            } else {
                console.warn('[saveLog] Validation Error:', error.response?.data || error);
            }
            
            const errMsg = error.response?.data?.message || 'Error al guardar entrenamiento';
            showToast.error(errMsg);
        }
    }, [plans, fetchPlans]);

    const fetchHistory = useCallback(async (clientId?: string) => {
        try {
            const params = clientId ? { client_id: clientId } : {};
            const response = await api.get('workouts/history', { params });
            return response.data.data || [];
        } catch (error: any) {
            const status = error.response?.status;
            if (!status || status >= 500) {
                console.error('Error fetching history:', error);
            }
            return [];
        }
    }, []);

    const [activeSessionDay, setActiveSessionDay] = useState<number | null>(null);

    const startWorkoutSession = useCallback((dayNumber: number) => {
        setActiveSessionDay(dayNumber);
        showToast.info(`Sesión iniciada: Día ${dayNumber}`);
    }, []);

    const finishWorkoutSession = useCallback(() => {
        setActiveSessionDay(null);
        showToast.success('Sesión finalizada');
    }, []);

    return (
        <PlanContext.Provider value={{
            plans,
            setPlans,
            addPlan,
            deletePlan,
            saveLog,
            fetchHistory,
            activeSessionDay,
            startWorkoutSession,
            finishWorkoutSession,
            allExercises,
            muscleGroups,
            refreshMetadata,
            updatePlan,
            fetchPlans,
            addExercise
        }}>
            {children}
        </PlanContext.Provider>
    );
}

export const usePlans = () => useContext(PlanContext);
