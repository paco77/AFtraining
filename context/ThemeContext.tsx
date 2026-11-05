import { Colors, KineticColors, LightColors, setActiveTheme, ThemeMode } from '@/constants/theme';
import React, { createContext, useCallback, useContext, useState } from 'react';

interface ThemeContextType {
    mode: ThemeMode;
    toggle: () => void;
    colors: typeof Colors;
}

const ThemeContext = createContext<ThemeContextType>({
    mode: 'dark',
    toggle: () => { },
    colors: KineticColors,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [mode, setMode] = useState<ThemeMode>('dark');

    const toggle = useCallback(() => {
        setMode((prev) => {
            const next = prev === 'dark' ? 'light' : 'dark';
            setActiveTheme(next);
            return next;
        });
    }, []);

    const currentColors = mode === 'dark' ? KineticColors : LightColors;

    return (
        <ThemeContext.Provider value={{ mode, toggle, colors: currentColors }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    return useContext(ThemeContext);
}
