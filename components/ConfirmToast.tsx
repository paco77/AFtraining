import { AlertCircle } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';

export interface ToastOption {
    text: string;
    onPress?: () => void;
    style?: 'cancel' | 'destructive' | 'default';
}

interface ConfirmToastProps {
    title?: string;
    message: string;
    options: ToastOption[];
    onClose: () => void;
}

export const ConfirmToast: React.FC<ConfirmToastProps> = ({ title, message, options, onClose }) => {
    return (
        <View style={styles.container} pointerEvents="auto">
            {/* Header Content */}
            <View style={styles.header}>
                <View style={styles.iconContainer}>
                    <AlertCircle size={24} color="#000" />
                </View>
                <View style={styles.textContent}>
                    {title && <Text style={styles.title}>{title}</Text>}
                    <Text style={styles.message}>{message}</Text>
                </View>
            </View>

            {/* Actions */}
            <View style={styles.actionsContainer}>
                {options.map((opt, idx) => {
                    const isDestructive = opt.style === 'destructive';
                    const isCancel = opt.style === 'cancel';
                    return (
                        <TouchableOpacity
                            key={idx}
                            style={[
                                styles.actionButton,
                                isDestructive && styles.destructiveButton,
                                isCancel && styles.cancelButton,
                            ]}
                            onPress={() => {
                                if (opt.onPress) {
                                    opt.onPress();
                                }
                                setTimeout(() => {
                                    onClose();
                                }, 50);
                            }}
                        >
                            <Text style={[
                                styles.actionText,
                                isDestructive && styles.destructiveText,
                                isCancel && styles.cancelText,
                            ]}>
                                {opt.text}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        backgroundColor: '#FFFFFF',
        borderRadius: 16,
        padding: 16,
        width: '95%',
        alignSelf: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 8,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    header: {
        flexDirection: 'row',
        marginBottom: 16,
    },
    iconContainer: {
        marginRight: 12,
        justifyContent: 'center',
    },
    textContent: {
        flex: 1,
        justifyContent: 'center',
    },
    title: {
        fontSize: 16,
        fontWeight: '800',
        color: '#000',
        marginBottom: 4,
    },
    message: {
        fontSize: 14,
        color: '#666',
        lineHeight: 20,
    },
    actionsContainer: {
        flexDirection: 'column',
        gap: 8,
    },
    actionButton: {
        backgroundColor: '#F3F4F6',
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    actionText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#000',
    },
    destructiveButton: {
        backgroundColor: '#FEE2E2',
    },
    destructiveText: {
        color: '#DC2626',
    },
    cancelButton: {
        backgroundColor: 'transparent',
    },
    cancelText: {
        color: '#6B7280',
    },
});
