import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../config/firebaseConfig';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { BookingModel, TimeSlotId, UserProfile } from '../../types/app';
import ProfileAvatar from '../ui/ProfileAvatar';
import { createResponsiveShadow } from '../../utils/responsiveShadow';
import { AUTO_REJECT_REASON_NO_RESPONSE, getBookingPaymentStatus, getSharedBookingStage, listLockedSlotsForArtistDate, openRazorpayCheckoutForBooking, requestBookingCompletionByUser, requestBookingReschedule } from '../../services/bookings';
import { getArtistSettingsFromProfile } from '../../services/artistSettings';
import CalendarPickerModal from '../booking/CalendarPickerModal';

type UserBookingDetailModalProps = {
  visible: boolean;
  booking: BookingModel | null;
  onClose: () => void;
  onUpdated?: () => void;
};

type TimelineTone = 'done' | 'current' | 'upcoming' | 'danger';

type TimelineItem = {
  key: string;
  label: string;
  timestamp?: unknown;
  tone: TimelineTone;
  sublabel?: string;
};

const RESCHEDULE_SLOTS: Array<{ id: TimeSlotId; label: string; window: string }> = [
  { id: 'morning', label: 'Morning', window: '10 AM - 12 PM' },
  { id: 'afternoon', label: 'Afternoon', window: '1 PM - 4 PM' },
  { id: 'evening', label: 'Evening', window: '5 PM - 8 PM' },
];

const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const casted = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof casted?.toMillis === 'function') return casted.toMillis();
  if (typeof casted?.seconds === 'number') return casted.seconds * 1000 + Math.floor((casted.nanoseconds ?? 0) / 1_000_000);
  return 0;
};

const formatTimestamp = (value?: unknown) => {
  const millis = toMillis(value);
  if (!millis) return 'Waiting';
  const date = new Date(millis);
  return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} - ${date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;
};

const paymentLabel = (status: ReturnType<typeof getBookingPaymentStatus>) => {
  if (status === 'paid') return 'Paid';
  if (status === 'failed') return 'Failed';
  if (status === 'expired') return 'Expired';
  return 'Pending';
};

const sharedStageLabel = (stage: ReturnType<typeof getSharedBookingStage>) => {
  if (stage === 'confirmed') return 'Confirmed';
  if (stage === 'reschedule_requested') return 'Reschedule Requested';
  if (stage === 'work_done') return 'Work Done';
  if (stage === 'rejected') return 'Rejected';
  return 'Requested';
};

