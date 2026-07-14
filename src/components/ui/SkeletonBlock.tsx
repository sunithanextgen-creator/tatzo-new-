import React, { useMemo } from 'react';
import { StyleSheet, View, type DimensionValue, type ViewStyle } from 'react-native';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

type SkeletonBlockProps = {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: ViewStyle;
};

const SkeletonBlock = ({ width = '100%', height = 14, radius = 999, style }: SkeletonBlockProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme, height, radius), [theme, height, radius]);

  return <View style={[styles.block, { width }, style]} />;
};

const createStyles = (theme: AppTheme, height: number, radius: number) =>
  StyleSheet.create({
    block: {
      height,
      borderRadius: radius,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.08)' : 'rgba(255, 255, 255, 0.08)',
    },
  });

export default SkeletonBlock;
