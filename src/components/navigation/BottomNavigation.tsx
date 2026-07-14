import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

export type FeedNavKey = 'home' | 'explore' | 'findArtist' | 'shop' | 'profile';

type BottomNavigationProps = {
  activeKey: FeedNavKey;
  onChange: (key: FeedNavKey) => void;
};

const NAV_ITEMS: Array<{ key: FeedNavKey; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'explore', label: 'Explore', icon: 'search-outline' },
  { key: 'findArtist', label: 'Find Artist', icon: 'person-add-outline' },
  { key: 'shop', label: 'Shop', icon: 'bag-outline' },
  { key: 'profile', label: 'Profile', icon: 'person-outline' },
];

const BottomNavigation = ({ activeKey, onChange }: BottomNavigationProps) => {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, insets.bottom), [theme, insets.bottom]);

  return (
    <View style={styles.shell}>
      {NAV_ITEMS.map((item) => {
        const isActive = activeKey === item.key;
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
              <Ionicons name={item.icon} size={20} color={isActive ? theme.colors.accent : theme.colors.textMuted} />
            </View>

            <Text numberOfLines={1} style={[styles.label, isActive && styles.labelActive]}>
              {item.label}
            </Text>

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
      marginHorizontal: 12,
      marginBottom: Math.max(2, bottomInset > 0 ? Math.round(bottomInset * 0.18) : 2),
      backgroundColor: theme.mode === 'light' ? 'rgba(255, 255, 255, 0.96)' : '#000000',
      borderRadius: 16,
      borderWidth: 0,
      paddingVertical: 3,
      paddingHorizontal: 4,
      paddingBottom: Math.max(3, bottomInset > 0 ? Math.min(7, Math.round(bottomInset * 0.22)) : 3),
      shadowOpacity: 0,
      elevation: 0,
    },
    item: {
      flex: 1,
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingVertical: 2,
      borderRadius: 12,
    },
    itemActive: {
      backgroundColor: 'transparent',
    },
    iconSlot: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      color: theme.colors.textMuted,
      fontSize: Math.max(9, theme.typography.caption - 1),
      fontWeight: '700',
      letterSpacing: 0.2,
      textAlign: 'center',
    },
    labelActive: {
      color: theme.colors.accent,
      textShadowColor: theme.mode === 'light' ? 'rgba(33, 108, 255, 0.12)' : 'rgba(138, 43, 255, 0.24)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 5,
    },
    indicator: {
      width: 18,
      height: 2,
      borderRadius: 999,
      backgroundColor: 'transparent',
      marginTop: 1,
    },
    indicatorActive: {
      backgroundColor: theme.colors.accent,
      shadowColor: theme.colors.accent,
      shadowOpacity: theme.mode === 'light' ? 0.08 : 0.16,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 0 },
    },
  });

export default BottomNavigation;
