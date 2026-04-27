import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createResponsiveShadow } from '../../utils/responsiveShadow';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

type LoadingScreenProps = {
  title: string;
  message: string;
};

const LoadingScreen = ({ title, message }: LoadingScreenProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={theme.gradients.canvas} style={styles.container}>
        <View style={styles.halo} />
        <View style={styles.card}>
          <Text style={styles.eyebrow}>Tatzo System</Text>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <ActivityIndicator size="small" color={theme.colors.accentStrong} />
        </View>
      </LinearGradient>
    </SafeAreaView>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    halo: {
      position: 'absolute',
      width: 280,
      height: 280,
      borderRadius: 140,
      backgroundColor: theme.mode === 'light' ? 'rgba(0, 229, 255, 0.1)' : 'rgba(122, 92, 255, 0.12)',
      transform: [{ translateY: -150 }],
    },
    card: {
      width: '100%',
      maxWidth: 340,
      backgroundColor: theme.colors.surface,
      borderRadius: 28,
      paddingHorizontal: 24,
      paddingVertical: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...createResponsiveShadow({
        web: theme.mode === 'light' ? '0px 16px 28px rgba(5, 10, 20, 0.12)' : '0px 16px 28px rgba(5, 10, 20, 0.15)',
        native: {
          shadowColor: theme.mode === 'light' ? 'rgba(5, 10, 20, 0.18)' : theme.colors.shadow,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: theme.mode === 'light' ? 0.12 : 0.15,
          shadowRadius: 28,
          elevation: 10,
        },
      }),
      gap: 10,
    },
    eyebrow: {
      color: theme.colors.accentStrong,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 2.2,
      textTransform: 'uppercase',
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 28,
      fontWeight: '700',
      fontFamily: theme.fonts.display,
    },
    message: {
      color: theme.colors.textMuted,
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 6,
    },
  });

export default LoadingScreen;
