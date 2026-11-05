import {
    Exercise,
    inferMuscleGroupFromName,
    isSameMuscleGroup,
    Level,
    MuscleGroup,
    sanitizeExerciseGroup,
} from '@/constants/ExerciseData';
import { borderRadius, Colors, MuscleGroupColors, Spacing } from '@/constants/theme';
import { usePlans } from '@/context/PlanContext';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { API_HOST } from '@/services/api';
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
    Video,
    Link2,
} from 'lucide-react-native';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { SafeVideo } from '@/components/SafeVideo';
import { ExternalVideoCard } from '@/components/ExternalVideoCard';
import { isExternalVideoLink, isValidWebUrl, normalizeVideoLink } from '@/services/videoLinks';
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
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [colors, mode]);
    const isIntermediate = level === 'Intermedio';
    return (
        <View
            style={[
                styles.levelBadge,
                {
                    backgroundColor: isIntermediate
                        ? 'rgba(247, 183, 49, 0.15)'
                        : (mode === 'dark' ? 'rgba(93, 166, 255, 0.15)' : 'rgba(29, 78, 216, 0.12)'),
                    borderColor: isIntermediate
                        ? 'rgba(247, 183, 49, 0.3)'
                        : (mode === 'dark' ? 'rgba(93, 166, 255, 0.3)' : 'rgba(29, 78, 216, 0.25)'),
                },
            ]}
        >
            <Text
                style={[
                    styles.levelBadgeText,
                    { color: isIntermediate ? '#f7b731' : colors.primary },
                ]}
            >
                {level}
            </Text>
        </View>
    );
};

// ─── Muscle Tag Component ─────────────────────────────────────────────────────

const MuscleTag = ({ name, accent }: { name: string; accent?: boolean }) => {
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [colors, mode]);
    return (
        <View style={[styles.muscleTag, accent && styles.muscleTagAccent]}>
            <Text style={[styles.muscleTagText, accent && styles.muscleTagTextAccent]}>
                {name}
            </Text>
        </View>
    );
};

// ─── Exercise Card Component ──────────────────────────────────────────────────

