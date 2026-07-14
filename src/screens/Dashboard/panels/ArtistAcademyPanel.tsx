import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';

type ArtistAcademyPanelProps = {
  header?: React.ReactNode;
};

const ArtistAcademyPanel = ({ header }: ArtistAcademyPanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.wrap}>
      {header ? <View style={styles.headerWrap}>{header}</View> : null}
      <LinearGradient colors={theme.gradients.accent} style={styles.hero}>
        <Text style={styles.title}>Academy Coming Soon</Text>
        <Text style={styles.sub}>Tattoo craft lessons, safety modules, and mentor tools are being prepared for verified artists.</Text>
      </LinearGradient>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Creative tools loading</Text>
        <Text style={styles.line}>Safety-first tattoo learning</Text>
        <Text style={styles.line}>Studio workflow guides</Text>
        <Text style={styles.line}>Artist growth resources</Text>
      </View>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    wrap: {
      flex: 1,
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 110,
      gap: 12,
    },
    headerWrap: {
      gap: 12,
      marginBottom: 2,
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