const buildTimeline = (booking: BookingModel): TimelineItem[] => {
  const stage = getSharedBookingStage(booking);
  const status = String(booking.status ?? '');
  const quoteSeen = Boolean(booking.quotedAt || booking.quoteReason || booking.quoteRangeLabel);
  const paymentState = getBookingPaymentStatus(booking);
  const completionSeen = Boolean(booking.completionRequestedByUser || booking.status === 'completed' || booking.status === 'final_payment_pending');
  const autoRejected = stage === 'rejected' && String(booking.rejectReason ?? '').trim() === AUTO_REJECT_REASON_NO_RESPONSE;

  if (stage === 'rejected' && autoRejected) {
    return [
      { key: 'requested', label: 'Booking Requested', timestamp: booking.createdAt, tone: 'done' },
      { key: 'waiting_artist', label: 'Waiting for Artist', timestamp: booking.createdAt, tone: 'done' },
      { key: 'auto_rejected', label: 'Auto Rejected (No Response)', timestamp: booking.updatedAt, tone: 'danger', sublabel: AUTO_REJECT_REASON_NO_RESPONSE },
    ];
  }

  if (stage === 'rejected') {
    return [
      { key: 'requested', label: 'Booking Requested', timestamp: booking.createdAt, tone: 'done' },
      { key: 'rejected', label: 'Rejected', timestamp: booking.updatedAt, tone: 'danger', sublabel: String(booking.rejectReason ?? '').trim() || 'The booking was not approved.' },
    ];
  }

  if (stage === 'requested' && !quoteSeen) {
    return [
      { key: 'requested', label: 'Booking Requested', timestamp: booking.createdAt, tone: 'done' },
      { key: 'waiting_artist', label: 'Waiting for Artist', timestamp: booking.createdAt, tone: 'current' },
      { key: 'quote_sent', label: 'Quote Sent', timestamp: undefined, tone: 'upcoming' },
      { key: 'payment_completed', label: 'Payment Completed', timestamp: undefined, tone: 'upcoming' },
      { key: 'booking_confirmed', label: 'Booking Confirmed', timestamp: undefined, tone: 'upcoming' },
      { key: 'appointment_scheduled', label: 'Appointment Scheduled', timestamp: undefined, tone: 'upcoming', sublabel: `${booking.dateISO} - ${String(booking.slotTimeLabel ?? booking.slotId)}` },
      { key: 'work_completed', label: 'Work Completed', timestamp: booking.completionRequestedAt ?? (booking as any).completedAt, tone: completionSeen ? 'done' : 'upcoming' },
      { key: 'review_submitted', label: 'Review Submitted', timestamp: undefined, tone: 'upcoming' },
    ];
  }

  if (stage === 'reschedule_requested') {
    return [
      { key: 'confirmed', label: 'Booking Confirmed', timestamp: booking.payment?.at ?? booking.updatedAt, tone: 'done' },
      { key: 'reschedule_requested', label: 'Reschedule Requested', timestamp: booking.rescheduleRequestedAt, tone: 'current' },
      { key: 'artist_approved_reschedule', label: 'Artist Approved Reschedule', timestamp: booking.rescheduleResolvedAt, tone: 'upcoming' },
      {
        key: 'new_appointment',
        label: 'New Appointment Scheduled',
        timestamp: booking.rescheduleResolvedAt,
        tone: 'upcoming',
        sublabel: booking.proposedDateISO && booking.proposedSlotTimeLabel ? `${booking.proposedDateISO} - ${booking.proposedSlotTimeLabel}` : undefined,
      },
    ];
  }

  return [
    { key: 'requested', label: 'Booking Requested', timestamp: booking.createdAt, tone: 'done' },
    { key: 'artist_reviewed', label: 'Artist Reviewed Request', timestamp: booking.quotedAt, tone: quoteSeen ? 'done' : stage === 'requested' ? 'current' : 'done' },
    { key: 'quote_sent', label: 'Quote Sent', timestamp: booking.quotedAt, tone: quoteSeen ? 'done' : 'upcoming' },
    {
      key: 'payment_completed',
      label: 'Payment Completed',
      timestamp: booking.payment?.at ?? booking.updatedAt,
      tone: paymentState === 'paid' ? 'done' : stage === 'requested' && quoteSeen ? 'current' : paymentState === 'failed' || paymentState === 'expired' ? 'danger' : 'upcoming',
      sublabel: paymentState === 'failed' ? 'Payment failed' : paymentState === 'expired' ? 'Payment expired' : undefined,
    },
    { key: 'booking_confirmed', label: 'Booking Confirmed', timestamp: booking.payment?.at ?? booking.updatedAt, tone: ['confirmed', 'work_done'].includes(stage) ? 'done' : 'upcoming' },
    {
      key: 'appointment_scheduled',
      label: 'Appointment Scheduled',
      timestamp: booking.payment?.at ?? booking.updatedAt,
      tone: ['confirmed', 'work_done'].includes(stage) ? 'done' : 'upcoming',
      sublabel: `${booking.dateISO} - ${String(booking.slotTimeLabel ?? booking.slotId)}`,
    },
    { key: 'work_completed', label: 'Work Completed', timestamp: booking.completionRequestedAt ?? (booking as any).completedAt, tone: completionSeen ? 'done' : 'upcoming' },
    { key: 'review_submitted', label: 'Review Submitted', timestamp: undefined, tone: 'upcoming' },
  ];
};

