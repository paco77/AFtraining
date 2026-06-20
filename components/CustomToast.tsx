import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface CustomToastProps {
    type: ToastType;
    message: string;
    onClose: () => void;
}

const TOAST_CONFIG = {
    success: {
        icon: CheckCircle2,
        color: '#2E7D32', // Darker Green
        bgColor: '#E8F5E9', // Light Green
        borderColor: '#A5D6A7',
        label: 'Exito'
    },
    error: {
        icon: XCircle,
        color: '#D32F2F', // Darker Red
        bgColor: '#FFEBEE', // Light Red
        borderColor: '#EF9A9A',
        label: 'Error'
    },
    warning: {
        icon: AlertTriangle,
        color: '#ED6C02', // Orange
        bgColor: '#FFF3E0', // Light Orange
        borderColor: '#FFCC80',
        label: 'Advertencia'
    },
    info: {
        icon: Info,
        color: '#0288D1', // Blue
        bgColor: '#E1F5FE', // Light Blue
        borderColor: '#81D4FA',
        label: 'Información'
    }
};

export const CustomToast: React.FC<CustomToastProps> = ({ type, message, onClose }) => {
    const config = TOAST_CONFIG[type];
    const Icon = config.icon;

    return (
        <View style={[styles.container, { backgroundColor: config.bgColor, borderColor: config.borderColor }]}>
            {/* Left Icon Container */}
            <View style={[styles.iconContainer, { backgroundColor: config.color }]}>
                <Icon size={18} color="#FFFFFF" strokeWidth={3} />
            </View>

            {/* Message Area */}
            <View style={styles.messageContent}>
                <Text style={[styles.messageText, { color: config.color }]}>
                    {message}
                </Text>
            </View>

            {/* Divider */}
            <View style={styles.verticalDivider} />

            {/* Close Button */}
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <X size={16} color={config.color} strokeWidth={2.5} />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: 1,
        width: '90%',
        alignSelf: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    iconContainer: {
        width: 28,
        height: 28,
        borderRadius: 6,
        justifyContent: 'center',
        alignItems: 'center',
    },
    messageContent: {
        flex: 1,
        marginLeft: 11,
        marginRight: 8,
    },
    messageText: {
        fontSize: 14,
        fontWeight: '600',
    },
    verticalDivider: {
        width: 1,
        height: 24,
        backgroundColor: 'rgba(0,0,0,0.1)',
        marginHorizontal: 4,
    },
    closeButton: {
        padding: 4,
    },
});
