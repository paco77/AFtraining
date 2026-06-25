import {
    Exercise,
    Level,
    MuscleGroup,
} from '@/constants/ExerciseData';
import { borderRadius, Colors, MuscleGroupColors, Spacing } from '@/constants/theme';
import { usePlans } from '@/context/PlanContext';
import { useTheme } from '@/context/ThemeContext';
import api from '@/services/api';
import { showToast } from '@/services/toast';
import {
    ChevronDown,
    ChevronUp,
    Dumbbell,
    Plus,
    Search,
    Sparkles,
    Trash2,
    X,
    Edit2,
} from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Alert,
    FlatList,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    SectionList,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
    ActivityIndicator,
} from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────────

type FilterOption = 'Todos' | MuscleGroup | 'Personalizados';

// ─── Muscle Group Icon ────────────────────────────────────────────────────────

const MUSCLE_ICONS: Record<string, string> = {
    Pecho: '💪',
    Espalda: '🔙',
    Cuádriceps: '🦵',
    Isquios: '🦵',
    Glúteos: '🍑',
    Hombros: '🏋️',
    Bícep: '💪',
    Trícep: '🦾',
    Core: '🎯',
    Descanso: '😴',
};

// ─── Level Badge Component ────────────────────────────────────────────────────

const LevelBadge = ({ level }: { level: Level }) => {
    const isIntermediate = level === 'Intermedio';
    return (
        <View
            style={[
                styles.levelBadge,
                {
                    backgroundColor: isIntermediate
                        ? 'rgba(247, 183, 49, 0.15)'
                        : 'rgba(191, 255, 10, 0.12)',
                    borderColor: isIntermediate
                        ? 'rgba(247, 183, 49, 0.3)'
                        : 'rgba(191, 255, 10, 0.25)',
                },
            ]}
        >
            <Text
                style={[
                    styles.levelBadgeText,
                    { color: isIntermediate ? '#f7b731' : Colors.primary },
                ]}
            >
                {level}
            </Text>
        </View>
    );
};

// ─── Muscle Tag Component ─────────────────────────────────────────────────────

const MuscleTag = ({ name, accent }: { name: string; accent?: boolean }) => (
    <View style={[styles.muscleTag, accent && styles.muscleTagAccent]}>
        <Text style={[styles.muscleTagText, accent && styles.muscleTagTextAccent]}>
            {name}
        </Text>
    </View>
);

// ─── Exercise Card Component ──────────────────────────────────────────────────

