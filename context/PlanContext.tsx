import { Exercise, isSameMuscleGroup, sanitizeExerciseGroup } from '@/constants/ExerciseData';
import { DayLog, MonthlyPlan, MONTHS, SetLog } from '@/constants/PlanTypes';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { showToast } from '@/services/toast';
import { formatToLocalISO } from '@/services/dateUtils';
import NetInfo from '@react-native-community/netinfo';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import api from '../services/api';
import { useUser } from './UserContext';

// ─── Cache Config ─────────────────────────────────────────────────────────────
const CACHE_SUBDIR = 'af_cache';
const WORKOUT_SESSION_KEY = 'active_workout_session';
const OFFLINE_WORKOUTS_KEY = 'offline_workouts_queue';

interface PlanContextType {
    plans: MonthlyPlan[];
    setPlans: React.Dispatch<React.SetStateAction<MonthlyPlan[]>>;
    addPlan: (plan: Omit<MonthlyPlan, 'id'>) => Promise<void>;
    deletePlan: (id: string) => void;
    saveLog: (planId: string, log: DayLog) => Promise<void>;
    fetchHistory: (clientId?: string) => Promise<any[]>;
    updatePlan: (planId: string, planData: Partial<MonthlyPlan>) => Promise<void>;
    fetchPlans: () => Promise<void>;
    addExercise: (exercise: Exercise) => Promise<Exercise | undefined>;
    updateExercise: (id: string, exercise: Exercise) => Promise<Exercise | undefined>;
    // Session management
    activeSessionDay: number | null;
    activePlanId: string | null;
    sessionLogs: Record<string, SetLog[]>;
    setSessionLogs: React.Dispatch<React.SetStateAction<Record<string, SetLog[]>>>;
    completedSets: Record<string, boolean>;
    setCompletedSets: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
    comment: string;
    setComment: React.Dispatch<React.SetStateAction<string>>;
    sessionStartTime: number | null;
    startWorkoutSession: (planId: string, dayNumber: number, initialLogs: Record<string, SetLog[]>) => void;
    finishWorkoutSession: () => void;
    discardWorkoutSession: () => void;
    // Metadata
    allExercises: Exercise[];
    muscleGroups: string[];
    refreshMetadata: () => Promise<void>;
    // Offline sync
    pendingOfflineLogs: number;
    syncOfflineLogs: () => Promise<void>;
    isLoadingPlans: boolean;
}

const PlanContext = createContext<PlanContextType>({
    plans: [],
    setPlans: () => { },
    addPlan: async () => { },
    deletePlan: () => { },
    saveLog: async () => { },
    fetchHistory: async () => [],
    updatePlan: async () => { },
    fetchPlans: async () => { },
    activeSessionDay: null,
    activePlanId: null,
    sessionLogs: {},
    setSessionLogs: () => { },
    completedSets: {},
    setCompletedSets: () => { },
    comment: '',
    setComment: () => { },
    sessionStartTime: null,
    startWorkoutSession: () => { },
    finishWorkoutSession: () => { },
    discardWorkoutSession: () => { },
    allExercises: [],
    muscleGroups: [],
    refreshMetadata: async () => { },
    addExercise: async () => undefined,
    updateExercise: async () => undefined,
    pendingOfflineLogs: 0,
    syncOfflineLogs: async () => { },
    isLoadingPlans: false,
});

let globalMuscleGroupIdToName: Record<string, string> = {};