const UserBookingDetailModal = ({ visible, booking, onClose, onUpdated }: UserBookingDetailModalProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [artistProfile, setArtistProfile] = useState<UserProfile | null>(null);
  const [artistSettings, setArtistSettings] = useState(() => getArtistSettingsFromProfile(null));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [rescheduleEditorOpen, setRescheduleEditorOpen] = useState(false);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleDateISO, setRescheduleDateISO] = useState('');
  const [rescheduleSlotId, setRescheduleSlotId] = useState<TimeSlotId>('morning');
  const [rescheduleSlotLabel, setRescheduleSlotLabel] = useState('10 AM - 12 PM');
  const [unavailableSlots, setUnavailableSlots] = useState<TimeSlotId[]>([]);

  useEffect(() => {
    if (!booking?.artistUid) {
      setArtistProfile(null);
      return;
    }
    let active = true;
    getDoc(doc(db, 'artists', booking.artistUid))
      .then((snap) => {
        if (!active) return;
        if (!snap.exists()) {
          setArtistProfile(null);
          setArtistSettings(getArtistSettingsFromProfile(null));
          return;
        }
        const data = snap.data() as UserProfile;
        setArtistProfile(data);
        setArtistSettings(getArtistSettingsFromProfile(data));
      })
      .catch(() => {
        if (!active) return;
        setArtistProfile(null);
      });
    return () => {
      active = false;
    };
  }, [booking?.artistUid]);

  useEffect(() => {
    if (!booking) return;
    setRescheduleDateISO(String(booking.dateISO ?? ''));
    setRescheduleSlotId((booking.slotId ?? 'morning') as TimeSlotId);
    setRescheduleSlotLabel(String(booking.slotTimeLabel ?? '10 AM - 12 PM'));
  }, [booking]);

  useEffect(() => {
    if (!booking?.artistUid || !rescheduleDateISO) {
      setUnavailableSlots([]);
      return;
    }
    let cancelled = false;
    listLockedSlotsForArtistDate({ artistUid: booking.artistUid, dateISO: rescheduleDateISO, excludeBookingId: booking.id })
      .then((rows) => {
        if (!cancelled) setUnavailableSlots(rows);
      })
      .catch(() => {
        if (!cancelled) setUnavailableSlots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [booking?.artistUid, booking?.id, rescheduleDateISO]);

  const stage = booking ? getSharedBookingStage(booking) : 'requested';
  const paymentState = booking ? getBookingPaymentStatus(booking) : 'pending';
  const timeline = booking ? buildTimeline(booking) : [];
  const dateRangeMax = useMemo(() => {
    if (!booking?.dateISO) return new Date().toISOString().slice(0, 10);
    const base = new Date(booking.dateISO);
    base.setDate(base.getDate() + 30);
    return base.toISOString().slice(0, 10);
  }, [booking?.dateISO]);

  if (!booking) return null;

  const artistName = String(artistProfile?.artistName ?? artistProfile?.displayName ?? booking.artistName ?? 'Artist').trim();
  const studioName = String(artistProfile?.studioName ?? '').trim() || artistName;
  const referenceImage = String(booking.designImageUrl ?? '').trim();
  const stageLabel = sharedStageLabel(stage);
  const canPayBookingFee = ['quote_sent_payment_pending', 'artist_approved_payment_pending'].includes(String(booking.status ?? ''));

  return (
    <>
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <View style={styles.headerRow}>
              <Text style={styles.title}>Booking Detail</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.closeButton} onPress={onClose}>
                <Ionicons name="close" size={20} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
              <View style={styles.artistRow}>
                <ProfileAvatar uri={artistProfile?.profileImageUrl} name={artistName} size={56} />
                <View style={styles.artistCopy}>
                  <Text style={styles.artistName}>{artistName}</Text>
                  <Text style={styles.artistMeta}>{studioName}</Text>
                </View>
              </View>

              <View style={styles.quickActionsCard}>
                <View style={styles.pillRow}>
                  <View style={styles.statusPill}>
                    <Text style={styles.statusPillText}>Booking Status: {stageLabel}</Text>
                  </View>
                  <View style={styles.paymentPill}>
                    <Text style={styles.paymentPillText}>Payment Status: {paymentLabel(paymentState)}</Text>
                  </View>
                </View>
                <View style={styles.actionRow}>
                  {stage === 'requested' ? (
                    <TouchableOpacity activeOpacity={0.9} style={styles.actionBtn} onPress={() => Alert.alert('Tatzo', 'Contact support at support@tatzo.co.in')}>
                      <Text style={styles.actionText}>Contact Support</Text>
                    </TouchableOpacity>
                  ) : null}
                  {canPayBookingFee ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={styles.actionBtn}
                      onPress={async () => {
                        try {
                          await openRazorpayCheckoutForBooking(booking.id);
                        } catch (error: any) {
                          Alert.alert('Tatzo', error?.message ?? 'Could not open payment checkout.');
                        }
                      }}
                    >
                      <Text style={styles.actionText}>Pay Rs. 249 via Razorpay</Text>
                    </TouchableOpacity>
                  ) : null}
                  {stage === 'confirmed' ? (
                    <TouchableOpacity activeOpacity={0.9} style={styles.actionBtn} onPress={() => setRescheduleEditorOpen(true)}>
                      <Text style={styles.actionText}>Reschedule</Text>
                    </TouchableOpacity>
                  ) : null}
                  {stage === 'reschedule_requested' ? (
                    <View style={[styles.actionBtn, styles.actionBtnDisabled]}>
                      <Text style={styles.actionText}>Waiting for Artist</Text>
                    </View>
                  ) : null}
                  {stage === 'work_done' ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={styles.actionBtn}
                      onPress={async () => {
                        if (String(booking.status ?? '') === 'completed') {
                          Alert.alert('Tatzo', 'Review flow will be opened in the next phase.');
                          return;
                        }
                        try {
                          await requestBookingCompletionByUser(booking.id);
                          Alert.alert('Tatzo', 'Artist notified to add collected amount for revenue tracking.');
                          onUpdated?.();
                        } catch (error: any) {
                          Alert.alert('Tatzo', error?.message ?? 'Could not update booking.');
                        }
                      }}
                    >
                      <Text style={styles.actionText}>{String(booking.status ?? '') === 'completed' ? 'Leave Review' : 'Waiting for Artist'}</Text>
                    </TouchableOpacity>
                  ) : null}
                  {stage === 'rejected' ? (
                    <TouchableOpacity activeOpacity={0.9} style={styles.actionBtn} onPress={() => Alert.alert('Tatzo', String(booking.rejectReason ?? AUTO_REJECT_REASON_NO_RESPONSE))}>
                      <Text style={styles.actionText}>View Reason</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>Appointment</Text>
                <Text style={styles.infoLine}>Date: {booking.dateISO}</Text>
                <Text style={styles.infoLine}>Time: {String(booking.slotTimeLabel ?? booking.slotId)}</Text>
                {booking.proposedDateISO ? <Text style={styles.infoLine}>Reschedule Requested: {booking.proposedDateISO} - {String(booking.proposedSlotTimeLabel ?? booking.proposedSlotId ?? '')}</Text> : null}
              </View>

              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>Tattoo Details</Text>
                <Text style={styles.infoLine}>Readiness Summary: {booking.aiSkinCheckNotes || 'Tattoo readiness details shared with the artist.'}</Text>
                <Text style={styles.infoLine}>Risk Level: {String(booking.aiSkinCheckStatus ?? 'not_checked').replace(/^\w/, (match) => match.toUpperCase())}</Text>
                {booking.tattooSizeInches ? <Text style={styles.infoLine}>Tattoo Size: {booking.tattooSizeInches}</Text> : null}
              </View>

              {referenceImage ? (
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>Reference Image</Text>
                  <Image source={{ uri: referenceImage }} style={styles.referenceImage} />
                </View>
              ) : null}

              {stage === 'rejected' && booking.rejectReason ? (
                <View style={styles.infoCard}>
                  <Text style={styles.infoTitle}>Rejection Reason</Text>
                  <Text style={styles.infoLine}>{booking.rejectReason}</Text>
                </View>
              ) : null}

              <View style={styles.infoCard}>
                <Text style={styles.infoTitle}>Booking Timeline</Text>
                <View style={styles.timelineList}>
                  {timeline.map((item, index) => (
                    <View key={item.key} style={styles.timelineRow}>
                      <View style={styles.timelineRail}>
                        <View style={[
                          styles.timelineDot,
                          item.tone === 'done' && styles.timelineDotDone,
                          item.tone === 'current' && styles.timelineDotCurrent,
                          item.tone === 'danger' && styles.timelineDotDanger,
                        ]} />
                        {index < timeline.length - 1 ? <View style={styles.timelineLine} /> : null}
                      </View>
                      <View style={styles.timelineCopy}>
                        <Text style={styles.timelineLabel}>{item.label}</Text>
                        {item.sublabel ? <Text style={styles.timelineSub}>{item.sublabel}</Text> : null}
                        <Text style={styles.timelineTime}>{formatTimestamp(item.timestamp)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <CalendarPickerModal
        visible={calendarOpen}
        initialDateISO={rescheduleDateISO || new Date().toISOString().slice(0, 10)}
        allowedWeekdays={(artistSettings.timeManagement.availableDays || [])
          .map((day) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].indexOf(day))
          .filter((value) => value >= 0)}
        minDateISO={new Date().toISOString().slice(0, 10)}
        maxDateISO={dateRangeMax}
        onSelect={(value) => setRescheduleDateISO(value)}
        onClose={() => setCalendarOpen(false)}
      />
      <Modal visible={rescheduleEditorOpen && stage === 'confirmed'} transparent animationType="fade" onRequestClose={() => setRescheduleEditorOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.rescheduleCard}>
            <Text style={styles.title}>Request Reschedule</Text>
            <Text style={styles.infoLine}>Selected date: {rescheduleDateISO || 'Choose date'}</Text>
            <TouchableOpacity activeOpacity={0.9} style={styles.secondaryDismissBtn} onPress={() => setCalendarOpen(true)}>
              <Text style={styles.dismissText}>Choose New Date</Text>
            </TouchableOpacity>
            <View style={styles.slotRow}>
              {RESCHEDULE_SLOTS.map((slot) => {
                const disabled = unavailableSlots.includes(slot.id);
                const active = rescheduleSlotId === slot.id;
                return (
                  <TouchableOpacity
                    key={slot.id}
                    activeOpacity={0.9}
                    disabled={disabled}
                    onPress={() => {
                      setRescheduleSlotId(slot.id);
                      setRescheduleSlotLabel(slot.window);
                    }}
                    style={[styles.slotChip, active && styles.slotChipActive, disabled && styles.slotChipDisabled]}
                  >
                    <Text style={styles.slotChipText}>{disabled ? `${slot.label} Unavailable` : slot.window}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity activeOpacity={0.9} style={styles.secondaryDismissBtn} onPress={() => setRescheduleEditorOpen(false)}>
                <Text style={styles.dismissText}>Close</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.actionBtn, rescheduleBusy && styles.actionBtnDisabled]}
                disabled={rescheduleBusy}
                onPress={async () => {
                  setRescheduleBusy(true);
                  try {
                    await requestBookingReschedule({
                      bookingId: booking.id,
                      newDateISO: rescheduleDateISO,
                      newSlotId: rescheduleSlotId,
                      newSlotTimeLabel: rescheduleSlotLabel,
                    });
                    Alert.alert('Tatzo', 'Reschedule request sent to the artist.');
                    setCalendarOpen(false);
                    setRescheduleEditorOpen(false);
                    onUpdated?.();
                  } catch (error: any) {
                    Alert.alert('Tatzo', error?.message ?? 'Could not send reschedule request.');
                  } finally {
                    setRescheduleBusy(false);
                  }
                }}
              >
                <Text style={styles.actionText}>{rescheduleBusy ? 'Sending...' : 'Request Reschedule'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(3, 6, 16, 0.76)',
      justifyContent: 'flex-end',
      paddingHorizontal: 0,
      paddingVertical: 0,
    },
    card: {
      flex: 1,
      maxHeight: '100%',
      borderRadius: 0,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingTop: 18,
      ...createResponsiveShadow({
        web: theme.mode === 'light' ? '0px 16px 36px rgba(6, 15, 32, 0.14)' : '0px 16px 36px rgba(5, 14, 28, 0.28)',
        native: {
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: theme.mode === 'light' ? 0.14 : 0.26,
          shadowRadius: 28,
          elevation: 10,
        },
      }),
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingHorizontal: 16,
    },
    closeButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.backgroundAlt,
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.title,
      fontWeight: '800',
    },
    content: {
      gap: 14,
      paddingHorizontal: 16,
      paddingBottom: 20,
    },
    artistRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    artistCopy: {
      flex: 1,
      gap: 3,
    },
    artistName: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.bodyLg,
      fontWeight: '800',
    },
    artistMeta: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.body,
    },
    quickActionsCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.backgroundAlt,
      padding: 14,
      gap: 12,
    },
    pillRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    statusPill: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: 'rgba(0, 212, 255, 0.12)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    paymentPill: {
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 8,
      backgroundColor: theme.mode === 'light' ? 'rgba(168, 85, 247, 0.08)' : 'rgba(168, 85, 247, 0.16)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    statusPillText: {
      color: theme.colors.accent,
      fontSize: theme.typography.caption,
      fontWeight: '800',
    },
    paymentPillText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.caption,
      fontWeight: '800',
    },
    actionRow: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
    },
    actionBtn: {
      minHeight: 42,
      borderRadius: 14,
      paddingHorizontal: 16,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    actionBtnDisabled: {
      opacity: 0.6,
    },
    actionText: {
      color: theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '800',
    },
    infoCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 10,
    },
    infoTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.bodyLg,
      fontWeight: '800',
    },
    infoLine: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.body,
      lineHeight: 20,
    },
    referenceImage: {
      width: '100%',
      height: 180,
      borderRadius: 18,
      backgroundColor: theme.colors.backgroundAlt,
    },
    timelineList: {
      gap: 10,
    },
    timelineRow: {
      flexDirection: 'row',
      gap: 12,
    },
    timelineRail: {
      alignItems: 'center',
      width: 20,
    },
    timelineDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: theme.colors.textMuted,
      marginTop: 4,
    },
    timelineDotDone: {
      backgroundColor: theme.colors.accent,
    },
    timelineDotCurrent: {
      backgroundColor: '#26d39c',
    },
    timelineDotDanger: {
      backgroundColor: '#ff4a6f',
    },
    timelineLine: {
      width: 2,
      flex: 1,
      backgroundColor: theme.colors.border,
      marginTop: 4,
    },
    timelineCopy: {
      flex: 1,
      paddingBottom: 12,
      gap: 3,
    },
    timelineLabel: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '700',
    },
    timelineSub: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
      lineHeight: 18,
    },
    timelineTime: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
    },
    rescheduleCard: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 18,
      gap: 14,
    },
    slotRow: {
      gap: 10,
    },
    slotChip: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.backgroundAlt,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    slotChipActive: {
      backgroundColor: theme.colors.accent,
    },
    slotChipDisabled: {
      opacity: 0.45,
    },
    slotChipText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '700',
    },
    secondaryDismissBtn: {
      minHeight: 42,
      borderRadius: 14,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.backgroundAlt,
    },
    dismissText: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.body,
      fontWeight: '700',
    },
  });

export default UserBookingDetailModal;
