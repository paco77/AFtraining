import { Colors, Spacing } from '@/constants/theme';
import { useUser } from '@/context/UserContext';
import { showToast } from '@/services/toast';
import api from '@/services/api';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import {
    ArrowLeft,
    Camera,
    Check,
    User,
    Watch,
    Activity,
    Plus,
    Trash
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
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
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function EditClientScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { clients, refreshProfile } = useUser();

    const client = useMemo(() => clients.find(c => String(c.id) === String(id)), [clients, id]);

    // Personal Data
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [age, setAge] = useState('');
    const [weight, setWeight] = useState('');
    const [height, setHeight] = useState('');
    const [trainingTime, setTrainingTime] = useState('');
    const [objectives, setObjectives] = useState('');

    // Metrics / Measurements
    const [dynamicMeasurements, setDynamicMeasurements] = useState<{name: string; value: string}[]>([]);

    // Photos
    const [photos, setPhotos] = useState({
        profile: null as string | null,
        front: null as string | null,
        side: null as string | null,
        back: null as string | null,
    });
    
    // Existing photo URLs (so we can show them if not overridden)
    const [existingPhotos, setExistingPhotos] = useState({
        profile: null as string | null,
        front: null as string | null,
        side: null as string | null,
        back: null as string | null,
    });

    const [isSaving, setIsSaving] = useState(false);
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        let isMounted = true;

        if (client) {
            if (isMounted) {
                setName(client.name || '');
                setEmail(client.email || '');
                setAge(client.age ? String(client.age) : '');
            }
            
            // Note: client object in Context might not map all raw properties, 
            // but we can try to get them, or fetch the client fresh from the API if needed.
            // For now, we will do a fresh fetch to ensure we have ALL raw details (like initial_measurements)
            const fetchFullClient = async () => {
                try {
                    const response = await api.get(`clients/${id}`);
                    const fullClient = response.data.data || response.data;
                    
                    if (!isMounted) return;

                    // Remove debug alert
                    setName(fullClient.name || '');
                    setEmail(fullClient.email || '');
                    setAge(fullClient.age ? String(fullClient.age) : '');
                    setWeight(fullClient.weight ? String(fullClient.weight) : '');
                    setHeight(fullClient.height ? String(fullClient.height) : '');
                    setTrainingTime(fullClient.training_time || '');
                    setObjectives(fullClient.objectives || '');

                    // Parse measurements
                    let measurementsObj = null;
                    if (fullClient.measurements) {
                        measurementsObj = typeof fullClient.measurements === 'string' 
                            ? JSON.parse(fullClient.measurements) 
                            : fullClient.measurements;
                    } else if (fullClient.initial_measurements) {
                        measurementsObj = typeof fullClient.initial_measurements === 'string' 
                            ? JSON.parse(fullClient.initial_measurements) 
                            : fullClient.initial_measurements;
                    } else {
                        // Fallback: fetch from progress history (first evaluation)
                        try {
                            const progRes = await api.get(`clients/${id}/progress`);
                            const progData = Array.isArray(progRes.data) ? progRes.data : progRes.data.data || [];
                            if (progData.length > 0) {
                                // Get the oldest record
                                const oldest = progData.sort((a: any, b: any) => 
                                    new Date(a.created_at || a.recorded_at).getTime() - new Date(b.created_at || b.recorded_at).getTime()
                                )[0];
                                if (oldest && oldest.measurements) {
                                    measurementsObj = typeof oldest.measurements === 'string' 
                                        ? JSON.parse(oldest.measurements) 
                                        : oldest.measurements;
                                }
                            }
                        } catch (e) {
                            console.log("No se pudo obtener el historial de progreso para métricas", e);
                        }
                    }

                    if (measurementsObj && Object.keys(measurementsObj).length > 0) {
                        const arr = Object.keys(measurementsObj).map(k => ({ name: k, value: String(measurementsObj[k]) }));
                        setDynamicMeasurements(arr);
                    } else {
                        setDynamicMeasurements([{ name: '% Grasa', value: '' }]);
                    }

                    const formatUrl = (path: string | null) => {
                        if (!path) return null;
                        
                        // Si la ruta es relativa (no empieza con http), asume que es de S3 (o puedes cambiarlo según tu entorno)
                        if (!path.startsWith('http')) {
                            return `https://aftraining-storage.sfo2.digitaloceanspaces.com/${path}`;
                        }

                        // Si la API devuelve la URL de producción pero estamos probando en local (192.168.x.x),
                        // la imagen fallará en la app. La reemplazamos temporalmente para que apunte al servidor local:
                        if (path.includes('aftraining.skecomponent.mx/storage')) {
                            return path.replace('https://aftraining.skecomponent.mx', 'http://192.168.3.198:8000');
                        }

                        return path;
                    };

                    // Existing photos
                    setExistingPhotos({
                        profile: formatUrl(fullClient.profile_photo_url || fullClient.profile_photo_path),
                        front: formatUrl(fullClient.front_photo_url || fullClient.front_photo_path || fullClient.front_photo),
                        side: formatUrl(fullClient.side_photo_url || fullClient.side_photo_path || fullClient.side_photo),
                        back: formatUrl(fullClient.back_photo_url || fullClient.back_photo_path || fullClient.back_photo),
                    });
                    
                } catch (error) {
                    console.error('Error fetching client details:', error);
                } finally {
                    if (isMounted) {
                        setIsLoaded(true);
                    }
                }
            };
            
            fetchFullClient();
        } else {
            if (isMounted) {
                setIsLoaded(true);
            }
        }

        return () => {
            isMounted = false;
        };
    }, [client, id]);

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

    const handleSave = async () => {
        if (!name || !email) {
            Alert.alert('Error', 'Por favor completa el nombre y email.');
            return;
        }

        const measurementsObj: Record<string, string> = {};
        dynamicMeasurements.forEach(m => {
            if (m.name.trim() && m.value.trim()) {
                measurementsObj[m.name.trim()] = m.value.trim();
            }
        });

        setIsSaving(true);
        try {
            const formData = new FormData();
            formData.append('_method', 'PUT');
            formData.append('name', name);
            formData.append('email', email);
            if (age) formData.append('age', age);
            if (weight) formData.append('weight', weight);
            if (height) formData.append('height', height);
            if (trainingTime) formData.append('training_time', trainingTime);
            if (objectives) formData.append('objectives', objectives);
            
            if (Object.keys(measurementsObj).length > 0) {
                formData.append('measurements', JSON.stringify(measurementsObj));
            } else {
                formData.append('measurements', '{}');
            }

            // Append photos if they were changed
            ['profile', 'front', 'side', 'back'].forEach(sideStr => {
                const uri = (photos as any)[sideStr];
                if (uri) {
                    const filename = uri.split('/').pop() || 'photo.jpg';
                    const match = /\.(\w+)$/.exec(filename);
                    const type = match ? `image/${match[1]}` : `image`;
                    // @ts-ignore
                    formData.append(sideStr === 'profile' ? 'profile_photo' : `${sideStr}_photo`, {
                        uri: Platform.OS === 'android' ? uri : uri.replace('file://', ''),
                        name: filename,
                        type,
                    });
                }
            });

            await api.post(`clients/${id}`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            await refreshProfile();
            showToast.success('Perfil actualizado correctamente');
            router.back();
        } catch (error: any) {
            console.log('Error al actualizar cliente:', error.response?.data || error.message);
            if (error.response?.data?.errors) {
                const firstError: any = Object.values(error.response.data.errors)[0];
                Alert.alert('Error de validación', Array.isArray(firstError) ? firstError[0] : firstError);
            } else {
                const errorMsg = error.response?.data?.message || 'No se pudo actualizar el perfil';
                Alert.alert('Error', errorMsg);
            }
        } finally {
            setIsSaving(false);
        }
    };

    const handlePickPhoto = async (key: keyof typeof photos) => {
        Alert.alert(
            'Foto',
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

    const renderPhotoSelector = (label: string, key: keyof typeof photos) => {
        const currentUri = photos[key] || existingPhotos[key];
        return (
            <View style={styles.photoBox}>
                <Text style={styles.photoLabel}>{label}</Text>
                <TouchableOpacity
                    style={[styles.photoBtn, currentUri && styles.photoBtnFilled]}
                    onPress={() => handlePickPhoto(key)}
                >
                    {currentUri ? (
                        <Image source={{ uri: currentUri! }} style={styles.previewImage} />
                    ) : (
                        <View style={styles.photoPlaceholder}>
                            <Camera size={24} color={Colors.textMuted} />
                            <Text style={styles.photoPlaceholderText}>Añadir foto</Text>
                        </View>
                    )}
                </TouchableOpacity>
            </View>
        );
    };

    if (!isLoaded) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Stack.Screen options={{ headerShown: false }} />
                <ActivityIndicator size="large" color={Colors.primary} />
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <Stack.Screen options={{ headerShown: false }} />

            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Editar Cliente</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(styles.scroll.paddingBottom || 0, insets.bottom + 20) }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <User size={18} color={Colors.primary} />
                        <Text style={styles.sectionTitle}>Datos Generales</Text>
                    </View>

                    <View style={{ alignItems: 'center', marginBottom: 20 }}>
                        <TouchableOpacity
                            style={[styles.photoBtn, { width: 100, height: 100, borderRadius: 50 }, (photos.profile || existingPhotos.profile) && styles.photoBtnFilled]}
                            onPress={() => handlePickPhoto('profile')}
                        >
                            {(photos.profile || existingPhotos.profile) ? (
                                <Image source={{ uri: photos.profile || existingPhotos.profile! }} style={{ width: '100%', height: '100%', borderRadius: 50 }} />
                            ) : (
                                <View style={styles.photoPlaceholder}>
                                    <Camera size={24} color={Colors.textMuted} />
                                    <Text style={styles.photoPlaceholderText}>Foto de Perfil</Text>
                                </View>
                            )}
                        </TouchableOpacity>
                    </View>

                    <TextInput
                        style={styles.input}
                        placeholder="Nombre Completo"
                        placeholderTextColor={Colors.textMuted}
                        value={name}
                        onChangeText={setName}
                    />

                    <TextInput
                        style={styles.input}
                        placeholder="Correo Electrónico"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        placeholderTextColor={Colors.textMuted}
                        value={email}
                        onChangeText={setEmail}
                    />

                    <View style={styles.row}>
                        <TextInput
                            style={[styles.input, { flex: 1, marginRight: 8 }]}
                            placeholder="Edad"
                            keyboardType="decimal-pad"
                            placeholderTextColor={Colors.textMuted}
                            value={age}
                            onChangeText={setAge}
                        />
                        <TextInput
                            style={[styles.input, { flex: 1, marginLeft: 8 }]}
                            placeholder="Peso (kg)"
                            keyboardType="decimal-pad"
                            placeholderTextColor={Colors.textMuted}
                            value={weight}
                            onChangeText={setWeight}
                        />
                    </View>

                    <View style={styles.row}>
                        <TextInput
                            style={[styles.input, { flex: 1, marginRight: 8 }]}
                            placeholder="Estatura (cm)"
                            keyboardType="decimal-pad"
                            placeholderTextColor={Colors.textMuted}
                            value={height}
                            onChangeText={setHeight}
                        />
                        <View style={{ flex: 1, marginLeft: 8 }} />
                    </View>
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Watch size={18} color={Colors.primary} />
                        <Text style={styles.sectionTitle}>Experiencia y Objetivos</Text>
                    </View>

                    <TextInput
                        style={styles.input}
                        placeholder="Tiempo entrenando (ej: 6 meses)"
                        placeholderTextColor={Colors.textMuted}
                        value={trainingTime}
                        onChangeText={setTrainingTime}
                    />

                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Objetivos (ej: Perder grasa, ganar músculo...)"
                        placeholderTextColor={Colors.textMuted}
                        multiline
                        numberOfLines={3}
                        value={objectives}
                        onChangeText={setObjectives}
                    />
                </View>

                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Activity size={18} color={Colors.primary} />
                        <Text style={styles.sectionTitle}>Biometría Inicial</Text>
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
                                keyboardType="decimal-pad"
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
                        <Text style={styles.sectionTitle}>Fotos Iniciales</Text>
                    </View>
                    <View style={styles.photoGrid}>
                        {renderPhotoSelector('Frontal', 'front')}
                        {renderPhotoSelector('Lateral', 'side')}
                        {renderPhotoSelector('Espalda', 'back')}
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.submitBtn, isSaving && { opacity: 0.7 }]}
                    activeOpacity={0.8}
                    onPress={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? (
                        <ActivityIndicator color="#000" />
                    ) : (
                        <>
                            <Check size={20} color="#000" />
                            <Text style={styles.submitBtnText}>Guardar Cambios</Text>
                        </>
                    )}
                </TouchableOpacity>

                <View style={{ height: 60 }} />
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
        marginBottom: 28,
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
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    row: {
        flexDirection: 'row',
        gap: 12,
    },
    textArea: {
        minHeight: 100,
        textAlignVertical: 'top',
        paddingTop: 14,
    },
    photoGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
    },
    photoBox: {
        flex: 1,
        alignItems: 'center',
    },
    photoLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: Colors.textMuted,
        marginBottom: 8,
    },
    photoBtn: {
        width: '100%',
        aspectRatio: 0.8,
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
        fontSize: 10,
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
        marginTop: 10,
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
