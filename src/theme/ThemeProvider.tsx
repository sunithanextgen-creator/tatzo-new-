import React, { createContext, useEffect, useMemo, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppTheme, FontSizeMode, ThemeMode, ThemePreference, createTheme } from './theme';

type NotificationSettings = {
  push: boolean;
  email: boolean;
  sms: boolean;
};

type ThemeContextValue = {
  mode: ThemeMode;
  themePreference: ThemePreference;
  theme: AppTheme;
  setMode: (mode: ThemeMode) => void;
  setThemePreference: (mode: ThemePreference) => void;
  toggleMode: () => void;
  fontSizeMode: FontSizeMode;
  setFontSizeMode: (mode: FontSizeMode) => void;
  dataSaverMode: boolean;
  setDataSaverMode: (enabled: boolean) => void;
  notifications: NotificationSettings;
  setNotifications: React.Dispatch<React.SetStateAction<NotificationSettings>>;
};

const STORAGE_KEY = 'tatzo.themeMode';
const FONT_SIZE_KEY = 'tatzo.fontSizeMode';
const DATA_SAVER_KEY = 'tatzo.dataSaverMode';
const NOTIFICATIONS_KEY = 'tatzo.notifications';

export const ThemeContext = createContext<ThemeContextValue | null>(null);

type ThemeProviderProps = {
  children: React.ReactNode;
};

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const systemScheme = useColorScheme();
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('dark');
  const [fontSizeMode, setFontSizeModeState] = useState<FontSizeMode>('medium');
  const [dataSaverMode, setDataSaverModeState] = useState(false);
  const [notifications, setNotificationsState] = useState<NotificationSettings>({ push: true, email: true, sms: false });

  useEffect(() => {
    let alive = true;
    Promise.all([AsyncStorage.getItem(STORAGE_KEY), AsyncStorage.getItem(FONT_SIZE_KEY), AsyncStorage.getItem(DATA_SAVER_KEY), AsyncStorage.getItem(NOTIFICATIONS_KEY)])
      .then(([themeModeValue, fontSizeValue, dataSaverValue, notificationsValue]) => {
        if (!alive) return;
        if (themeModeValue === 'light' || themeModeValue === 'dark' || themeModeValue === 'system') {
          setThemePreferenceState(themeModeValue);
        }
        if (fontSizeValue === 'small' || fontSizeValue === 'medium' || fontSizeValue === 'large') {
          setFontSizeModeState(fontSizeValue);
        }
        if (dataSaverValue === 'true' || dataSaverValue === 'false') {
          setDataSaverModeState(dataSaverValue === 'true');
        }
        if (notificationsValue) {
          try {
            const parsed = JSON.parse(notificationsValue) as NotificationSettings;
            setNotificationsState({
              push: Boolean(parsed.push),
              email: Boolean(parsed.email),
              sms: Boolean(parsed.sms),
            });
          } catch {
            // ignore corrupt persisted notification state
          }
        }
      })
      .catch(() => {
        // Best-effort persistence only.
      });

    return () => {
      alive = false;
    };
  }, []);

  const mode: ThemeMode = themePreference === 'system' ? (systemScheme === 'light' ? 'light' : 'dark') : themePreference;

  const setThemePreference = (next: ThemePreference) => {
    setThemePreferenceState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
      // Best-effort persistence only.
    });
  };

  const setMode = (next: ThemeMode) => {
    setThemePreference(next);
  };

  const setFontSizeMode = (next: FontSizeMode) => {
    setFontSizeModeState(next);
    AsyncStorage.setItem(FONT_SIZE_KEY, next).catch(() => {});
  };

  const setDataSaverMode = (enabled: boolean) => {
    setDataSaverModeState(enabled);
    AsyncStorage.setItem(DATA_SAVER_KEY, String(enabled)).catch(() => {});
  };

  const setNotifications: React.Dispatch<React.SetStateAction<NotificationSettings>> = (next) => {
    setNotificationsState((prev) => {
      const resolved = typeof next === 'function' ? (next as (current: NotificationSettings) => NotificationSettings)(prev) : next;
      AsyncStorage.setItem(NOTIFICATIONS_KEY, JSON.stringify(resolved)).catch(() => {});
      return resolved;
    });
  };

  const toggleMode = () => setMode(mode === 'dark' ? 'light' : 'dark');

  const theme = useMemo(() => createTheme(mode, fontSizeMode), [fontSizeMode, mode]);

  const value = useMemo(
    () => ({
      mode,
      themePreference,
      theme,
      setMode,
      setThemePreference,
      toggleMode,
      fontSizeMode,
      setFontSizeMode,
      dataSaverMode,
      setDataSaverMode,
      notifications,
      setNotifications,
    }),
    [dataSaverMode, fontSizeMode, mode, notifications, theme, themePreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