const mapApiExerciseToFrontend = (apiEx: any): Exercise => {
    let rawMg = typeof apiEx.muscle_group === 'string'
        ? (globalMuscleGroupIdToName[apiEx.muscle_group] || apiEx.muscle_group)
        : apiEx.muscle_group?.name || (apiEx.muscle_group_id ? globalMuscleGroupIdToName[String(apiEx.muscle_group_id)] : undefined);

    const safeMg = sanitizeExerciseGroup(apiEx.name, rawMg);

    return {
        id: String(apiEx.id),
        name: apiEx.name,
        muscleGroup: safeMg,
        equipment: apiEx.equipment || '',
        description: apiEx.description || '',
        primaryMuscles: (Array.isArray(apiEx.primary_muscles) && apiEx.primary_muscles.length > 0)
            ? apiEx.primary_muscles
            : [safeMg],
        secondaryMuscles: apiEx.secondary_muscles || [],
        benefits: apiEx.benefits || [],
        level: apiEx.level || 'Principiante',
        isCustom: !!apiEx.is_custom,
        videoUrl: apiEx.video_url || ''
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
        comment: apiPlan.comment,
        days: (apiPlan.training_days || apiPlan.trainingDays || []).map((td: any) => ({
            id: td.id ? String(td.id) : undefined,
            dayNumber: td.day_number,
            label: td.label,
            muscleGroups: (() => {
                let mg = td.muscle_groups || [];
                if (typeof mg === 'string') {
                    try { mg = JSON.parse(mg); } catch(e) { mg = []; }
                }
                if (Array.isArray(mg) && mg.length === 1 && typeof mg[0] === 'string' && mg[0].startsWith('[')) {
                    try { mg = JSON.parse(mg[0]); } catch(e) {}
                }
                if (typeof mg === 'string') {
                    try { mg = JSON.parse(mg); } catch(e) { mg = []; }
                }
                
                return (Array.isArray(mg) ? mg : []).map((m: any) => {
                    const val = typeof m === 'string' ? m : (m?.name || String(m));
                    return globalMuscleGroupIdToName[val] || val;
                });
            })(),
            targetVolumes: td.target_volumes || {},
            comment: td.comment,
            exercises: (td.planned_exercises || td.exercises || td.plannedExercises || []).map((pe: any) => ({
                id: pe.id ? String(pe.id) : undefined,
                exercise: mapApiExerciseToFrontend(pe.exercise || {}),
                sets: pe.sets || 0,
                minReps: pe.min_reps || 0,
                maxReps: pe.max_reps || 0,
                instruction: pe.instruction,
                videoUrl: pe.video_url || pe.videoUrl || undefined,
                supersetId: pe.superset_id || pe.supersetId
            }))
        })),
        logs: apiPlan.logs || []
    };
};

// ─── Cache Helpers (AsyncStorage based) ───────────────────────────────────────
const saveToCache = (filename: string, data: any) => {
    try {
        const key = `@af_cache_${filename.replace(/\.json$/, '')}`;
        AsyncStorage.setItem(key, JSON.stringify(data)).catch((e) => {
            console.warn('Cache write failed:', e);
        });
    } catch (e) {
        console.warn('Cache write failed:', e);
    }
};

const loadFromCache = async <T,>(filename: string): Promise<T | null> => {
    try {
        const key = `@af_cache_${filename.replace(/\.json$/, '')}`;
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw) as T;
    } catch (e) {
        console.warn('Cache read failed:', e);
        return null;
    }
};