const ExerciseCard = ({ exercise, onDelete, onEdit }: { exercise: Exercise; onDelete?: (id: string) => void; onEdit?: (exercise: Exercise) => void }) => {
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [colors, mode]);
    const [expanded, setExpanded] = useState(false);
    const groupColor = MuscleGroupColors[exercise.muscleGroup] || colors.primary;

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
                            <Dumbbell size={12} color={colors.textMuted} />
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
                                    <Edit2 size={14} color={colors.textMuted} />
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
                                    <Trash2 size={14} color={colors.danger} />
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                    <LevelBadge level={exercise.level} />
                    {expanded ? (
                        <ChevronUp size={16} color={colors.textMuted} />
                    ) : (
                        <ChevronDown size={16} color={colors.textMuted} />
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

                    {/* Video URL */}
                    {exercise.videoUrl ? (
                        <View style={styles.detailSection}>
                            <View style={styles.detailLabelRow}>
                                <Text style={styles.detailLabelIcon}>🎥</Text>
                                <Text style={styles.detailLabel}>Video/GIF</Text>
                            </View>
                            {isExternalVideoLink(exercise.videoUrl) ? (
                                <ExternalVideoCard
                                    url={exercise.videoUrl}
                                    style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12, marginTop: 8 }}
                                />
                            ) : exercise.videoUrl.toLowerCase().includes('.mp4') ? (
                                <SafeVideo
                                    sourceUri={exercise.videoUrl.startsWith('http') ? exercise.videoUrl : `${API_HOST}${exercise.videoUrl.startsWith('/') ? '' : '/'}${exercise.videoUrl}`}
                                    style={{ width: '100%', height: 250, borderRadius: 12, marginTop: 8, backgroundColor: '#0F172A' }}
                                    isLooping
                                />
                            ) : (
                                <Image 
                                    source={{ uri: exercise.videoUrl.startsWith('http') ? exercise.videoUrl : `${API_HOST}${exercise.videoUrl.startsWith('/') ? '' : '/'}${exercise.videoUrl}` }} 
                                    style={{ width: '100%', height: 250, borderRadius: 12, marginTop: 8, backgroundColor: '#0F172A' }} 
                                    contentFit="contain" 
                                />
                            )}
                        </View>
                    ) : null}
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
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [colors, mode]);
    const [name, setName] = useState('');
    const [equipment, setEquipment] = useState('');
    const [description, setDescription] = useState('');
    const [primaryMuscles, setPrimaryMuscles] = useState('');
    const [secondaryMuscles, setSecondaryMuscles] = useState('');
    const [benefits, setBenefits] = useState('');
    const [videoUrl, setVideoUrl] = useState('');
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
            setVideoUrl(initialData.videoUrl || '');
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
        setVideoUrl('');
        setSelectedGroup(muscleGroups[0] || 'Pecho');
        setSelectedLevel('Principiante');
    };

    const handleSubmit = async () => {
        if (!name.trim() || !equipment.trim()) {
            Alert.alert('Campos requeridos', 'Por favor completa al menos el nombre y equipo.');
            return;
        }

        const isLocalFile = videoUrl.startsWith('file');
        if (videoUrl.trim() && !isLocalFile && !videoUrl.startsWith('/') && !isValidWebUrl(videoUrl)) {
            Alert.alert('Link inválido', 'Ingresa un enlace válido (YouTube, Instagram, TikTok, etc.).');
            return;
        }
        const finalVideoUrl = isLocalFile || videoUrl.startsWith('/') ? videoUrl.trim() : normalizeVideoLink(videoUrl);

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
            videoUrl: finalVideoUrl,
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
                            onChangeText={(val) => {
                                setName(val);
                                if (!initialData) {
                                    const inferred = inferMuscleGroupFromName(val);
                                    if (inferred) {
                                        const match = muscleGroups.find(g => isSameMuscleGroup(g, inferred));
                                        if (match) setSelectedGroup(match);
                                    }
                                }
                            }}
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
                            placeholderTextColor={colors.textMuted}
                        />

                        {/* Video File */}
                        <Text style={styles.formLabel}>Video (Opcional)</Text>
                        <TouchableOpacity
                            style={[styles.formInput, { justifyContent: 'center', alignItems: 'center', backgroundColor: mode === 'dark' ? colors.surfaceLight : colors.surface_lowest }]}
                            onPress={async () => {
                                const result = await ImagePicker.launchImageLibraryAsync({
                                    mediaTypes: ImagePicker.MediaTypeOptions.Videos,
                                    allowsEditing: true,
                                    quality: 0.8,
                                });
                                if (!result.canceled) {
                                    setVideoUrl(result.assets[0].uri);
                                }
                            }}
                        >
                            {videoUrl && (videoUrl.startsWith('file') || videoUrl.startsWith('/') || (/^https?:\/\//i.test(videoUrl) && !isExternalVideoLink(videoUrl))) ? (
                                <Text style={{ color: colors.primary }} numberOfLines={1}>
                                    {videoUrl.split('/').pop() || 'Video seleccionado'}
                                </Text>
                            ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    <Video size={18} color={colors.textMuted} />
                                    <Text style={{ color: colors.textMuted }}>Seleccionar video</Text>
                                </View>
                            )}
                        </TouchableOpacity>

                        {/* Video Link */}
                        <View style={styles.orDividerRow}>
                            <View style={styles.orDividerLine} />
                            <Text style={styles.orDividerText}>o pega un link</Text>
                            <View style={styles.orDividerLine} />
                        </View>
                        <View style={[styles.formInput, { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 0 }]}>
                            <Link2 size={18} color={isExternalVideoLink(normalizeVideoLink(videoUrl)) ? colors.primary : colors.textMuted} />
                            <TextInput
                                style={{ flex: 1, color: colors.text, fontSize: 15, paddingVertical: 12 }}
                                value={videoUrl.startsWith('file') || videoUrl.startsWith('/') ? '' : videoUrl}
                                onChangeText={setVideoUrl}
                                placeholder="YouTube, Instagram, TikTok..."
                                placeholderTextColor={colors.textMuted}
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="url"
                            />
                            {videoUrl.length > 0 && (
                                <TouchableOpacity onPress={() => setVideoUrl('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <X size={16} color={colors.textMuted} />
                                </TouchableOpacity>
                            )}
                        </View>
                        {isExternalVideoLink(normalizeVideoLink(videoUrl)) && isValidWebUrl(videoUrl) && (
                            <ExternalVideoCard
                                url={normalizeVideoLink(videoUrl)}
                                style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 12, marginTop: 4 }}
                            />
                        )}

                        {/* Submit */}
                        <TouchableOpacity style={[styles.submitButton, isSaving && { opacity: 0.7 }]} onPress={handleSubmit} disabled={isSaving}>
                            {isSaving ? (
                                <ActivityIndicator color={mode === 'dark' ? '#000' : '#FFF'} />
                            ) : (
                                <>
                                    {!initialData && <Plus size={18} color={mode === 'dark' ? '#000' : '#FFF'} />}
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
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [colors, mode]);
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
            result = result.filter((e) => {
                const effectiveGroup = sanitizeExerciseGroup(e.name, e.muscleGroup);
                return isSameMuscleGroup(effectiveGroup, filter);
            });
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
            data: filteredExercises.filter((e) => {
                const effectiveGroup = sanitizeExerciseGroup(e.name, e.muscleGroup);
                return isSameMuscleGroup(effectiveGroup, group);
            }),
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
                video_url: exercise.videoUrl,
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
                    <Search size={18} color={colors.textMuted} style={styles.searchIcon} />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar por nombre, músculo o equipo..."
                        placeholderTextColor={colors.textMuted}
                        value={search}
                        onChangeText={setSearch}
                    />
                    {search.length > 0 && (
                        <TouchableOpacity
                            style={styles.searchClear}
                            onPress={() => setSearch('')}
                        >
                            <X size={14} color={colors.textMuted} />
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
                                : colors.primary;

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
                keyExtractor={(item, index) => item?.id || String(index)}
                renderItem={renderExercise}
                renderSectionHeader={renderSectionHeader}
                contentContainerStyle={styles.listContent}
                stickySectionHeadersEnabled={false}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <View style={styles.emptyIconContainer}>
                            <Search size={32} color={colors.textMuted} />
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
                <Plus size={24} color={mode === 'dark' ? '#000' : '#FFF'} />
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

const getStyles = (colors: any, mode: 'dark' | 'light') => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
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
        color: colors.text,
        fontSize: 32,
        fontWeight: '800',
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
        backgroundColor: mode === 'dark' ? 'rgba(93, 166, 255, 0.1)' : 'rgba(29, 78, 216, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(93, 166, 255, 0.2)' : 'rgba(29, 78, 216, 0.2)',
    },

    // ── Search ────────────────────────────────────────────────────────────────
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.surface,
        borderRadius: borderRadius.lg,
        paddingHorizontal: Spacing.md,
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    searchIcon: {
        marginRight: Spacing.sm,
    },
    searchInput: {
        flex: 1,
        height: 48,
        color: colors.text,
        fontSize: 15,
    },
    searchClear: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: mode === 'dark' ? colors.surfaceLight : colors.surface_container_low,
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
        backgroundColor: colors.surface,
        marginRight: Spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    filterChipText: {
        color: colors.textMuted,
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
        backgroundColor: colors.surface,
        padding: Spacing.md,
        borderRadius: borderRadius.lg,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: colors.border,
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
        color: colors.text,
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
        color: colors.textMuted,
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
        backgroundColor: mode === 'dark' ? 'rgba(255, 69, 58, 0.12)' : 'rgba(239, 68, 68, 0.1)',
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
        backgroundColor: mode === 'dark' ? colors.surfaceLight : colors.surface_container_low,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: borderRadius.full,
    },
    muscleTagAccent: {
        backgroundColor: mode === 'dark' ? 'rgba(93, 166, 255, 0.12)' : 'rgba(29, 78, 216, 0.1)',
        borderWidth: 1,
        borderColor: mode === 'dark' ? 'rgba(93, 166, 255, 0.25)' : 'rgba(29, 78, 216, 0.2)',
    },
    muscleTagText: {
        color: colors.textMuted,
        fontSize: 11,
        fontWeight: '500',
    },
    muscleTagTextAccent: {
        color: colors.primary,
    },

    // ── Expanded Detail ───────────────────────────────────────────────────────
    expandedContent: {
        marginTop: Spacing.md,
        paddingTop: Spacing.md,
        borderTopWidth: 1,
        borderTopColor: colors.border,
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
        color: colors.text,
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.2,
    },
    detailText: {
        color: colors.textMuted,
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
        backgroundColor: colors.primary,
        marginTop: 6,
        marginRight: 8,
    },
    benefitItem: {
        color: colors.textMuted,
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
        backgroundColor: colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: Spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    emptyText: {
        color: colors.text,
        fontSize: 16,
        fontWeight: '600',
    },
    emptySubtext: {
        color: colors.textMuted,
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
        backgroundColor: colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        ...Platform.select({
            ios: {
                shadowColor: colors.primary,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.4,
                shadowRadius: 12,
            },
            android: {
                elevation: 8,
            },
            web: {
                boxShadow: `0px 4px 12px ${colors.primary}66`,
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
        backgroundColor: colors.surface,
        borderTopLeftRadius: borderRadius.xl,
        borderTopRightRadius: borderRadius.xl,
        maxHeight: '92%',
        paddingTop: Spacing.sm,
    },
    modalHandle: {
        width: 36,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.border,
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
        color: colors.text,
        fontSize: 20,
        fontWeight: '800',
        letterSpacing: -0.3,
    },
    modalCloseBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: mode === 'dark' ? colors.surfaceLight : colors.surface_container_low,
        justifyContent: 'center',
        alignItems: 'center',
    },
    formScroll: {
        paddingHorizontal: Spacing.md,
    },
    formLabel: {
        color: colors.textMuted,
        fontSize: 12,
        fontWeight: '600',
        marginBottom: 6,
        marginTop: Spacing.md,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    formInput: {
        backgroundColor: mode === 'dark' ? colors.surfaceLight : colors.surface_lowest,
        borderRadius: borderRadius.md,
        padding: Spacing.md,
        color: colors.text,
        fontSize: 15,
        borderWidth: 1,
        borderColor: colors.border,
    },
    formTextArea: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    orDividerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginVertical: 10,
    },
    orDividerLine: {
        flex: 1,
        height: 1,
        backgroundColor: colors.border,
    },
    orDividerText: {
        color: colors.textMuted,
        fontSize: 11,
        fontWeight: '600',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    formChipRow: {
        flexDirection: 'row',
        marginBottom: 4,
    },
    formChip: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: borderRadius.full,
        backgroundColor: colors.surface,
        marginRight: Spacing.sm,
        borderWidth: 1,
        borderColor: colors.border,
    },
    formChipText: {
        color: colors.textMuted,
        fontSize: 13,
        fontWeight: '600',
    },
    levelRow: {
        flexDirection: 'row',
        gap: 8,
    },
    submitButton: {
        backgroundColor: colors.primary,
        borderRadius: borderRadius.lg,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: Spacing.lg,
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 8,
    },
    submitButtonText: {
        color: mode === 'dark' ? '#000' : '#FFF',
        fontSize: 16,
        fontWeight: '700',
    },
});
