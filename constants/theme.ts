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
  surface_container_low: '#0a1320', // Low surface container
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
  error: '#FF3B30',
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

export const LightColors = {
  background: '#E2E8F0', // Fondo más grisáceo para reducir el brillo (menos blanco)
  surface_lowest: '#F8FAFC',
  surface: '#F8FAFC', // Tarjetas con un blanco más suave
  surface_container_low: '#F1F5F9',
  surface_low: '#CBD5E1',
  surface_container: '#F8FAFC',
  surface_high: '#94A3B8',
  surface_highest: '#64748B',
  primary: '#1D4ED8', // Azul vibrante para iconos y botones
  primaryDark: '#1E40AF',
  on_primary: '#FFFFFF',
  primary_container: '#EFF6FF', // Fondo de iconos muy claro
  on_primary_container: '#1E3A8A',
  secondary: '#3B82F6',
  on_secondary: '#FFFFFF',
  secondary_container: '#DBEAFE',
  tertiary: '#60A5FA',
  text: '#0F172A', // Texto principal muy oscuro
  textMuted: '#475569', // Texto secundario gris (un poco más oscuro para mejor contraste)
  outline: '#CBD5E1', // Bordes sutiles
  outline_variant: '#E2E8F0',
  danger: '#EF4444',
  error: '#EF4444',
  white: '#ffffff',
  border: '#CBD5E1',
  surfaceLight: '#E2E8F0',
  accent: '#1D4ED8',
  cardBg: '#F8FAFC',
  light: {
    text: '#0F172A',
    background: '#E2E8F0',
    tint: '#1D4ED8',
    icon: '#475569',
    tabIconDefault: '#475569',
    tabIconSelected: '#1D4ED8',
  },
  dark: { ...KineticColors.dark },
};

// ─── Mutable singleton (keeps existing `import { Colors }` working) ───────────

export let Colors = { ...KineticColors };

export function setActiveTheme(mode: ThemeMode) {
  if (mode === 'light') {
    Object.assign(Colors, LightColors);
    Object.assign(Fonts, LightFonts);
  } else {
    Object.assign(Colors, KineticColors);
    Object.assign(Fonts, KineticFonts);
  }
}

// ─── Shared constants (theme-independent) ─────────────────────────────────────

export const KineticFonts = {
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

export const LightFonts = {
  display: Platform.select({ ios: 'System', default: 'sans-serif' }),
  headline: Platform.select({ ios: 'System', default: 'sans-serif-medium' }),
  body: Platform.select({ ios: 'System', default: 'sans-serif' }),
  bodyBold: Platform.select({ ios: 'System', default: 'sans-serif-medium' }),
  label: Platform.select({ ios: 'System', default: 'sans-serif' }),
  rounded: Platform.select({ ios: 'System', default: 'sans-serif' }),
  mono: Platform.select({ ios: 'Menlo', default: 'monospace' }),
};

export let Fonts = { ...KineticFonts };

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
