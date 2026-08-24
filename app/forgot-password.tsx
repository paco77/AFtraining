import { Colors, Fonts, Spacing, borderRadius } from '@/constants/theme';
import api from '@/services/api';
import { showToast } from '@/services/toast';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { ArrowLeft, CheckCircle, Eye, EyeOff, Mail, Lock } from 'lucide-react-native';
import React, { useState } from 'react';
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

const { width, height } = Dimensions.get('window');

type Step = 'form' | 'success';

export default function ForgotPasswordScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    
    const [step, setStep] = useState<Step>('form');
    const [isLoading, setIsLoading] = useState(false);
    
    const [email, setEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const handleResetPassword = async () => {
        if (!email.trim()) {
            showToast.error('Por favor, ingresa tu correo electrónico.');
            return;
        }
        if (!newPassword || newPassword.length < 8) {
            showToast.error('La contraseña debe tener al menos 8 caracteres.');
            return;
        }
        if (newPassword !== confirmPassword) {
            showToast.error('Las contraseñas no coinciden.');
            return;
        }

        setIsLoading(true);
        try {
            await api.post('/force-reset-password', {
                email,
                password: newPassword,
                password_confirmation: confirmPassword
            });
            setStep('success');
            showToast.success('Contraseña actualizada correctamente.');
        } catch (error: any) {
            showToast.error(error.response?.data?.message || 'Error al actualizar contraseña. Verifica que el correo sea correcto.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <Image
                source={require('../assets/images/login-bg.png')}
                style={styles.bgImage}
                resizeMode="cover"
            />
            <View style={styles.overlay} />

            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.keyboardView}
            >
                <ScrollView 
                    contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
                    showsVerticalScrollIndicator={false}
                >
                    <TouchableOpacity 
                        style={styles.backBtn}
                        onPress={() => {
                            if (step === 'form' || step === 'success') router.back();
                        }}
                    >
                        <ArrowLeft color="#FFF" size={24} />
                    </TouchableOpacity>

                    {/* Header */}
                    <View style={styles.header}>
                        <Image
                            source={require('../assets/images/logo.png')}
                            style={styles.logo}
                            resizeMode="contain"
                        />
                        <Text style={styles.title}>
                            {step === 'form' && 'RESTABLECER CONTRASEÑA'}
                            {step === 'success' && '¡LISTO!'}
                        </Text>
                        <Text style={styles.subtitle}>
                            {step === 'form' && 'Ingresa tu correo correcto y tu nueva contraseña para cambiarla de inmediato.'}
                            {step === 'success' && 'Tu contraseña ha sido restablecida exitosamente.'}
                        </Text>
                    </View>

                    {/* Form container */}
                    <View style={styles.formContainer}>
                        {step === 'form' && (
                            <>
                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>CORREO ELECTRÓNICO</Text>
                                    <View style={styles.inputWrapper}>
                                        <Mail size={20} color={Colors.textMuted} style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="tu@email.com"
                                            placeholderTextColor={Colors.textMuted}
                                            value={email}
                                            onChangeText={setEmail}
                                            keyboardType="email-address"
                                            autoCapitalize="none"
                                            editable={!isLoading}
                                        />
                                    </View>
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>NUEVA CONTRASEÑA</Text>
                                    <View style={styles.inputWrapper}>
                                        <Lock size={20} color={Colors.textMuted} style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="••••••••"
                                            placeholderTextColor={Colors.textMuted}
                                            value={newPassword}
                                            onChangeText={setNewPassword}
                                            secureTextEntry={!showPassword}
                                            editable={!isLoading}
                                        />
                                        <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                                            {showPassword ? <EyeOff size={18} color="#A1A1AA" /> : <Eye size={18} color="#A1A1AA" />}
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.label}>CONFIRMAR CONTRASEÑA</Text>
                                    <View style={styles.inputWrapper}>
                                        <Lock size={20} color={Colors.textMuted} style={styles.inputIcon} />
                                        <TextInput
                                            style={styles.input}
                                            placeholder="••••••••"
                                            placeholderTextColor={Colors.textMuted}
                                            value={confirmPassword}
                                            onChangeText={setConfirmPassword}
                                            secureTextEntry={!showPassword}
                                            editable={!isLoading}
                                        />
                                    </View>
                                </View>
                            </>
                        )}

                        {step === 'success' && (
                            <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                                <CheckCircle size={64} color={Colors.primary} />
                            </View>
                        )}

                        <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => {
                                if (step === 'form') handleResetPassword();
                                else if (step === 'success') router.replace('/login');
                            }}
                            disabled={isLoading}
                            style={styles.shadowCta}
                        >
                            <LinearGradient
                                colors={[Colors.primary, Colors.tertiary]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.loginBtn}
                            >
                                {isLoading ? (
                                    <ActivityIndicator color="#000" />
                                ) : (
                                    <Text style={styles.loginBtnText}>
                                        {step === 'form' && 'CAMBIAR CONTRASEÑA'}
                                        {step === 'success' && 'VOLVER AL LOGIN'}
                                    </Text>
                                )}
                            </LinearGradient>
                        </TouchableOpacity>
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
        opacity: 0.1,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: `${Colors.background}CC`,
    },
    keyboardView: {
        flex: 1,
    },
    scrollContent: {
        flexGrow: 1,
        paddingHorizontal: Spacing.xl,
        justifyContent: 'center',
    },
    backBtn: {
        position: 'absolute',
        top: 60,
        left: 20,
        zIndex: 10,
        padding: 8,
        backgroundColor: 'rgba(255,255,255,0.1)',
        borderRadius: 20,
    },
    header: {
        alignItems: 'center',
        marginBottom: 40,
        marginTop: 40,
    },
    logo: {
        width: 140,
        height: 50,
        marginBottom: 20,
    },
    title: {
        fontFamily: Fonts.display,
        fontSize: 28,
        fontWeight: '900',
        color: '#FFF',
        textAlign: 'center',
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    subtitle: {
        fontFamily: Fonts.body,
        fontSize: 14,
        color: Colors.textMuted,
        textAlign: 'center',
        marginTop: 8,
        lineHeight: 20,
        paddingHorizontal: 20,
    },
    formContainer: {
        backgroundColor: 'rgba(15, 23, 42, 0.6)',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.05)',
        width: '100%',
    },
    inputGroup: {
        marginBottom: 24,
    },
    label: {
        fontFamily: Fonts.headline,
        fontSize: 11,
        fontWeight: '800',
        color: Colors.textMuted,
        marginBottom: 8,
        letterSpacing: 1,
        textTransform: 'uppercase',
    },
    inputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: 16,
        height: 56,
        paddingHorizontal: 16,
    },
    inputIcon: {
        marginRight: 12,
    },
    input: {
        flex: 1,
        color: '#FFF',
        fontFamily: Fonts.body,
        fontSize: 15,
        height: '100%',
    },
    eyeIcon: {
        padding: 4,
    },
    shadowCta: {
        shadowColor: Colors.primary,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
        elevation: 8,
        marginTop: 8,
    },
    loginBtn: {
        height: 56,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loginBtnText: {
        fontFamily: Fonts.headline,
        fontSize: 15,
        fontWeight: '900',
        color: '#000',
        letterSpacing: 1,
    }
});
