import {
    Exercise,
    ExercisePriority,
    ExercisePriorityInfo,
    getExercisePriority,
    inferMuscleGroupFromName,
    isSameMuscleGroup,
    MuscleGroup,
    sanitizeExerciseGroup
} from '@/constants/ExerciseData';
import {
    DayLog,
    ExerciseLog,
    generateDays,
    MonthlyPlan,
    MONTHS,
    PlannedExercise,
    SessionLog,
    SPLIT_TYPES,
    SplitType,
    TrainingDay
} from '@/constants/PlanTypes';
import { borderRadius, Colors, MuscleGroupColors, Spacing, Typography } from '@/constants/theme';
import { usePlans } from '@/context/PlanContext';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { API_HOST } from '@/services/api';
import { showToast } from '@/services/toast';
import { formatToLocalISO } from '@/services/dateUtils';
import { isExternalVideoLink, isValidWebUrl, normalizeVideoLink } from '@/services/videoLinks';
import { SafeVideo } from '@/components/SafeVideo';
import { ExternalVideoCard } from '@/components/ExternalVideoCard';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    ArrowLeft,
    ArrowRight,
    ArrowUpDown,
    CalendarDays,
    Check,
    ChevronDown,
    ChevronUp,
    ChevronsUp,
    Copy,
    Info,
    Layers,
    Link2,
    Mic,
    Minus,
    Pencil,
    Plus,
    RefreshCw,
    Search,
    Trash2,
    User,
    Users,
    X
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    SectionList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    Linking
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';


// ─── Wizard Steps ─────────────────────────────────────────────────────────────

type WizardStep = 1 | 2 | 3 | 4;

const STEP_TITLES: Record<WizardStep, string> = {
    1: 'Mes y Frecuencia',
    2: 'Tipo de Split',
    3: 'Configurar Días',
    4: 'Elegir Ejercicios',
};

// ─── Step Indicator ───────────────────────────────────────────────────────────

const StepIndicator = ({ current, total }: { current: number; total: number }) => {
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [colors, mode]);
    return (
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
};

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
}) => {
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [colors, mode]);
    return (
        <View style={styles.stepper}>
            <Text style={styles.stepperLabel}>{label}</Text>
            <View style={styles.stepperControls}>
                <TouchableOpacity
                    style={[styles.stepperBtn, value <= min && styles.stepperBtnDisabled]}
                    onPress={onDec}
                    disabled={value <= min}
                >
                    <Minus size={12} color={value <= min ? colors.border : colors.text} />
                </TouchableOpacity>
                <Text style={styles.stepperValue}>{value}</Text>
                <TouchableOpacity
                    style={[styles.stepperBtn, value >= max && styles.stepperBtnDisabled]}
                    onPress={onInc}
                    disabled={value >= max}
                >
                    <Plus size={12} color={value >= max ? colors.border : colors.text} />
                </TouchableOpacity>
            </View>
        </View>
    );
};

// ─── Plan Card (saved plans) ──────────────────────────────────────────────────

