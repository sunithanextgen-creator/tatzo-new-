import { brand } from './brand';
import { Platform } from 'react-native';

export type ThemeMode = 'dark' | 'light';
export type ThemePreference = ThemeMode | 'system';
export type FontSizeMode = 'small' | 'medium' | 'large';

export type AppTheme = {
  mode: ThemeMode;
  colors: {
    background: string;
    backgroundAlt: string;
    surface: string;
    surfaceMuted: string;
    surfaceStrong: string;
    border: string;
    borderStrong: string;
    text: string;
    textMuted: string;
    textInverse: string;
    accent: string;
    accentStrong: string;
    accentSoft: string;
    overlay: string;
    shadow: string;
  };
  gradients: {
    canvas: readonly [string, string, string];
    accent: readonly [string, string, string];
    dark: readonly [string, string];
    glow: readonly [string, string];
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
    pill: number;
  };
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
    xxl: number;
  };
  fonts: {
    display: string;
    body: string;
  };
  fontScale: number;
  typography: {
    caption: number;
    body: number;
    bodyLg: number;
    title: number;
    heading: number;
    display: number;
  };
};

const getFontScale = (fontSizeMode: FontSizeMode) => {
  if (fontSizeMode === 'small') return 0.92;
  if (fontSizeMode === 'large') return 1.08;
  return 1;
};

export const createTheme = (mode: ThemeMode, fontSizeMode: FontSizeMode = 'medium'): AppTheme => {
  // Best-effort Arial. Android devices may fall back to the default sans font if Arial isn't available.
  const arial = Platform.OS === 'android' ? 'sans-serif' : 'Arial';
  const fontScale = getFontScale(fontSizeMode);
  const typography = {
    caption: Math.round(11 * fontScale),
    body: Math.round(13 * fontScale),
    bodyLg: Math.round(15 * fontScale),
    title: Math.round(20 * fontScale),
    heading: Math.round(28 * fontScale),
    display: Math.round(34 * fontScale),
  };

  if (mode === 'light') {
    return {
      mode,
      colors: {
        background: brand.cleanWhite,
        backgroundAlt: '#F6F3FF',
        surface: '#FBFBFE',
        surfaceMuted: 'rgba(255, 255, 255, 0.92)',
        surfaceStrong: '#FFFFFF',
        border: 'rgba(168, 85, 247, 0.14)',
        borderStrong: 'rgba(168, 85, 247, 0.3)',
        text: '#111827',
        textMuted: '#6B7280',
        textInverse: brand.cleanWhite,
        accent: '#A855F7',
        accentStrong: '#C084FC',
        accentSoft: 'rgba(168, 85, 247, 0.09)',
        overlay: 'rgba(17, 24, 39, 0.05)',
        shadow: 'rgba(168, 85, 247, 0.16)',
      },
      gradients: {
        canvas: ['#FFFFFF', '#F6F3FF', '#FFFFFF'],
        accent: ['#A855F7', '#C084FC', '#00D4FF'],
        dark: ['#FFFFFF', '#F6F3FF'],
        glow: ['rgba(168, 85, 247, 0.18)', 'rgba(0, 212, 255, 0.05)'],
      },
      radius: { sm: 14, md: 20, lg: 28, pill: 999 },
      spacing: { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40 },
      fonts: { display: arial, body: arial },
      fontScale,
      typography,
    };
  }

  return {
    mode,
      colors: {
        background: brand.deepInkBlack,
        backgroundAlt: '#0B0B10',
        surface: '#121212',
        surfaceMuted: 'rgba(18, 18, 18, 0.95)',
        surfaceStrong: '#181818',
        border: 'rgba(0, 212, 255, 0.18)',
        borderStrong: 'rgba(0, 212, 255, 0.3)',
        text: brand.cleanWhite,
        textMuted: '#A1A1AA',
        textInverse: brand.cleanWhite,
        accent: '#00D4FF',
        accentStrong: '#7DD3FC',
        accentSoft: 'rgba(0, 212, 255, 0.12)',
        overlay: 'rgba(5, 5, 10, 0.42)',
        shadow: 'rgba(0, 212, 255, 0.22)',
      },
      gradients: {
        canvas: ['#050505', '#0B0B10', '#050505'],
        accent: ['#0EA5E9', '#00D4FF', '#A855F7'],
        dark: ['#050505', '#0B0B10'],
        glow: ['rgba(0, 212, 255, 0.22)', 'rgba(168, 85, 247, 0.06)'],
      },
    radius: { sm: 14, md: 20, lg: 28, pill: 999 },
    spacing: { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40 },
    fonts: { display: arial, body: arial },
    fontScale,
    typography,
  };
};

export const themes = {
  dark: createTheme('dark', 'medium'),
  light: createTheme('light', 'medium'),
} as const;
