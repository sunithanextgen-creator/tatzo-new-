import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../../../config/firebaseConfig';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import { brand } from '../../../theme/brand';
import GradientButton from '../../../components/ui/GradientButton';
import CalendarPickerModal from '../../../components/booking/CalendarPickerModal';
import { skinCheckerQuestions } from '../../../data/skinChecker';

type ArtistBookingsPanelProps = {
  header?: React.ReactNode;
};

type BookingRequestRow = {
  id: string; // notif id
  bookingId: string;
  fromUid?: string;
  fromName?: string;
  dateISO?: string;
  depositAmount?: number;
  createdAt?: any;
  read?: boolean;
};

type BookingDoc = {
  id: string;
  userUid: string;
  userEmail?: string | null;
  userName?: string | null;
  location?: string;
  dateISO?: string;
  depositAmount?: number;
  status?: string;
  skinFlag?: 'GREEN' | 'RED' | null;
  skinScore?: number | null;
  skinAnswers?: Record<string, string> | null;
};

type TabKey = 'requests' | 'confirmed';

const answerLabel = (qid: string, optId: string) => {
  const q = skinCheckerQuestions.find((x) => x.id === qid);
  if (!q) return optId;
  const opt = q.options.find((o) => o.id === optId);
  return opt?.label ?? optId;
};

