import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { AppTheme } from '../../theme/theme';
import { useAppTheme } from '../../theme/useAppTheme';
import { brand } from '../../theme/brand';
import type { RequestedRole, VerificationStatus } from '../../types/app';

type StatusBannerProps = {
  status?: VerificationStatus;
  requestedRole?: RequestedRole | null;
  rejectReason?: string;
  actionLabel?: string;
  onPressAction?: () => void;
};

const StatusBanner = ({ status, requestedRole, rejectReason, actionLabel, onPressAction }: StatusBannerProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!status || status === 'unsubmitted' || status === 'approved') return null;

  const roleLabel = requestedRole ? requestedRole.toUpperCase() : 'ARTIST';

  if (status === 'pending' || status === 'pending_verification') {
    return (
      <LinearGradient colors={[brand.cyberPurple, brand.electricNeonBlue]} style={styles.shell}>
        <View style={styles.inner}>
          <Text style={styles.title}>Verification in progress</Text>
          <Text style={styles.sub} numberOfLines={2}>
            Your {roleLabel} suite will unlock soon.
          </Text>
        </View>
      </LinearGradient>
    );
  }

  if (status === 'needs_more_samples') {
    return (
      <LinearGradient colors={['rgba(122, 92, 255, 0.92)', 'rgba(0, 229, 255, 0.82)']} style={styles.shell}>
        <View style={styles.innerRow}>
          <View style={styles.copy}>
            <Text style={styles.title}>More samples needed</Text>
            <Text style={styles.sub} numberOfLines={2}>
              Upload clearer portfolio images, an Instagram link, or more tattoo styles to continue.
            </Text>
          </View>
          {onPressAction ? (
            <Pressable onPress={onPressAction} style={styles.cta} accessibilityRole="button">
              <Text style={styles.ctaText}>{actionLabel ?? 'Update Profile'}</Text>
            </Pressable>
          ) : null}
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['rgba(122, 92, 255, 0.92)', 'rgba(0, 229, 255, 0.82)']} style={styles.shell}>
      <View style={styles.innerRow}>
        <View style={styles.copy}>
          <Text style={styles.title}>Verification rejected</Text>
          <Text style={styles.sub} numberOfLines={2}>
            {rejectReason?.trim() ? rejectReason.trim() : 'Please review and resubmit your details.'}
          </Text>
        </View>
        {onPressAction ? (
          <Pressable onPress={onPressAction} style={styles.cta} accessibilityRole="button">
            <Text style={styles.ctaText}>{actionLabel ?? 'Edit & Resubmit'}</Text>
          </Pressable>
        ) : null}
      </View>
    </LinearGradient>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    shell: {
      borderRadius: 18,
      padding: 1,
      marginHorizontal: 18,
      marginTop: 10,
    },
    inner: {
      borderRadius: 17,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: theme.mode === 'light' ? 'rgba(245, 247, 250, 0.92)' : 'rgba(11, 11, 15, 0.88)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.10)',
    },
    innerRow: {
      borderRadius: 17,
      paddingHorizontal: 14,
      paddingVertical: 12,
      backgroundColor: theme.mode === 'light' ? 'rgba(245, 247, 250, 0.92)' : 'rgba(11, 11, 15, 0.88)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.10)',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    copy: {
      flex: 1,
      gap: 2,
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.3,
    },
    sub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    cta: {
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 14,
      backgroundColor: theme.colors.accentStrong,
    },
    ctaText: {
      color: theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
  });

export default StatusBanner;
