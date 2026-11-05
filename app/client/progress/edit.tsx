import React, { useState, useEffect, useMemo } from 'react';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
    ArrowLeft,
    Calendar,
    Camera,
    Check,
    FileText,
    Plus,
    Scale,
    Trash,
    Activity,
    RotateCcw,
    X,
    Sparkles
} from 'lucide-react-native';

import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import { Colors, Spacing } from '@/constants/theme';
import api from '@/services/api';
import { showToast } from '@/services/toast';
import { getLocalDateString } from '@/services/dateUtils';

const PRESET_METRICS = [
    { label: '% Grasa', name: '% Grasa' },
    { label: 'Masa Muscular', name: 'Masa Muscular' },
    { label: 'Cintura', name: 'Cintura (cm)' },
    { label: 'Cadera', name: 'Cadera (cm)' },
    { label: 'Pecho', name: 'Pecho (cm)' },
    { label: 'Brazo Der.', name: 'Brazo Der. (cm)' },
    { label: 'Brazo Izq.', name: 'Brazo Izq. (cm)' },
    { label: 'Muslo Der.', name: 'Muslo Der. (cm)' },
    { label: 'Muslo Izq.', name: 'Muslo Izq. (cm)' },
    { label: 'Pantorrilla', name: 'Pantorrilla (cm)' },
    { label: 'Espalda', name: 'Espalda (cm)' },
    { label: 'Cuello', name: 'Cuello (cm)' },
];

