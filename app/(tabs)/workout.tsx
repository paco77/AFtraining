import { ExerciseLog, PlannedExercise, SetLog, MONTHS } from '@/constants/PlanTypes';
import { Colors, Fonts, borderRadius, Spacing } from '@/constants/theme';
import { usePlans } from '@/context/PlanContext';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import RestTimerModal from '@/components/RestTimerModal';
import { LinearGradient } from 'expo-linear-gradient';
import { CalendarDays, Dumbbell, Heart, Info, Plus, ArrowLeft, MoreVertical, Check, CheckCheck, Accessibility } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, ImageBackground, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, RefreshControl, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';

export default function WorkoutScreen() {
    const router = useRouter();
    const { colors } = useTheme();
    const {
        plans,
        activeSessionDay,
        activePlanId,
        sessionLogs,
        setSessionLogs,
        completedSets,
        setCompletedSets,
        comment,
        setComment,
        startWorkoutSession,
        finishWorkoutSession,
        discardWorkoutSession,
        saveLog,
        updatePlan
    } = usePlans();
    const { currentUser } = useUser();
    const [selectedDayIdx, setSelectedDayIdx] = useState(0);
    const [isTimerVisible, setTimerVisible] = useState(false);
    const [activeTimerSeconds, setActiveTimerSeconds] = useState(90);
    const [restTimes, setRestTimes] = useState<Record<string, string>>({});
    const [refreshing, setRefreshing] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Grouping state
    const [isGroupingMode, setIsGroupingMode] = useState(false);
    const [selectedForGroup, setSelectedForGroup] = useState<string[]>([]);

    // Find active plan for current user (most recent one)
    const userPlans = useMemo(() => {
        if (!currentUser) return [];
        const filtered = plans.filter(p => String(p.assignedClientId) === String(currentUser.id));
        return filtered.sort((a, b) => {
            if (b.year !== a.year) return b.year - a.year;
            return MONTHS.indexOf(b.month as any) - MONTHS.indexOf(a.month as any);
        });
    }, [plans, currentUser?.id]);

    const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

    const activePlan = useMemo(() => {
        if (userPlans.length === 0) return null;
        return userPlans.find(p => p.id === selectedPlanId) || userPlans[0];
    }, [userPlans, selectedPlanId]);

    // Restore selected plan and day if there is an active session
    useEffect(() => {
        if (activePlanId) {
            setSelectedPlanId(activePlanId);
        }
    }, [activePlanId]);

    useEffect(() => {
        if (activePlan && activeSessionDay !== null) {
            const sessionDayIdx = activePlan.days.findIndex(d => d.dayNumber === activeSessionDay);
            if (sessionDayIdx !== -1) {
                setSelectedDayIdx(sessionDayIdx);
            }
        }
    }, [activePlan, activeSessionDay]);

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        try {
            if (activePlan) {
                // To refresh plans, we could call fetchPlans if available
                const fetchPlans = usePlans().fetchPlans;
                if (fetchPlans) await fetchPlans();
            }
        } finally {
            setRefreshing(false);
        }
    }, [activePlan]);

    const currentDay = activePlan?.days[selectedDayIdx];
    const isSessionActive = activeSessionDay !== null;
    const isOnSessionDay = isSessionActive && activeSessionDay === currentDay?.dayNumber;

    const handleStartSession = () => {
        if (activePlan && currentDay) {
            const initialLogs: Record<string, SetLog[]> = {};
            currentDay.exercises.forEach(ex => {
                const exId = String(ex.id || ex.exercise.id);
                initialLogs[exId] = Array(Number(ex.sets) || 1).fill(null).map(() => ({ reps: 0, weight: 0, weightLb: 0 }));
            });
            startWorkoutSession(activePlan.id, currentDay.dayNumber, initialLogs);
        }
    };

    const handleUpdateSet = (exerciseId: string, setIndex: number, field: keyof SetLog, value: string) => {
        // Permitir que el usuario ingrese comas como decimales y mantener el punto mientras teclea
        const cleanValue = value.replace(',', '.');
        
        setSessionLogs(prev => {
            const exerciseLogs = [...(prev[exerciseId] || [])];
            const newLog = { ...exerciseLogs[setIndex], [field]: cleanValue };
            
            if (field === 'weight') {
                const numValue = parseFloat(cleanValue) || 0;
                newLog.weightLb = cleanValue === '' ? '' : numValue > 0 ? parseFloat((numValue * 2.20462).toFixed(2)) : 0;
            } else if (field === 'weightLb') {
                const numValue = parseFloat(cleanValue) || 0;
                newLog.weight = cleanValue === '' ? '' : numValue > 0 ? parseFloat((numValue / 2.20462).toFixed(2)) : 0;
            }
            
            exerciseLogs[setIndex] = newLog;
            return { ...prev, [exerciseId]: exerciseLogs };
        });
    };

    const confirmFinish = async () => {
        if (!activePlan || activeSessionDay === null) return;
        setIsSaving(true);
        try {
            const exercises: ExerciseLog[] = Object.entries(sessionLogs).map(([exId, sets]) => ({
                exerciseId: exId,
                setLogs: sets
            }));

            // Validamos si todos los sets planificados de cada ejercicio del día fueron marcados como completados
            const currentDay = activePlan.days.find(d => d.dayNumber === activeSessionDay);
            const isSessionCompleted = currentDay ? currentDay.exercises.every(ex => {
                const exId = String(ex.id || ex.exercise.id);
                const logs = sessionLogs[exId] || [];
                const targetSets = Math.max(Number(ex.sets) || 0, logs.length);
                for (let idx = 0; idx < targetSets; idx++) {
                    if (!completedSets[`${exId}-${idx}`]) {
                        return false;
                    }
                }
                return true;
            }) : true;

            const finalComment = isSessionCompleted 
                ? comment 
                : (comment ? `SESIÓN NO TERMINADA - ${comment}` : 'SESIÓN NO TERMINADA');

            const dayLog = {
                dayNumber: activeSessionDay,
                sessions: [{
                    sessionNumber: 1,
                    date: new Date().toISOString(),
                    exercises: exercises,
                    comment: finalComment
                }]
            };

            await saveLog(activePlan.id, dayLog);
            await finishWorkoutSession();
        } finally {
            setIsSaving(false);
        }
    };

    const handleFinishSession = async () => {
        if (!activePlan || activeSessionDay === null) return;

        // Validation: at least one set logged?
        const hasLogs = Object.values(sessionLogs).some(sets => sets.some(s => s.reps > 0 || s.weight > 0));

        if (!hasLogs) {
            Alert.alert(
                "Sesión vacía",
                "No has registrado ninguna repetición ni peso. ¿Quieres finalizar igualmente?",
                [
                    { text: "Cancelar", style: "cancel" },
                    { text: "Finalizar", style: "destructive", onPress: confirmFinish }
                ]
            );
        } else {
            confirmFinish();
        }
    };

    const handleBackToSession = () => {
        if (activePlan && activeSessionDay !== null) {
            const sessionDayIdx = activePlan.days.findIndex(d => d.dayNumber === activeSessionDay);
            if (sessionDayIdx !== -1) {
                setSelectedDayIdx(sessionDayIdx);
            }
        }
    };

    const BarbellPlateVisual = ({ weight }: { weight: number }) => {
        // Visual logic for plates (simplified)
        const hasPlates = weight > 0;
        return (
            <View style={styles.plateContainer}>
                <View style={[styles.barbellBar, { backgroundColor: colors.textMuted + '40' }]} />
                {hasPlates && (
                    <View style={styles.plateGroup}>
                        <View style={[styles.plate, { height: 24, width: 4, backgroundColor: '#E31C25' }]} />
                        <View style={[styles.platePlaceholder, { height: 16, width: 2, backgroundColor: colors.textMuted + '60' }]} />
                    </View>
                )}
            </View>
        );
    };

    const handleCreateGroup = async () => {
        if (!activePlan || !currentDay) return;
        if (selectedForGroup.length < 2 || selectedForGroup.length > 3) {
            Alert.alert('Error', 'Debes seleccionar 2 (Biserie) o 3 (Triserie) ejercicios.');
            return;
        }
        const supersetId = 'super_' + Date.now();
        const updatedDays = activePlan.days.map(d => {
            if (d.dayNumber === currentDay.dayNumber) {
                return {
                    ...d,
                    exercises: d.exercises.map(ex => {
                        const exId = String(ex.id || ex.exercise.id);
                        if (selectedForGroup.includes(exId)) {
                            return { ...ex, supersetId };
                        }
                        return ex;
                    })
                };
            }
            return d;
        });
        await updatePlan(activePlan.id, { days: updatedDays });
        setIsGroupingMode(false);
        setSelectedForGroup([]);
    };

    const handleRemoveGroup = async (supersetId: string) => {
        if (!activePlan || !currentDay) return;
        const updatedDays = activePlan.days.map(d => {
            if (d.dayNumber === currentDay.dayNumber) {
                return {
                    ...d,
                    exercises: d.exercises.map(ex => {
                        if (ex.supersetId === supersetId) {
                            return { ...ex, supersetId: undefined };
                        }
                        return ex;
                    })
                };
            }
            return d;
        });
        await updatePlan(activePlan.id, { days: updatedDays });
    };

    const groupedExercises = useMemo(() => {
        if (!currentDay) return [];
        const result: { isGroup: boolean; id: string; items: PlannedExercise[] }[] = [];
        let currentGroup: { id: string; isGroup: boolean; items: PlannedExercise[] } | null = null;

        currentDay.exercises.forEach(ex => {
            if (ex.supersetId) {
                if (currentGroup && currentGroup.id === ex.supersetId) {
                    currentGroup.items.push(ex);
                } else {
                    currentGroup = { id: ex.supersetId, isGroup: true, items: [ex] };
                    result.push(currentGroup);
                }
            } else {
                currentGroup = null;
                result.push({ isGroup: false, id: String(ex.id || ex.exercise.id), items: [ex] });
            }
        });
        return result;
    }, [currentDay]);

    const renderSingleExercise = (item: PlannedExercise, isInsideGroup: boolean = false) => {
        const exerciseId = String(item.id || item.exercise.id);
        const logs = sessionLogs[exerciseId] || [];

        return (
            <View style={styles.exerciseContainerDark}>
                <View style={styles.exerciseTitleRowDark}>
                   <View style={{ flex: 1 }}>
                     <Text style={styles.exerciseTitleDark}>{item.exercise.name}</Text>
                     <Text style={styles.exerciseSubtitleDark}>ENFOQUE: {(item.exercise.muscleGroup || 'CUÁDRICEPS Y GLÚTEOS').toUpperCase()}</Text>
                     <Text style={{ color: '#94A3B8', fontSize: 13, marginTop: 4, fontWeight: '500' }}>
                        {item.sets} series {item.minReps}-{item.maxReps} reps {item.instruction ? `• ${item.instruction}` : ''}
                     </Text>
                   </View>
                   <View style={{ alignItems: 'center', marginLeft: 10 }}>
                        <Text style={{ color: Colors.textMuted, fontSize: 10, marginBottom: 4, fontWeight: '600' }}>Descanso (s)</Text>
                        <TextInput
                            style={{ 
                                backgroundColor: Colors.surface, 
                                color: '#fff', 
                                borderRadius: 6, 
                                paddingHorizontal: 8, 
                                paddingVertical: 4, 
                                fontSize: 13, 
                                width: 55, 
                                textAlign: 'center', 
                                borderWidth: 1, 
                                borderColor: Colors.outline 
                            }}
                            keyboardType="number-pad"
                            placeholder="90"
                            placeholderTextColor={Colors.textMuted}
                            value={restTimes[exerciseId] || ''}
                            onChangeText={(val) => setRestTimes(prev => ({ ...prev, [exerciseId]: val }))}
                        />
                    </View>
                </View>

                {logs.map((log, idx) => {
                    const actualIdx = idx;
                    const isCompleted = completedSets[`${exerciseId}-${actualIdx}`];
                    return (
                        <View key={`effective-${idx}`} style={[styles.setRowDark, isCompleted && styles.setRowCompleted]}>
                           <Text style={[styles.setNumberTextDark, isCompleted && { color: Colors.primary }]}>{actualIdx + 1}</Text>
                           <View style={styles.inputGroupDark}>
                              <Text style={styles.inputLabelDark}>peso (KG)</Text>
                              <TextInput
                                  style={[styles.inputBoxDark, isCompleted && styles.inputBoxCompleted]}
                                  value={log.weight !== undefined && log.weight !== null ? String(log.weight) : ''}
                                  keyboardType="decimal-pad"
                                  onChangeText={(val) => handleUpdateSet(exerciseId, actualIdx, 'weight', val)}
                                  placeholder="--"
                                  placeholderTextColor="#0F172A"
                              />
                           </View>
                           <View style={styles.inputGroupDark}>
                              <Text style={styles.inputLabelDark}>peso (LB)</Text>
                              <TextInput
                                  style={[styles.inputBoxDark, isCompleted && styles.inputBoxCompleted]}
                                  value={log.weightLb !== undefined && log.weightLb !== null ? String(log.weightLb) : ''}
                                  keyboardType="decimal-pad"
                                  onChangeText={(val) => handleUpdateSet(exerciseId, actualIdx, 'weightLb', val)}
                                  placeholder="--"
                                  placeholderTextColor="#0F172A"
                              />
                           </View>
                           <View style={styles.inputGroupDark}>
                              <Text style={styles.inputLabelDark}>reps</Text>
                              <TextInput
                                  style={[styles.inputBoxDark, isCompleted && styles.inputBoxCompleted]}
                                  value={log.reps !== undefined && log.reps !== null ? String(log.reps) : ''}
                                  keyboardType="decimal-pad"
                                  onChangeText={(val) => handleUpdateSet(exerciseId, actualIdx, 'reps', val)}
                                  placeholder="--"
                                  placeholderTextColor="#0F172A"
                              />
                           </View>
                           <TouchableOpacity 
                              style={[styles.checkBtnDark, isCompleted && styles.checkBtnCompleted]}
                              onPress={() => {
                                  const key = `${exerciseId}-${actualIdx}`;
                                  setCompletedSets(prev => {
                                      const nextStatus = !prev[key];
                                      if (nextStatus) {
                                          const customRest = parseInt(restTimes[exerciseId]) || 90;
                                          setActiveTimerSeconds(customRest);
                                          setTimeout(() => setTimerVisible(true), 50);
                                      }
                                      return { ...prev, [key]: nextStatus };
                                  });
                              }}
                           >
                              {isCompleted ? <CheckCheck size={16} color="#000" /> : <Check size={14} color="#334155" />}
                           </TouchableOpacity>
                        </View>
                    );
                })}

                <TouchableOpacity 
                    style={styles.addSerieBtnDark}
                    onPress={() => {
                        setSessionLogs(prev => {
                            const current = prev[exerciseId] || [];
                            return { ...prev, [exerciseId]: [...current, { reps: 0, weight: 0, weightLb: 0 }] };
                        });
                    }}
                >
                    <Plus size={14} color="#2BB0FF" />
                    <Text style={styles.addSerieTextDark}>AGREGAR SERIE</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const renderGroupItem = ({ item }: { item: { isGroup: boolean; id: string; items: PlannedExercise[] } }) => {
        if (!item.isGroup) {
            const ex = item.items[0];
            const exId = String(ex.id || ex.exercise.id);
            const isSelected = selectedForGroup.includes(exId);

            return (
                <View style={{ marginBottom: 24, paddingHorizontal: isGroupingMode ? Spacing.sm : 0 }}>
                    {isGroupingMode && (
                        <TouchableOpacity
                            style={[styles.groupCheckbox, isSelected && styles.groupCheckboxActive]}
                            onPress={() => setSelectedForGroup(prev =>
                                prev.includes(exId) ? prev.filter(id => id !== exId) : [...prev, exId]
                            )}
                        >
                            <View style={[styles.checkboxInner, isSelected && { backgroundColor: '#CCFF00' }]} />
                        </TouchableOpacity>
                    )}
                    {renderSingleExercise(ex)}
                </View>
            );
        }

        const isTriserie = item.items.length >= 3;

        return (
            <View style={styles.supersetContainer}>
                <View style={styles.supersetHeader}>
                    <Text style={styles.supersetTitle}>{isTriserie ? 'TRISERIE' : 'BISERIE'}</Text>
                    {isSessionActive && (
                        <TouchableOpacity onPress={() => handleRemoveGroup(item.id)} style={styles.ungroupBtn}>
                            <Text style={styles.ungroupBtnText}>Desagrupar</Text>
                        </TouchableOpacity>
                    )}
                </View>
                <View style={styles.supersetContent}>
                    {item.items.map((ex, idx) => (
                        <View key={String(ex.id || ex.exercise.id)}>
                            {renderSingleExercise(ex, true)}
                            {idx < item.items.length - 1 && (
                                <View style={styles.supersetDivider} />
                            )}
                        </View>
                    ))}
                </View>
            </View>
        );
    };

    if (!activePlan) {
        return (
            <View style={[styles.container, { backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: Spacing.xl }]}>
                <CalendarDays size={48} color={colors.textMuted} />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>Sin plan activo</Text>
                <Text style={[styles.emptySub, { color: colors.textMuted }]}>No hemos encontrado un plan de entrenamiento activo para ti.</Text>
            </View>
        );
    }

    if (!isSessionActive) {
        return (
            <View style={{ flex: 1, backgroundColor: Colors.background }}>
                <View style={styles.topNavDark}>
                    <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.navBtn}>
                        <ArrowLeft size={24} color="#F8FAFC" />
                    </TouchableOpacity>
                    <Text style={styles.navTitleDark}>Tus Planes</Text>
                    <View style={{ width: 40 }} />
                </View>

                <View style={{ flex: 1, paddingHorizontal: 20, paddingTop: 10 }}>
                
                {userPlans.length > 1 && (
                    <View style={{ marginBottom: 20 }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
                            {userPlans.map(plan => (
                                <TouchableOpacity
                                    key={plan.id}
                                    style={{
                                        paddingHorizontal: 16,
                                        paddingVertical: 8,
                                        borderRadius: 20,
                                        backgroundColor: activePlan.id === plan.id ? Colors.primary : Colors.surface,
                                        marginRight: 10
                                    }}
                                    onPress={() => { setSelectedPlanId(plan.id); setSelectedDayIdx(0); }}
                                >
                                    <Text style={{
                                        fontFamily: Fonts.headline,
                                        fontSize: 14,
                                        fontWeight: '700',
                                        color: activePlan.id === plan.id ? '#000' : Colors.textMuted
                                    }}>
                                        {plan.month} {plan.year}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}
                
                <ScrollView 
                    showsVerticalScrollIndicator={false} 
                    contentContainerStyle={{ gap: 16, paddingBottom: 120 }}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
                >
                    {activePlan.days.map((day, idx) => {
                        const isSelected = selectedDayIdx === idx;
                        return (
                            <TouchableOpacity 
                                key={day.dayNumber}
                                style={[
                                    { backgroundColor: Colors.surface, padding: 20, borderRadius: 16, borderWidth: 0, borderColor: Colors.surface_lowest },
                                    isSelected && { borderColor: Colors.primary, backgroundColor: Colors.primary_container }
                                ]}
                                onPress={() => setSelectedDayIdx(idx)}
                                activeOpacity={0.8}
                            >
                                <Text style={{ fontFamily: Fonts.headline, fontSize: 18, fontWeight: '800', color: isSelected ? '#000' : '#FFF', marginBottom: 4 }}>
                                    {(() => {
                                        let base = day.label;
                                        let arr = day.muscleGroups || [];
                                        
                                        if (arr.length === 0) {
                                            const muscles = new Set<string>();
                                            day.exercises.forEach(pe => {
                                                if (pe.exercise.muscleGroup) muscles.add(pe.exercise.muscleGroup);
                                            });
                                            arr = Array.from(muscles);
                                        }

                                        if (arr.length > 0 && !base.includes('—') && !base.includes('(')) {
                                            base += ` (${arr.join(', ')})`;
                                        }
                                        return base;
                                    })()}
                                </Text>
                                <Text style={{ fontFamily: Fonts.body, fontSize: 13, color: isSelected ? '#000' : Colors.textMuted, fontWeight: '500' }}>
                                    {day.exercises.length} Ejercicios disponibles
                                </Text>
                                {isSelected && day.exercises.length > 0 && (
                                    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)' }}>
                                        {day.exercises.map((pe, exIdx) => (
                                            <Text key={pe.exercise.id} style={{ fontFamily: Fonts.body, fontSize: 13, color: '#000', marginBottom: 4 }} numberOfLines={1}>
                                                • {pe.exercise.name} <Text style={{ color: 'rgba(0,0,0,0.6)' }}>({pe.sets}x{pe.minReps}-{pe.maxReps})</Text>
                                            </Text>
                                        ))}
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                <View style={{ position: 'absolute', bottom: 40, left: 20, right: 20 }}>
                    <TouchableOpacity 
                        style={[styles.submitBtnDark, { shadowColor: Colors.primary, shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }]}
                        onPress={handleStartSession}
                    >
                        <Text style={styles.submitBtnTextDark}>COMENZAR ENTRENAMIENTO</Text>
                    </TouchableOpacity>
                </View>
                </View>
            </View>
        );
    }

    return (
        <View style={{ flex: 1, backgroundColor: Colors.background }}>
            <View style={styles.topNavDark}>
                <TouchableOpacity onPress={() => router.replace('/(tabs)')} style={styles.navBtn}>
                    <ArrowLeft size={24} color="#F8FAFC" />
                </TouchableOpacity>
                <Text style={styles.navTitleDark}>
                    {(() => {
                        let base = currentDay?.label || 'Día de Entrenamiento';
                        if (currentDay && !base.includes('—') && !base.includes('(')) {
                            let arr = currentDay.muscleGroups || [];
                            if (arr.length === 0) {
                                const muscles = new Set<string>();
                                currentDay.exercises.forEach(pe => {
                                    if (pe.exercise.muscleGroup) muscles.add(pe.exercise.muscleGroup);
                                });
                                arr = Array.from(muscles);
                            }
                            if (arr.length > 0) {
                                base += ` (${arr.join(', ')})`;
                            }
                        }
                        return base;
                    })()}
                </Text>
                <TouchableOpacity 
                    style={styles.navBtn}
                    onPress={() => {
                        Alert.alert(
                            "Descartar sesión",
                            "¿Estás seguro de que deseas descartar esta sesión? Perderás todo el progreso.",
                            [
                                { text: "Cancelar", style: "cancel" },
                                { text: "Descartar", style: "destructive", onPress: discardWorkoutSession }
                            ]
                        );
                    }}
                >
                    <MoreVertical size={24} color="#F8FAFC" />
                </TouchableOpacity>
            </View>

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={{ flex: 1 }}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
            >
                <FlatList
                    data={groupedExercises}
                    keyExtractor={(item) => item.id}
                    renderItem={renderGroupItem}
                    contentContainerStyle={styles.listContentDark}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={(
                        <View style={styles.emptyExercises}>
                            <Dumbbell size={32} color={colors.textMuted} />
                            <Text style={[styles.emptyExercisesText, { color: colors.textMuted }]}>
                                No hay ejercicios asignados para este día.
                            </Text>
                        </View>
                    )}
                    ListFooterComponent={currentDay && currentDay.exercises.length > 0 ? (
                        <View style={styles.footerDark}>
                            <Text style={styles.footerTitleDark}>COMENTARIOS DE LA SESIÓN</Text>
                            <TextInput
                                style={styles.commentInputDark}
                                placeholder="Escribe cómo te sentiste, molestias o mejoras para la próxima sesión..."
                                placeholderTextColor="#334155"
                                multiline
                                value={comment}
                                onChangeText={setComment}
                            />
                            
                            <TouchableOpacity 
                                style={[styles.submitBtnDark, isSaving && { opacity: 0.7 }]}
                                onPress={handleFinishSession}
                                disabled={isSaving}
                            >
                                {isSaving ? (
                                    <ActivityIndicator color="#000" />
                                ) : (
                                    <Text style={styles.submitBtnTextDark}>GUARDAR SESIÓN</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    ) : null}
                />
            </KeyboardAvoidingView>

            <RestTimerModal 
                visible={isTimerVisible} 
                onClose={() => setTimerVisible(false)} 
                initialSeconds={activeTimerSeconds} 
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    daySelectorWrapper: {
        borderBottomWidth: 0,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    daysScroll: {
        flexGrow: 0,
    },
    dayTab: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.md,
        marginHorizontal: Spacing.xs,
    },
    dayTabText: {
        fontFamily: Fonts.headline, fontSize: 14,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    header: {
        padding: Spacing.md,
        paddingTop: Spacing.md,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    planInfo: {
        fontFamily: Fonts.body, fontSize: 12,
        fontWeight: '600',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    dayTitle: {
        fontFamily: Fonts.display, fontSize: 22,
        fontWeight: '800',
    },
    startButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: borderRadius.full,
    },
    startButtonText: {
        color: '#000',
        fontWeight: '600',
        marginLeft: Spacing.xs,
    },
    mainButton: {
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    mainButtonText: {
        color: '#000',
        fontFamily: Fonts.headline, fontSize: 16,
        fontWeight: '900',
        letterSpacing: 0.5,
    },
    listContent: {
        paddingBottom: 40,
    },
    exerciseContainer: {
        marginBottom: 24,
    },
    exerciseImage: {
        height: 250,
        width: '100%',
    },
    imageOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
    },
    exerciseContent: {
        paddingHorizontal: Spacing.md,
        marginTop: -60,
    },
    exerciseTitleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 24,
    },
    exerciseTitle: {
        fontFamily: Fonts.display, fontSize: 24,
        fontWeight: '900',
        flex: 1,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
        marginTop: 8,
    },
    sectionTitle: {
        fontFamily: Fonts.headline, fontSize: 18,
        fontWeight: '800',
    },
    hideAction: {
        fontFamily: Fonts.headline, fontSize: 16,
        fontWeight: '700',
    },
    logTableHeader: {
        flexDirection: 'row',
        paddingHorizontal: 4,
        marginBottom: 8,
    },
    columnLabel: {
        fontFamily: Fonts.body, fontSize: 12,
        fontWeight: '700',
        flex: 1,
        textAlign: 'center',
    },
    logRowStylized: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    setNumberBox: {
        width: 48,
        height: 48,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    setNumberText: {
        fontFamily: Fonts.headline, fontSize: 18,
        fontWeight: '900',
    },
    inputStylized: {
        flex: 1.5,
        height: 48,
        borderRadius: 12,
        textAlign: 'center',
        fontFamily: Fonts.display, fontSize: 20,
        fontWeight: '900',
    },
    plateContainer: {
        width: 40,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'row',
    },
    barbellBar: {
        height: 2,
        width: 30,
        borderRadius: 1,
        position: 'absolute',
    },
    plateGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 1,
    },
    plate: {
        borderRadius: 1,
    },
    platePlaceholder: {
        borderRadius: 0.5,
    },
    addSerieBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 12,
        gap: 12,
    },
    plusCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addSerieText: {
        fontFamily: Fonts.headline, fontSize: 16,
        fontWeight: '700',
    },
    emptyTitle: {
        fontFamily: Fonts.display, fontSize: 20,
        fontWeight: '800',
        marginTop: 16,
    },
    emptySub: {
        fontFamily: Fonts.headline, fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
    },
    emptyExercises: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
        gap: 12,
    },
    emptyExercisesText: {
        fontFamily: Fonts.headline, fontSize: 14,
        fontWeight: '500',
    },
    sessionDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginLeft: 2,
    },
    sessionNotice: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingVertical: 8,
        marginHorizontal: Spacing.md,
        borderRadius: borderRadius.md,
        marginBottom: Spacing.sm,
        gap: 8,
    },
    sessionNoticeText: {
        fontFamily: Fonts.body, fontSize: 12,
        fontWeight: '700',
    },
    // ── Grouping UI Styles ──────────────────────────────────────────
    groupCheckbox: {
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: Colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'absolute',
        top: 20,
        right: 16,
        zIndex: 10,
        backgroundColor: Colors.cardBg,
    },
    groupCheckboxActive: {
        borderColor: Colors.surface_lowest,
    },
    checkboxInner: {
        width: 12,
        height: 12,
        borderRadius: 6,
    },
    supersetContainer: {
        marginHorizontal: Spacing.md,
        marginBottom: 24,
        borderRadius: borderRadius.lg,
        borderWidth: 2,
        borderColor: Colors.surface_lowest,
        backgroundColor: Colors.cardBg,
        overflow: 'hidden',
    },
    supersetHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: 'rgba(204, 255, 0, 0.15)',
        paddingHorizontal: Spacing.md,
        paddingVertical: 10,
    },
    supersetTitle: {
        fontFamily: Fonts.headline, fontSize: 16,
        fontWeight: '900',
        color: '#CCFF00',
        letterSpacing: 1,
    },
    ungroupBtn: {
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: borderRadius.sm,
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    ungroupBtnText: {
        fontFamily: Fonts.body, fontSize: 12,
        fontWeight: '700',
        color: Colors.text,
    },
    supersetContent: {
        paddingTop: Spacing.md,
    },
    supersetDivider: {
        height: 2,
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        marginVertical: Spacing.sm,
    },
    groupModeBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.md,
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
        borderWidth: 0,
        borderColor: Colors.surface_lowest,
    },
    startGroupText: {
        fontFamily: Fonts.headline, fontSize: 14,
        fontWeight: '700',
        color: '#CCFF00',
    },
    cancelGroupBtn: {
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: borderRadius.full,
        backgroundColor: Colors.surface,
        borderWidth: 0,
        borderColor: Colors.border,
    },
    cancelGroupText: {
        fontFamily: Fonts.headline, fontSize: 14,
        fontWeight: '600',
        color: Colors.text,
    },
    confirmGroupBtn: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: borderRadius.full,
    },
    confirmGroupText: {
        fontFamily: Fonts.headline, fontSize: 14,
        fontWeight: '800',
    },
    // ── DARK THEME STYLES (Mockup) ─────────────────────────
    topNavDark: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingTop: Platform.OS === 'ios' ? 60 : 40,
        paddingBottom: Spacing.md,
        backgroundColor: Colors.background,
        borderBottomWidth: 0,
        borderBottomColor: '#1E293B',
    },
    navBtn: {
        padding: 8,
    },
    navTitleDark: {
        fontFamily: Fonts.display, fontSize: 20,
        fontWeight: '800',
        color: Colors.primary,
        letterSpacing: 0.5,
    },
    listContentDark: {
        paddingTop: Spacing.lg,
        paddingBottom: 40,
    },
    exerciseContainerDark: {
        marginBottom: 24,
        backgroundColor: Colors.surface_container,
        borderRadius: 12,
        padding: Spacing.md,
        marginHorizontal: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.outline,
    },
    exerciseTitleRowDark: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 20,
    },
    exerciseTitleDark: {
        fontFamily: Fonts.headline, fontSize: 18,
        fontWeight: '800',
        color: Colors.text,
        marginBottom: 4,
    },
    exerciseSubtitleDark: {
        fontFamily: Fonts.body, fontSize: 10,
        fontWeight: '600',
        color: Colors.textMuted,
        letterSpacing: 1,
    },
    setRowDark: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 12,
        backgroundColor: Colors.surface,
        borderRadius: 8,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderColor: Colors.outline,
    },
    setRowCompleted: {
        borderColor: Colors.primary,
        backgroundColor: Colors.surface_high,
    },
    setNumberTextDark: {
        fontFamily: Fonts.headline, fontSize: 18,
        fontWeight: '900',
        color: Colors.textMuted,
        width: 30,
        textAlign: 'center',
    },
    inputGroupDark: {
        flex: 1,
        marginHorizontal: 8,
    },
    inputLabelDark: {
        fontFamily: Fonts.body, fontSize: 10,
        fontWeight: '600',
        color: Colors.textMuted,
        marginBottom: 4,
    },
    inputBoxDark: {
        backgroundColor: Colors.surface_lowest,
        color: Colors.text,
        fontFamily: Fonts.headline, fontSize: 16,
        fontWeight: '800',
        textAlign: 'center',
        borderRadius: 4,
        height: 40,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    inputBoxCompleted: {
        borderBottomColor: Colors.primary,
    },
    checkBtnDark: {
        width: 40,
        height: 40,
        borderRadius: 8,
        backgroundColor: Colors.surface_low,
        justifyContent: 'center',
        alignItems: 'center',
    },
    checkBtnCompleted: {
        backgroundColor: Colors.primary,
    },
    addSerieBtnDark: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 8,
        paddingVertical: 12,
        borderRadius: 8,
        backgroundColor: 'transparent',
        borderWidth: 1,
        borderColor: Colors.outline,
    },
    addSerieTextDark: {
        fontFamily: Fonts.body, fontSize: 12,
        fontWeight: '800',
        color: Colors.primary,
        marginLeft: 8,
        letterSpacing: 1,
    },
    footerDark: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.xl,
        paddingBottom: 60,
    },
    footerTitleDark: {
        fontFamily: Fonts.body, fontSize: 12,
        fontWeight: '800',
        color: Colors.textMuted,
        marginBottom: 12,
        letterSpacing: 1,
    },
    commentInputDark: {
        backgroundColor: Colors.surface_lowest,
        color: Colors.text,
        borderRadius: 12,
        padding: 16,
        minHeight: 120,
        textAlignVertical: 'top',
        fontFamily: Fonts.headline, fontSize: 14,
        borderWidth: 0,
        borderColor: Colors.surface_lowest,
        marginBottom: 24,
    },
    submitBtnDark: {
        backgroundColor: Colors.primary,
        borderRadius: 12,
        height: 56,
        justifyContent: 'center',
        alignItems: 'center',
    },
    submitBtnTextDark: {
        color: '#000',
        fontFamily: Fonts.headline, fontSize: 16,
        fontWeight: '900',
        letterSpacing: 1,
    },
});
