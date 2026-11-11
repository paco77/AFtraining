import React, { useEffect, useState } from 'react';
import { Text, View, AppState } from 'react-native';
import { Timer } from 'lucide-react-native';
import { Colors, Fonts } from '@/constants/theme';

const MAX_SESSION_SECONDS = 3 * 3600; // 3 horas límite para el contador

export function GlobalSessionTimer({ sessionStartTime }: { sessionStartTime: number | null }) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!sessionStartTime) return;
        let int: ReturnType<typeof setInterval> | null = null;
        const updateElapsed = () => {
            const now = Date.now();
            const rawDiff = Math.max(0, Math.floor((now - sessionStartTime) / 1000));
            const diff = Math.min(MAX_SESSION_SECONDS, rawDiff);
            setElapsed(diff);
            if (rawDiff >= MAX_SESSION_SECONDS && int) {
                clearInterval(int);
                int = null;
            }
        };
        updateElapsed();
        const now = Date.now();
        if (Math.floor((now - sessionStartTime) / 1000) < MAX_SESSION_SECONDS) {
            int = setInterval(updateElapsed, 1000);
        }

        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active') {
                updateElapsed();
            }
        });

        return () => {
            if (int) clearInterval(int);
            subscription.remove();
        };
    }, [sessionStartTime]);

    if (!sessionStartTime) return null;

    const h = Math.floor(elapsed / 3600);
    const m = Math.floor((elapsed % 3600) / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary + '20', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}>
            <Timer size={16} color={Colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '700', fontFamily: Fonts.headline }}>
                {h > 0 ? `${h.toString().padStart(2, '0')}:${m}:${s}` : `${m}:${s}`}
            </Text>
        </View>
    );
}
