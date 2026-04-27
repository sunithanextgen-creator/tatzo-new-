import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

type NotificationType =
  | 'like'
  | 'share'
  | 'follow'
  | 'booking_request'
  | 'booking_confirmed'
  | 'booking_declined'
  | 'reschedule_proposed'
  | 'session_completed'
  | 'verification_approved'
  | 'verification_rejected';

type NotificationRow = {
  id: string;
  type: NotificationType;
  fromName?: string;
  fromUid?: string;
  postPreview?: string | null;
  bookingId?: string;
  dateISO?: string;
  proposedDateISO?: string;
  depositAmount?: number;
  reason?: string;
  createdAt?: any;
  read?: boolean;
};

type NotificationsModalProps = {
  visible: boolean;
  uid: string | null;
  onClose: () => void;
};

const labelFor = (n: NotificationRow) => {
  const who = n.fromName ?? 'Someone';
  if (n.type === 'booking_request') return `${who} requested a booking`;
  if (n.type === 'booking_confirmed') return `${who} confirmed your booking`;
  if (n.type === 'booking_declined') return `${who} declined your booking`;
  if (n.type === 'reschedule_proposed') return `${who} proposed a new date`;
  if (n.type === 'session_completed') return `${who} marked your session completed`;
  if (n.type === 'verification_approved') return `Your verification was approved`;
  if (n.type === 'verification_rejected') return `Your verification was rejected`;
  if (n.type === 'follow') return `${who} followed you`;
  if (n.type === 'share') return `${who} shared your post`;
  return `${who} liked your post`;
};

const iconFor = (type: NotificationType): keyof typeof Ionicons.glyphMap => {
  if (type === 'booking_request') return 'calendar-outline';
  if (type === 'booking_confirmed') return 'checkmark-circle-outline';
  if (type === 'booking_declined') return 'close-circle-outline';
  if (type === 'reschedule_proposed') return 'swap-horizontal-outline';
  if (type === 'session_completed') return 'ribbon-outline';
  if (type === 'verification_approved') return 'shield-checkmark-outline';
  if (type === 'verification_rejected') return 'shield-outline';
  if (type === 'follow') return 'person-add-outline';
  if (type === 'share') return 'share-social-outline';
  return 'heart-outline';
};

const NotificationsModal = ({ visible, uid, onClose }: NotificationsModalProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [items, setItems] = useState<NotificationRow[]>([]);

  useEffect(() => {
    if (!visible || !uid) return;

    const q = query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(30));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs.map((docSnap) => {
            const data = docSnap.data() as any;
            return {
              id: docSnap.id,
              type: data.type,
              fromName: data.fromName,
              fromUid: data.fromUid,
              postPreview: data.postPreview ?? null,
              bookingId: data.bookingId,
              dateISO: data.dateISO,
              proposedDateISO: data.proposedDateISO,
              depositAmount: data.depositAmount,
              reason: data.reason,
              createdAt: data.createdAt,
              read: data.read,
            } as NotificationRow;
          }),
        );
      },
      () => {
        setItems([]);
      },
    );

    return () => unsub();
  }, [uid, visible]);

  const renderSubline = (item: NotificationRow) => {
    if (item.type === 'reschedule_proposed' && item.proposedDateISO) {
      return (
        <Text style={styles.rowSub} numberOfLines={1}>
          Proposed: {item.proposedDateISO}
        </Text>
      );
    }

    if (
      (item.type === 'booking_request' || item.type === 'booking_confirmed' || item.type === 'booking_declined') &&
      item.dateISO
    ) {
      return (
        <Text style={styles.rowSub} numberOfLines={1}>
          Date: {item.dateISO} | Deposit: Rs. {item.depositAmount ?? 249}
        </Text>
      );
    }

    if (item.postPreview) {
      return (
        <Text style={styles.rowSub} numberOfLines={1}>
          {item.postPreview}
        </Text>
      );
    }
    if (item.type === 'verification_rejected' && item.reason) {
      return (
        <Text style={styles.rowSub} numberOfLines={2}>
          Reason: {item.reason}
        </Text>
      );
    }

    return null;
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Notifications</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
          </Pressable>
        </View>

        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}
          ListEmptyComponent={<Text style={styles.empty}>No notifications yet.</Text>}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.iconWrap}>
                <Ionicons name={iconFor(item.type)} size={18} color={theme.colors.accentStrong} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.rowTitle}>{labelFor(item)}</Text>
                {renderSubline(item)}
              </View>
            </View>
          )}
        />
      </View>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
      position: 'absolute',
      left: 14,
      right: 14,
      top: 84,
      bottom: 90,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
      overflow: 'hidden',
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
    closeBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    empty: {
      color: theme.colors.textMuted,
      paddingHorizontal: 14,
      paddingTop: 18,
      fontSize: 13,
      textAlign: 'center',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.22)' : 'rgba(122, 92, 255, 0.3)',
    },
    copy: {
      flex: 1,
      gap: 4,
    },
    rowTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    rowSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
    },
  });

export default NotificationsModal;










