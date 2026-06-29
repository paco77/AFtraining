import { Spacing, borderRadius, Fonts, Colors } from '@/constants/theme';
import { usePlans } from '@/context/PlanContext';
import { useTheme } from '@/context/ThemeContext';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View, ScrollView, Platform, SafeAreaView, RefreshControl } from 'react-native';
import { Calendar, ChevronRight, ClipboardList, Dumbbell, Clock, TrendingUp, Plus, Medal } from 'lucide-react-native';
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useFocusEffect } from 'expo-router';

export default function HistoryScreen() {
    const { colors } = useTheme();
    const { fetchHistory } = usePlans();
    const router = useRouter();

    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    
    // Calendar strip dates (past 14 days + today)
    const [dates, setDates] = useState<Date[]>([]);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());

    useEffect(() => {
        initDates();
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadHistory();
        }, [])
    );

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await loadHistory();
        setRefreshing(false);
    }, []);

    const initDates = () => {
        const tempDates = [];
        const today = new Date();
        for (let i = 14; i >= 0; i--) {
            const d = new Date();
            d.setDate(today.getDate() - i);
            tempDates.push(d);
        }
        setDates(tempDates);
    };

    const loadHistory = async () => {
        try {
            setLoading(true);
            const data = await fetchHistory();
            console.log('--- FETCHED HISTORY ---, count:', data?.length);
            // sort descending
            if (Array.isArray(data)) {
                data.sort((a,b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime());
                setSessions(data);
            } else {
                console.warn('History data is not an array:', data);
                setSessions([]);
            }
        } catch (error) {
            console.error('Error loading history:', error);
        } finally {
            setLoading(false);
        }
    };

    // Derived statistics
    const monthSessionsCount = sessions.length; // Simplified for "ESTE MES"

    // Component: Month Summary Card
    const renderSummaryHeader = () => (
        <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>ESTE MES</Text>
            <View style={styles.summaryValueRow}>
                <Text style={styles.summaryGiantNumber}>{monthSessionsCount}</Text>
                <Text style={styles.summaryDescText}>sesiones completadas</Text>
            </View>
            <TouchableOpacity activeOpacity={0.8} style={styles.statsBtnWrapper}>
                <LinearGradient 
                    colors={['rgba(131, 100, 206, 0.15)', 'rgba(131, 100, 206, 0.05)']} 
                    style={styles.statsGradient}
                    start={{x: 0, y: 0}}
                    end={{x: 1, y: 0}}
                >
                    <View style={styles.statsBorderLeft} />
                    <View style={styles.statsBtnContent}>
                        <View>
                            <Text style={styles.statsTitle}>Ver Estadísticas Mensuales</Text>
                            <Text style={styles.statsSubtitle}>Progreso detallado y récords</Text>
                        </View>
                        <TrendingUp size={20} color={colors.tertiary} />
                    </View>
                </LinearGradient>
            </TouchableOpacity>
        </View>
    );

    // Component: Horizontal Calendar
    const renderCalendarStrip = () => {
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        const currentMonth = monthNames[selectedDate.getMonth()];
        const currentYear = selectedDate.getFullYear();

        return (
            <View style={styles.calendarContainer}>
                <View style={styles.calendarHeaderRow}>
                    <Text style={styles.calendarMonthText}>{currentMonth} {currentYear}</Text>
                    <View style={styles.calendarNavBtns}>
                        <TouchableOpacity style={styles.navBtnWrapper}>
                            <ChevronRight size={16} color={colors.textMuted} style={{ transform: [{ rotate: '180deg' }] }} />
                        </TouchableOpacity>
                        <TouchableOpacity style={styles.navBtnWrapper}>
                            <ChevronRight size={16} color={colors.textMuted} />
                        </TouchableOpacity>
                    </View>
                </View>
                <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false} 
                    contentContainerStyle={styles.calendarStripContent}
                >
                    {dates.map((date, idx) => {
                        const isSelected = date.toDateString() === selectedDate.toDateString();
                        const dayNames = ['DOM', 'LUN', 'MAR', 'MIE', 'JUE', 'VIE', 'SAB'];
                        
                        return (
                            <TouchableOpacity 
                                key={idx} 
                                style={[styles.dayCard, isSelected && styles.dayCardSelected]}
                                onPress={() => setSelectedDate(date)}
                                activeOpacity={0.7}
                            >
                                <Text style={[styles.dayName, isSelected && styles.dayNameSelected]}>
                                    {dayNames[date.getDay()]}
                                </Text>
                                <Text style={[styles.dayNumber, isSelected && styles.dayNumberSelected]}>
                                    {date.getDate()}
                                </Text>
                                {isSelected && <View style={styles.daySelectionDot} />}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>
        );
    };

    // Formatter
    const formatSessionDateInfo = (dateString: string) => {
        const d = new Date(dateString);
        const now = new Date();
        const monthNames = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
        
        let prefix = `${d.getDate()} ${monthNames[d.getMonth()]}`;
        if (d.toDateString() === now.toDateString()) {
            prefix = `HOY, ${d.getDate()} ${monthNames[d.getMonth()]}`;
        }

        const hoursStr = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }).toUpperCase();
        return `${prefix} • ${hoursStr}`;
    };

    const calculateVolumeMock = (session: any) => {
        let vol = 0;
        let hasLogs = false;
        if(session.exercise_logs) {
            session.exercise_logs.forEach((ex: any) => {
                ex.sets?.forEach((set: any) => {
                    hasLogs = true;
                    vol += (set.reps || 0) * (set.weight || 0);
                });
            });
        }
        return hasLogs ? `${vol.toLocaleString()} kg` : '0 kg'; 
    };

    const calculateDurationMock = (session: any) => {
        if (session.duration_minutes != null) return `${session.duration_minutes} min`;
        if (session.duration != null) return `${session.duration} min`;
        if (session.end_time && session.start_time) {
             const diff = new Date(session.end_time).getTime() - new Date(session.start_time).getTime();
             return `${Math.max(1, Math.round(diff / 60000))} min`;
        }
        const logLen = session.exercise_logs?.length || 1;
        return `${logLen * 12} min`; 
    };

    // Component: Session Card
    const renderSessionCard = ({ item, index }: { item: any, index: number }) => {
        const dateStr = formatSessionDateInfo(item.start_time);
        const title = item.training_day?.label || 'Sesión de Entrenamiento';
        const isPR = index % 3 === 0; // Fake PR logic for visual depth like in the mockup
        const duration = calculateDurationMock(item);
        const volume = calculateVolumeMock(item);
        const exercisesCount = item.exercise_logs?.length || 0;

        return (
            <View style={styles.sessionCard}>
                <View style={styles.sessionCardHeader}>
                    <Text style={styles.sessionDateText}>{dateStr}</Text>
                    {isPR && (
                        <View style={styles.prBadge}>
                            <Medal size={12} color={colors.tertiary} />
                            <Text style={styles.prBadgeText}>RÉCORD PR</Text>
                        </View>
                    )}
                </View>

                <Text style={styles.sessionTitle}>{title}</Text>

                <View style={styles.metricsRow}>
                    <View style={styles.metricBox}>
                        <View style={styles.metricIconCircle}>
                            <Clock size={16} color={colors.primary} />
                        </View>
                        <View>
                            <Text style={styles.metricLabel}>TIEMPO</Text>
                            <Text style={styles.metricValue}>{duration}</Text>
                        </View>
                    </View>
                    <View style={styles.metricBox}>
                        <View style={styles.metricIconCircle}>
                            <Dumbbell size={16} color={colors.primary} />
                        </View>
                        <View>
                            <Text style={styles.metricLabel}>VOLUMEN</Text>
                            <Text style={styles.metricValue}>{volume}</Text>
                        </View>
                    </View>
                </View>

                <View style={styles.sessionCardFooter}>
                    <Text style={styles.exercCountText}>{exercisesCount} ejercicios completados</Text>
                    <ChevronRight size={16} color={colors.textMuted} />
                </View>

                {item.comment ? (
                    <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.05)' }}>
                        <Text style={{ fontFamily: Fonts.body, fontSize: 13, color: colors.textMuted, fontStyle: 'italic' }}>
                            "{item.comment}"
                        </Text>
                    </View>
                ) : null}
            </View>
        );
    };

    if (loading && sessions.length === 0) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={colors.primary} />
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.container}>
                {/* Custom Header Native Look */}
                <View style={styles.topHeader}>
                    <TouchableOpacity style={styles.backBtn} activeOpacity={0.7} onPress={() => router.back()}>
                        <ChevronRight size={24} color={colors.primary} style={{ transform: [{ rotate: '180deg' }] }} />
                    </TouchableOpacity>
                    <View style={styles.headerTitles}>
                        <Text style={styles.headerTitle}>HISTORIAL</Text>
                        <Text style={styles.headerSubtitle}>ENTRENAMIENTOS</Text>
                    </View>
                    <TouchableOpacity style={styles.headerBtn}>
                        <Calendar size={20} color={colors.textMuted} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.headerBtn}>
                        <Text style={{color: colors.textMuted, fontSize: 24, fontWeight: '700', marginTop: -14}}>...</Text>
                    </TouchableOpacity>
                </View>

                <FlatList
                    data={sessions}
                    keyExtractor={(item, index) => item.id ? String(item.id) : `${index}`}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
                    }
                    ListHeaderComponent={
                        <View>
                            {renderSummaryHeader()}
                            {renderCalendarStrip()}
                        </View>
                    }
                    renderItem={renderSessionCard}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={false}
                    ListEmptyComponent={
                        <View style={styles.emptyContainer}>
                            <View style={styles.emptyIconCircle}>
                                <ClipboardList size={40} color={colors.textMuted} />
                            </View>
                            <Text style={styles.emptyTitle}>Sin historial</Text>
                            <Text style={styles.emptySubtitle}>Aún no has completado entrenamientos.</Text>
                        </View>
                    }
                />

                {/* FAB */}
                <TouchableOpacity style={styles.fab} activeOpacity={0.8}>
                    <Plus size={28} color="#000" />
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    topHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingTop: Platform.OS === 'ios' ? 10 : 25,
        paddingBottom: 20,
    },
    backBtn: {
        marginRight: 16,
    },
    headerTitles: {
        flex: 1,
    },
    headerTitle: {
        fontFamily: Fonts.display,
        fontSize: 16,
        color: Colors.text,
        fontWeight: '800',
        letterSpacing: 1,
    },
    headerSubtitle: {
        fontFamily: Fonts.body,
        fontSize: 10,
        color: Colors.textMuted,
        fontWeight: '700',
        letterSpacing: 1,
    },
    headerBtn: {
        marginLeft: 16,
        padding: 4,
    },
    listContent: {
        paddingHorizontal: Spacing.md,
        paddingBottom: 100, // Space for FAB
    },
    // Summary Card
    summaryCard: {
        backgroundColor: Colors.surface_container,
        borderRadius: 16,
        padding: Spacing.md,
        marginBottom: 24,
    },
    summaryLabel: {
        fontFamily: Fonts.body,
        fontSize: 10,
        color: Colors.textMuted,
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: 8,
        textTransform: 'uppercase',
    },
    summaryValueRow: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginBottom: 20,
    },
    summaryGiantNumber: {
        fontFamily: Fonts.display,
        fontSize: 48,
        color: Colors.primary,
        fontWeight: '900',
        marginRight: 12,
        lineHeight: 52,
    },
    summaryDescText: {
        fontFamily: Fonts.body,
        fontSize: 15,
        color: Colors.textMuted,
        fontWeight: '500',
    },
    statsBtnWrapper: {
        borderRadius: 12,
        overflow: 'hidden',
    },
    statsGradient: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statsBorderLeft: {
        width: 4,
        backgroundColor: Colors.tertiary,
        height: '100%',
        position: 'absolute',
        left: 0,
        top: 0,
        borderTopLeftRadius: 12,
        borderBottomLeftRadius: 12,
    },
    statsBtnContent: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingLeft: 20,
        paddingRight: 16,
    },
    statsTitle: {
        fontFamily: Fonts.headline,
        fontSize: 14,
        color: Colors.tertiary,
        fontWeight: '800',
        marginBottom: 2,
    },
    statsSubtitle: {
        fontFamily: Fonts.body,
        fontSize: 11,
        color: Colors.textMuted,
    },
    // Calendar Strip
    calendarContainer: {
        marginBottom: 24,
    },
    calendarHeaderRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    calendarMonthText: {
        fontFamily: Fonts.headline,
        fontSize: 18,
        color: Colors.text,
        fontWeight: '800',
    },
    calendarNavBtns: {
        flexDirection: 'row',
        gap: 8,
    },
    navBtnWrapper: {
        width: 28,
        height: 28,
        borderRadius: 8,
        backgroundColor: Colors.surface_container_low,
        justifyContent: 'center',
        alignItems: 'center',
    },
    calendarStripContent: {
        gap: 8,
        paddingRight: Spacing.md,
    },
    dayCard: {
        width: 58,
        height: 72,
        borderRadius: 12,
        backgroundColor: Colors.surface_container_low, // dark inactive
        justifyContent: 'center',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: Colors.surface_lowest,
    },
    dayCardSelected: {
        backgroundColor: Colors.primary,
        borderColor: Colors.primary,
    },
    dayName: {
        fontFamily: Fonts.body,
        fontSize: 10,
        color: Colors.textMuted,
        fontWeight: '700',
        marginBottom: 4,
    },
    dayNameSelected: {
        color: '#000',
    },
    dayNumber: {
        fontFamily: Fonts.display,
        fontSize: 18,
        color: Colors.text,
        fontWeight: '900',
    },
    dayNumberSelected: {
        color: '#000',
    },
    daySelectionDot: {
        width: 4,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#000',
        marginTop: 4,
    },
    // Session Card
    sessionCard: {
        backgroundColor: Colors.surface,
        borderRadius: 16,
        padding: Spacing.md,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: Colors.outline,
    },
    sessionCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    sessionDateText: {
        fontFamily: Fonts.body,
        fontSize: 11,
        color: Colors.textMuted,
        fontWeight: '700',
        letterSpacing: 0.5,
        textTransform: 'uppercase',
    },
    prBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(131, 100, 206, 0.1)',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: 'rgba(131, 100, 206, 0.3)',
        gap: 4,
    },
    prBadgeText: {
        fontFamily: Fonts.body,
        fontSize: 9,
        fontWeight: '700',
        color: Colors.tertiary,
        letterSpacing: 0.5,
    },
    sessionTitle: {
        fontFamily: Fonts.display,
        fontSize: 22,
        fontWeight: '800',
        color: Colors.text,
        marginBottom: 16,
    },
    metricsRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 20,
    },
    metricBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface_lowest,
        padding: 12,
        borderRadius: 12,
    },
    metricIconCircle: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: Colors.surface,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    metricLabel: {
        fontFamily: Fonts.body,
        fontSize: 9,
        color: Colors.textMuted,
        fontWeight: '700',
        letterSpacing: 1,
        marginBottom: 2,
    },
    metricValue: {
        fontFamily: Fonts.headline,
        fontSize: 14,
        color: Colors.text,
        fontWeight: '900',
    },
    sessionCardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: Colors.surface_lowest,
    },
    exercCountText: {
        fontFamily: Fonts.body,
        fontSize: 12,
        color: Colors.textMuted,
        fontWeight: '500',
    },
    // Empty State
    emptyContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    emptyIconCircle: {
        width: 80,
        height: 80,
        borderRadius: 24,
        backgroundColor: Colors.surface_container_low,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderColor: Colors.outline,
    },
    emptyTitle: {
        fontFamily: Fonts.display,
        fontSize: 20,
        fontWeight: '900',
        color: Colors.text,
    },
    emptySubtitle: {
        fontFamily: Fonts.body,
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
        color: Colors.textMuted,
        paddingHorizontal: 40,
    },
    // FAB
    fab: {
        position: 'absolute',
        bottom: 24,
        right: 24,
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: Colors.primary,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
        elevation: 8,
    },
});
