import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, StatusBar, Modal } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, ChevronDown, ChevronUp, Scale, Camera } from 'lucide-react-native';
import { Colors, Spacing } from '@/constants/theme';
import api from '@/services/api';
import { useUser } from '@/context/UserContext';

export default function ClientEvaluations() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { clients } = useUser();
    const client = clients.find(c => String(c.id) === String(id));

    const [evaluations, setEvaluations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    // Image Modal State
    const [modalImage, setModalImage] = useState<string | null>(null);

    useEffect(() => {
        if (id) {
            loadEvaluations();
        }
    }, [id]);

    const loadEvaluations = async () => {
        setLoading(true);
        try {
            const response = await api.get(`clients/${id}/progress`);
            let data = Array.isArray(response.data) ? response.data : response.data.data || [];
            
            if (client && (client.weight || client.height)) {
                data.push({
                    id: 'initial_bio',
                    weight: client.weight,
                    created_at: client.created_at || new Date().toISOString(),
                    comments: 'Biometría Inicial',
                    measurements: {
                        Altura: client.height ? `${client.height} cm` : undefined,
                        Edad: client.age ? `${client.age} años` : undefined
                    }
                });
            }

            data.sort((a: any, b: any) => {
                const dateA = new Date(a.created_at || a.recorded_at || 0).getTime();
                const dateB = new Date(b.created_at || b.recorded_at || 0).getTime();
                return dateB - dateA;
            });
            setEvaluations(data);
        } catch (error) {
            console.error('Error fetching evaluations:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (evalId: number) => {
        setExpandedId(prev => prev === evalId ? null : evalId);
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar barStyle="light-content" />

            <View style={styles.header}>
                <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                    <ArrowLeft size={24} color="#fff" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Todas las Evaluaciones</Text>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {loading ? (
                    <ActivityIndicator color={Colors.primary} style={{ marginTop: 40 }} />
                ) : evaluations.length === 0 ? (
                    <View style={styles.emptyState}>
                        <Calendar size={48} color={Colors.textMuted} />
                        <Text style={styles.emptyText}>Aún no hay evaluaciones registradas para este cliente.</Text>
                    </View>
                ) : (
                    evaluations.map((ev, index) => {
                        const isExpanded = expandedId === ev.id;
                        const date = new Date(ev.created_at || ev.recorded_at || Date.now()).toLocaleDateString();
                        const hasPhotos = ev.front_photo_url || ev.side_photo_url || ev.back_photo_url;
                        
                        return (
                            <View key={ev.id || index} style={[styles.card, isExpanded && styles.cardExpanded]}>
                                <TouchableOpacity 
                                    style={styles.cardHeader} 
                                    onPress={() => toggleExpand(ev.id)}
                                    activeOpacity={0.7}
                                >
                                    <View style={styles.cardHeaderLeft}>
                                        <View style={styles.dateBadge}>
                                            <Calendar size={16} color={Colors.primary} />
                                            <Text style={styles.dateText}>{date}</Text>
                                        </View>
                                        {ev.weight && (
                                            <Text style={styles.weightSummary}>Peso: {ev.weight} kg</Text>
                                        )}
                                    </View>
                                    
                                    <View style={styles.cardHeaderRight}>
                                        {hasPhotos && <Camera size={16} color={Colors.textMuted} style={{ marginRight: 8 }} />}
                                        {isExpanded ? <ChevronUp size={20} color={Colors.textMuted} /> : <ChevronDown size={20} color={Colors.textMuted} />}
                                    </View>
                                </TouchableOpacity>

                                {isExpanded && (
                                    <View style={styles.cardBody}>
                                        <View style={styles.divider} />
                                        
                                        {/* Mediciones (Measurements) */}
                                        {ev.measurements && Object.keys(ev.measurements).length > 0 && (
                                            <View style={styles.measurementsSection}>
                                                <Text style={styles.sectionSubtitle}>Medidas Corporales</Text>
                                                <View style={styles.measurementsGrid}>
                                                    {Object.entries(ev.measurements).map(([k, v]) => (
                                                        <View key={k} style={styles.measurementItem}>
                                                            <Text style={styles.measurementKey}>{k}</Text>
                                                            <Text style={styles.measurementValue}>{v as string}</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            </View>
                                        )}

                                        {/* Comentarios */}
                                        {ev.comments && (
                                            <View style={styles.commentsSection}>
                                                <Text style={styles.sectionSubtitle}>Comentarios / Notas</Text>
                                                <View style={styles.commentBox}>
                                                    <Text style={styles.commentText}>{ev.comments}</Text>
                                                </View>
                                            </View>
                                        )}

                                        {/* Fotos de Progreso */}
                                        {hasPhotos && (
                                            <View style={styles.photosSection}>
                                                <Text style={styles.sectionSubtitle}>Fotos de Progreso</Text>
                                                <View style={styles.photoGrid}>
                                                    {[
                                                        { label: 'Frente', url: ev.front_photo_url },
                                                        { label: 'Lateral', url: ev.side_photo_url },
                                                        { label: 'Espalda', url: ev.back_photo_url }
                                                    ].map((photo, i) => photo.url ? (
                                                        <TouchableOpacity 
                                                            key={i} 
                                                            style={styles.photoWrapper}
                                                            onPress={() => setModalImage(photo.url)}
                                                            activeOpacity={0.8}
                                                        >
                                                            <Image source={{ uri: photo.url }} style={styles.photoImage} />
                                                            <View style={styles.photoLabelOverlay}>
                                                                <Text style={styles.photoLabelText}>{photo.label}</Text>
                                                            </View>
                                                        </TouchableOpacity>
                                                    ) : null)}
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>
                        );
                    })
                )}
                <View style={{ height: 40 }} />
            </ScrollView>

            {/* Modal para ver fotos en grande */}
            <Modal visible={!!modalImage} transparent={true} animationType="fade">
                <View style={styles.modalOverlay}>
                    <TouchableOpacity style={styles.modalCloseArea} onPress={() => setModalImage(null)} />
                    <View style={styles.modalContent}>
                        <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setModalImage(null)}>
                            <Text style={styles.modalCloseText}>Cerrar</Text>
                        </TouchableOpacity>
                        {modalImage && (
                            <Image source={{ uri: modalImage }} style={styles.fullScreenImage} resizeMode="contain" />
                        )}
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    header: {
        backgroundColor: Colors.surface,
        paddingTop: 60,
        paddingBottom: 20,
        paddingHorizontal: Spacing.lg,
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
    },
    backBtn: {
        marginRight: 16,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: Colors.text,
    },
    content: {
        flex: 1,
        padding: Spacing.md,
    },
    emptyState: {
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 60,
        padding: 40,
    },
    emptyText: {
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: 16,
        fontSize: 16,
        fontWeight: '500',
    },
    card: {
        backgroundColor: Colors.surface,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        overflow: 'hidden',
    },
    cardExpanded: {
        borderColor: Colors.primary + '50',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
    },
    cardHeaderLeft: {
        flex: 1,
    },
    cardHeaderRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    dateBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(204, 255, 0, 0.1)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        alignSelf: 'flex-start',
        marginBottom: 8,
    },
    dateText: {
        color: Colors.primary,
        fontWeight: '700',
        fontSize: 14,
    },
    weightSummary: {
        fontSize: 18,
        fontWeight: '900',
        color: Colors.text,
    },
    cardBody: {
        padding: 16,
        paddingTop: 0,
    },
    divider: {
        height: 1,
        backgroundColor: Colors.border,
        marginBottom: 16,
    },
    sectionSubtitle: {
        fontSize: 14,
        fontWeight: '700',
        color: Colors.text,
        marginBottom: 10,
    },
    measurementsSection: {
        marginBottom: 20,
    },
    measurementsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    measurementItem: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderWidth: 1,
        borderColor: Colors.border,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    measurementKey: {
        fontSize: 12,
        color: Colors.textMuted,
        fontWeight: '600',
        textTransform: 'capitalize',
    },
    measurementValue: {
        fontSize: 14,
        color: Colors.primary,
        fontWeight: '800',
    },
    commentsSection: {
        marginBottom: 20,
    },
    commentBox: {
        backgroundColor: 'rgba(255, 255, 255, 0.03)',
        borderWidth: 1,
        borderColor: Colors.border,
        padding: 16,
        borderRadius: 12,
    },
    commentText: {
        color: Colors.text,
        fontSize: 14,
        fontStyle: 'italic',
        lineHeight: 20,
    },
    photosSection: {
        marginBottom: 8,
    },
    photoGrid: {
        flexDirection: 'row',
        gap: 10,
    },
    photoWrapper: {
        flex: 1,
        aspectRatio: 3 / 4,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: Colors.border,
        position: 'relative',
    },
    photoImage: {
        width: '100%',
        height: '100%',
    },
    photoLabelOverlay: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingVertical: 4,
        alignItems: 'center',
    },
    photoLabelText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: '700',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.9)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalCloseArea: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
    },
    modalContent: {
        width: '100%',
        height: '80%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalCloseBtn: {
        position: 'absolute',
        top: 20,
        right: 20,
        zIndex: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
    },
    modalCloseText: {
        color: '#fff',
        fontWeight: '700',
    },
    fullScreenImage: {
        width: '90%',
        height: '100%',
    }
});