const PlanCard = ({
    plan,
    onDelete,
    onSaveLog,
    onEdit,
    onDuplicate,
}: {
    plan: MonthlyPlan;
    onDelete: (id: string) => void;
    onSaveLog: (planId: string, log: DayLog) => Promise<void>;
    onEdit: (plan: MonthlyPlan) => void;
    onDuplicate: (plan: MonthlyPlan) => void;
}) => {
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [colors, mode]);
    const { currentUser } = useUser();
    const { allExercises: contextExercises } = usePlans();
    const [expanded, setExpanded] = useState(false);
    const [activeDayIdx, setActiveDayIdx] = useState<number | null>(null);
    const [expandedSessionNum, setExpandedSessionNum] = useState<number | null>(null);
    const [logData, setLogData] = useState<Record<string, { reps: string; weight: string }[]>>({});
    const [sessionComment, setSessionComment] = useState('');
    const [justSaved, setJustSaved] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const isCoach = currentUser?.role === 'coach';
    const isIndependent = currentUser?.role === 'independiente';
    const isClientOfThisPlan = (currentUser?.role === 'client' || isIndependent) && String(plan.assignedClientId) === String(currentUser.id);
    // If it's a coach and the plan is assigned to someone else (a client), it's read only.
    // Also, if it's a client but the plan is not theirs (shouldn't happen with current API), it's read only.
    const isReadOnly = isCoach && String(plan.assignedClientId) !== String(currentUser?.id);
    const isLogReadOnly = true;

    // Get assigned client name
    const { clients } = useUser();
    const clientName = isCoach && plan.assignedClientId && plan.assignedClientId !== currentUser?.id
        ? clients.find(c => c.id === plan.assignedClientId)?.name
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

    const saveCurrentLog = async () => {
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
            date: formatToLocalISO(new Date()),
            exercises,
            comment: sessionComment.trim() || undefined,
        };

        setIsSaving(true);
        try {
            await onSaveLog(plan.id, {
                dayNumber: day.dayNumber,
                sessions: [newSession],
            });
            setLogData(initEmptyForm(day)); // Reset form after saving
            setSessionComment(''); // Clear comment after saving
            setJustSaved(true);
        } finally {
            setIsSaving(false);
        }
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
                        <CalendarDays size={18} color="#38BDF8" />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.planCardTitle}>
                            {plan.month} {plan.year}
                        </Text>
                        <Text style={styles.planCardSub}>
                            {plan.daysPerWeek} días/sem · {plan.splitType} · {totalExercises} ejercicios
                        </Text>
                        {clientName && (
                            <Text style={[styles.planCardSub, { color: '#38BDF8', marginTop: 2, fontWeight: '600' }]}>
                                👤 {clientName}
                            </Text>
                        )}
                        {Object.keys(planVolumes).length > 0 && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                                {Object.entries(planVolumes).map(([g, vol]) => (
                                    <View key={g} style={{ backgroundColor: (MuscleGroupColors[g] || '#2563EB') + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                                        <Text style={{ color: MuscleGroupColors[g] || '#38BDF8', fontSize: 10, fontWeight: '600' }}>
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
                    {(isCoach || (isIndependent && String(plan.assignedClientId) === String(currentUser?.id))) && (
                        <>
                            <TouchableOpacity
                                style={styles.copyBtn}
                                onPress={() => onDuplicate(plan)}
                            >
                                <Copy size={14} color="#A855F7" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.editBtn}
                                onPress={() => onEdit(plan)}
                            >
                                <Pencil size={14} color="#38BDF8" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.deleteBtn}
                                onPress={() => {
                                    showToast.confirm(
                                        'Eliminar Plan de Entrenamiento',
                                        `¿Estás seguro de que deseas eliminar el plan "${plan.month} ${plan.year}"${clientName ? ` de ${clientName}` : ''}? Esta acción no se puede deshacer.`,
                                        [
                                            {
                                                text: 'Eliminar Plan',
                                                style: 'destructive',
                                                onPress: () => onDelete(plan.id),
                                            },
                                            {
                                                text: 'Cancelar',
                                                style: 'cancel',
                                            }
                                        ]
                                    );
                                }}
                            >
                                <Trash2 size={14} color="#EF4444" />
                            </TouchableOpacity>
                        </>
                    )}
                    {expanded ? (
                        <ChevronUp size={16} color="#94A3B8" />
                    ) : (
                        <ChevronDown size={16} color="#94A3B8" />
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
                                                    <Check size={10} color="#FFFFFF" strokeWidth={3} />
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
                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                                        <Text style={styles.sessionHistoryDate}>
                                                                            {formatSessionDate(session.date)}
                                                                        </Text>
                                                                        {session.duration != null && (
                                                                            <Text style={{ fontSize: 11, color: Colors.primary, fontWeight: '700' }}>
                                                                                • {session.duration} min
                                                                            </Text>
                                                                        )}
                                                                    </View>
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

                                                            {/* Preview de Video del ejercicio en el plan */}
                                                            {(pe.videoUrl || pe.exercise.videoUrl) ? (
                                                                (() => {
                                                                    const vUrl = pe.videoUrl || pe.exercise.videoUrl!;
                                                                    return isExternalVideoLink(vUrl) ? (
                                                                        <ExternalVideoCard
                                                                            url={vUrl}
                                                                            style={{ width: '100%', height: 160, borderRadius: 12, marginTop: 10 }}
                                                                        />
                                                                    ) : null;
                                                                })()
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
                                                                        keyboardType="decimal-pad"
                                                                        value={setLog.reps}
                                                                        onChangeText={(v) => updateLogField(pe.exercise.id, setIdx, 'reps', v)}
                                                                    />
                                                                    <TextInput
                                                                        style={[styles.logInput, { color: '#FFFFFF' }]}
                                                                        placeholder="0"
                                                                        placeholderTextColor={Colors.border}
                                                                        keyboardType="decimal-pad"
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

                                                    <TouchableOpacity style={[styles.saveLogBtn, isSaving && { opacity: 0.7 }]} onPress={saveCurrentLog} disabled={isSaving}>
                                                        {isSaving ? (
                                                            <ActivityIndicator color="#000" size="small" />
                                                        ) : (
                                                            <>
                                                                <Check size={16} color="#000" />
                                                                <Text style={styles.saveLogBtnText}>Guardar Registro</Text>
                                                            </>
                                                        )}
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
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [colors, mode]);
    const { muscleGroups } = usePlans();
    const [name, setName] = useState('');
    const [equipment, setEquipment] = useState('');
    const [description, setDescription] = useState('');
    const [videoLink, setVideoLink] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<string>(defaultGroup);

    useEffect(() => {
        if (defaultGroup) setSelectedGroup(defaultGroup);
    }, [defaultGroup]);

    const handleNameChange = (val: string) => {
        setName(val);
        const inferred = inferMuscleGroupFromName(val);
        if (inferred) {
            setSelectedGroup(inferred);
        }
    };

    const reset = () => { setName(''); setEquipment(''); setDescription(''); setVideoLink(''); setSelectedGroup(defaultGroup); };

    const handleAdd = () => {
        if (!name.trim()) {
            Alert.alert('Nombre requerido', 'Ingresa un nombre para el ejercicio.');
            return;
        }
        if (videoLink.trim() && !isValidWebUrl(videoLink)) {
            Alert.alert('Link inválido', 'Ingresa un enlace válido (YouTube, Instagram, TikTok, etc.).');
            return;
        }
        const effectiveGroup = sanitizeExerciseGroup(name.trim(), selectedGroup);
        const ex: Exercise = {
            id: `custom-${Date.now()}`,
            name: name.trim(),
            muscleGroup: effectiveGroup,
            equipment: equipment.trim() || 'Peso corporal',
            description: description.trim() || 'Ejercicio personalizado.',
            primaryMuscles: [effectiveGroup],
            secondaryMuscles: [],
            benefits: [],
            level: 'Principiante',
            isCustom: true,
            videoUrl: videoLink.trim() ? normalizeVideoLink(videoLink) : undefined,
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
                    onChangeText={handleNameChange}
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
                <View style={[styles.quickAddInput, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 0 }]}>
                    <Link2 size={16} color={videoLink ? Colors.primary : Colors.textMuted} />
                    <TextInput
                        style={{ flex: 1, color: Colors.text, paddingVertical: 10 }}
                        placeholder="Link de video (YouTube, Instagram...)"
                        placeholderTextColor={Colors.textMuted}
                        value={videoLink}
                        onChangeText={setVideoLink}
                        autoCapitalize="none"
                        autoCorrect={false}
                        keyboardType="url"
                    />
                    {videoLink.length > 0 && (
                        <TouchableOpacity onPress={() => setVideoLink('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <X size={14} color={Colors.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.quickAddActions}>
                    <TouchableOpacity style={styles.quickAddCancel} onPress={onClose}>
                        <Text style={styles.quickAddCancelText}>Cancelar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.quickAddBtn} onPress={handleAdd}>
                        <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
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

    // If muscle was not explicitly spoken, infer from exercise name or existing exercise
    if (!muscleMatch) {
        if (foundExercise?.muscleGroup) {
            muscleGroup = foundExercise.muscleGroup;
        } else {
            const inferred = inferMuscleGroupFromName(exerciseName);
            if (inferred) {
                muscleGroup = inferred;
            }
        }
    }

    // Always sanitize to prevent contradictions (e.g. Bicep exercise on a Quad day)
    muscleGroup = sanitizeExerciseGroup(exerciseName, muscleGroup);

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
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [colors, mode]);
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
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.pickerOverlay}>
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
                                        backgroundColor: '#2563EB',
                                        padding: 16,
                                        borderRadius: 14,
                                        marginTop: 20,
                                        flexDirection: 'row',
                                        justifyContent: 'center',
                                        alignItems: 'center'
                                    }}
                                    onPress={handleProcess}
                                >
                                    <Mic size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
                                    <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 }}>Procesar Texto</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <ScrollView showsVerticalScrollIndicator={false}>
                                <Text style={{ color: Colors.text, fontSize: 16, fontWeight: 'bold', marginBottom: 16 }}>
                                    Verifica y edita si es necesario:
                                </Text>

                                <Text style={{ color: Colors.textMuted, marginBottom: 4, fontSize: 12 }}>Grupo Muscular</Text>
                                <TextInput
                                    style={{ backgroundColor: '#080F1E', color: '#FFF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', marginBottom: 12 }}
                                    value={parsedData.exercise.muscleGroup}
                                    onChangeText={v => setParsedData({ ...parsedData, exercise: { ...parsedData.exercise, muscleGroup: v } })}
                                />

                                <Text style={{ color: Colors.textMuted, marginBottom: 4, fontSize: 12 }}>Nombre del Ejercicio</Text>
                                <TextInput
                                    style={{ backgroundColor: '#080F1E', color: '#FFF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', marginBottom: 12 }}
                                    value={parsedData.exercise.name}
                                    onChangeText={v => setParsedData({ ...parsedData, exercise: { ...parsedData.exercise, name: v } })}
                                />

                                <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: Colors.textMuted, marginBottom: 4, fontSize: 12 }}>Series</Text>
                                        <TextInput
                                            style={{ backgroundColor: '#080F1E', color: '#38BDF8', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', fontWeight: '700' }}
                                            value={String(parsedData.sets)}
                                            keyboardType="decimal-pad"
                                            onChangeText={v => setParsedData({ ...parsedData, sets: parseInt(v) || 0 })}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: Colors.textMuted, marginBottom: 4, fontSize: 12 }}>Min Reps</Text>
                                        <TextInput
                                            style={{ backgroundColor: '#080F1E', color: '#FFF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B' }}
                                            value={String(parsedData.minReps)}
                                            keyboardType="decimal-pad"
                                            onChangeText={v => setParsedData({ ...parsedData, minReps: parseInt(v) || 0 })}
                                        />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={{ color: Colors.textMuted, marginBottom: 4, fontSize: 12 }}>Max Reps</Text>
                                        <TextInput
                                            style={{ backgroundColor: '#080F1E', color: '#FFF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B' }}
                                            value={String(parsedData.maxReps)}
                                            keyboardType="decimal-pad"
                                            onChangeText={v => setParsedData({ ...parsedData, maxReps: parseInt(v) || 0 })}
                                        />
                                    </View>
                                </View>

                                <Text style={{ color: Colors.textMuted, marginBottom: 4, fontSize: 12 }}>Instrucción / Comentario</Text>
                                <TextInput
                                    style={{ backgroundColor: '#080F1E', color: '#FFF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1E293B', marginBottom: 20 }}
                                    value={parsedData.instruction}
                                    onChangeText={v => setParsedData({ ...parsedData, instruction: v })}
                                />

                                <TouchableOpacity
                                    style={{ backgroundColor: '#2563EB', padding: 16, borderRadius: 14, alignItems: 'center' }}
                                    onPress={handleConfirm}
                                >
                                    <Text style={{ color: '#FFFFFF', fontWeight: 'bold', fontSize: 16 }}>Confirmar y Añadir</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    style={{ padding: 16, alignItems: 'center', marginTop: 8 }}
                                    onPress={() => setParsedData(null)}
                                >
                                    <Text style={{ color: '#38BDF8', fontSize: 14, fontWeight: '600' }}>Reintentar dictado</Text>
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
    const insets = useSafeAreaInsets();
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [colors, mode]);
    const { allExercises } = usePlans();
    const [filterGroup, setFilterGroup] = useState<string | 'Todos'>('Todos');
    const [searchQuery, setSearchQuery] = useState('');
    const [showQuickAdd, setShowQuickAdd] = useState(false);
    const [detailExercise, setDetailExercise] = useState<Exercise | null>(null);

    const available = useMemo(() => {
        let list = allExercises;

        if (filterGroup !== 'Todos') {
            list = list.filter((e) => {
                const effectiveGroup = sanitizeExerciseGroup(e.name, e.muscleGroup);
                if (isSameMuscleGroup(effectiveGroup, filterGroup)) {
                    return true;
                }

                // If effectiveGroup is from a conflicting category (e.g. Bicep/Tricep vs Quad/Ham/Glute),
                // prevent leakage via primaryMuscles tags
                const isArm = isSameMuscleGroup(effectiveGroup, 'Bícep') || isSameMuscleGroup(effectiveGroup, 'Trícep');
                const isLegFilter = isSameMuscleGroup(filterGroup, 'Cuádriceps') || isSameMuscleGroup(filterGroup, 'Isquios') || isSameMuscleGroup(filterGroup, 'Glúteos');
                if (isArm && isLegFilter) return false;

                const isLeg = isSameMuscleGroup(effectiveGroup, 'Cuádriceps') || isSameMuscleGroup(effectiveGroup, 'Isquios') || isSameMuscleGroup(filterGroup, 'Glúteos');
                const isArmFilter = isSameMuscleGroup(filterGroup, 'Bícep') || isSameMuscleGroup(filterGroup, 'Trícep');
                if (isLeg && isArmFilter) return false;

                const pm = e.primaryMuscles as string[] | string | undefined | null;
                const hasPrimaryGroup = Array.isArray(pm)
                    ? pm.some(m => isSameMuscleGroup(m, filterGroup))
                    : typeof pm === 'string' && isSameMuscleGroup(pm, filterGroup);

                return Boolean(hasPrimaryGroup);
            });
        }

        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            list = list.filter((e) =>
                e.name.toLowerCase().includes(q) ||
                (e.equipment && e.equipment.toLowerCase().includes(q)) ||
                (e.muscleGroup && e.muscleGroup.toLowerCase().includes(q))
            );
        }

        return list;
    }, [filterGroup, searchQuery, allExercises]);

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
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
                                <Plus size={14} color="#38BDF8" />
                                <Text style={styles.pickerNewBtnText}>Nuevo</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={styles.pickerClose} onPress={onClose}>
                                <X size={18} color="#94A3B8" />
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

                    {/* Search Input */}
                    <View style={styles.pickerSearchContainer}>
                        <Search size={16} color="#64748B" style={styles.pickerSearchIcon} />
                        <TextInput
                            style={styles.pickerSearchInput}
                            placeholder="Buscar ejercicio o equipo..."
                            placeholderTextColor="#64748B"
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            clearButtonMode="while-editing"
                            autoCorrect={false}
                        />
                        {searchQuery.length > 0 && (
                            <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <X size={16} color="#94A3B8" />
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Filter by muscle group */}
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={styles.pickerFilters}
                        contentContainerStyle={styles.pickerFiltersContent}
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
                        {muscleGroups.map((g: string) => {
                            const isGroupActive = isSameMuscleGroup(filterGroup, g);
                            return (
                                <TouchableOpacity
                                    key={g}
                                    style={[
                                        styles.pickerChip,
                                        isGroupActive && {
                                            backgroundColor: (MuscleGroupColors[g] || '#2563EB') + '22',
                                            borderColor: MuscleGroupColors[g] || '#2563EB',
                                        },
                                    ]}
                                    onPress={() => setFilterGroup(g)}
                                >
                                    <Text
                                        style={[
                                            styles.pickerChipText,
                                            isGroupActive && {
                                                color: MuscleGroupColors[g] || '#38BDF8',
                                            },
                                        ]}
                                    >
                                        {g}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {available.length === 0 ? (
                        <View style={styles.pickerEmptyContainer}>
                            <Text style={styles.pickerEmptyText}>No se encontraron ejercicios</Text>
                        </View>
                    ) : (
                        <FlatList
                            data={available}
                            keyExtractor={(item) => item.id}
                            style={{ flex: 1 }}
                            contentContainerStyle={{ paddingBottom: 16 }}
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
                                                            MuscleGroupColors[item.muscleGroup] || '#2563EB',
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
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                                            {item.videoUrl && (
                                                <TouchableOpacity
                                                    onPress={(e) => { e.stopPropagation(); setDetailExercise(item); }}
                                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                                >
                                                    <Info size={18} color="#38BDF8" />
                                                </TouchableOpacity>
                                            )}
                                            <View
                                                style={[
                                                    styles.exerciseCheckbox,
                                                    selected && styles.exerciseCheckboxActive,
                                                ]}
                                            >
                                                {selected && <Check size={12} color="#FFFFFF" strokeWidth={3} />}
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    )}

                    {/* Botón para terminar selección y cerrar tarjeta */}
                    <View style={[styles.pickerFooter, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                        <TouchableOpacity
                            style={styles.pickerDoneBtn}
                            onPress={onClose}
                            activeOpacity={0.8}
                        >
                            <Check size={18} color="#FFFFFF" strokeWidth={2.5} />
                            <Text style={styles.pickerDoneBtnText}>
                                {selectedIds.size > 0
                                    ? `Terminar Selección (${selectedIds.size})`
                                    : 'Terminar Selección'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>

            {/* Exercise Detail Modal */}
            <Modal visible={!!detailExercise} animationType="fade" transparent onRequestClose={() => setDetailExercise(null)}>
                <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
                    <View style={{ width: '100%', backgroundColor: '#0f1a28', borderRadius: 16, padding: 20, alignItems: 'center' }}>
                        <TouchableOpacity style={{ position: 'absolute', top: 15, right: 15, zIndex: 10 }} onPress={() => setDetailExercise(null)}>
                            <X size={24} color="#fff" />
                        </TouchableOpacity>

                        <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 15, textAlign: 'center', paddingHorizontal: 20 }}>
                            {detailExercise?.name}
                        </Text>

                        {detailExercise?.videoUrl && (
                            isExternalVideoLink(detailExercise.videoUrl) ? (
                                <ExternalVideoCard
                                    url={detailExercise.videoUrl}
                                    style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12 }}
                                />
                            ) : detailExercise.videoUrl.toLowerCase().includes('.mp4') ? (
                                <SafeVideo
                                    sourceUri={detailExercise.videoUrl.startsWith('http') ? detailExercise.videoUrl : `${API_HOST}${detailExercise.videoUrl.startsWith('/') ? '' : '/'}${detailExercise.videoUrl}`}
                                    style={{ width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: '#000' }}
                                    contentFit="contain"
                                />
                            ) : (
                                <Image
                                    source={{ uri: detailExercise.videoUrl.startsWith('http') ? detailExercise.videoUrl : `${API_HOST}${detailExercise.videoUrl.startsWith('/') ? '' : '/'}${detailExercise.videoUrl}` }}
                                    style={{ width: '100%', aspectRatio: 1, borderRadius: 12, backgroundColor: '#000' }}
                                    contentFit="contain"
                                />
                            )
                        )}

                        {!!detailExercise?.description && (
                            <ScrollView style={{ maxHeight: 100, marginTop: 15, width: '100%' }}>
                                <Text style={{ color: '#A0ABC0', textAlign: 'center' }}>
                                    {detailExercise.description}
                                </Text>
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>
        </Modal>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function PlanScreen() {
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [colors, mode]);
    const { plans, setPlans, addPlan, deletePlan, saveLog, updatePlan, allExercises, muscleGroups, refreshMetadata, fetchPlans, addExercise } = usePlans();

    // User context for role-based features
    const { currentUser, clients, refreshProfile } = useUser();

    const [refreshing, setRefreshing] = useState(false);

    const handleRefresh = useCallback(async () => {
        setRefreshing(true);
        await Promise.all([fetchPlans(), refreshMetadata(), refreshProfile()]);
        setRefreshing(false);
    }, [fetchPlans, refreshMetadata, refreshProfile]);

    useEffect(() => {
        refreshProfile().catch(() => {});
    }, [refreshProfile]);

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
    const [optionsPush, setOptionsPush] = useState<{
        title: string;
        message: string;
        isDestructive?: boolean;
        options: Array<{
            text: string;
            style?: 'default' | 'destructive' | 'cancel';
            onPress: () => void;
        }>;
    } | null>(null);
    const [implicitClient, setImplicitClient] = useState(false);
    const [filterClientId, setFilterClientId] = useState<string | null>(null);
    const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
    const [planNotes, setPlanNotes] = useState<string>('');
    const [planComment, setPlanComment] = useState<string>('');

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
            if (!day.exercises) return;
            day.exercises.forEach(pe => {
                if (!pe || !pe.exercise) return;
                const fullEx = allExercises.find(e => e.id === pe.exercise.id);
                const g = (fullEx?.muscleGroup && fullEx.muscleGroup !== 'Core')
                    ? fullEx.muscleGroup
                    : (pe.exercise?.muscleGroup || 'Otro');
                vols[g] = (vols[g] || 0) + (pe.sets ? Number(pe.sets) : 0);
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
        } else if (currentUser?.role === 'independiente') {
            setAssignedClientId(currentUser.id);
            setImplicitClient(true);
        } else {
            setAssignedClientId(null);
            setImplicitClient(false);
        }
        setShowWizard(true);
    };

    const [clientSearchQuery, setClientSearchQuery] = useState('');

    const isCoach = currentUser?.role === 'coach';
    const isIndependent = currentUser?.role === 'independiente';
    const isClient = currentUser?.role === 'client';
    const canManagePlans = isCoach || isIndependent;

    // Filter plans: Coach sees all plans they created, or plans belonging to them
    // Client only sees plans assigned to them
    const filteredPlans = useMemo(() => {
        if (!currentUser) return [];
        let list = [...plans];
        if (isCoach) {
            if (filterClientId) {
                // Show specific client's plans (from Clients section)
                list = list.filter(p => String(p.assignedClientId) === String(filterClientId));
            }
            if (clientSearchQuery.trim()) {
                const query = clientSearchQuery.toLowerCase().trim();
                list = list.filter(p => {
                    const assignedClient = clients.find(c => String(c.id) === String(p.assignedClientId));
                    const clientName = assignedClient?.name?.toLowerCase() || '';
                    const clientUsername = assignedClient?.username?.toLowerCase() || '';
                    const monthYear = `${p.month} ${p.year}`.toLowerCase();
                    const splitType = p.splitType?.toLowerCase() || '';
                    const isSelf = String(p.assignedClientId) === String(currentUser.id);
                    const selfName = currentUser.name?.toLowerCase() || 'yo';

                    return (
                        clientName.includes(query) ||
                        clientUsername.includes(query) ||
                        monthYear.includes(query) ||
                        splitType.includes(query) ||
                        (isSelf && (selfName.includes(query) || 'yo'.includes(query)))
                    );
                });
            }
        } else if (isIndependent) {
            list = list.filter(p => String(p.assignedClientId) === String(currentUser.id) || String(p.userId) === String(currentUser.id));
        } else {
            list = list.filter(p => String(p.assignedClientId) === String(currentUser.id));
        }

        return list.sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return MONTHS.indexOf(b.month as any) - MONTHS.indexOf(a.month as any);
        });
    }, [plans, currentUser?.id, currentUser?.name, isCoach, filterClientId, clientSearchQuery, clients]);

    // Build filter options for coaches with full client names and search filter
    const clientFilterOptions = useMemo(() => {
        if (!isCoach || !currentUser) return [];
        const options: { id: string | null; label: string }[] = [
            { id: null, label: 'Todos' },
            { id: currentUser.id, label: 'Yo (Mis Planes)' },
        ];
        const query = clientSearchQuery.toLowerCase().trim();
        const seenIds = new Set<string>([String(currentUser.id)]);

        // 1. Añadir todos los clientes registrados (tengan o no tengan planes todavía)
        clients.forEach(c => {
            if (seenIds.has(String(c.id))) return;
            seenIds.add(String(c.id));
            if (
                !query ||
                c.name.toLowerCase().includes(query) ||
                (c.username && c.username.toLowerCase().includes(query))
            ) {
                options.push({ id: String(c.id), label: c.name || 'Cliente' });
            }
        });

        // 2. Añadir también cualquier usuario que tenga un plan asignado existente
        plans.forEach(p => {
            if (p.assignedClientId && !seenIds.has(String(p.assignedClientId))) {
                seenIds.add(String(p.assignedClientId));
                const name = (p as any).assignedClient?.name || `Cliente #${p.assignedClientId}`;
                if (!query || name.toLowerCase().includes(query)) {
                    options.push({ id: String(p.assignedClientId), label: name });
                }
            }
        });

        return options;
    }, [isCoach, currentUser, clients, clientSearchQuery, plans]);

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

        const executeSave = async (notifyWhatsApp: boolean) => {
            try {
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
                        comment: planComment,
                    });
                } else {
                    const newPlan: Omit<MonthlyPlan, 'id'> = {
                        assignedClientId: isIndependent ? currentUser?.id : (assignedClientId || currentUser?.id || 'coach-1'),
                        month: selectedMonth,
                        year: selectedYear,
                        daysPerWeek,
                        splitType,
                        days: processedDays,
                        notes: planNotes,
                        comment: planComment,
                    };
                    await addPlan(newPlan);
                }

                if (notifyWhatsApp) {
                    const client = clients.find(c => c.id === assignedClientId);
                    const clientName = client ? client.name : 'Cliente';
                    const message = editingPlanId 
                        ? `¡Hola ${clientName}! Tu plan de entrenamiento ha sido actualizado. Revísalo en la AppAF.`
                        : `¡Hola ${clientName}! Se ha creado un nuevo plan de entrenamiento para ti en la AppAF.`;
                    const encodedMessage = encodeURIComponent(message);
                    const url = (client && client.phone)
                        ? `whatsapp://send?phone=${client.phone}&text=${encodedMessage}`
                        : `whatsapp://send?text=${encodedMessage}`;

                    Linking.openURL(url).catch(() => {
                        Alert.alert('Error', 'No se pudo abrir WhatsApp');
                    });
                }

                setShowWizard(false);
                setStep(1);
                setAssignedClientId(null);
                setEditingPlanId(null);
                setPlanNotes('');
                setPlanComment('');
            } catch (error) {
                console.error("Error saving plan:", error);
                Alert.alert("Error", "No se pudo guardar el plan");
            }
        };

        if (isCoach && assignedClientId) {
            Alert.alert(
                editingPlanId ? 'Actualizar Plan' : 'Guardar Plan',
                '¿Deseas avisar a este cliente por WhatsApp o simplemente guardar la información?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Solo guardar', onPress: () => executeSave(false) },
                    { text: 'Avisar por WhatsApp', onPress: () => executeSave(true) }
                ]
            );
        } else {
            executeSave(false);
        }
    };
    const closeWizard = () => {
        setShowWizard(false);
        setEditingPlanId(null);
        setPlanNotes('');
        setPlanComment('');
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
        setPlanComment(plan.comment || '');
        setStep(1); // Go to step 1 so they can edit comments
        setImplicitClient(false);
        setShowWizard(true);
    };

    const handleDuplicatePlan = (plan: MonthlyPlan) => {
        showToast.confirm(
            'Duplicar Plan',
            `¿Deseas duplicar este plan como base para crear uno nuevo? Podrás modificar el mes, cliente y especificaciones antes de guardar.`,
            [
                {
                    text: 'Duplicar y modificar',
                    style: 'default',
                    onPress: () => {
                        setEditingPlanId(null); // Modo crear nuevo plan (no sobrescribir el existente)
                        setAssignedClientId(plan.assignedClientId || null);
                        setSelectedMonth(plan.month as typeof MONTHS[number]);
                        setSelectedYear(plan.year);
                        setDaysPerWeek(plan.daysPerWeek);
                        setSplitType(plan.splitType);
                        const clonedDays = (plan.days || []).map(day => ({
                            ...day,
                            id: undefined,
                            exercises: (day.exercises || []).map(pe => ({
                                ...pe,
                                id: undefined,
                            }))
                        }));
                        setTrainingDays(clonedDays);
                        setPlanNotes(plan.notes || '');
                        setPlanComment(plan.comment || '');
                        setStep(1);
                        setImplicitClient(false);
                        setShowWizard(true);
                        showToast.info('Puedes modificar las especificaciones del nuevo plan');
                    }
                },
                {
                    text: 'Cancelar',
                    style: 'cancel'
                }
            ]
        );
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
            const exists = day.muscleGroups.some((g: string) => g.trim().toLowerCase() === group.trim().toLowerCase());
            if (exists) {
                day.muscleGroups = day.muscleGroups.filter((g: string) => g.trim().toLowerCase() !== group.trim().toLowerCase());
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
        const num = value === '' ? '' : (parseInt(value, 10) || 0);
        setTrainingDays((prev) => {
            const updated = [...prev];
            const day = { ...updated[dayIdx] };
            day.exercises = day.exercises.map((pe) => {
                if (pe.exercise.id === exerciseId) {
                    return { ...pe, [field]: num as any };
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

    const updateVideoUrl = (dayIdx: number, exerciseId: string, videoUrl: string) => {
        setTrainingDays((prev) => {
            const updated = [...prev];
            const day = { ...updated[dayIdx] };
            day.exercises = day.exercises.map((pe) => {
                if (pe.exercise.id === exerciseId) {
                    return { ...pe, videoUrl: videoUrl ? normalizeVideoLink(videoUrl) : undefined };
                }
                return pe;
            });
            updated[dayIdx] = day;
            return updated;
        });
    };



    // ── Render Wizard Steps ─────────────────────────────────────────────────

    const SUPERSET_COLORS = ['#FF3B30', '#34C759', '#007AFF', '#FF9500', '#AF52DE'];

    const groupExercises = (exercises: PlannedExercise[]) => {
        const result: { isGroup: boolean; id: string; items: PlannedExercise[] }[] = [];
        const seenSupersets = new Set<string>();
        exercises.forEach(pe => {
            if (pe.supersetId) {
                if (!seenSupersets.has(pe.supersetId)) {
                    seenSupersets.add(pe.supersetId);
                    const groupItems = exercises.filter(e => e.supersetId === pe.supersetId);
                    result.push({ isGroup: true, id: pe.supersetId, items: groupItems });
                }
            } else {
                result.push({ isGroup: false, id: pe.id || String(pe.exercise.id), items: [pe] });
            }
        });
        return result;
    };

    // Sort exercises in a day by biomechanical priority tier (Compuestos -> Accesorios -> Aislamiento)
    const sortDayByPriority = (dayIdx: number) => {
        const day = trainingDays[dayIdx];
        if (!day || day.exercises.length < 2) return;

        const groups = groupExercises(day.exercises);
        groups.sort((a, b) => {
            const tierA = Math.min(...a.items.map(pe => getExercisePriority(pe.exercise).tier));
            const tierB = Math.min(...b.items.map(pe => getExercisePriority(pe.exercise).tier));
            if (tierA !== tierB) return tierA - tierB;
            return a.items[0].exercise.name.localeCompare(b.items[0].exercise.name);
        });

        const flattened: PlannedExercise[] = [];
        groups.forEach(g => {
            flattened.push(...g.items);
        });

        const newDays = [...trainingDays];
        newDays[dayIdx].exercises = flattened;
        setTrainingDays(newDays);
        showToast.success('Orden sugerido aplicado (Compuestos primero)');
    };

    // Move an entire routine block (single exercise or superset) to top, up, down, or specific position
    const moveRoutineBlock = (dayIdx: number, fromBlockIdx: number, target: 'top' | 'up' | 'down' | number) => {
        const day = trainingDays[dayIdx];
        if (!day || day.exercises.length < 2) return;

        const blocks = groupExercises(day.exercises);
        if (fromBlockIdx < 0 || fromBlockIdx >= blocks.length) return;

        let toIdx = fromBlockIdx;
        if (target === 'top') {
            toIdx = 0;
        } else if (target === 'up') {
            toIdx = Math.max(0, fromBlockIdx - 1);
        } else if (target === 'down') {
            toIdx = Math.min(blocks.length - 1, fromBlockIdx + 1);
        } else if (typeof target === 'number') {
            toIdx = Math.max(0, Math.min(blocks.length - 1, target));
        }

        if (toIdx === fromBlockIdx) return;

        const newBlocks = [...blocks];
        const [moved] = newBlocks.splice(fromBlockIdx, 1);
        newBlocks.splice(toIdx, 0, moved);

        const flattened: PlannedExercise[] = [];
        newBlocks.forEach(b => {
            flattened.push(...b.items);
        });

        const newDays = [...trainingDays];
        newDays[dayIdx].exercises = flattened;
        setTrainingDays(newDays);
    };

    // Reorder inside a superset (swap exercise order within biserie/triserie)
    const moveInsideSuperset = (dayIdx: number, supersetId: string, fromInnerIdx: number, direction: 'up' | 'down') => {
        const day = trainingDays[dayIdx];
        if (!day) return;

        const supersetItems = day.exercises.filter(pe => pe.supersetId === supersetId);
        const toInnerIdx = direction === 'up' ? fromInnerIdx - 1 : fromInnerIdx + 1;
        if (toInnerIdx < 0 || toInnerIdx >= supersetItems.length) return;

        const reordered = [...supersetItems];
        const [moved] = reordered.splice(fromInnerIdx, 1);
        reordered.splice(toInnerIdx, 0, moved);

        let reorderedCursor = 0;
        const newExercises = day.exercises.map(pe => {
            if (pe.supersetId === supersetId) {
                const item = reordered[reorderedCursor];
                reorderedCursor++;
                return item;
            }
            return pe;
        });

        const newDays = [...trainingDays];
        newDays[dayIdx].exercises = newExercises;
        setTrainingDays(newDays);
    };

    // Prompt user to pick custom priority/position for a block using setOptionsPush
    const promptMoveBlock = (dayIdx: number, blockIdx: number, totalBlocks: number, blockName: string) => {
        const options: Array<{
            text: string;
            style?: 'default' | 'destructive' | 'cancel';
            onPress: () => void;
        }> = [];

        if (blockIdx > 0) {
            options.push({
                text: '⭐ Mover al inicio de la rutina (#1)',
                style: 'default',
                onPress: () => {
                    moveRoutineBlock(dayIdx, blockIdx, 'top');
                    setOptionsPush(null);
                    showToast.success(`"${blockName}" movido al inicio`);
                }
            });
        }

        for (let i = 0; i < totalBlocks; i++) {
            if (i !== blockIdx) {
                const posNum = i + 1;
                const label = i === 0
                    ? 'Posición #1 (Inicio de rutina)'
                    : i === totalBlocks - 1
                        ? `Posición #${posNum} (Final de rutina)`
                        : `Posición #${posNum}`;
                options.push({
                    text: label,
                    style: 'default',
                    onPress: () => {
                        moveRoutineBlock(dayIdx, blockIdx, i);
                        setOptionsPush(null);
                        showToast.success(`"${blockName}" movido a posición #${posNum}`);
                    }
                });
            }
        }

        options.push({
            text: 'Cancelar',
            style: 'cancel',
            onPress: () => setOptionsPush(null)
        });

        setOptionsPush({
            title: 'Prioridad en la Rutina',
            message: `¿En qué posición deseas colocar "${blockName}"? (Actualmente en #${blockIdx + 1})`,
            options
        });
    };

    const renderStep1 = () => (
        <ScrollView
            style={styles.stepContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            {/* Target Selection */}
            {currentUser?.role === 'coach' && !implicitClient && (
                <View style={styles.wizardSection}>
                    <Text style={styles.stepSectionHeader}>🎯 ¿Para quién es este plan?</Text>
                    <View style={styles.clientSelector}>
                        <TouchableOpacity
                            style={[styles.clientChip, !assignedClientId && styles.clientChipActive]}
                            onPress={() => setAssignedClientId(null)}
                            activeOpacity={0.7}
                        >
                            <User size={14} color={!assignedClientId ? '#FFFFFF' : '#94A3B8'} />
                            <Text style={[styles.clientChipText, !assignedClientId && styles.clientChipTextActive]}>Para mí</Text>
                        </TouchableOpacity>

                        {clients.map((client: any) => (
                            <TouchableOpacity
                                key={client.id}
                                style={[styles.clientChip, assignedClientId === client.id && styles.clientChipActive]}
                                onPress={() => setAssignedClientId(client.id)}
                                activeOpacity={0.7}
                            >
                                <Users size={14} color={assignedClientId === client.id ? '#FFFFFF' : '#94A3B8'} />
                                <Text style={[styles.clientChipText, assignedClientId === client.id && styles.clientChipTextActive]}>
                                    {client.name?.split(' ')[0] || 'Cliente'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            )}

            <Text style={styles.stepSectionHeader}>📅 Mes y Año</Text>
            <View style={styles.monthGrid}>
                {MONTHS.map((m) => (
                    <TouchableOpacity
                        key={m}
                        style={[
                            styles.monthChip,
                            selectedMonth === m && styles.monthChipActive,
                        ]}
                        activeOpacity={0.7}
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

            <Text style={[styles.stepSectionHeader, { marginTop: 22 }]}>
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
                        activeOpacity={0.7}
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
            <View style={styles.daysHintCard}>
                <Text style={styles.daysHintText}>
                    ⚡ {daysPerWeek} {daysPerWeek === 1 ? 'DÍA' : 'DÍAS'} POR SEMANA · {selectedMonth.toUpperCase()} {selectedYear}
                </Text>
            </View>

            <Text style={[styles.stepSectionHeader, { marginTop: 22 }]}>
                📝 Comentario General del Plan (Opcional)
            </Text>
            <TextInput
                style={styles.planCommentInput}
                placeholder="Ej. 'Fase de hipertrofia con énfasis en piernas y hombros...'"
                placeholderTextColor="#64748B"
                value={planComment}
                onChangeText={setPlanComment}
                multiline
            />
            <View style={{ height: 24 }} />
        </ScrollView>
    );

    const renderStep2 = () => (
        <ScrollView style={styles.stepContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.stepSectionHeader}>⚡ Elige tu tipo de Split</Text>
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
                        <View style={[styles.splitIconBox, splitType === s.type && styles.splitIconBoxActive]}>
                            <Text style={styles.splitIcon}>{s.icon}</Text>
                        </View>
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
                                <Check size={14} color="#FFFFFF" strokeWidth={3} />
                            </View>
                        )}
                    </View>
                    <Text style={styles.splitDesc}>{s.description}</Text>
                </TouchableOpacity>
            ))}
            <View style={{ height: 24 }} />
        </ScrollView>
    );

    const renderStep3 = () => (
        <ScrollView
            style={styles.stepContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            <Text style={styles.stepSectionHeader}>📋 Configura tus Días</Text>
            {trainingDays.map((day, idx) => (
                <View key={day.dayNumber} style={styles.configDayCard}>
                    <View style={styles.configDayHeaderRow}>
                        <View>
                            <Text style={styles.configDayTag}>DÍA #{day.dayNumber}</Text>
                            <Text style={styles.configDayTitle}>{day.label}</Text>
                        </View>
                    </View>
                    <View style={styles.configMuscleGrid}>
                        {muscleGroups.map((g: string) => {
                            const active = day.muscleGroups.some((mg: string) => mg.trim().toLowerCase() === g.trim().toLowerCase());
                            const color = MuscleGroupColors[g] || '#2563EB';
                            return (
                                <View key={g} style={{ flexDirection: 'column', alignItems: 'center', marginBottom: 8, marginHorizontal: 4 }}>
                                    <TouchableOpacity
                                        style={[
                                            styles.configMuscleChip,
                                            active && {
                                                backgroundColor: color + '25',
                                                borderColor: color,
                                            },
                                            { marginHorizontal: 0, marginBottom: 0 }
                                        ]}
                                        activeOpacity={0.7}
                                        onPress={() => toggleMuscleGroup(idx, g)}
                                    >
                                        <Text
                                            style={[
                                                styles.configMuscleText,
                                                active && { color, fontWeight: '800' },
                                            ]}
                                        >
                                            {g}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </View>
                    <View style={{ marginTop: 14 }}>
                        <TextInput
                            style={styles.dayCommentInput}
                            placeholder="Comentario adicional para el día (opcional)..."
                            placeholderTextColor="#64748B"
                            value={day.comment || ''}
                            onChangeText={(val) => {
                                setTrainingDays(prev => {
                                    const newDays = [...prev];
                                    newDays[idx] = { ...newDays[idx], comment: val };
                                    return newDays;
                                });
                            }}
                            multiline
                        />
                    </View>
                </View>
            ))}
            <View style={{ height: 24 }} />
        </ScrollView>
    );

    const renderStep4 = () => (
        <ScrollView
            style={styles.stepContent}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
        >
            <Text style={styles.stepSectionHeader}>💪 Elige Ejercicios por Día</Text>

            {/* Real-time volume tracking */}
            {Object.keys(currentVolumes).length > 0 && (
                <View style={styles.volumeCard}>
                    <Text style={styles.volumeCardTitle}>VOLUMEN TOTAL (SERIES POR SEMANA)</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        {Object.entries(currentVolumes).map(([g, vol]) => (
                            <View key={g} style={[styles.volumeTag, { borderColor: (MuscleGroupColors[g] || '#2563EB') + '55' }]}>
                                <Text style={{ color: MuscleGroupColors[g] || '#38BDF8', fontSize: 12, fontWeight: '800' }}>
                                    {g}: <Text style={{ color: '#FFFFFF' }}>{vol}</Text>
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}

            <Text style={styles.stepHint}>
                Ajusta series y repeticiones manualmente para cada movimiento
            </Text>
            {trainingDays.map((day, idx) => (
                <View key={day.dayNumber} style={styles.exerciseDayCard}>
                    <View style={styles.exerciseDayHeader}>
                        <TouchableOpacity
                            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
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
                            activeOpacity={0.7}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={styles.exerciseDayTag}>DÍA #{day.dayNumber}</Text>
                                <Text style={styles.exerciseDayTitle}>{day.label}</Text>
                                {day.muscleGroups && day.muscleGroups.length > 0 && (
                                    <Text style={styles.exerciseDayMuscles}>
                                        {day.muscleGroups.join(' • ')}
                                    </Text>
                                )}
                            </View>
                            {collapsedDays.has(day.dayNumber) ? <ChevronDown size={18} color="#94A3B8" /> : <ChevronUp size={18} color="#94A3B8" />}
                        </TouchableOpacity>
                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                            <TouchableOpacity
                                style={styles.deleteDayBtn}
                                onPress={() => {
                                    setOptionsPush({
                                        title: 'Eliminar Día',
                                        message: `¿Seguro que deseas eliminar ${day.label || 'este día'} de entrenamiento?`,
                                        isDestructive: true,
                                        options: [
                                            {
                                                text: 'Eliminar Día',
                                                style: 'destructive',
                                                onPress: () => {
                                                    setTrainingDays(prev => {
                                                        const newDays = prev.filter((_, i) => i !== idx).map((d, i) => ({ ...d, dayNumber: i + 1, label: `Día ${i + 1}` }));
                                                        setDaysPerWeek(newDays.length);
                                                        return newDays;
                                                    });
                                                    setOptionsPush(null);
                                                }
                                            },
                                            {
                                                text: 'Cancelar',
                                                style: 'cancel',
                                                onPress: () => setOptionsPush(null)
                                            }
                                        ]
                                    });
                                }}
                            >
                                <Trash2 size={14} color="#EF4444" />
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.addExerciseBtn}
                                onPress={() => setPickerDayIdx(idx)}
                                activeOpacity={0.8}
                            >
                                <Plus size={14} color="#FFFFFF" />
                                <Text style={styles.addExerciseBtnText}>Añadir</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    {!collapsedDays.has(day.dayNumber) && (
                        <>
                            {/* Quick Muscle Group Selector for this day */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -12, paddingHorizontal: 12, marginBottom: 12, marginTop: 4 }}>
                                {muscleGroups.map((g: string) => {
                                    const active = day.muscleGroups.some((mg: string) => mg.trim().toLowerCase() === g.trim().toLowerCase());
                                    const color = MuscleGroupColors[g] || '#2563EB';
                                    return (
                                        <TouchableOpacity
                                            key={g}
                                            style={[
                                                styles.configMuscleChip,
                                                active && {
                                                    backgroundColor: color + '25',
                                                    borderColor: color,
                                                },
                                                { paddingVertical: 4, paddingHorizontal: 10, minWidth: 0, marginRight: 8, marginBottom: 0 }
                                            ]}
                                            onPress={() => toggleMuscleGroup(idx, g)}
                                        >
                                            <Text style={[styles.configMuscleText, active && { color, fontWeight: '800' }, { fontSize: 11 }]}>{g}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            {/* Barra de Herramientas del Día: Sugerir orden por prioridad biomecánica */}
                            {day.exercises.length > 1 && (
                                <View style={styles.dayControlsBar}>
                                    <TouchableOpacity
                                        style={styles.dayControlBtn}
                                        onPress={() => sortDayByPriority(idx)}
                                        activeOpacity={0.7}
                                    >
                                        <ArrowUpDown size={13} color="#38BDF8" />
                                        <Text style={styles.dayControlBtnText}>Sugerir Orden Biomecánico</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {day.exercises.length > 0 ? (
                                <View style={styles.selectedExercisesList}>
                                    {(() => {
                                        const renderPe = (
                                            pe: PlannedExercise,
                                            isInsideGroup: boolean,
                                            indexInGroup: number,
                                            uniqueKey: string,
                                            groupIdx: number,
                                            totalBlocks: number,
                                            supersetId?: string,
                                            groupTotalItems?: number
                                        ) => {
                                            return (
                                                <View key={uniqueKey} style={[
                                                    styles.selectedExercise,
                                                    isInsideGroup && indexInGroup === 0 ? { borderTopLeftRadius: 0, borderTopRightRadius: 0, marginTop: 0 } : {},
                                                    isInsideGroup && indexInGroup > 0 ? { borderTopLeftRadius: 0, borderTopRightRadius: 0, borderTopWidth: 0, marginTop: 0 } : {}
                                                ]}>
                                                    {/* Grouping Checkbox */}
                                                    {groupingDayIdx === idx && (
                                                        <TouchableOpacity
                                                            style={[styles.groupCheckboxPlan, selectedForGroup.includes(pe.exercise.id) && styles.groupCheckboxPlanActive]}
                                                            onPress={() => setSelectedForGroup(prev =>
                                                                prev.includes(pe.exercise.id)
                                                                    ? prev.filter(id => id !== pe.exercise.id)
                                                                    : [...prev, pe.exercise.id]
                                                            )}
                                                        >
                                                            <View style={[styles.checkboxInner, selectedForGroup.includes(pe.exercise.id) && { backgroundColor: '#2563EB' }]} />
                                                        </TouchableOpacity>
                                                    )}

                                                    <View>
                                                        <View style={styles.selExInfo}>
                                                            {/* Badge de prioridad/posición para ejercicio individual */}
                                                            {!isInsideGroup && (
                                                                <TouchableOpacity
                                                                    style={styles.blockPosBadge}
                                                                    onPress={() => promptMoveBlock(idx, groupIdx, totalBlocks, pe.exercise.name)}
                                                                    activeOpacity={0.7}
                                                                >
                                                                    <Text style={styles.blockPosBadgeText}>#{groupIdx + 1}</Text>
                                                                </TouchableOpacity>
                                                            )}

                                                            <View
                                                                style={[
                                                                    styles.selExDot,
                                                                    {
                                                                        backgroundColor:
                                                                            MuscleGroupColors[allExercises.find(e => e.id === pe.exercise.id)?.muscleGroup && allExercises.find(e => e.id === pe.exercise.id)?.muscleGroup !== 'Core' ? allExercises.find(e => e.id === pe.exercise.id)!.muscleGroup : pe.exercise.muscleGroup] || '#2563EB',
                                                                    },
                                                                ]}
                                                            />
                                                            <View style={{ flex: 1, justifyContent: 'center' }}>
                                                                <Text style={styles.selExName} numberOfLines={1}>
                                                                    {pe.exercise.name}
                                                                </Text>
                                                                <View style={styles.selExSubRow}>
                                                                    {/* Badge de prioridad: Accesorio / Compuesto / Aislamiento */}
                                                                    {(() => {
                                                                        const prio = getExercisePriority(pe.exercise);
                                                                        return (
                                                                            <View style={[styles.prioBadgeSmall, { backgroundColor: prio.badgeColor + '18', borderColor: prio.badgeColor + '50', marginLeft: 0 }]}>
                                                                                <Text style={[styles.prioBadgeSmallText, { color: prio.badgeColor }]}>{prio.tag}</Text>
                                                                            </View>
                                                                        );
                                                                    })()}

                                                                    {/* Si está dentro de biserie/triserie: flechas arriba/abajo dentro del grupo */}
                                                                    {isInsideGroup && groupTotalItems !== undefined && groupTotalItems > 1 && (
                                                                        <View style={styles.subRowArrows}>
                                                                            <TouchableOpacity
                                                                                onPress={() => supersetId && moveInsideSuperset(idx, supersetId, indexInGroup, 'up')}
                                                                                disabled={indexInGroup <= 0}
                                                                                style={{ padding: 2, opacity: indexInGroup <= 0 ? 0.25 : 0.85 }}
                                                                                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                                                            >
                                                                                <ChevronUp size={14} color={mode === 'dark' ? '#94A3B8' : '#64748B'} />
                                                                            </TouchableOpacity>
                                                                            <TouchableOpacity
                                                                                onPress={() => supersetId && moveInsideSuperset(idx, supersetId, indexInGroup, 'down')}
                                                                                disabled={indexInGroup >= groupTotalItems - 1}
                                                                                style={{ padding: 2, opacity: indexInGroup >= groupTotalItems - 1 ? 0.25 : 0.85 }}
                                                                                hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                                                            >
                                                                                <ChevronDown size={14} color={mode === 'dark' ? '#94A3B8' : '#64748B'} />
                                                                            </TouchableOpacity>
                                                                        </View>
                                                                    )}

                                                                    {/* Si es ejercicio individual: flechas arriba/abajo de bloque y botón "Al inicio" */}
                                                                    {!isInsideGroup && groupingDayIdx !== idx && totalBlocks > 1 && (
                                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                                            <View style={styles.subRowArrows}>
                                                                                <TouchableOpacity
                                                                                    onPress={() => moveRoutineBlock(idx, groupIdx, 'up')}
                                                                                    disabled={groupIdx <= 0}
                                                                                    style={{ padding: 2, opacity: groupIdx <= 0 ? 0.25 : 0.85 }}
                                                                                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                                                                >
                                                                                    <ChevronUp size={14} color={mode === 'dark' ? '#94A3B8' : '#64748B'} />
                                                                                </TouchableOpacity>
                                                                                <TouchableOpacity
                                                                                    onPress={() => moveRoutineBlock(idx, groupIdx, 'down')}
                                                                                    disabled={groupIdx >= totalBlocks - 1}
                                                                                    style={{ padding: 2, opacity: groupIdx >= totalBlocks - 1 ? 0.25 : 0.85 }}
                                                                                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                                                                >
                                                                                    <ChevronDown size={14} color={mode === 'dark' ? '#94A3B8' : '#64748B'} />
                                                                                </TouchableOpacity>
                                                                            </View>

                                                                            {groupIdx > 0 && (
                                                                                <TouchableOpacity
                                                                                    style={styles.blockMoveToTopBtnSingle}
                                                                                    onPress={() => {
                                                                                        moveRoutineBlock(idx, groupIdx, 'top');
                                                                                        showToast.success(`"${pe.exercise.name}" movido al inicio`);
                                                                                    }}
                                                                                    activeOpacity={0.7}
                                                                                >
                                                                                    <ChevronsUp size={11} color={mode === 'dark' ? '#38BDF8' : '#2563EB'} />
                                                                                    <Text style={styles.blockMoveToTopTextSingle}>Al inicio</Text>
                                                                                </TouchableOpacity>
                                                                            )}
                                                                        </View>
                                                                    )}
                                                                </View>
                                                            </View>

                                                            <View style={[{ flexDirection: 'row', gap: 6, alignItems: 'center' }, groupingDayIdx === idx && { marginRight: 32 }]}>

                                                                <TouchableOpacity
                                                                    onPress={() => {
                                                                        setOptionsPush({
                                                                            title: 'Cambiar Ejercicio',
                                                                            message: `¿Deseas reemplazar "${pe.exercise.name}" por otro ejercicio?`,
                                                                            isDestructive: false,
                                                                            options: [
                                                                                {
                                                                                    text: 'Elegir nuevo ejercicio',
                                                                                    style: 'default',
                                                                                    onPress: () => {
                                                                                        setOptionsPush(null);
                                                                                        setReplaceExerciseInfo({ dayIdx: idx, peId: pe.exercise.id });
                                                                                        setPickerDayIdx(idx);
                                                                                    }
                                                                                },
                                                                                {
                                                                                    text: 'Cancelar',
                                                                                    style: 'cancel',
                                                                                    onPress: () => setOptionsPush(null)
                                                                                }
                                                                            ]
                                                                        });
                                                                    }}
                                                                    style={styles.changeExBtn}
                                                                >
                                                                    <RefreshCw size={11} color="#38BDF8" style={{ marginRight: 4 }} />
                                                                    <Text style={styles.changeExBtnText}>Cambiar</Text>
                                                                </TouchableOpacity>
                                                                {groupingDayIdx !== idx && (
                                                                    <TouchableOpacity
                                                                        onPress={() => {
                                                                            setOptionsPush({
                                                                                title: 'Eliminar Ejercicio',
                                                                                message: `¿Estás seguro de que deseas eliminar "${pe.exercise.name}"?`,
                                                                                isDestructive: true,
                                                                                options: [
                                                                                    {
                                                                                        text: 'Eliminar Ejercicio',
                                                                                        style: 'destructive',
                                                                                        onPress: () => {
                                                                                            toggleExercise(idx, pe.exercise);
                                                                                            setOptionsPush(null);
                                                                                        }
                                                                                    },
                                                                                    {
                                                                                        text: 'Cancelar',
                                                                                        style: 'cancel',
                                                                                        onPress: () => setOptionsPush(null)
                                                                                    }
                                                                                ]
                                                                            });
                                                                        }}
                                                                        style={styles.removeExBtn}
                                                                    >
                                                                        <Trash2 size={13} color="#EF4444" />
                                                                    </TouchableOpacity>
                                                                )}
                                                            </View>
                                                        </View>

                                                        <View style={styles.setsRepsRow}>
                                                            <View style={styles.repsInputWrapper}>
                                                                <Text style={styles.stepperLabel}>SERIES</Text>
                                                                <TextInput
                                                                    style={styles.repsInput}
                                                                    value={String(pe.sets ?? '')}
                                                                    onChangeText={(val) => updateExNumField(idx, pe.exercise.id, 'sets', val)}
                                                                    keyboardType="decimal-pad"
                                                                    placeholder="3"
                                                                    placeholderTextColor="#64748B"
                                                                />
                                                            </View>

                                                            <View style={styles.repsRangeContainer}>
                                                                <View style={styles.repsInputWrapper}>
                                                                    <Text style={styles.stepperLabel}>MIN REPS</Text>
                                                                    <TextInput
                                                                        style={styles.repsInput}
                                                                        value={String(pe.minReps ?? '')}
                                                                        onChangeText={(val) => updateExNumField(idx, pe.exercise.id, 'minReps', val)}
                                                                        keyboardType="decimal-pad"
                                                                        placeholder="8"
                                                                        placeholderTextColor="#64748B"
                                                                    />
                                                                </View>
                                                                <Text style={styles.rangeDash}>-</Text>
                                                                <View style={styles.repsInputWrapper}>
                                                                    <Text style={styles.stepperLabel}>MAX REPS</Text>
                                                                    <TextInput
                                                                        style={styles.repsInput}
                                                                        value={String(pe.maxReps ?? '')}
                                                                        onChangeText={(val) => updateExNumField(idx, pe.exercise.id, 'maxReps', val)}
                                                                        keyboardType="decimal-pad"
                                                                        placeholder="12"
                                                                        placeholderTextColor="#64748B"
                                                                    />
                                                                </View>
                                                            </View>
                                                        </View>

                                                        <TextInput
                                                            style={styles.instructionInput}
                                                            value={pe.instruction}
                                                            onChangeText={(val) => updateInstruction(idx, pe.exercise.id, val)}
                                                            placeholder="Instrucciones u objetivo (opcional)..."
                                                            placeholderTextColor="#64748B"
                                                            multiline
                                                        />

                                                        {/* Video Link personalizado para este ejercicio en el plan */}
                                                        <View style={styles.planVideoLinkContainer}>
                                                            <Link2 size={15} color={pe.videoUrl ? '#38BDF8' : '#64748B'} />
                                                            <TextInput
                                                                style={styles.planVideoLinkInput}
                                                                value={pe.videoUrl || ''}
                                                                onChangeText={(val) => updateVideoUrl(idx, pe.exercise.id, val)}
                                                                placeholder="Link de video (YouTube, Instagram...)"
                                                                placeholderTextColor="#64748B"
                                                                autoCapitalize="none"
                                                                autoCorrect={false}
                                                                keyboardType="url"
                                                            />
                                                            {!!pe.videoUrl && (
                                                                <TouchableOpacity
                                                                    onPress={() => updateVideoUrl(idx, pe.exercise.id, '')}
                                                                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                                                >
                                                                    <X size={14} color="#94A3B8" />
                                                                </TouchableOpacity>
                                                            )}
                                                        </View>

                                                        {!!pe.videoUrl && isExternalVideoLink(pe.videoUrl) && isValidWebUrl(pe.videoUrl) && (
                                                            <ExternalVideoCard
                                                                url={pe.videoUrl}
                                                                style={{ width: '100%', height: 140, borderRadius: 10, marginTop: 8 }}
                                                            />
                                                        )}
                                                    </View>
                                                </View>
                                            );
                                        };

                                        const renderGroupItem = (
                                            group: { isGroup: boolean; id: string; items: PlannedExercise[] },
                                            groupIdx: number,
                                            totalBlocks: number,
                                            keyPrefix: string = ''
                                        ) => {
                                            if (group.isGroup) {
                                                const groupColor = SUPERSET_COLORS[groupIdx % SUPERSET_COLORS.length];
                                                const label = group.items.length >= 3 ? 'TRISERIE ' + (groupIdx + 1) : 'BISERIE ' + (groupIdx + 1);
                                                return (
                                                    <View key={keyPrefix + 'group-' + group.id + '-' + groupIdx} style={[styles.supersetWrapperPlan, { borderLeftColor: groupColor }]}>
                                                        <View style={[styles.supersetHeaderPlanNew, { backgroundColor: groupColor }]}>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                                                                {/* Badge de prioridad/posición para la biserie/triserie */}
                                                                <TouchableOpacity
                                                                    style={[styles.blockPosBadge, styles.blockPosBadgeSuperset]}
                                                                    onPress={() => promptMoveBlock(idx, groupIdx, totalBlocks, label)}
                                                                    activeOpacity={0.7}
                                                                >
                                                                    <Text style={[styles.blockPosBadgeText, styles.blockPosBadgeTextSuperset]}>#{groupIdx + 1}</Text>
                                                                </TouchableOpacity>
                                                                <Text style={styles.supersetLabelText}>{label}</Text>

                                                                {/* Botón directo "Al inicio" para la biserie/triserie completa */}
                                                                {groupIdx > 0 && (
                                                                    <TouchableOpacity
                                                                        style={styles.blockMoveToTopBtn}
                                                                        onPress={() => {
                                                                            moveRoutineBlock(idx, groupIdx, 'top');
                                                                            showToast.success(`"${label}" movida al inicio`);
                                                                        }}
                                                                        activeOpacity={0.7}
                                                                    >
                                                                        <ChevronsUp size={12} color="#FFFFFF" />
                                                                        <Text style={styles.blockMoveToTopText}>Al inicio</Text>
                                                                    </TouchableOpacity>
                                                                )}
                                                            </View>

                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                                {/* Flechas subir/bajar la agrupación completa */}
                                                                {totalBlocks > 1 && (
                                                                    <View style={styles.blockArrowsRow}>
                                                                        <TouchableOpacity
                                                                            onPress={() => moveRoutineBlock(idx, groupIdx, 'up')}
                                                                            disabled={groupIdx <= 0}
                                                                            style={[styles.blockArrowBtn, groupIdx <= 0 && { opacity: 0.25 }]}
                                                                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                                                        >
                                                                            <ChevronUp size={16} color="#FFFFFF" />
                                                                        </TouchableOpacity>
                                                                        <TouchableOpacity
                                                                            onPress={() => moveRoutineBlock(idx, groupIdx, 'down')}
                                                                            disabled={groupIdx >= totalBlocks - 1}
                                                                            style={[styles.blockArrowBtn, groupIdx >= totalBlocks - 1 && { opacity: 0.25 }]}
                                                                            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                                                                        >
                                                                            <ChevronDown size={16} color="#FFFFFF" />
                                                                        </TouchableOpacity>
                                                                    </View>
                                                                )}

                                                                <TouchableOpacity onPress={() => {
                                                                    const newDays = [...trainingDays];
                                                                    newDays[idx].exercises = newDays[idx].exercises.map(ex => {
                                                                        if (ex.supersetId === group.id) {
                                                                            return { ...ex, supersetId: undefined };
                                                                        }
                                                                        return ex;
                                                                    });
                                                                    setTrainingDays(newDays);
                                                                }}>
                                                                    <Text style={styles.ungroupTextPlanSmall}>Desagrupar</Text>
                                                                </TouchableOpacity>
                                                            </View>
                                                        </View>
                                                        {group.items.map((pe, i) => (
                                                            <React.Fragment key={keyPrefix + 'pe-' + group.id + '-' + pe.exercise.id + '-' + i}>
                                                                {i > 0 && <View style={styles.exerciseSeparatorInGroup} />}
                                                                {renderPe(pe, true, i, keyPrefix + 'pe-' + group.id + '-' + pe.exercise.id + '-' + i, groupIdx, totalBlocks, group.id, group.items.length)}
                                                            </React.Fragment>
                                                        ))}
                                                    </View>
                                                );
                                            } else {
                                                return (
                                                    <React.Fragment key={keyPrefix + 'group-single-' + group.items[0].exercise.id + '-' + groupIdx}>
                                                        {groupIdx > 0 && <View style={styles.exerciseSeparator} />}
                                                        {renderPe(group.items[0], false, 0, keyPrefix + 'pe-single-' + group.items[0].exercise.id + '-' + groupIdx, groupIdx, totalBlocks)}
                                                    </React.Fragment>
                                                );
                                            }
                                        };

                                        const blocks = groupExercises(day.exercises);
                                        return blocks.map((group, groupIdx) =>
                                            renderGroupItem(group, groupIdx, blocks.length)
                                        );
                                    })()}
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
                                                style={[styles.confirmGroupBtn, selectedForGroup.length >= 2 && selectedForGroup.length <= 3 ? { backgroundColor: '#2563EB' } : { backgroundColor: '#0D172E', borderWidth: 1, borderColor: '#1E293B' }]}
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
                                                <Text style={[styles.confirmGroupText, selectedForGroup.length >= 2 && selectedForGroup.length <= 3 ? { color: '#FFFFFF' } : { color: '#94A3B8' }]}>
                                                    Agrupar ({selectedForGroup.length})
                                                </Text>
                                            </TouchableOpacity>
                                        </>
                                    ) : (
                                        <TouchableOpacity style={styles.startGroupBtn} onPress={() => { setGroupingDayIdx(idx); setSelectedForGroup([]); }}>
                                            <Plus size={16} color="#38BDF8" />
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
                style={styles.addDayBtn}
                onPress={() => {
                    setTrainingDays(prev => {
                        const newDays = [...prev, { dayNumber: prev.length + 1, label: `Día ${prev.length + 1}`, muscleGroups: [], targetVolumes: {}, exercises: [] }];
                        setDaysPerWeek(newDays.length);
                        return newDays;
                    });
                }}
                activeOpacity={0.8}
            >
                <Plus size={16} color="#38BDF8" style={{ marginRight: 6 }} />
                <Text style={styles.addDayBtnText}>Añadir Día de Entrenamiento</Text>
            </TouchableOpacity>


            <View style={{ height: 20 }} />
        </ScrollView>
    );




    return (
        <KeyboardAvoidingView
            style={[styles.container, { backgroundColor: '#060B14' }]}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
        >
            {/* Top Screen Header */}
            <View style={styles.screenHeader}>
                <View>
                    <Text style={styles.screenTag}>GESTIÓN MENSUAL</Text>
                    <Text style={styles.screenTitle}>Planes de Entrenamiento</Text>
                </View>
            </View>

            {/* Client Search & Filter Chips for Coach */}
            {isCoach && (
                <View style={{ marginBottom: 4, marginTop: 4 }}>
                    <View style={{ paddingHorizontal: Spacing.md, marginBottom: 10 }}>
                        <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            backgroundColor: '#0D172E',
                            borderRadius: 14,
                            paddingHorizontal: 14,
                            height: 44,
                            borderWidth: 1,
                            borderColor: '#1E293B'
                        }}>
                            <Search size={18} color="#64748B" />
                            <TextInput
                                style={{ flex: 1, marginLeft: 10, color: '#F8FAFC', fontSize: 14 }}
                                placeholder="Buscar cliente por nombre..."
                                placeholderTextColor="#64748B"
                                value={clientSearchQuery}
                                onChangeText={(text) => {
                                    setClientSearchQuery(text);
                                    if (filterClientId) setFilterClientId(null);
                                }}
                            />
                            {clientSearchQuery.length > 0 && (
                                <TouchableOpacity onPress={() => setClientSearchQuery('')}>
                                    <X size={16} color="#94A3B8" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {clients.length > 0 && (
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
                </View>
            )}

            {/* Plans List */}
            {filteredPlans.length === 0 ? (
                <ScrollView
                    contentContainerStyle={styles.emptyContainer}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2563EB" colors={['#2563EB']} />
                    }
                >
                    <View style={styles.emptyIconContainer}>
                        <CalendarDays size={36} color="#64748B" />
                    </View>
                    <Text style={styles.emptyText}>Sin planes todavía</Text>
                    <Text style={styles.emptySubtext}>
                        {filterClientId && String(filterClientId) !== String(currentUser?.id)
                            ? `Aún no hay planes creados para ${clients.find(c => String(c.id) === String(filterClientId))?.name || 'este cliente'}. Toca "Crear Plan" para asignarle su primer plan.`
                            : isCoach
                                ? 'Crea el primer plan mensual para tus clientes'
                                : isIndependent
                                    ? 'Crea tu primer plan mensual de entrenamiento'
                                    : 'Aún no tienes un plan asignado. Contacta a tu coach.'}
                    </Text>
                    {canManagePlans && (
                        <TouchableOpacity style={styles.emptyCta} onPress={openWizard}>
                            <Plus size={16} color="#FFFFFF" />
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
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#2563EB" colors={['#2563EB']} />
                    }
                    renderItem={({ item }) => (
                        <PlanCard plan={item} onDelete={deletePlan} onSaveLog={saveLog} onEdit={openEditWizard} onDuplicate={handleDuplicatePlan} />
                    )}
                />
            )}

            {/* FAB - Create Plan */}
            {canManagePlans && (
                <TouchableOpacity
                    style={styles.fab}
                    onPress={openWizard}
                    activeOpacity={0.85}
                >
                    <Plus size={24} color="#FFFFFF" />
                </TouchableOpacity>
            )}

            {/* ── Wizard Modal ─────────────────────────────────────────────────── */}
            <Modal visible={showWizard} animationType="slide" transparent>
                <View style={styles.wizardOverlay}>
                    <KeyboardAvoidingView
                        style={styles.wizardContent}
                        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    >
                        <View style={styles.wizardHandle} />

                        {/* Wizard Header */}
                        <View style={styles.wizardHeader}>
                            <View>
                                <Text style={styles.wizardTitle}>{STEP_TITLES[step]}</Text>
                                <Text style={styles.wizardStep}>Paso {step} de 4</Text>
                            </View>
                            <TouchableOpacity style={styles.wizardClose} onPress={closeWizard}>
                                <X size={18} color="#94A3B8" />
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
                                    <ArrowLeft size={16} color="#94A3B8" />
                                    <Text style={styles.backBtnText}>Atrás</Text>
                                </TouchableOpacity>
                            ) : (
                                <View />
                            )}
                            {step < 4 ? (
                                <TouchableOpacity style={styles.nextBtn} onPress={goNext}>
                                    <Text style={styles.nextBtnText}>Siguiente</Text>
                                    <ArrowRight size={16} color="#FFFFFF" />
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity style={styles.nextBtn} onPress={createPlan}>
                                    <Check size={16} color="#FFFFFF" strokeWidth={2.5} />
                                    <Text style={styles.nextBtnText}>{editingPlanId ? 'Actualizar Plan' : 'Guardar Plan'}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </KeyboardAvoidingView>

                    {/* Options Push Bottom Sheet */}
                    {optionsPush && (
                        <View style={styles.optionsPushBackdrop}>
                            <TouchableOpacity
                                style={StyleSheet.absoluteFill}
                                activeOpacity={1}
                                onPress={() => setOptionsPush(null)}
                            />
                            <View style={styles.optionsPushCard}>
                                <View style={styles.optionsPushHandle} />
                                <View style={styles.optionsPushHeader}>
                                    <View style={[styles.optionsPushIconWrap, optionsPush.isDestructive && styles.optionsPushIconWrapDestructive]}>
                                        {optionsPush.isDestructive ? (
                                            <Trash2 size={22} color={Colors.danger} />
                                        ) : (
                                            <RefreshCw size={22} color={Colors.primary} />
                                        )}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.optionsPushTitle}>{optionsPush.title}</Text>
                                        <Text style={styles.optionsPushMessage}>{optionsPush.message}</Text>
                                    </View>
                                </View>

                                <View style={styles.optionsPushActions}>
                                    {optionsPush.options.map((opt, i) => {
                                        const isDestructive = opt.style === 'destructive';
                                        const isCancel = opt.style === 'cancel';
                                        return (
                                            <TouchableOpacity
                                                key={i}
                                                style={[
                                                    styles.optionsPushBtn,
                                                    isDestructive && styles.optionsPushBtnDestructive,
                                                    isCancel && styles.optionsPushBtnCancel,
                                                    !isDestructive && !isCancel && styles.optionsPushBtnPrimary,
                                                ]}
                                                onPress={opt.onPress}
                                                activeOpacity={0.8}
                                            >
                                                <Text
                                                    style={[
                                                        styles.optionsPushBtnText,
                                                        isDestructive && styles.optionsPushBtnTextDestructive,
                                                        isCancel && styles.optionsPushBtnTextCancel,
                                                        !isDestructive && !isCancel && styles.optionsPushBtnTextPrimary,
                                                    ]}
                                                >
                                                    {opt.text}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                            </View>
                        </View>
                    )}
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

const getStyles = (colors: any, mode: 'dark' | 'light') => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: mode === 'dark' ? '#060B14' : colors.background,
    },
    screenHeader: {
        paddingHorizontal: Spacing.md,
        paddingTop: 10,
        paddingBottom: 6,
    },
    screenTag: {
        fontSize: 11,
        fontWeight: '800',
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
    },
    screenTitle: {
        fontSize: 26,
        fontWeight: '900',
        color: colors.text,
        letterSpacing: 0.2,
        marginTop: 2,
    },
    clientFilterRow: {
        maxHeight: 48,
        marginBottom: 8,
    },
    clientFilterContent: {
        paddingHorizontal: Spacing.md,
        gap: 8,
        alignItems: 'center',
    },
    clientChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        minWidth: 70,
        alignItems: 'center',
        justifyContent: 'center',
    },
    clientChipActive: {
        backgroundColor: '#2563EB',
        borderColor: mode === 'dark' ? '#38BDF8' : '#2563EB',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.35,
        shadowRadius: 6,
        elevation: 4,
    },
    clientChipText: {
        color: colors.textMuted,
        fontSize: 13,
        fontWeight: '700',
    },
    clientChipTextActive: {
        color: '#FFFFFF',
        fontWeight: '800',
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
        color: colors.text,
        fontSize: 28,
        fontWeight: '900',
        letterSpacing: -0.5,
    },
    subtitle: {
        color: colors.textMuted,
        fontSize: 14,
        marginTop: 4,
    },
    headerBadge: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(37, 99, 235, 0.3)',
    },
    filterBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        marginHorizontal: Spacing.md,
        marginTop: Spacing.sm,
        marginBottom: Spacing.xs,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    filterBannerTextWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    filterBannerText: {
        color: colors.text,
        fontSize: 14,
        fontWeight: '600',
    },
    filterName: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontWeight: '800',
    },
    clearFilterBtn: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: mode === 'dark' ? '#1E293B' : colors.surface_container_low || '#E2E8F0',
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
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        alignSelf: 'flex-start',
    },
    implicitClientName: {
        color: colors.text,
        fontSize: 15,
        fontWeight: '800',
    },

    // ── Empty State ───────────────────────────────────────────────────────
    emptyState: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingBottom: 80,
    },
    emptyIconContainer: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    emptyText: {
        color: colors.text,
        fontSize: 18,
        fontWeight: '800',
    },
    emptySubtext: {
        color: colors.textMuted,
        fontSize: 14,
        marginTop: 6,
        marginBottom: Spacing.lg,
        textAlign: 'center',
    },
    emptyCta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#2563EB',
        paddingHorizontal: 22,
        paddingVertical: 13,
        borderRadius: 14,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 6,
    },
    emptyCtaText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 0.3,
    },

    // ── Plans List ────────────────────────────────────────────────────────
    plansList: {
        padding: Spacing.md,
        paddingBottom: 100,
    },
    planCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        marginBottom: 14,
        overflow: 'hidden',
    },
    planCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
    },
    planCardLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 12,
    },
    planMonthBadge: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: mode === 'dark' ? '#060B14' : colors.surface_container_low || '#F1F5F9',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(37, 99, 235, 0.3)',
    },
    planCardTitle: {
        color: colors.text,
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: 0.2,
    },
    planCardSub: {
        color: colors.textMuted,
        fontSize: 13,
        fontWeight: '600',
        marginTop: 3,
    },
    planCardRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    copyBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: 'rgba(168, 85, 247, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(168, 85, 247, 0.35)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.35)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    editBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(37, 99, 235, 0.35)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    planCardBody: {
        borderTopWidth: 1,
        borderTopColor: mode === 'dark' ? '#1E293B' : colors.border,
        backgroundColor: mode === 'dark' ? '#060B14' : colors.surface_container_low || '#F1F5F9',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    dayRow: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        padding: 14,
        marginBottom: 10,
    },
    dayLabel: {
        color: colors.text,
        fontSize: 15,
        fontWeight: '800',
        marginBottom: 4,
    },
    dayMuscles: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 4,
    },
    miniChip: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    miniChipText: {
        fontSize: 10,
        fontWeight: '800',
    },
    dayExercises: {
        marginTop: 8,
        gap: 3,
    },
    dayExerciseText: {
        color: colors.text,
        fontSize: 12,
        lineHeight: 18,
        fontWeight: '500',
    },
    setsRepsInline: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontWeight: '800',
    },

    // ── Wizard Modal ──────────────────────────────────────────────────────
    wizardOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'flex-end',
    },
    wizardContent: {
        backgroundColor: mode === 'dark' ? '#060B14' : colors.background,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '100%',
        height: '100%',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        paddingTop: Platform.OS === 'ios' ? 44 : 12,
    },
    wizardHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: mode === 'dark' ? '#334155' : colors.border,
        alignSelf: 'center',
        marginTop: 4,
        marginBottom: 12,
    },
    wizardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        paddingHorizontal: 18,
        marginBottom: 14,
    },
    wizardTitle: {
        color: colors.text,
        fontSize: 22,
        fontWeight: '900',
        letterSpacing: 0.2,
    },
    wizardStep: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginTop: 2,
    },
    wizardClose: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // ── Step Indicator ────────────────────────────────────────────────────
    stepIndicator: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 18,
        paddingHorizontal: 18,
    },
    stepDot: {
        flex: 1,
        height: 4,
        borderRadius: 2,
        backgroundColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    stepDotActive: {
        backgroundColor: '#2563EB',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.6,
        shadowRadius: 4,
        elevation: 3,
    },
    stepDotDone: {
        backgroundColor: '#3B82F6',
    },

    // ── Wizard Body ───────────────────────────────────────────────────────
    wizardBody: {
        flex: 1,
        paddingHorizontal: 16,
    },
    readOnlyBadge: {
        backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(0, 0, 0, 0.1)',
    },
    readOnlyText: {
        color: colors.textMuted,
        fontSize: 10,
        fontWeight: '800',
        textTransform: 'uppercase',
    },
    stepContent: {
        flex: 1,
    },
    stepLabel: {
        color: colors.text,
        fontSize: 16,
        fontWeight: '800',
        marginBottom: 14,
    },
    stepHint: {
        color: colors.textMuted,
        fontSize: 13,
        marginBottom: 14,
        marginTop: -4,
        fontWeight: '500',
    },
    stepSectionHeader: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.textMuted,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 10,
    },

    // ── Step 1: Month + Days ──────────────────────────────────────────────
    monthGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    monthChip: {
        width: '23%',
        paddingVertical: 12,
        borderRadius: 12,
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    monthChipActive: {
        backgroundColor: '#2563EB',
        borderColor: mode === 'dark' ? '#38BDF8' : '#2563EB',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 4,
    },
    monthChipText: {
        color: colors.textMuted,
        fontSize: 13,
        fontWeight: '700',
    },
    monthChipTextActive: {
        color: '#FFFFFF',
        fontWeight: '900',
    },
    daysRow: {
        flexDirection: 'row',
        gap: 8,
        justifyContent: 'space-between',
    },
    dayBtn: {
        flex: 1,
        height: 48,
        borderRadius: 12,
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    dayBtnActive: {
        backgroundColor: '#2563EB',
        borderColor: mode === 'dark' ? '#38BDF8' : '#2563EB',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 4,
    },
    dayBtnText: {
        color: colors.textMuted,
        fontSize: 16,
        fontWeight: '800',
    },
    dayBtnTextActive: {
        color: '#FFFFFF',
        fontWeight: '900',
    },
    daysHint: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: 13,
        fontWeight: '700',
        marginTop: 14,
        textAlign: 'center',
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
    },
    daysHintCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginTop: 14,
        alignItems: 'center',
    },
    daysHintText: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.6,
    },
    planCommentInput: {
        backgroundColor: mode === 'dark' ? '#080E1A' : '#FFFFFF',
        color: colors.text,
        borderRadius: 14,
        padding: 14,
        fontSize: 14,
        minHeight: 85,
        textAlignVertical: 'top',
        marginTop: 8,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },

    // ── Step 2: Split Type ────────────────────────────────────────────────
    splitCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderRadius: 18,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    splitCardActive: {
        borderColor: '#2563EB',
        backgroundColor: mode === 'dark' ? '#0F1E3D' : '#EFF6FF',
        borderWidth: 1.5,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 6,
    },
    splitCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 8,
    },
    splitIconBox: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface_container_low || '#F1F5F9',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        alignItems: 'center',
        justifyContent: 'center',
    },
    splitIconBoxActive: {
        borderColor: '#2563EB',
        backgroundColor: mode === 'dark' ? '#132144' : '#DBEAFE',
    },
    splitIcon: {
        fontSize: 20,
    },
    splitLabel: {
        color: colors.text,
        fontSize: 16,
        fontWeight: '800',
        flex: 1,
    },
    splitLabelActive: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
    },
    splitCheck: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#2563EB',
        justifyContent: 'center',
        alignItems: 'center',
    },
    splitDesc: {
        color: colors.textMuted,
        fontSize: 13,
        lineHeight: 18,
        paddingLeft: 52,
    },

    // ── Step 3: Configure Days ────────────────────────────────────────────
    configDayCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderRadius: 18,
        padding: 18,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    configDayHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    configDayTag: {
        fontSize: 10,
        fontWeight: '800',
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    configDayTitle: {
        color: colors.text,
        fontSize: 18,
        fontWeight: '800',
    },
    configMuscleGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    configMuscleChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface_container_low || '#F1F5F9',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    configMuscleText: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '700',
    },
    dayCommentInput: {
        backgroundColor: mode === 'dark' ? '#080E1A' : '#FFFFFF',
        color: colors.text,
        borderRadius: 12,
        padding: 12,
        fontSize: 13,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        borderWidth: 1,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    volumeInput: {
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 8,
        paddingVertical: 4,
        marginTop: 4,
        width: 60,
        textAlign: 'center',
        fontSize: 12,
        backgroundColor: mode === 'dark' ? '#080F1E' : '#FFFFFF',
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
    },

    // ── Step 4: Select Exercises ──────────────────────────────────────────
    volumeCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        padding: 16,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        marginBottom: 16,
    },
    volumeCardTitle: {
        fontSize: 11,
        fontWeight: '800',
        color: colors.textMuted,
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    volumeTag: {
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface_container_low || '#F1F5F9',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
    },
    exerciseDayCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderRadius: 18,
        padding: 16,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    exerciseDayHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    exerciseDayTag: {
        fontSize: 10,
        fontWeight: '800',
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        letterSpacing: 0.8,
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    exerciseDayTitle: {
        color: colors.text,
        fontSize: 18,
        fontWeight: '800',
    },
    exerciseDayMuscles: {
        fontSize: 12,
        color: colors.textMuted,
        fontWeight: '600',
        marginTop: 2,
    },
    deleteDayBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.35)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    addExerciseBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#2563EB',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
    },
    addExerciseBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
        fontWeight: '800',
    },
    noMusclesText: {
        color: colors.textMuted,
        fontSize: 12,
        fontStyle: 'italic',
    },
    noExercisesText: {
        color: colors.textMuted,
        fontSize: 12,
        marginTop: 4,
    },
    selectedExercisesList: {
        gap: 10,
    },
    exerciseSeparator: {
        height: 2,
        backgroundColor: '#2563EB',
        marginVertical: 6,
        borderRadius: 1,
    },
    exerciseSeparatorInGroup: {
        height: 2,
        backgroundColor: '#2563EB',
        marginVertical: 4,
        borderRadius: 1,
        opacity: 0.6,
    },
    selectedExercise: {
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface_container_low || '#F8FAFC',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        padding: 14,
    },
    selExInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    selExDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    selExName: {
        color: colors.text,
        fontSize: 15,
        fontWeight: '800',
    },
    selExSubRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 4,
    },
    subRowArrows: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1,
        backgroundColor: mode === 'dark' ? '#0F172A' : '#F1F5F9',
        borderRadius: 6,
        paddingHorizontal: 3,
        paddingVertical: 1,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : '#E2E8F0',
    },
    changeExBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: mode === 'dark' ? '#132144' : '#EFF6FF',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : '#BFDBFE',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
    },
    changeExBtnText: {
        fontSize: 11,
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontWeight: '700',
    },
    removeExBtn: {
        width: 30,
        height: 30,
        borderRadius: 8,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.35)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // ── Sets / Reps ───────────────────────────────────────────────────────
    setsRepsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        gap: 12,
        marginBottom: 10,
    },
    setsRepsSep: {
        color: colors.textMuted,
        fontSize: 16,
        fontWeight: '700',
    },
    stepper: {
        alignItems: 'center',
    },
    stepperLabel: {
        color: colors.textMuted,
        fontSize: 10,
        fontWeight: '800',
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
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface_container_low || '#E2E8F0',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    stepperBtnDisabled: {
        opacity: 0.4,
    },
    stepperValue: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: 18,
        fontWeight: '800',
        minWidth: 28,
        textAlign: 'center',
    },
    repsInputWrapper: {
        width: 72,
        gap: 4,
    },
    repsRangeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    rangeDash: {
        color: colors.textMuted,
        fontSize: 16,
        fontWeight: '800',
        marginTop: 18,
    },
    repsInput: {
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        backgroundColor: mode === 'dark' ? '#060B14' : '#FFFFFF',
        color: colors.text,
        borderRadius: 8,
        height: 40,
        fontSize: 15,
        fontWeight: '800',
        textAlign: 'center',
    },
    instructionInput: {
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        backgroundColor: mode === 'dark' ? '#060B14' : '#FFFFFF',
        color: colors.text,
        borderRadius: 10,
        padding: 10,
        marginTop: 4,
        minHeight: 52,
        fontSize: 13,
        textAlignVertical: 'top',
    },
    planVideoLinkContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 4,
        marginTop: 8,
        backgroundColor: mode === 'dark' ? '#060B14' : '#FFFFFF',
    },
    planVideoLinkInput: {
        flex: 1,
        color: colors.text,
        fontSize: 13,
        paddingVertical: 6,
    },
    addDayBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        marginVertical: 16,
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        borderRadius: 14,
        paddingHorizontal: 20,
        paddingVertical: 12,
    },
    addDayBtnText: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: 14,
        fontWeight: '700',
    },

    // ── Wizard Footer ─────────────────────────────────────────────────────
    wizardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 18,
        paddingVertical: 14,
        borderTopWidth: 1,
        borderTopColor: mode === 'dark' ? '#1E293B' : colors.border,
        backgroundColor: mode === 'dark' ? '#060B14' : colors.surface,
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: 14,
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface_container_low || '#E2E8F0',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    backBtnText: {
        color: colors.textMuted,
        fontSize: 14,
        fontWeight: '700',
    },
    nextBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 13,
        paddingHorizontal: 24,
        borderRadius: 14,
        backgroundColor: '#2563EB',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
    },
    nextBtnText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 0.5,
    },

    // ── Exercise Picker Modal ─────────────────────────────────────────────
    pickerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'flex-end',
    },
    pickerContent: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '85%',
        minHeight: '60%',
        paddingTop: 12,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    pickerHandle: {
        width: 44,
        height: 4,
        borderRadius: 2,
        backgroundColor: mode === 'dark' ? '#334155' : colors.border,
        alignSelf: 'center',
        marginBottom: 14,
    },
    pickerHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 18,
        marginBottom: 12,
    },
    pickerHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    pickerTitle: {
        color: colors.text,
        fontSize: 18,
        fontWeight: '800',
        letterSpacing: 0.3,
    },
    pickerNewBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: 'rgba(37, 99, 235, 0.4)',
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
    },
    pickerNewBtnText: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: 12,
        fontWeight: '700',
    },
    pickerClose: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface_container_low || '#E2E8F0',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pickerSearchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface_container_low || '#F1F5F9',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        paddingHorizontal: 14,
        marginHorizontal: 16,
        marginBottom: 12,
        height: 46,
    },
    pickerSearchIcon: {
        marginRight: 8,
    },
    pickerSearchInput: {
        flex: 1,
        color: colors.text,
        fontSize: 14,
        fontWeight: '500',
        paddingVertical: 0,
    },
    pickerEmptyContainer: {
        flex: 1,
        padding: 32,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pickerEmptyText: {
        color: colors.textMuted,
        fontSize: 14,
        fontStyle: 'italic',
    },
    pickerFilters: {
        marginBottom: 12,
        flexGrow: 0,
    },
    pickerFiltersContent: {
        paddingHorizontal: 16,
        alignItems: 'center',
        paddingVertical: 2,
    },
    pickerChip: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        minHeight: 36,
        borderRadius: 20,
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface_container_low || '#F1F5F9',
        marginRight: 8,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        justifyContent: 'center',
        alignItems: 'center',
    },
    pickerChipActive: {
        backgroundColor: '#2563EB',
        borderColor: mode === 'dark' ? '#38BDF8' : '#2563EB',
    },
    pickerChipText: {
        color: colors.textMuted,
        fontSize: 13,
        fontWeight: '700',
    },
    pickerChipTextActive: {
        color: '#FFFFFF',
        fontWeight: '800',
    },
    exerciseRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginHorizontal: 16,
        marginVertical: 4,
        borderRadius: 14,
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    exerciseRowSelected: {
        backgroundColor: mode === 'dark' ? '#0F1E3D' : '#EFF6FF',
        borderColor: '#2563EB',
    },
    exerciseRowLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 12,
    },
    exerciseRowDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    exerciseRowNameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    exerciseRowName: {
        color: colors.text,
        fontSize: 15,
        fontWeight: '700',
        flexShrink: 1,
    },
    exerciseRowEquip: {
        color: colors.textMuted,
        fontSize: 12,
        marginTop: 2,
    },
    customBadge: {
        backgroundColor: 'rgba(37, 99, 235, 0.2)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    customBadgeText: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    prioBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        borderWidth: 1,
    },
    prioBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    prioBadgeSmall: {
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: 5,
        borderWidth: 1,
        marginLeft: 6,
    },
    prioBadgeSmallText: {
        fontSize: 9,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    pickerControlsBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        marginBottom: 10,
        gap: 8,
    },
    pickerControlBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 10,
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface_container_low || '#F1F5F9',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    pickerControlBtnActive: {
        backgroundColor: mode === 'dark' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(37, 99, 235, 0.1)',
        borderColor: mode === 'dark' ? '#38BDF8' : '#2563EB',
    },
    pickerControlBtnText: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
    },
    pickerControlBtnTextActive: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontWeight: '700',
    },
    pickerSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 6,
        marginHorizontal: 16,
        gap: 8,
    },
    pickerSectionDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    pickerSectionTitle: {
        color: colors.text,
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        flex: 1,
    },
    pickerSectionCountBadge: {
        backgroundColor: mode === 'dark' ? '#1E293B' : colors.surface_container_low || '#E2E8F0',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
    },
    pickerSectionCountText: {
        color: colors.textMuted,
        fontSize: 10,
        fontWeight: '700',
    },
    sortDayPrioBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderRadius: 10,
        backgroundColor: mode === 'dark' ? 'rgba(56, 189, 248, 0.1)' : 'rgba(37, 99, 235, 0.08)',
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(37, 99, 235, 0.25)',
    },
    sortDayPrioBtnText: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: 12,
        fontWeight: '700',
    },
    dayControlsBar: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
        marginTop: 4,
    },
    dayControlBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 9,
        paddingHorizontal: 8,
        borderRadius: 10,
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface_container_low || '#F1F5F9',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    dayControlBtnActive: {
        backgroundColor: mode === 'dark' ? 'rgba(56, 189, 248, 0.14)' : 'rgba(37, 99, 235, 0.1)',
        borderColor: mode === 'dark' ? '#38BDF8' : '#2563EB',
    },
    dayControlBtnText: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '700',
    },
    dayControlBtnTextActive: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontWeight: '800',
    },
    tierSectionContainer: {
        marginBottom: 12,
    },
    tierSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
        paddingHorizontal: 4,
        marginBottom: 6,
    },
    tierSectionTitle: {
        color: colors.text,
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.4,
        flex: 1,
    },
    tierSectionBadge: {
        backgroundColor: mode === 'dark' ? '#1E293B' : colors.surface_container_low || '#E2E8F0',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
    },
    tierSectionBadgeText: {
        color: colors.textMuted,
        fontSize: 10,
        fontWeight: '700',
    },
    exerciseCheckbox: {
        width: 24,
        height: 24,
        borderRadius: 8,
        borderWidth: 1.5,
        borderColor: mode === 'dark' ? '#334155' : colors.border,
        backgroundColor: mode === 'dark' ? '#060B14' : '#FFFFFF',
        justifyContent: 'center',
        alignItems: 'center',
    },
    exerciseCheckboxActive: {
        backgroundColor: '#2563EB',
        borderColor: '#2563EB',
    },
    pickerFooter: {
        paddingHorizontal: 16,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: mode === 'dark' ? '#1E293B' : colors.border,
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
    },
    pickerDoneBtn: {
        backgroundColor: '#2563EB',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 14,
        borderRadius: 14,
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
    },
    pickerDoneBtnText: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
        letterSpacing: 0.3,
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
        backgroundColor: '#22C55E',
        justifyContent: 'center',
        alignItems: 'center',
    },
    logDayBtn: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: '#2563EB',
        backgroundColor: 'rgba(37, 99, 235, 0.1)',
    },
    logDayBtnActive: {
        backgroundColor: mode === 'dark' ? '#1E293B' : colors.surface_container_low || '#E2E8F0',
        borderColor: mode === 'dark' ? '#334155' : colors.border,
    },
    logDayBtnText: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: Typography.xs,
        fontWeight: '700',
    },
    logDayBtnTextActive: {
        color: colors.textMuted,
    },
    logForm: {
        marginTop: 10,
        paddingTop: 10,
        borderTopWidth: 1,
        borderTopColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    logExerciseCard: {
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface,
        borderRadius: 14,
        padding: 12,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    logExerciseName: {
        color: colors.text,
        fontSize: 15,
        fontWeight: '700',
        marginBottom: 2,
    },
    logExercisePlan: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: Typography.xs,
        fontWeight: '600',
        marginBottom: 8,
    },
    logSetHeader: {
        flexDirection: 'row',
        paddingBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: mode === 'dark' ? '#1E293B' : colors.border,
        marginBottom: 6,
    },
    logSetHeaderText: {
        flex: 1,
        color: colors.textMuted,
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
        color: colors.textMuted,
        fontSize: 14,
        fontWeight: '700',
    },
    logInput: {
        flex: 1,
        backgroundColor: mode === 'dark' ? '#060B14' : '#FFFFFF',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        color: colors.text,
        fontSize: 14,
        fontWeight: '600',
        textAlign: 'center',
        paddingVertical: 8,
    },
    saveLogBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#2563EB',
        paddingVertical: 12,
        borderRadius: 12,
        marginTop: 8,
    },
    saveLogBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    // ── Refined Header ─────────────────────────────────
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#2563EB',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 10,
    },
    addBtnText: {
        fontSize: 14,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    // ── FAB ──────────────────────────────────────────────
    fab: {
        position: 'absolute',
        right: Spacing.md,
        bottom: Spacing.lg,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#2563EB',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#2563EB',
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
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: borderRadius.full,
    },
    sessionCountText: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: 12,
        fontWeight: '700',
    },

    // ── Session History ────────────────────────────────
    sessionHistoryContainer: {
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface,
        borderRadius: 14,
        padding: 12,
        marginTop: 6,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    sessionHistoryTitle: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 8,
    },
    sessionHistoryItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 6,
        borderBottomWidth: 1,
        borderBottomColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    sessionHistoryDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#2563EB',
    },
    sessionHistoryLabel: {
        color: colors.text,
        fontSize: 12,
        fontWeight: '600',
    },
    sessionHistoryDate: {
        color: colors.textMuted,
        fontSize: 12,
    },
    sessionHistoryComment: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: 12,
        fontStyle: 'italic',
        marginTop: 2,
    },
    sessionHistorySummary: {
        color: colors.textMuted,
        fontSize: 12,
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
        backgroundColor: '#22C55E',
        justifyContent: 'center',
        alignItems: 'center',
    },
    savedTitle: {
        color: colors.text,
        fontSize: 16,
        fontWeight: '700',
    },
    savedSub: {
        color: colors.textMuted,
        fontSize: 13,
        marginBottom: 8,
    },
    sessionCommentBox: {
        backgroundColor: 'rgba(37, 99, 235, 0.08)',
        padding: 12,
        borderRadius: 12,
        marginBottom: 12,
        borderLeftWidth: 4,
        borderLeftColor: '#2563EB',
    },
    sessionCommentLabel: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    sessionCommentText: {
        color: colors.text,
        fontSize: 13,
        lineHeight: 18,
        fontStyle: 'italic',
    },
    newSessionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: '#2563EB',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 12,
        width: '100%',
    },
    newSessionBtnText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
    },
    closeDayBtn: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    closeDayBtnText: {
        color: colors.textMuted,
        fontSize: 13,
        fontWeight: '600',
    },
    newSessionTitle: {
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 8,
    },
    // ── Session Details Expansion ──────────────────────
    sessionHistoryItemWrap: {
        borderBottomWidth: 1,
        borderBottomColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    sessionDetails: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        backgroundColor: mode === 'dark' ? '#060B14' : colors.background,
        gap: 12,
    },
    sessionExDetail: {
        gap: 4,
    },
    sessionExName: {
        color: colors.text,
        fontSize: 13,
        fontWeight: '700',
    },
    sessionSetsGrid: {
        flexDirection: 'column',
        gap: 4,
    },
    sessionSetDetail: {
        color: colors.text,
        fontSize: 12,
        paddingVertical: 2,
    },
    // ── Comment Input ──────────────────────────────────
    commentInputContainer: {
        marginTop: 10,
        marginBottom: 10,
        gap: 6,
    },
    commentLabel: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
    },
    commentInput: {
        backgroundColor: mode === 'dark' ? '#060B14' : '#FFFFFF',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        color: colors.text,
        fontSize: 14,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 60,
        textAlignVertical: 'top',
    },
    // ── Quick Add Form ─────────────────────────────────
    quickAddContent: {
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface,
        borderRadius: 14,
        padding: 15,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    quickAddTitle: {
        color: colors.text,
        fontSize: 14,
        fontWeight: '700',
        marginBottom: 12,
    },
    quickAddForm: {
        gap: 12,
    },
    quickAddInput: {
        backgroundColor: mode === 'dark' ? '#060B14' : '#FFFFFF',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        color: colors.text,
        fontSize: 14,
        paddingHorizontal: 12,
        paddingVertical: 8,
    },
    quickAddRow: {
        flexDirection: 'row',
        gap: 10,
    },
    quickAddLabel: {
        color: colors.textMuted,
        fontSize: 12,
        marginBottom: 4,
    },
    quickAddChip: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: borderRadius.full,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        backgroundColor: mode === 'dark' ? '#060B14' : colors.surface_container_low || '#F1F5F9',
        marginRight: 6,
    },
    quickAddChipActive: {
        backgroundColor: '#2563EB',
        borderColor: mode === 'dark' ? '#38BDF8' : '#2563EB',
    },
    quickAddChipText: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
    },
    quickAddChipTextActive: {
        color: '#FFFFFF',
        fontWeight: '700',
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
        color: colors.textMuted,
        fontSize: 13,
    },
    quickAddBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: '#2563EB',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 10,
    },
    quickAddBtnText: {
        color: '#FFFFFF',
        fontSize: 13,
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
    logExerciseInstruction: {
        fontSize: Typography.sm,
        fontStyle: 'italic',
        marginTop: 4,
        opacity: 0.8,
        color: colors.textMuted,
    },
    // ── Grouping UI Styles for Plan Builder ─────────────────────────
    groupCheckboxPlan: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 10,
        backgroundColor: mode === 'dark' ? '#060B14' : colors.surface,
    },
    groupCheckboxPlanActive: {
        borderColor: '#2563EB',
        backgroundColor: mode === 'dark' ? '#0F1E3D' : '#EFF6FF',
    },
    checkboxInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    supersetWrapperPlan: {
        borderLeftWidth: 4,
        borderRadius: 14,
        paddingLeft: 0,
        marginBottom: 10,
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
        overflow: 'hidden',
    },
    supersetHeaderPlanNew: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        paddingVertical: 8,
    },
    supersetLabelText: {
        fontSize: 11,
        fontWeight: '900',
        color: '#FFF',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    ungroupTextPlanSmall: {
        fontSize: 11,
        fontWeight: '700',
        color: 'rgba(255,255,255,0.85)',
    },
    blockPosBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 8,
        backgroundColor: mode === 'dark' ? '#1E293B' : '#E2E8F0',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#334155' : '#CBD5E1',
        marginRight: 6,
    },
    blockPosBadgeText: {
        fontSize: 11,
        fontWeight: '900',
        color: mode === 'dark' ? '#F8FAFC' : '#0F172A',
        letterSpacing: 0.3,
    },
    blockPosBadgeSuperset: {
        backgroundColor: 'rgba(255, 255, 255, 0.22)',
        borderColor: 'rgba(255, 255, 255, 0.45)',
        marginRight: 8,
    },
    blockPosBadgeTextSuperset: {
        color: '#FFFFFF',
    },
    blockMoveToTopBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 3,
        borderRadius: 7,
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.4)',
        marginLeft: 8,
    },
    blockMoveToTopText: {
        fontSize: 10,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    blockMoveToTopBtnSingle: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
        paddingVertical: 4,
        borderRadius: 7,
        backgroundColor: mode === 'dark' ? 'rgba(56, 189, 248, 0.12)' : 'rgba(37, 99, 235, 0.08)',
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(56, 189, 248, 0.35)' : 'rgba(37, 99, 235, 0.25)',
    },
    blockMoveToTopTextSingle: {
        fontSize: 10,
        fontWeight: '800',
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
    },
    blockArrowsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    blockArrowBtn: {
        padding: 4,
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
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#2563EB',
    },
    startGroupText: {
        fontSize: 14,
        fontWeight: '700',
        color: mode === 'dark' ? '#38BDF8' : colors.primary,
    },
    cancelGroupBtn: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: mode === 'dark' ? '#080E1A' : colors.surface_container_low || '#E2E8F0',
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    cancelGroupText: {
        fontSize: 14,
        fontWeight: '600',
        color: colors.textMuted,
    },
    confirmGroupBtn: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: '#2563EB',
        shadowColor: '#2563EB',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
    },
    confirmGroupText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#FFFFFF',
    },
    optionsPushBackdrop: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        justifyContent: 'flex-end',
        zIndex: 9999,
        elevation: 20,
    },
    optionsPushCard: {
        backgroundColor: mode === 'dark' ? '#0D172E' : colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 36 : 24,
        borderWidth: 1,
        borderColor: mode === 'dark' ? '#1E293B' : colors.border,
    },
    optionsPushHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.25)' : colors.border,
        alignSelf: 'center',
        marginBottom: 16,
    },
    optionsPushHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        marginBottom: 18,
    },
    optionsPushIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionsPushIconWrapDestructive: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
    },
    optionsPushTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 4,
    },
    optionsPushMessage: {
        fontSize: 13,
        color: colors.textMuted,
        lineHeight: 18,
    },
    optionsPushActions: {
        gap: 10,
    },
    optionsPushBtn: {
        paddingVertical: 14,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionsPushBtnText: {
        fontSize: 15,
        fontWeight: '700',
    },
    optionsPushBtnPrimary: {
        backgroundColor: '#2563EB',
    },
    optionsPushBtnTextPrimary: {
        color: '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    optionsPushBtnDestructive: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.4)',
    },
    optionsPushBtnTextDestructive: {
        color: '#EF4444',
        fontSize: 15,
        fontWeight: '800',
    },
    optionsPushBtnCancel: {
        backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    },
    optionsPushBtnTextCancel: {
        color: colors.textMuted,
        fontSize: 14,
        fontWeight: '600',
    },
});
