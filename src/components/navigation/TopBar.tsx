import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

type TopBarProps = {
  title: string;
  onToggleTheme: () => void;
  onPressAlerts: () => void;
  onPressProfile: () => void;
};

const TopBar = ({ title, onToggleTheme, onPressAlerts, onPressProfile }: TopBarProps) => {
  const { theme, mode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const iconColor = theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse;

  return (
    <View style={styles.row}>
      <View style={styles.side}>
        <TouchableOpacity activeOpacity={0.85} onPress={onToggleTheme} style={styles.iconButton}>
          <Ionicons
            name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'}
            size={18}
            color={iconColor}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.center}>
        <Text numberOfLines={1} style={styles.title}>
          {title}
        </Text>
      </View>

      <View style={[styles.side, styles.sideRight]}>
        <TouchableOpacity activeOpacity={0.85} onPress={onPressAlerts} style={styles.iconButton}>
          <Ionicons name="notifications-outline" size={18} color={iconColor} />
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.85} onPress={onPressProfile} style={styles.iconButton}>
          <Ionicons name="person-outline" size={18} color={iconColor} />
        </TouchableOpacity>
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
      paddingTop: 14,
      paddingBottom: 10,
    },
    side: {
      width: 96,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    sideRight: {
      justifyContent: 'flex-end',
    },
    center: {
      flex: 1,
      alignItems: 'center',
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.8,
      textTransform: 'uppercase',
    },
    iconButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
  });

export default TopBar;
