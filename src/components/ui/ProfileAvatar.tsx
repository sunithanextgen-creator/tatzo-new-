import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, type ImageStyle, type StyleProp } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

type ProfileAvatarProps = {
  uri?: string | null;
  name: string;
  size?: number;
  style?: StyleProp<ImageStyle>;
  imageStyle?: StyleProp<ImageStyle>;
};

const ProfileAvatar = ({ uri, name, size = 44, style, imageStyle }: ProfileAvatarProps) => {
  const { theme } = useAppTheme();
  const initials = useMemo(() => {
    const value = String(name ?? '').trim();
    if (!value) return 'T';
    return value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }, [name]);

  const styles = useMemo(() => createStyles(theme, size), [theme, size]);

  if (uri?.trim()) {
    return (
      <LinearGradient colors={theme.gradients.accent} style={[styles.frame, style]}>
        <Image source={{ uri: uri.trim() }} style={[styles.image, imageStyle]} resizeMode="cover" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={theme.gradients.accent} style={[styles.fallback, style]}>
      <Text style={styles.initials}>{initials}</Text>
    </LinearGradient>
  );
};

const createStyles = (theme: AppTheme, size: number) =>
  StyleSheet.create({
    frame: {
      width: size + 4,
      height: size + 4,
      borderRadius: Math.max(14, Math.floor(size / 3) + 2),
      alignItems: 'center',
      justifyContent: 'center',
      padding: 2,
    },
    image: {
      width: size,
      height: size,
      borderRadius: Math.max(12, Math.floor(size / 3)),
      backgroundColor: theme.colors.backgroundAlt,
    },
    fallback: {
      width: size,
      height: size,
      borderRadius: Math.max(12, Math.floor(size / 3)),
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    initials: {
      color: theme.colors.textInverse,
      fontSize: Math.max(12, Math.floor(size * 0.36)),
      fontWeight: '900',
      letterSpacing: 0.6,
    },
  });

export default ProfileAvatar;
