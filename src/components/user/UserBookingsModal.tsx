import React, { useEffect, useMemo, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { BookingModel } from '../../types/app';
import { createResponsiveShadow } from '../../utils/responsiveShadow';
import ProfileAvatar from '../ui/ProfileAvatar';
import UserBookingDetailModal from './UserBookingDetailModal';
import { getBookingPaymentStatus, getSharedBookingStage, type SharedBookingStage } from '../../services/bookings';

type UserBookingsModalProps = {
  visible: boolean;
  bookings: BookingModel[];
  onClose: () => void;
  onOpenFindArtist: () => void;
  initialBookingId?: string | null;
};

const STAGES: Array<{ key: SharedBookingStage; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'requested', label: 'Requested', icon: 'mail-open-outline' },
  { key: 'confirmed', label: 'Confirmed', icon: 'checkmark-circle-outline' },
  { key: 'reschedule_requested', label: 'Reschedule', icon: 'swap-horizontal-outline' },
  { key: 'work_done', label: 'Work Done', icon: 'ribbon-outline' },
  { key: 'rejected', label: 'Rejected', icon: 'close-circle-outline' },
];

const paymentLabel = (value: ReturnType<typeof getBookingPaymentStatus>) => {
  if (value === 'paid') return 'Paid';
  if (value === 'failed') return 'Failed';
  if (value === 'expired') return 'Expired';
  return 'Pending';
};

const stageLabel = (value: SharedBookingStage) => {
  if (value === 'confirmed') return 'Confirmed';
  if (value === 'reschedule_requested') return 'Reschedule Requested';
  if (value === 'work_done') return 'Work Done';
  if (value === 'rejected') return 'Rejected';
  return 'Requested';
};

