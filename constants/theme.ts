import { Platform } from 'react-native';

// ─── Theme Mode ───────────────────────────────────────────────────────────────

export type ThemeMode = 'dark' | 'light';

// ─── Color Palettes (Kinetic High-End Editorial) ──────────────────────────────

export const KineticColors = {
  // Base Palette (Kinetic Dark Navy)
  background: '#040b16', // Deep core background 
  
  // Surfaces (from bottom to top elevation)
  surface_lowest: '#000000',      // Deepest black for inputs
  surface: '#0a1118',             // Main floating background
  surface_low: '#0d1522',         // Tab bar, secondary areas
  surface_container: '#0f1a28',   // Cards
  surface_high: '#132133',
  surface_highest: '#17283e',

  // Primary Actions
  primary: '#5DA6FF',          // Vibrant Light Blue (Guardar Sesion, checks, active text)
  primaryDark: '#13508C',      // Deep active borders
  on_primary: '#000000',       // Black text on primary buttons
  primary_container: '#5DA6FF',
  on_primary_container: '#000000',

  // Secondary
  secondary: '#184173',        // Darker blue
  on_secondary: '#ffffff',
  secondary_container: '#183D63', // Used for borders

  // Tertiary
  tertiary: '#5ea2ff',         
  
  // Text & Outline
  text: '#ffffff',             
  textMuted: '#A0ABC0',        // Subdued slate gray text
  outline: '#1E3A5F',          // Prominent navy/blue borders
  outline_variant: '#12233b',

  // Semantic
  danger: '#FF3B30',
  white: '#ffffff',
  
  // Legacy aliases
  border: '#1E3A5F',           // Maps directly to outline
  surfaceLight: '#0f1a28',
  accent: '#5DA6FF',
  cardBg: '#0f1a28',

  // Default Expo Router tabs structure
  light: {
    text: '#ffffff',
    background: '#040b16',
    tint: '#5DA6FF',
    icon: '#A0ABC0',
    tabIconDefault: '#A0ABC0',
    tabIconSelected: '#5DA6FF',
  },
  dark: {
    text: '#ffffff',
    background: '#040b16',
    tint: '#5DA6FF',
    icon: '#A0ABC0',
    tabIconDefault: '#A0ABC0',
    tabIconSelected: '#5DA6FF',
  },
};

// ─── Mutable singleton (keeps existing `import { Colors }` working) ───────────

export let Colors = { ...KineticColors };

export function setActiveTheme(mode: ThemeMode) {
  // Kinetic is exclusively Editorial Dark, so we enforce it.
  Object.assign(Colors, KineticColors);
}

// ─── Shared constants (theme-independent) ─────────────────────────────────────

export const Fonts = {
  // Kinetic Typography System
  display: 'Lexend_700Bold',
  headline: 'Lexend_600SemiBold',
  body: 'Manrope_400Regular',
  bodyBold: 'Manrope_700Bold',
  label: 'Manrope_500Medium',
  
  // Fallbacks
  rounded: Platform.select({ ios: 'System', default: 'sans-serif' }),
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};

export const Typography = {
  xs: 12 * 1.2, // ~14.4
  sm: 14 * 1.2, // ~16.8
  md: 16 * 1.2, // ~19.2
  lg: 18 * 1.2, // ~21.6
  xl: 24 * 1.2, // ~28.8
  xxl: 32 * 1.2, // ~38.4
};

export const Spacing = {
  xs: 8,     // Kinetic Moderate starts wider
  sm: 12,
  md: 16,    // Moderate 2 (Breathable margins)
  lg: 24,
  xl: 32,
};

export const borderRadius = {
  sm: 6,
  md: 12,    // Moderate roundedness for harmony
  lg: 16,
  xl: 24,
  full: 9999,
};

export const MuscleGroupColors: Record<string, string> = {
  Pecho: '#00a2fd',      
  Espalda: '#2678d1',    
  Cuádriceps: '#8364ce', 
  Isquios: '#005f9e',    
  Glúteos: '#FF6B81',    
  Hombros: '#FACC15',    
  Bícep: '#A29BFE',      
  Trícep: '#FF6B81',     
  Core: '#00a2fd',       
  Descanso: '#4a5e7e',   
};
