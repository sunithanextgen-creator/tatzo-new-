import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

export type ArtistNavKey = 'home' | 'booking' | 'post' | 'shop' | 'profile';

type ArtistBottomNavigationProps = {
  activeKey: ArtistNavKey;
  onChange: (key: ArtistNavKey) => void;
  badgeCounts?: Partial<Record<ArtistNavKey, number>>;
};

const NAV_ITEMS: Array<{ key: ArtistNavKey; label: string; icon: keyof typeof Ionicons.glyphMap; isPrimary?: boolean }> = [
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'booking', label: 'Bookings', icon: 'calendar-outline' },
  { key: 'post', label: 'Post', icon: 'add', isPrimary: true },
  { key: 'shop', label: 'Shop', icon: 'bag-outline' },
  { key: 'profile', label: 'Profile', icon: 'person-outline' },
];

const ArtistBottomNavigation = ({ activeKey, onChange, badgeCounts }: ArtistBottomNavigationProps) => {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, insets.bottom), [theme, insets.bottom]);

  return (
    <View style={styles.shell}>
      {NAV_ITEMS.map((item) => {
        const isActive = activeKey === item.key;
        const isPrimary = Boolean(item.isPrimary);

        return (
          <TouchableOpacity
            key={item.key}
            activeOpacity={1}
            onPress={() => onChange(item.key)}
            style={[styles.item, isActive && styles.itemActive]}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <View style={styles.iconSlot}>
              {isPrimary ? (
                <LinearGradient colors={theme.mode === 'light' ? ['#0066FF', '#00D4FF', '#4CC9FF'] : ['#7C3AED', '#A855F7', '#00D4FF']} style={styles.primaryIconShell}>
                  <Ionicons name={item.icon} size={20} color={theme.colors.textInverse} />
                </LinearGradient>
              ) : (
                <Ionicons name={item.icon} size={20} color={isActive ? theme.colors.accent : theme.colors.textMuted} />
              )}
            </View>

            <Text numberOfLines={1} style={[styles.label, isActive && styles.labelActive]}>
              {item.label}
            </Text>
            {Number(badgeCounts?.[item.key] ?? 0) > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{Number(badgeCounts?.[item.key] ?? 0) > 99 ? '99+' : String(Number(badgeCounts?.[item.key] ?? 0))}</Text>
              </View>
            ) : null}

            <View style={[styles.indicator, isActive && styles.indicatorActive]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

const createStyles = (theme: AppTheme, bottomInset: number) =>
  StyleSheet.create({
    shell: {
      flexDirection: 'row',
      marginHorizontal: 14,
      marginBottom: Math.max(20, bottomInset > 0 ? Math.round(bottomInset * 0.45) : 20),
      backgroundColor: theme.mode === 'light' ? theme.colors.background : '#000000',
      borderRadius: 18,
      borderWidth: 0,
      paddingVertical: 3,
      paddingHorizontal: 6,
      minHeight: 66,
      paddingBottom: Math.max(3, bottomInset > 0 ? Math.min(7, Math.round(bottomInset * 0.22)) : 3),
      shadowOpacity: 0,
      zIndex: 40,
      elevation: 0,
    },
    item: {
      flex: 1,
      minWidth: 0,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingVertical: 3,
      borderRadius: 12,
    },
    itemActive: {
      backgroundColor: 'transparent',
    },
    iconSlot: {
      width: 28,
      height: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryIconShell: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(0, 212, 255, 0.28)' : 'rgba(168, 85, 247, 0.18)',
      shadowColor: theme.mode === 'light' ? '#00D4FF' : '#A855F7',
      shadowOpacity: theme.mode === 'light' ? 0.18 : 0.28,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    label: {
      color: theme.colors.textMuted,
      fontSize: Math.max(9, theme.typography.caption - 1),
      lineHeight: Math.max(10, theme.typography.caption),
      fontWeight: '900',
      letterSpacing: 0.15,
      textAlign: 'center',
      minHeight: Math.max(16, theme.typography.caption + 2),
    },
    labelActive: {
      color: theme.colors.accent,
      textShadowColor: theme.mode === 'light' ? 'rgba(168, 85, 247, 0.12)' : 'rgba(0, 212, 255, 0.18)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 4,
    },
    indicator: {
      width: 16,
      height: 2,
      borderRadius: 999,
      backgroundColor: 'transparent',
      marginTop: 0,
    },
    indicatorActive: {
      backgroundColor: theme.colors.accent,
      opacity: 0.85,
      shadowColor: theme.colors.accent,
      shadowOpacity: theme.mode === 'light' ? 0.12 : 0.22,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 0 },
    },
    badge: {
      position: 'absolute',
      top: -1,
      right: 4,
      minWidth: 13,
      height: 13,
      borderRadius: 6.5,
      paddingHorizontal: 2,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentStrong,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? '#ffffff' : 'rgba(11, 11, 15, 0.9)',
    },
    badgeText: {
      color: theme.mode === 'light' ? '#0b0b0f' : '#0b0b0f',
      fontSize: Math.max(7, theme.typography.caption - 3),
      fontWeight: '900',
      letterSpacing: 0.2,
    },
  });

export default ArtistBottomNavigation;
