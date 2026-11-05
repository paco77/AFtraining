import { borderRadius, Colors, Spacing } from '@/constants/theme';
import { usePlans } from '@/context/PlanContext';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import api from '@/services/api';
import { formatDisplayDate, getSafeTimestamp } from '@/services/dateUtils';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
    Activity,
    CalendarDays,
    Camera,
    ChevronDown,
    ChevronUp,
    Dumbbell,
    Moon,
    Pencil,
    Plus,
    Ruler,
    Scale,
    Sun,
    Target,
    Trash2,
    User as UserIcon,
    Zap,
    LogOut
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { showToast } from '@/services/toast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
    const router = useRouter();
    const params = useLocalSearchParams();
    const { currentUser, clients, updateProfilePhoto, updateProfile, logout } = useUser();
    const { plans, fetchPlans } = usePlans();
    const { mode, toggle, colors } = useTheme();
    const insets = useSafeAreaInsets();
    const styles = useMemo(() => getStyles(colors, mode), [mode, colors]);
    const [isUploading, setIsUploading] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);
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

    const isCoach = currentUser?.role === 'coach';
    const isIndependent = currentUser?.role === 'independiente';

    const onRefresh = React.useCallback(async () => {
        setRefreshing(true);
        try {
            if (!isCoach) {
                await fetchProgress();
            }
            if (plans && fetchPlans) {
                await fetchPlans();
            }
        } finally {
            setRefreshing(false);
        }
    }, [isCoach, plans, fetchPlans]);

    // Edit Modal state
    const [isEditModalVisible, setIsEditModalVisible] = useState(false);
    const [dynamicMeasurements, setDynamicMeasurements] = useState<{ name: string; value: string }[]>([]);
    const [editForm, setEditForm] = useState({
        name: '',
        phone: '',
        experienceYears: '',
        formation: '',
        weight: '',
        height: '',
        age: '',
        trainingTime: '',
        objectives: '',
        trainingInfo: '',
    });

    const handleAddMeasurement = () => {
        setDynamicMeasurements(prev => [...prev, { name: '', value: '' }]);
    };

    const handleRemoveMeasurement = (index: number) => {
        setDynamicMeasurements(prev => prev.filter((_, i) => i !== index));
    };

    const updateMeasurement = (index: number, key: 'name' | 'value', val: string) => {
        setDynamicMeasurements(prev => {
            const newArr = [...prev];
            newArr[index][key] = val;
            return newArr;
        });
    };

    const openEditModal = () => {
        const u = currentUser as any;
        setEditForm({
            name: u?.name || '',
            phone: u?.phone || '',
            experienceYears: u?.experienceYears?.toString() || '',
            formation: u?.formation || '',
            weight: u?.weight ? String(u.weight) : '',
            height: u?.height ? String(u.height) : '',
            age: u?.age ? String(u.age) : '',
            trainingTime: u?.trainingTime || '',
            objectives: u?.objectives || '',
            trainingInfo: u?.trainingInfo || '',
        });

        // Load existing measurements
        let measObj: any = null;
        if (u?.latest_measurements) {
            measObj = typeof u.latest_measurements === 'string' ? JSON.parse(u.latest_measurements) : u.latest_measurements;
        } else if (u?.initial_measurements) {
            measObj = typeof u.initial_measurements === 'string' ? JSON.parse(u.initial_measurements) : u.initial_measurements;
        } else if (progressHistory && progressHistory.length > 0) {
            const found = progressHistory.find((p: any) => p.measurements && Object.keys(p.measurements).length > 0);
            if (found) {
                measObj = typeof found.measurements === 'string' ? JSON.parse(found.measurements) : found.measurements;
            }
        }

        if (measObj && Object.keys(measObj).length > 0) {
            setDynamicMeasurements(Object.entries(measObj).map(([name, val]) => ({ name, value: String(val) })));
        } else {
            setDynamicMeasurements([
                { name: 'Cintura', value: '' },
                { name: 'Pecho', value: '' },
                { name: 'Brazo', value: '' },
            ]);
        }

        setIsEditModalVisible(true);
    };

    useEffect(() => {
        if (params.edit === 'true') {
            openEditModal();
        }
    }, [params.edit]);

    const handleSaveProfile = async () => {
        setIsSavingProfile(true);
        try {
            const measurementsObj: Record<string, string> = {};
            dynamicMeasurements.forEach(m => {
                if (m.name.trim() && m.value.trim()) {
                    measurementsObj[m.name.trim()] = m.value.trim();
                }
            });

            await updateProfile({
                name: editForm.name.trim() || currentUser?.name,
                phone: editForm.phone.trim() || undefined,
                experienceYears: editForm.experienceYears ? parseInt(editForm.experienceYears, 10) : undefined,
                formation: editForm.formation,
                weight: editForm.weight ? parseFloat(editForm.weight) : undefined,
                height: editForm.height ? parseFloat(editForm.height) : undefined,
                age: editForm.age ? parseInt(editForm.age, 10) : undefined,
                trainingTime: editForm.trainingTime,
                objectives: editForm.objectives,
                trainingInfo: editForm.trainingInfo,
                measurements: measurementsObj,
            });
            await fetchProgress();
            showToast.success('Perfil actualizado correctamente');
            setIsEditModalVisible(false);
        } catch (error: any) {
            console.error('Error updating profile:', error);
            showToast.error(error.response?.data?.message || 'No se pudo actualizar el perfil');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const myPlans = useMemo(() => {
        if (!currentUser) return [];
        return plans.filter(p => String(p.assignedClientId) === String(currentUser.id));
    }, [plans, currentUser?.id]);

    if (!currentUser) {
        return (
            <View style={styles.centered}>
                <Text style={{ color: colors.text }}>No se pudo cargar el perfil</Text>
            </View>
        );
    }



    const [progressHistory, setProgressHistory] = useState<any[]>([]);
    const [isLoadingProgress, setIsLoadingProgress] = useState(false);

    useEffect(() => {
        if (!isCoach && currentUser) {
            fetchProgress();
        }
    }, [isCoach, currentUser]);

    const fetchProgress = async () => {
        if (!currentUser?.id) return;
        setIsLoadingProgress(true);
        try {
            const response = await api.get(`clients/${currentUser.id}/progress`);
            let data = Array.isArray(response.data) ? response.data : response.data.data || [];

            const cUser = currentUser as any;
            if (cUser && (cUser.weight || cUser.height)) {
                const initialDate = cUser.created_at;
                data.push({
                    id: 'initial_bio',
                    weight: cUser.weight,
                    recorded_at: initialDate,
                    created_at: initialDate,
                    comments: 'Biometría Inicial',
                    measurements: {
                        Altura: cUser.height ? `${cUser.height} cm` : undefined,
                        Edad: cUser.age ? `${cUser.age} años` : undefined
                    }
                });
            }

            data.sort((a: any, b: any) => {
                const dateA = getSafeTimestamp(a.recorded_at || a.created_at);
                const dateB = getSafeTimestamp(b.recorded_at || b.created_at);
                return dateB - dateA;
            });
            setProgressHistory(data);
        } catch (error) {
            console.log('Error fetching progress:', error);
            setProgressHistory([]);
        } finally {
            setIsLoadingProgress(false);
        }
    };

    const handlePickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            Alert.alert('Permiso denegado', 'Se requiere permiso para acceder a tus fotos.');
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.8,
        });

        if (!result.canceled && result.assets[0].uri) {
            setIsUploading(true);
            try {
                await updateProfilePhoto(result.assets[0].uri);
            } catch (error) {
                Alert.alert('Error', 'No se pudo subir la imagen.');
            } finally {
                setIsUploading(false);
            }
        }
    };

    return (
        <ScrollView
            style={styles.container}
            contentContainerStyle={[
                styles.content,
                {
                    paddingTop: Math.max(insets.top, 16) + 12,
                    paddingBottom: Math.max(insets.bottom, 24) + 40
                }
            ]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
            {/* Header / Avatar */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
                <TouchableOpacity
                    style={styles.avatarContainer}
                    onPress={handlePickImage}
                    disabled={isUploading}
                >
                    <View style={[styles.avatar, { backgroundColor: Colors.primary + '18' }]}>
                        {isUploading ? (
                            <ActivityIndicator color={Colors.primary} />
                        ) : currentUser.profilePhotoUrl ? (
                            <Image
                                source={{ uri: currentUser.profilePhotoUrl }}
                                style={styles.avatarImage}
                            />
                        ) : (
                            <UserIcon size={50} color={Colors.primary} />
                        )}
                    </View>
                    <View style={styles.editBadge}>
                        <Camera size={14} color="#000" />
                    </View>
                </TouchableOpacity>
                <Text style={styles.name}>{currentUser.name}</Text>
                <Text style={styles.username}>@{currentUser.username}</Text>
                <View style={styles.roleBadge}>
                    <Text style={styles.roleText}>{isCoach ? 'Entrenador' : isIndependent ? 'Independiente' : 'Atleta'}</Text>
                </View>

                {/* Botón Editar Perfil visible para todos los perfiles */}
                <TouchableOpacity
                    style={styles.editProfileBtn}
                    onPress={openEditModal}
                    activeOpacity={0.7}
                >
                    <Pencil size={13} color={Colors.primary} />
                    <Text style={styles.editProfileBtnText}>Editar Perfil</Text>
                </TouchableOpacity>
            </View>

            {isCoach ? (
                <View style={styles.infoSection}>
                    <View style={styles.infoCard}>
                        <View style={[styles.cardHeader, { justifyContent: 'space-between' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <UserIcon size={18} color={Colors.primary} />
                                <Text style={styles.cardTitle}>Información</Text>
                            </View>
                            <TouchableOpacity onPress={openEditModal}>
                                <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: 'bold' }}>Editar</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Email:</Text>
                            <Text style={styles.detailValue}>{currentUser.email}</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Experiencia:</Text>
                            <Text style={styles.detailValue}>{currentUser.experienceYears ? `${currentUser.experienceYears} años` : '--'}</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Formación:</Text>
                            <Text style={styles.detailValue}>{currentUser.formation || '--'}</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Clientes:</Text>
                            <Text style={styles.detailValue}>{clients.length} activos</Text>
                        </View>
                    </View>

                    {/* ── Mis Planes Personales ─────────────────────── */}
                    <Text style={styles.sectionTitle}>Mi Entrenamiento</Text>
                    {myPlans.length > 0 ? myPlans.map(plan => {
                        const isExpanded = expandedPlan === plan.id;
                        const totalExercises = plan.days.reduce((s, d) => s + d.exercises.length, 0);
                        return (
                            <View key={plan.id} style={styles.planCard}>
                                <TouchableOpacity
                                    style={styles.planCardHeader}
                                    onPress={() => setExpandedPlan(isExpanded ? null : plan.id)}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.planIconBg}>
                                        <CalendarDays size={20} color={Colors.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.planCardTitle}>{plan.month} {plan.year}</Text>
                                        <Text style={styles.planCardSub}>{plan.splitType}</Text>
                                    </View>
                                    <View style={styles.planStatChip}>
                                        <Zap size={12} color={Colors.primary} />
                                        <Text style={styles.planStatChipText}>{plan.daysPerWeek}d · {totalExercises} ej.</Text>
                                    </View>
                                    {isExpanded ? <ChevronUp size={18} color={Colors.textMuted} /> : <ChevronDown size={18} color={Colors.textMuted} />}
                                </TouchableOpacity>

                                {isExpanded && (
                                    <View style={styles.planDaysList}>
                                        {plan.days.map(day => (
                                            <View key={day.dayNumber} style={styles.planDayRow}>
                                                <Text style={styles.planDayLabel}>{day.label}</Text>
                                                <View style={styles.planDayChips}>
                                                    {day.muscleGroups.map(g => (
                                                        <View key={g} style={styles.planDayChip}>
                                                            <Text style={styles.planDayChipText}>{g}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                                {day.exercises.length > 0 && (
                                                    <View style={styles.planDayExercises}>
                                                        {day.exercises.map((pe, idx) => (
                                                            <Text key={pe.exercise.id} style={styles.planDayExText} numberOfLines={1}>
                                                                {idx + 1}. {pe.exercise.name} · {pe.sets}×{pe.minReps}-{pe.maxReps}
                                                            </Text>
                                                        ))}
                                                    </View>
                                                )}
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        );
                    }) : (
                        <View style={styles.emptyPlanCard}>
                            <Dumbbell size={24} color={Colors.textMuted} />
                            <Text style={styles.emptyPlanText}>Sin plan personal</Text>
                            <Text style={styles.emptyPlanSub}>Crea un plan asignado a ti mismo desde la pestaña Plan</Text>
                        </View>
                    )}

                    <View style={styles.infoCard}>
                        <View style={styles.cardHeader}>
                            <Target size={18} color={Colors.primary} />
                            <Text style={styles.cardTitle}>Mi Meta</Text>
                        </View>
                        <Text style={styles.cardText}>Inspirar y guiar a mis atletas para que alcancen su máximo potencial físico y mental.</Text>
                    </View>
                </View>
            ) : (
                <>
                    {/* Stats Row for Clients */}
                    <View style={styles.statsRow}>
                        <View style={styles.statBox}>
                            <Scale size={20} color={Colors.primary} />
                            <Text style={styles.statValue}>{currentUser.weight || '--'} kg</Text>
                            <Text style={styles.statLabel}>Peso Inicial</Text>
                        </View>
                        <View style={[styles.statBox, styles.statBoxBorder]}>
                            <Ruler size={20} color={Colors.primary} />
                            <Text style={styles.statValue}>{currentUser.height || '--'} cm</Text>
                            <Text style={styles.statLabel}>Altura</Text>
                        </View>
                        <View style={styles.statBox}>
                            <UserIcon size={20} color={Colors.primary} />
                            <Text style={styles.statValue}>{currentUser.age || '--'}</Text>
                            <Text style={styles.statLabel}>Años</Text>
                        </View>
                    </View>

                    {/* Detailed Info for Clients */}
                    <View style={styles.infoSection}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                            <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Información Personal</Text>
                            <TouchableOpacity onPress={openEditModal} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Pencil size={13} color={Colors.primary} />
                                <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '700' }}>Editar</Text>
                            </TouchableOpacity>
                        </View>

                        <View style={styles.infoCard}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Email:</Text>
                                <Text style={styles.detailValue}>{currentUser.email}</Text>
                            </View>
                            <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                                <Text style={styles.detailLabel}>Teléfono:</Text>
                                <Text style={styles.detailValue}>{currentUser.phone || 'No especificado'}</Text>
                            </View>
                        </View>
                        {currentUser.trainingInfo && (
                            <View style={styles.infoCard}>
                                <View style={styles.cardHeader}>
                                    <Dumbbell size={18} color={Colors.primary} />
                                    <Text style={styles.cardTitle}>Información de Entrenamiento</Text>
                                </View>
                                <Text style={styles.cardText}>{currentUser.trainingInfo}</Text>
                            </View>
                        )}

                        <View style={styles.infoCard}>
                            <View style={styles.cardHeader}>
                                <Dumbbell size={18} color={Colors.primary} />
                                <Text style={styles.cardTitle}>Experiencia</Text>
                            </View>
                            <Text style={styles.cardText}>{currentUser.trainingTime || 'No especificado'}</Text>
                        </View>

                        <View style={styles.infoCard}>
                            <View style={styles.cardHeader}>
                                <Target size={18} color={Colors.primary} />
                                <Text style={styles.cardTitle}>Objetivos</Text>
                            </View>
                            <Text style={styles.cardText}>{currentUser.objectives || 'Sin objetivos definidos'}</Text>
                        </View>

                        {/* Métricas Corporales Card */}
                        {(() => {
                            const u = currentUser as any;
                            const meas = u?.latest_measurements || u?.initial_measurements || u?.measurements || (progressHistory.find((p: any) => p.measurements && Object.keys(p.measurements).length > 0)?.measurements);
                            const measObj = meas ? (typeof meas === 'string' ? JSON.parse(meas) : meas) : null;
                            if (!measObj || Object.keys(measObj).length === 0) return null;
                            return (
                                <View style={styles.infoCard}>
                                    <View style={styles.cardHeader}>
                                        <Activity size={18} color={Colors.primary} />
                                        <Text style={styles.cardTitle}>Métricas Corporales</Text>
                                    </View>
                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                                        {Object.entries(measObj).map(([k, v]) => (
                                            <View key={k} style={{ backgroundColor: Colors.surface, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: Colors.border }}>
                                                <Text style={{ fontSize: 11, color: Colors.textMuted, fontWeight: '600' }}>{k}</Text>
                                                <Text style={{ fontSize: 14, fontWeight: '800', color: Colors.primary, marginTop: 2 }}>{String(v)}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            );
                        })()}
                    </View>




                    {/* Progress History List */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
                        <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Historial de Actualizaciones</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            {isIndependent && (
                                <TouchableOpacity 
                                    style={{
                                        backgroundColor: Colors.primary,
                                        paddingHorizontal: 10,
                                        paddingVertical: 5,
                                        borderRadius: 8,
                                    }}
                                    onPress={() => router.push({ pathname: '/client/progress/[id]', params: { id: currentUser.id } })}
                                >
                                    <Text style={{ color: '#000', fontWeight: '800', fontSize: 12 }}>+ Registrar</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity onPress={() => router.push({ pathname: '/client/evaluations/[id]', params: { id: currentUser.id } } as any)}>
                                <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 14 }}>Ver todas</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                    {isLoadingProgress ? (
                        <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
                    ) : progressHistory.length > 0 ? (
                        <View style={{ gap: 12 }}>
                            {progressHistory.slice(0, 1).map((prog, idx) => {
                                const thumb = prog.front_photo_url || prog.front_photo_path || prog.front_photo || prog.side_photo_url || prog.side_photo_path || prog.side_photo;
                                return (
                                    <TouchableOpacity
                                        key={prog.id || idx}
                                        style={styles.historyCard}
                                        activeOpacity={0.7}
                                        onPress={() => router.push({
                                            pathname: '/client/progress/detail',
                                            params: { item: JSON.stringify(prog), clientId: currentUser.id }
                                        })}
                                    >
                                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary, marginRight: 15, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 5 }} />
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.historyDate}>
                                                {formatDisplayDate(prog.recorded_at || prog.created_at, prog.id === 'initial_bio' ? 'Registro Inicial' : 'Sin fecha')}
                                            </Text>
                                            <Text style={styles.historyWeight}>Peso: {prog.weight ? `${prog.weight} kg` : '--'}</Text>

                                            {prog.measurements && Object.keys(prog.measurements).length > 0 && (
                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 4 }}>
                                                    {Object.entries(prog.measurements).map(([k, v]) => (
                                                        <View key={k} style={{ backgroundColor: Colors.primary + '15', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                                                            <Text style={{ fontSize: 11, color: Colors.primary, fontWeight: '700' }}>{k}: {v as string}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            )}

                                            {prog.comments && <Text style={styles.historyComment}>"{prog.comments}"</Text>}
                                        </View>
                                        {thumb && (
                                            <Image source={{ uri: thumb }} style={{ width: 60, height: 80, borderRadius: 8, marginLeft: 12, resizeMode: 'cover' }} />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ) : (
                        <View style={{ backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, padding: 24, alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.textMuted }}>Aún no hay progreso registrado.</Text>
                        </View>
                    )}
                </>
            )}

            {/* Theme Toggle Button */}
            <TouchableOpacity
                style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: Colors.surface,
                    paddingVertical: 16,
                    borderRadius: borderRadius.lg,
                    borderWidth: 1,
                    borderColor: Colors.border,
                    marginTop: 20,
                    marginBottom: 0,
                    gap: 8,
                }}
                activeOpacity={0.8}
                onPress={toggle}
            >
                {mode === 'dark' ? <Sun size={20} color={colors.text} /> : <Moon size={20} color={colors.text} />}
                <Text style={{ color: colors.text, fontSize: 16, fontWeight: 'bold' }}>
                    Cambiar a tema {mode === 'dark' ? 'Claro' : 'Oscuro'}
                </Text>
            </TouchableOpacity>

            {/* Logout Button */}
            <TouchableOpacity
                style={styles.logoutButton}
                activeOpacity={0.8}
                onPress={() => {
                    setOptionsPush({
                        title: 'Cerrar Sesión',
                        message: '¿Está seguro que desea finalizar su sesión?',
                        isDestructive: true,
                        options: [
                            {
                                text: 'Sí, cerrar sesión',
                                style: 'destructive',
                                onPress: () => {
                                    setOptionsPush(null);
                                    logout();
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
                <LogOut size={20} color={Colors.danger} />
                <Text style={styles.logoutText}>Cerrar Sesión</Text>
            </TouchableOpacity>



            {/* Edit Modal */}
            <Modal visible={isEditModalVisible} animationType="slide" transparent>
                <KeyboardAvoidingView 
                    style={styles.modalOverlay}
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                >
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Editar Perfil</Text>
                            <TouchableOpacity onPress={() => setIsEditModalVisible(false)}>
                                <Text style={styles.modalCloseText}>Cerrar</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                            <View style={styles.modalBody}>
                                <Text style={styles.inputLabel}>Nombre Completo</Text>
                                <TextInput
                                    style={styles.input}
                                    value={editForm.name}
                                    onChangeText={(t) => setEditForm(prev => ({ ...prev, name: t }))}
                                    placeholderTextColor={Colors.textMuted}
                                    placeholder="Tu nombre completo"
                                />

                                <Text style={styles.inputLabel}>Teléfono / WhatsApp</Text>
                                <TextInput
                                    style={styles.input}
                                    value={editForm.phone}
                                    onChangeText={(t) => setEditForm(prev => ({ ...prev, phone: t }))}
                                    keyboardType="phone-pad"
                                    placeholderTextColor={Colors.textMuted}
                                    placeholder="Ej. +52 123 456 7890"
                                />

                                {isCoach ? (
                                    <>
                                        <Text style={styles.inputLabel}>Años de Experiencia</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={editForm.experienceYears}
                                            onChangeText={(t) => setEditForm(prev => ({ ...prev, experienceYears: t }))}
                                            keyboardType="decimal-pad"
                                            placeholderTextColor={Colors.textMuted}
                                            placeholder="Ej. 5"
                                        />

                                        <Text style={styles.inputLabel}>Formación & Certificaciones</Text>
                                        <TextInput
                                            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                                            value={editForm.formation}
                                            onChangeText={(t) => setEditForm(prev => ({ ...prev, formation: t }))}
                                            multiline
                                            placeholderTextColor={Colors.textMuted}
                                            placeholder="Escribe tu formación académica y deportiva..."
                                        />
                                    </>
                                ) : (
                                    <>
                                        <View style={{ flexDirection: 'row', gap: 10 }}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.inputLabel}>Peso (kg)</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={editForm.weight}
                                                    onChangeText={(t) => setEditForm(prev => ({ ...prev, weight: t }))}
                                                    keyboardType="decimal-pad"
                                                    placeholderTextColor={Colors.textMuted}
                                                    placeholder="Ej. 75"
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.inputLabel}>Altura (cm)</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={editForm.height}
                                                    onChangeText={(t) => setEditForm(prev => ({ ...prev, height: t }))}
                                                    keyboardType="decimal-pad"
                                                    placeholderTextColor={Colors.textMuted}
                                                    placeholder="Ej. 178"
                                                />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.inputLabel}>Edad</Text>
                                                <TextInput
                                                    style={styles.input}
                                                    value={editForm.age}
                                                    onChangeText={(t) => setEditForm(prev => ({ ...prev, age: t }))}
                                                    keyboardType="number-pad"
                                                    placeholderTextColor={Colors.textMuted}
                                                    placeholder="Ej. 25"
                                                />
                                            </View>
                                        </View>

                                        <Text style={styles.inputLabel}>Tiempo Entrenando / Experiencia</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={editForm.trainingTime}
                                            onChangeText={(t) => setEditForm(prev => ({ ...prev, trainingTime: t }))}
                                            placeholderTextColor={Colors.textMuted}
                                            placeholder="Ej. 1 año / Intermedio"
                                        />

                                        <Text style={styles.inputLabel}>Objetivos Físicos</Text>
                                        <TextInput
                                            style={styles.input}
                                            value={editForm.objectives}
                                            onChangeText={(t) => setEditForm(prev => ({ ...prev, objectives: t }))}
                                            placeholderTextColor={Colors.textMuted}
                                            placeholder="Ej. Ganar masa muscular y definición"
                                        />

                                        <Text style={styles.inputLabel}>Información de Entrenamiento / Notas</Text>
                                        <TextInput
                                            style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                                            value={editForm.trainingInfo}
                                            onChangeText={(t) => setEditForm(prev => ({ ...prev, trainingInfo: t }))}
                                            multiline
                                            placeholderTextColor={Colors.textMuted}
                                            placeholder="Lesiones previas, preferencias, etc."
                                        />

                                        {/* Dynamic Measurements / Metrics */}
                                        <View style={{ marginTop: 14, paddingTop: 16, borderTopWidth: 1, borderTopColor: Colors.border }}>
                                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                                    <Activity size={18} color={Colors.primary} />
                                                    <Text style={{ fontSize: 15, fontWeight: '700', color: Colors.text }}>Métricas / Medidas</Text>
                                                </View>
                                                <TouchableOpacity
                                                    onPress={handleAddMeasurement}
                                                    style={{
                                                        flexDirection: 'row',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                        backgroundColor: Colors.primary + '18',
                                                        paddingHorizontal: 10,
                                                        paddingVertical: 5,
                                                        borderRadius: 8,
                                                    }}
                                                >
                                                    <Plus size={14} color={Colors.primary} />
                                                    <Text style={{ fontSize: 12, fontWeight: '700', color: Colors.primary }}>Añadir</Text>
                                                </TouchableOpacity>
                                            </View>

                                            {dynamicMeasurements.map((meas, idx) => (
                                                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                    <TextInput
                                                        style={[styles.input, { flex: 1.3 }]}
                                                        placeholder="Métrica (ej. Cintura)"
                                                        placeholderTextColor={Colors.textMuted}
                                                        value={meas.name}
                                                        onChangeText={(val) => updateMeasurement(idx, 'name', val)}
                                                    />
                                                    <TextInput
                                                        style={[styles.input, { flex: 1 }]}
                                                        placeholder="Valor (ej. 80 cm)"
                                                        placeholderTextColor={Colors.textMuted}
                                                        value={meas.value}
                                                        onChangeText={(val) => updateMeasurement(idx, 'value', val)}
                                                    />
                                                    <TouchableOpacity
                                                        onPress={() => handleRemoveMeasurement(idx)}
                                                        style={{
                                                            padding: 10,
                                                            borderRadius: 8,
                                                            backgroundColor: (Colors.danger || '#EF4444') + '15',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                        }}
                                                    >
                                                        <Trash2 size={16} color={Colors.danger || '#EF4444'} />
                                                    </TouchableOpacity>
                                                </View>
                                            ))}
                                        </View>
                                    </>
                                )}

                                <TouchableOpacity style={[styles.saveBtn, isSavingProfile && { opacity: 0.7 }]} onPress={handleSaveProfile} disabled={isSavingProfile}>
                                    {isSavingProfile ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Guardar Cambios</Text>}
                                </TouchableOpacity>
                            </View>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </Modal>
            {/* Options Push Bottom Sheet Modal */}
            <Modal
                visible={!!optionsPush}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setOptionsPush(null)}
            >
                <View style={styles.optionsPushBackdrop}>
                    <TouchableOpacity
                        style={StyleSheet.absoluteFill}
                        activeOpacity={1}
                        onPress={() => setOptionsPush(null)}
                    />
                    <View style={styles.optionsPushCard}>
                        <View style={styles.optionsPushHandle} />
                        <View style={styles.optionsPushHeader}>
                            <View style={[styles.optionsPushIconWrap, optionsPush?.isDestructive && styles.optionsPushIconWrapDestructive]}>
                                <LogOut size={22} color={Colors.danger} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.optionsPushTitle}>{optionsPush?.title}</Text>
                                <Text style={styles.optionsPushMessage}>{optionsPush?.message}</Text>
                            </View>
                        </View>

                        <View style={styles.optionsPushActions}>
                            {optionsPush?.options.map((opt, i) => {
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
                                        activeOpacity={0.7}
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
            </Modal>
        </ScrollView>
    );
}

const getStyles = (colors: any, mode: 'dark' | 'light') => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    content: {
        padding: Spacing.lg,
    },
    header: {
        alignItems: 'center',
        marginBottom: 30,
    },
    avatarContainer: {
        marginBottom: 16,
    },
    avatar: {
        width: 100,
        height: 100,
        borderRadius: 50,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 2,
        borderColor: colors.primary + '30',
        overflow: 'hidden',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    editBadge: {
        position: 'absolute',
        bottom: 0,
        right: 0,
        backgroundColor: Colors.primary,
        width: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 3,
        borderColor: colors.background,
    },
    name: {
        fontSize: 24,
        fontWeight: '800',
        color: colors.text,
    },
    username: {
        fontSize: 14,
        color: colors.textMuted,
        marginTop: 4,
    },
    statsRow: {
        flexDirection: 'row',
        backgroundColor: colors.cardBg,
        borderRadius: borderRadius.lg,
        padding: Spacing.md,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: colors.border,
    },
    statBox: {
        flex: 1,
        alignItems: 'center',
        gap: 4,
    },
    statBoxBorder: {
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: colors.border,
    },
    statValue: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
        marginTop: 4,
    },
    statLabel: {
        fontSize: 12,
        color: colors.textMuted,
        fontWeight: '600',
    },
    infoSection: {
        gap: 16,
        marginBottom: 30,
    },
    infoCard: {
        backgroundColor: colors.cardBg,
        borderRadius: borderRadius.lg,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: colors.border,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 10,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.text,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    cardText: {
        fontSize: 15,
        color: colors.textMuted,
        lineHeight: 22,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: colors.text,
        marginBottom: 16,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
    roleBadge: {
        backgroundColor: colors.primary + '15',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
        marginTop: 10,
        borderWidth: 1,
        borderColor: colors.primary + '30',
    },
    roleText: {
        color: colors.primary,
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    editProfileBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        paddingHorizontal: 16,
        paddingVertical: 7,
        borderRadius: 20,
        marginTop: 10,
    },
    editProfileBtnText: {
        color: colors.primary,
        fontSize: 12,
        fontWeight: '700',
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    detailLabel: {
        fontSize: 14,
        color: colors.textMuted,
        fontWeight: '600',
    },
    detailValue: {
        fontSize: 14,
        color: colors.text,
        fontWeight: '700',
        flex: 1,
        textAlign: 'right',
        marginLeft: 16,
    },
    photoGrid: {
        flexDirection: 'row',
        gap: 12,
    },
    photoContainer: {
        flex: 1,
        alignItems: 'center',
    },
    photoPlaceholder: {
        width: '100%',
        aspectRatio: 3 / 4,
        backgroundColor: colors.cardBg,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    photoLabel: {
        fontSize: 12,
        color: colors.textMuted,
        fontWeight: '600',
    },
    // ── Coach Plan Cards ────────────────────────────
    planCard: {
        backgroundColor: colors.cardBg,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 12,
        overflow: 'hidden',
    },
    planCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.md,
        gap: 12,
    },
    planIconBg: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: colors.primary + '18',
        justifyContent: 'center',
        alignItems: 'center',
    },
    planCardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: colors.text,
    },
    planCardSub: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    planStatChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: colors.primary + '12',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 8,
    },
    planStatChipText: {
        fontSize: 11,
        fontWeight: '700',
        color: colors.primary,
    },
    planDaysList: {
        borderTopWidth: 1,
        borderTopColor: colors.border,
        paddingHorizontal: Spacing.md,
        paddingVertical: 10,
        gap: 12,
    },
    planDayRow: {
        gap: 4,
    },
    planDayLabel: {
        fontSize: 14,
        fontWeight: '700',
        color: colors.text,
    },
    planDayChips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    planDayChip: {
        backgroundColor: colors.primary + '15',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    planDayChipText: {
        fontSize: 11,
        fontWeight: '600',
        color: colors.primary,
    },
    planDayExercises: {
        marginTop: 4,
        paddingLeft: 8,
    },
    planDayExText: {
        fontSize: 12,
        color: colors.textMuted,
        marginBottom: 2,
    },
    emptyPlanCard: {
        backgroundColor: colors.cardBg,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: colors.border,
        padding: Spacing.lg,
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    emptyPlanText: {
        fontSize: 15,
        fontWeight: '700',
        color: colors.text,
    },
    emptyPlanSub: {
        fontSize: 12,
        color: colors.textMuted,
        textAlign: 'center',
    },
    // Edit Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: colors.cardBg,
        borderTopLeftRadius: borderRadius.xl,
        borderTopRightRadius: borderRadius.xl,
        padding: Spacing.lg,
        maxHeight: '85%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.text,
    },
    modalCloseText: {
        color: Colors.textMuted,
        fontSize: 16,
    },
    modalBody: {
        gap: 16,
    },
    inputLabel: {
        color: Colors.text,
        fontSize: 14,
        fontWeight: '600',
        marginBottom: 8,
    },
    input: {
        backgroundColor: colors.background,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: borderRadius.md,
        padding: Spacing.md,
        color: colors.text,
        fontSize: 15,
    },
    saveBtn: {
        backgroundColor: colors.primary,
        padding: Spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        marginTop: 10,
    },
    saveBtnText: {
        color: mode === 'dark' ? '#000000' : '#FFFFFF',
        fontSize: 16,
        fontWeight: 'bold',
    },
    realPhoto: {
        width: '100%',
        aspectRatio: 3 / 4,
        borderRadius: borderRadius.md,
        marginBottom: 8,
        resizeMode: 'cover',
    },
    historyCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.cardBg,
        borderRadius: borderRadius.md,
        padding: Spacing.md,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    historyDate: {
        fontSize: 12,
        color: colors.textMuted,
        fontWeight: '700',
        marginBottom: 4,
    },
    historyWeight: {
        fontSize: 16,
        color: colors.primary,
        fontWeight: '800',
        marginBottom: 6,
    },
    historyComment: {
        fontSize: 14,
        color: colors.text,
        fontStyle: 'italic',
    },
    emptyHistoryText: {
        fontSize: 14,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: 12,
        fontStyle: 'italic',
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.surface,
        paddingVertical: 16,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: (colors.danger || '#EF4444') + '40',
        marginTop: 20,
        marginBottom: 40,
        gap: 8,
    },
    logoutText: {
        color: colors.danger || '#EF4444',
        fontSize: 16,
        fontWeight: 'bold',
    },
    optionsPushBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        justifyContent: 'flex-end',
    },
    optionsPushCard: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: Platform.OS === 'ios' ? 36 : 24,
        borderWidth: 1,
        borderColor: colors.border,
    },
    optionsPushHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: colors.border,
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
        backgroundColor: colors.primary + '15',
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
        marginBottom: 2,
    },
    optionsPushMessage: {
        fontSize: 13,
        color: colors.textMuted,
        lineHeight: 18,
    },
    optionsPushActions: {
        gap: 8,
    },
    optionsPushBtn: {
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    optionsPushBtnText: {
        fontSize: 15,
        fontWeight: '700',
    },
    optionsPushBtnPrimary: {
        backgroundColor: colors.primary,
    },
    optionsPushBtnTextPrimary: {
        color: mode === 'dark' ? '#000000' : '#FFFFFF',
        fontSize: 15,
        fontWeight: '800',
    },
    optionsPushBtnDestructive: {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderWidth: 1,
        borderColor: 'rgba(239, 68, 68, 0.4)',
    },
    optionsPushBtnTextDestructive: {
        color: colors.danger || '#EF4444',
        fontSize: 15,
        fontWeight: '800',
    },
    optionsPushBtnCancel: {
        backgroundColor: mode === 'dark' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    },
    optionsPushBtnTextCancel: {
        color: colors.textMuted,
        fontSize: 14,
        fontWeight: '600',
    },
});
