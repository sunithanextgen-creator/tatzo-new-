import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { markNotificationReadDual } from '../../services/notifications';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { NotificationDoc, NotificationType } from '../../types/app';

type NotificationRow = NotificationDoc;

type NotificationsModalProps = {
  visible: boolean;
  uid: string | null;
  onClose: () => void;
  onPressItem?: (item: NotificationRow) => void;
};

const labelFor = (n: NotificationRow) => {
  if (n.title?.trim()) return n.title.trim();

  const who = n.fromName ?? 'Someone';
  if (n.type === 'booking_requested') return `${who} requested a booking`;
  if (n.type === 'booking_artist_approved_payment_pending') return 'Artist approved your booking';
  if (n.type === 'booking_quote_sent') return 'Artist quote is ready';
  if (n.type === 'booking_rejected') return `${who} rejected a booking`;
  if (n.type === 'booking_reminder') return 'Booking reminder';
  if (n.type === 'payment_success') return 'Collected Amount Recorded';
  if (n.type === 'final_payment_requested') return 'Collected amount shared';
  if (n.type === 'final_payment_user_marked_paid') return 'User marked collected amount paid';
  if (n.type === 'final_payment_disputed') return 'Final payment issue';
  if (n.type === 'final_payment_success') return 'Revenue tracking updated';
  if (n.type === 'booking_confirmed') return 'Booking confirmed';
  if (n.type === 'booking_cancelled') return 'Booking cancelled';
  if (n.type === 'booking_reschedule_requested') return 'Reschedule requested';
  if (n.type === 'booking_reschedule_accepted') return 'Reschedule accepted';
  if (n.type === 'booking_reschedule_rejected') return 'Reschedule rejected';
  if (n.type === 'revenue_tracking') return 'Revenue tracking update';
  if (n.type === 'subscription_update') return 'Subscription update';
  if (n.type === 'system_message') return 'System message';
  if (n.type === 'dealer_request_submitted') return 'Dealer request submitted';
  if (n.type === 'dealer_request_approved') return 'Dealer request approved';
  if (n.type === 'dealer_request_rejected') return 'Dealer request rejected';
  if (n.type === 'post_created') return `${who} published a post`;
  if (n.type === 'inquiry') return `${who} sent an inquiry`;

  if (n.type === 'booking_request') return `${who} requested a booking`;
  if (n.type === 'booking_declined') return `${who} declined your booking`;
  if (n.type === 'reschedule_proposed') return `${who} proposed a new date`;
  if (n.type === 'session_completed') return `${who} marked your session completed`;
  if (n.type === 'verification_approved') return 'Your verification was approved';
  if (n.type === 'verification_needs_more_samples') return 'More samples needed';
  if (n.type === 'verification_rejected') return 'Your verification was rejected';
  if (n.type === 'follow') return `${who} followed you`;
  if (n.type === 'share') return `${who} shared your post`;
  return `${who} liked your post`;
};

const iconFor = (type: NotificationType): keyof typeof Ionicons.glyphMap => {
  if (type === 'booking_requested' || type === 'booking_request') return 'calendar-outline';
  if (type === 'booking_quote_sent') return 'pricetag-outline';
  if (type === 'booking_quote_expired') return 'timer-outline';
  if (type === 'booking_artist_approved_payment_pending') return 'card-outline';
  if (type === 'booking_reminder') return 'alarm-outline';
  if (type === 'payment_success' || type === 'final_payment_success' || type === 'subscription_update') return 'checkmark-done-circle-outline';
  if (type === 'final_payment_disputed') return 'warning-outline';
  if (type === 'final_payment_requested' || type === 'final_payment_user_marked_paid' || type === 'revenue_tracking') return 'cash-outline';
  if (type === 'booking_confirmed') return 'checkmark-circle-outline';
  if (type === 'booking_rejected' || type === 'booking_declined') return 'close-circle-outline';
  if (type === 'booking_cancelled') return 'remove-circle-outline';
  if (type === 'reschedule_proposed' || type === 'booking_reschedule_requested' || type === 'booking_reschedule_accepted' || type === 'booking_reschedule_rejected') return 'swap-horizontal-outline';
  if (type === 'session_completed') return 'ribbon-outline';
  if (type === 'system_message') return 'notifications-outline';
  if (type === 'verification_approved' || type === 'dealer_request_approved') return 'shield-checkmark-outline';
  if (type === 'verification_needs_more_samples') return 'images-outline';
  if (type === 'verification_rejected' || type === 'dealer_request_rejected') return 'shield-outline';
  if (type === 'dealer_request_submitted') return 'hourglass-outline';
  if (type === 'follow') return 'person-add-outline';
  if (type === 'share') return 'share-social-outline';
  if (type === 'inquiry') return 'chatbubble-ellipses-outline';
  if (type === 'post_created') return 'images-outline';
  return 'heart-outline';
};

