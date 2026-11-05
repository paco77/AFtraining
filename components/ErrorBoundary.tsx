import React, { Component, ErrorInfo, ReactNode } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { router } from 'expo-router';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('[ErrorBoundary caught error]:', error, errorInfo);
    }

    private handleReset = () => {
        this.setState({ hasError: false, error: null });
        try {
            router.replace('/login');
        } catch (e) {
            // fallback
        }
    };

    public render() {
        if (this.state.hasError) {
            return (
                <View style={styles.container}>
                    <View style={styles.content}>
                        <View style={styles.badge}>
                            <Text style={styles.badgeText}>RECUPERACIÓN DE SISTEMA</Text>
                        </View>
                        <Text style={styles.title}>Algo no salió como esperábamos</Text>
                        <Text style={styles.subtitle}>
                            La aplicación encontró un detalle inesperado pero tus datos están seguros.
                        </Text>
                        
                        {__DEV__ && this.state.error && (
                            <ScrollView style={styles.debugBox}>
                                <Text style={styles.debugText}>{this.state.error.toString()}</Text>
                            </ScrollView>
                        )}

                        <TouchableOpacity style={styles.button} onPress={this.handleReset} activeOpacity={0.8}>
                            <Text style={styles.buttonText}>CONTINUAR</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            );
        }

        return this.props.children;
    }
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#060B14',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    content: {
        width: '100%',
        maxWidth: 400,
        backgroundColor: '#0D172E',
        borderRadius: 20,
        padding: 28,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#1E293B',
    },
    badge: {
        backgroundColor: 'rgba(37, 99, 235, 0.15)',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'rgba(37, 99, 235, 0.3)',
        marginBottom: 16,
    },
    badgeText: {
        color: '#3B82F6',
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 1,
    },
    title: {
        color: '#F8FAFC',
        fontSize: 20,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 10,
    },
    subtitle: {
        color: '#94A3B8',
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    debugBox: {
        maxHeight: 120,
        width: '100%',
        backgroundColor: '#060B14',
        borderRadius: 8,
        padding: 10,
        marginBottom: 20,
    },
    debugText: {
        color: '#EF4444',
        fontSize: 12,
        fontFamily: 'monospace',
    },
    button: {
        width: '100%',
        backgroundColor: '#2563EB',
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: 'center',
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '700',
        letterSpacing: 0.5,
    },
});
