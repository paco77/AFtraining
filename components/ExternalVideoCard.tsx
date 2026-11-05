import { getVideoPlatform, getVideoThumbnail } from '@/services/videoLinks';
import { showToast } from '@/services/toast';
import { Image } from 'expo-image';
import { ExternalLink, Play } from 'lucide-react-native';
import React from 'react';
import { Linking, StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from 'react-native';

interface ExternalVideoCardProps {
    url: string;
    style?: StyleProp<ViewStyle>;
    /** 'full' shows a large card with CTA, 'thumb' a compact preview (no label). */
    variant?: 'full' | 'thumb';
    /** When false, the card does not open the link on press (useful inside other touchables). */
    pressable?: boolean;
}

export const openVideoLink = async (url: string) => {
    try {
        await Linking.openURL(url);
    } catch {
        showToast.error('No se pudo abrir el enlace');
    }
};

export function ExternalVideoCard({ url, style, variant = 'full', pressable = true }: ExternalVideoCardProps) {
    const { platform, color } = getVideoPlatform(url);
    const thumbnail = getVideoThumbnail(url);
    const isThumb = variant === 'thumb';

    const content = (
        <>
            {thumbnail ? (
                <Image source={{ uri: thumbnail }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
                <View style={[StyleSheet.absoluteFill, { backgroundColor: color + '1F' }]} />
            )}
            <View style={[StyleSheet.absoluteFill, styles.scrim]} />

            <View style={[styles.playCircle, { backgroundColor: color }, isThumb && styles.playCircleThumb]}>
                <Play size={isThumb ? 12 : 26} color={platform === 'TikTok' || platform === 'Enlace' ? '#000' : '#fff'} fill={platform === 'TikTok' || platform === 'Enlace' ? '#000' : '#fff'} />
            </View>

            {!isThumb && (
                <View style={styles.footer}>
                    <View style={[styles.badge, { borderColor: color + '88', backgroundColor: color + '22' }]}>
                        <Text style={[styles.badgeText, { color }]}>{platform}</Text>
                    </View>
                    <View style={styles.cta}>
                        <Text style={styles.ctaText}>Ver video</Text>
                        <ExternalLink size={14} color="#fff" />
                    </View>
                </View>
            )}
        </>
    );

    if (!pressable) {
        return <View style={[styles.container, style]}>{content}</View>;
    }

    return (
        <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.container, style]}
            onPress={() => openVideoLink(url)}
            accessibilityRole="link"
            accessibilityLabel={`Abrir video en ${platform}`}
        >
            {content}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
        backgroundColor: '#0F172A',
        justifyContent: 'center',
        alignItems: 'center',
    },
    scrim: {
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    playCircle: {
        width: 60,
        height: 60,
        borderRadius: 30,
        justifyContent: 'center',
        alignItems: 'center',
        paddingLeft: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.4,
        shadowRadius: 8,
        elevation: 6,
    },
    playCircleThumb: {
        width: 26,
        height: 26,
        borderRadius: 13,
        paddingLeft: 2,
    },
    footer: {
        position: 'absolute',
        left: 12,
        right: 12,
        bottom: 12,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        borderWidth: 1,
    },
    badgeText: {
        fontSize: 12,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    cta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: 'rgba(0,0,0,0.55)',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
    },
    ctaText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700',
    },
});
