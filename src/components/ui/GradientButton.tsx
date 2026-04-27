import React, { useMemo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/useAppTheme';
import { brand } from '../../theme/brand';
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
      <LinearGradient colors={[brand.electricNeonBlue, brand.cyberPurple]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.gradient}>
        {loading ? <ActivityIndicator color={brand.deepInkBlack} /> : <Text style={styles.text}>{title}</Text>}
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
      borderColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.14)' : 'rgba(255, 255, 255, 0.14)',
    },
    gradient: {
      paddingVertical: size === 'lg' ? 14 : 12,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    text: {
      color: brand.deepInkBlack,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    disabled: {
      opacity: 0.6,
    },
  });

export default GradientButton;

