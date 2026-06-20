import { Spacing, borderRadius } from '@/constants/theme';
import { useTheme } from '@/context/ThemeContext';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface CardProps {
    title: string;
    subtitle?: string;
    icon?: React.ReactNode;
    onPress?: () => void;
    children?: React.ReactNode;
}

export const Card = ({ title, subtitle, icon, onPress, children }: CardProps) => {
    const { colors } = useTheme();

    return (
        <TouchableOpacity
            style={[styles.container, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={onPress}
            disabled={!onPress}
            activeOpacity={0.7}
        >
            <View style={styles.header}>
                <View style={styles.titleContainer}>
                    {icon && <View style={styles.iconContainer}>{icon}</View>}
                    <View>
                        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
                        {subtitle && <Text style={[styles.subtitle, { color: colors.textMuted }]}>{subtitle}</Text>}
                    </View>
                </View>
            </View>
            {children && <View style={styles.content}>{children}</View>}
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    container: {
        borderRadius: borderRadius.lg,
        padding: Spacing.md,
        marginBottom: Spacing.md,
        borderWidth: 1,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    titleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    iconContainer: {
        marginRight: Spacing.sm,
    },
    title: {
        fontSize: 16,
        fontWeight: '700',
    },
    subtitle: {
        fontSize: 12,
    },
    content: {
        marginTop: Spacing.sm,
    },
});
