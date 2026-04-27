import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';

const ArtistAcademyPanel = () => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.wrap}>
      <LinearGradient colors={theme.gradients.accent} style={styles.hero}>
        <Text style={styles.title}>Academy (Mentor)</Text>
        <Text style={styles.sub}>Teach students. Lessons, safety modules, and progress tracking comes next.</Text>
      </LinearGradient>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Mentor tools (next)</Text>
        <Text style={styles.line}>1. Create lessons (video / notes)</Text>
        <Text style={styles.line}>2. Assign modules to students</Text>
        <Text style={styles.line}>3. Q&A + grading</Text>
      </View>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 110,
      gap: 12,
    },
    hero: {
      borderRadius: 24,
      padding: 16,
      gap: 6,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    title: {
      color: '#0B0B0F',
      fontSize: 18,
      fontWeight: '900',
    },
    sub: {
      color: 'rgba(11, 11, 15, 0.78)',
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
      maxWidth: 440,
    },
    card: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 8,
    },
    cardTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    line: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
  });

export default ArtistAcademyPanel;
