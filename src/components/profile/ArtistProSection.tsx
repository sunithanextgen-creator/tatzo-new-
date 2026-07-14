import React, { useMemo } from 'react';

import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { UserProfile, UserRole } from '../../types/app';

type ArtistProSectionProps = {
  uid: string | null;
  role: UserRole;
  profile: UserProfile | null;
  onPatchProfile: (patch: Partial<UserProfile>) => void;
};

const statusCopy = (status: UserProfile['verificationStatus']): { label: string; tone: 'muted' | 'good' | 'warn' } => {
  if (status === 'approved') return { label: 'VERIFIED', tone: 'good' };
  if (status === 'pending') return { label: 'PENDING', tone: 'warn' };
  if (status === 'rejected') return { label: 'REJECTED', tone: 'warn' };
  return { label: 'UNSUBMITTED', tone: 'muted' };
};

const ArtistProSection = ({ uid, role, profile }: ArtistProSectionProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  if (!uid) return null;
  if (role !== 'artist' && role !== 'dealer') return null;

  const v = statusCopy(profile?.verificationStatus ?? 'unsubmitted');
  const verifyLabel = role === 'dealer' ? 'Authorized Seller' : 'Verified Pro';
  const subscriptionStatus = profile?.subscriptionStatus === 'active' ? 'ACTIVE' : 'PENDING';
  const payoutStatus = (profile?.payoutStatus ?? 'unconfigured').toUpperCase();

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Pro Tools</Text>

      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.accent} />
            <Text style={styles.cardTitle}>{verifyLabel}</Text>
          </View>
          <View style={[styles.pill, v.tone === 'good' ? styles.pillGood : v.tone === 'warn' ? styles.pillWarn : styles.pillMuted]}>
            <Text style={styles.pillText}>{v.label}</Text>
          </View>
        </View>

        <Text style={styles.cardSub} numberOfLines={2}>
          Verification and compliance status from admin review.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="sparkles-outline" size={18} color={theme.colors.accent} />
            <Text style={styles.cardTitle}>Launch Access</Text>
          </View>
          <Text style={styles.miniValue}>{subscriptionStatus}</Text>
        </View>

        <Text style={styles.cardSub} numberOfLines={3}>
          Approved artists keep full access during launch. No subscription paywall is required.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="cash-outline" size={18} color={theme.colors.accent} />
            <Text style={styles.cardTitle}>Payout Setup</Text>
          </View>
          <Text style={styles.miniValue}>{payoutStatus}</Text>
        </View>

        <Text style={styles.cardSub} numberOfLines={3}>
          Payout onboarding is controlled via secure backend and admin approval flow.
        </Text>
      </View>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    section: {
      gap: 10,
    },
    sectionTitle: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      paddingHorizontal: 2,
    },
    card: {
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 18,
      paddingHorizontal: 12,
      paddingVertical: 12,
      backgroundColor: theme.colors.surface,
      gap: 10,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    cardTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      flex: 1,
    },
    cardTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.2,
    },
    miniValue: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    cardSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    pill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
    },
    pillMuted: {
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
      borderColor: theme.colors.border,
    },
    pillWarn: {
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.12)' : 'rgba(122, 92, 255, 0.18)',
      borderColor: 'rgba(122, 92, 255, 0.45)',
    },
    pillGood: {
      backgroundColor: theme.mode === 'light' ? 'rgba(0, 229, 255, 0.12)' : 'rgba(0, 229, 255, 0.16)',
      borderColor: 'rgba(0, 229, 255, 0.45)',
    },
    pillText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
    },
  });

export default ArtistProSection;
