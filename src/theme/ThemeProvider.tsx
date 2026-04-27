import React, { createContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppTheme, ThemeMode, themes } from './theme';

type ThemeContextValue = {
  mode: ThemeMode;
  theme: AppTheme;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
};

const STORAGE_KEY = 'tatzo.themeMode';

export const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = {
  children: React.ReactNode;
};

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((value) => {
        if (!alive) return;
        if (value === 'light' || value === 'dark') {
          setModeState(value);
        }
      })
      .catch(() => {
        // Best-effort persistence only.
      });

    return () => {
      alive = false;
    };
  }, []);

  const setMode = (next: ThemeMode) => {
    setModeState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Best-effort persistence only.
    });
  };

  const toggleMode = () => setMode(mode === 'dark' ? 'light' : 'dark');

  const theme = useMemo(() => themes[mode], [mode]);

  const value = useMemo(
    () => ({ mode, theme, setMode, toggleMode }),
    [mode, theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
