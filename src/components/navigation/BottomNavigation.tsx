import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { createResponsiveShadow } from '../../utils/responsiveShadow';
import { useAppTheme } from '../../theme/useAppTheme';
import { brand } from '../../theme/brand';
import type { AppTheme } from '../../theme/theme';

export type FeedNavKey = 'home' | 'explore' | 'findArtist' | 'learning' | 'shop';

type BottomNavigationProps = {
  activeKey: FeedNavKey;
  onChange: (key: FeedNavKey) => void;
};

const NAV_ITEMS: Array<{ key: FeedNavKey; label: string; icon: keyof typeof Ionicons.glyphMap; isPrimary?: boolean }> = [
  { key: 'home', label: 'Home', icon: 'home-outline' },
  { key: 'explore', label: 'Explore', icon: 'search-outline' },
  { key: 'findArtist', label: 'Find Artist', icon: 'add', isPrimary: true },
  { key: 'learning', label: 'Academy', icon: 'school-outline' },
  { key: 'shop', label: 'Shop', icon: 'cart-outline' },
];

const BottomNavigation = ({ activeKey, onChange }: BottomNavigationProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.shell}>
      {NAV_ITEMS.map((item) => {
        const isActive = activeKey === item.key;
        const isPrimary = Boolean(item.isPrimary);

        return (
          <TouchableOpacity
            key={item.key}
            activeOpacity={0.85}
            onPress={() => onChange(item.key)}
            style={[styles.item, isActive && styles.itemActive]}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <View style={styles.iconSlot}>
              {isPrimary ? (
                <LinearGradient colors={[brand.electricNeonBlue, brand.cyberPurple]} style={styles.primaryIconShell}>
                  <Ionicons name={item.icon} size={22} color={brand.deepInkBlack} />
                </LinearGradient>
              ) : (
                <Ionicons name={item.icon} size={20} color={isActive ? theme.colors.accent : theme.colors.textMuted} />
              )}
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

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    shell: {
      flexDirection: 'row',
      marginHorizontal: 10,
      marginBottom: 10,
      backgroundColor: theme.mode === 'light' ? 'rgba(255, 255, 255, 0.92)' : 'rgba(11, 11, 15, 0.92)',
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 8,
      paddingHorizontal: 6,
      ...createResponsiveShadow({
        web: theme.mode === 'light' ? '0px 16px 28px rgba(5, 10, 20, 0.16)' : '0px 16px 28px rgba(5, 10, 20, 0.32)',
        native: {
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: theme.mode === 'light' ? 0.16 : 0.32,
          shadowRadius: 28,
          elevation: 10,
        },
      }),
    },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingVertical: 6,
      borderRadius: 16,
    },
    itemActive: {
      backgroundColor: theme.colors.accentSoft,
    },
    iconSlot: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryIconShell: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    label: {
      color: theme.colors.textMuted,
      fontSize: 9,
      fontWeight: '800',
      letterSpacing: 0.2,
      textAlign: 'center',
    },
    labelActive: {
      color: theme.colors.accent,
    },
    indicator: {
      width: 22,
      height: 3,
      borderRadius: 999,
      backgroundColor: 'transparent',
      marginTop: 1,
    },
    indicatorActive: {
      backgroundColor: theme.colors.accent,
    },
  });

export default BottomNavigation;
