import { brand } from './brand';
import { Platform } from 'react-native';

export type ThemeMode = 'dark' | 'light';

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
};

export const createTheme = (mode: ThemeMode): AppTheme => {
  // Best-effort Arial. Android devices may fall back to the default sans font if Arial isn't available.
  const arial = Platform.OS === 'android' ? 'sans-serif' : 'Arial';

  if (mode === 'light') {
    return {
      mode,
      colors: {
        background: brand.cleanWhite,
        backgroundAlt: '#EEF2F7',
        surface: 'rgba(255, 255, 255, 0.92)',
        surfaceMuted: 'rgba(255, 255, 255, 0.8)',
        surfaceStrong: '#FFFFFF',
        border: 'rgba(11, 11, 15, 0.12)',
        borderStrong: 'rgba(11, 11, 15, 0.22)',
        text: '#0B0B0F',
        textMuted: 'rgba(11, 11, 15, 0.62)',
        textInverse: brand.cleanWhite,
        accent: brand.cyberPurple,
        accentStrong: brand.electricNeonBlue,
        accentSoft: 'rgba(122, 92, 255, 0.12)',
        overlay: 'rgba(11, 11, 15, 0.06)',
        shadow: 'rgba(5, 10, 20, 0.22)',
      },
      gradients: {
        canvas: [brand.cleanWhite, '#EEF2F7', '#E7EDF7'],
        accent: [brand.electricNeonBlue, brand.cyberPurple, brand.electricNeonBlue],
        dark: ['#FFFFFF', '#EEF2F7'],
        glow: ['rgba(0, 229, 255, 0.14)', 'rgba(122, 92, 255, 0)'],
      },
      radius: { sm: 14, md: 20, lg: 28, pill: 999 },
      spacing: { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40 },
      fonts: { display: arial, body: arial },
    };
  }

  return {
    mode,
    colors: {
      background: brand.deepInkBlack,
      backgroundAlt: brand.inkShadow,
      surface: 'rgba(11, 11, 15, 0.86)',
      surfaceMuted: 'rgba(11, 11, 15, 0.72)',
      surfaceStrong: brand.inkShadow,
      border: 'rgba(199, 204, 214, 0.16)',
      borderStrong: 'rgba(199, 204, 214, 0.34)',
      text: brand.cleanWhite,
      textMuted: 'rgba(245, 247, 250, 0.68)',
      textInverse: brand.cleanWhite,
      accent: brand.cyberPurple,
      accentStrong: brand.electricNeonBlue,
      accentSoft: 'rgba(122, 92, 255, 0.14)',
      overlay: 'rgba(7, 17, 31, 0.28)',
      shadow: brand.inkShadow,
    },
    gradients: {
      canvas: [brand.deepInkBlack, brand.inkShadow, brand.inkNavy],
      accent: [brand.electricNeonBlue, brand.cyberPurple, brand.electricNeonBlue],
      dark: [brand.deepInkBlack, brand.inkShadow],
      glow: ['rgba(0, 229, 255, 0.16)', 'rgba(122, 92, 255, 0)'],
    },
    radius: { sm: 14, md: 20, lg: 28, pill: 999 },
    spacing: { xs: 8, sm: 12, md: 16, lg: 24, xl: 32, xxl: 40 },
    fonts: { display: arial, body: arial },
  };
};

export const themes = {
  dark: createTheme('dark'),
  light: createTheme('light'),
} as const;
