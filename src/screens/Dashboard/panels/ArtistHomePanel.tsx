import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getCountFromServer, getDoc, query, where } from 'firebase/firestore';
import { auth, db } from '../../../config/firebaseConfig';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import type { DealerRequestStatus } from '../../../types/app';
import SocioFeedPanel from './SocioFeedPanel';

type ArtistHomePanelProps = {
  header?: React.ReactNode;
  onOpenPost: () => void;
  onOpenBooking: () => void;
  onOpenSetting: () => void;
};

type KpiRow = {
  key: string;
  label: string;
  value: string;
};

type HomeViewMode = 'overview' | 'feed';

const todayISO = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const dealerLabel = (status: DealerRequestStatus | undefined) => {
  if (status === 'approved') return 'Approved';
  if (status === 'pending') return 'Pending';
  if (status === 'rejected') return 'Rejected';
  return 'Not requested';
};

const ArtistHomePanel = ({ header, onOpenPost, onOpenBooking, onOpenSetting }: ArtistHomePanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const uid = auth.currentUser?.uid ?? '';
  const [viewMode, setViewMode] = useState<HomeViewMode>('feed');
  const [pendingCount, setPendingCount] = useState(0);
  const [todayCount, setTodayCount] = useState(0);
  const [postCount, setPostCount] = useState(0);
  const [dealerStatus, setDealerStatus] = useState<DealerRequestStatus>('unsubmitted');

  useEffect(() => {
    if (!uid) return;
    let active = true;
    (async () => {
      try {
        const now = todayISO();
        const [pendingSnap, todaySnap, postSnap, userSnap] = await Promise.all([
          getCountFromServer(query(collection(db, 'bookings'), where('artistUid', '==', uid), where('status', '==', 'pending_artist_approval'))),
          getCountFromServer(query(collection(db, 'bookings'), where('artistUid', '==', uid), where('dateISO', '==', now), where('status', 'in', ['confirmed', 'artist_approved_payment_pending', 'pending_artist_approval']))),
          getCountFromServer(query(collection(db, 'posts'), where('artistUid', '==', uid), where('status', '==', 'active'))),
          getDoc(doc(db, 'users', uid)),
        ]);

        if (!active) return;
        setPendingCount(pendingSnap.data().count);
        setTodayCount(todaySnap.data().count);
        setPostCount(postSnap.data().count);
        setDealerStatus((userSnap.data()?.dealerRequestStatus ?? 'unsubmitted') as DealerRequestStatus);
      } catch {
        if (!active) return;
        setPendingCount(0);
        setTodayCount(0);
        setPostCount(0);
        setDealerStatus('unsubmitted');
      }
    })();

    return () => {
      active = false;
    };
  }, [uid]);

  const kpis = useMemo<KpiRow[]>(
    () => [
      { key: 'pending', label: 'Pending bookings', value: String(pendingCount) },
      { key: 'today', label: 'Today bookings', value: String(todayCount) },
      { key: 'posts', label: 'Total posts', value: String(postCount) },
      { key: 'dealer', label: 'Dealer request', value: dealerLabel(dealerStatus) },
    ],
    [pendingCount, todayCount, postCount, dealerStatus],
  );

  const viewToggle = (
    <View style={styles.modeRow}>
      <Pressable style={[styles.modeBtn, viewMode === 'feed' && styles.modeBtnActive]} onPress={() => setViewMode('feed')}>
        <Ionicons name="flash-outline" size={14} color={viewMode === 'feed' ? theme.colors.accentStrong : theme.colors.textMuted} />
        <Text style={[styles.modeLabel, viewMode === 'feed' && styles.modeLabelActive]}>Socio Feed</Text>
      </Pressable>
      <Pressable style={[styles.modeBtn, viewMode === 'overview' && styles.modeBtnActive]} onPress={() => setViewMode('overview')}>
        <Ionicons name="grid-outline" size={14} color={viewMode === 'overview' ? theme.colors.accentStrong : theme.colors.textMuted} />
        <Text style={[styles.modeLabel, viewMode === 'overview' && styles.modeLabelActive]}>Overview</Text>
      </Pressable>
    </View>
  );

  if (viewMode === 'feed') {
    return (
      <SocioFeedPanel
        hideSearchBar
        header={
          <View style={styles.feedHeaderWrap}>
            {header ? <View style={styles.externalHeader}>{header}</View> : null}
            {viewToggle}
          </View>
        }
      />
    );
  }

  return (
    <FlatList
      data={kpis}
      keyExtractor={(item) => item.key}
      numColumns={2}
      columnWrapperStyle={styles.kpiRow}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.headWrap}>
          {header ? <View style={styles.externalHeader}>{header}</View> : null}
          {viewToggle}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Home</Text>
            <Text style={styles.sectionBadge}>Artist</Text>
          </View>

          <Text style={styles.sectionSub}>Track bookings, posts, and profile progress.</Text>

          <View style={styles.quickRow}>
            <Pressable style={styles.quickBtn} onPress={() => setViewMode('feed')}>
              <Ionicons name="sparkles-outline" size={18} color={theme.colors.accentStrong} />
              <Text style={styles.quickText}>Open feed</Text>
            </Pressable>

            <Pressable style={styles.quickBtn} onPress={onOpenPost}>
              <Ionicons name="add-circle-outline" size={18} color={theme.colors.accentStrong} />
              <Text style={styles.quickText}>Create post</Text>
            </Pressable>

            <Pressable style={styles.quickBtn} onPress={onOpenBooking}>
              <Ionicons name="calendar-outline" size={18} color={theme.colors.accentStrong} />
              <Text style={styles.quickText}>View requests</Text>
            </Pressable>
          </View>
          <Pressable style={styles.fullBtn} onPress={onOpenSetting}>
            <Ionicons name="person-circle-outline" size={18} color={theme.colors.accentStrong} />
            <Text style={styles.fullBtnText}>Complete profile</Text>
          </Pressable>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.kpiCard}>
          <Text style={styles.kpiValue}>{item.value}</Text>
          <Text style={styles.kpiLabel}>{item.label}</Text>
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Nothing to show yet</Text>
          <Text style={styles.empty}>Post your first piece, check booking requests, or update profile details to populate this dashboard.</Text>
          <View style={styles.emptyActions}>
            <TouchableOpacity activeOpacity={0.9} style={styles.emptyBtn} onPress={onOpenPost}>
              <Text style={styles.emptyBtnText}>Create post</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.9} style={[styles.emptyBtn, styles.emptyBtnSecondary]} onPress={onOpenBooking}>
              <Text style={styles.emptyBtnText}>Check bookings</Text>
            </TouchableOpacity>
          </View>
        </View>
      }
      showsVerticalScrollIndicator={false}
    />
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 120,
      gap: 12,
    },
    headWrap: {
      gap: 10,
      marginBottom: 2,
    },
    feedHeaderWrap: {
      gap: 12,
    },
    externalHeader: {
      gap: 12,
    },
    modeRow: {
      flexDirection: 'row',
      gap: 8,
    },
    modeBtn: {
      flex: 1,
      minHeight: 38,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 10,
    },
    modeBtnActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    modeLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
    },
    modeLabelActive: {
      color: theme.colors.accentStrong,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 18,
      fontFamily: theme.fonts.display,
    },
    sectionBadge: {
      color: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      fontSize: 11,
      fontWeight: '700',
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.28)' : 'rgba(122, 92, 255, 0.3)',
    },
    sectionSub: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '700',
    },
    quickRow: {
      flexDirection: 'row',
      gap: 10,
    },
    quickBtn: {
      flex: 1,
      minHeight: 52,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      paddingHorizontal: 6,
      paddingVertical: 8,
    },
    quickText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '800',
      textAlign: 'center',
    },
    fullBtn: {
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 10,
    },
    fullBtnText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '800',
    },
    kpiRow: {
      gap: 12,
    },
    kpiCard: {
      flex: 1,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingVertical: 14,
      paddingHorizontal: 11,
      minHeight: 90,
      justifyContent: 'center',
      gap: 6,
    },
    kpiValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 20,
      fontWeight: '900',
    },
    kpiLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    emptyWrap: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 18,
      gap: 10,
      alignItems: 'center',
    },
    emptyTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 16,
      fontWeight: '900',
    },
    empty: {
      color: theme.colors.textMuted,
      textAlign: 'center',
      lineHeight: 18,
      fontSize: 12,
      fontWeight: '700',
    },
    emptyActions: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
      justifyContent: 'center',
    },
    emptyBtn: {
      minHeight: 42,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.24)' : 'rgba(122, 92, 255, 0.28)',
      backgroundColor: theme.colors.accentSoft,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyBtnSecondary: {
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(255, 255, 255, 0.06)',
    },
    emptyBtnText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
  });

export default ArtistHomePanel;
