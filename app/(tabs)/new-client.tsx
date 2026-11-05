import { Colors, Spacing } from '@/constants/theme';
import { useUser } from '@/context/UserContext';
import { showToast } from '@/services/toast';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import {
    Activity,
    ArrowLeft,
    Camera,
    Check,
    Eye,
    EyeOff,
    Lock,
    Plus,
    Trash,
    User,
    Watch
} from 'lucide-react-native';
import { useState, useMemo } from 'react';
import { useTheme } from '@/context/ThemeContext';
import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function NewClientScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { addClient, currentUser } = useUser();
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors, mode), [mode, colors]);

    // Personal Data
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [age, setAge] = useState('');
    const [weight, setWeight] = useState('');
    const [height, setHeight] = useState('');
    const [trainingTime, setTrainingTime] = useState('');
    const [objectives, setObjectives] = useState('');

    // Metrics / Measurements
    const [dynamicMeasurements, setDynamicMeasurements] = useState([{ name: '% Grasa', value: '' }]);

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

    // Credentials
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Photos (simulated)
    const [photos, setPhotos] = useState({
        profile: null as string | null,
        front: null as string | null,
        side: null as string | null,
        back: null as string | null,
    });
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!name || !username || !password || !email) {
            Alert.alert('Error', 'Por favor completa el nombre, email, usuario y contraseña.');
            return;
        }

        const measurementsObj: Record<string, string> = {};
        dynamicMeasurements.forEach(m => {
            if (m.name.trim() && m.value.trim()) {
                measurementsObj[m.name.trim()] = m.value.trim();
            }
        });

        const clientData = {
            name,
            username,
            email,
            phone,
            password,
            age: Number(age) || null,
            weight: Number(weight) || null,
            height: Number(height) || null,
            training_time: trainingTime,
            objectives,
            measurements: Object.keys(measurementsObj).length > 0 ? JSON.stringify(measurementsObj) : null,
        };

        const executeSave = async (notifyWhatsApp: boolean) => {
            setIsSaving(true);
            try {
                await addClient(clientData as any, photos);
                showToast.success('Cliente registrado correctamente');

                if (notifyWhatsApp) {
                    const message = `¡Hola ${name}! Tu cuenta en App AFTraining ha sido creada. Tu usuario es: ${username} y tu contraseña es: ${password}.`;
                    const encodedMessage = encodeURIComponent(message);
                    const url = phone
                        ? `whatsapp://send?phone=${phone}&text=${encodedMessage}`
                        : `whatsapp://send?text=${encodedMessage}`;

                    Linking.openURL(url).catch(() => {
                        Alert.alert('Error', 'No se pudo abrir WhatsApp');
                    });
                }

                router.back();
            } catch (error: any) {
                console.log('Error al registrar cliente:', error.response?.data || error.message);
                if (error.response?.data?.errors) {
                    const firstError: any = Object.values(error.response.data.errors)[0];
                    Alert.alert('Error de validación', Array.isArray(firstError) ? firstError[0] : firstError);
                } else {
                    const errorMsg = error.response?.data?.message || 'No se pudo registrar al cliente';
                    Alert.alert('Error', errorMsg);
                }
            } finally {
                setIsSaving(false);
            }
        };

        Alert.alert(
            'Guardar Cliente',
            '¿Deseas avisar a este cliente por WhatsApp o simplemente guardar la información?',
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Solo guardar', onPress: () => executeSave(false) },
                { text: 'Avisar por WhatsApp', onPress: () => executeSave(true) }
            ]
        );
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
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) }]}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <ArrowLeft size={24} color={Colors.text} />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Nuevo Cliente</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView
                contentContainerStyle={[styles.scroll, { paddingBottom: Math.max(Spacing.md, insets.bottom + 20) }]}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
            >
                {/* Visual Section: User Info */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <User size={18} color={Colors.primary} />
                        <Text style={styles.sectionTitle}>Datos Generales</Text>
                    </View>

                    <View style={{ alignItems: 'center', marginBottom: 20 }}>
                        <TouchableOpacity
                            style={[styles.photoBtn, { width: 100, height: 100, borderRadius: 50 }, photos.profile && styles.photoBtnFilled]}
                            onPress={() => handlePickPhoto('profile')}
                        >
                            {photos.profile ? (
                                <Image source={{ uri: photos.profile }} style={{ width: '100%', height: '100%', borderRadius: 50 }} />
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
                        placeholderTextColor={colors.textMuted}
                        value={name}
                        onChangeText={setName}
                    />

                    <TextInput
                        style={styles.input}
                        placeholder="Correo Electrónico"
                        keyboardType="email-address"
                        autoCapitalize="none"
                        placeholderTextColor={colors.textMuted}
                        value={email}
                        onChangeText={setEmail}
                    />

                    <TextInput
                        style={styles.input}
                        placeholder="Teléfono Celular"
                        keyboardType="phone-pad"
                        placeholderTextColor={colors.textMuted}
                        value={phone}
                        onChangeText={setPhone}
                    />

                    <View style={styles.row}>
                        <TextInput
                            style={[styles.input, { flex: 1, marginRight: 8 }]}
                            placeholder="Edad"
                            keyboardType="decimal-pad"
                            placeholderTextColor={colors.textMuted}
                            value={age}
                            onChangeText={setAge}
                        />
                        <TextInput
                            style={[styles.input, { flex: 1, marginLeft: 8 }]}
                            placeholder="Peso (kg)"
                            keyboardType="decimal-pad"
                            placeholderTextColor={colors.textMuted}
                            value={weight}
                            onChangeText={setWeight}
                        />
                    </View>

                    <View style={styles.row}>
                        <TextInput
                            style={[styles.input, { flex: 1, marginRight: 8 }]}
                            placeholder="Estatura (cm)"
                            keyboardType="decimal-pad"
                            placeholderTextColor={colors.textMuted}
                            value={height}
                            onChangeText={setHeight}
                        />
                        <View style={{ flex: 1, marginLeft: 8 }} />
                    </View>
                </View>

                {/* Training Experience */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Watch size={18} color={Colors.primary} />
                        <Text style={styles.sectionTitle}>Experiencia y Objetivos</Text>
                    </View>

                    <TextInput
                        style={styles.input}
                        placeholder="Tiempo entrenando (ej: 6 meses)"
                        placeholderTextColor={colors.textMuted}
                        value={trainingTime}
                        onChangeText={setTrainingTime}
                    />

                    <TextInput
                        style={[styles.input, styles.textArea]}
                        placeholder="Objetivos (ej: Perder grasa, ganar músculo...)"
                        placeholderTextColor={colors.textMuted}
                        multiline
                        numberOfLines={3}
                        value={objectives}
                        onChangeText={setObjectives}
                    />
                </View>

                {/* Advanced Biometrics / Measurements */}
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
                                placeholderTextColor={colors.textMuted}
                                value={meas.name}
                                onChangeText={(val) => updateMeasurement(idx, 'name', val)}
                            />
                            <TextInput
                                style={[styles.input, styles.measurementValueInput]}
                                placeholder="Valor"
                                keyboardType="decimal-pad"
                                placeholderTextColor={colors.textMuted}
                                value={meas.value}
                                onChangeText={(val) => updateMeasurement(idx, 'value', val)}
                            />
                            <TouchableOpacity
                                style={styles.removeMeasBtn}
                                onPress={() => handleRemoveMeasurement(idx)}
                            >
                                <Trash size={20} color={Colors.danger || '#ef4444'} />
                            </TouchableOpacity>
                        </View>
                    ))}

                    <TouchableOpacity style={styles.addMeasBtn} onPress={handleAddMeasurement}>
                        <Plus size={16} color={Colors.primary} />
                        <Text style={styles.addMeasBtnText}>Añadir medida</Text>
                    </TouchableOpacity>
                </View>

                {/* Photos */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Camera size={18} color={Colors.primary} />
                        <Text style={styles.sectionTitle}>Fotos de Progreso</Text>
                    </View>
                    <View style={styles.photoGrid}>
                        {renderPhotoSelector('Frontal', 'front')}
                        {renderPhotoSelector('Lateral', 'side')}
                        {renderPhotoSelector('Espalda', 'back')}
                    </View>
                </View>

                {/* Login Info */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Lock size={18} color={Colors.primary} />
                        <Text style={styles.sectionTitle}>Credenciales de Acceso</Text>
                    </View>
                    <Text style={styles.infoText}>Asigna un usuario y contraseña para que el cliente pueda entrar.</Text>

                    <TextInput
                        style={styles.input}
                        placeholder="Nombre de Usuario"
                        autoCapitalize="none"
                        placeholderTextColor={colors.textMuted}
                        value={username}
                        onChangeText={setUsername}
                    />

                    <View style={styles.passwordContainer}>
                        <TextInput
                            style={styles.passwordInput}
                            placeholder="Contraseña (8 caracteres)"
                            secureTextEntry={!showPassword}
                            placeholderTextColor={colors.textMuted}
                            value={password}
                            onChangeText={setPassword}
                        />
                        <TouchableOpacity
                            onPress={() => setShowPassword(!showPassword)}
                            style={styles.eyeIcon}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                            {showPassword ? (
                                <EyeOff size={20} color={Colors.textMuted} />
                            ) : (
                                <Eye size={20} color={Colors.textMuted} />
                            )}
                        </TouchableOpacity>
                    </View>
                </View>

                <TouchableOpacity
                    style={[styles.submitBtn, isSaving && { opacity: 0.7 }]}
                    activeOpacity={0.8}
                    onPress={handleSave}
                    disabled={isSaving}
                >
                    {isSaving ? (
                        <ActivityIndicator color={mode === 'dark' ? '#000' : '#FFF'} />
                    ) : (
                        <>
                            <Check size={20} color={mode === 'dark' ? '#000' : '#FFF'} />
                            <Text style={styles.submitBtnText}>Registrar Cliente</Text>
                        </>
                    )}
                </TouchableOpacity>

                <View style={{ height: 60 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const getStyles = (colors: any, mode: 'dark' | 'light') => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: Spacing.md,
        paddingTop: Platform.OS === 'ios' ? 60 : 20,
        paddingBottom: 20,
        backgroundColor: colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    backBtn: {
        padding: 8,
        backgroundColor: mode === 'dark' ? colors.surfaceLight : colors.surface_container_low,
        borderRadius: 12,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '800',
        color: colors.text,
        letterSpacing: -0.5,
    },
    scroll: {
        padding: Spacing.md,
    },
    section: {
        marginBottom: 28,
        backgroundColor: colors.surface,
        padding: 20,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: colors.border,
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
        color: colors.primary,
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    input: {
        backgroundColor: mode === 'dark' ? colors.surfaceLight : colors.surface_lowest,
        borderRadius: 16,
        color: colors.text,
        fontSize: 15,
        paddingHorizontal: 16,
        paddingVertical: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    passwordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: mode === 'dark' ? colors.surfaceLight : colors.surface_lowest,
        borderRadius: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
    },
    passwordInput: {
        flex: 1,
        color: colors.text,
        fontSize: 15,
        paddingHorizontal: 16,
        paddingVertical: 14,
    },
    eyeIcon: {
        padding: 14,
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
        color: colors.textMuted,
        marginBottom: 8,
    },
    photoBtn: {
        width: '100%',
        aspectRatio: 0.8,
        backgroundColor: mode === 'dark' ? colors.surfaceLight : colors.surface_lowest,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
    },
    photoBtnFilled: {
        borderStyle: 'solid',
        borderColor: colors.primary,
    },
    photoPlaceholder: {
        alignItems: 'center',
        gap: 6,
    },
    photoPlaceholderText: {
        fontSize: 10,
        fontWeight: '500',
        color: colors.textMuted,
    },
    previewImage: {
        width: '100%',
        height: '100%',
    },
    infoText: {
        fontSize: 13,
        color: colors.textMuted,
        marginBottom: 16,
        lineHeight: 20,
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.primary,
        paddingVertical: 18,
        borderRadius: 20,
        gap: 10,
        marginTop: 10,
        shadowColor: colors.primary,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
    },
    submitBtnText: {
        fontWeight: '800',
        fontSize: 17,
        color: mode === 'dark' ? '#000' : '#FFF',
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
        borderColor: colors.border,
        borderStyle: 'dashed',
        borderRadius: 16,
        gap: 8,
        marginTop: 4,
    },
    addMeasBtnText: {
        color: colors.primary,
        fontWeight: '700',
        fontSize: 14,
    }
});
