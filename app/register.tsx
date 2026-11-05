import { borderRadius, Fonts, Spacing } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import { useUser } from '@/context/UserContext';
import api from '@/services/api';
import { showToast } from '@/services/toast';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
    ArrowLeft,
    Check,
    Dumbbell,
    Eye,
    EyeOff,
    Lock,
    Mail,
    Shield,
    Sparkles,
    User,
    Users
} from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
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

export default function RegisterScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { login } = useUser();
    const { colors, mode } = useTheme();
    const styles = useMemo(() => getStyles(colors), [mode, colors]);

    // Role state: 'independiente' or 'coach'
    const [selectedRole, setSelectedRole] = useState<'independiente' | 'coach'>('independiente');

    // Form state
    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const handleRegister = async () => {
        // Validations
        if (!name.trim()) {
            showToast.warning('Por favor ingresa tu nombre completo');
            return;
        }
        if (!username.trim()) {
            showToast.warning('Por favor ingresa un nombre de usuario');
            return;
        }
        if (username.trim().length < 3) {
            showToast.warning('El nombre de usuario debe tener al menos 3 caracteres');
            return;
        }
        if (!email.trim() || !email.includes('@')) {
            showToast.warning('Por favor ingresa un correo electrónico válido');
            return;
        }
        if (!password || password.length < 8) {
            showToast.warning('La contraseña debe tener al menos 8 caracteres');
            return;
        }
        if (password !== confirmPassword) {
            showToast.warning('Las contraseñas no coinciden');
            return;
        }

        setIsLoading(true);

        try {
            const response = await api.post('register', {
                name: name.trim(),
                username: username.trim().toLowerCase(),
                email: email.trim().toLowerCase(),
                password,
                role: selectedRole,
            });

            const { access_token, user } = response.data;

            await login(user, access_token, true);
            showToast.success('¡Registro exitoso! Bienvenido a AF Training');
            router.replace('/(tabs)');
        } catch (error: any) {
            const errorMsg =
                error.response?.data?.message ||
                (error.response?.data?.errors
                    ? Object.values(error.response.data.errors).flat().join('\n')
                    : 'Error al registrar usuario. Verifica los datos.');
            console.error('Register error:', error.response?.data || error);
            showToast.error(errorMsg);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView
                    contentContainerStyle={[
                        styles.scrollContent,
                        {
                            paddingTop: Math.max(insets.top, 20),
                            paddingBottom: Math.max(40, insets.bottom + 20)
                        }
                    ]}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header bar with Back button */}
                    <View style={styles.topBar}>
                        <TouchableOpacity
                            style={styles.backBtn}
                            onPress={() => router.back()}
                            activeOpacity={0.7}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                            <ArrowLeft size={22} color={colors.text} />
                        </TouchableOpacity>
                        <Image
                            source={mode === 'light' ? require('../assets/images/logo-light.png') : require('../assets/images/logo.png')}
                            style={styles.logoMini}
                            resizeMode="contain"
                        />
                        <View style={{ width: 40 }} />
                    </View>

                    {/* Header Titles */}
                    <View style={styles.header}>
                        <Text style={styles.welcomeTitle}>
                            Crea tu{'\n'}
                            <Text style={styles.welcomeHighlight}>cuenta.</Text>
                        </Text>
                        <Text style={styles.instructionText}>
                            Elige tu tipo de perfil y empieza a transformar tu entrenamiento.
                        </Text>
                    </View>

                    {/* Role Selector Cards */}
                    <View style={styles.roleSection}>
                        <Text style={styles.sectionLabel}>SELECCIONA TU PERFIL</Text>

                        <View style={styles.roleGrid}>
                            {/* Independiente */}
                            <TouchableOpacity
                                style={[
                                    styles.roleCard,
                                    selectedRole === 'independiente' && styles.roleCardActive
                                ]}
                                onPress={() => setSelectedRole('independiente')}
                                activeOpacity={0.8}
                            >
                                <View style={styles.roleCardHeader}>
                                    <View style={[
                                        styles.roleIconBg,
                                        selectedRole === 'independiente' && { backgroundColor: colors.primary + '25' }
                                    ]}>
                                        <Dumbbell
                                            size={22}
                                            color={selectedRole === 'independiente' ? colors.primary : colors.textMuted}
                                        />
                                    </View>
                                    <View style={[
                                        styles.radioCircle,
                                        selectedRole === 'independiente' && styles.radioCircleActive
                                    ]}>
                                        {selectedRole === 'independiente' && <Check size={12} color="#000" strokeWidth={3} />}
                                    </View>
                                </View>
                                <Text style={[
                                    styles.roleCardTitle,
                                    selectedRole === 'independiente' && { color: colors.text }
                                ]}>
                                    Independiente
                                </Text>
                                <Text style={styles.roleCardDesc}>
                                    Crea tus propios planes de entreno y nutrición, registra tus sesiones y evalúa tu progreso.
                                </Text>
                            </TouchableOpacity>

                            {/* Coach */}
                            <TouchableOpacity
                                style={[
                                    styles.roleCard,
                                    selectedRole === 'coach' && styles.roleCardActive
                                ]}
                                onPress={() => setSelectedRole('coach')}
                                activeOpacity={0.8}
                            >
                                <View style={styles.roleCardHeader}>
                                    <View style={[
                                        styles.roleIconBg,
                                        selectedRole === 'coach' && { backgroundColor: colors.primary + '25' }
                                    ]}>
                                        <Users
                                            size={22}
                                            color={selectedRole === 'coach' ? colors.primary : colors.textMuted}
                                        />
                                    </View>
                                    <View style={[
                                        styles.radioCircle,
                                        selectedRole === 'coach' && styles.radioCircleActive
                                    ]}>
                                        {selectedRole === 'coach' && <Check size={12} color="#000" strokeWidth={3} />}
                                    </View>
                                </View>
                                <Text style={[
                                    styles.roleCardTitle,
                                    selectedRole === 'coach' && { color: colors.text }
                                ]}>
                                    Coach / Entrenador
                                </Text>
                                <Text style={styles.roleCardDesc}>
                                    Diseña rutinas y planes de alimentación para tus atletas y monitorea su evolución.
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Main Form Card */}
                    <View style={styles.card}>
                        {/* Nombre Completo */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>NOMBRE COMPLETO</Text>
                            <View style={styles.inputWrapper}>
                                <User size={18} color={colors.textMuted} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="Ej. Carlos Mendoza"
                                    placeholderTextColor="#52525B"
                                    value={name}
                                    onChangeText={setName}
                                    autoCapitalize="words"
                                />
                            </View>
                        </View>

                        {/* Nombre de Usuario */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>NOMBRE DE USUARIO</Text>
                            <View style={styles.inputWrapper}>
                                <Text style={styles.atSymbol}>@</Text>
                                <TextInput
                                    style={styles.input}
                                    placeholder="carlos_m"
                                    placeholderTextColor="#52525B"
                                    value={username}
                                    onChangeText={(txt) => setUsername(txt.replace(/\s+/g, ''))}
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>
                        </View>

                        {/* Correo Electrónico */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>CORREO ELECTRÓNICO</Text>
                            <View style={styles.inputWrapper}>
                                <Mail size={18} color={colors.textMuted} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="carlos@ejemplo.com"
                                    placeholderTextColor="#52525B"
                                    value={email}
                                    onChangeText={setEmail}
                                    keyboardType="email-address"
                                    autoCapitalize="none"
                                    autoCorrect={false}
                                />
                            </View>
                        </View>

                        {/* Contraseña */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>CONTRASEÑA (MÍN. 8 CARACTERES)</Text>
                            <View style={styles.inputWrapper}>
                                <Lock size={18} color={colors.textMuted} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="••••••••"
                                    placeholderTextColor="#52525B"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                    autoCapitalize="none"
                                />
                                <TouchableOpacity
                                    onPress={() => setShowPassword(!showPassword)}
                                    style={styles.eyeBtn}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    {showPassword ? (
                                        <EyeOff size={18} color="#A1A1AA" />
                                    ) : (
                                        <Eye size={18} color="#A1A1AA" />
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Confirmar Contraseña */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>CONFIRMAR CONTRASEÑA</Text>
                            <View style={styles.inputWrapper}>
                                <Lock size={18} color={colors.textMuted} style={styles.inputIcon} />
                                <TextInput
                                    style={styles.input}
                                    placeholder="••••••••"
                                    placeholderTextColor="#52525B"
                                    value={confirmPassword}
                                    onChangeText={setConfirmPassword}
                                    secureTextEntry={!showConfirmPassword}
                                    autoCapitalize="none"
                                />
                                <TouchableOpacity
                                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                                    style={styles.eyeBtn}
                                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                >
                                    {showConfirmPassword ? (
                                        <EyeOff size={18} color="#A1A1AA" />
                                    ) : (
                                        <Eye size={18} color="#A1A1AA" />
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Info Note */}
                        <View style={styles.infoBox}>
                            <Sparkles size={16} color={colors.primary} style={{ marginTop: 2 }} />
                            <Text style={styles.infoBoxText}>
                                Una vez registrado, podrás completar tus métricas físicas, objetivos y foto de perfil directamente dentro de la aplicación.
                            </Text>
                        </View>

                        {/* Register Button */}
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={handleRegister}
                            disabled={isLoading}
                            style={styles.shadowCta}
                        >
                            <LinearGradient
                                colors={[colors.primary, colors.tertiary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.submitBtn}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color={colors.background} />
                                ) : (
                                    <Text style={styles.submitBtnText}>REGISTRARME Y COMENZAR</Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Back to Login link */}
                        <View style={styles.loginLinkRow}>
                            <Text style={styles.haveAccountText}>¿Ya tienes una cuenta? </Text>
                            <TouchableOpacity onPress={() => router.replace('/login')} activeOpacity={0.7}>
                                <Text style={styles.loginLinkText}>Inicia sesión</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <Text style={styles.copyright}>© 2026 AF TRAINING FITNESS LAB.</Text>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const getStyles = (colors: any) =>
    StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: colors.background,
        },
        keyboardView: {
            flex: 1,
        },
        scrollContent: {
            paddingHorizontal: Spacing.lg,
            flexGrow: 1,
        },
        topBar: {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: Spacing.md,
        },
        backBtn: {
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            justifyContent: 'center',
            alignItems: 'center',
        },
        logoMini: {
            width: 130,
            height: 44,
        },
        header: {
            marginBottom: Spacing.xl,
        },
        welcomeTitle: {
            fontSize: 34,
            lineHeight: 38,
            fontFamily: Fonts.headline,
            color: colors.text,
            letterSpacing: -1,
        },
        welcomeHighlight: {
            color: colors.primary,
        },
        instructionText: {
            fontSize: 14,
            color: colors.textMuted,
            fontFamily: Fonts.body,
            marginTop: 8,
            lineHeight: 20,
        },
        roleSection: {
            marginBottom: Spacing.xl,
        },
        sectionLabel: {
            color: colors.textMuted,
            fontSize: 11,
            fontWeight: '800',
            letterSpacing: 1.2,
            fontFamily: Fonts.headline,
            marginBottom: 12,
        },
        roleGrid: {
            flexDirection: 'row',
            gap: 12,
        },
        roleCard: {
            flex: 1,
            backgroundColor: colors.surface,
            borderRadius: 16,
            borderWidth: 1.5,
            borderColor: colors.border,
            padding: 14,
            justifyContent: 'space-between',
            minHeight: 160,
        },
        roleCardActive: {
            borderColor: colors.primary,
            backgroundColor: colors.surfaceLight || colors.surface,
        },
        roleCardHeader: {
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 10,
        },
        roleIconBg: {
            width: 38,
            height: 38,
            borderRadius: 10,
            backgroundColor: 'rgba(255,255,255,0.05)',
            justifyContent: 'center',
            alignItems: 'center',
        },
        radioCircle: {
            width: 22,
            height: 22,
            borderRadius: 11,
            borderWidth: 1.5,
            borderColor: colors.border,
            justifyContent: 'center',
            alignItems: 'center',
        },
        radioCircleActive: {
            backgroundColor: colors.primary,
            borderColor: colors.primary,
        },
        roleCardTitle: {
            fontSize: 14,
            fontWeight: '800',
            fontFamily: Fonts.headline,
            color: colors.textMuted,
            marginBottom: 4,
        },
        roleCardDesc: {
            fontSize: 11,
            color: colors.textMuted,
            lineHeight: 16,
        },
        card: {
            backgroundColor: colors.surface,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 20,
            marginBottom: Spacing.xl,
        },
        inputGroup: {
            marginBottom: 16,
        },
        label: {
            color: colors.textMuted,
            fontSize: 10,
            fontWeight: '800',
            letterSpacing: 1,
            fontFamily: Fonts.headline,
            marginBottom: 8,
        },
        inputWrapper: {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.background,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            paddingHorizontal: 12,
            height: 50,
        },
        inputIcon: {
            marginRight: 10,
        },
        atSymbol: {
            color: colors.textMuted,
            fontSize: 16,
            fontWeight: '700',
            marginRight: 6,
        },
        input: {
            flex: 1,
            color: colors.text,
            fontSize: 14,
            fontFamily: Fonts.body,
        },
        eyeBtn: {
            padding: 8,
            justifyContent: 'center',
            alignItems: 'center',
        },
        infoBox: {
            flexDirection: 'row',
            gap: 10,
            backgroundColor: colors.primary + '10',
            borderWidth: 1,
            borderColor: colors.primary + '30',
            borderRadius: 12,
            padding: 12,
            marginBottom: 20,
        },
        infoBoxText: {
            flex: 1,
            fontSize: 12,
            color: colors.text,
            lineHeight: 17,
        },
        shadowCta: {
            borderRadius: 14,
            overflow: 'hidden',
            marginBottom: 18,
        },
        submitBtn: {
            height: 52,
            borderRadius: 14,
            justifyContent: 'center',
            alignItems: 'center',
        },
        submitBtnText: {
            color: '#000',
            fontSize: 14,
            fontWeight: '900',
            fontFamily: Fonts.headline,
            letterSpacing: 0.5,
        },
        loginLinkRow: {
            flexDirection: 'row',
            justifyContent: 'center',
            alignItems: 'center',
        },
        haveAccountText: {
            color: colors.textMuted,
            fontSize: 13,
        },
        loginLinkText: {
            color: colors.primary,
            fontSize: 13,
            fontWeight: '800',
            fontFamily: Fonts.headline,
        },
        footer: {
            alignItems: 'center',
            paddingVertical: 12,
        },
        copyright: {
            color: colors.textMuted,
            fontSize: 11,
            letterSpacing: 0.5,
        },
    });
