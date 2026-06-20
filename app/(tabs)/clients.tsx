import { Colors, Fonts, borderRadius, Spacing } from '@/constants/theme';
import { useUser } from '@/context/UserContext';
import { useRouter } from 'expo-router';
import { CalendarDays, ChevronRight, Dumbbell, Info, Plus, User, Users } from 'lucide-react-native';
import React from 'react';
import {
    Dimensions,
    FlatList,
    Image,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';

const { width } = Dimensions.get('window');

export default function ClientsScreen() {
    const router = useRouter();
    const { clients } = useUser();

    const renderClientCard = ({ item }: { item: any }) => (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => router.push({ pathname: '/client/[id]', params: { id: item.id } })}
        >
            <View style={styles.cardHeader}>
                <View style={styles.avatar}>
                    {item.profilePhotoUrl ? (
                        <Image
                            source={{ uri: item.profilePhotoUrl }}
                            style={styles.avatarImage}
                        />
                    ) : (
                        <User size={24} color={Colors.primary} />
                    )}
                </View>
                <View style={styles.clientInfo}>
                    <Text style={styles.clientName}>{item.name}</Text>
                    <Text style={styles.clientGoal}>{item.objectives}</Text>
                </View>
                <ChevronRight size={20} color={Colors.textMuted} />
            </View>
            <View style={styles.cardStats}>
                <View style={styles.stat}>
                    <Text style={styles.statLabel}>edad</Text>
                    <Text style={styles.statValue}>{item.age}</Text>
                </View>
                <View style={styles.stat}>
                    <Text style={styles.statLabel}>peso</Text>
                    <Text style={styles.statValue}>{item.weight}</Text>
                </View>
                <View style={styles.stat}>
                    <Text style={styles.statLabel}>tiempo</Text>
                    <Text style={styles.statValue}>{item.trainingTime}</Text>
                </View>
            </View>

            <View style={styles.actionRow}>
                <TouchableOpacity
                    style={[styles.actionBtn, styles.assignBtn]}
                    activeOpacity={0.8}
                    onPress={() => router.push({
                        pathname: '/(tabs)/plan',
                        params: { clientId: item.id }
                    })}
                >
                    <CalendarDays size={14} color={Colors.white} />
                    <Text style={styles.actionBtnText}>Asignar Plan</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    style={[styles.actionBtn, styles.viewPlansBtn]}
                    activeOpacity={0.8}
                    onPress={() => router.push({
                        pathname: '/(tabs)/plan',
                        params: { filterClientId: item.id }
                    })}
                >
                    <Dumbbell size={14} color={Colors.primary} />
                    <Text style={styles.viewPlansBtnText}>Ver Planes</Text>
                </TouchableOpacity>
            </View>
            <View style={styles.actionRow}>

                <TouchableOpacity
                    style={[styles.actionBtn, styles.secondaryBtn]}
                    activeOpacity={0.8}
                    onPress={() => router.push({ pathname: '/client/[id]', params: { id: item.id } })}
                >
                    <Info size={14} color={Colors.text} />
                    <Text style={styles.secondaryBtnText}>Info</Text>
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View />
                <TouchableOpacity
                    style={styles.addBtn}
                    // turbo
                    onPress={() => router.push('/(tabs)/new-client')}
                >
                    <Plus size={18} color={Colors.white} />
                    <Text style={styles.addBtnText}>Añadir</Text>
                </TouchableOpacity>
            </View>

            {clients.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <View style={styles.emptyIcon}>
                        <Users size={48} color={Colors.textMuted} />
                    </View>
                    <Text style={styles.emptyTitle}>No tienes clientes todavía</Text>
                    <Text style={styles.emptySubtitle}>Comienza agregando a tu primer entrenado para gestionar su plan.</Text>
                </View>
            ) : (
                <FlatList
                    data={clients}
                    keyExtractor={(item) => item.id}
                    renderItem={renderClientCard}
                    contentContainerStyle={styles.list}
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
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.sm,
        paddingBottom: Spacing.sm,
        backgroundColor: Colors.surface,
        borderBottomWidth: 0,
    },
    title: {
        fontFamily: Fonts.display,
        fontSize: 28,
        color: Colors.text,
        letterSpacing: -1,
    },
    subtitle: {
        fontFamily: Fonts.body,
        fontSize: 14,
        color: Colors.textMuted,
        marginTop: 2,
    },
    addBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.primary,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 14,
        gap: 8,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    addBtnText: {
        fontFamily: Fonts.bodyBold,
        fontSize: 14,
        color: Colors.white,
    },
    list: {
        padding: Spacing.md,
        gap: 16,
    },
    card: {
        backgroundColor: Colors.surface_container_low,
        borderRadius: borderRadius.lg,
        padding: 20,
        borderWidth: 0,
        borderColor: Colors.surface_lowest,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 18,
    },
    avatar: {
        width: 52,
        height: 52,
        borderRadius: 18,
        backgroundColor: Colors.surface_container,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 14,
    },
    avatarImage: {
        width: '100%',
        height: '100%',
        borderRadius: 18,
        resizeMode: 'cover',
    },
    clientInfo: {
        flex: 1,
    },
    clientName: {
        fontFamily: Fonts.headline,
        fontSize: 18,
        color: Colors.text,
        letterSpacing: -0.5,
    },
    clientGoal: {
        fontFamily: Fonts.body,
        fontSize: 13,
        color: Colors.textMuted,
        marginTop: 2,
    },
    cardStats: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 16,
        borderTopWidth: 0,
        borderBottomWidth: 0,
    },
    stat: {
        alignItems: 'center',
        flex: 1,
    },
    statLabel: {
        fontFamily: Fonts.label,
        fontSize: 10,
        color: Colors.textMuted,
        letterSpacing: 1,
        marginBottom: 4,
    },
    statValue: {
        fontFamily: Fonts.display,
        fontSize: 18,
        color: Colors.text,
    },
    actionRow: {
        flexDirection: 'row',
        marginTop: 18,
        gap: 10,
    },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderRadius: 14,
        gap: 8,
    },
    assignBtn: {
        flex: 2,
        backgroundColor: Colors.primary,
    },
    secondaryBtn: {
        flex: 1,
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.outline_variant,
    },
    actionBtnText: {
        fontFamily: Fonts.bodyBold,
        fontSize: 13,
        color: Colors.white,
    },
    secondaryBtnText: {
        fontFamily: Fonts.bodyBold,
        fontSize: 13,
        color: Colors.text,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        paddingBottom: 100,
    },
    emptyIcon: {
        width: 100,
        height: 100,
        borderRadius: 40,
        backgroundColor: Colors.surfaceLight,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
    },
    emptyTitle: {
        fontFamily: Fonts.headline,
        fontSize: 22,
        color: Colors.text,
        textAlign: 'center',
        letterSpacing: -0.5,
    },
    emptySubtitle: {
        fontFamily: Fonts.body,
        fontSize: 15,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: 10,
        lineHeight: 22,
    },
    viewPlansBtn: {
        flex: 2,
        backgroundColor: 'transparent',
        borderWidth: 0,
    },
    viewPlansBtnText: {
        fontFamily: Fonts.label,
        textTransform: 'uppercase',
        fontSize: 13,
        color: Colors.primary,
    },
});