export default function ClientProgressEditScreen() {
    const { item, clientId } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [colors, mode]);

    const [recordedAt, setRecordedAt] = useState('');
    const [weight, setWeight] = useState('');
    const [comments, setComments] = useState('');
    const [dynamicMeasurements, setDynamicMeasurements] = useState<{ name: string; value: string }[]>([
        { name: '% Grasa', value: '' }
    ]);

    // Local new picked photos
    const [photos, setPhotos] = useState<{
        front: string | null;
        side: string | null;
        back: string | null;
    }>({
        front: null,
        side: null,
        back: null,
    });

    // Original photos from server
    const [originalPhotos, setOriginalPhotos] = useState<{
        front: string | null;
        side: string | null;
        back: string | null;
    }>({
        front: null,
        side: null,
        back: null,
    });

    // Marked for deletion
    const [deletedPhotos, setDeletedPhotos] = useState<{
        front: boolean;
        side: boolean;
        back: boolean;
    }>({
        front: false,
        side: false,
        back: false,
    });

    const { currentUser } = useUser();
    const [isLoading, setIsLoading] = useState(false);
    const [progressId, setProgressId] = useState<string | null>(null);

    useEffect(() => {
        if (currentUser?.role === 'client') {
            Alert.alert('Acceso restringido', 'Los clientes no pueden editar evaluaciones.');
            router.back();
        }
    }, [currentUser]);

    useEffect(() => {
        try {
            if (typeof item === 'string') {
                const progress = JSON.parse(item);
                setProgressId(progress.id);
                const rawDate = progress.recorded_at || progress.created_at;
                if (rawDate) {
                    setRecordedAt(String(rawDate).split('T')[0].split(' ')[0]);
                } else {
                    setRecordedAt(getLocalDateString());
                }
                setWeight(progress.weight ? String(progress.weight) : '');
                setComments(progress.comments || '');

                if (progress.measurements && Object.keys(progress.measurements).length > 0) {
                    const measArr = Object.entries(progress.measurements).map(([k, v]) => ({
                        name: k,
                        value: String(v)
                    }));
                    setDynamicMeasurements(measArr);
                }

                setOriginalPhotos({
                    front: progress.front_photo_url || progress.front_photo_path || progress.front_photo || null,
                    side: progress.side_photo_url || progress.side_photo_path || progress.side_photo || null,
                    back: progress.back_photo_url || progress.back_photo_path || progress.back_photo || null,
                });
            }
        } catch (e) {
            console.error('Error parsing progress item for edit', e);
        }
    }, [item]);

    const handleAddMeasurement = () => {
        setDynamicMeasurements(prev => [...prev, { name: '', value: '' }]);
    };

    const handleAddPresetMetric = (metricName: string) => {
        const existingIdx = dynamicMeasurements.findIndex(
            m => m.name.trim().toLowerCase() === metricName.trim().toLowerCase()
        );
        if (existingIdx >= 0) {
            showToast.info(`"${metricName}" ya está en la lista`);
            return;
        }

        // If the only metric is empty, replace it
        if (dynamicMeasurements.length === 1 && !dynamicMeasurements[0].name && !dynamicMeasurements[0].value) {
            setDynamicMeasurements([{ name: metricName, value: '' }]);
        } else {
            setDynamicMeasurements(prev => [...prev, { name: metricName, value: '' }]);
        }
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

    const handlePickPhoto = async (key: 'front' | 'side' | 'back') => {
        Alert.alert(
            'Foto de progreso',
            'Selecciona una opción:',
            [
                {
                    text: 'Tomar foto con cámara',
                    onPress: async () => {
                        const { status } = await ImagePicker.requestCameraPermissionsAsync();
                        if (status !== 'granted') {
                            Alert.alert('Permiso requerido', 'Se requiere acceso a la cámara para tomar fotos.');
                            return;
                        }
                        const result = await ImagePicker.launchCameraAsync({
                            mediaTypes: ['images'],
                            quality: 0.8,
                            allowsEditing: true,
                        });
                        if (!result.canceled && result.assets[0].uri) {
                            setPhotos(prev => ({ ...prev, [key]: result.assets[0].uri }));
                            setDeletedPhotos(prev => ({ ...prev, [key]: false }));
                        }
                    }
                },
                {
                    text: 'Elegir de galería',
                    onPress: async () => {
                        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                        if (status !== 'granted') {
                            Alert.alert('Permiso requerido', 'Se requiere permiso para acceder a tus fotos.');
                            return;
                        }
                        const result = await ImagePicker.launchImageLibraryAsync({
                            mediaTypes: ['images'],
                            quality: 0.8,
                            allowsEditing: true,
                        });
                        if (!result.canceled && result.assets[0].uri) {
                            setPhotos(prev => ({ ...prev, [key]: result.assets[0].uri }));
                            setDeletedPhotos(prev => ({ ...prev, [key]: false }));
                        }
                    }
                },
                { text: 'Cancelar', style: 'cancel' }
            ]
        );
    };

    const handleRemovePhoto = (key: 'front' | 'side' | 'back') => {
        Alert.alert(
            'Eliminar Foto',
            '¿Deseas quitar esta fotografía de la evaluación?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: () => {
                        setPhotos(prev => ({ ...prev, [key]: null }));
                        setDeletedPhotos(prev => ({ ...prev, [key]: true }));
                    }
                }
            ]
        );
    };

    const handleSave = async () => {
        const hasAnyPhoto =
            (photos.front || (!deletedPhotos.front && originalPhotos.front)) ||
            (photos.side || (!deletedPhotos.side && originalPhotos.side)) ||
            (photos.back || (!deletedPhotos.back && originalPhotos.back));

        const hasAnyMeasurement = dynamicMeasurements.some(m => m.name.trim() && m.value.trim());

        if (!weight && !comments && !hasAnyPhoto && !hasAnyMeasurement) {
            Alert.alert('Campos incompletos', 'Por favor ingresa al menos un dato (peso, medidas, foto o comentarios) para guardar.');
            return;
        }

        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('_method', 'PUT');
            if (recordedAt.trim()) formData.append('recorded_at', recordedAt.trim());
            if (weight) formData.append('weight', weight);
            if (comments) formData.append('comments', comments);

            const measurementsObj: Record<string, string> = {};
            dynamicMeasurements.forEach(m => {
                if (m.name.trim() && m.value.trim()) {
                    measurementsObj[m.name.trim()] = m.value.trim();
                }
            });
            formData.append('measurements', JSON.stringify(measurementsObj));

            // Process photos
            (['front', 'side', 'back'] as const).forEach(sideStr => {
                if (deletedPhotos[sideStr]) {
                    formData.append(`delete_${sideStr}_photo`, '1');
                }

                const uri = photos[sideStr];
                if (uri) {
                    const filename = uri.split('/').pop() || `${sideStr}_photo.jpg`;
                    const match = /\.(\w+)$/.exec(filename);
                    const type = match ? `image/${match[1]}` : `image/jpeg`;
                    // @ts-ignore
                    formData.append(`${sideStr}_photo`, {
                        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
                        name: filename,
                        type,
                    });
                }
            });

            await api.post(`clients/${clientId}/progress/${progressId}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            showToast.success('Evaluación actualizada correctamente');
            router.back();
        } catch (error) {
            console.error('Error updating progress:', error);
            showToast.error('No se pudo actualizar la evaluación');
        } finally {
            setIsLoading(false);
        }
    };

    const renderPhotoSelector = (label: string, key: 'front' | 'side' | 'back') => {
        const isDeleted = deletedPhotos[key];
        const newUri = photos[key];
        const originalUri = !isDeleted ? originalPhotos[key] : null;
        const currentUri = newUri || originalUri;

        return (
            <View style={styles.photoBox}>
                <Text style={styles.photoLabel}>{label}</Text>

                {currentUri ? (
                    <View style={styles.photoContainer}>
                        <Image source={{ uri: currentUri }} style={styles.previewImage} resizeMode="cover" />
                        
                        {/* Status Badge */}
                        <View style={[styles.photoBadge, newUri ? styles.photoBadgeNew : styles.photoBadgeOriginal]}>
                            <Text style={styles.photoBadgeText}>{newUri ? 'Nueva' : 'Guardada'}</Text>
                        </View>

                        {/* Action buttons */}
                        <View style={styles.photoActions}>
                            <TouchableOpacity
                                style={styles.photoActionBtn}
                                onPress={() => handlePickPhoto(key)}
                                activeOpacity={0.8}
                            >
                                <Camera size={14} color="#fff" />
                                <Text style={styles.photoActionBtnText}>Cambiar</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.photoActionBtn, styles.photoActionBtnDanger]}
                                onPress={() => handleRemovePhoto(key)}
                                activeOpacity={0.8}
                            >
                                <Trash size={14} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <TouchableOpacity
                        style={styles.photoBtn}
                        onPress={() => handlePickPhoto(key)}
                        activeOpacity={0.7}
                    >
                        <View style={styles.photoPlaceholder}>
                            <View style={styles.photoIconCircle}>
                                <Camera size={22} color={colors.primary} />
                            </View>
                            <Text style={styles.photoPlaceholderText}>+ Añadir</Text>
                        </View>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <Stack.Screen options={{ headerShown: false }} />

            {/* Header */}
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={22} color={colors.text} />
                </TouchableOpacity>
                <View style={styles.headerTitleContainer}>
                    <Text style={styles.headerTitle}>Editar Evaluación</Text>
                    <Text style={styles.headerSubtitle}>Modifica fotos, medidas y notas</Text>
                </View>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(insets.bottom, 24) + 40 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Fecha y Peso */}
                <View style={styles.sectionRow}>
                    <View style={[styles.section, { flex: 1, marginBottom: 0 }]}>
                        <View style={styles.sectionHeader}>
                            <Calendar size={18} color={colors.primary} />
                            <Text style={styles.sectionTitle}>Fecha</Text>
                        </View>
                        <TextInput
                            style={styles.input}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor={colors.textMuted}
                            value={recordedAt}
                            onChangeText={setRecordedAt}
                        />
                    </View>

                    <View style={[styles.section, { flex: 1, marginBottom: 0 }]}>
                        <View style={styles.sectionHeader}>
                            <Scale size={18} color={colors.primary} />
                            <Text style={styles.sectionTitle}>Peso (kg)</Text>
                        </View>
                        <TextInput
                            style={styles.input}
                            placeholder="Ej. 75.5"
                            keyboardType="decimal-pad"
                            placeholderTextColor={colors.textMuted}
                            value={weight}
                            onChangeText={setWeight}
                        />
                    </View>
                </View>

                {/* Métricas y Biometría */}
                <View style={styles.section}>
                    <View style={styles.sectionHeaderBetween}>
                        <View style={styles.sectionHeader}>
                            <Activity size={18} color={colors.primary} />
                            <Text style={styles.sectionTitle}>Medidas y Biometría</Text>
                        </View>
                        <View style={styles.badgeCount}>
                            <Text style={styles.badgeCountText}>{dynamicMeasurements.length}</Text>
                        </View>
                    </View>

                    {/* Quick Metric Presets */}
                    <Text style={styles.presetSubtitle}>Sugerencias rápidas para añadir:</Text>
                    <View style={styles.chipsContainer}>
                        {PRESET_METRICS.map(preset => {
                            const isAdded = dynamicMeasurements.some(
                                m => m.name.trim().toLowerCase() === preset.name.trim().toLowerCase()
                            );
                            return (
                                <TouchableOpacity
                                    key={preset.name}
                                    style={[styles.chip, isAdded && styles.chipActive]}
                                    onPress={() => handleAddPresetMetric(preset.name)}
                                    activeOpacity={0.7}
                                >
                                    {isAdded ? (
                                        <Check size={12} color="#000" style={{ marginRight: 4 }} />
                                    ) : (
                                        <Plus size={12} color={colors.primary} style={{ marginRight: 4 }} />
                                    )}
                                    <Text style={[styles.chipText, isAdded && styles.chipTextActive]}>
                                        {preset.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {/* Metric Rows */}
                    <View style={styles.metricsList}>
                        {dynamicMeasurements.map((meas, idx) => (
                            <View key={idx} style={styles.measurementRow}>
                                <TextInput
                                    style={[styles.input, styles.measurementNameInput]}
                                    placeholder="Nombre de medida (ej. Cintura)"
                                    placeholderTextColor={colors.textMuted}
                                    value={meas.name}
                                    onChangeText={(val) => updateMeasurement(idx, 'name', val)}
                                />
                                <TextInput
                                    style={[styles.input, styles.measurementValueInput]}
                                    placeholder="Valor (ej. 82)"
                                    placeholderTextColor={colors.textMuted}
                                    value={meas.value}
                                    onChangeText={(val) => updateMeasurement(idx, 'value', val)}
                                />
                                <TouchableOpacity
                                    style={styles.removeMeasBtn}
                                    onPress={() => handleRemoveMeasurement(idx)}
                                    activeOpacity={0.7}
                                >
                                    <Trash size={18} color="#ef4444" />
                                </TouchableOpacity>
                            </View>
                        ))}
                    </View>

                    <TouchableOpacity
                        style={styles.addMeasBtn}
                        onPress={handleAddMeasurement}
                        activeOpacity={0.7}
                    >
                        <Plus size={16} color={colors.primary} />
                        <Text style={styles.addMeasBtnText}>Añadir otra medida personalizada</Text>
                    </TouchableOpacity>
                </View>

                {/* Fotos de Progreso */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Camera size={18} color={colors.primary} />
                        <Text style={styles.sectionTitle}>Fotos de Progreso</Text>
                    </View>
                    <Text style={styles.photosSubtitle}>
                        Puedes cambiar, agregar nuevas fotos o eliminar las fotos actuales.
                    </Text>
                    <View style={styles.photoGrid}>
                        {renderPhotoSelector('Frente', 'front')}
                        {renderPhotoSelector('Perfil', 'side')}
                        {renderPhotoSelector('Espalda', 'back')}
                    </View>
                </View>

                {/* Comentarios */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <FileText size={18} color={colors.primary} />
                        <Text style={styles.sectionTitle}>Comentarios y Observaciones</Text>
                    </View>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Escribe notas sobre avances, sensaciones o recomendaciones..."
                        placeholderTextColor={colors.textMuted}
                        multiline
                        numberOfLines={4}
                        value={comments}
                        onChangeText={setComments}
                    />
                </View>

                {/* Botón Guardar */}
                <TouchableOpacity
                    style={[styles.submitBtn, isLoading && { opacity: 0.7 }]}
                    activeOpacity={0.8}
                    onPress={handleSave}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#000" />
                    ) : (
                        <>
                            <Check size={20} color="#000" strokeWidth={2.5} />
                            <Text style={styles.submitBtnText}>Guardar Cambios</Text>
                        </>
                    )}
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: any, mode: string) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: Spacing.md,
        paddingBottom: 16,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: mode === 'dark' ? '#222' : '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerTitleContainer: {
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '800',
        color: colors.text,
        letterSpacing: -0.3,
    },
    headerSubtitle: {
        fontSize: 12,
        color: colors.textMuted,
        marginTop: 2,
    },
    scroll: {
        padding: Spacing.md,
        gap: 16,
    },
    sectionRow: {
        flexDirection: 'row',
        gap: 12,
    },
    section: {
        backgroundColor: colors.surface,
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: colors.border,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 12,
    },
    sectionHeaderBetween: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    badgeCount: {
        backgroundColor: mode === 'dark' ? 'rgba(34,197,94,0.15)' : '#dcfce7',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    badgeCountText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.primary,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '800',
        color: colors.primary,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
    },
    presetSubtitle: {
        fontSize: 12,
        color: colors.textMuted,
        marginBottom: 10,
    },
    chipsContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 16,
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 12,
        backgroundColor: mode === 'dark' ? '#242424' : '#f1f5f9',
        borderWidth: 1,
        borderColor: colors.border,
    },
    chipActive: {
        backgroundColor: colors.primary,
        borderColor: colors.primary,
    },
    chipText: {
        fontSize: 12,
        fontWeight: '600',
        color: colors.text,
    },
    chipTextActive: {
        color: '#000',
        fontWeight: '800',
    },
    metricsList: {
        gap: 10,
    },
    input: {
        backgroundColor: mode === 'dark' ? '#18181b' : '#f8fafc',
        borderRadius: 14,
        color: colors.text,
        fontSize: 14,
        paddingHorizontal: 14,
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    textArea: {
        minHeight: 90,
        textAlignVertical: 'top',
        paddingTop: 12,
    },
    measurementRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
    },
    measurementNameInput: {
        flex: 1.8,
    },
    measurementValueInput: {
        flex: 1.2,
    },
    removeMeasBtn: {
        width: 42,
        height: 42,
        borderRadius: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        alignItems: 'center',
        justifyContent: 'center',
    },
    addMeasBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: colors.primary,
        borderStyle: 'dashed',
        borderRadius: 14,
        gap: 8,
        marginTop: 12,
        backgroundColor: mode === 'dark' ? 'rgba(34,197,94,0.04)' : '#f0fdf4',
    },
    addMeasBtnText: {
        color: colors.primary,
        fontWeight: '700',
        fontSize: 13,
    },
    photosSubtitle: {
        fontSize: 12,
        color: colors.textMuted,
        marginBottom: 14,
        lineHeight: 16,
    },
    photoGrid: {
        flexDirection: 'row',
        gap: 10,
    },
    photoBox: {
        flex: 1,
    },
    photoLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.textMuted,
        marginBottom: 6,
        textAlign: 'center',
    },
    photoContainer: {
        width: '100%',
        aspectRatio: 3 / 4,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#000',
        position: 'relative',
        borderWidth: 1,
        borderColor: colors.border,
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    photoBadge: {
        position: 'absolute',
        top: 6,
        left: 6,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    photoBadgeNew: {
        backgroundColor: colors.primary,
    },
    photoBadgeOriginal: {
        backgroundColor: 'rgba(0,0,0,0.65)',
    },
    photoBadgeText: {
        fontSize: 9,
        fontWeight: '800',
        color: '#000',
    },
    photoActions: {
        position: 'absolute',
        bottom: 6,
        left: 6,
        right: 6,
        flexDirection: 'row',
        gap: 6,
    },
    photoActionBtn: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingVertical: 6,
        borderRadius: 8,
        gap: 4,
    },
    photoActionBtnDanger: {
        flex: 0,
        width: 32,
        backgroundColor: 'rgba(239,68,68,0.85)',
    },
    photoActionBtnText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#fff',
    },
    photoBtn: {
        width: '100%',
        aspectRatio: 3 / 4,
        backgroundColor: mode === 'dark' ? '#18181b' : '#f8fafc',
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: colors.border,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
    },
    photoPlaceholder: {
        alignItems: 'center',
        gap: 8,
    },
    photoIconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: mode === 'dark' ? '#27272a' : '#e2e8f0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    photoPlaceholderText: {
        fontSize: 12,
        fontWeight: '700',
        color: colors.primary,
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        paddingVertical: 16,
        borderRadius: 18,
        gap: 8,
        marginTop: 8,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    submitBtnText: {
        fontWeight: '800',
        fontSize: 16,
        color: '#000',
    },
});
