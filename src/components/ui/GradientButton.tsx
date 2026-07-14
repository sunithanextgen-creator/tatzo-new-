import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

type GradientButtonProps = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  size?: 'md' | 'lg';
};

const GradientButton = ({ title, onPress, disabled, loading, style, size = 'lg' }: GradientButtonProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, size), [theme, size]);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.wrap, (disabled || loading) && styles.disabled, style]}
    >
      <LinearGradient colors={theme.gradients.accent} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
        {loading ? (
          <>
            <ActivityIndicator color={theme.colors.textInverse} />
            <Text style={[styles.text, styles.loadingText]} numberOfLines={1}>
              {title}
            </Text>
          </>
        ) : (
          <Text style={styles.text}>{title}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
};

const createStyles = (theme: AppTheme, size: 'md' | 'lg') =>
  StyleSheet.create({
    wrap: {
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(0, 102, 255, 0.18)' : 'rgba(138, 43, 226, 0.24)',
      shadowColor: theme.colors.accent,
      shadowOpacity: theme.mode === 'light' ? 0.12 : 0.26,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: theme.mode === 'light' ? 5 : 8,
    },
    gradient: {
      paddingVertical: size === 'lg' ? 14 : 12,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      flexDirection: 'row',
    },
    text: {
      color: theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    loadingText: {
      letterSpacing: 0.4,
    },
    disabled: {
      opacity: 0.6,
    },
  });

export default GradientButton;
