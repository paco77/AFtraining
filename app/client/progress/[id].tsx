import { Colors, Spacing } from '@/constants/theme';
import { showToast } from '@/services/toast';
import api from '@/services/api';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Camera, Check, FileText, Plus, Scale, Trash, Activity } from 'lucide-react-native';
import React, { useState } from 'react';
import {
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

export default function ClientProgressScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();

    const [weight, setWeight] = useState('');
    const [comments, setComments] = useState('');
    const [dynamicMeasurements, setDynamicMeasurements] = useState([{ name: '% Grasa', value: '' }]);
    const [photos, setPhotos] = useState({
        front: null as string | null,
        side: null as string | null,
        back: null as string | null,
    });
    const [isLoading, setIsLoading] = useState(false);

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

    const handlePickPhoto = async (key: keyof typeof photos) => {
        Alert.alert(
            'Foto de progreso',
            '¿Qué deseas hacer?',
            [
                {
                    text: 'Tomar foto',
                    onPress: async () => {
                        const { status } = await ImagePicker.requestCameraPermissionsAsync();
                        if (status !== 'granted') {
                            Alert.alert('Error', 'Se requiere permiso para usar la cámara');
                            return;
                        }
                        const result = await ImagePicker.launchCameraAsync({
                            mediaTypes: ['images'],
                            quality: 0.7,
                        });
                        if (!result.canceled && result.assets[0].uri) {
                            setPhotos(prev => ({ ...prev, [key]: result.assets[0].uri }));
                        }
                    }
                },
                {
                    text: 'Elegir de la galería',
                    onPress: async () => {
                        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
                        if (status !== 'granted') {
                            Alert.alert('Error', 'Se requiere permiso para acceder a las fotos');
                            return;
                        }
                        const result = await ImagePicker.launchImageLibraryAsync({
                            mediaTypes: ['images'],
                            quality: 0.7,
                        });
                        if (!result.canceled && result.assets[0].uri) {
                            setPhotos(prev => ({ ...prev, [key]: result.assets[0].uri }));
                        }
                    }
                },
                { text: 'Cancelar', style: 'cancel' }
            ]
        );
    };

    const handleSave = async () => {
        if (!weight && !comments && !photos.front && !photos.back) {
            Alert.alert('Error', 'Por favor ingresa al menos un dato para guardar el progreso.');
            return;
        }

        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('client_id', String(id));
            formData.append('recorded_at', new Date().toISOString().split('T')[0]);
            if (weight) formData.append('weight', weight);
            if (comments) formData.append('comments', comments);

            const measurementsObj: Record<string, string> = {};
            dynamicMeasurements.forEach(m => {
                if (m.name.trim() && m.value.trim()) {
                    measurementsObj[m.name.trim()] = m.value.trim();
                }
            });
            if (Object.keys(measurementsObj).length > 0) {
                formData.append('measurements', JSON.stringify(measurementsObj));
            }

            ['front', 'side', 'back'].forEach(sideStr => {
                const uri = (photos as any)[sideStr];
                if (uri) {
                    const filename = uri.split('/').pop() || 'photo.jpg';
                    const match = /\.(\w+)$/.exec(filename);
                    const type = match ? `image/${match[1]}` : `image`;
                    // @ts-ignore
                    formData.append(`${sideStr}_photo`, {
                        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
                        name: filename,
                        type,
                    });
                }
            });

            await api.post(`clients/${id}/progress`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            showToast.success('Progreso registrado correctamente');
            router.back();
        } catch (error) {
            console.error(error);
            showToast.error('No se pudo guardar el progreso');
        } finally {
            setIsLoading(false);
        }
    };

    const renderPhotoSelector = (label: string, key: keyof typeof photos) => (
        <View style={styles.photoBox}>
            <Text style={styles.photoLabel}>{label}</Text>
            <TouchableOpacity
                style={[styles.photoBtn, photos[key] && styles.photoBtnFilled]}
                onPress={() => handlePickPhoto(key)}
            >
                {photos[key] ? (
                    <Image source={{ uri: photos[key]! }} style={styles.previewImage} />
                ) : (
                    <View style={styles.photoPlaceholder}>
                        <Camera size={24} color={Colors.textMuted} />
                        <Text style={styles.photoPlaceholderText}>Añadir foto</Text>
                    </View>
                )}
            </TouchableOpacity>
        </View>
    );

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <Stack.Screen options={{ headerShown: false }} />
            
            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Registrar Progreso</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Scale size={18} color={Colors.primary} />
                        <Text style={styles.sectionTitle}>Peso Actual</Text>
                    </View>
                    <TextInput
                        style={styles.input}
                        placeholder="Peso (kg)"
                        keyboardType="numeric"
                        placeholderTextColor={Colors.textMuted}
                        value={weight}
                        onChangeText={setWeight}
                    />
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Activity size={18} color={Colors.primary} />
                        <Text style={styles.sectionTitle}>Biometría Avanzada</Text>
                    </View>
                    
                    {dynamicMeasurements.map((meas, idx) => (
                        <View key={idx} style={styles.measurementRow}>
                            <TextInput
                                style={[styles.input, styles.measurementNameInput]}
                                placeholder="Nombre (ej. Pecho)"
                                placeholderTextColor={Colors.textMuted}
                                value={meas.name}
                                onChangeText={(val) => updateMeasurement(idx, 'name', val)}
                            />
                            <TextInput
                                style={[styles.input, styles.measurementValueInput]}
                                placeholder="Valor"
                                keyboardType="numeric"
                                placeholderTextColor={Colors.textMuted}
                                value={meas.value}
                                onChangeText={(val) => updateMeasurement(idx, 'value', val)}
                            />
                            <TouchableOpacity 
                                style={styles.removeMeasBtn} 
                                onPress={() => handleRemoveMeasurement(idx)}
                            >
                                <Trash size={20} color={Colors.error || '#ef4444'} />
                            </TouchableOpacity>
                        </View>
                    ))}
                    
                    <TouchableOpacity style={styles.addMeasBtn} onPress={handleAddMeasurement}>
                        <Plus size={16} color={Colors.primary} />
                        <Text style={styles.addMeasBtnText}>Añadir medida</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Camera size={18} color={Colors.primary} />
                        <Text style={styles.sectionTitle}>Fotos de Progreso</Text>
                    </View>
                    <View style={styles.photoGrid}>
                        {renderPhotoSelector('Frente', 'front')}
                        {renderPhotoSelector('Perfil', 'side')}
                        {renderPhotoSelector('Espalda', 'back')}
                    </View>
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <FileText size={18} color={Colors.primary} />
                        <Text style={styles.sectionTitle}>Comentarios</Text>
                    </View>
                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Observaciones de este periodo..."
                        placeholderTextColor={Colors.textMuted}
                        multiline
                        numberOfLines={4}
                        value={comments}
                        onChangeText={setComments}
                    />
                </View>

                <TouchableOpacity
                    style={styles.submitBtn}
                    activeOpacity={0.8}
                    onPress={handleSave}
                    disabled={isLoading}
                >
                    <Check size={20} color="#000" />
                    <Text style={styles.submitBtnText}>{isLoading ? 'Guardando...' : 'Guardar Progreso'}</Text>
                </TouchableOpacity>

                <View style={{ height: 40 }} />
            </ScrollView>
        </KeyboardAvoidingView>
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
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
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
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: Colors.text,
        letterSpacing: -0.5,
    },
    scroll: {
        padding: Spacing.md,
    },
    section: {
        marginBottom: 24,
        backgroundColor: Colors.surface,
        padding: 20,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: Colors.border,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 16,
    },
    sectionTitle: {
        fontSize: 15,
        fontWeight: '800',
        color: Colors.primary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    input: {
        backgroundColor: Colors.surfaceLight,
        borderRadius: 16,
        color: Colors.text,
        fontSize: 15,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
        paddingTop: 14,
    },
    photoGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 16,
    },
    photoBox: {
        flex: 1,
        alignItems: 'center',
    },
    photoLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: Colors.textMuted,
        marginBottom: 8,
    },
    photoBtn: {
        width: '100%',
        aspectRatio: 3/4,
        backgroundColor: Colors.surfaceLight,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: Colors.border,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    photoBtnFilled: {
        borderStyle: 'solid',
        borderColor: Colors.primary,
    },
    photoPlaceholder: {
        alignItems: 'center',
        gap: 6,
    },
    photoPlaceholderText: {
        fontSize: 12,
        fontWeight: '500',
        color: Colors.textMuted,
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: Colors.primary,
        paddingVertical: 18,
        borderRadius: 20,
        gap: 10,
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    submitBtnText: {
        fontWeight: '800',
        fontSize: 17,
        color: '#000',
    },
    measurementRow: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
        alignItems: 'center',
    },
    measurementNameInput: {
        flex: 2,
    },
    measurementValueInput: {
        flex: 1,
    },
    removeMeasBtn: {
        padding: 10,
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        borderRadius: 12,
    },
    addMeasBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        borderWidth: 1,
        borderColor: Colors.border,
        borderStyle: 'dashed',
        borderRadius: 16,
        gap: 8,
        marginTop: 4,
    },
    addMeasBtnText: {
        color: Colors.primary,
        fontWeight: '700',
        fontSize: 14,
    }
});
