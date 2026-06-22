import {
    Exercise,
    MuscleGroup
} from '@/constants/ExerciseData';
import {
    DayLog,
    ExerciseLog,
    generateDays,
    MonthlyPlan,
    MONTHS,
    SessionLog,
    SPLIT_TYPES,
    SplitType,
    TrainingDay
} from '@/constants/PlanTypes';
import { borderRadius, Colors, MuscleGroupColors, Spacing, Typography } from '@/constants/theme';
import { usePlans } from '@/context/PlanContext';
import { useUser } from '@/context/UserContext';
import { showToast } from '@/services/toast';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    ArrowLeft,
    ArrowRight,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronUp,
    Minus,
    Pencil,
    Plus,
    Trash2,
    User,
    Users,
    X,
    Mic
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';

// ─── Wizard Steps ─────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<WizardStep, string> = {
    1: 'Mes y Frecuencia',
    2: 'Tipo de Split',
    3: 'Configurar Días',
    4: 'Elegir Ejercicios',
};

// ─── Step Indicator ───────────────────────────────────────────────────────────

const StepIndicator = ({ current, total }: { current: number; total: number }) => (
    <View style={styles.stepIndicator}>
        {Array.from({ length: total }, (_, i) => (
            <View
                key={i}
                style={[
                    styles.stepDot,
                    i + 1 === current && styles.stepDotActive,
                    i + 1 < current && styles.stepDotDone,
                ]}
            />
        ))}
    </View>
);

// ─── Number Stepper (for sets/reps) ───────────────────────────────────────────

const NumberStepper = ({
    value,
    onInc,
    onDec,
    min = 1,
    max = 99,
    label,
}: {
    value: number;
    onInc: () => void;
    onDec: () => void;
    min?: number;
    max?: number;
    label: string;
}) => (
    <View style={styles.stepper}>
        <Text style={styles.stepperLabel}>{label}</Text>
        <View style={styles.stepperControls}>
            <TouchableOpacity
                style={[styles.stepperBtn, value <= min && styles.stepperBtnDisabled]}
                onPress={onDec}
                disabled={value <= min}
            >
                <Minus size={12} color={value <= min ? Colors.border : Colors.text} />
            </TouchableOpacity>
            <Text style={styles.stepperValue}>{value}</Text>
            <TouchableOpacity
                style={[styles.stepperBtn, value >= max && styles.stepperBtnDisabled]}
                onPress={onInc}
                disabled={value >= max}
            >
                <Plus size={12} color={value >= max ? Colors.border : Colors.text} />
            </TouchableOpacity>
        </View>
    </View>
);

// ─── Plan Card (saved plans) ──────────────────────────────────────────────────

