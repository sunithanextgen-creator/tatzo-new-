import React from 'react';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import AppNavigator from './src/navigation/AppNavigator';
import { ThemeProvider } from './src/theme/ThemeProvider';
import { useAppTheme } from './src/theme/useAppTheme';
import DevErrorBoundary from './src/components/debug/DevErrorBoundary';
import { ANALYTICS_EVENTS, initializeAnalytics, trackAnalyticsEvent } from './src/services/analytics/analytics';
import { initializeCrashlytics } from './src/services/crashlytics';

const AppFrame = () => {
  const { theme } = useAppTheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        {Platform.OS === 'web' ? (
          <View style={[styles.webCanvas, { backgroundColor: theme.colors.background }]}>
            <View style={[styles.phoneFrame, { backgroundColor: theme.colors.background }]}>
              <AppNavigator />
            </View>
          </View>
        ) : (
          <AppNavigator />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

export default function App() {
  useEffect(() => {
    void initializeCrashlytics();
    void initializeAnalytics().then(() => trackAnalyticsEvent(ANALYTICS_EVENTS.APP_OPEN, { platform: Platform.OS }));
  }, []);

  return (
    <ThemeProvider>
      {__DEV__ ? (
        <DevErrorBoundary>
          <AppFrame />
        </DevErrorBoundary>
      ) : (
        <AppFrame />
      )}
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  webCanvas: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phoneFrame: {
    flex: 1,
    width: '100%',
    maxWidth: 430,
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
});
