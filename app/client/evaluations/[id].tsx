import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, ActivityIndicator, StatusBar, Modal } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Calendar, ChevronDown, ChevronUp, Scale, Camera } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, Spacing } from '@/constants/theme';
import api from '@/services/api';
import { useUser } from '@/context/UserContext';

export default function ClientEvaluations() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { clients } = useUser();
    const client = clients.find(c => String(c.id) === String(id));

    const [evaluations, setEvaluations] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | string | null>(null);

    // Image Modal State
    const [modalImage, setModalImage] = useState<string | null>(null);

    // Compare State
    const [compareBase, setCompareBase] = useState<any>(null);
    const [compareTarget, setCompareTarget] = useState<any>(null);
    const [isSelectingTarget, setIsSelectingTarget] = useState(false);

    useEffect(() => {
        if (id) {
            loadEvaluations();
        }
    }, [id]);

    const loadEvaluations = async () => {
        setLoading(true);
        try {
            const response = await api.get(`clients/${id}/progress`);
            let evals = Array.isArray(response.data) ? response.data : response.data.data || [];
            const formatUrl = (path: string | null | undefined) => {
                if (!path) return null;
                if (!path.startsWith('http')) {
                    return `https://aftraining-storage.sfo2.digitaloceanspaces.com/${path}`;
                }
                if (path.includes('aftraining.skecomponent.mx/storage')) {
                    return path.replace('https://aftraining.skecomponent.mx', 'http://192.168.3.198:8000');
                }
                return path;
            };

            if (client) {
                evals.unshift({
                    id: 'initial_bio',
                    weight: client.starting_weight,
                    measurements: typeof client.initial_measurements === 'string' 
                        ? JSON.parse(client.initial_measurements) 
                        : (client.initial_measurements || {}),
                    created_at: client.created_at || new Date().toISOString(),
                    comments: 'Datos iniciales del cliente al registrarse en el sistema.',
                    front_photo_url: formatUrl(client.front_photo_url),
                    side_photo_url: formatUrl(client.side_photo_url),
                    back_photo_url: formatUrl(client.back_photo_url)
                });
            }

            const safeDateStr = (d: any) => typeof d === 'string' ? d.replace(' ', 'T') : d;

            evals = evals.map((ev: any) => ({
                ...ev,
                front_photo_url: formatUrl(ev.front_photo_url),
                side_photo_url: formatUrl(ev.side_photo_url),
                back_photo_url: formatUrl(ev.back_photo_url)
            }));

            evals.sort((a: any, b: any) => {
                const dateA = new Date(safeDateStr(a.created_at || a.recorded_at) || 0).getTime();
                const dateB = new Date(safeDateStr(b.created_at || b.recorded_at) || 0).getTime();
                if (isNaN(dateA)) return 1;
                if (isNaN(dateB)) return -1;
                return dateB - dateA;
            });
            setEvaluations(evals);
        } catch (error) {
            console.error('Error fetching evaluations:', error);
        } finally {
            setLoading(false);
        }
    };

    const toggleExpand = (evalId: number | string) => {
        setExpandedId(prev => prev === evalId ? null : evalId);
    };

    const startComparison = (ev: any) => {
        setCompareBase(ev);
        setIsSelectingTarget(true);
    };

    const formatDate = (dateStr: string) => {
        const safe = typeof dateStr === 'string' ? dateStr.replace(' ', 'T') : null;
        if (!safe) return new Date().toLocaleDateString();
        const d = new Date(safe);
        return isNaN(d.getTime()) ? new Date().toLocaleDateString() : d.toLocaleDateString();
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            <StatusBar barStyle="light-content" />

            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
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
                        const date = formatDate(ev.created_at || ev.recorded_at);
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
                                                            <View style={[styles.photoLabelOverlay, { paddingBottom: Math.max(4, insets.bottom) }]}>
                                                                <Text style={styles.photoLabelText}>{photo.label}</Text>
                                                            </View>
                                                        </TouchableOpacity>
                                                    ) : null)}
                                                </View>
                                                
                                                <TouchableOpacity 
                                                    style={styles.compareBtn}
                                                    onPress={() => startComparison(ev)}
                                                >
                                                    <Text style={styles.compareBtnText}>Comparar con otra fecha</Text>
                                                </TouchableOpacity>
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
                            <ScrollView 
                                maximumZoomScale={4} 
                                minimumZoomScale={1} 
                                bouncesZoom={true}
                                centerContent={true}
                                style={{ width: '100%', height: '100%' }}
                                contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center' }}
                            >
                                <Image source={{ uri: modalImage }} style={styles.fullScreenImage} resizeMode="contain" />
                            </ScrollView>
                        )}
                    </View>
                </View>
            </Modal>

            {/* Modal Seleccionador de Fecha a Comparar */}
            <Modal visible={isSelectingTarget} animationType="slide" transparent={true}>
                <View style={styles.selectModalOverlay}>
                    <View style={styles.selectModalContent}>
                        <View style={styles.selectModalHeader}>
                            <Text style={styles.selectModalTitle}>Elige fecha para comparar</Text>
                            <TouchableOpacity onPress={() => setIsSelectingTarget(false)} style={styles.selectModalClose}>
                                <Text style={styles.selectModalCloseText}>Cerrar</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ maxHeight: 400 }}>
                            {evaluations.filter(e => e.id !== compareBase?.id).map(e => (
                                <TouchableOpacity 
                                    key={e.id} 
                                    style={styles.selectEvalItem}
                                    onPress={() => {
                                        setCompareTarget(e);
                                        setIsSelectingTarget(false);
                                    }}
                                >
                                    <Calendar size={18} color={Colors.textMuted} />
                                    <Text style={styles.selectEvalText}>{formatDate(e.created_at || e.recorded_at)}</Text>
                                    <View style={{ flex: 1 }} />
                                    {e.weight && <Text style={styles.selectEvalSubtext}>{e.weight} kg</Text>}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Modal de Visor Lado a Lado */}
            <Modal visible={!!compareBase && !!compareTarget} animationType="slide">
                <View style={[styles.compareViewerContainer, { paddingTop: insets.top }]}>
                    <View style={styles.compareViewerHeader}>
                        <TouchableOpacity 
                            onPress={() => {
                                setCompareTarget(null);
                                setCompareBase(null);
                            }}
                            style={styles.compareViewerCloseBtn}
                        >
                            <ArrowLeft size={24} color={Colors.text} />
                        </TouchableOpacity>
                        <Text style={styles.compareViewerTitle}>Comparación</Text>
                        <View style={{ width: 24 }} />
                    </View>

                    <View style={styles.compareLabelsRow}>
                        <View style={styles.compareLabelCol}>
                            <Text style={styles.compareDateText}>{compareBase ? formatDate(compareBase.created_at || compareBase.recorded_at) : ''}</Text>
                        </View>
                        <View style={styles.compareLabelCol}>
                            <Text style={styles.compareDateText}>{compareTarget ? formatDate(compareTarget.created_at || compareTarget.recorded_at) : ''}</Text>
                        </View>
                    </View>

                    <ScrollView 
                        style={{ flex: 1 }}
                        maximumZoomScale={4}
                        minimumZoomScale={1}
                        bouncesZoom={true}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* FRENTE */}
                        <Text style={styles.compareCategoryTitle}>Frente</Text>
                        <View style={styles.compareImagesRow}>
                            <View style={styles.compareImageContainer}>
                                {compareBase?.front_photo_url ? (
                                    <Image source={{ uri: compareBase.front_photo_url }} style={styles.compareImage} resizeMode="cover" />
                                ) : (
                                    <View style={styles.noPhotoBox}><Text style={styles.noPhotoText}>Sin Foto</Text></View>
                                )}
                            </View>
                            <View style={styles.compareImageContainer}>
                                {compareTarget?.front_photo_url ? (
                                    <Image source={{ uri: compareTarget.front_photo_url }} style={styles.compareImage} resizeMode="cover" />
                                ) : (
                                    <View style={styles.noPhotoBox}><Text style={styles.noPhotoText}>Sin Foto</Text></View>
                                )}
                            </View>
                        </View>

                        {/* LATERAL */}
                        <Text style={styles.compareCategoryTitle}>Lateral</Text>
                        <View style={styles.compareImagesRow}>
                            <View style={styles.compareImageContainer}>
                                {compareBase?.side_photo_url ? (
                                    <Image source={{ uri: compareBase.side_photo_url }} style={styles.compareImage} resizeMode="cover" />
                                ) : (
                                    <View style={styles.noPhotoBox}><Text style={styles.noPhotoText}>Sin Foto</Text></View>
                                )}
                            </View>
                            <View style={styles.compareImageContainer}>
                                {compareTarget?.side_photo_url ? (
                                    <Image source={{ uri: compareTarget.side_photo_url }} style={styles.compareImage} resizeMode="cover" />
                                ) : (
                                    <View style={styles.noPhotoBox}><Text style={styles.noPhotoText}>Sin Foto</Text></View>
                                )}
                            </View>
                        </View>

                        {/* ESPALDA */}
                        <Text style={styles.compareCategoryTitle}>Espalda</Text>
                        <View style={styles.compareImagesRow}>
                            <View style={styles.compareImageContainer}>
                                {compareBase?.back_photo_url ? (
                                    <Image source={{ uri: compareBase.back_photo_url }} style={styles.compareImage} resizeMode="cover" />
                                ) : (
                                    <View style={styles.noPhotoBox}><Text style={styles.noPhotoText}>Sin Foto</Text></View>
                                )}
                            </View>
                            <View style={styles.compareImageContainer}>
                                {compareTarget?.back_photo_url ? (
                                    <Image source={{ uri: compareTarget.back_photo_url }} style={styles.compareImage} resizeMode="cover" />
                                ) : (
                                    <View style={styles.noPhotoBox}><Text style={styles.noPhotoText}>Sin Foto</Text></View>
                                )}
                            </View>
                        </View>
                        
                        <View style={{ height: 60 }} />
                    </ScrollView>
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
    },
    // Nuevos estilos para Comparación
    compareBtn: {
        marginTop: 16,
        padding: 12,
        backgroundColor: Colors.primary + '15',
        borderRadius: 8,
        alignItems: 'center',
    },
    compareBtnText: {
        color: Colors.primary,
        fontWeight: 'bold',
        fontSize: 14,
    },
    selectModalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    selectModalContent: {
        backgroundColor: Colors.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        padding: Spacing.md,
        paddingBottom: 40,
    },
    selectModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    selectModalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.text,
    },
    selectModalClose: {
        padding: 8,
    },
    selectModalCloseText: {
        color: Colors.primary,
        fontWeight: '600',
    },
    selectEvalItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: Colors.background,
        borderRadius: 12,
        marginBottom: 8,
    },
    selectEvalText: {
        marginLeft: 12,
        fontSize: 16,
        color: Colors.text,
        fontWeight: '500',
    },
    selectEvalSubtext: {
        fontSize: 14,
        color: Colors.textMuted,
    },
    compareViewerContainer: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    compareViewerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: Spacing.md,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    compareViewerCloseBtn: {
        padding: 8,
    },
    compareViewerTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: Colors.text,
    },
    compareLabelsRow: {
        flexDirection: 'row',
        backgroundColor: Colors.surfaceLight,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    compareLabelCol: {
        flex: 1,
        alignItems: 'center',
    },
    compareDateText: {
        fontSize: 14,
        fontWeight: 'bold',
        color: Colors.text,
    },
    compareCategoryTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: Colors.primary,
        textAlign: 'center',
        marginTop: 20,
        marginBottom: 8,
    },
    compareImagesRow: {
        flexDirection: 'row',
        paddingHorizontal: 8,
    },
    compareImageContainer: {
        flex: 1,
        height: 250,
        marginHorizontal: 4,
        backgroundColor: Colors.surface,
        borderRadius: 12,
        overflow: 'hidden',
    },
    compareImage: {
        width: '100%',
        height: '100%',
    },
    noPhotoBox: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.surfaceLight,
    },
    noPhotoText: {
        color: Colors.textMuted,
        fontSize: 14,
    }
});