const UserBookingsModal = ({ visible, bookings, onClose, onOpenFindArtist, initialBookingId }: UserBookingsModalProps) => {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, insets.bottom), [theme, insets.bottom]);
  const [selectedStage, setSelectedStage] = useState<SharedBookingStage>('requested');
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);

  const groupedCounts = useMemo(
    () =>
      bookings.reduce<Record<SharedBookingStage, number>>(
        (acc, row) => {
          acc[getSharedBookingStage(row)] += 1;
          return acc;
        },
        { requested: 0, confirmed: 0, reschedule_requested: 0, work_done: 0, rejected: 0 },
      ),
    [bookings],
  );

  const filtered = useMemo(
    () => bookings.filter((row) => getSharedBookingStage(row) === selectedStage).sort((a, b) => String(b.dateISO ?? '').localeCompare(String(a.dateISO ?? ''))),
    [bookings, selectedStage],
  );

  const selectedBooking = useMemo(() => bookings.find((row) => row.id === selectedBookingId) ?? null, [bookings, selectedBookingId]);

  useEffect(() => {
    if (!visible) return;
    if (initialBookingId) {
      const row = bookings.find((item) => item.id === initialBookingId);
      if (row) {
        setSelectedStage(getSharedBookingStage(row));
        setSelectedBookingId(row.id);
        return;
      }
    }
    setSelectedBookingId(null);
    if (bookings.length) setSelectedStage(getSharedBookingStage(bookings[0]));
  }, [visible, initialBookingId, bookings]);

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <View>
                <Text style={styles.title}>My Bookings</Text>
                <Text style={styles.subtitle}>Track your tattoo journey.</Text>
              </View>
              <TouchableOpacity activeOpacity={0.9} style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={20} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stageRow}>
              {STAGES.map((stage) => {
                const active = selectedStage === stage.key;
                return (
                  <TouchableOpacity key={stage.key} activeOpacity={0.9} style={[styles.stageCard, active && styles.stageCardActive]} onPress={() => setSelectedStage(stage.key)}>
                    <Ionicons name={stage.icon} size={18} color={active ? theme.colors.textInverse : theme.colors.accent} />
                    <Text style={[styles.stageLabel, active && styles.stageLabelActive]}>{stage.label}</Text>
                    <Text style={[styles.stageCount, active && styles.stageLabelActive]}>{groupedCounts[stage.key]}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              {!filtered.length ? (
                <View style={styles.emptyCard}>
                  <Ionicons name="calendar-clear-outline" size={28} color={theme.colors.accent} />
                  <Text style={styles.emptyTitle}>No bookings yet</Text>
                  <Text style={styles.emptyBody}>Find verified tattoo artists and start your first tattoo journey.</Text>
                  <TouchableOpacity
                    activeOpacity={0.9}
                    style={styles.emptyButton}
                    onPress={() => {
                      onClose();
                      onOpenFindArtist();
                    }}
                  >
                    <Text style={styles.emptyButtonText}>Find Artist</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                filtered.map((booking) => {
                  const stage = getSharedBookingStage(booking);
                  return (
                    <TouchableOpacity key={booking.id} activeOpacity={0.92} style={styles.bookingCard} onPress={() => setSelectedBookingId(booking.id)}>
                      <View style={styles.bookingRow}>
                        <ProfileAvatar name={booking.artistName} size={50} />
                        <View style={styles.bookingCopy}>
                          <Text style={styles.bookingArtist} numberOfLines={1}>{booking.artistName}</Text>
                          <Text style={styles.bookingMeta}>{booking.dateISO} • {String(booking.slotTimeLabel ?? booking.slotId)}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={22} color={theme.colors.textMuted} />
                      </View>
                      <View style={styles.bookingPills}>
                        <View style={styles.infoPill}>
                          <Text style={styles.infoPillText}>{stageLabel(stage)}</Text>
                        </View>
                        <View style={styles.infoPillMuted}>
                          <Text style={styles.infoPillMutedText}>Payment {paymentLabel(getBookingPaymentStatus(booking))}</Text>
                        </View>
                      </View>
                      <Text style={styles.bookingHint}>
                        {stage === 'requested'
                          ? 'Waiting for artist response.'
                          : stage === 'confirmed'
                            ? 'Booking confirmed. Open details for timeline and reschedule.'
                            : stage === 'reschedule_requested'
                              ? 'Waiting for artist approval on your new slot.'
                              : stage === 'work_done'
                                ? 'Work completed flow is active for this booking.'
                                : String(booking.rejectReason ?? 'This booking was not approved.')}
                      </Text>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <UserBookingDetailModal visible={Boolean(selectedBookingId)} booking={selectedBooking} onClose={() => setSelectedBookingId(null)} />
    </>
  );
};

const createStyles = (theme: AppTheme, bottomInset: number) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(3, 6, 16, 0.76)',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingTop: 18,
      paddingBottom: Math.max(18, bottomInset + 8),
    },
    card: {
      flex: 1,
      borderRadius: 28,
      borderWidth: 0,
      backgroundColor: theme.colors.surface,
      paddingTop: 14,
      ...createResponsiveShadow({
        web: theme.mode === 'light' ? '0px 16px 36px rgba(6, 15, 32, 0.14)' : '0px 16px 36px rgba(5, 14, 28, 0.28)',
        native: {
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: theme.mode === 'light' ? 0.05 : 0.08,
          shadowRadius: 14,
          elevation: 3,
        },
      }),
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingBottom: 10,
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.heading,
      fontWeight: '800',
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.body,
      marginTop: 4,
      maxWidth: 250,
      lineHeight: 18,
    },
    closeButton: {
      width: 42,
      height: 42,
      borderRadius: 21,
      borderWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.backgroundAlt,
    },
    stageRow: {
      gap: 8,
      paddingHorizontal: 18,
      paddingBottom: 10,
    },
    stageCard: {
      width: 112,
      height: 62,
      borderRadius: 16,
      borderWidth: 0,
      backgroundColor: theme.colors.backgroundAlt,
      paddingHorizontal: 10,
      paddingVertical: 8,
      gap: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stageCardActive: {
      borderWidth: 1,
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    stageLabel: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: Math.max(10, theme.typography.caption - 1),
      fontWeight: '800',
      textAlign: 'center',
    },
    stageLabelActive: {
      color: theme.colors.textInverse,
    },
    stageCount: {
      color: theme.colors.accent,
      fontSize: theme.typography.body,
      fontWeight: '800',
    },
    listContent: {
      paddingHorizontal: 18,
      paddingBottom: Math.max(28, bottomInset + 20),
      gap: 10,
    },
    emptyCard: {
      borderRadius: 22,
      borderWidth: 0,
      backgroundColor: theme.colors.backgroundAlt,
      padding: 18,
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
    },
    emptyTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.bodyLg,
      fontWeight: '800',
      textAlign: 'center',
    },
    emptyBody: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
      textAlign: 'center',
      lineHeight: 18,
      maxWidth: 260,
    },
    emptyButton: {
      marginTop: 4,
      borderRadius: 14,
      paddingHorizontal: 18,
      paddingVertical: 10,
      backgroundColor: theme.colors.accent,
    },
    emptyButtonText: {
      color: theme.colors.textInverse,
      fontSize: theme.typography.caption,
      fontWeight: '800',
    },
    bookingCard: {
      borderRadius: 20,
      borderWidth: 0,
      backgroundColor: theme.colors.backgroundAlt,
      padding: 12,
      gap: 8,
    },
    bookingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    bookingCopy: {
      flex: 1,
      gap: 5,
    },
    bookingArtist: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '800',
    },
    bookingMeta: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
    },
    bookingPills: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    infoPill: {
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
      backgroundColor: 'rgba(0, 212, 255, 0.12)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    infoPillMuted: {
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    infoPillText: {
      color: theme.colors.accent,
      fontSize: Math.max(10, theme.typography.caption - 1),
      fontWeight: '800',
    },
    infoPillMutedText: {
      color: theme.colors.textMuted,
      fontSize: Math.max(10, theme.typography.caption - 1),
      fontWeight: '800',
    },
    bookingHint: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
      lineHeight: 17,
    },
  });

export default UserBookingsModal;
