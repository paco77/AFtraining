import { Colors, Spacing } from '@/constants/theme';
import { useUser } from '@/context/UserContext';
import api from '@/services/api';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, ChevronRight, ClipboardList, Dumbbell, Trash2, User } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

export default function ClientHistory() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { clients, currentUser } = useUser();

    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const client = useMemo(() => clients.find(c => c.id === id), [clients, id]);
    const isCoach = currentUser?.role === 'coach';

    useEffect(() => {
        if (id) {
            fetchClientPlans();
        }
    }, [id]);

    const fetchClientPlans = async () => {
        try {
            setLoading(true);
            const response = await api.get('plans', { params: { client_id: id } });
            setPlans(response.data.data || []);
        } catch (error) {
            console.error('Error fetching client plans:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePlan = (planId: number, name: string) => {
        Alert.alert(
            "Eliminar Plan",
            `¿Estás seguro de que deseas eliminar el plan de ${name}? Esta acción no se puede deshacer.`,
            [
                { text: "Cancelar", style: "cancel" },
                {
                    text: "Eliminar",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await api.delete(`plans/${planId}`);
                            setPlans(prev => prev.filter(p => p.id !== planId));
                            Alert.alert("Éxito", "Plan eliminado correctamente.");
                        } catch (error) {
                            console.error('Error deleting plan:', error);
                            Alert.alert("Error", "No se pudo eliminar el plan.");
                        }
                    }
                }
            ]
        );
    };

    const renderPlanItem = ({ item }: { item: any }) => (
        <View style={styles.planCard}>
            <TouchableOpacity
                style={styles.planHeader}
                onPress={() => router.push({ pathname: '/client/plan/[id]', params: { id: item.id } })}
            >
                <View style={styles.planIconContainer}>
                    <ClipboardList size={22} color={Colors.primary} />
                </View>
                <View style={styles.planTitleContainer}>
                    <Text style={styles.planTitle}>Plan {item.month} {item.year}</Text>
                    <Text style={styles.planSubtitle}>{item.days_per_week} días por semana • {item.split_type}</Text>
                </View>
                <ChevronRight size={20} color={Colors.textMuted} />
            </TouchableOpacity>

            <View style={styles.planDetails}>
                <View style={styles.planFooterRow}>
                    <View style={styles.planStatsList}>
                        <View style={styles.planStat}>
                            <Calendar size={14} color={Colors.textMuted} />
                            <Text style={styles.planStatText}>Asignado el {new Date(item.created_at).toLocaleDateString()}</Text>
                        </View>
                        <View style={styles.planStat}>
                            <Dumbbell size={14} color={Colors.textMuted} />
                            <Text style={styles.planStatText}>{item.training_days?.length || 0} Sesiones definidas</Text>
                        </View>
                    </View>

                    {isCoach && (
                        <TouchableOpacity
                            onPress={() => handleDeletePlan(item.id, `Plan ${item.month} ${item.year}`)}
                            style={styles.deleteBtn}
                        >
                            <Trash2 size={18} color={Colors.danger} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </View>
    );

    if (!client) {
        return (
            <View style={styles.centered}>
                <Text style={styles.errorText}>No se encontró el cliente</Text>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backBtnText}>Volver</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <Stack.Screen options={{
                headerShown: true,
                headerTitle: 'Historial de Planes',
                headerTransparent: true,
                headerTintColor: '#fff',
                headerLeft: () => (
                    <TouchableOpacity onPress={() => router.back()} style={styles.headerBack}>
                        <ArrowLeft size={24} color="#fff" />
                    </TouchableOpacity>
                ),
            }} />
            <StatusBar barStyle="light-content" />

            <View style={styles.topHeader}>
                <View style={styles.clientSummary}>
                    <View style={styles.avatarSmall}>
                        <User size={20} color={Colors.primary} />
                    </View>
                    <Text style={styles.clientNameHeader}>{client.name}</Text>
                </View>
            </View>

            {loading ? (
                <View style={styles.centered}>
                    <ActivityIndicator size="large" color={Colors.primary} />
                    <Text style={styles.loadingText}>Cargando historial...</Text>
                </View>
            ) : (
                <FlatList
                    data={plans}
                    renderItem={renderPlanItem}
                    keyExtractor={(item) => String(item.id)}
                    contentContainerStyle={styles.listContent}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIconCircle}>
                                <ClipboardList size={40} color={Colors.textMuted} />
                            </View>
                            <Text style={styles.emptyTitle}>Sin planes registrados</Text>
                            <Text style={styles.emptySubtitle}>Este cliente aún no tiene planes de entrenamiento asignados.</Text>
                            <TouchableOpacity
                                style={styles.createBtn}
                                onPress={() => router.push({ pathname: '/(tabs)/plan', params: { clientId: client.id } })}
                            >
                                <Text style={styles.createBtnText}>Crear Primer Plan</Text>
                            </TouchableOpacity>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    topHeader: {
        backgroundColor: Colors.surface,
        paddingTop: 100,
        paddingBottom: 20,
        paddingHorizontal: Spacing.md,
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    clientSummary: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    avatarSmall: {
        width: 36,
        height: 36,
        borderRadius: 12,
        backgroundColor: Colors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
    },
    clientNameHeader: {
        fontSize: 18,
        fontWeight: '800',
        color: '#fff',
    },
    headerBack: {
        marginLeft: 10,
    },
    listContent: {
        padding: Spacing.md,
        paddingTop: 20,
        gap: 16,
    },
    planCard: {
        backgroundColor: Colors.surface,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    planHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 15,
    },
    planIconContainer: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: 'rgba(204, 255, 0, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    planTitleContainer: {
        flex: 1,
    },
    planTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: Colors.text,
    },
    planSubtitle: {
        fontSize: 13,
        color: Colors.textMuted,
        marginTop: 2,
        fontWeight: '600',
    },
    planDetails: {
        paddingTop: 15,
        borderTopWidth: 1,
        borderTopColor: Colors.border,
        gap: 8,
    },
    planStat: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    planStatText: {
        fontSize: 13,
        color: Colors.textMuted,
        fontWeight: '500',
    },
    planFooterRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    planStatsList: {
        flex: 1,
        gap: 8,
    },
    deleteBtn: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: 'rgba(255, 68, 68, 0.1)',
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: 'rgba(255, 68, 68, 0.2)',
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    loadingText: {
        marginTop: 15,
        color: Colors.textMuted,
        fontWeight: '600',
    },
    errorText: {
        color: Colors.textMuted,
        fontSize: 16,
        marginBottom: 20,
    },
    backBtn: {
        backgroundColor: Colors.primary,
        paddingHorizontal: 30,
        paddingVertical: 12,
        borderRadius: 12,
    },
    backBtnText: {
        color: '#000',
        fontWeight: 'bold',
    },
    emptyContainer: {
        alignItems: 'center',
        paddingTop: 60,
    },
    emptyIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 30,
        backgroundColor: Colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '900',
        color: Colors.text,
        textAlign: 'center',
    },
    emptySubtitle: {
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 20,
        paddingHorizontal: 20,
    },
    createBtn: {
        marginTop: 25,
        backgroundColor: Colors.primary,
        paddingHorizontal: 24,
        paddingVertical: 14,
        borderRadius: 16,
    },
    createBtnText: {
        color: '#000',
        fontWeight: '800',
        fontSize: 14,
    }
});