const PlanCard = ({
    plan,
    onDelete,
    onSaveLog,
    onEdit,
}: {
    plan: MonthlyPlan;
    onDelete: (id: string) => void;
    onSaveLog: (planId: string, log: DayLog) => void;
    onEdit: (plan: MonthlyPlan) => void;
}) => {
    const { currentUser } = useUser();
    const { allExercises: contextExercises } = usePlans();
    const [expanded, setExpanded] = useState(false);
    const [activeDayIdx, setActiveDayIdx] = useState<number | null>(null);
    const [expandedSessionNum, setExpandedSessionNum] = useState<number | null>(null);
    const [logData, setLogData] = useState<Record<string, { reps: string; weight: string }[]>>({});
    const [sessionComment, setSessionComment] = useState('');
    const [justSaved, setJustSaved] = useState(false);

    const isCoach = currentUser?.role === 'coach';
    const isClientOfThisPlan = currentUser?.role === 'client' && String(plan.assignedClientId) === String(currentUser.id);
    // If it's a coach and the plan is assigned to someone else (a client), it's read only.
    // Also, if it's a client but the plan is not theirs (shouldn't happen with current API), it's read only.
    const isReadOnly = isCoach && String(plan.assignedClientId) !== String(currentUser?.id);
    const isLogReadOnly = true;

    // Get assigned client name
    const { clients } = useUser();
    const clientName = isCoach && plan.assignedClientId && plan.assignedClientId !== currentUser?.id
        ? clients.find(c => c.id === plan.assignedClientId)?.name?.split(' ')[0]
        : null;

    const totalExercises = plan.days.reduce((sum, d) => sum + d.exercises.length, 0);

    const planVolumes = useMemo(() => {
        const vols: Record<string, number> = {};
        plan.days.forEach(d => {
            d.exercises.forEach(pe => {
                const fullEx = contextExercises.find(e => e.id === pe.exercise.id);
                const g = fullEx?.muscleGroup && fullEx.muscleGroup !== 'Core' ? fullEx.muscleGroup : pe.exercise.muscleGroup;
                if (g) {
                    vols[g] = (vols[g] || 0) + (pe.sets || 0);
                }
            });
        });
        return vols;
    }, [plan.days, contextExercises]);

    const getSessionCount = (dayNumber: number) => {
        const dayLog = plan.logs?.find((l) => l.dayNumber === dayNumber);
        return dayLog?.sessions?.length ?? 0;
    };

    const initEmptyForm = (day: TrainingDay) => {
        const initial: Record<string, { reps: string; weight: string }[]> = {};
        day.exercises.forEach((pe) => {
            const sets: { reps: string; weight: string }[] = [];
            for (let i = 0; i < pe.sets; i++) {
                sets.push({ reps: '', weight: '' });
            }
            initial[pe.exercise.id] = sets;
        });
        return initial;
    };

    const openDayLog = (dayIdx: number) => {
        const day = plan.days[dayIdx];
        setLogData(initEmptyForm(day));
        setJustSaved(false);
        setActiveDayIdx(dayIdx);
    };

    const updateLogField = (exerciseId: string, setIdx: number, field: 'reps' | 'weight', value: string) => {
        setLogData((prev) => {
            const next = { ...prev };
            const sets = [...(next[exerciseId] || [])];
            sets[setIdx] = { ...sets[setIdx], [field]: value };
            next[exerciseId] = sets;
            return next;
        });
    };

    const saveCurrentLog = () => {
        if (activeDayIdx === null) return;
        const day = plan.days[activeDayIdx];
        const sessionCount = getSessionCount(day.dayNumber);
        const missingIds = day.exercises.filter(pe => !pe.id || pe.id === 'undefined');
        if (missingIds.length > 0) {
            Alert.alert(
                'Error de sincronización',
                'Algunos ejercicios no tienen un ID válido. Por favor, recarga los planes o intenta de nuevo.'
            );
            return;
        }

        const exercises: ExerciseLog[] = day.exercises.map((pe) => ({
            exerciseId: pe.id!,
            setLogs: (logData[pe.exercise.id] || []).map((s) => ({
                reps: Number(s.reps) || 0,
                weight: Number(s.weight) || 0,
            })),
        }));
        const newSession: SessionLog = {
            sessionNumber: sessionCount + 1,
            date: new Date().toISOString(),
            exercises,
            comment: sessionComment.trim() || undefined,
        };
        onSaveLog(plan.id, {
            dayNumber: day.dayNumber,
            sessions: [newSession],
        });
        setLogData(initEmptyForm(day)); // Reset form after saving
        setSessionComment(''); // Clear comment after saving
        setJustSaved(true);
    };

    const startNewSession = () => {
        if (activeDayIdx === null) return;
        const day = plan.days[activeDayIdx];
        setLogData(initEmptyForm(day));
        setSessionComment(''); // Clear comment for new session
        setJustSaved(false);
    };

    const dayHasLog = (dayNumber: number) =>
        plan.logs?.some((l) => l.dayNumber === dayNumber) ?? false;

    const formatSessionDate = (isoDate: string) => {
        const d = new Date(isoDate);
        return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <View style={styles.planCard}>
            <TouchableOpacity
                style={styles.planCardHeader}
                activeOpacity={0.8}
                onPress={() => setExpanded(!expanded)}
            >
                <View style={styles.planCardLeft}>
                    <View style={styles.planMonthBadge}>
                        <CalendarDays size={16} color={Colors.primary} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.planCardTitle}>
                            {plan.month} {plan.year}
                        </Text>
                        <Text style={styles.planCardSub}>
                            {plan.daysPerWeek} días/sem · {plan.splitType} · {totalExercises} ejercicios
                        </Text>
                        {clientName && (
                            <Text style={[styles.planCardSub, { color: Colors.primary, marginTop: 2, fontWeight: '600' }]}>
                                👤 {clientName}
                            </Text>
                        )}
                        {Object.keys(planVolumes).length > 0 && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                {Object.entries(planVolumes).map(([g, vol]) => (
                                    <View key={g} style={{ backgroundColor: (MuscleGroupColors[g] || Colors.primary) + '18', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                        <Text style={{ color: MuscleGroupColors[g] || Colors.primary, fontSize: 10, fontWeight: '600' }}>
                                            {g}: {vol}s
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </View>
                    {isReadOnly && (
                        <View style={styles.readOnlyBadge}>
                            <Text style={styles.readOnlyText}>Modo Lectura</Text>
                        </View>
                    )}
                </View>
                <View style={styles.planCardRight}>
                    <TouchableOpacity
                        style={styles.editBtn}
                        onPress={() => onEdit(plan)}
                    >
                        <Pencil size={14} color={Colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => onDelete(plan.id)}
                    >
                        <Trash2 size={14} color={Colors.danger} />
                    </TouchableOpacity>
                    {expanded ? (
                        <ChevronUp size={16} color={Colors.textMuted} />
                    ) : (
                        <ChevronDown size={16} color={Colors.textMuted} />
                    )}
                </View>
            </TouchableOpacity>

            {expanded && (
                <View style={styles.planCardBody}>
                    {plan.days.map((day, dayIdx) => {
                        const isActive = activeDayIdx === dayIdx;
                        const hasLog = dayHasLog(day.dayNumber);
                        const sessionCount = getSessionCount(day.dayNumber);
                        const dayLog = plan.logs?.find((l) => l.dayNumber === day.dayNumber);

                        return (
                            <View key={day.dayNumber} style={styles.dayRow}>
                                <TouchableOpacity
                                    style={styles.dayHeaderRow}
                                    onPress={() => isActive ? setActiveDayIdx(null) : (isLogReadOnly ? setActiveDayIdx(dayIdx) : openDayLog(dayIdx))}
                                    activeOpacity={0.7}
                                >
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={styles.dayLabel}>{day.label}</Text>
                                            {hasLog && (
                                                <View style={styles.loggedBadge}>
                                                    <Check size={10} color="#000" />
                                                </View>
                                            )}
                                            {sessionCount > 0 && (
                                                <View style={styles.sessionCountBadge}>
                                                    <Text style={styles.sessionCountText}>{sessionCount} ses.</Text>
                                                </View>
                                            )}
                                        </View>
                                        <View style={styles.dayMuscles}>
                                            {day.muscleGroups.map((g: string) => (
                                                <View
                                                    key={g}
                                                    style={[
                                                        styles.miniChip,
                                                        { backgroundColor: (MuscleGroupColors[g] || Colors.primary) + '18' },
                                                    ]}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.miniChipText,
                                                            { color: MuscleGroupColors[g] || Colors.primary },
                                                        ]}
                                                    >
                                                        {g}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                        {day.exercises.length > 0 && (
                                            <View style={styles.dayExercises}>
                                                {day.exercises.map((pe, idx) => (
                                                    <Text key={pe.exercise.id} style={styles.dayExerciseText} numberOfLines={1}>
                                                        {idx + 1}. {pe.exercise.name}
                                                        <Text style={styles.setsRepsInline}> · {pe.sets}×{pe.minReps}-{pe.maxReps}</Text>
                                                    </Text>
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                    {isLogReadOnly && (
                                        <TouchableOpacity
                                            style={[styles.logDayBtn, isActive && styles.logDayBtnActive]}
                                            onPress={() => setActiveDayIdx(isActive ? null : dayIdx)}
                                        >
                                            <Text style={[styles.logDayBtnText, isActive && styles.logDayBtnTextActive]}>
                                                {isActive ? 'Cerrar' : 'Ver Historial'}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </TouchableOpacity>

                                {/* Session History */}
                                {
                                    isActive && (
                                        <View style={styles.sessionHistoryContainer}>
                                            <Text style={styles.sessionHistoryTitle}>Sesiones anteriores</Text>
                                            {dayLog && dayLog.sessions.length > 0 ? (
                                                dayLog.sessions.map((session) => {
                                                    const isSessionExpanded = expandedSessionNum === session.sessionNumber;
                                                    return (
                                                        <View key={session.sessionNumber} style={styles.sessionHistoryItemWrap}>
                                                            <TouchableOpacity
                                                                style={styles.sessionHistoryItem}
                                                                onPress={() => setExpandedSessionNum(isSessionExpanded ? null : session.sessionNumber)}
                                                            >
                                                                <View style={styles.sessionHistoryDot} />
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={styles.sessionHistoryLabel}>
                                                                        Sesión {session.sessionNumber}
                                                                    </Text>
                                                                    <Text style={styles.sessionHistoryDate}>
                                                                        {formatSessionDate(session.date)}
                                                                    </Text>
                                                                    {session.comment && (
                                                                        <Text style={styles.sessionHistoryComment} numberOfLines={1}>
                                                                            "{session.comment}"
                                                                        </Text>
                                                                    )}
                                                                </View>
                                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                                    <Text style={styles.sessionHistorySummary}>
                                                                        {session.exercises.length} ejerc.
                                                                    </Text>
                                                                    {isSessionExpanded ? (
                                                                        <ChevronUp size={12} color={Colors.textMuted} />
                                                                    ) : (
                                                                        <ChevronDown size={12} color={Colors.textMuted} />
                                                                    )}
                                                                </View>
                                                            </TouchableOpacity>

                                                            {isSessionExpanded && (
                                                                <View style={styles.sessionDetails}>
                                                                    {session.comment && (
                                                                        <View style={styles.sessionCommentBox}>
                                                                            <Text style={styles.sessionCommentLabel}>Comentario:</Text>
                                                                            <Text style={styles.sessionCommentText}>{session.comment}</Text>
                                                                        </View>
                                                                    )}
                                                                    {session.exercises.map((exLog) => {
                                                                        // Find exercise name from day.exercises using planned exercise id or exercise.id
                                                                        const plannedEx = day.exercises.find(pe =>
                                                                            String(pe.id) === String(exLog.exerciseId) ||
                                                                            String(pe.exercise.id) === String(exLog.exerciseId)
                                                                        );
                                                                        const exerciseName = plannedEx?.exercise.name
                                                                            || contextExercises.find(e => e.id === exLog.exerciseId)?.name
                                                                            || 'Ejercicio';

                                                                        return (
                                                                            <View key={exLog.exerciseId} style={styles.sessionCommentLabel}>
                                                                                <Text style={styles.sessionExName}>{exerciseName}</Text>
                                                                                <View style={styles.sessionSetsGrid}>
                                                                                    {exLog.setLogs.map((set, sIdx) => (
                                                                                        <Text key={sIdx} style={styles.sessionCommentLabel}>
                                                                                            S{sIdx + 1}: {set.reps} reps,    Peso: {set.weight}kg
                                                                                        </Text>
                                                                                    ))}
                                                                                </View>
                                                                            </View>
                                                                        );
                                                                    })}
                                                                </View>
                                                            )}
                                                        </View>
                                                    );
                                                })
                                            ) : (
                                                <Text style={{ color: Colors.textMuted, fontSize: 13, fontStyle: 'italic', paddingHorizontal: 12, paddingVertical: 8 }}>
                                                    No hay entrenamientos registrados para este día.
                                                </Text>
                                            )}
                                        </View>
                                    )
                                }

                                {/* Workout Logging Form (inline) */}
                                {
                                    isActive && !isLogReadOnly && (
                                        <View style={styles.logForm}>
                                            {justSaved ? (
                                                <View style={styles.savedContainer}>
                                                    <View style={styles.savedBadge}>
                                                        <Check size={20} color="#000" />
                                                    </View>
                                                    <Text style={styles.savedTitle}>¡Sesión guardada!</Text>
                                                    <Text style={styles.savedSub}>
                                                        Sesión #{getSessionCount(day.dayNumber)} registrada correctamente
                                                    </Text>
                                                    <TouchableOpacity style={styles.newSessionBtn} onPress={startNewSession}>
                                                        <Plus size={16} color="#000" />
                                                        <Text style={styles.newSessionBtnText}>Agregar otra sesión</Text>
                                                    </TouchableOpacity>
                                                    <TouchableOpacity
                                                        style={styles.closeDayBtn}
                                                        onPress={() => { setActiveDayIdx(null); setJustSaved(false); }}
                                                    >
                                                        <Text style={styles.closeDayBtnText}>Cerrar</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            ) : day.exercises.length === 0 ? (
                                                <Text style={styles.noExercisesText}>
                                                    No hay ejercicios asignados a este día
                                                </Text>
                                            ) : (
                                                <>

                                                    {day.exercises.map((pe) => (
                                                        <View key={pe.exercise.id} style={styles.logExerciseCard}>
                                                            <Text style={styles.logExerciseName}>
                                                                {pe.exercise.name}
                                                            </Text>
                                                            <Text style={styles.logExercisePlan}>
                                                                Plan: {pe.sets} series × {pe.minReps}-{pe.maxReps} reps
                                                            </Text>
                                                            {pe.instruction ? (
                                                                <Text style={styles.logExerciseInstruction}>
                                                                    💡 {pe.instruction}
                                                                </Text>
                                                            ) : null}

                                                            {/* Set headers */}
                                                            <View style={styles.logSetHeader}>
                                                                <Text style={styles.logSetHeaderText}>Serie</Text>
                                                                <Text style={styles.logSetHeaderText}>Reps</Text>
                                                                <Text style={styles.logSetHeaderText}>Peso (kg)</Text>
                                                            </View>

                                                            {/* Set inputs */}
                                                            {(logData[pe.exercise.id] || []).map((setLog, setIdx) => (
                                                                <View key={setIdx} style={styles.logSetRow}>
                                                                    <View style={styles.logSetNum}>
                                                                        <Text style={styles.logSetNumText}>{setIdx + 1}</Text>
                                                                    </View>
                                                                    <TextInput
                                                                        style={[styles.logInput, { color: '#FFFFFF' }]}
                                                                        placeholder={String(pe.minReps)}
                                                                        placeholderTextColor={Colors.border}
                                                                        keyboardType="numeric"
                                                                        value={setLog.reps}
                                                                        onChangeText={(v) => updateLogField(pe.exercise.id, setIdx, 'reps', v)}
                                                                    />
                                                                    <TextInput
                                                                        style={[styles.logInput, { color: '#FFFFFF' }]}
                                                                        placeholder="0"
                                                                        placeholderTextColor={Colors.border}
                                                                        keyboardType="numeric"
                                                                        value={setLog.weight}
                                                                        onChangeText={(v) => updateLogField(pe.exercise.id, setIdx, 'weight', v)}
                                                                    />
                                                                </View>
                                                            ))}
                                                        </View>
                                                    ))}

                                                    {/* Session Comment Input */}
                                                    <View style={styles.commentInputContainer}>
                                                        <Text style={styles.commentLabel}>Comentarios (opcional)</Text>
                                                        <TextInput
                                                            style={styles.commentInput}
                                                            placeholder="¿Cómo te sentiste hoy?..."
                                                            placeholderTextColor={Colors.textMuted}
                                                            value={sessionComment}
                                                            onChangeText={setSessionComment}
                                                            multiline
                                                            numberOfLines={2}
                                                        />
                                                    </View>

                                                    <TouchableOpacity style={styles.saveLogBtn} onPress={saveCurrentLog}>
                                                        <Check size={16} color="#000" />
                                                        <Text style={styles.saveLogBtnText}>Guardar Registro</Text>
                                                    </TouchableOpacity>
                                                </>
                                            )}
                                        </View>
                                    )
                                }
                            </View >
                        );
                    })}
                </View >
            )
            }
        </View >
    );
};

interface QuickAddProps {
    visible: boolean;
    defaultGroup: string;
    onAdd: (exercise: Exercise) => void;
    onClose: () => void;
}

const QuickAddExercise = ({ visible, defaultGroup, onAdd, onClose }: QuickAddProps) => {
    const { muscleGroups } = usePlans();
    const [name, setName] = useState('');
    const [equipment, setEquipment] = useState('');
    const [description, setDescription] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<string>(defaultGroup);

    useEffect(() => {
        if (defaultGroup) setSelectedGroup(defaultGroup);
    }, [defaultGroup]);

    const reset = () => { setName(''); setEquipment(''); setDescription(''); setSelectedGroup(defaultGroup); };

    const handleAdd = () => {
        if (!name.trim()) {
            Alert.alert('Nombre requerido', 'Ingresa un nombre para el ejercicio.');
            return;
        }
        const ex: Exercise = {
            id: `custom-${Date.now()}`,
            name: name.trim(),
            muscleGroup: selectedGroup,
            equipment: equipment.trim() || 'Peso corporal',
            description: description.trim() || 'Ejercicio personalizado.',
            primaryMuscles: [selectedGroup],
            secondaryMuscles: [],
            benefits: [],
            level: 'Principiante',
            isCustom: true,
        };
        onAdd(ex);
        reset();
        onClose();
    };

    if (!visible) return null;

    return (
        <ScrollView
            style={styles.quickAddContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
        >
            <Text style={styles.quickAddTitle}>Nuevo Ejercicio</Text>
            <View style={styles.quickAddForm}>
                <TextInput
                    style={styles.quickAddInput}
                    placeholder="Nombre del ejercicio..."
                    placeholderTextColor={Colors.textMuted}
                    value={name}
                    onChangeText={setName}
                />
                <View style={styles.quickAddRow}>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.quickAddLabel}>Grupo Muscular</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            {muscleGroups.map((g: string) => (
                                <TouchableOpacity
                                    key={g}
                                    style={[
                                        styles.quickAddChip,
                                        selectedGroup === g && styles.quickAddChipActive,
                                    ]}
                                    onPress={() => setSelectedGroup(g)}
                                >
                                    <Text
                                        style={[
                                            styles.quickAddChipText,
                                            selectedGroup === g && styles.quickAddChipTextActive,
                                        ]}
                                    >
                                        {g}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
                <TextInput
                    style={styles.quickAddInput}
                    placeholder="Equipamiento (opcional)..."
                    placeholderTextColor={Colors.textMuted}
                    value={equipment}
                    onChangeText={setEquipment}
                />
                <TextInput
                    style={[styles.quickAddInput, { height: 60, textAlignVertical: 'top' }]}
                    placeholder="Descripción (opcional)..."
                    placeholderTextColor={Colors.textMuted}
                    multiline
                    value={description}
                    onChangeText={setDescription}
                />
                <View style={styles.quickAddActions}>
                    <TouchableOpacity style={styles.quickAddCancel} onPress={onClose}>
                        <Text style={styles.quickAddCancelText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.quickAddBtn} onPress={handleAdd}>
                        <Check size={16} color="#000" />
                        <Text style={styles.quickAddBtnText}>Añadir</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </ScrollView>
    );
};


// ─── Voice Dictation Logic ────────────────────────────────────────────────────

const parseVoiceInput = (input: string, allExercises: Exercise[], defaultMuscleGroup: string) => {
    // Parse via Regex to support continuous speech without commas
    let muscleGroup = defaultMuscleGroup;
    let exerciseName = "Ejercicio Desconocido";
    let sets = 3;
    let minReps = 8;
    let maxReps = 12;
    let instruction = "";

    const text = input.replace(/\n/g, ' ');

    // 1. Muscle
    const muscleRegex = /m[úu]scul[oa]?\s+(.+?)(?=\s+(?:ejercicio|series|repeticiones|reps|comentario)|$|,|\.)/i;
    const muscleMatch = text.match(muscleRegex);
    if (muscleMatch) {
        muscleGroup = muscleMatch[1].trim();
    }

    // 2. Exercise
    const exerciseRegex = /ejercicio\s+(.+?)(?=\s+(?:m[úu]sculo|series|repeticiones|reps|comentario)|$|,|\.)/i;
    const exerciseMatch = text.match(exerciseRegex);
    if (exerciseMatch) {
        exerciseName = exerciseMatch[1].trim();
    } else {
        // Fallback if "ejercicio" keyword is missing
        let cleanText = text.replace(muscleRegex, '').trim();
        const fallbackMatch = cleanText.match(/^(.+?)(?=\s+(?:series|repeticiones|reps|comentario)|,|\.|\d)/i);
        if (fallbackMatch && fallbackMatch[1].trim()) {
            exerciseName = fallbackMatch[1].replace(/^ejercicio\s+/i, '').trim();
        } else if (cleanText.length > 0 && !cleanText.match(/^(series|repeticiones|reps|comentario|\d)/i)) {
            exerciseName = cleanText.split(/series|repeticiones|reps|comentario|\d/i)[0].trim() || exerciseName;
        }
    }

    // 3. Sets
    const setsRegex = /(?:series\s*(\d+))|(?:(\d+)\s*series)/i;
    const setsMatch = text.match(setsRegex);
    if (setsMatch) {
        sets = parseInt(setsMatch[1] || setsMatch[2], 10);
    }

    // 4. Reps
    const repsRegex = /(?:repeticiones|reps)\s*(?:de\s*)?(\d+)?\s*(?:a|-|al)?\s*(\d+)?|(?:(?:de\s*)?(\d+)\s*(?:a|-|al)?\s*(\d+)?\s*(?:repeticiones|reps))/i;
    const repsMatch = text.match(repsRegex);
    if (repsMatch) {
        const nums = [];
        for (let i = 1; i < repsMatch.length; i++) {
            if (repsMatch[i]) nums.push(parseInt(repsMatch[i], 10));
        }
        if (nums.length === 1) {
            minReps = nums[0];
            maxReps = nums[0];
        } else if (nums.length >= 2) {
            minReps = Math.min(nums[0], nums[1]);
            maxReps = Math.max(nums[0], nums[1]);
        }
    } else {
        const fallbackRepsRegex = /(\d+)\s*(?:a|-|al|hasta)\s*(\d+)/i;
        const fallbackMatch = text.match(fallbackRepsRegex);
        if (fallbackMatch) {
            minReps = parseInt(fallbackMatch[1], 10);
            maxReps = parseInt(fallbackMatch[2], 10);
        }
    }

    // 5. Instruction
    const instructionRegex = /comentario[s]?\s+(.+)$/i;
    const instructionMatch = text.match(instructionRegex);
    if (instructionMatch) {
        instruction = instructionMatch[1].trim();
    }

    // Search in DB
    const searchName = exerciseName.toLowerCase();
    let foundExercise = allExercises.find(ex => ex.name.toLowerCase() === searchName || ex.name.toLowerCase().includes(searchName));

    if (!foundExercise) {
        foundExercise = {
            id: `custom-voice-${Date.now()}`,
            name: exerciseName,
            muscleGroup: muscleGroup,
            equipment: 'Peso corporal',
            description: 'Agregado por voz',
            primaryMuscles: [muscleGroup],
            secondaryMuscles: [],
            benefits: [],
            level: 'Principiante',
            isCustom: true,
        };
    }

    return {
        exercise: { ...foundExercise, muscleGroup: muscleGroup, name: exerciseName },
        sets,
        minReps,
        maxReps,
        instruction
    };
};

const VoiceAddModal = ({ visible, onClose, onAdd, allExercises, defaultGroup }: { visible: boolean, onClose: () => void, onAdd: (parsed: any) => void, allExercises: Exercise[], defaultGroup: string }) => {
    const [text, setText] = useState('');
    const [parsedData, setParsedData] = useState<any>(null);

    const handleProcess = () => {
        if (!text.trim()) {
            Alert.alert("Texto vacío", "Por favor ingresa o dicta el texto del ejercicio.");
            return;
        }
        const parsed = parseVoiceInput(text, allExercises, defaultGroup);
        setParsedData(parsed);
    };

    const handleConfirm = () => {
        onAdd(parsedData);
        setText('');
        setParsedData(null);
        onClose();
    };

    const handleClose = () => {
        setText('');
        setParsedData(null);
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.pickerOverlay}>
                <View style={[styles.pickerContent, { height: parsedData ? '65%' : '50%' }]}>
                    <View style={styles.pickerHandle} />
                    <View style={styles.pickerHeader}>
                        <Text style={styles.pickerTitle}>Dictar Ejercicio</Text>
                        <TouchableOpacity style={styles.pickerClose} onPress={handleClose}>
                            <X size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                    </View>
                    <View style={{ padding: 20, flex: 1 }}>
                        {!parsedData ? (
                            <>
                                <Text style={{ color: Colors.textMuted, marginBottom: 10 }}>
                                    Usa el teclado de tu dispositivo para dictar.{"\n"}
                                    Formato esperado: "Músculo, Ejercicio, Series, Repeticiones, Comentario"
                                </Text>
                                <TextInput
                                    style={{ 
                                        backgroundColor: Colors.surface, 
                                        color: '#FFF', 
                                        padding: 16, 
                                        borderRadius: 12, 
                                        borderWidth: 1, 
                                        borderColor: Colors.border,
                                        height: 120,
                                        textAlignVertical: 'top'
                                    }}
                                    placeholder="Ej: Músculo pecho, Ejercicio press de banca, series 4, de 8 a 12 repeticiones"
                                    placeholderTextColor={Colors.textMuted}
                                    multiline
                                    value={text}
                                    onChangeText={setText}
                                    autoFocus
                                />
                                <TouchableOpacity 
                                    style={{ 
                                        backgroundColor: Colors.primary, 
                                        padding: 16, 
                                        borderRadius: 12, 
                                        marginTop: 20, 
                                        flexDirection: 'row', 
                                        justifyContent: 'center', 
                                        alignItems: 'center' 
                                    }} 
                                    onPress={handleProcess}
                                >
                                    <Mic size={18} color="#000" style={{ marginRight: 8 }} />
                                    <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 16 }}>Procesar Texto</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <Text style={{ color: Colors.text, fontSize: 16, fontWeight: 'bold', marginBottom: 16 }}>
                                    Verifica y edita si es necesario:
                                </Text>
                                
                                <Text style={{ color: Colors.textMuted, marginBottom: 4, fontSize: 12 }}>Grupo Muscular</Text>
                                <TextInput
                                    style={{ backgroundColor: Colors.surface, color: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 }}
                                    value={parsedData.exercise.muscleGroup}
                                    onChangeText={v => setParsedData({ ...parsedData, exercise: { ...parsedData.exercise, muscleGroup: v } })}
                                />

                                <Text style={{ color: Colors.textMuted, marginBottom: 4, fontSize: 12 }}>Nombre del Ejercicio</Text>
                                <TextInput
                                    style={{ backgroundColor: Colors.surface, color: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, marginBottom: 12 }}
                                    value={parsedData.exercise.name}
                                    onChangeText={v => setParsedData({ ...parsedData, exercise: { ...parsedData.exercise, name: v } })}
                                />

                                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: Colors.textMuted, marginBottom: 4, fontSize: 12 }}>Series</Text>
                                        <TextInput
                                            style={{ backgroundColor: Colors.surface, color: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border }}
                                            value={String(parsedData.sets)}
                                            keyboardType="numeric"
                                            onChangeText={v => setParsedData({ ...parsedData, sets: parseInt(v) || 0 })}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: Colors.textMuted, marginBottom: 4, fontSize: 12 }}>Min Reps</Text>
                                        <TextInput
                                            style={{ backgroundColor: Colors.surface, color: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border }}
                                            value={String(parsedData.minReps)}
                                            keyboardType="numeric"
                                            onChangeText={v => setParsedData({ ...parsedData, minReps: parseInt(v) || 0 })}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: Colors.textMuted, marginBottom: 4, fontSize: 12 }}>Max Reps</Text>
                                        <TextInput
                                            style={{ backgroundColor: Colors.surface, color: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border }}
                                            value={String(parsedData.maxReps)}
                                            keyboardType="numeric"
                                            onChangeText={v => setParsedData({ ...parsedData, maxReps: parseInt(v) || 0 })}
                                        />
                                    </View>
                                </View>

                                <Text style={{ color: Colors.textMuted, marginBottom: 4, fontSize: 12 }}>Instrucción / Comentario</Text>
                                <TextInput
                                    style={{ backgroundColor: Colors.surface, color: '#FFF', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, marginBottom: 20 }}
                                    value={parsedData.instruction}
                                    onChangeText={v => setParsedData({ ...parsedData, instruction: v })}
                                />

                                <TouchableOpacity 
                                    style={{ backgroundColor: Colors.primary, padding: 16, borderRadius: 12, alignItems: 'center' }} 
                                    onPress={handleConfirm}
                                >
                                    <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 16 }}>Confirmar y Añadir</Text>
                                </TouchableOpacity>

                                <TouchableOpacity 
                                    style={{ padding: 16, alignItems: 'center', marginTop: 8 }} 
                                    onPress={() => setParsedData(null)}
                                >
                                    <Text style={{ color: Colors.primary, fontSize: 14 }}>Reintentar dictado</Text>
                                </TouchableOpacity>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

// ─── Exercise Picker Modal ────────────────────────────────────────────────────

const ExercisePicker = ({
    visible,
    muscleGroups,
    selectedIds,
    onToggle,
    onAddToLibrary,
    onClose,
}: {
    visible: boolean;
    muscleGroups: string[];
    selectedIds: Set<string>;
    onToggle: (exercise: Exercise) => void;
    onAddToLibrary: (exercise: Exercise) => Promise<Exercise | undefined>;
    onClose: () => void;
}) => {
    const { allExercises } = usePlans();
    const [filterGroup, setFilterGroup] = useState<string | 'Todos'>('Todos');
    const [showQuickAdd, setShowQuickAdd] = useState(false);

    const available = useMemo(() => {
        let list = allExercises;
        
        // Strictly filter by the muscle groups selected for this day in the previous step
        if (muscleGroups && muscleGroups.length > 0) {
            list = list.filter((e) => 
                muscleGroups.includes(e.muscleGroup) || 
                (e.primaryMuscles && e.primaryMuscles.some(m => muscleGroups.includes(m)))
            );
        } else {
            // If no muscle groups were selected for the day, show no exercises (or all? Usually they want it restricted)
            // But to be safe, if they didn't select any, maybe they just want all.
            // However, the user specifically requested: "no solo de los grupos musculares seleccionados", meaning it should strictly filter.
            // If they selected none, maybe show none.
            list = [];
        }

        if (filterGroup !== 'Todos') {
            list = list.filter((e) => 
                e.muscleGroup === filterGroup || 
                (e.primaryMuscles && e.primaryMuscles.includes(filterGroup))
            );
        }
        return list;
    }, [muscleGroups, filterGroup, allExercises]);

    const handleAddNew = async (ex: Exercise) => {
        const created = await onAddToLibrary(ex);
        // Also auto-select it with real id if available
        if (created) {
            onToggle(created);
        } else {
            onToggle(ex);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.pickerOverlay}
            >
                <View style={styles.pickerContent}>
                    <View style={styles.pickerHandle} />
                    <View style={styles.pickerHeader}>
                        <Text style={styles.pickerTitle}>Elegir Ejercicios</Text>
                        <View style={styles.pickerHeaderRight}>
                            <TouchableOpacity
                                style={styles.pickerNewBtn}
                                onPress={() => setShowQuickAdd(!showQuickAdd)}
                            >
                                <Plus size={14} color={Colors.primary} />
                                <Text style={styles.pickerNewBtnText}>Nuevo</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.pickerClose} onPress={onClose}>
                                <X size={18} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Quick add form */}
                    <QuickAddExercise
                        visible={showQuickAdd}
                        defaultGroup={muscleGroups[0] || 'Pecho'}
                        onAdd={handleAddNew}
                        onClose={() => setShowQuickAdd(false)}
                    />

                    {/* Filter by muscle group */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.pickerFilters}
                    >
                        <TouchableOpacity
                            style={[
                                styles.pickerChip,
                                filterGroup === 'Todos' && styles.pickerChipActive,
                            ]}
                            onPress={() => setFilterGroup('Todos')}
                        >
                            <Text
                                style={[
                                    styles.pickerChipText,
                                    filterGroup === 'Todos' && styles.pickerChipTextActive,
                                ]}
                            >
                                Todos
                            </Text>
                        </TouchableOpacity>
                        {muscleGroups.map((g: string) => (
                            <TouchableOpacity
                                key={g}
                                style={[
                                    styles.pickerChip,
                                    filterGroup === g && {
                                        backgroundColor: (MuscleGroupColors[g] || Colors.primary) + '18',
                                        borderColor: MuscleGroupColors[g] || Colors.primary,
                                    },
                                ]}
                                onPress={() => setFilterGroup(g)}
                            >
                                <Text
                                    style={[
                                        styles.pickerChipText,
                                        filterGroup === g && {
                                            color: MuscleGroupColors[g] || Colors.primary,
                                        },
                                    ]}
                                >
                                    {g}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <FlatList
                        data={available}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={{ paddingBottom: 20 }}
                        renderItem={({ item }) => {
                            const selected = selectedIds.has(item.id);
                            return (
                                <TouchableOpacity
                                    style={[styles.exerciseRow, selected && styles.exerciseRowSelected]}
                                    activeOpacity={0.7}
                                    onPress={() => onToggle(item)}
                                >
                                    <View style={styles.exerciseRowLeft}>
                                        <View
                                            style={[
                                                styles.exerciseRowDot,
                                                {
                                                    backgroundColor:
                                                        MuscleGroupColors[item.muscleGroup] || Colors.primary,
                                                },
                                            ]}
                                        />
                                        <View style={{ flex: 1 }}>
                                            <View style={styles.exerciseRowNameRow}>
                                                <Text style={styles.exerciseRowName} numberOfLines={1}>
                                                    {item.name}
                                                </Text>
                                                {item.isCustom && (
                                                    <View style={styles.customBadge}>
                                                        <Text style={styles.customBadgeText}>Nuevo</Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text style={styles.exerciseRowEquip}>{item.equipment}</Text>
                                        </View>
                                    </View>
                                    <View
                                        style={[
                                            styles.exerciseCheckbox,
                                            selected && styles.exerciseCheckboxActive,
                                        ]}
                                    >
                                        {selected && <Check size={12} color="#000" />}
                                    </View>
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PlanScreen() {
    const { plans, setPlans, addPlan, deletePlan, saveLog, updatePlan, allExercises, muscleGroups, refreshMetadata, fetchPlans, addExercise } = usePlans();

    // User context for role-based features
    const { currentUser, clients } = useUser();

    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchPlans(), refreshMetadata()]);
        setRefreshing(false);
    }, [fetchPlans, refreshMetadata]);

    // Wizard state
    const [showWizard, setShowWizard] = useState(false);
    const [step, setStep] = useState<WizardStep>(1);
    const [assignedClientId, setAssignedClientId] = useState<string | null>(null);

    const [selectedMonth, setSelectedMonth] = useState(MONTHS[new Date().getMonth()]);
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
    const [daysPerWeek, setDaysPerWeek] = useState<number>(3);
    const [splitType, setSplitType] = useState<SplitType>('Torso/Pierna');
    const [trainingDays, setTrainingDays] = useState<TrainingDay[]>([]);
    const [collapsedDays, setCollapsedDays] = useState<Set<number>>(new Set());

    // Grouping State for Step 4
    const [groupingDayIdx, setGroupingDayIdx] = useState<number | null>(null);
    const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);
    const [pickerDayIdx, setPickerDayIdx] = useState<number | null>(null);
    const [replaceExerciseInfo, setReplaceExerciseInfo] = useState<{ dayIdx: number, peId: string } | null>(null);
    const [voiceModalDayIdx, setVoiceModalDayIdx] = useState<number | null>(null);
    const [implicitClient, setImplicitClient] = useState(false);
    const [filterClientId, setFilterClientId] = useState<string | null>(null);
    const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
    const [planNotes, setPlanNotes] = useState<string>('');

    const router = useRouter();
    const params = useLocalSearchParams<{ clientId?: string, filterClientId?: string }>();

    // Effect to handle navigation from Client Card (Creating new plan)
    useEffect(() => {
        if (params.clientId) {
            setFilterClientId(params.clientId);
            // Pre-select client
            setAssignedClientId(params.clientId);
            // Open wizard
            setStep(1);
            setImplicitClient(true);
            setSelectedMonth(MONTHS[new Date().getMonth()]);
            setDaysPerWeek(3);
            setSplitType('Torso/Pierna');
            setTrainingDays([]);
            setShowWizard(true);

            // Clear param
            router.setParams({ clientId: '' });
        }
    }, [params.clientId]);

    // Effect to handle navigation from History or other places (Just filtering)
    useEffect(() => {
        if (params.filterClientId) {
            setFilterClientId(params.filterClientId);
            // Clear param
            router.setParams({ filterClientId: '' });
        }
    }, [params.filterClientId]);

    // Computed values for the exercise picker
    const pickerDay = pickerDayIdx !== null ? trainingDays[pickerDayIdx] : null;
    const pickerSelectedIds = useMemo(() => {
        if (!pickerDay) return new Set<string>();
        return new Set(pickerDay.exercises.map((pe) => pe.exercise.id));
    }, [pickerDay]);

    const currentVolumes = useMemo(() => {
        const vols: Record<string, number> = {};
        trainingDays.forEach(day => {
            day.exercises.forEach(pe => {
                const fullEx = allExercises.find(e => e.id === pe.exercise.id);
                const g = fullEx?.muscleGroup && fullEx.muscleGroup !== 'Core' ? fullEx.muscleGroup : pe.exercise.muscleGroup;
                vols[g] = (vols[g] || 0) + (pe.sets || 0);
            });
        });
        return vols;
    }, [trainingDays, allExercises]);

    const addToLibrary = useCallback(async (exerciseData: Omit<Exercise, 'id'>) => {
        try {
            const dataToSave: Exercise = {
                ...exerciseData,
                id: `temp-${Date.now()}` // Will be overwritten by API
            };
            const savedExercise = await addExercise(dataToSave);
            return savedExercise;
        } catch (error) {
            console.error('Error adding exercise from plan:', error);
            showToast.error('Error al guardar ejercicio');
            return undefined;
        }
    }, [addExercise]);

    const openWizard = () => {
        setStep(1);
        setSelectedMonth(MONTHS[new Date().getMonth()]);
        setDaysPerWeek(3);
        setSplitType('Torso/Pierna');
        setTrainingDays([]);
        // If filtering by a specific client/self, pre-set the assignedClientId
        if (filterClientId && isCoach) {
            setAssignedClientId(filterClientId);
            setImplicitClient(true);
        } else {
            setAssignedClientId(null);
            setImplicitClient(false);
        }
        setShowWizard(true);
    };

    const isCoach = currentUser?.role === 'coach';
    const isClient = currentUser?.role === 'client';

    // Filter plans: Coach sees all plans they created, or plans belonging to them
    // Client only sees plans assigned to them
    const filteredPlans = useMemo(() => {
        if (!currentUser) return [];
        if (isCoach) {
            if (filterClientId) {
                // Show specific client's plans (from Clients section)
                return plans.filter(p => String(p.assignedClientId) === String(filterClientId)).sort((a, b) => {
                    if (b.year !== a.year) return b.year - a.year;
                    return MONTHS.indexOf(b.month) - MONTHS.indexOf(a.month);
                });
            }
            // By default, show ALL plans (coach + clients)
            return [...plans].sort((a, b) => {
                if (b.year !== a.year) return b.year - a.year;
                return MONTHS.indexOf(b.month) - MONTHS.indexOf(a.month);
            });
        }
        // If client, only show plans where assignedClientId matches current user id
        const result = plans.filter(p => String(p.assignedClientId) === String(currentUser.id));
        return result.sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return MONTHS.indexOf(b.month) - MONTHS.indexOf(a.month);
        });
    }, [plans, currentUser?.id, isCoach, filterClientId]);

    // Build filter options for coaches
    const clientFilterOptions = useMemo(() => {
        if (!isCoach || !currentUser) return [];
        const options: { id: string | null; label: string }[] = [
            { id: null, label: 'Todos' },
            { id: currentUser.id, label: 'Yo' },
        ];
        clients.forEach(c => {
            options.push({ id: c.id, label: c.name?.split(' ')[0] || 'Cliente' });
        });
        return options;
    }, [isCoach, currentUser, clients]);

    const createPlan = async () => {
        // Calculate target volumes automatically
        const processedDays = trainingDays.map(day => {
            const calculatedVolumes: Record<string, number> = {};

            day.exercises.forEach(pe => {
                const group = pe.exercise.muscleGroup;
                const sets = pe.sets || 0;
                if (!calculatedVolumes[group]) calculatedVolumes[group] = 0;
                calculatedVolumes[group] += sets;
            });

            return {
                ...day,
                targetVolumes: calculatedVolumes
            };
        });

        if (editingPlanId) {
            // Edit mode: update existing plan
            await updatePlan(editingPlanId, {
                assignedClientId: assignedClientId || currentUser?.id || 'coach-1',
                month: selectedMonth,
                year: selectedYear,
                daysPerWeek,
                splitType,
                days: processedDays,
                notes: planNotes,
            });
        } else {
            const newPlan: Omit<MonthlyPlan, 'id'> = {
                assignedClientId: assignedClientId || currentUser?.id || 'coach-1',
                month: selectedMonth,
                year: selectedYear,
                daysPerWeek,
                splitType,
                days: processedDays,
                notes: planNotes,
            };
            await addPlan(newPlan);
        }
        setShowWizard(false);
        setStep(1);
        setAssignedClientId(null);
        setEditingPlanId(null);
        setPlanNotes('');
    };
    const closeWizard = () => {
        setShowWizard(false);
        setEditingPlanId(null);
        setPlanNotes('');
    };

    const openEditWizard = (plan: MonthlyPlan) => {
        setEditingPlanId(plan.id);
        setAssignedClientId(plan.assignedClientId || null);
        setSelectedMonth(plan.month as typeof MONTHS[number]);
        setSelectedYear(plan.year);
        setDaysPerWeek(plan.daysPerWeek);
        setSplitType(plan.splitType);
        setTrainingDays(plan.days);
        setPlanNotes(plan.notes || '');
        setStep(4); // Go directly to exercise assignment step
        setImplicitClient(false);
        setShowWizard(true);
    };

    const handleAddToLibrary = async (exercise: Exercise) => {
        try {
            const savedExercise = await addExercise(exercise);
            return savedExercise || exercise;
        } catch (error) {
            console.error('Error adding to library:', error);
            return exercise;
        }
    };

    const goNext = () => {
        if (step === 2) {
            if (trainingDays.length === 0) {
                setTrainingDays(generateDays(splitType, daysPerWeek));
            }
        }
        if (step < 4) setStep((s) => (s + 1) as WizardStep);
    };

    const goBack = () => {
        if (step > 1) setStep((s) => (s - 1) as WizardStep);
    };

    // Toggle muscle group for custom split
    const toggleMuscleGroup = (dayIdx: number, group: MuscleGroup) => {
        setTrainingDays((prev) => {
            const updated = [...prev];
            const day = { ...updated[dayIdx] };
            if (day.muscleGroups.includes(group)) {
                day.muscleGroups = day.muscleGroups.filter((g) => g !== group);
            } else {
                day.muscleGroups = [...day.muscleGroups, group];
            }
            updated[dayIdx] = day;
            return updated;
        });
    };

    // Toggle exercise in a day (with default sets/reps)
    const toggleExercise = (dayIdx: number, exercise: Exercise) => {
        setTrainingDays((prev) => {
            const updated = [...prev];
            const day = { ...updated[dayIdx] };
            const exists = day.exercises.find((pe) => pe.exercise.id === exercise.id);
            if (exists) {
                day.exercises = day.exercises.filter((pe) => pe.exercise.id !== exercise.id);
            } else {
                day.exercises = [...day.exercises, {
                    exercise,
                    sets: 3,
                    minReps: 10,
                    maxReps: 12,
                    instruction: ''
                }];
            }
            updated[dayIdx] = day;
            return updated;
        });
    };

    const handlePickerToggle = (ex: Exercise) => {
        if (replaceExerciseInfo) {
            setTrainingDays((prev) => {
                const updated = [...prev];
                const day = { ...updated[replaceExerciseInfo.dayIdx] };
                day.exercises = day.exercises.map((pe) => {
                    if (pe.exercise.id === replaceExerciseInfo.peId) {
                        return { ...pe, exercise: ex };
                    }
                    return pe;
                });
                updated[replaceExerciseInfo.dayIdx] = day;
                return updated;
            });
            setReplaceExerciseInfo(null);
            setPickerDayIdx(null);
        } else {
            toggleExercise(pickerDayIdx!, ex);
        }
    };

    // Update numeric fields (sets, minReps, maxReps)
    const updateExNumField = (
        dayIdx: number,
        exerciseId: string,
        field: 'sets' | 'minReps' | 'maxReps',
        value: string
    ) => {
        const num = parseInt(value, 10) || 0;
        setTrainingDays((prev) => {
            const updated = [...prev];
            const day = { ...updated[dayIdx] };
            day.exercises = day.exercises.map((pe) => {
                if (pe.exercise.id === exerciseId) {
                    return { ...pe, [field]: num };
                }
                return pe;
            });
            updated[dayIdx] = day;
            return updated;
        });
    };

    const updateInstruction = (dayIdx: number, exerciseId: string, instruction: string) => {
        setTrainingDays((prev) => {
            const updated = [...prev];
            const day = { ...updated[dayIdx] };
            day.exercises = day.exercises.map((pe) => {
                if (pe.exercise.id === exerciseId) {
                    return { ...pe, instruction };
                }
                return pe;
            });
            updated[dayIdx] = day;
            return updated;
        });
    };



    // ── Render Wizard Steps ─────────────────────────────────────────────────

    const renderStep1 = () => (
        <ScrollView
            style={styles.stepContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            {/* Target Selection */}
            {currentUser?.role === 'coach' && !implicitClient && (
                <View style={styles.wizardSection}>
                    <Text style={styles.stepLabel}>🎯 ¿Para quién es este plan?</Text>
                    <View style={styles.clientSelector}>
                        <TouchableOpacity
                            style={[styles.clientChip, !assignedClientId && styles.clientChipActive]}
                            onPress={() => setAssignedClientId(null)}
                        >
                            <User size={14} color={!assignedClientId ? '#000' : Colors.textMuted} />
                            <Text style={[styles.clientChipText, !assignedClientId && styles.clientChipTextActive]}>Para mí</Text>
                        </TouchableOpacity>

                        {clients.map((client: any) => (
                            <TouchableOpacity
                                key={client.id}
                                style={[styles.clientChip, assignedClientId === client.id && styles.clientChipActive]}
                                onPress={() => setAssignedClientId(client.id)}
                            >
                                <Users size={14} color={assignedClientId === client.id ? '#000' : Colors.textMuted} />
                                <Text style={[styles.clientChipText, assignedClientId === client.id && styles.clientChipTextActive]}>
                                    {client.name.split(' ')[0]}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            <Text style={styles.stepLabel}>📅 Mes y Año</Text>
            <View style={styles.monthGrid}>
                {MONTHS.map((m) => (
                    <TouchableOpacity
                        key={m}
                        style={[
                            styles.monthChip,
                            selectedMonth === m && styles.monthChipActive,
                        ]}
                        onPress={() => setSelectedMonth(m)}
                    >
                        <Text
                            style={[
                                styles.monthChipText,
                                selectedMonth === m && styles.monthChipTextActive,
                            ]}
                        >
                            {m.slice(0, 3)}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={[styles.stepLabel, { marginTop: Spacing.lg }]}>
                🏋️ Días de Entrenamiento por Semana
            </Text>
            <View style={styles.daysRow}>
                {[1, 2, 3, 4, 5, 6, 7].map((d) => (
                    <TouchableOpacity
                        key={d}
                        style={[
                            styles.dayBtn,
                            daysPerWeek === d && styles.dayBtnActive,
                        ]}
                        onPress={() => setDaysPerWeek(d)}
                    >
                        <Text
                            style={[
                                styles.dayBtnText,
                                daysPerWeek === d && styles.dayBtnTextActive,
                            ]}
                        >
                            {d}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
            <Text style={styles.daysHint}>
                {daysPerWeek} día{daysPerWeek !== 1 ? 's' : ''} / semana · {selectedMonth} {selectedYear}
            </Text>
        </ScrollView>
    );

    const renderStep2 = () => (
        <View style={styles.stepContent}>
            <Text style={styles.stepLabel}>⚡ Elige tu tipo de Split</Text>
            {SPLIT_TYPES.map((s) => (
                <TouchableOpacity
                    key={s.type}
                    style={[
                        styles.splitCard,
                        splitType === s.type && styles.splitCardActive,
                    ]}
                    activeOpacity={0.8}
                    onPress={() => setSplitType(s.type)}
                >
                    <View style={styles.splitCardHeader}>
                        <Text style={styles.splitIcon}>{s.icon}</Text>
                        <Text
                            style={[
                                styles.splitLabel,
                                splitType === s.type && styles.splitLabelActive,
                            ]}
                        >
                            {s.label}
                        </Text>
                        {splitType === s.type && (
                            <View style={styles.splitCheck}>
                                <Check size={14} color="#000" />
                            </View>
                        )}
                    </View>
                    <Text style={styles.splitDesc}>{s.description}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );

    const renderStep3 = () => (
        <ScrollView
            style={styles.stepContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            <Text style={styles.stepLabel}>📋 Configura tus Días</Text>
            {trainingDays.map((day, idx) => (
                <View key={day.dayNumber} style={styles.configDayCard}>
                    <Text style={styles.configDayTitle}>{day.label}</Text>
                    <View style={styles.configMuscleGrid}>
                        {muscleGroups.map((g: string) => {
                            const active = day.muscleGroups.includes(g);
                            const color = MuscleGroupColors[g] || Colors.primary;
                            return (
                                <View key={g} style={{ flexDirection: 'column', alignItems: 'center', marginBottom: 8, marginHorizontal: 4 }}>
                                    <TouchableOpacity
                                        style={[
                                            styles.configMuscleChip,
                                            active && {
                                                backgroundColor: color + '22',
                                                borderColor: color,
                                            },
                                            { marginHorizontal: 0, marginBottom: 0 }
                                        ]}
                                        onPress={() => toggleMuscleGroup(idx, g)}
                                    >
                                        <Text
                                            style={[
                                                styles.configMuscleText,
                                                active && { color },
                                            ]}
                                        >
                                            {g}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>
                </View>
            ))}
        </ScrollView>
    );

    const renderStep4 = () => (
        <ScrollView
            style={styles.stepContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            <Text style={styles.stepLabel}>💪 Elige Ejercicios por Día</Text>

            {/* Real-time volume tracking */}
            {Object.keys(currentVolumes).length > 0 && (
                <View style={{ marginBottom: 16, backgroundColor: Colors.surface, padding: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.border }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.textMuted, marginBottom: 10, textTransform: 'uppercase' }}>Volumen Total (Series de la semana)</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {Object.entries(currentVolumes).map(([g, vol]) => (
                            <View key={g} style={{ backgroundColor: (MuscleGroupColors[g] || Colors.primary) + '22', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 }}>
                                <Text style={{ color: MuscleGroupColors[g] || Colors.primary, fontSize: 13, fontWeight: 'bold' }}>
                                    {g}: {vol}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            <Text style={styles.stepHint}>
                Ajusta series y repeticiones manualmente
            </Text>
            {trainingDays.map((day, idx) => (
                <View key={day.dayNumber} style={styles.exerciseDayCard}>
                    <View style={styles.exerciseDayHeader}>
                        <TouchableOpacity
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                            onPress={() => {
                                setCollapsedDays(prev => {
                                    const next = new Set(prev);
                                    if (next.has(day.dayNumber)) {
                                        next.delete(day.dayNumber);
                                    } else {
                                        next.add(day.dayNumber);
                                    }
                                    return next;
                                });
                            }}
                        >
                            <Text style={styles.exerciseDayTitle}>{day.label}</Text>
                            {collapsedDays.has(day.dayNumber) ? <ChevronDown size={18} color={Colors.textMuted} /> : <ChevronUp size={18} color={Colors.textMuted} />}
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity
                                style={[styles.addExerciseBtn, { backgroundColor: Colors.danger + '22', borderColor: Colors.danger, borderWidth: 1 }]}
                                onPress={() => {
                                    Alert.alert('Eliminar Día', '¿Seguro que deseas eliminar este día de entrenamiento?', [
                                        { text: 'Cancelar', style: 'cancel' },
                                        { text: 'Eliminar', style: 'destructive', onPress: () => {
                                            setTrainingDays(prev => {
                                                const newDays = prev.filter((_, i) => i !== idx).map((d, i) => ({ ...d, dayNumber: i + 1, label: `Día ${i + 1}` }));
                                                setDaysPerWeek(newDays.length);
                                                return newDays;
                                            });
                                        }}
                                    ]);
                                }}
                            >
                                <Trash2 size={14} color={Colors.danger} />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.addExerciseBtn, { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border }]}
                                onPress={() => setVoiceModalDayIdx(idx)}
                            >
                                <Mic size={14} color={Colors.primary} />
                                <Text style={[styles.addExerciseBtnText, { color: Colors.primary }]}>Dictar</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.addExerciseBtn}
                                onPress={() => setPickerDayIdx(idx)}
                            >
                                <Plus size={14} color="#000" />
                                <Text style={styles.addExerciseBtnText}>Añadir</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    {!collapsedDays.has(day.dayNumber) && (
                        <>
                            {/* Quick Muscle Group Selector for this day */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -12, paddingHorizontal: 12, marginBottom: 12, marginTop: 4 }}>
                        {muscleGroups.map((g: string) => {
                            const active = day.muscleGroups.includes(g);
                            const color = MuscleGroupColors[g] || Colors.primary;
                            return (
                                <TouchableOpacity
                                    key={g}
                                    style={[
                                        styles.configMuscleChip,
                                        active && {
                                            backgroundColor: color + '22',
                                            borderColor: color,
                                        },
                                        { paddingVertical: 4, paddingHorizontal: 10, minWidth: 0, marginRight: 8, marginBottom: 0 }
                                    ]}
                                    onPress={() => toggleMuscleGroup(idx, g)}
                                >
                                    <Text style={[styles.configMuscleText, active && { color }, { fontSize: 11 }]}>{g}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>
                    {day.exercises.length > 0 ? (
                        <View style={styles.selectedExercisesList}>
                            {day.exercises.map((pe) => (
                                <View key={pe.exercise.id} style={[styles.selectedExercise, pe.supersetId ? { borderColor: '#CCFF00', borderWidth: 2 } : {}]}>

                                    {/* Grouping Checkbox / Superset Header Overlay */}
                                    {groupingDayIdx === idx ? (
                                        <TouchableOpacity
                                            style={[styles.groupCheckboxPlan, selectedForGroup.includes(pe.exercise.id) && styles.groupCheckboxPlanActive]}
                                            onPress={() => setSelectedForGroup(prev =>
                                                prev.includes(pe.exercise.id)
                                                    ? prev.filter(id => id !== pe.exercise.id)
                                                    : [...prev, pe.exercise.id]
                                            )}
                                        >
                                            <View style={[styles.checkboxInner, selectedForGroup.includes(pe.exercise.id) && { backgroundColor: '#CCFF00' }]} />
                                        </TouchableOpacity>
                                    ) : pe.supersetId ? (
                                        <View style={styles.supersetTagPlan}>
                                            <Text style={styles.supersetTagText}>
                                                {trainingDays[idx].exercises.filter(e => e.supersetId === pe.supersetId).length >= 3 ? 'TRISERIE' : 'BISERIE'}
                                            </Text>
                                            <TouchableOpacity onPress={() => {
                                                const newDays = [...trainingDays];
                                                newDays[idx].exercises = newDays[idx].exercises.map(ex => {
                                                    if (ex.supersetId === pe.supersetId) {
                                                        return { ...ex, supersetId: undefined };
                                                    }
                                                    return ex;
                                                });
                                                setTrainingDays(newDays);
                                            }}>
                                                <Text style={styles.ungroupTextPlan}>Desagrupar</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ) : null}

                                    <View style={pe.supersetId || groupingDayIdx === idx ? { marginTop: pe.supersetId ? 8 : 20 } : {}}>
                                        <View style={styles.selExInfo}>
                                            <View
                                                style={[
                                                    styles.selExDot,
                                                    {
                                                        backgroundColor:
                                                            MuscleGroupColors[allExercises.find(e => e.id === pe.exercise.id)?.muscleGroup && allExercises.find(e => e.id === pe.exercise.id)?.muscleGroup !== 'Core' ? allExercises.find(e => e.id === pe.exercise.id)!.muscleGroup : pe.exercise.muscleGroup] || Colors.primary,
                                                    },
                                                ]}
                                            />
                                            <Text style={styles.selExName} numberOfLines={1}>
                                                {pe.exercise.name}
                                            </Text>
                                            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                                                <TouchableOpacity
                                                    onPress={() => {
                                                        Alert.alert(
                                                            'Cambiar Ejercicio',
                                                            '¿Cómo deseas agregar el nuevo ejercicio?',
                                                            [
                                                                { text: 'Cancelar', style: 'cancel' },
                                                                { text: 'Dictar por voz', onPress: () => {
                                                                    setReplaceExerciseInfo({ dayIdx: idx, peId: pe.exercise.id });
                                                                    setVoiceModalDayIdx(idx);
                                                                }},
                                                                { text: 'Elegir de la lista', onPress: () => {
                                                                    setReplaceExerciseInfo({ dayIdx: idx, peId: pe.exercise.id });
                                                                    setPickerDayIdx(idx);
                                                                }}
                                                            ]
                                                        );
                                                    }}
                                                    style={styles.selExRemove}
                                                >
                                                    <Text style={{ fontSize: 10, color: Colors.primary, fontWeight: 'bold' }}>Cambiar</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => toggleExercise(idx, pe.exercise)}
                                                    style={styles.selExRemove}
                                                >
                                                    <X size={10} color={Colors.textMuted} />
                                                </TouchableOpacity>
                                            </View>
                                        </View>

                                        <View style={styles.setsRepsRow}>
                                            <View style={styles.repsInputWrapper}>
                                                <Text style={styles.stepperLabel}>Series</Text>
                                                <TextInput
                                                    style={[styles.repsInput, { color: '#FFFFFF', borderColor: Colors.border }]}
                                                    value={String(pe.sets)}
                                                    onChangeText={(val) => updateExNumField(idx, pe.exercise.id, 'sets', val)}
                                                    keyboardType="numeric"
                                                    placeholder="3"
                                                    placeholderTextColor={Colors.textMuted}
                                                />
                                            </View>

                                            <View style={styles.repsRangeContainer}>
                                                <View style={styles.repsInputWrapper}>
                                                    <Text style={styles.stepperLabel}>Min</Text>
                                                    <TextInput
                                                        style={[styles.repsInput, { color: '#FFFFFF', borderColor: Colors.border }]}
                                                        value={String(pe.minReps)}
                                                        onChangeText={(val) => updateExNumField(idx, pe.exercise.id, 'minReps', val)}
                                                        keyboardType="numeric"
                                                        placeholder="8"
                                                        placeholderTextColor={Colors.textMuted}
                                                    />
                                                </View>
                                                <Text style={styles.rangeDash}>-</Text>
                                                <View style={styles.repsInputWrapper}>
                                                    <Text style={styles.stepperLabel}>Max</Text>
                                                    <TextInput
                                                        style={[styles.repsInput, { color: '#FFFFFF', borderColor: Colors.border }]}
                                                        value={String(pe.maxReps)}
                                                        onChangeText={(val) => updateExNumField(idx, pe.exercise.id, 'maxReps', val)}
                                                        keyboardType="numeric"
                                                        placeholder="12"
                                                        placeholderTextColor={Colors.textMuted}
                                                    />
                                                </View>
                                            </View>
                                        </View>

                                        <TextInput
                                            style={[styles.instructionInput, { color: '#FFFFFF', borderColor: Colors.border }]}
                                            value={pe.instruction}
                                            onChangeText={(val) => updateInstruction(idx, pe.exercise.id, val)}
                                            placeholder="Instrucciones u objetivo (opcional)..."
                                            placeholderTextColor={Colors.textMuted}
                                            multiline
                                        />
                                    </View>
                                </View>
                            ))}
                        </View>
                    ) : day.muscleGroups.length > 0 ? (
                        <Text style={styles.noExercisesText}>
                            Toca "Añadir" para elegir ejercicios
                        </Text>
                    ) : null}

                    {/* Biserie/Triserie Controls for Step 4 */}
                    {day.exercises.length >= 2 && (
                        <View style={styles.groupModeBarPlan}>
                            {groupingDayIdx === idx ? (
                                <>
                                    <TouchableOpacity style={styles.cancelGroupBtn} onPress={() => { setGroupingDayIdx(null); setSelectedForGroup([]); }}>
                                        <Text style={styles.cancelGroupText}>Cancelar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.confirmGroupBtn, selectedForGroup.length >= 2 && selectedForGroup.length <= 3 ? { backgroundColor: '#CCFF00' } : { backgroundColor: Colors.surfaceLight }]}
                                        onPress={() => {
                                            if (selectedForGroup.length < 2 || selectedForGroup.length > 3) {
                                                Alert.alert('Aviso', 'Selecciona 2 (Biserie) o 3 (Triserie) ejercicios.');
                                                return;
                                            }
                                            const supersetId = 'super_' + Date.now();
                                            const newDays = [...trainingDays];
                                            newDays[idx].exercises = newDays[idx].exercises.map(ex => {
                                                if (selectedForGroup.includes(ex.exercise.id)) {
                                                    return { ...ex, supersetId };
                                                }
                                                return ex;
                                            });
                                            setTrainingDays(newDays);
                                            setGroupingDayIdx(null);
                                            setSelectedForGroup([]);
                                        }}
                                    >
                                        <Text style={[styles.confirmGroupText, selectedForGroup.length >= 2 && selectedForGroup.length <= 3 ? { color: '#000' } : { color: Colors.textMuted }]}>
                                            Agrupar ({selectedForGroup.length})
                                        </Text>
                                    </TouchableOpacity>
                                </>
                            ) : (
                                <TouchableOpacity style={styles.startGroupBtn} onPress={() => { setGroupingDayIdx(idx); setSelectedForGroup([]); }}>
                                    <Plus size={16} color={Colors.primary} />
                                    <Text style={styles.startGroupText}>Crear Biserie / Triserie</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                        </>
                    )}
                </View>
            ))}
            <TouchableOpacity 
                style={[styles.addExerciseBtn, { alignSelf: 'center', marginVertical: 16 }]} 
                onPress={() => {
                     setTrainingDays(prev => {
                         const newDays = [...prev, { dayNumber: prev.length + 1, label: `Día ${prev.length + 1}`, muscleGroups: [], targetVolumes: {}, exercises: [] }];
                         setDaysPerWeek(newDays.length);
                         return newDays;
                     });
                }}
            >
                <Plus size={16} color="#000" />
                <Text style={styles.addExerciseBtnText}>Añadir Día de Entrenamiento</Text>
            </TouchableOpacity>

            <View style={{ marginTop: 20, paddingHorizontal: 4 }}>
                <Text style={{ color: Colors.text, fontSize: 16, fontWeight: '600', marginBottom: 8 }}>Especificaciones del Plan (Opcional)</Text>
                <TextInput
                    style={{
                        backgroundColor: Colors.surface,
                        color: '#FFF',
                        borderColor: Colors.border,
                        borderWidth: 1,
                        borderRadius: 12,
                        padding: 16,
                        minHeight: 100,
                        textAlignVertical: 'top'
                    }}
                    placeholder="Ej. Descansar 90s entre ejercicios, enfocar en excéntrica..."
                    placeholderTextColor={Colors.textMuted}
                    value={planNotes}
                    onChangeText={setPlanNotes}
                    multiline
                />
            </View>

            <View style={{ height: 20 }} />
        </ScrollView>
    );




    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: Colors.background }]}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
        >

            {/* Client Filter Chips for Coach */}
            {isCoach && clients.length > 0 && (
                <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.clientFilterRow}
                    contentContainerStyle={styles.clientFilterContent}
                >
                    {clientFilterOptions.map(opt => {
                        const isActive = filterClientId === opt.id;
                        return (
                            <TouchableOpacity
                                key={opt.id ?? 'all'}
                                style={[styles.clientChip, isActive && styles.clientChipActive]}
                                onPress={() => setFilterClientId(opt.id)}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.clientChipText, isActive && styles.clientChipTextActive]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}

            {/* Filter Banner */}
            {isCoach && filterClientId && !clientFilterOptions.some(o => o.id === filterClientId) && (
                <View style={styles.filterBanner}>
                    <View style={styles.filterBannerTextWrap}>
                        <User size={14} color={Colors.primary} />
                        <Text style={styles.filterBannerText}>
                            Mostrando planes de: <Text style={styles.filterName}>
                                {clients.find(c => c.id === filterClientId)?.name || 'Cliente'}
                            </Text>
                        </Text>
                    </View>
                    <TouchableOpacity
                        style={styles.clearFilterBtn}
                        onPress={() => setFilterClientId(null)}
                    >
                        <X size={14} color={Colors.textMuted} />
                    </TouchableOpacity>
                </View>
            )}

            {/* Plans List */}
            {filteredPlans.length === 0 ? (
                <ScrollView
                    contentContainerStyle={styles.emptyContainer}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
                    }
                >
                    <View style={styles.emptyIconContainer}>
                        <CalendarDays size={36} color={Colors.textMuted} />
                    </View>
                    <Text style={styles.emptyText}>Sin planes todavía</Text>
                    <Text style={styles.emptySubtext}>
                        {isCoach
                            ? 'Crea el primer plan mensual para tus clientes'
                            : 'Aún no tienes un plan asignado. Contacta a tu coach.'}
                    </Text>
                    {isCoach && (
                        <TouchableOpacity style={styles.emptyCta} onPress={openWizard}>
                            <Plus size={16} color="#000" />
                            <Text style={styles.emptyCtaText}>Crear Plan</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>
            ) : (
                <FlatList
                    data={filteredPlans}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={styles.plansList}
                    keyboardShouldPersistTaps="handled"
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.primary} colors={[Colors.primary]} />
                    }
                    renderItem={({ item }) => (
                        <PlanCard plan={item} onDelete={deletePlan} onSaveLog={saveLog} onEdit={openEditWizard} />
                    )}
                />
            )}

            {/* FAB - Create Plan */}
            {isCoach && (
                <TouchableOpacity
                    style={styles.fab}
                    onPress={openWizard}
                    activeOpacity={0.85}
                >
                    <Plus size={24} color="#000" />
                </TouchableOpacity>
            )}

            {/* ── Wizard Modal ─────────────────────────────────────────────────── */}
            <Modal visible={showWizard} animationType="slide" transparent>
                <View style={styles.wizardOverlay}>
                    <KeyboardAvoidingView
                        style={styles.wizardContent}
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    >
                        <View style={styles.wizardHandle} />

                        {/* Wizard Header */}
                        <View style={styles.wizardHeader}>
                            <View>
                                <Text style={styles.wizardTitle}>{STEP_TITLES[step]}</Text>
                                <Text style={styles.wizardStep}>Paso {step} de 4</Text>
                            </View>
                            <TouchableOpacity style={styles.wizardClose} onPress={closeWizard}>
                                <X size={18} color={Colors.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <StepIndicator current={step} total={4} />

                        {/* Step Content */}
                        <View style={styles.wizardBody}>
                            {step === 1 && renderStep1()}
                            {step === 2 && renderStep2()}
                            {step === 3 && renderStep3()}
                            {step === 4 && renderStep4()}
                        </View>

                        {/* Navigation Buttons */}
                        <View style={styles.wizardFooter}>
                            {step > 1 ? (
                                <TouchableOpacity style={styles.backBtn} onPress={goBack}>
                                    <ArrowLeft size={16} color={Colors.text} />
                                    <Text style={styles.backBtnText}>Atrás</Text>
                                </TouchableOpacity>
                            ) : (
                                <View />
                            )}
                            {step < 4 ? (
                                <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
                                    <Text style={styles.nextBtnText}>Siguiente</Text>
                                    <ArrowRight size={16} color="#000" />
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.nextBtn} onPress={createPlan}>
                                    <Check size={16} color="#000" />
                                    <Text style={styles.nextBtnText}>{editingPlanId ? 'Actualizar Plan' : 'Guardar Plan'}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Exercise Picker */}
            {pickerDay && (
                <ExercisePicker
                    visible={pickerDayIdx !== null}
                    muscleGroups={pickerDay.muscleGroups}
                    selectedIds={pickerSelectedIds}
                    onToggle={handlePickerToggle}
                    onAddToLibrary={addToLibrary}
                    onClose={() => { setPickerDayIdx(null); setReplaceExerciseInfo(null); }}
                />
            )}

            {/* Voice Add Modal */}
            <VoiceAddModal
                visible={voiceModalDayIdx !== null}
                onClose={() => { setVoiceModalDayIdx(null); setReplaceExerciseInfo(null); }}
                allExercises={allExercises}
                defaultGroup={voiceModalDayIdx !== null && trainingDays[voiceModalDayIdx].muscleGroups.length > 0 ? trainingDays[voiceModalDayIdx].muscleGroups[0] : 'Pecho'}
                onAdd={(parsed) => {
                    if (voiceModalDayIdx !== null) {
                        if (replaceExerciseInfo) {
                            setTrainingDays((prev) => {
                                const updated = [...prev];
                                const day = { ...updated[replaceExerciseInfo.dayIdx] };
                                day.exercises = day.exercises.map((pe) => {
                                    if (pe.exercise.id === replaceExerciseInfo.peId) {
                                        return { ...pe, exercise: parsed.exercise, sets: parsed.sets, minReps: parsed.minReps, maxReps: parsed.maxReps, instruction: parsed.instruction };
                                    }
                                    return pe;
                                });
                                updated[replaceExerciseInfo.dayIdx] = day;
                                return updated;
                            });
                            setReplaceExerciseInfo(null);
                        } else {
                            setTrainingDays((prev) => {
                                const updated = [...prev];
                                const day = { ...updated[voiceModalDayIdx] };
                                day.exercises = [...day.exercises, {
                                    exercise: parsed.exercise,
                                    sets: parsed.sets,
                                    minReps: parsed.minReps,
                                    maxReps: parsed.maxReps,
                                    instruction: parsed.instruction
                                }];
                                updated[voiceModalDayIdx] = day;
                                return updated;
                            });
                        }
                        setVoiceModalDayIdx(null);
                    }
                }}
            />
        </KeyboardAvoidingView>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.sm,
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    title: {
        color: Colors.text,
        fontSize: 32,
        fontWeight: '800',
        letterSpacing: -0.5,
    },
    subtitle: {
        color: Colors.textMuted,
        fontSize: 14,
        marginTop: 4,
    },
    headerBadge: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(191, 255, 10, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(191, 255, 10, 0.2)',
    },
    filterBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: 'rgba(191, 255, 10, 0.08)',
        marginHorizontal: Spacing.md,
        marginTop: Spacing.sm,
        marginBottom: Spacing.xs,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: 'rgba(191, 255, 10, 0.25)',
    },
    filterBannerTextWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    filterBannerText: {
        color: Colors.text,
        fontSize: 18,
        fontWeight: '500',
    },
    filterName: {
        color: Colors.primary,
        fontWeight: '700',
    },
    clearFilterBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: Colors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    implicitClientBox: {
        marginBottom: Spacing.lg,
    },
    implicitClientBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: Colors.cardBg,
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: Colors.primary + '40',
        alignSelf: 'flex-start',
    },
    implicitClientName: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: '700',
    },

    // ── Empty State ───────────────────────────────────────────────────────
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 80,
    },
    emptyIconContainer: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: Colors.cardBg,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    emptyText: {
        color: Colors.text,
        fontSize: 18,
        fontWeight: '700',
    },
    emptySubtext: {
        color: Colors.textMuted,
        fontSize: 14,
        marginTop: 6,
        marginBottom: Spacing.lg,
    },
    emptyCta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: Colors.primary,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: borderRadius.lg,
    },
    emptyCtaText: {
        color: '#000',
        fontSize: 18,
        fontWeight: '700',
    },

    // ── Plans List ────────────────────────────────────────────────────────
    plansList: {
        padding: Spacing.md,
        paddingBottom: 100,
    },
    planCard: {
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: 10,
        overflow: 'hidden',
    },
    planCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.md,
    },
    planCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 12,
    },
    planMonthBadge: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: 'rgba(191, 255, 10, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    planCardTitle: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: '700',
    },
    planCardSub: {
        color: Colors.textMuted,
        fontSize: 12,
        marginTop: 2,
    },
    planCardRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    deleteBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 69, 58, 0.12)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    editBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: Colors.primary + '18',
        justifyContent: 'center',
        alignItems: 'center',
    },
    planCardBody: {
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
    },
    dayRow: {
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    dayLabel: {
        color: Colors.text,
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 4,
    },
    dayMuscles: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    miniChip: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: borderRadius.full,
    },
    miniChipText: {
        fontSize: 10,
        fontWeight: '600',
    },
    dayExercises: {
        marginTop: 6,
    },
    dayExerciseText: {
        color: Colors.textMuted,
        fontSize: 12,
        lineHeight: 18,
    },
    setsRepsInline: {
        color: Colors.primary,
        fontWeight: '600',
    },

    // ── Wizard Modal ──────────────────────────────────────────────────────
    wizardOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    wizardContent: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: borderRadius.xl,
        borderTopRightRadius: borderRadius.xl,
        maxHeight: '92%',
        minHeight: '75%',
    },
    wizardHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.border,
        alignSelf: 'center',
        marginTop: Spacing.sm,
        marginBottom: Spacing.sm,
    },
    wizardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.sm,
    },
    wizardTitle: {
        color: Colors.text,
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    wizardStep: {
        color: Colors.textMuted,
        fontSize: 18,
        marginTop: 2,
    },
    wizardClose: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // ── Step Indicator ────────────────────────────────────────────────────
    stepIndicator: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 6,
        marginBottom: Spacing.md,
        paddingHorizontal: Spacing.md,
    },
    stepDot: {
        flex: 1,
        height: 3,
        borderRadius: 2,
        backgroundColor: Colors.border,
    },
    stepDotActive: {
        backgroundColor: Colors.primary,
    },
    stepDotDone: {
        backgroundColor: 'rgba(191, 255, 10, 0.35)',
    },

    // ── Wizard Body ───────────────────────────────────────────────────────
    wizardBody: {
        flex: 1,
        paddingHorizontal: Spacing.md,
    },
    readOnlyBadge: {
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.2)',
    },
    readOnlyText: {
        color: Colors.textMuted,
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    stepContent: {
        flex: 1,
    },
    stepLabel: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: '700',
        marginBottom: Spacing.md,
    },
    stepHint: {
        color: Colors.textMuted,
        fontSize: 12,
        marginBottom: Spacing.md,
        marginTop: -8,
    },

    // ── Step 1: Month + Days ──────────────────────────────────────────────
    monthGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    monthChip: {
        width: '30%',
        paddingVertical: 10,
        borderRadius: borderRadius.md,
        backgroundColor: Colors.cardBg,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    monthChipActive: {
        backgroundColor: 'rgba(191, 255, 10, 0.12)',
        borderColor: Colors.primary,
    },
    monthChipText: {
        color: Colors.textMuted,
        fontSize: 14,
        fontWeight: '600',
    },
    monthChipTextActive: {
        color: Colors.primary,
    },
    daysRow: {
        flexDirection: 'row',
        gap: 8,
    },
    dayBtn: {
        flex: 1,
        aspectRatio: 1,
        borderRadius: borderRadius.md,
        backgroundColor: Colors.cardBg,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
        maxWidth: 46,
    },
    dayBtnActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    dayBtnText: {
        color: Colors.textMuted,
        fontSize: 16,
        fontWeight: '700',
    },
    dayBtnTextActive: {
        color: '#000',
    },
    daysHint: {
        color: Colors.textMuted,
        fontSize: 18,
        marginTop: Spacing.md,
        textAlign: 'center',
    },

    // ── Step 2: Split Type ────────────────────────────────────────────────
    splitCard: {
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.lg,
        padding: Spacing.md,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    splitCardActive: {
        borderColor: Colors.primary,
        backgroundColor: 'rgba(191, 255, 10, 0.06)',
    },
    splitCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    splitIcon: {
        fontSize: 20,
    },
    splitLabel: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: '700',
        flex: 1,
    },
    splitLabelActive: {
        color: Colors.primary,
    },
    splitCheck: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    splitDesc: {
        color: Colors.textMuted,
        fontSize: 18,
        lineHeight: 18,
        paddingLeft: 28,
    },

    // ── Step 3: Configure Days ────────────────────────────────────────────
    configDayCard: {
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.lg,
        padding: Spacing.md,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    configDayTitle: {
        color: Colors.text,
        fontSize: 18,
        fontWeight: '700',
        marginBottom: Spacing.sm,
    },
    configMuscleGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    configMuscleChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
        backgroundColor: Colors.surfaceLight,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    configMuscleText: {
        color: Colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
    },
    volumeInput: {
        borderWidth: 1,
        borderRadius: borderRadius.md,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginTop: 4,
        width: 60,
        textAlign: 'center',
        fontSize: 12,
    },

    // ── Step 4: Select Exercises ──────────────────────────────────────────
    exerciseDayCard: {
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.lg,
        padding: Spacing.md,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    exerciseDayHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    exerciseDayTitle: {
        color: Colors.text,
        fontSize: 18,
        fontWeight: '700',
    },
    addExerciseBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: Colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
    },
    addExerciseBtnText: {
        color: '#000',
        fontSize: 12,
        fontWeight: '700',
    },
    noMusclesText: {
        color: Colors.textMuted,
        fontSize: 12,
        fontStyle: 'italic',
    },
    noExercisesText: {
        color: Colors.textMuted,
        fontSize: 12,
        marginTop: 4,
    },
    selectedExercisesList: {
        gap: 8,
    },
    selectedExercise: {
        backgroundColor: Colors.surfaceLight,
        borderRadius: borderRadius.md,
        padding: 10,
    },
    selExInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    selExDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    selExName: {
        flex: 1,
        color: Colors.text,
        fontSize: 18,
        fontWeight: '600',
    },
    selExRemove: {
        width: 20,
        height: 20,
        borderRadius: 10,
        backgroundColor: Colors.cardBg,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // ── Sets / Reps ───────────────────────────────────────────────────────
    setsRepsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    setsRepsSep: {
        color: Colors.textMuted,
        fontSize: 16,
        fontWeight: '700',
    },
    stepper: {
        alignItems: 'center',
    },
    stepperLabel: {
        color: Colors.textMuted,
        fontSize: 10,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    stepperControls: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    stepperBtn: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: Colors.cardBg,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.border,
    },
    stepperBtnDisabled: {
        opacity: 0.4,
    },
    stepperValue: {
        color: Colors.primary,
        fontSize: 18,
        fontWeight: '800',
        minWidth: 28,
        textAlign: 'center',
    },

    // ── Wizard Footer ─────────────────────────────────────────────────────
    wizardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: borderRadius.lg,
        backgroundColor: Colors.surfaceLight,
    },
    backBtnText: {
        color: Colors.text,
        fontSize: 14,
        fontWeight: '600',
    },
    nextBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: borderRadius.lg,
        backgroundColor: Colors.primary,
    },
    nextBtnText: {
        color: '#000',
        fontSize: 14,
        fontWeight: '700',
    },

    // ── Exercise Picker Modal ─────────────────────────────────────────────
    pickerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    pickerContent: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: borderRadius.xl,
        borderTopRightRadius: borderRadius.xl,
        maxHeight: '85%',
        minHeight: '60%',
        paddingTop: Spacing.sm,
    },
    pickerHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.border,
        alignSelf: 'center',
        marginBottom: Spacing.md,
    },
    pickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.sm,
    },
    pickerHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    pickerTitle: {
        color: Colors.text,
        fontSize: 18,
        fontWeight: '800',
    },
    pickerNewBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(191, 255, 10, 0.25)',
        backgroundColor: 'rgba(191, 255, 10, 0.08)',
    },
    pickerNewBtnText: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '600',
    },
    pickerClose: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pickerFilters: {
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.sm,
        maxHeight: 40,
    },
    pickerChip: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
        backgroundColor: Colors.cardBg,
        marginRight: 6,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    pickerChipActive: {
        backgroundColor: 'rgba(191, 255, 10, 0.12)',
        borderColor: Colors.primary,
    },
    pickerChipText: {
        color: Colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
    },
    pickerChipTextActive: {
        color: Colors.primary,
    },
    exerciseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: Spacing.md,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    exerciseRowSelected: {
        backgroundColor: 'rgba(191, 255, 10, 0.04)',
    },
    exerciseRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 10,
    },
    exerciseRowDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    exerciseRowNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    exerciseRowName: {
        color: Colors.text,
        fontSize: 14,
        fontWeight: '600',
        flexShrink: 1,
    },
    exerciseRowEquip: {
        color: Colors.textMuted,
        fontSize: 11,
        marginTop: 1,
    },
    customBadge: {
        backgroundColor: 'rgba(191, 255, 10, 0.12)',
        paddingHorizontal: 6,
        paddingVertical: 1,
        borderRadius: borderRadius.full,
    },
    customBadgeText: {
        color: Colors.primary,
        fontSize: 9,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    exerciseCheckbox: {
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: 1.5,
        borderColor: Colors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    exerciseCheckboxActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },

    // ── Workout Logging ───────────────────────────────────────────────────
    dayHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    loggedBadge: {
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    logDayBtn: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: Colors.primary,
        backgroundColor: 'transparent',
    },
    logDayBtnActive: {
        backgroundColor: Colors.surfaceLight,
        borderColor: Colors.textMuted,
    },
    logDayBtnText: {
        color: Colors.primary,
        fontSize: Typography.xs,
        fontWeight: '700',
    },
    logDayBtnTextActive: {
        color: Colors.textMuted,
    },
    logForm: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    logExerciseCard: {
        backgroundColor: Colors.surfaceLight,
        borderRadius: borderRadius.md,
        padding: 10,
        marginBottom: 10,
    },
    logExerciseName: {
        color: Colors.text,
        fontSize: Typography.md,
        fontWeight: '700',
        marginBottom: 2,
    },
    logExercisePlan: {
        color: Colors.primary,
        fontSize: Typography.xs,
        fontWeight: '600',
        marginBottom: 8,
    },
    logSetHeader: {
        flexDirection: 'row',
        paddingBottom: 4,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        marginBottom: 4,
    },
    logSetHeaderText: {
        flex: 1,
        color: Colors.textMuted,
        fontSize: Typography.xs,
        fontWeight: '700',
        textTransform: 'uppercase',
        textAlign: 'center',
    },
    logSetRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 6,
    },
    logSetNum: {
        flex: 1,
        alignItems: 'center',
    },
    logSetNumText: {
        color: Colors.textMuted,
        fontSize: 14,
        fontWeight: '700',
    },
    logInput: {
        flex: 1,
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.sm,
        borderWidth: 1,
        borderColor: Colors.border,
        color: Colors.text,
        fontSize: Typography.md,
        fontWeight: '600',
        textAlign: 'center',
        paddingVertical: 8,
    },
    saveLogBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: Colors.primary,
        paddingVertical: 10,
        borderRadius: borderRadius.md,
        marginTop: 6,
    },
    saveLogBtnText: {
        color: '#000',
        fontSize: 14,
        fontWeight: '700',
    },
    // ── Refined Header ─────────────────────────────────
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: Colors.primary,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: borderRadius.md,
    },
    addBtnText: {
        fontSize: 18,
        fontWeight: '700',
        color: '#000',
    },
    // ── FAB ──────────────────────────────────────────────
    fab: {
        position: 'absolute',
        right: Spacing.md,
        bottom: Spacing.lg,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
        zIndex: 10,
    },
    // ── Empty State ────────────────────────────────────
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: Spacing.xl,
    },

    // ── Session Count Badge ────────────────────────────
    sessionCountBadge: {
        backgroundColor: Colors.primary + '22',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: borderRadius.full,
    },
    sessionCountText: {
        color: Colors.primary,
        fontSize: 18,
        fontWeight: '700',
    },

    // ── Session History ────────────────────────────────
    sessionHistoryContainer: {
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.md,
        padding: 10,
        marginTop: 6,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    sessionHistoryTitle: {
        color: Colors.textMuted,
        fontSize: 18,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    sessionHistoryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 5,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border + '50',
    },
    sessionHistoryDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Colors.primary,
    },
    sessionHistoryLabel: {
        color: Colors.text,
        fontSize: 12,
        fontWeight: '600',
    },
    sessionHistoryDate: {
        color: Colors.textMuted,
        fontSize: 18,
    },
    sessionHistoryComment: {
        color: Colors.primary,
        fontSize: 18,
        fontStyle: 'italic',
        marginTop: 2,
    },
    sessionHistorySummary: {
        color: Colors.textMuted,
        fontSize: 18,
        fontWeight: '500',
    },

    // ── Saved Confirmation ─────────────────────────────
    savedContainer: {
        alignItems: 'center',
        paddingVertical: 16,
        gap: 8,
    },
    savedBadge: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
    },
    savedTitle: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: '700',
    },
    savedSub: {
        color: Colors.textMuted,
        fontSize: 18,
        marginBottom: 8,
    },
    sessionCommentBox: {
        backgroundColor: Colors.primary + '08',
        padding: 12,
        borderRadius: borderRadius.md,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: Colors.primary,
    },
    sessionCommentLabel: {
        color: Colors.primary,
        fontSize: 18,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    sessionCommentText: {
        color: Colors.text,
        fontSize: 18,
        lineHeight: 18,
        fontStyle: 'italic',
    },
    newSessionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: Colors.primary,
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: borderRadius.md,
        width: '100%',
    },
    newSessionBtnText: {
        color: '#000',
        fontSize: 14,
        fontWeight: '700',
    },
    closeDayBtn: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    closeDayBtnText: {
        color: Colors.textMuted,
        fontSize: 18,
        fontWeight: '600',
    },
    newSessionTitle: {
        color: Colors.primary,
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 8,
    },
    // ── Session Details Expansion ──────────────────────
    sessionHistoryItemWrap: {
        borderBottomWidth: 1,
        borderBottomColor: Colors.border + '50',
    },
    sessionDetails: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        backgroundColor: Colors.surface + '50',
        gap: 12,
    },
    sessionExDetail: {
        gap: 4,
    },
    sessionExName: {
        color: Colors.text,
        fontSize: 18,
        fontWeight: '700',
    },
    sessionSetsGrid: {
        flexDirection: 'column',
        gap: 4,
    },
    sessionSetDetail: {
        color: '#FFFFFF',
        fontSize: 18,
        paddingVertical: 2,
    },
    // ── Comment Input ──────────────────────────────────
    commentInputContainer: {
        marginTop: 10,
        marginBottom: 10,
        gap: 6,
    },
    commentLabel: {
        color: Colors.textMuted,
        fontSize: 18,
        fontWeight: '600',
    },
    commentInput: {
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderColor: Colors.border,
        color: Colors.text,
        fontSize: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    // ── Quick Add Form ─────────────────────────────────
    quickAddContent: {
        backgroundColor: Colors.surface,
        borderRadius: borderRadius.md,
        padding: 15,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    quickAddTitle: {
        color: Colors.text,
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 12,
    },
    quickAddForm: {
        gap: 12,
    },
    quickAddInput: {
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.sm,
        borderWidth: 1,
        borderColor: Colors.border,
        color: Colors.text,
        fontSize: 18,
        paddingHorizontal: 10,
        paddingVertical: 8,
    },
    quickAddRow: {
        flexDirection: 'row',
        gap: 10,
    },
    quickAddLabel: {
        color: Colors.textMuted,
        fontSize: 18,
        marginBottom: 4,
    },
    quickAddChip: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: Colors.border,
        marginRight: 6,
    },
    quickAddChipActive: {
        backgroundColor: Colors.primary + '22',
        borderColor: Colors.primary,
    },
    quickAddChipText: {
        color: Colors.textMuted,
        fontSize: 18,
        fontWeight: '600',
    },
    quickAddChipTextActive: {
        color: Colors.primary,
    },
    quickAddActions: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
        gap: 10,
        marginTop: 4,
    },
    quickAddCancel: {
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    quickAddCancelText: {
        color: Colors.textMuted,
        fontSize: 18,
    },
    quickAddBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: Colors.primary,
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: borderRadius.sm,
    },
    quickAddBtnText: {
        color: '#000',
        fontSize: 18,
        fontWeight: '700',
    },
    // ── Wizard Client Selector ────────────────────────
    wizardSection: {
        marginBottom: 20,
    },
    clientSelector: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 10,
    },
    clientFilterRow: {
        maxHeight: 44,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
        backgroundColor: Colors.surface,
    },
    clientFilterContent: {
        paddingHorizontal: Spacing.md,
        gap: 8,
        alignItems: 'center',
        paddingVertical: 6,
    },
    clientChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: Colors.border,
        backgroundColor: Colors.cardBg,
    },
    clientChipActive: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    clientChipText: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textMuted,
    },
    clientChipTextActive: {
        color: '#000',
    },
    // New fields
    repsInputWrapper: {
        width: 80,
        gap: 8,
    },
    repsRangeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    rangeDash: {
        color: Colors.textMuted,
        fontSize: 18,
        fontWeight: '700',
        marginTop: 20,
    },
    repsInput: {
        borderWidth: 1,
        borderRadius: borderRadius.sm,
        paddingHorizontal: 10,
        paddingVertical: 6,
        fontSize: Typography.md,
        fontWeight: '700',
        textAlign: 'center',
    },
    instructionInput: {
        borderWidth: 1,
        borderRadius: borderRadius.md,
        padding: 10,
        marginTop: 10,
        minHeight: 60,
        fontSize: Typography.sm,
        textAlignVertical: 'top',
    },
    logExerciseInstruction: {
        fontSize: Typography.sm,
        fontStyle: 'italic',
        marginTop: 4,
        opacity: 0.8,
    },
    // ── Grouping UI Styles for Plan Builder ─────────────────────────
    groupCheckboxPlan: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: Colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        backgroundColor: Colors.cardBg,
    },
    groupCheckboxPlanActive: {
        borderColor: '#CCFF00',
    },
    checkboxInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    supersetTagPlan: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(204, 255, 0, 0.15)',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 6,
        borderTopLeftRadius: 6,
        borderTopRightRadius: 6,
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 5,
    },
    supersetTagText: {
        fontSize: 10,
        fontWeight: '900',
        color: '#CCFF00',
        letterSpacing: 1,
    },
    ungroupTextPlan: {
        fontSize: 10,
        fontWeight: '700',
        color: Colors.text,
        backgroundColor: 'rgba(255,255,255,0.1)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
    },
    groupModeBarPlan: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: Spacing.md,
        gap: 12,
    },
    startGroupBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: 'rgba(204, 255, 0, 0.15)',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: 'rgba(204, 255, 0, 0.3)',
    },
    startGroupText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#CCFF00',
    },
    cancelGroupBtn: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: borderRadius.full,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    cancelGroupText: {
        fontSize: 14,
        fontWeight: '600',
        color: Colors.text,
    },
    confirmGroupBtn: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: borderRadius.full,
    },
    confirmGroupText: {
        fontSize: 14,
        fontWeight: '800',
    },
});