const ArtistBookingsPanel = ({ header }: ArtistBookingsPanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [tab, setTab] = useState<TabKey>('requests');
  const [requests, setRequests] = useState<BookingRequestRow[]>([]);
  const [confirmed, setConfirmed] = useState<BookingDoc[]>([]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<BookingDoc | null>(null);
  const [busy, setBusy] = useState(false);

  const [calendarOpen, setCalendarOpen] = useState(false);
  const [proposedDate, setProposedDate] = useState<string>('');

  const uid = auth.currentUser?.uid ?? null;
  const artistName = auth.currentUser?.displayName ?? '';

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, 'users', uid, 'notifications'),
      where('type', '==', 'booking_request'),
      orderBy('createdAt', 'desc'),
      limit(40),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setRequests(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              bookingId: data.bookingId,
              fromUid: data.fromUid,
              fromName: data.fromName,
              dateISO: data.dateISO,
              depositAmount: data.depositAmount,
              createdAt: data.createdAt,
              read: data.read,
            } as BookingRequestRow;
          }),
        );
      },
      () => setRequests([]),
    );

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!artistName) return;
    const q = query(
      collection(db, 'bookings'),
      where('artistName', '==', artistName),
      where('status', 'in', ['confirmed', 'completed']),
      limit(50),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setConfirmed(
          snap.docs.map((d) => {
            const data = d.data() as any;
            return {
              id: d.id,
              userUid: data.userUid,
              userEmail: data.userEmail ?? null,
              userName: data.userName ?? null,
              location: data.location,
              dateISO: data.dateISO,
              depositAmount: data.depositAmount,
              status: data.status,
            } as BookingDoc;
          }),
        );
      },
      () => setConfirmed([]),
    );

    return () => unsub();
  }, [artistName]);

  const openDetail = async (row: BookingRequestRow) => {
    try {
      const snap = await getDoc(doc(db, 'bookings', row.bookingId));
      if (!snap.exists()) {
        Alert.alert('Tatzo', 'Booking not found.');
        return;
      }
      const data = snap.data() as any;
      setDetail({
        id: row.bookingId,
        userUid: data.userUid,
        userEmail: data.userEmail ?? null,
        userName: data.userName ?? null,
        location: data.location,
        dateISO: data.dateISO,
        depositAmount: data.depositAmount,
        status: data.status,
        skinFlag: data.skinFlag ?? null,
        skinScore: data.skinScore ?? null,
        skinAnswers: data.skinAnswers ?? null,
      });
      setProposedDate(data.dateISO ?? '');
      setDetailOpen(true);

      // Mark notif as read best-effort.
      if (uid) {
        void updateDoc(doc(db, 'users', uid, 'notifications', row.id), { read: true, updatedAt: serverTimestamp() }).catch(() => {});
      }
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not load booking.');
    }
  };

  const notifyUser = async (toUid: string, payload: any) => {
    const notifRef = doc(db, 'users', toUid, 'notifications', payload.id);
    await setDoc(
      notifRef,
      {
        ...payload,
        toUid,
        createdAt: serverTimestamp(),
        read: false,
      },
      { merge: true },
    );
  };

  const approve = async () => {
    if (!detail) return;
    if (busy) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'bookings', detail.id), {
        status: 'confirmed',
        confirmedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await notifyUser(detail.userUid, {
        id: `booking_confirmed_${detail.id}`,
        type: 'booking_confirmed',
        fromUid: uid,
        fromName: artistName || 'Artist',
        bookingId: detail.id,
        dateISO: detail.dateISO ?? null,
        depositAmount: detail.depositAmount ?? 249,
      });

      setDetailOpen(false);
      Alert.alert('Tatzo', 'Booking confirmed.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not confirm.');
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (!detail) return;
    if (busy) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'bookings', detail.id), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      });

      await notifyUser(detail.userUid, {
        id: `booking_declined_${detail.id}`,
        type: 'booking_declined',
        fromUid: uid,
        fromName: artistName || 'Artist',
        bookingId: detail.id,
        dateISO: detail.dateISO ?? null,
      });

      setDetailOpen(false);
      Alert.alert('Tatzo', 'Booking declined.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not decline.');
    } finally {
      setBusy(false);
    }
  };

  const proposeReschedule = async () => {
    if (!detail) return;
    if (!proposedDate) {
      Alert.alert('Tatzo', 'Pick a proposed date.');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'bookings', detail.id), {
        status: 'reschedule_proposed',
        proposedDateISO: proposedDate,
        updatedAt: serverTimestamp(),
      });

      await notifyUser(detail.userUid, {
        id: `reschedule_${detail.id}`,
        type: 'reschedule_proposed',
        fromUid: uid,
        fromName: artistName || 'Artist',
        bookingId: detail.id,
        proposedDateISO: proposedDate,
      });

      setDetailOpen(false);
      Alert.alert('Tatzo', 'Reschedule proposed.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not propose reschedule.');
    } finally {
      setBusy(false);
    }
  };

  const completeSession = async () => {
    if (!detail) return;
    if (busy) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'bookings', detail.id), {
        status: 'completed',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      await notifyUser(detail.userUid, {
        id: `session_completed_${detail.id}`,
        type: 'session_completed',
        fromUid: uid,
        fromName: artistName || 'Artist',
        bookingId: detail.id,
        dateISO: detail.dateISO ?? null,
      });

      setDetailOpen(false);
      Alert.alert('Tatzo', 'Session completed.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not complete session.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      {header ? <View>{header}</View> : null}

      <View style={styles.tabs}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => setTab('requests')} style={[styles.tabBtn, tab === 'requests' && styles.tabBtnActive]}>
          <Text style={[styles.tabText, tab === 'requests' && styles.tabTextActive]}>Requests</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.9} onPress={() => setTab('confirmed')} style={[styles.tabBtn, tab === 'confirmed' && styles.tabBtnActive]}>
          <Text style={[styles.tabText, tab === 'confirmed' && styles.tabTextActive]}>Confirmed</Text>
        </TouchableOpacity>
      </View>

      {tab === 'requests' ? (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 12 }}
          ListEmptyComponent={<Text style={styles.empty}>No booking requests yet.</Text>}
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.9} onPress={() => openDetail(item)} style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardTitle}>{item.fromName ?? 'Client'}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    Date: {item.dateISO ?? 'TBD'} | Deposit: Rs. {item.depositAmount ?? 249}
                  </Text>
                </View>
                <View style={styles.badge}>
                  <Ionicons name="sparkles-outline" size={14} color={brand.cyberPurple} />
                  <Text style={styles.badgeText}>REVIEW</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          data={confirmed}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120, gap: 12 }}
          ListEmptyComponent={<Text style={styles.empty}>No confirmed bookings yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardTitle}>{item.userName ?? item.userEmail ?? 'Client'}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>
                    Date: {item.dateISO ?? 'TBD'} | Status: {String(item.status).toUpperCase()}
                  </Text>
                </View>
                <View style={[styles.badge, styles.badgeConfirmed]}>
                  <Ionicons name="checkmark-circle-outline" size={14} color={brand.electricNeonBlue} />
                  <Text style={styles.badgeText}>LIVE</Text>
                </View>
              </View>
            </View>
          )}
        />
      )}

      <Modal visible={detailOpen} transparent animationType="fade" onRequestClose={() => setDetailOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setDetailOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>AI Report Review</Text>
            <Pressable onPress={() => setDetailOpen(false)} style={styles.iconBtn}>
              <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
            </Pressable>
          </View>

          {detail ? (
            <View style={styles.sheetBody}>
              <LinearGradient colors={theme.gradients.dark} style={styles.summary}>
                <Text style={styles.summaryTitle}>{detail.userName ?? 'Client'}</Text>
                <Text style={styles.summarySub} numberOfLines={2}>
                  {detail.userEmail ?? ''} {detail.location ? `| ${detail.location}` : ''}
                </Text>
                <Text style={styles.summarySub}>Date: {detail.dateISO ?? 'TBD'}</Text>
              </LinearGradient>

              <View style={[styles.flagCard, detail.skinFlag === 'GREEN' ? styles.flagGreen : styles.flagRed]}>
                <Text style={styles.flagText}>{detail.skinFlag ?? 'GREEN'}</Text>
                <Text style={styles.flagSub}>Score: {detail.skinScore ?? 0}</Text>
              </View>

              <View style={styles.answersCard}>
                <Text style={styles.answersTitle}>Skin Answers</Text>
                {detail.skinAnswers ? (
                  Object.entries(detail.skinAnswers).map(([qid, opt]) => (
                    <View key={qid} style={styles.answerRow}>
                      <Text style={styles.answerQ} numberOfLines={1}>{qid}</Text>
                      <Text style={styles.answerA} numberOfLines={2}>{answerLabel(qid, opt)}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.emptySmall}>No answers found.</Text>
                )}
              </View>

              <View style={styles.actionsRow}>
                <TouchableOpacity activeOpacity={0.9} disabled={busy} onPress={decline} style={styles.secondaryBtn}>
                  <Ionicons name="close-circle-outline" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
                  <Text style={styles.secondaryText}>Decline</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <GradientButton title={busy ? '...' : 'Accept'} onPress={approve} size="md" />
                </View>
              </View>

              <TouchableOpacity activeOpacity={0.9} onPress={() => setCalendarOpen(true)} style={styles.reschedBtn}>
                <Ionicons name="swap-horizontal-outline" size={18} color={theme.colors.accent} />
                <Text style={styles.reschedText}>Propose reschedule</Text>
                <Text style={styles.reschedDate}>{proposedDate || 'Pick date'}</Text>
              </TouchableOpacity>

              <View style={styles.actionsRow}>
                <TouchableOpacity activeOpacity={0.9} disabled={busy} onPress={completeSession} style={styles.secondaryBtn}>
                  <Ionicons name="ribbon-outline" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
                  <Text style={styles.secondaryText}>Complete</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                  <GradientButton title={busy ? '...' : 'Send reschedule'} onPress={proposeReschedule} size="md" />
                </View>
              </View>

              <CalendarPickerModal
                visible={calendarOpen}
                initialDateISO={proposedDate || detail.dateISO || ''}
                onSelect={(next) => setProposedDate(next)}
                onClose={() => setCalendarOpen(false)}
              />
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    tabs: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    tabBtn: {
      flex: 1,
      borderRadius: 16,
      paddingVertical: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    tabBtnActive: {
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.28)' : 'rgba(122, 92, 255, 0.36)',
      backgroundColor: theme.colors.accentSoft,
    },
    tabText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
      letterSpacing: 0.4,
    },
    tabTextActive: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
    },
    empty: {
      color: theme.colors.textMuted,
      paddingTop: 22,
      fontSize: 13,
      textAlign: 'center',
    },
    emptySmall: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      paddingTop: 6,
    },
    card: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
      padding: 14,
      gap: 12,
    },
    cardTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    cardMeta: {
      flex: 1,
      gap: 6,
    },
    cardTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    cardSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    badge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.22)' : 'rgba(122, 92, 255, 0.3)',
      backgroundColor: theme.colors.accentSoft,
    },
    badgeConfirmed: {
      borderColor: theme.mode === 'light' ? 'rgba(0, 229, 255, 0.22)' : 'rgba(0, 229, 255, 0.28)',
    },
    badgeText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
      position: 'absolute',
      left: 14,
      right: 14,
      top: 92,
      bottom: 14,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
      overflow: 'hidden',
      maxWidth: 560,
      alignSelf: 'center',
    },
    sheetHeader: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    sheetTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    sheetBody: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    summary: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      gap: 6,
      backgroundColor: theme.colors.surface,
    },
    summaryTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
    },
    summarySub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    flagCard: {
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 12,
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
    },
    flagGreen: {
      borderColor: 'rgba(46, 160, 67, 0.35)',
      backgroundColor: 'rgba(46, 160, 67, 0.12)',
    },
    flagRed: {
      borderColor: 'rgba(232, 71, 63, 0.35)',
      backgroundColor: 'rgba(232, 71, 63, 0.12)',
    },
    flagText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
    flagSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    answersCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 10,
      maxHeight: 240,
    },
    answersTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    answerRow: {
      gap: 4,
    },
    answerQ: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    answerA: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 18,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
    },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      minWidth: 120,
    },
    secondaryText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.3,
    },
    reschedBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.22)' : 'rgba(122, 92, 255, 0.3)',
      backgroundColor: theme.colors.accentSoft,
    },
    reschedText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
    },
    reschedDate: {
      marginLeft: 'auto',
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
  });

export default ArtistBookingsPanel;
