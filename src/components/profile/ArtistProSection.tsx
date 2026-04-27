import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../config/firebaseConfig';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { UserProfile, UserRole } from '../../types/app';
import { syncUserProfile } from '../../services/userProfile';

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

const ArtistProSection = ({ uid, role, profile, onPatchProfile }: ArtistProSectionProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [updating, setUpdating] = useState(false);

  if (!uid) return null;
  if (role !== 'artist' && role !== 'dealer') return null;

  const v = statusCopy(profile?.verificationStatus ?? 'unsubmitted');
  const verifyLabel = role === 'dealer' ? 'Authorized Seller' : 'Verified Pro';

  const handleActivatePro = async () => {
    if (!auth.currentUser) return;
    setUpdating(true);
    try {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await syncUserProfile(auth.currentUser, {
        subscriptionStatus: 'active',
        subscriptionPlan: 'tatzo_pro',
        subscriptionExpiresAt: expiresAt,
      });
      onPatchProfile({ subscriptionStatus: 'active', subscriptionPlan: 'tatzo_pro', subscriptionExpiresAt: expiresAt });
      Alert.alert('Tatzo', 'Tatzo Pro activated (simulated).');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not update subscription.');
    } finally {
      setUpdating(false);
    }
  };

  const handleMarkPayoutReady = async () => {
    if (!auth.currentUser) return;
    setUpdating(true);
    try {
      await syncUserProfile(auth.currentUser, { payoutStatus: 'ready' });
      onPatchProfile({ payoutStatus: 'ready' });
      Alert.alert('Tatzo', 'Payout setup marked ready (simulated).');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not update payout setup.');
    } finally {
      setUpdating(false);
    }
  };

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
          Verification is approved by admin. If you need changes, contact support.
        </Text>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="sparkles-outline" size={18} color={theme.colors.accent} />
            <Text style={styles.cardTitle}>Subscription</Text>
          </View>
          <Text style={styles.miniValue}>{profile?.subscriptionStatus === 'active' ? 'ACTIVE' : 'INACTIVE'}</Text>
        </View>

        <Text style={styles.cardSub} numberOfLines={2}>
          Tatzo Pro (Rs.1499/month) will be enabled later with real payments. For now, this is simulated.
        </Text>

        <View style={styles.cardActions}>
          <Pressable disabled={updating} onPress={handleActivatePro} style={[styles.smallBtn, updating && styles.smallBtnDisabled]}>
            {updating ? <ActivityIndicator color={theme.colors.textInverse} /> : <Text style={styles.smallBtnText}>Activate (Simulated)</Text>}
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.cardTitleRow}>
            <Ionicons name="cash-outline" size={18} color={theme.colors.accent} />
            <Text style={styles.cardTitle}>Payout Setup</Text>
          </View>
          <Text style={styles.miniValue}>{profile?.payoutStatus ?? 'unconfigured'}</Text>
        </View>

        <Text style={styles.cardSub} numberOfLines={2}>
          Razorpay onboarding needs a secure backend. We'll wire it after you host the server.
        </Text>

        <View style={styles.cardActions}>
          <Pressable disabled={updating} onPress={handleMarkPayoutReady} style={[styles.smallBtn, updating && styles.smallBtnDisabled]}>
            {updating ? <ActivityIndicator color={theme.colors.textInverse} /> : <Text style={styles.smallBtnText}>Mark Ready (Simulated)</Text>}
          </Pressable>
        </View>
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
    cardActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    smallBtn: {
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      backgroundColor: theme.colors.accentStrong,
    },
    smallBtnDisabled: {
      opacity: 0.65,
    },
    smallBtnText: {
      color: theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
  });

export default ArtistProSection;
