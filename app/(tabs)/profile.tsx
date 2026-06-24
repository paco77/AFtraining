import { Stack, useRouter } from 'expo-router';
import { borderRadius, Colors, Spacing } from '@/constants/theme';
import { usePlans } from '@/context/PlanContext';
import { useUser } from '@/context/UserContext';
import api from '@/services/api';
import * as ImagePicker from 'expo-image-picker';
import {
    CalendarDays,
    Camera,
    ChevronDown,
    ChevronUp,
    Dumbbell,
    Ruler,
    Scale,
    Target,
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
    Modal,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
    const router = useRouter();
    const { currentUser, clients, updateProfilePhoto, updateProfile, logout } = useUser();
    const { plans, fetchPlans } = usePlans();
    const [isUploading, setIsUploading] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [expandedPlan, setExpandedPlan] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

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
    const [editForm, setEditForm] = useState({
        experienceYears: '',
        formation: '',
    });

    const openEditModal = () => {
        setEditForm({
            experienceYears: currentUser?.experienceYears?.toString() || '',
            formation: currentUser?.formation || '',
        });
        setIsEditModalVisible(true);
    };

    const handleSaveProfile = async () => {
        setIsSavingProfile(true);
        try {
            await updateProfile({
                experienceYears: editForm.experienceYears ? parseInt(editForm.experienceYears, 10) : undefined,
                formation: editForm.formation,
            });
            setIsEditModalVisible(false);
        } catch (error) {
            Alert.alert('Error', 'No se pudo actualizar el perfil');
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
                <Text style={{ color: Colors.text }}>No se pudo cargar el perfil</Text>
            </View>
        );
    }

    const isCoach = currentUser.role === 'coach';

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
            
            if (currentUser && (currentUser.weight || currentUser.height)) {
                data.push({
                    id: 'initial_bio',
                    weight: currentUser.weight,
                    created_at: currentUser.created_at || new Date().toISOString(),
                    comments: 'Biometría Inicial',
                    measurements: {
                        Altura: currentUser.height ? `${currentUser.height} cm` : undefined,
                        Edad: currentUser.age ? `${currentUser.age} años` : undefined
                    }
                });
            }

            data.sort((a: any, b: any) => {
                const dateA = new Date(a.created_at || a.recorded_at || 0).getTime();
                const dateB = new Date(b.created_at || b.recorded_at || 0).getTime();
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
            contentContainerStyle={styles.content}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
        >
            {/* Header / Avatar */}
            <View style={styles.header}>
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
                    <Text style={styles.roleText}>{isCoach ? 'Entrenador' : 'Atleta'}</Text>
                </View>
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
                    </View>




                    {/* Progress History List */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 12 }}>
                        <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 0 }]}>Historial de Actualizaciones</Text>
                        <TouchableOpacity onPress={() => router.push({ pathname: '/client/evaluations/[id]', params: { id: currentUser.id } } as any)}>
                            <Text style={{ color: Colors.primary, fontWeight: '700', fontSize: 14 }}>Ver todas</Text>
                        </TouchableOpacity>
                    </View>
                    {isLoadingProgress ? (
                        <ActivityIndicator color={Colors.primary} style={{ marginTop: 20 }} />
                    ) : progressHistory.length > 0 ? (
                        <View style={{ gap: 12 }}>
                            {progressHistory.slice(0, 1).map((prog, idx) => (
                                <View key={prog.id || idx} style={styles.historyCard}>
                                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.primary, marginRight: 15, shadowColor: Colors.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.5, shadowRadius: 5 }} />
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.historyDate}>{new Date(prog.created_at || prog.recorded_at || Date.now()).toLocaleDateString()}</Text>
                                        <Text style={styles.historyWeight}>Peso: {prog.weight ? `${prog.weight} kg` : '--'}</Text>
                                        
                                        {prog.measurements && Object.keys(prog.measurements).length > 0 && (
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4, marginBottom: 4 }}>
                                                {Object.entries(prog.measurements).map(([k, v]) => (
                                                    <View key={k} style={{ backgroundColor: 'rgba(204, 255, 0, 0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                                                        <Text style={{ fontSize: 11, color: Colors.primary, fontWeight: '700' }}>{k}: {v as string}</Text>
                                                    </View>
                                                ))}
                                            </View>
                                        )}

                                        {prog.comments && <Text style={styles.historyComment}>"{prog.comments}"</Text>}
                                    </View>
                                </View>
                            ))}
                        </View>
                    ) : (
                        <View style={{ backgroundColor: Colors.surface, borderRadius: 20, borderWidth: 1, borderStyle: 'dashed', borderColor: Colors.border, padding: 24, alignItems: 'center', gap: 8 }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: Colors.textMuted }}>Aún no hay progreso registrado.</Text>
                        </View>
                    )}
                </>
            )}

            {/* Logout Button */}
            <TouchableOpacity 
                style={styles.logoutButton} 
                activeOpacity={0.8}
                onPress={async () => {
                    await logout();
                    router.replace('/login');
                }}
            >
                <LogOut size={20} color={Colors.danger} />
                <Text style={styles.logoutText}>Cerrar Sesión</Text>
            </TouchableOpacity>

            {/* Edit Modal */}
            <Modal visible={isEditModalVisible} animationType="slide" transparent>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContainer}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Editar Perfil</Text>
                            <TouchableOpacity onPress={() => setIsEditModalVisible(false)}>
                                <Text style={styles.modalCloseText}>Cerrar</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={styles.modalBody}>
                            <Text style={styles.inputLabel}>Años de Experiencia</Text>
                            <TextInput
                                style={styles.input}
                                value={editForm.experienceYears}
                                onChangeText={(t) => setEditForm(prev => ({ ...prev, experienceYears: t }))}
                                keyboardType="decimal-pad"
                                placeholderTextColor={Colors.textMuted}
                                placeholder="Ej. 5"
                            />

                            <Text style={styles.inputLabel}>Formación</Text>
                            <TextInput
                                style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
                                value={editForm.formation}
                                onChangeText={(t) => setEditForm(prev => ({ ...prev, formation: t }))}
                                multiline
                                placeholderTextColor={Colors.textMuted}
                                placeholder="Escribe tu formación..."
                            />

                            <TouchableOpacity style={[styles.saveBtn, isSavingProfile && { opacity: 0.7 }]} onPress={handleSaveProfile} disabled={isSavingProfile}>
                                {isSavingProfile ? <ActivityIndicator color="#000" /> : <Text style={styles.saveBtnText}>Guardar</Text>}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
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
        borderColor: Colors.primary + '30',
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
        borderColor: Colors.background,
    },
    name: {
        fontSize: 24,
        fontWeight: '800',
        color: Colors.text,
    },
    username: {
        fontSize: 14,
        color: Colors.textMuted,
        marginTop: 4,
    },
    statsRow: {
        flexDirection: 'row',
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.lg,
        padding: Spacing.md,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    statBox: {
        flex: 1,
        alignItems: 'center',
        gap: 4,
    },
    statBoxBorder: {
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: Colors.border,
    },
    statValue: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text,
        marginTop: 4,
    },
    statLabel: {
        fontSize: 12,
        color: Colors.textMuted,
        fontWeight: '600',
    },
    infoSection: {
        gap: 16,
        marginBottom: 30,
    },
    infoCard: {
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.lg,
        padding: Spacing.md,
        borderWidth: 1,
        borderColor: Colors.border,
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
        color: Colors.text,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    cardText: {
        fontSize: 15,
        color: Colors.textMuted,
        lineHeight: 22,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: Colors.text,
        marginBottom: 16,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Colors.background,
    },
    roleBadge: {
        backgroundColor: 'rgba(204, 255, 0, 0.1)',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
        marginTop: 10,
        borderWidth: 1,
        borderColor: Colors.primary + '30',
    },
    roleText: {
        color: Colors.primary,
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    detailLabel: {
        fontSize: 14,
        color: Colors.textMuted,
        fontWeight: '600',
    },
    detailValue: {
        fontSize: 14,
        color: Colors.text,
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
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.md,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: Colors.border,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 8,
    },
    photoLabel: {
        fontSize: 12,
        color: Colors.textMuted,
        fontWeight: '600',
    },
    // ── Coach Plan Cards ────────────────────────────
    planCard: {
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.border,
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
        backgroundColor: Colors.primary + '18',
        justifyContent: 'center',
        alignItems: 'center',
    },
    planCardTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text,
    },
    planCardSub: {
        fontSize: 12,
        color: Colors.textMuted,
        marginTop: 2,
    },
    planStatChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: Colors.primary + '12',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        marginRight: 8,
    },
    planStatChipText: {
        fontSize: 11,
        fontWeight: '700',
        color: Colors.primary,
    },
    planDaysList: {
        borderTopWidth: 1,
        borderTopColor: Colors.border,
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
        color: Colors.text,
    },
    planDayChips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 4,
    },
    planDayChip: {
        backgroundColor: Colors.primary + '15',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 8,
    },
    planDayChipText: {
        fontSize: 11,
        fontWeight: '600',
        color: Colors.primary,
    },
    planDayExercises: {
        marginTop: 4,
        paddingLeft: 8,
    },
    planDayExText: {
        fontSize: 12,
        color: Colors.textMuted,
        marginBottom: 2,
    },
    emptyPlanCard: {
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: Colors.border,
        padding: Spacing.lg,
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    emptyPlanText: {
        fontSize: 15,
        fontWeight: '700',
        color: Colors.text,
    },
    emptyPlanSub: {
        fontSize: 12,
        color: Colors.textMuted,
        textAlign: 'center',
    },
    // Edit Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    modalContainer: {
        backgroundColor: Colors.cardBg,
        borderTopLeftRadius: borderRadius.xl,
        borderTopRightRadius: borderRadius.xl,
        padding: Spacing.lg,
        minHeight: '50%',
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
        backgroundColor: Colors.background,
        borderWidth: 1,
        borderColor: Colors.border,
        borderRadius: borderRadius.md,
        padding: Spacing.md,
        color: Colors.text,
        fontSize: 15,
    },
    saveBtn: {
        backgroundColor: Colors.primary,
        padding: Spacing.md,
        borderRadius: borderRadius.md,
        alignItems: 'center',
        marginTop: 10,
    },
    saveBtnText: {
        color: Colors.background,
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
        backgroundColor: Colors.cardBg,
        borderRadius: borderRadius.md,
        padding: Spacing.md,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    historyDate: {
        fontSize: 12,
        color: Colors.textMuted,
        fontWeight: '700',
        marginBottom: 4,
    },
    historyWeight: {
        fontSize: 16,
        color: Colors.primary,
        fontWeight: '800',
        marginBottom: 6,
    },
    historyComment: {
        fontSize: 14,
        color: Colors.text,
        fontStyle: 'italic',
    },
    emptyHistoryText: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: 12,
        fontStyle: 'italic',
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surface,
        paddingVertical: 16,
        borderRadius: borderRadius.lg,
        borderWidth: 1,
        borderColor: Colors.danger + '40',
        marginTop: 20,
        marginBottom: 40,
        gap: 8,
    },
    logoutText: {
        color: Colors.danger,
        fontSize: 16,
        fontWeight: 'bold',
    },
});
