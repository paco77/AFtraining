import React, { useEffect, useState } from 'react';
import { Text, View, AppState } from 'react-native';
import { Timer } from 'lucide-react-native';
import { Colors, Fonts } from '@/constants/theme';

export function GlobalSessionTimer({ sessionStartTime }: { sessionStartTime: number | null }) {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!sessionStartTime) return;
        const updateElapsed = () => {
            const now = Date.now();
            setElapsed(Math.floor((now - sessionStartTime) / 1000));
        };
        updateElapsed();
        const int = setInterval(updateElapsed, 1000);

        const subscription = AppState.addEventListener('change', nextAppState => {
            if (nextAppState === 'active') {
                updateElapsed();
            }
        });

        return () => {
            clearInterval(int);
            subscription.remove();
        };
    }, [sessionStartTime]);

    if (!sessionStartTime) return null;

    const m = Math.floor(elapsed / 60).toString().padStart(2, '0');
    const s = (elapsed % 60).toString().padStart(2, '0');
    const h = Math.floor(elapsed / 3600);

    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.primary + '20', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 }}>
            <Timer size={16} color={Colors.primary} style={{ marginRight: 6 }} />
            <Text style={{ color: Colors.primary, fontSize: 13, fontWeight: '700', fontFamily: Fonts.headline }}>
                {h > 0 ? `${h}:${m}:${s}` : `${m}:${s}`}
            </Text>
        </View>
    );
}
