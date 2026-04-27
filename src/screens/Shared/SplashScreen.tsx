import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

const SplashScreen = () => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const fade = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 420,
        useNativeDriver: Platform.OS !== 'web',
      }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(float, { toValue: 1, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
          Animated.timing(float, { toValue: 0, duration: 1200, useNativeDriver: Platform.OS !== 'web' }),
        ]),
      ),
    ]).start();
  }, [fade, float]);

  const translateY = float.interpolate({ inputRange: [0, 1], outputRange: [0, -6] });

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={theme.gradients.canvas} style={styles.container}>
        <View style={styles.glowA} />
        <View style={styles.glowB} />

        <Animated.View style={[styles.center, { opacity: fade, transform: [{ translateY }] }]}>
          <Text style={styles.brand}>TATZO</Text>
          <Text style={styles.tagline}>Inks Meets Intelligence</Text>
        </Animated.View>
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
    glowA: {
      position: 'absolute',
      top: -60,
      right: -70,
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: 'rgba(0, 229, 255, 0.1)',
    },
    glowB: {
      position: 'absolute',
      left: -80,
      bottom: -90,
      width: 260,
      height: 260,
      borderRadius: 130,
      backgroundColor: 'rgba(122, 92, 255, 0.12)',
    },
    center: {
      alignItems: 'center',
      gap: 10,
    },
    brand: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 54,
      lineHeight: 58,
      fontWeight: '900',
      letterSpacing: 6,
      fontFamily: theme.fonts.display,
    },
    tagline: {
      color: theme.colors.textMuted,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 2,
      textTransform: 'uppercase',
      textAlign: 'center',
      fontFamily: theme.fonts.body,
    },
  });

export default SplashScreen;

