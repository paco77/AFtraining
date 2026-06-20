import { borderRadius, Colors, Fonts, Spacing } from '@/constants/theme';
import { useUser } from '@/context/UserContext';
import api from '@/services/api';
import { showToast } from '@/services/toast';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { Check, Eye, EyeOff } from 'lucide-react-native';
import React, { useState, useEffect } from 'react';
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

const { width, height } = Dimensions.get('window');

export default function LoginScreen() {
    const router = useRouter();
    const { login, currentUser, isInitialized } = useUser();
    const [loginId, setLoginId] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    // Redirección automática si el usuario ya está autenticado e inicializado
    useEffect(() => {
        if (isInitialized && currentUser) {
            router.replace('/(tabs)');
        }
    }, [isInitialized, currentUser, router]);

    if (!isInitialized || currentUser) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <Image
                    source={require('../assets/images/logo.png')}
                    style={{ width: 260, height: 90 }}
                    resizeMode="contain"
                />
                <ActivityIndicator size="large" color={Colors.primary} style={{ marginTop: 24 }} />
            </View>
        );
    }

    const handleLogin = async () => {
        if (!loginId || !password) {
            showToast.warning('Por favor completa todos los campos');
            return;
        }
        setIsLoading(true);

        try {
            const response = await api.post('login', {
                login: loginId,
                password: password,
            });

            const { access_token, user } = response.data;

            await login(user, access_token, rememberMe);
            router.replace('/(tabs)');
        } catch (error: any) {
            const status = error.response?.status;
            if (!status || status >= 500) {
                console.error('Login error:', error);
            }
            showToast.error(error.response?.data?.message || 'Error al iniciar sesión. Verifica tus credenciales.');
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
                <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>

                    {/* Header: KINETIC */}
                    <View style={styles.header}>
                        <Image
                            source={require('../assets/images/logo.png')}
                            style={{ width: 280, height: 100, marginBottom: -10 }}
                            resizeMode="contain"
                        />
                        <Text style={styles.kineticsubtitle}>EVOLUCIONA AL SIGUIENTE NIVEL</Text>
                    </View>

                    {/* Main Card */}
                    <View style={styles.card}>
                        <Text style={styles.welcomeTitle}>
                            Bienvenido de{'\n'}
                            <Text style={styles.welcomeHighlight}>vuelta.</Text>
                        </Text>

                        <Text style={styles.instructionText}>
                            Ingresa tus credenciales para continuar tu evolución.
                        </Text>

                        {/* Form */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>CORREO ELECTRÓNICO</Text>
                            <TextInput
                                style={styles.input}
                                placeholder=""
                                placeholderTextColor="#4A4A4A"
                                value={loginId}
                                onChangeText={setLoginId}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                        </View>

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>CONTRASEÑA</Text>
                            <View style={styles.passwordContainer}>
                                <TextInput
                                    style={styles.passwordInput}
                                    placeholder="••••••••"
                                    placeholderTextColor="#4A4A4A"
                                    value={password}
                                    onChangeText={setPassword}
                                    secureTextEntry={!showPassword}
                                />
                                <TouchableOpacity
                                    onPress={() => setShowPassword(!showPassword)}
                                    style={styles.eyeIcon}
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

                        {/* Options row */}
                        <View style={styles.optionsRow}>
                            <TouchableOpacity
                                style={styles.checkboxRow}
                                onPress={() => setRememberMe(!rememberMe)}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.checkbox, rememberMe && styles.checkboxActive]}>
                                    {rememberMe && <Check size={12} color="#000" />}
                                </View>
                                <Text style={styles.rememberText}>Recordarme </Text>
                            </TouchableOpacity>

                            <TouchableOpacity>
                                <Text style={styles.forgotText}>¿Olvidaste tu contraseña?</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Login Button */}
                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={handleLogin}
                            disabled={isLoading}
                            style={styles.shadowCta}
                        >
                            <LinearGradient
                                colors={[Colors.primary, Colors.tertiary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.loginBtn}
                            >
                                <Text style={styles.loginBtnText}>
                                    {isLoading ? 'INICIANDO...' : 'COMENZAR'}
                                </Text>
                            </LinearGradient>
                        </TouchableOpacity>

                        {/* Register link */}
                        <View style={styles.registerContainer}>
                            <Text style={styles.noAccountText}>¿No tienes una cuenta? </Text>
                            <TouchableOpacity>
                                <Text style={styles.registerText}>Crea una ahora</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Watermark */}
                    <View style={styles.watermarkContainer}>
                        <Text style={styles.watermark}>ROUGHEST TRAINER</Text>
                        <View style={styles.watermarkLines}>
                            <View style={styles.watermarkLine1} />
                            <View style={styles.watermarkLine2} />
                        </View>
                    </View>

                    {/* Footer */}
                    <View style={styles.footer}>
                        <View style={styles.footerLinks}>
                            <TouchableOpacity><Text style={styles.footerLink}>PRIVACIDAD</Text></TouchableOpacity>
                            <TouchableOpacity><Text style={styles.footerLink}>TÉRMINOS</Text></TouchableOpacity>
                            <TouchableOpacity><Text style={styles.footerLink}>SOPORTE</Text></TouchableOpacity>
                        </View>
                        <Text style={styles.copyright}>© 2026 AF TRINING FITNESS LAB.</Text>
                    </View>

                </ScrollView>
            </KeyboardAvoidingView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Colors.background,
    },
    bgImage: {
        position: 'absolute',
        width: width,
        height: height,
        top: 0,
        opacity: 0.1, // So it blends with the deep steel blue
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: `${Colors.background}CC`, // 80% opacity overlay
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        justifyContent: 'center',
        paddingHorizontal: Spacing.md,
        paddingTop: 60,
        paddingBottom: 30,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
    },
    kineticTitle: {
        fontFamily: Fonts.display,
        fontSize: 36,
        color: Colors.primary,
        letterSpacing: 4,
    },
    kineticsubtitle: {
        fontFamily: Fonts.body,
        fontSize: 12,
        color: Colors.textMuted,
        letterSpacing: 2,
        marginTop: 4,
    },
    card: {
        backgroundColor: Colors.surface, // No lines, tone layering
        borderRadius: borderRadius.md,
        padding: Spacing.lg,
        paddingVertical: 32,
        elevation: 2,
    },
    welcomeTitle: {
        fontFamily: Fonts.headline,
        fontSize: 32,
        color: Colors.text,
        marginBottom: 8,
        lineHeight: 40,
    },
    welcomeHighlight: {
        color: Colors.primary,
    },
    instructionText: {
        fontFamily: Fonts.body,
        color: Colors.textMuted,
        fontSize: 14,
        marginBottom: 32,
        lineHeight: 20,
    },
    inputGroup: {
        marginBottom: 20,
    },
    label: {
        fontFamily: Fonts.label,
        color: Colors.textMuted,
        fontSize: 11,
        marginBottom: 8,
        letterSpacing: 0.5,
    },
    input: {
        fontFamily: Fonts.body,
        backgroundColor: Colors.surface_lowest,
        borderRadius: borderRadius.sm,
        color: Colors.text,
        fontSize: 15,
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent', // Focus handled theoretically or default ghost
    },
    passwordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.surface_lowest,
        borderRadius: borderRadius.sm,
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    passwordInput: {
        fontFamily: Fonts.body,
        flex: 1,
        color: Colors.text,
        fontSize: 15,
        paddingVertical: 14,
        paddingHorizontal: 16,
    },
    eyeIcon: {
        padding: 14,
    },
    optionsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: -4,
        marginBottom: 32,
    },
    checkboxRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    checkbox: {
        width: 18,
        height: 18,
        borderWidth: 1.5,
        borderColor: Colors.text,
        borderRadius: 4,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
        backgroundColor: 'transparent',
    },
    checkboxActive: {
        backgroundColor: Colors.text,
        borderColor: Colors.text,
    },
    rememberText: {
        fontFamily: Fonts.body,
        color: Colors.text,
        fontSize: 13,
    },
    forgotText: {
        fontFamily: Fonts.body,
        color: Colors.primary,
        fontSize: 13,
    },
    shadowCta: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.4,
        shadowRadius: 32,
        elevation: 10,
        marginBottom: 24,
    },
    loginBtn: {
        paddingVertical: 16,
        borderRadius: borderRadius.md,
        alignItems: 'center',
    },
    loginBtnText: {
        fontFamily: Fonts.display,
        color: Colors.white,
        fontSize: 15,
        letterSpacing: 0.5,
    },
    registerContainer: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
    },
    noAccountText: {
        fontFamily: Fonts.body,
        color: Colors.textMuted,
        fontSize: 13,
    },
    registerText: {
        fontFamily: Fonts.bodyBold,
        color: Colors.primary,
        fontSize: 13,
    },
    watermarkContainer: {
        marginTop: 40,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    watermark: {
        fontFamily: Fonts.display,
        color: Colors.surface_low,
        fontSize: 14,
        letterSpacing: 8,
    },
    watermarkLines: {
        alignItems: 'flex-end',
        gap: 6,
        paddingRight: 10,
    },
    watermarkLine1: {
        width: 120,
        height: 1,
        backgroundColor: Colors.surface_low,
    },
    watermarkLine2: {
        width: 60,
        height: 1,
        backgroundColor: Colors.surface_low,
    },
    footer: {
        marginTop: 60,
        alignItems: 'center',
    },
    footerLinks: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 20,
        marginBottom: 16,
    },
    footerLink: {
        fontFamily: Fonts.label,
        color: Colors.textMuted,
        fontSize: 11,
        letterSpacing: 1,
    },
    copyright: {
        fontFamily: Fonts.body,
        color: Colors.textMuted,
        fontSize: 10,
        letterSpacing: 0.5,
    },
});
