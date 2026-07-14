import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

type TopBarProps = {
  title: string;
  brandLayout?: boolean;
  onToggleTheme?: () => void;
  onPressAlerts?: () => void;
  onPressSecondary?: () => void;
  showThemeToggle?: boolean;
  showSecondary?: boolean;
  showAlerts?: boolean;
  notificationCount?: number;
  secondaryIconName?: keyof typeof Ionicons.glyphMap;
  secondaryBadgeCount?: number;
  secondaryEmphasis?: boolean;
};

const TopBar = ({
  title,
  brandLayout = false,
  onToggleTheme,
  onPressAlerts,
  onPressSecondary,
  showThemeToggle = true,
  showSecondary = true,
  showAlerts = true,
  notificationCount = 0,
  secondaryIconName = 'person-outline',
  secondaryBadgeCount = 0,
  secondaryEmphasis = false,
}: TopBarProps) => {
  const { theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const iconColor = theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse;
  const safeCount = Math.max(0, Number(notificationCount || 0));
  const safeSecondaryCount = Math.max(0, Number(secondaryBadgeCount || 0));

  return (
    <View style={styles.row}>
      {brandLayout ? (
        <View style={styles.brandSide}>
          <View style={styles.brandWordmark}>
            <Text numberOfLines={1} style={[styles.title, styles.brandTitle, styles.brandGlowCyan]}>{title}</Text>
            <Text numberOfLines={1} style={[styles.title, styles.brandTitle, styles.brandGlowPurple]}>{title}</Text>
            <Text numberOfLines={1} style={[styles.title, styles.brandTitle, styles.brandMain]}>{title}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.side}>
          {showThemeToggle ? (
            <TouchableOpacity activeOpacity={0.85} onPress={onToggleTheme} style={styles.iconButton} hitSlop={10}>
              <Ionicons
                name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'}
                size={18}
                color={iconColor}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.iconSpacer} />
          )}
        </View>
      )}

      {brandLayout ? <View style={styles.centerBrand} /> : (
        <View style={styles.center}>
          <Text numberOfLines={1} style={styles.title}>
            {title}
          </Text>
        </View>
      )}

      <View style={[styles.side, styles.sideRight]}>
        {showAlerts ? (
          <TouchableOpacity activeOpacity={0.85} onPress={onPressAlerts} style={styles.iconButton} hitSlop={10}>
            <Ionicons name="notifications-outline" size={18} color={iconColor} />
            {safeCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{safeCount > 99 ? '99+' : String(safeCount)}</Text></View> : null}
          </TouchableOpacity>
        ) : null}
        {brandLayout && showThemeToggle ? (
          <TouchableOpacity activeOpacity={0.85} onPress={onToggleTheme} style={styles.iconButton} hitSlop={10}>
            <Ionicons
              name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'}
              size={18}
              color={iconColor}
            />
          </TouchableOpacity>
        ) : null}
        {showSecondary ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onPressSecondary}
            style={[styles.iconButton, secondaryEmphasis && styles.iconButtonAccent]}
            hitSlop={10}
          >
            <Ionicons name={secondaryIconName} size={18} color={iconColor} />
            {safeSecondaryCount > 0 ? <View style={styles.badge}><Text style={styles.badgeText}>{safeSecondaryCount > 99 ? '99+' : String(safeSecondaryCount)}</Text></View> : null}
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 18,
      paddingTop: Platform.OS === 'android' ? 12 : 12,
      paddingBottom: 6,
    },
    side: {
      width: 96,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    brandSide: {
      flexDirection: 'row',
      alignItems: 'center',
      minWidth: 108,
    },
    sideRight: {
      justifyContent: 'flex-end',
    },
    center: {
      flex: 1,
      alignItems: 'center',
    },
    centerBrand: {
      flex: 1,
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.bodyLg,
      fontWeight: '800',
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      textShadowColor: theme.mode === 'light' ? 'rgba(0, 212, 255, 0.18)' : 'rgba(168, 85, 247, 0.34)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 10,
    },
    brandTitle: {
      textTransform: 'none',
      letterSpacing: -0.8,
      fontSize: Math.round(theme.typography.title * 1.28),
      fontFamily: Platform.select({
        ios: 'Snell Roundhand',
        android: 'cursive',
        default: 'cursive',
      }),
      fontStyle: 'italic',
      fontWeight: '900',
      textShadowRadius: 0,
    },
    brandWordmark: {
      width: 104,
      height: 42,
      justifyContent: 'center',
    },
    brandGlowCyan: {
      position: 'absolute',
      left: -1.2,
      color: '#00D4FF',
      opacity: theme.mode === 'light' ? 0.82 : 0.9,
    },
    brandGlowPurple: {
      position: 'absolute',
      left: 1.2,
      color: '#A855F7',
      opacity: theme.mode === 'light' ? 0.76 : 0.88,
    },
    brandMain: {
      color: theme.mode === 'light' ? '#121217' : '#FFFFFF',
      textShadowColor: theme.mode === 'light' ? 'rgba(168,85,247,0.14)' : 'rgba(168,85,247,0.26)',
      textShadowOffset: { width: 0, height: 0 },
      textShadowRadius: 6,
    },
    iconButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(255, 255, 255, 0.82)' : 'rgba(19, 14, 32, 0.92)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.accent,
      shadowOpacity: theme.mode === 'light' ? 0.06 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    iconButtonAccent: {
      backgroundColor: theme.mode === 'light' ? 'rgba(0, 102, 255, 0.14)' : 'rgba(0, 212, 255, 0.12)',
      borderColor: theme.colors.accent,
      shadowOpacity: theme.mode === 'light' ? 0.14 : 0.24,
      shadowRadius: 18,
    },
    iconSpacer: {
      width: 42,
      height: 42,
    },
    badge: {
      position: 'absolute',
      right: -2,
      top: -2,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentStrong,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? '#ffffff' : 'rgba(11, 11, 15, 0.9)',
    },
    badgeText: {
      color: theme.mode === 'light' ? '#0b0b0f' : '#0b0b0f',
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.2,
    },
  });

export default TopBar;