export function PlanProvider({ children }: { children: React.ReactNode }) {
    const [plans, setPlans] = useState<MonthlyPlan[]>([]);
    const [isLoadingPlans, setIsLoadingPlans] = useState<boolean>(true);
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
            const groups = mgResponse.data.data.map((mg: any) => {
                globalMuscleGroupIdToName[String(mg.id)] = mg.name;
                return mg.name;
            });
            const exercises = exResponse.data.data.map(mapApiExerciseToFrontend);
            setAllExercises(exercises);
            setMuscleGroups(groups);
            // Cache on success
            saveToCache('exercises.json', exercises);
            saveToCache('muscle_groups.json', groups);
        } catch (error: any) {
            const status = error.response?.status;
            if (status === 401) {
                logout();
                return;
            }
            if (!status || status >= 500) {
                console.error('Error fetching metadata:', error);
            }
            // Fallback: load from cache
            const cachedEx = await loadFromCache<Exercise[]>('exercises.json');
            const cachedMg = await loadFromCache<string[]>('muscle_groups.json');
            if (cachedEx) setAllExercises(cachedEx);
            if (cachedMg) setMuscleGroups(cachedMg);
        }
    }, [currentUser, isInitialized, logout]);

    const fetchPlans = useCallback(async () => {
        if (!isInitialized || !currentUser) {
            setIsLoadingPlans(false);
            return;
        }

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
        } finally {
            setIsLoadingPlans(false);
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
                comment: planData.comment,
                days: planData.days.map(d => ({
                    label: d.label,
                    day_number: d.dayNumber,
                    muscle_groups: d.muscleGroups,
                    target_volumes: d.targetVolumes,
                    comment: d.comment,
                    exercises: d.exercises.map(ex => ({
                        exercise_id: ex.exercise.id,
                        name: ex.exercise.name,
                        muscle_group: ex.exercise.muscleGroup,
                        sets: Number(ex.sets) || 0,
                        min_reps: Number(ex.minReps) || 0,
                        max_reps: Number(ex.maxReps) || 0,
                        instruction: ex.instruction,
                        video_url: ex.videoUrl,
                        superset_id: ex.supersetId
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
                comment: planData.comment,
                days: planData.days?.map(d => ({
                    id: d.id,
                    label: d.label,
                    day_number: d.dayNumber,
                    muscle_groups: d.muscleGroups,
                    target_volumes: d.targetVolumes,
                    comment: d.comment,
                    exercises: d.exercises.map(ex => ({
                        id: ex.id,
                        exercise_id: ex.exercise.id,
                        name: ex.exercise.name,
                        muscle_group: ex.exercise.muscleGroup,
                        sets: Number(ex.sets) || 0,
                        min_reps: Number(ex.minReps) || 0,
                        max_reps: Number(ex.maxReps) || 0,
                        instruction: ex.instruction,
                        video_url: ex.videoUrl,
                        superset_id: ex.supersetId
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
            let mgId: number | null = null;
            Object.entries(globalMuscleGroupIdToName).forEach(([id, name]) => {
                if (isSameMuscleGroup(name, exercise.muscleGroup)) {
                    mgId = Number(id);
                }
            });

            let dataToSend: any = {
                name: exercise.name,
                muscle_group: exercise.muscleGroup,
                muscle_group_id: mgId,
                equipment: exercise.equipment,
                description: exercise.description,
                primary_muscles: exercise.primaryMuscles,
                secondary_muscles: exercise.secondaryMuscles,
                benefits: exercise.benefits,
                level: exercise.level,
                is_custom: exercise.isCustom
            };
            let headers = {};

            if (exercise.videoUrl && exercise.videoUrl.startsWith('file')) {
                const formData = new FormData();
                Object.keys(dataToSend).forEach(key => {
                    const value = dataToSend[key];
                    if (Array.isArray(value)) {
                        value.forEach((v, i) => formData.append(`${key}[${i}]`, String(v)));
                    } else if (value !== null && value !== undefined) {
                        formData.append(key, String(value));
                    }
                });

                const uri = exercise.videoUrl;
                const filename = uri.split('/').pop() || 'video.mp4';
                const match = /\.(\w+)$/.exec(filename);
                const type = match ? `video/${match[1]}` : `video`;

                // @ts-ignore
                formData.append('video_file', {
                    uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
                    name: filename,
                    type: type,
                });
                dataToSend = formData;
                headers = { 'Content-Type': 'multipart/form-data' };
            } else if (exercise.videoUrl) {
                dataToSend.video_url = exercise.videoUrl;
            }

            const response = await api.post('exercises', dataToSend, { headers });
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

    const updateExercise = useCallback(async (id: string, exercise: Exercise): Promise<Exercise | undefined> => {
        try {
            let mgId: number | null = null;
            Object.entries(globalMuscleGroupIdToName).forEach(([gId, name]) => {
                if (isSameMuscleGroup(name, exercise.muscleGroup)) {
                    mgId = Number(gId);
                }
            });

            let dataToSend: any = {
                name: exercise.name,
                muscle_group: exercise.muscleGroup,
                muscle_group_id: mgId,
                equipment: exercise.equipment,
                description: exercise.description,
                primary_muscles: exercise.primaryMuscles,
                secondary_muscles: exercise.secondaryMuscles,
                benefits: exercise.benefits,
                level: exercise.level,
                is_custom: exercise.isCustom
            };
            let headers = {};

            if (exercise.videoUrl && exercise.videoUrl.startsWith('file')) {
                const formData = new FormData();
                Object.keys(dataToSend).forEach(key => {
                    const value = dataToSend[key];
                    if (Array.isArray(value)) {
                        value.forEach((v, i) => formData.append(`${key}[${i}]`, String(v)));
                    } else if (value !== null && value !== undefined) {
                        formData.append(key, String(value));
                    }
                });

                const uri = exercise.videoUrl;
                const filename = uri.split('/').pop() || 'video.mp4';
                const match = /\.(\w+)$/.exec(filename);
                const type = match ? `video/${match[1]}` : `video`;

                // @ts-ignore
                formData.append('video_file', {
                    uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
                    name: filename,
                    type: type,
                });
                formData.append('_method', 'PUT');
                dataToSend = formData;
                headers = { 'Content-Type': 'multipart/form-data' };
            } else if (exercise.videoUrl) {
                dataToSend.video_url = exercise.videoUrl;
            }

            const response = await api.post(`exercises/${id}`, dataToSend, { headers });
            const updatedExercise = mapApiExerciseToFrontend(response.data.data || response.data);
            
            setAllExercises(prev => prev.map(ex => ex.id === id ? updatedExercise : ex));

            // Sync cache with backend in background
            refreshMetadata();

            showToast.success('Ejercicio actualizado correctamente');
            return updatedExercise;
        } catch (error: any) {
            console.error('Error updating custom exercise:', error.response?.data || error.message);
            showToast.error('Error al actualizar el ejercicio');
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

    const saveLog = useCallback(async (planId: string, log: DayLog) => {
        let payload: any;
        try {
            const plan = plans.find(p => String(p.id) === String(planId));
            const day = plan?.days.find(d => Number(d.dayNumber) === Number(log.dayNumber));

            if (!day?.id) {
                showToast.error('No se encontró el ID del día');
                throw new Error('No se encontró el ID del día de entrenamiento');
            }

            const rawDate = log.sessions[0]?.date;
            const startDate = rawDate ? new Date(rawDate) : new Date();
            const duration = log.sessions[0]?.duration;
            const endDate = duration
                ? new Date(startDate.getTime() + duration * 60000)
                : startDate;

            const exercisesPayload = (log.sessions[0]?.exercises || [])
                .map(exLog => {
                    const pe = day.exercises?.find(e => 
                        String(e.id) === String(exLog.exerciseId) || 
                        String(e.exercise?.id) === String(exLog.exerciseId)
                    );
                    const safePlannedExId = pe?.id || exLog.exerciseId;

                    return {
                        planned_exercise_id: safePlannedExId,
                        set_logs: (exLog.setLogs || [])
                            .map((set, idx) => ({
                                set_number: idx + 1,
                                weight: Number(set.weight) || 0,
                                weight_lb: Number(set.weightLb) || 0,
                                reps: Number(set.reps) || 0
                            }))
                            .filter(set => set.weight > 0 || set.reps > 0)
                    };
                })
                .filter(ex => ex.set_logs.length > 0);

            if (exercisesPayload.length === 0) {
                showToast.warning('Debes registrar al menos una serie con repeticiones o peso para guardar la sesión.');
                throw new Error('No hay series con repeticiones o peso registradas');
            }

            payload = {
                training_day_id: day.id,
                start_time: formatToLocalISO(startDate),
                end_time: formatToLocalISO(endDate),
                duration: duration,
                comments: log.sessions[0]?.comment || '',
                exercises: exercisesPayload
            };

            await api.post('workouts/bulk', payload);
            showToast.success('Entrenamiento guardado');
            fetchPlans();
            fetchHistory(); // Refresh history as well
        } catch (error: any) {
            const status = error.response?.status;
            
            // Check if it's a network error
            if (error.message === 'Network Error' || !error.response || status === 0) {
                try {
                    const stored = await AsyncStorage.getItem(OFFLINE_WORKOUTS_KEY);
                    const queue = stored ? JSON.parse(stored) : [];
                    queue.push(payload);
                    await AsyncStorage.setItem(OFFLINE_WORKOUTS_KEY, JSON.stringify(queue));
                    setPendingOfflineLogs(queue.length);
                    showToast.info('Entrenamiento guardado (Modo Sin Conexión). Se sincronizará automáticamente.');
                    return; // Successfully queued offline
                } catch (queueError) {
                    console.error('Failed to queue offline workout:', queueError);
                }
            }

            if (!status || status >= 500) {
                console.error('[saveLog] Error:', error.response?.data || error);
            } else {
                console.warn('[saveLog] Validation Error:', error.response?.data || error);
            }
            
            const errMsg = error.response?.data?.message || error.message || 'Error al guardar entrenamiento';
            showToast.error(errMsg);
            throw error;
        }
    }, [plans, fetchPlans, fetchHistory]);

    const syncOfflineLogs = useCallback(async () => {
        try {
            const stored = await AsyncStorage.getItem(OFFLINE_WORKOUTS_KEY);
            if (!stored) return;
            const queue = JSON.parse(stored);
            if (!Array.isArray(queue) || queue.length === 0) return;

            let remainingQueue = [...queue];
            let syncedCount = 0;

            for (const payload of queue) {
                try {
                    await api.post('workouts/bulk', payload);
                    remainingQueue = remainingQueue.filter(p => p !== payload);
                    syncedCount++;
                } catch (error: any) {
                    // Only keep in queue if it's a network error, otherwise it might be a validation error 
                    // that will NEVER succeed, which would block the queue forever.
                    if (error.message !== 'Network Error' && error.response && error.response.status !== 0 && error.response.status < 500) {
                        console.error('Offline sync failed permanently for a log:', error.response.data);
                        remainingQueue = remainingQueue.filter(p => p !== payload); // Remove it so it doesn't block
                    } else {
                        break; // Network still down or server error, stop trying the rest
                    }
                }
            }

            if (remainingQueue.length === 0) {
                await AsyncStorage.removeItem(OFFLINE_WORKOUTS_KEY);
                setPendingOfflineLogs(0);
                if (syncedCount > 0) {
                    showToast.success(`Se sincronizaron ${syncedCount} entrenamiento(s) pendiente(s)`);
                    fetchHistory();
                }
            } else {
                await AsyncStorage.setItem(OFFLINE_WORKOUTS_KEY, JSON.stringify(remainingQueue));
                setPendingOfflineLogs(remainingQueue.length);
            }
        } catch (e) {
            console.error('Error during offline sync:', e);
        }
    }, [fetchHistory]);

    // Listen for network changes to trigger sync
    useEffect(() => {
        const unsubscribe = NetInfo.addEventListener(state => {
            if (state.isConnected && state.isInternetReachable !== false) {
                syncOfflineLogs();
            }
        });
        return () => unsubscribe();
    }, [syncOfflineLogs]);

    const [activeSessionDay, setActiveSessionDay] = useState<number | null>(null);
    const [activePlanId, setActivePlanId] = useState<string | null>(null);
    const [sessionLogs, setSessionLogs] = useState<Record<string, SetLog[]>>({});
    const [completedSets, setCompletedSets] = useState<Record<string, boolean>>({});
    const [comment, setComment] = useState('');
    const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
    const [lastLoadedUserId, setLastLoadedUserId] = useState<string | null>(null);
    const [pendingOfflineLogs, setPendingOfflineLogs] = useState<number>(0);

    const isRestoringSessionRef = useRef(false);

    // Limpiar estado en memoria si no hay usuario (sin borrar almacenamiento para evitar pérdidas accidentales)
    useEffect(() => {
        if (isInitialized && !currentUser) {
            setActiveSessionDay(null);
            setActivePlanId(null);
            setSessionLogs({});
            setCompletedSets({});
            setComment('');
            setSessionStartTime(null);
        }
    }, [isInitialized, currentUser]);

    // Initialize pendingOfflineLogs count
    useEffect(() => {
        const loadOfflineQueue = async () => {
            try {
                const stored = await AsyncStorage.getItem(OFFLINE_WORKOUTS_KEY);
                if (stored) {
                    const queue = JSON.parse(stored);
                    setPendingOfflineLogs(queue.length || 0);
                }
            } catch (e) {
                console.error('Error loading offline queue:', e);
            }
        };
        loadOfflineQueue();
    }, []);

    // Restore unfinished session on init
    useEffect(() => {
        if (!isInitialized) return;

        // Si no hay usuario autenticado, limpiar todo estado de sesión en memoria
        if (!currentUser) {
            setActiveSessionDay(null);
            setActivePlanId(null);
            setSessionLogs({});
            setCompletedSets({});
            setComment('');
            setSessionStartTime(null);
            setLastLoadedUserId(null);
            return;
        }

        if (lastLoadedUserId === currentUser.id) return;

        const loadSession = async () => {
            try {
                let parsed: any = null;
                // 1. Probar desde AsyncStorage
                try {
                    const stored = await AsyncStorage.getItem(WORKOUT_SESSION_KEY);
                    if (stored) {
                        parsed = JSON.parse(stored);
                    }
                } catch (readErr) {
                    console.error('Error leyendo sesión de AsyncStorage:', readErr);
                }

                // 2. Si no está en AsyncStorage, buscar en caché de archivo
                if (!parsed) {
                    parsed = await loadFromCache('active_workout_session.json');
                }

                if (!parsed) return;

                // Validación estricta: La sesión debe pertenecer explícitamente al usuario actual
                if (!parsed.userId || String(parsed.userId) !== String(currentUser.id)) {
                    // Si no tiene usuario o es de otro usuario, limpiar registro residual
                    await AsyncStorage.removeItem(WORKOUT_SESSION_KEY).catch(() => {});
                    await AsyncStorage.removeItem('@af_cache_active_workout_session').catch(() => {});
                    return;
                }

                // Validación de expiración: Una sesión de entrenamiento caduca a las 12 horas
                const now = Date.now();
                if (parsed.sessionStartTime) {
                    const elapsedHours = (now - Number(parsed.sessionStartTime)) / (1000 * 60 * 60);
                    if (elapsedHours > 12) {
                        // Sesión antigua/expirada: descartar automáticamente de almacenamiento
                        await AsyncStorage.removeItem(WORKOUT_SESSION_KEY).catch(() => {});
                        await AsyncStorage.removeItem('@af_cache_active_workout_session').catch(() => {});
                        return;
                    }
                } else {
                    // Sin fecha de inicio válida: descartar registro huérfano
                    await AsyncStorage.removeItem(WORKOUT_SESSION_KEY).catch(() => {});
                    await AsyncStorage.removeItem('@af_cache_active_workout_session').catch(() => {});
                    return;
                }

                if (parsed.dayNumber === undefined || parsed.dayNumber === null || !parsed.planId) {
                    await AsyncStorage.removeItem(WORKOUT_SESSION_KEY).catch(() => {});
                    await AsyncStorage.removeItem('@af_cache_active_workout_session').catch(() => {});
                    return;
                }

                isRestoringSessionRef.current = true;
                setActivePlanId(String(parsed.planId));
                setActiveSessionDay(Number(parsed.dayNumber));
                setSessionLogs(parsed.sessionLogs || {});
                setCompletedSets(parsed.completedSets || {});
                setComment(parsed.comment || '');
                setSessionStartTime(Number(parsed.sessionStartTime));

                setTimeout(() => {
                    isRestoringSessionRef.current = false;
                }, 500);

            } catch (e) {
                console.error('Error al restaurar sesión activa:', e);
            } finally {
                setLastLoadedUserId(currentUser.id);
            }
        };
        loadSession();
    }, [isInitialized, currentUser, lastLoadedUserId]);

    // Save session automatically whenever state changes
    useEffect(() => {
        if (isRestoringSessionRef.current) return;
        if (!currentUser) return;
        if (activeSessionDay !== null && activePlanId !== null) {
            const dataToSave = {
                userId: currentUser.id,
                planId: activePlanId,
                dayNumber: activeSessionDay,
                sessionLogs,
                completedSets,
                comment,
                sessionStartTime
            };
            AsyncStorage.setItem(WORKOUT_SESSION_KEY, JSON.stringify(dataToSave)).catch(e => {
                console.error('Error al guardar sesión activa en AsyncStorage:', e);
            });
            saveToCache('active_workout_session.json', dataToSave);
        }
    }, [activeSessionDay, activePlanId, sessionLogs, completedSets, comment, sessionStartTime, currentUser]);

    const startWorkoutSession = useCallback((planId: string, dayNumber: number, initialLogs: Record<string, SetLog[]>) => {
        if (!currentUser) return;
        const now = Date.now();
        setActivePlanId(planId);
        setActiveSessionDay(dayNumber);
        setSessionLogs(initialLogs);
        setCompletedSets({});
        setComment('');
        setSessionStartTime(now);

        const initialData = {
            userId: currentUser.id,
            planId,
            dayNumber,
            sessionLogs: initialLogs,
            completedSets: {},
            comment: '',
            sessionStartTime: now
        };

        // Guardar inmediatamente tanto en AsyncStorage como en caché de archivo
        AsyncStorage.setItem(WORKOUT_SESSION_KEY, JSON.stringify(initialData)).catch(e => {
            console.error('Error al guardar sesión inicial en AsyncStorage:', e);
        });
        saveToCache('active_workout_session.json', initialData);

        showToast.info(`Sesión iniciada: Día ${dayNumber}`);
    }, [currentUser]);

    const finishWorkoutSession = useCallback(async () => {
        setActiveSessionDay(null);
        setActivePlanId(null);
        setSessionLogs({});
        setCompletedSets({});
        setComment('');
        setSessionStartTime(null);
        await AsyncStorage.removeItem(WORKOUT_SESSION_KEY).catch(() => {});
        await AsyncStorage.removeItem('@af_cache_active_workout_session').catch(() => {});
        showToast.success('Sesión finalizada');
    }, []);

    const discardWorkoutSession = useCallback(async () => {
        setActiveSessionDay(null);
        setActivePlanId(null);
        setSessionLogs({});
        setCompletedSets({});
        setComment('');
        setSessionStartTime(null);
        await AsyncStorage.removeItem(WORKOUT_SESSION_KEY).catch(() => {});
        await AsyncStorage.removeItem('@af_cache_active_workout_session').catch(() => {});
        showToast.info('Sesión descartada');
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
            activePlanId,
            sessionLogs,
            setSessionLogs,
            completedSets,
            setCompletedSets,
            comment,
            setComment,
            sessionStartTime,
            startWorkoutSession,
            finishWorkoutSession,
            discardWorkoutSession,
            allExercises,
            muscleGroups,
            refreshMetadata,
            updatePlan,
            fetchPlans,
            addExercise,
            updateExercise,
            pendingOfflineLogs,
            syncOfflineLogs,
            isLoadingPlans
        }}>
            {children}
        </PlanContext.Provider>
    );
}

export const usePlans = () => useContext(PlanContext);
