import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { auth } from '../../config/firebaseConfig';
import { signOutAndCleanup } from '../../services/signout';
import { UserRole } from '../../types/app';
import { createResponsiveShadow } from '../../utils/responsiveShadow';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

type DashboardMetric = {
  label: string;
  value: string;
};

type DashboardAction = {
  label: string;
  detail: string;
};

type DashboardContent = {
  eyebrow: string;
  title: string;
  body: string;
  primaryAction: string;
  summaryTitle: string;
  metrics: DashboardMetric[];
  actions: DashboardAction[];
};

const DASHBOARD_COPY: Record<UserRole, DashboardContent> = {
  user: {
    eyebrow: 'Collector Workspace',
    title: 'Find the right artist and keep every booking detail in one calm flow.',
    body: 'This dashboard is tuned for discovery, appointment planning, reference saving, and aftercare follow-up.',
    primaryAction: 'Explore recommended artists',
    summaryTitle: 'Your next steps',
    metrics: [
      { label: 'Saved references', value: '24' },
      { label: 'Open consults', value: '3' },
      { label: 'Aftercare reminders', value: '2' },
    ],
    actions: [
      { label: 'Discovery queue', detail: 'Surface artists by style, location, and availability.' },
      { label: 'Consultation planner', detail: 'Compare notes, prep advice, and expected timelines.' },
      { label: 'Healing timeline', detail: 'Track reminders, aftercare products, and follow-up nudges.' },
    ],
  },
  artist: {
    eyebrow: 'Artist Workspace',
    title: 'Run a portfolio-first business with cleaner intake, scheduling, and client follow-through.',
    body: 'This dashboard anchors your booking pipeline, consultation status, and social proof for new leads.',
    primaryAction: 'Review incoming consultations',
    summaryTitle: 'Studio priorities',
    metrics: [
      { label: 'New leads', value: '12' },
      { label: 'Confirmed sessions', value: '8' },
      { label: 'Portfolio saves', value: '164' },
    ],
    actions: [
      { label: 'Lead triage', detail: 'Sort clients by style fit, budget, and readiness to book.' },
      { label: 'Calendar sync', detail: 'Hold slots, confirm consults, and reduce drop-off.' },
      { label: 'Trust signals', detail: 'Keep healed work, reviews, and prep guidance visible.' },
    ],
  },
  dealer: {
    eyebrow: 'Dealer Workspace',
    title: 'Support studios with a polished inventory and a clearer path from interest to repeat order.',
    body: 'This dashboard is focused on product visibility, inbound requests, and relationship health with artists.',
    primaryAction: 'Open partner orders',
    summaryTitle: 'Commerce overview',
    metrics: [
      { label: 'Open orders', value: '17' },
      { label: 'Low stock alerts', value: '5' },
      { label: 'Active studio partners', value: '29' },
    ],
    actions: [
      { label: 'Catalog highlights', detail: 'Push featured machines, inks, and aftercare essentials.' },
      { label: 'Studio reorders', detail: 'Reduce friction for repeat purchasing and bundle discovery.' },
      { label: 'Partner insights', detail: 'See which studios engage most with launches and promotions.' },
    ],
  },
};

type RoleDashboardScreenProps = {
  role: UserRole;
};

const RoleDashboardScreen = ({ role }: RoleDashboardScreenProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const content = useMemo(() => DASHBOARD_COPY[role], [role]);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      await signOutAndCleanup({ deleteProfile: false });
    } catch (error) {
      console.error('TATZO: sign out failed', error);
      Alert.alert('Tatzo', 'Could not sign out right now. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={theme.gradients.canvas} style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.headerRow}>
            <View>
              <Text style={styles.eyebrow}>{content.eyebrow}</Text>
              <Text style={styles.brand}>TATZO</Text>
            </View>
            {role !== 'dealer' ? (
              <TouchableOpacity activeOpacity={0.9} onPress={handleSignOut} style={styles.signOutButton}>
                <Text style={styles.signOutText}>{isSigningOut ? 'Signing out...' : 'Sign out'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <LinearGradient colors={theme.gradients.dark} style={styles.heroCard}>
            <Text style={styles.heroTitle}>{content.title}</Text>
            <Text style={styles.heroBody}>{content.body}</Text>
            <TouchableOpacity activeOpacity={0.9} style={styles.heroAction}>
              <Text style={styles.heroActionText}>{content.primaryAction}</Text>
            </TouchableOpacity>
          </LinearGradient>

          <View style={styles.metricsRow}>
            {content.metrics.map((metric) => (
              <View key={metric.label} style={styles.metricCard}>
                <Text style={styles.metricValue}>{metric.value}</Text>
                <Text style={styles.metricLabel}>{metric.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{content.summaryTitle}</Text>
            <Text style={styles.sectionBadge}>Live</Text>
          </View>

          <View style={styles.actionList}>
            {content.actions.map((action) => (
              <View key={action.label} style={styles.actionCard}>
                <Text style={styles.actionTitle}>{action.label}</Text>
                <Text style={styles.actionDetail}>{action.detail}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 24,
      paddingTop: 18,
      paddingBottom: 48,
      gap: 22,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
    },
    eyebrow: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 2.2,
      textTransform: 'uppercase',
    },
    brand: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 34,
      marginTop: 6,
      fontFamily: theme.fonts.display,
    },
    signOutButton: {
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(255, 255, 255, 0.1)',
      borderRadius: theme.radius.pill,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    signOutText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '700',
    },
    heroCard: {
      borderRadius: 30,
      padding: 24,
      gap: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...createResponsiveShadow({
        web: theme.mode === 'light' ? '0px 18px 32px rgba(5, 10, 20, 0.12)' : '0px 18px 32px rgba(5, 10, 20, 0.22)',
        native: {
          shadowColor: theme.mode === 'light' ? 'rgba(5, 10, 20, 0.18)' : theme.colors.shadow,
          shadowOffset: { width: 0, height: 18 },
          shadowOpacity: theme.mode === 'light' ? 0.12 : 0.22,
          shadowRadius: 32,
          elevation: 10,
        },
      }),
    },
    heroTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 30,
      lineHeight: 36,
      fontFamily: theme.fonts.display,
    },
    heroBody: {
      color: theme.colors.textMuted,
      fontSize: 15,
      lineHeight: 24,
      maxWidth: 310,
    },
    heroAction: {
      alignSelf: 'flex-start',
      backgroundColor: theme.colors.accentSoft,
      borderRadius: theme.radius.pill,
      paddingHorizontal: 16,
      paddingVertical: 12,
      marginTop: 6,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.22)' : 'rgba(122, 92, 255, 0.3)',
    },
    heroActionText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '700',
    },
    metricsRow: {
      flexDirection: 'row',
      gap: 12,
    },
    metricCard: {
      flex: 1,
      backgroundColor: theme.mode === 'light' ? theme.colors.surface : 'rgba(255, 255, 255, 0.06)',
      borderRadius: 22,
      paddingVertical: 18,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 6,
    },
    metricValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 24,
      fontFamily: theme.fonts.display,
    },
    metricLabel: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 18,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 24,
      fontFamily: theme.fonts.display,
    },
    sectionBadge: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 1.8,
      textTransform: 'uppercase',
    },
    actionList: {
      gap: 14,
    },
    actionCard: {
      backgroundColor: theme.mode === 'light' ? theme.colors.surface : 'rgba(255, 255, 255, 0.05)',
      borderRadius: 24,
      padding: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 8,
    },
    actionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 16,
      fontWeight: '800',
    },
    actionDetail: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 20,
    },
  });

export default RoleDashboardScreen;