const ExerciseCard = ({ exercise, onDelete, onEdit }: { exercise: Exercise; onDelete?: (id: string) => void; onEdit?: (exercise: Exercise) => void }) => {
    const [expanded, setExpanded] = useState(false);
    const groupColor = MuscleGroupColors[exercise.muscleGroup] || Colors.primary;

    return (
        <TouchableOpacity
            style={styles.exerciseCard}
            activeOpacity={0.8}
            onPress={() => setExpanded(!expanded)}
        >
            {/* Header Row */}
            <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                    {/* Color accent bar */}
                    <View style={[styles.accentBar, { backgroundColor: groupColor }]} />
                    <View style={styles.cardTitleArea}>
                        <Text style={styles.exerciseName} numberOfLines={1}>
                            {exercise.name}
                        </Text>
                        <View style={styles.equipmentRow}>
                            <Dumbbell size={12} color={Colors.textMuted} />
                            <Text style={styles.exerciseEquipment}>{exercise.equipment}</Text>
                        </View>
                    </View>
                </View>
                <View style={styles.cardHeaderRight}>
                    {exercise.isCustom && (
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            {onEdit && (
                                <TouchableOpacity
                                    style={styles.deleteExBtn}
                                    onPress={() => onEdit(exercise)}
                                >
                                    <Edit2 size={14} color={Colors.textMuted} />
                                </TouchableOpacity>
                            )}
                            {onDelete && (
                                <TouchableOpacity
                                    style={styles.deleteExBtn}
                                    onPress={() => {
                                        Alert.alert(
                                            'Eliminar ejercicio',
                                            `¿Estás seguro de eliminar "${exercise.name}"?`,
                                            [
                                                { text: 'Cancelar', style: 'cancel' },
                                                { text: 'Eliminar', style: 'destructive', onPress: () => onDelete(exercise.id) },
                                            ],
                                        );
                                    }}
                                >
                                    <Trash2 size={14} color={Colors.danger} />
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                    <LevelBadge level={exercise.level} />
                    {expanded ? (
                        <ChevronUp size={16} color={Colors.textMuted} />
                    ) : (
                        <ChevronDown size={16} color={Colors.textMuted} />
                    )}
                </View>
            </View>

            {/* Muscle Tags */}
            <View style={styles.muscleTags}>
                {exercise.primaryMuscles.map((m) => (
                    <MuscleTag key={m} name={m} accent />
                ))}
            </View>

            {/* Expanded Detail */}
            {expanded && (
                <View style={styles.expandedContent}>
                    {/* Description */}
                    <View style={styles.detailSection}>
                        <View style={styles.detailLabelRow}>
                            <Text style={styles.detailLabelIcon}>📋</Text>
                            <Text style={styles.detailLabel}>Ejecución</Text>
                        </View>
                        <Text style={styles.detailText}>{exercise.description}</Text>
                    </View>

                    {/* Secondary Muscles */}
                    {exercise.secondaryMuscles.length > 0 && (
                        <View style={styles.detailSection}>
                            <View style={styles.detailLabelRow}>
                                <Text style={styles.detailLabelIcon}>🎯</Text>
                                <Text style={styles.detailLabel}>Músculos secundarios</Text>
                            </View>
                            <View style={styles.muscleTags}>
                                {exercise.secondaryMuscles.map((m) => (
                                    <MuscleTag key={m} name={m} />
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Benefits */}
                    <View style={styles.detailSection}>
                        <View style={styles.detailLabelRow}>
                            <Text style={styles.detailLabelIcon}>✅</Text>
                            <Text style={styles.detailLabel}>Beneficios</Text>
                        </View>
                        {exercise.benefits.map((b, i) => (
                            <View key={i} style={styles.benefitRow}>
                                <View style={styles.benefitDot} />
                                <Text style={styles.benefitItem}>{b}</Text>
                            </View>
                        ))}
                    </View>
                </View>
            )}
        </TouchableOpacity>
    );
};

// ─── Add Exercise Form ────────────────────────────────────────────────────────

interface AddExerciseFormProps {
    visible: boolean;
    onClose: () => void;
    onAdd: (exercise: Exercise) => Promise<void>;
    initialData?: Exercise | null;
}

const AddExerciseForm = ({ visible, onClose, onAdd, initialData }: AddExerciseFormProps) => {
    const [name, setName] = useState('');
    const [equipment, setEquipment] = useState('');
    const [description, setDescription] = useState('');
    const [primaryMuscles, setPrimaryMuscles] = useState('');
    const [secondaryMuscles, setSecondaryMuscles] = useState('');
    const [benefits, setBenefits] = useState('');
    const { muscleGroups } = usePlans();
    const [selectedGroup, setSelectedGroup] = useState<string>('Pecho');
    const [selectedLevel, setSelectedLevel] = useState<Level>('Principiante');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (visible && initialData) {
            setName(initialData.name);
            setEquipment(initialData.equipment);
            setDescription(initialData.description);
            setPrimaryMuscles(initialData.primaryMuscles.join(', '));
            setSecondaryMuscles(initialData.secondaryMuscles.join(', '));
            setBenefits(initialData.benefits.join(', '));
            setSelectedGroup(initialData.muscleGroup);
            setSelectedLevel(initialData.level);
        } else if (!visible) {
            resetForm();
        }
    }, [visible, initialData]);

    useEffect(() => {
        if (muscleGroups.length > 0 && !muscleGroups.includes(selectedGroup) && !initialData) {
            setSelectedGroup(muscleGroups[0]);
        }
    }, [muscleGroups, selectedGroup, initialData]);

    const resetForm = () => {
        setName('');
        setEquipment('');
        setDescription('');
        setPrimaryMuscles('');
        setSecondaryMuscles('');
        setBenefits('');
        setSelectedGroup(muscleGroups[0] || 'Pecho');
        setSelectedLevel('Principiante');
    };

    const handleSubmit = async () => {
        if (!name.trim() || !equipment.trim()) {
            Alert.alert('Campos requeridos', 'Por favor completa al menos el nombre y equipo.');
            return;
        }

        const newExercise: Exercise = {
            id: initialData ? initialData.id : `custom-${Date.now()}`,
            name: name.trim(),
            muscleGroup: selectedGroup,
            equipment: equipment.trim(),
            description: description.trim() || 'Ejercicio personalizado.',
            primaryMuscles: primaryMuscles
                .split(',')
                .map((m) => m.trim())
                .filter(Boolean),
            secondaryMuscles: secondaryMuscles
                .split(',')
                .map((m) => m.trim())
                .filter(Boolean),
            benefits: benefits
                .split(',')
                .map((b) => b.trim())
                .filter(Boolean),
            level: selectedLevel,
            isCustom: true,
        };

        setIsSaving(true);
        try {
            await onAdd(newExercise);
            resetForm();
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.modalOverlay}
            >
                <View style={styles.modalContent}>
                    {/* Drag handle */}
                    <View style={styles.modalHandle} />

                    <View style={styles.modalHeader}>
                        <View style={styles.modalTitleRow}>
                            <Sparkles size={20} color={Colors.primary} />
                            <Text style={styles.modalTitle}>{initialData ? 'Editar Ejercicio' : 'Nuevo Ejercicio'}</Text>
                        </View>
                        <TouchableOpacity
                            style={styles.modalCloseBtn}
                            onPress={onClose}
                        >
                            <X size={18} color={Colors.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView
                        style={styles.formScroll}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* Name */}
                        <Text style={styles.formLabel}>Nombre *</Text>
                        <TextInput
                            style={styles.formInput}
                            value={name}
                            onChangeText={setName}
                            placeholder="Ej: Press de Banca Cerrado"
                            placeholderTextColor={Colors.textMuted}
                        />

                        {/* Muscle Group */}
                        <Text style={styles.formLabel}>Grupo Muscular</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            style={styles.formChipRow}
                        >
                            {muscleGroups.map((g: string) => (
                                <TouchableOpacity
                                    key={g}
                                    style={[
                                        styles.formChip,
                                        selectedGroup === g && {
                                            backgroundColor: MuscleGroupColors[g] + '22',
                                            borderColor: MuscleGroupColors[g],
                                        },
                                    ]}
                                    onPress={() => setSelectedGroup(g)}
                                >
                                    <Text
                                        style={[
                                            styles.formChipText,
                                            selectedGroup === g && {
                                                color: MuscleGroupColors[g],
                                            },
                                        ]}
                                    >
                                        {g}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>

                        {/* Equipment */}
                        <Text style={styles.formLabel}>Equipo *</Text>
                        <TextInput
                            style={styles.formInput}
                            value={equipment}
                            onChangeText={setEquipment}
                            placeholder="Ej: Barra, Mancuernas, Peso corporal"
                            placeholderTextColor={Colors.textMuted}
                        />

                        {/* Level */}
                        <Text style={styles.formLabel}>Nivel</Text>
                        <View style={styles.levelRow}>
                            {(['Principiante', 'Intermedio'] as Level[]).map((l) => (
                                <TouchableOpacity
                                    key={l}
                                    style={[
                                        styles.formChip,
                                        { flex: 1, alignItems: 'center' as const },
                                        selectedLevel === l && {
                                            backgroundColor: 'rgba(191, 255, 10, 0.12)',
                                            borderColor: Colors.primary,
                                        },
                                    ]}
                                    onPress={() => setSelectedLevel(l)}
                                >
                                    <Text
                                        style={[
                                            styles.formChipText,
                                            selectedLevel === l && { color: Colors.primary },
                                        ]}
                                    >
                                        {l}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Description */}
                        <Text style={styles.formLabel}>Descripción</Text>
                        <TextInput
                            style={[styles.formInput, styles.formTextArea]}
                            value={description}
                            onChangeText={setDescription}
                            placeholder="Descripción breve de la ejecución..."
                            placeholderTextColor={Colors.textMuted}
                            multiline
                            numberOfLines={3}
                        />

                        {/* Primary Muscles */}
                        <Text style={styles.formLabel}>Músculos principales</Text>
                        <TextInput
                            style={styles.formInput}
                            value={primaryMuscles}
                            onChangeText={setPrimaryMuscles}
                            placeholder="Separados por coma: Pectoral, Tríceps"
                            placeholderTextColor={Colors.textMuted}
                        />

                        {/* Secondary Muscles */}
                        <Text style={styles.formLabel}>Músculos secundarios</Text>
                        <TextInput
                            style={styles.formInput}
                            value={secondaryMuscles}
                            onChangeText={setSecondaryMuscles}
                            placeholder="Separados por coma: Deltoides, Core"
                            placeholderTextColor={Colors.textMuted}
                        />

                        {/* Benefits */}
                        <Text style={styles.formLabel}>Beneficios</Text>
                        <TextInput
                            style={styles.formInput}
                            value={benefits}
                            onChangeText={setBenefits}
                            placeholder="Separados por coma: Fuerza, Hipertrofia"
                            placeholderTextColor={Colors.textMuted}
                        />

                        {/* Submit */}
                        <TouchableOpacity style={[styles.submitButton, isSaving && { opacity: 0.7 }]} onPress={handleSubmit} disabled={isSaving}>
                            {isSaving ? (
                                <ActivityIndicator color="#000" />
                            ) : (
                                <>
                                    {!initialData && <Plus size={18} color="#000" />}
                                    <Text style={styles.submitButtonText}>{initialData ? 'Guardar Cambios' : 'Agregar Ejercicio'}</Text>
                                </>
                            )}
                        </TouchableOpacity>

                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function ExerciseScreen() {
    const { colors } = useTheme();
    const { allExercises, muscleGroups, refreshMetadata, addExercise, updateExercise } = usePlans();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<FilterOption>('Todos');
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleRefresh = useCallback(async () => {
        setIsLoading(true);
        await refreshMetadata();
        setIsLoading(false);
    }, [refreshMetadata]);

    const filters: FilterOption[] = [
        'Todos',
        ...muscleGroups,
        'Personalizados',
    ];

    // Apply search + filter
    const filteredExercises = useMemo(() => {
        let result = allExercises;

        if (filter === 'Personalizados') {
            result = result.filter((e) => e.isCustom);
        } else if (filter !== 'Todos') {
            result = result.filter((e) => e.muscleGroup === filter);
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(
                (e) =>
                    e.name.toLowerCase().includes(q) ||
                    e.primaryMuscles.some((m) => m.toLowerCase().includes(q)) ||
                    e.equipment.toLowerCase().includes(q),
            );
        }

        return result;
    }, [allExercises, filter, search]);

    // Group by muscle group for section list
    const sections = useMemo(() => {
        if (filter !== 'Todos' || search.trim()) {
            return [{ title: '', data: filteredExercises }];
        }

        return muscleGroups.map((group: string) => ({
            title: group,
            data: filteredExercises.filter((e) => e.muscleGroup === group),
        })).filter((s) => s.data.length > 0);
    }, [filteredExercises, filter, search, muscleGroups]);

    const handleAddExercise = useCallback(async (exercise: Exercise) => {
        try {
            const slug = exercise.name
                .toLowerCase()
                .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .trim();
            const payload = {
                name: exercise.name,
                slug,
                muscle_group: exercise.muscleGroup,
                equipment: exercise.equipment,
                description: exercise.description,
                is_custom: true
            };
            await api.post('/exercises', payload);
            refreshMetadata();
            showToast.success('Ejercicio creado');
        } catch (error) {
            showToast.error('Error al crear ejercicio');
        }
    }, [refreshMetadata]);

    const handleDeleteExercise = useCallback(async (id: string) => {
        try {
            await api.delete(`/exercises/${id}`);
            refreshMetadata();
            showToast.success('Ejercicio eliminado');
        } catch (error) {
            showToast.error('Error al eliminar ejercicio');
        }
    }, []);

    const renderExercise = useCallback(
        ({ item }: { item: Exercise }) => <ExerciseCard exercise={item} onDelete={handleDeleteExercise} onEdit={(ex) => setEditingExercise(ex)} />,
        [handleDeleteExercise],
    );

    const renderSectionHeader = useCallback(
        ({ section }: { section: { title: string; data: Exercise[] } }) => {
            if (!section.title) return null;
            const color = MuscleGroupColors[section.title] || Colors.primary;
            const icon = MUSCLE_ICONS[section.title] || '💪';
            return (
                <View style={styles.sectionHeader}>
                    <Text style={styles.sectionIcon}>{icon}</Text>
                    <Text style={[styles.sectionTitle, { color }]}>{section.title}</Text>
                    <View style={[styles.sectionLine, { backgroundColor: color + '20' }]} />
                    <View style={[styles.sectionCount, { backgroundColor: color + '18' }]}>
                        <Text style={[styles.sectionCountText, { color }]}>
                            {section.data?.length ?? 0}
                        </Text>
                    </View>
                </View>
            );
        },
        [],
    );

    return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
            {/* Header */}
            <View style={styles.header}>


                {/* Search */}
                <View style={styles.searchContainer}>
                    <Search size={18} color={Colors.textMuted} style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar por nombre, músculo o equipo..."
                        placeholderTextColor={Colors.textMuted}
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity
                            style={styles.searchClear}
                            onPress={() => setSearch('')}
                        >
                            <X size={14} color={Colors.textMuted} />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Filters */}
                <FlatList
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    data={filters}
                    keyExtractor={(item) => item}
                    style={styles.filterList}
                    renderItem={({ item }) => {
                        const isActive = filter === item;
                        const chipColor =
                            item !== 'Todos' && item !== 'Personalizados'
                                ? MuscleGroupColors[item]
                                : Colors.primary;

                        return (
                            <TouchableOpacity
                                style={[
                                    styles.filterChip,
                                    isActive && {
                                        backgroundColor: chipColor + '18',
                                        borderColor: chipColor,
                                    },
                                ]}
                                onPress={() => setFilter(item)}
                            >
                                <Text
                                    style={[
                                        styles.filterChipText,
                                        isActive && { color: chipColor },
                                    ]}
                                >
                                    {item}
                                </Text>
                            </TouchableOpacity>
                        );
                    }}
                />
            </View>

            {/* Exercise List */}
            <SectionList
                sections={sections}
                keyExtractor={(item) => item.id}
                renderItem={renderExercise}
                renderSectionHeader={renderSectionHeader}
                contentContainerStyle={styles.listContent}
                stickySectionHeadersEnabled={false}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconContainer}>
                            <Search size={32} color={Colors.textMuted} />
                        </View>
                        <Text style={styles.emptyText}>No se encontraron ejercicios</Text>
                        <Text style={styles.emptySubtext}>
                            Intenta con otra búsqueda o filtro
                        </Text>
                    </View>
                }
            />

            {/* FAB - Add Custom Exercise */}
            <TouchableOpacity
                style={styles.fab}
                onPress={() => setShowAddForm(true)}
                activeOpacity={0.85}
            >
                <Plus size={24} color="#000" />
            </TouchableOpacity>

            {/* Add/Edit Exercise Form Modal */}
            <AddExerciseForm
                visible={showAddForm || !!editingExercise}
                onClose={() => {
                    setShowAddForm(false);
                    setEditingExercise(null);
                }}
                initialData={editingExercise}
                onAdd={async (exercise) => {
                    if (editingExercise) {
                        await updateExercise(editingExercise.id, exercise);
                    } else {
                        await addExercise(exercise);
                    }
                    setEditingExercise(null);
                    setShowAddForm(false);
                }}
            />
        </View>
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
        paddingBottom: Spacing.xs,
    },
    titleRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: Spacing.md,
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

    // ── Search ────────────────────────────────────────────────────────────────
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.lg,
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    searchIcon: {
        marginRight: Spacing.sm,
    },
    searchInput: {
        flex: 1,
        height: 48,
        color: Colors.text,
        fontSize: 15,
    },
    searchClear: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: Colors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
    },

    // ── Filters ───────────────────────────────────────────────────────────────
    filterList: {
        marginBottom: Spacing.sm,
    },
    filterChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: borderRadius.full,
        backgroundColor: Colors.cardBg,
        marginRight: Spacing.sm,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    filterChipText: {
        color: Colors.textMuted,
        fontSize: 13,
        fontWeight: '600',
    },

    // ── List Content ──────────────────────────────────────────────────────────
    listContent: {
        paddingHorizontal: Spacing.md,
        paddingBottom: 100,
    },

    // ── Section Headers ───────────────────────────────────────────────────────
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: Spacing.lg,
        marginBottom: Spacing.sm,
        paddingVertical: 4,
    },
    sectionIcon: {
        fontSize: 16,
        marginRight: 6,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '700',
        marginRight: Spacing.sm,
    },
    sectionLine: {
        flex: 1,
        height: 1,
    },
    sectionCount: {
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: borderRadius.full,
        marginLeft: 8,
    },
    sectionCountText: {
        fontSize: 12,
        fontWeight: '700',
    },

    // ── Exercise Card ─────────────────────────────────────────────────────────
    exerciseCard: {
        backgroundColor: Colors.cardBg,
        padding: Spacing.md,
        borderRadius: borderRadius.lg,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: 'hidden',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    cardHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'stretch',
        flex: 1,
        marginRight: Spacing.sm,
    },
    accentBar: {
        width: 3,
        borderRadius: 2,
        marginRight: Spacing.sm,
        minHeight: 36,
    },
    cardTitleArea: {
        flex: 1,
        justifyContent: 'center',
    },
    exerciseName: {
        color: Colors.text,
        fontSize: 15,
        fontWeight: '700',
        letterSpacing: -0.2,
    },
    equipmentRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        gap: 4,
    },
    exerciseEquipment: {
        color: Colors.textMuted,
        fontSize: 12,
    },
    cardHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    deleteExBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: 'rgba(255, 69, 58, 0.12)',
        justifyContent: 'center',
        alignItems: 'center',
    },

    // ── Badges ────────────────────────────────────────────────────────────────
    levelBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: borderRadius.full,
        borderWidth: 1,
    },
    levelBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        letterSpacing: 0.3,
        textTransform: 'uppercase',
    },
    muscleTags: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 8,
        gap: 6,
    },
    muscleTag: {
        backgroundColor: Colors.surfaceLight,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: borderRadius.full,
    },
    muscleTagAccent: {
        backgroundColor: 'rgba(191, 255, 10, 0.08)',
        borderWidth: 1,
        borderColor: 'rgba(191, 255, 10, 0.15)',
    },
    muscleTagText: {
        color: Colors.textMuted,
        fontSize: 11,
        fontWeight: '500',
    },
    muscleTagTextAccent: {
        color: Colors.primary,
    },

    // ── Expanded Detail ───────────────────────────────────────────────────────
    expandedContent: {
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
    },
    detailSection: {
        marginBottom: Spacing.md,
    },
    detailLabelRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
        gap: 6,
    },
    detailLabelIcon: {
        fontSize: 14,
    },
    detailLabel: {
        color: Colors.text,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    detailText: {
        color: Colors.textMuted,
        fontSize: 13,
        lineHeight: 20,
        paddingLeft: 4,
    },
    benefitRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginBottom: 4,
        paddingLeft: 4,
    },
    benefitDot: {
        width: 5,
        height: 5,
        borderRadius: 3,
        backgroundColor: Colors.primary,
        marginTop: 6,
        marginRight: 8,
    },
    benefitItem: {
        color: Colors.textMuted,
        fontSize: 13,
        lineHeight: 20,
        flex: 1,
    },

    // ── Empty State ───────────────────────────────────────────────────────────
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: Spacing.xl * 3,
    },
    emptyIconContainer: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: Colors.cardBg,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    emptyText: {
        color: Colors.text,
        fontSize: 16,
        fontWeight: '600',
    },
    emptySubtext: {
        color: Colors.textMuted,
        fontSize: 14,
        marginTop: 6,
    },

    // ── FAB ───────────────────────────────────────────────────────────────────
    fab: {
        position: 'absolute',
        bottom: 28,
        right: 20,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        ...Platform.select({
            ios: {
                shadowColor: Colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
            },
            android: {
                elevation: 8,
            },
            web: {
                boxShadow: `0px 4px 12px ${Colors.primary}66`, // 0.4 opacity is approx 66 in hex
            },
        }),
    },

    // ── Modal / Form ──────────────────────────────────────────────────────────
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.7)',
        justifyContent: 'flex-end',
    },
    modalContent: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: borderRadius.xl,
        borderTopRightRadius: borderRadius.xl,
        maxHeight: '92%',
        paddingTop: Spacing.sm,
    },
    modalHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: Colors.border,
        alignSelf: 'center',
        marginBottom: Spacing.md,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.md,
    },
    modalTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    modalTitle: {
        color: Colors.text,
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    modalCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    formScroll: {
        paddingHorizontal: Spacing.md,
    },
    formLabel: {
        color: Colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 6,
        marginTop: Spacing.md,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    formInput: {
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.md,
        padding: Spacing.md,
        color: Colors.text,
        fontSize: 15,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    formTextArea: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    formChipRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    formChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: borderRadius.full,
        backgroundColor: Colors.cardBg,
        marginRight: Spacing.sm,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    formChipText: {
        color: Colors.textMuted,
        fontSize: 13,
        fontWeight: '600',
    },
    levelRow: {
        flexDirection: 'row',
        gap: 8,
    },
    submitButton: {
        backgroundColor: Colors.primary,
        borderRadius: borderRadius.lg,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: Spacing.lg,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    submitButtonText: {
        color: '#000',
        fontSize: 16,
        fontWeight: '700',
    },
});