const isPastDateISO = (dateISO?: unknown) => {
  const value = String(dateISO ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dateMs = new Date(y, m - 1, d).getTime();
  const now = new Date();
  const todayMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return dateMs > 0 && dateMs < todayMs;
};

const isStalePayNotification = (item: NotificationRow) =>
  (item.type === 'booking_artist_approved_payment_pending' || item.type === 'booking_quote_sent') && isPastDateISO(item.dateISO);

const isBookingBadgeNotification = (type: NotificationType) =>
  [
    'booking_quote_sent',
    'booking_quote_expired',
    'booking_rejected',
    'booking_artist_approved_payment_pending',
    'booking_reminder',
    'final_payment_requested',
    'final_payment_user_marked_paid',
    'final_payment_disputed',
    'final_payment_success',
    'payment_success',
    'booking_confirmed',
    'booking_cancelled',
    'booking_reschedule_requested',
    'booking_reschedule_accepted',
    'booking_reschedule_rejected',
  ].includes(type);

const NotificationsModal = ({ visible, uid, onClose, onPressItem }: NotificationsModalProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const readSyncingRef = useRef(false);
  const visibleItems = useMemo(() => items.filter((item) => !isStalePayNotification(item)), [items]);

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
              toUid: data.toUid ?? uid,
              type: data.type,
              fromName: data.fromName ?? data.senderName,
              fromUid: data.fromUid ?? data.senderUid,
              title: data.title,
              message: data.message,
              entityType: data.entityType,
              entityId: data.entityId,
              postId: data.postId,
              postPreview: data.postPreview ?? null,
              bookingId: data.bookingId,
              dateISO: data.dateISO,
              proposedDateISO: data.proposedDateISO,
              depositAmount: data.depositAmount,
              reason: data.reason,
              createdAt: data.createdAt,
              read: Boolean(data.read),
              readAt: data.readAt,
              metadata: data.metadata,
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

  useEffect(() => {
    if (!visible || !uid || !items.length || readSyncingRef.current) return;

    const unreadIds = visibleItems.filter((item) => !item.read && !isBookingBadgeNotification(item.type)).map((item) => item.id);
    if (!unreadIds.length) return;
    readSyncingRef.current = true;

    (async () => {
      try {
        for (const notificationId of unreadIds) {
          try {
            await markNotificationReadDual(uid, notificationId, true);
          } catch {
            // ignore read-sync failure
          }
        }
      } finally {
        readSyncingRef.current = false;
      }
    })();
  }, [visibleItems, uid, visible]);

  const renderSubline = (item: NotificationRow) => {
    if (item.type === 'final_payment_requested') {
      const meta = (item.metadata ?? {}) as any;
      const amount = Number(meta.finalStudioAmount ?? item.depositAmount ?? 0);
      return (
        <View style={styles.quoteBox}>
          <Text style={styles.quoteLine}>Collected amount</Text>
          <Text style={styles.quoteStrong}>{amount > 0 ? `Rs. ${amount}` : 'Amount shared by artist'}</Text>
          {meta.finalAmountNote ? <Text style={styles.quoteNote}>Artist note: {String(meta.finalAmountNote)}</Text> : null}
          <Text style={styles.quoteNote}>Pay the artist directly using their UPI/payment link, then mark paid in Tatzo.</Text>
          <Text style={styles.quoteCta}>Tap to open Payment Details</Text>
        </View>
      );
    }

    if (item.type === 'booking_quote_sent') {
      const meta = (item.metadata ?? {}) as any;
      const range = String(meta.quoteRangeLabel ?? '').trim();
      const reason = String(item.reason ?? meta.quoteReason ?? '').trim();
      return (
        <View style={styles.quoteBox}>
          <Text style={styles.quoteLine}>Estimated tattoo range</Text>
          <Text style={styles.quoteStrong}>{range || 'Artist estimate ready'}</Text>
          {reason ? <Text style={styles.quoteNote}>Artist note: {reason}</Text> : null}
          <Text style={styles.quoteNote}>Pay only Rs. {item.depositAmount ?? 249} to reserve your appointment slot.</Text>
          {item.dateISO ? <Text style={styles.quoteNote}>Date: {item.dateISO}</Text> : null}
          <Text style={styles.quoteCta}>Tap to open Payment Details</Text>
        </View>
      );
    }

    if (item.message?.trim()) {
      return (
        <Text style={styles.rowSub} numberOfLines={2}>
          {item.message.trim()}
        </Text>
      );
    }

    if ((item.type === 'reschedule_proposed' || item.type === 'booking_reschedule_requested' || item.type === 'booking_reschedule_accepted' || item.type === 'booking_reschedule_rejected') && item.proposedDateISO) {
      return (
        <Text style={styles.rowSub} numberOfLines={1}>
          Proposed: {item.proposedDateISO}
        </Text>
      );
    }

    if (
      (item.type === 'booking_requested' ||
        item.type === 'booking_request' ||
        item.type === 'booking_artist_approved_payment_pending' ||
        item.type === 'booking_quote_expired' ||
        item.type === 'booking_confirmed' ||
        item.type === 'booking_rejected' ||
        item.type === 'booking_declined' ||
        item.type === 'booking_reminder') &&
      item.dateISO
    ) {
      return (
        <Text style={styles.rowSub} numberOfLines={1}>
          Date: {item.dateISO} | Deposit: Rs. {item.depositAmount ?? 249}
        </Text>
      );
    }

    if ((item as any).postPreview) {
      return (
        <Text style={styles.rowSub} numberOfLines={1}>
          {(item as any).postPreview}
        </Text>
      );
    }

    if ((item.type === 'verification_rejected' || item.type === 'verification_needs_more_samples' || item.type === 'dealer_request_rejected') && item.reason) {
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
          data={visibleItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyTitle}>You are all caught up</Text>
              <Text style={styles.empty}>Booking updates, revenue prompts, subscription notices, and social activity will appear here.</Text>
              <TouchableOpacity activeOpacity={0.9} onPress={onClose} style={styles.emptyBtn}>
                <Text style={styles.emptyBtnText}>Back to app</Text>
              </TouchableOpacity>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPressItem?.(item)}
              style={[styles.row, !item.read && styles.rowUnread]}
            >
              <View style={styles.iconWrap}>
                <Ionicons name={iconFor(item.type)} size={18} color={theme.colors.accentStrong} />
              </View>
              <View style={styles.copy}>
                <Text style={styles.rowTitle}>{labelFor(item)}</Text>
                {renderSubline(item)}
              </View>
            </Pressable>
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
    quoteBox: {
      marginTop: 8,
      padding: 10,
      borderRadius: 14,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      gap: 4,
    },
    quoteLine: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    quoteStrong: {
      color: theme.mode === 'light' ? theme.colors.accentStrong : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
    },
    quoteNote: {
      color: theme.colors.text,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
    },
    quoteCta: {
      marginTop: 4,
      color: theme.colors.accentStrong,
      fontSize: 12,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    emptyWrap: {
      paddingHorizontal: 18,
      paddingTop: 20,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    emptyTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 16,
      fontWeight: '900',
    },
    empty: {
      color: theme.colors.textMuted,
      fontSize: 13,
      textAlign: 'center',
      lineHeight: 19,
    },
    emptyBtn: {
      minHeight: 42,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.24)' : 'rgba(122, 92, 255, 0.28)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyBtnText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
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
    rowUnread: {
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.42)' : 'rgba(122, 92, 255, 0.48)',
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.08)' : 'rgba(122, 92, 255, 0.12)',
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
