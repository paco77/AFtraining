import { Colors, Spacing } from '@/constants/theme';
import { showToast } from '@/services/toast';
import api from '@/services/api';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Edit, Trash2, Calendar, Scale, Ruler, Activity, MessageSquare } from 'lucide-react-native';
import React, { useState, useRef } from 'react';
import {
    ActivityIndicator,
    Alert,
    Dimensions,
    Image,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width } = Dimensions.get('window');

export default function ProgressDetailScreen() {
    const { item, clientId } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const [isDeleting, setIsDeleting] = useState(false);

    let progress: any = {};
    try {
        if (typeof item === 'string') {
            progress = JSON.parse(item);
        }
    } catch (e) {
        console.error('Error parsing progress item', e);
    }

    const handleDelete = () => {
        if (!progress.id || progress.id === 'initial_bio') {
            Alert.alert('No permitido', 'Este registro no se puede eliminar.');
            return;
        }

        Alert.alert(
            'Eliminar Progreso',
            '¿Estás seguro de que deseas eliminar este registro? Esta acción no se puede deshacer y borrará las fotos asociadas.',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        setIsDeleting(true);
                        try {
                            await api.delete(`clients/${clientId}/progress/${progress.id}`);
                            showToast.success('Progreso eliminado correctamente');
                            router.back();
                        } catch (error) {
                            console.error('Error deleting progress:', error);
                            showToast.error('No se pudo eliminar el progreso');
                        } finally {
                            setIsDeleting(false);
                        }
                    }
                }
            ]
        );
    };

    const handleEdit = () => {
        if (!progress.id || progress.id === 'initial_bio') {
            Alert.alert('No permitido', 'Este registro no se puede editar desde aquí.');
            return;
        }
        router.push({
            pathname: '/client/progress/edit',
            params: { item: JSON.stringify(progress), clientId }
        });
    };

    const photos = [
        { label: 'Frente', url: progress.front_photo_url || progress.front_photo_path || progress.front_photo },
        { label: 'Perfil', url: progress.side_photo_url || progress.side_photo_path || progress.side_photo },
        { label: 'Espalda', url: progress.back_photo_url || progress.back_photo_path || progress.back_photo },
    ].filter(p => p.url);

    const [activeSlide, setActiveSlide] = useState(0);

    const onScroll = (event: any) => {
        const slideSize = event.nativeEvent.layoutMeasurement.width;
        const index = event.nativeEvent.contentOffset.x / slideSize;
        const roundIndex = Math.round(index);
        if (activeSlide !== roundIndex) {
            setActiveSlide(roundIndex);
        }
    };

    return (
        <View style={styles.container}>
            <Stack.Screen options={{ headerShown: false }} />
            
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Detalle de Progreso</Text>
                {progress.id && progress.id !== 'initial_bio' ? (
                    <TouchableOpacity onPress={handleEdit} style={styles.editBtn}>
                        <Edit size={20} color={Colors.primary} />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 40 }} />
                )}
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                
                {/* Carousel */}
                {photos.length > 0 ? (
                    <View style={styles.carouselContainer}>
                        <ScrollView 
                            horizontal 
                            pagingEnabled 
                            showsHorizontalScrollIndicator={false}
                            onScroll={onScroll}
                            scrollEventThrottle={16}
                        >
                            {photos.map((photo, idx) => (
                                <View key={idx} style={styles.slide}>
                                    <Image source={{ uri: photo.url }} style={styles.slideImage} />
                                    <View style={styles.slideLabelContainer}>
                                        <Text style={styles.slideLabel}>{photo.label}</Text>
                                    </View>
                                </View>
                            ))}
                        </ScrollView>
                        {photos.length > 1 && (
                            <View style={styles.pagination}>
                                {photos.map((_, idx) => (
                                    <View key={idx} style={[styles.dot, activeSlide === idx && styles.activeDot]} />
                                ))}
                            </View>
                        )}
                    </View>
                ) : (
                    <View style={styles.noPhotosContainer}>
                        <Text style={styles.noPhotosText}>Sin fotos registradas</Text>
                    </View>
                )}

                <View style={styles.detailsCard}>
                    <View style={styles.detailRow}>
                        <Calendar size={20} color={Colors.primary} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.detailLabel}>Fecha</Text>
                            <Text style={styles.detailValue}>
                                {new Date(progress.recorded_at || progress.created_at || Date.now()).toLocaleDateString()}
                            </Text>
                        </View>
                    </View>
                    
                    <View style={styles.divider} />

                    <View style={styles.detailRow}>
                        <Scale size={20} color={Colors.primary} />
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={styles.detailLabel}>Peso</Text>
                            <Text style={styles.detailValue}>
                                {progress.weight ? `${progress.weight} kg` : '--'}
                            </Text>
                        </View>
                    </View>

                    {progress.measurements && Object.keys(progress.measurements).length > 0 && (
                        <>
                            <View style={styles.divider} />
                            <View style={[styles.detailRow, { alignItems: 'flex-start' }]}>
                                <Activity size={20} color={Colors.primary} style={{ marginTop: 2 }} />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={styles.detailLabel}>Medidas / Biometría</Text>
                                    <View style={styles.measurementsContainer}>
                                        {Object.entries(progress.measurements).map(([k, v]) => (
                                            <View key={k} style={styles.measChip}>
                                                <Text style={styles.measChipText}>{k}: {v as string}</Text>
                                            </View>
                                        ))}
                                    </View>
                                </View>
                            </View>
                        </>
                    )}

                    {progress.comments && (
                        <>
                            <View style={styles.divider} />
                            <View style={[styles.detailRow, { alignItems: 'flex-start' }]}>
                                <MessageSquare size={20} color={Colors.primary} style={{ marginTop: 2 }} />
                                <View style={{ flex: 1, marginLeft: 12 }}>
                                    <Text style={styles.detailLabel}>Comentarios</Text>
                                    <Text style={[styles.detailValue, { fontStyle: 'italic', marginTop: 4, lineHeight: 22 }]}>
                                        "{progress.comments}"
                                    </Text>
                                </View>
                            </View>
                        </>
                    )}
                </View>

                {progress.id && progress.id !== 'initial_bio' && (
                    <TouchableOpacity
                        style={[styles.deleteBtn, isDeleting && { opacity: 0.7 }]}
                        activeOpacity={0.8}
                        onPress={handleDelete}
                        disabled={isDeleting}
                    >
                        {isDeleting ? (
                            <ActivityIndicator color={Colors.danger} />
                        ) : (
                            <>
                                <Trash2 size={20} color={Colors.danger} />
                                <Text style={styles.deleteBtnText}>Eliminar Registro</Text>
                            </>
                        )}
                    </TouchableOpacity>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
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
        paddingBottom: 20,
        backgroundColor: Colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: Colors.border,
    },
    backBtn: {
        padding: 8,
        backgroundColor: Colors.surfaceLight,
        borderRadius: 12,
    },
    editBtn: {
        padding: 8,
        backgroundColor: Colors.primary + '15',
        borderRadius: 12,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '800',
        color: Colors.text,
        letterSpacing: -0.5,
    },
    scroll: {
        padding: Spacing.md,
    },
    carouselContainer: {
        marginBottom: 24,
        borderRadius: 24,
        overflow: 'hidden',
        backgroundColor: Colors.surface,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    slide: {
        width: width - Spacing.md * 2,
        aspectRatio: 3/4,
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
    },
    slideImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    slideLabelContainer: {
        position: 'absolute',
        bottom: 16,
        left: 16,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 12,
    },
    slideLabel: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 14,
    },
    pagination: {
        flexDirection: 'row',
        position: 'absolute',
        bottom: 16,
        right: 16,
        gap: 6,
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: 'rgba(255,255,255,0.4)',
    },
    activeDot: {
        backgroundColor: Colors.primary,
        width: 20,
    },
    noPhotosContainer: {
        aspectRatio: 3/4,
        backgroundColor: Colors.surface,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 24,
        borderWidth: 1,
        borderStyle: 'dashed',
        borderColor: Colors.border,
    },
    noPhotosText: {
        color: Colors.textMuted,
        fontSize: 14,
        fontWeight: '600',
    },
    detailsCard: {
        backgroundColor: Colors.surface,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: Colors.border,
        marginBottom: 24,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    detailLabel: {
        fontSize: 12,
        color: Colors.textMuted,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    detailValue: {
        fontSize: 16,
        fontWeight: '700',
        color: Colors.text,
        marginTop: 2,
    },
    divider: {
        height: 1,
        backgroundColor: Colors.border,
        marginVertical: 16,
    },
    measurementsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 8,
    },
    measChip: {
        backgroundColor: Colors.primary + '15',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 10,
    },
    measChipText: {
        color: Colors.primary,
        fontWeight: '700',
        fontSize: 13,
    },
    deleteBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.danger + '15',
        paddingVertical: 16,
        borderRadius: 20,
        gap: 10,
        borderWidth: 1,
        borderColor: Colors.danger + '30',
    },
    deleteBtnText: {
        fontWeight: '700',
        fontSize: 16,
        color: Colors.danger,
    },
});
