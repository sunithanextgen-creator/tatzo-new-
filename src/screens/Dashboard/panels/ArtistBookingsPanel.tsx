import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, FlatList, Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../../../config/firebaseConfig';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import type { BookingModel } from '../../../types/app';
import { expireStaleQuotesForUser, getSharedBookingStage, respondToBookingReschedule, type SharedBookingStage } from '../../../services/bookings';
import { writeNotificationDual } from '../../../services/notifications';

type ArtistBookingsPanelProps = {
  header?: React.ReactNode;
  initialBookingId?: string | null;
};

type BookingStage = SharedBookingStage;
const STAGES: Array<{ key: BookingStage; label: string; short: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { key: 'requested', label: 'Requested', short: 'Requested', icon: 'mail-open-outline' },
  { key: 'confirmed', label: 'Confirmed', short: 'Confirmed', icon: 'checkmark-circle-outline' },
  { key: 'reschedule_requested', label: 'Reschedule Requested', short: 'Reschedule', icon: 'swap-horizontal-outline' },
  { key: 'work_done', label: 'Work Done', short: 'Work Done', icon: 'sparkles-outline' },
  { key: 'rejected', label: 'Rejected', short: 'Rejected', icon: 'close-circle-outline' },
];

const STAGE_SUBTITLES: Record<BookingStage, string> = {
  requested: 'New booking requests',
  confirmed: 'Confirmed bookings',
  reschedule_requested: 'Reschedule requests',
  work_done: 'Completed bookings',
  rejected: 'Rejected bookings',
};

const toMillis = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000;
  return 0;
};

const activityMillis = (row: BookingModel): number =>
  toMillis((row as any).updatedAt) ||
  toMillis((row as any).createdAt) ||
  toMillis((row as any).quotedAt) ||
  toMillis((row as any).finalAmountSubmittedAt) ||
  (row.dateISO ? new Date(String(row.dateISO)).getTime() : 0);

const cityFromLocation = (location?: string | null) => {
  const raw = String(location ?? '').trim();
  if (!raw) return 'Unknown city';
  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  return parts[0] || raw;
};

const avatarLabel = (name?: string | null) => {
  const cleaned = String(name ?? 'Client').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? 'C';
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? '';
  return `${first}${second}`.toUpperCase();
};

const bookingStatusLabel = (status?: string) =>
  String(status ?? '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());

const bookingStageForRow = (row: BookingModel): BookingStage => getSharedBookingStage(row);

const isQuoteWaiting = (row: BookingModel) => {
  const status = String(row.status ?? '');
  return status === 'pending_artist_quote' || status === 'pending_artist_approval' || status === 'artist_approved_payment_pending';
};

const stageTone = (stage: BookingStage) => {
  if (stage === 'confirmed') return 'accent';
  if (stage === 'work_done') return 'good';
  if (stage === 'rejected') return 'muted';
  return 'warn';
};

const stageColor = (stage: BookingStage, accent: string) => {
  if (stage === 'requested') return 'rgba(171, 95, 255, 0.96)';
  if (stage === 'confirmed') return accent;
  if (stage === 'work_done') return 'rgba(38, 211, 156, 0.92)';
  return 'rgba(255, 74, 111, 0.92)';
};

const requestDateTimeLabel = (row: BookingModel) => {
  const ms =
    toMillis((row as any).createdAt) ||
    toMillis((row as any).updatedAt) ||
    (row.dateISO ? new Date(String(row.dateISO)).getTime() : 0);
  if (!ms) return 'Date not available';
  const date = new Date(ms);
  const dateLabel = date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const timeLabel = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return `${dateLabel} - ${timeLabel}`;
};

const bookingSlotLabel = (row: BookingModel) => {
  const explicit = String((row as any).slotTimeLabel ?? '').trim();
  if (explicit) return explicit;
  return bookingStatusLabel(String(row.slotId ?? ''));
};


const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1 },
    headerWrap: { gap: 12 },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingBottom: 10,
      paddingTop: 4,
    },
    sectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 19,
      fontWeight: '900',
      letterSpacing: 0.2,
    },
    sectionSubhead: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    moreBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    tickerShell: {
      marginHorizontal: 16,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)',
      paddingHorizontal: 12,
      paddingVertical: 10,
      overflow: 'hidden',
    },
    tickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    tickerLabel: {
      color: theme.colors.accent,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    tickerText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
      flex: 1,
    },
    overviewCard: {
      marginHorizontal: 16,
      marginBottom: 10,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)',
      padding: 12,
      gap: 10,
    },
    overviewCopy: {
      flex: 1,
      gap: 5,
    },
    overviewKicker: {
      color: theme.colors.accent,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    overviewTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 18,
      fontWeight: '900',
      lineHeight: 24,
    },
    overviewBody: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    stageGrid: {
      gap: 10,
    },
    stageTile: {
      width: '100%',
      minHeight: 74,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.04)' : '#111218',
      paddingHorizontal: 12,
      paddingVertical: 12,
      gap: 8,
      overflow: 'hidden',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    stageTileActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.08)' : 'rgba(122, 92, 255, 0.12)',
    },
    stageGlow: {
      position: 'absolute',
      width: 48,
      height: 48,
      borderRadius: 24,
      right: -12,
      top: -12,
      backgroundColor: theme.colors.accent,
      opacity: 0.14,
    },
    stageIconRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      minWidth: 0,
    },
    stageIconShell: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.05)' : 'rgba(255,255,255,0.05)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    stageTileBody: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    stageTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
    },
    stageSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    stageTileMeta: {
      alignItems: 'flex-end',
      gap: 4,
      marginLeft: 8,
    },
    stageCount: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 18,
      fontWeight: '900',
      lineHeight: 22,
    },
    stageChevron: {
      color: theme.colors.textMuted,
      fontSize: 18,
      fontWeight: '900',
    },
    selectedStagePanel: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.03)' : 'rgba(255,255,255,0.04)',
      padding: 10,
      gap: 8,
    },
    selectedStageHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    selectedStageTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    selectedStageMeta: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    selectedStageCountPill: {
      minWidth: 34,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    selectedStageCountText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '900',
    },
    selectedStageList: {
      gap: 8,
    },
    selectedStageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.04)',
      paddingHorizontal: 9,
      paddingVertical: 8,
    },
    selectedStageClient: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      minWidth: 0,
    },
    selectedStageAvatar: {
      width: 32,
      height: 32,
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : '#101018',
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectedStageAvatarImage: {
      width: '100%',
      height: '100%',
    },
    selectedStageAvatarText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '900',
    },
    selectedStageNameWrap: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    selectedStageName: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '900',
    },
    selectedStageCity: {
      color: theme.colors.textMuted,
      fontSize: 9,
      fontWeight: '700',
    },
    selectedStageQuote: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '800',
    },
    selectedStageStatus: {
      color: theme.colors.accent,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    selectedStageStatusWrap: {
      alignItems: 'flex-end',
      gap: 3,
    },
    stagePageSheet: {
      flex: 1,
      backgroundColor: theme.mode === 'light' ? '#f6f7fb' : '#090a0f',
      paddingTop: 6,
    },
    stagePageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 4,
      paddingBottom: 10,
    },
    stagePageBack: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.04)',
    },
    stagePageTitleWrap: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    stagePageBody: {
      paddingHorizontal: 16,
      paddingTop: 0,
      paddingBottom: 28,
      gap: 8,
    },
    stageWorkflowRow: {
      flexDirection: 'row',
      alignItems: 'stretch',
      gap: 8,
      paddingHorizontal: 16,
      paddingBottom: 10,
      marginTop: 2,
    },
    stageWorkflowChip: {
      flex: 1,
      minWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)',
      paddingVertical: 8,
      gap: 4,
    },
    stageWorkflowChipActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    stageWorkflowIcon: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stageWorkflowLabel: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 9,
      fontWeight: '800',
      textAlign: 'center',
      lineHeight: 11,
    },
    todaySection: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.03)' : 'rgba(255,255,255,0.03)',
      padding: 12,
      gap: 10,
    },
    todayHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    todayTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
    },
    todayBody: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
    },
    pieWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    pieShell: {
      width: 102,
      height: 102,
      borderRadius: 51,
      overflow: 'hidden',
      position: 'relative',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : '#101016',
    },
    pieQuarter: {
      position: 'absolute',
      width: '50%',
      height: '50%',
    },
    pieInner: {
      position: 'absolute',
      width: 50,
      height: 50,
      borderRadius: 25,
      left: 26,
      top: 26,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : '#0f1015',
    },
    pieNumber: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
    },
    pieLabel: {
      color: theme.colors.textMuted,
      fontSize: 9,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    pieLegend: {
      flex: 1,
      gap: 6,
    },
    pieLegendRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    pieLegendLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    pieDot: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
    },
    pieLegendText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '800',
    },
    pieLegendCount: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '800',
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 172,
      gap: 8,
    },
    card: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.04)',
      padding: 12,
      gap: 8,
      overflow: 'hidden',
      shadowColor: theme.mode === 'light' ? 'rgba(15, 18, 28, 0.18)' : theme.colors.shadow,
      shadowOpacity: theme.mode === 'light' ? 0.18 : 0.22,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 4,
    },
    cardGradient: {
      ...StyleSheet.absoluteFillObject,
      opacity: theme.mode === 'light' ? 0.85 : 1,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
      minWidth: 0,
    },
    avatarShell: {
      width: 44,
      height: 44,
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    avatarGradient: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
    },
    nameBlock: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    name: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    city: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      flexWrap: 'wrap',
      justifyContent: 'flex-end',
    },
    miniBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      borderWidth: 1,
    },
    miniBadgeText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 9,
      fontWeight: '900',
    },
    badgeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: theme.colors.accent,
    },
    badgeMuted: {
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255,255,255,0.06)',
      borderColor: theme.colors.border,
    },
    badgeWarn: {
      backgroundColor: theme.mode === 'light' ? 'rgba(216, 157, 32, 0.14)' : 'rgba(216, 157, 32, 0.18)',
      borderColor: 'rgba(216, 157, 32, 0.35)',
    },
    badgeAccent: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    badgeGood: {
      backgroundColor: theme.mode === 'light' ? 'rgba(34, 177, 111, 0.14)' : 'rgba(34, 177, 111, 0.18)',
      borderColor: 'rgba(34, 177, 111, 0.35)',
    },
    quoteText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
    },
    helperText: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
    },
    finalAmountHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    finalAmountHintText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '900',
    },
    responseTrack: {
      width: '100%',
      height: 4,
      borderRadius: 999,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.08)' : 'rgba(255,255,255,0.06)',
      overflow: 'hidden',
    },
    responseBar: {
      width: '36%',
      height: '100%',
      borderRadius: 999,
      backgroundColor: theme.colors.accent,
    },
    statusInkBadge: {
      alignSelf: 'flex-start',
      borderRadius: 22,
      paddingHorizontal: 12,
      paddingVertical: 8,
      minWidth: 126,
      position: 'relative',
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.08)' : 'rgba(122, 92, 255, 0.12)',
    },
    statusInkGlow: {
      position: 'absolute',
      width: 84,
      height: 84,
      borderRadius: 42,
      top: -28,
      right: -10,
      backgroundColor: theme.colors.accent,
      opacity: theme.mode === 'light' ? 0.12 : 0.18,
    },
    statusInkSplash: {
      position: 'absolute',
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: theme.colors.accent,
      opacity: theme.mode === 'light' ? 0.14 : 0.2,
    },
    statusInkSplashA: {
      top: 8,
      left: 10,
    },
    statusInkSplashB: {
      bottom: 6,
      right: 14,
    },
    statusInkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      zIndex: 1,
    },
    statusInkLabel: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    statusInkText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      lineHeight: 16,
      zIndex: 1,
    },
    empty: {
      color: theme.colors.textMuted,
      textAlign: 'center',
      paddingVertical: 18,
      fontWeight: '700',
    },
    skeletonLine: {
      height: 12,
      borderRadius: 999,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.08)' : 'rgba(255,255,255,0.08)',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.18)' : 'rgba(0,0,0,0.6)',
    },
    menuSheet: {
      flex: 1,
      justifyContent: 'flex-end',
      paddingHorizontal: 14,
      paddingBottom: 24,
    },
    menuCard: {
      borderRadius: 22,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : '#111116',
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 16,
      gap: 12,
    },
    detailCard: {
      borderRadius: 22,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : '#111116',
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      maxHeight: '58%',
      gap: 10,
    },
    menuHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    menuTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 17,
      fontWeight: '900',
    },
    menuBody: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 18,
      fontWeight: '700',
    },
    menuList: {
      gap: 8,
    },
    moneyFlowCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.03)' : 'rgba(255,255,255,0.04)',
      padding: 12,
    },
    moneyIconShell: {
      width: 52,
      height: 52,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : '#0f1015',
      alignItems: 'center',
      justifyContent: 'center',
    },
    moneyFlowCopy: {
      flex: 1,
      gap: 4,
    },
    moneyFlowTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    moneyFlowText: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
      fontWeight: '700',
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.04)',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    menuRowLabel: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    menuRowCount: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: '900',
    },
    iconBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    detailBody: {
      gap: 8,
      paddingBottom: 6,
    },
    detailProfileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    detailAvatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : '#101018',
      alignItems: 'center',
      justifyContent: 'center',
    },
    detailAvatarImage: {
      width: '100%',
      height: '100%',
    },
    detailAvatarText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    detailMeta: {
      flex: 1,
      gap: 3,
    },
    detailName: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 18,
      fontWeight: '900',
    },
    detailLine: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    detailInfoGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 2,
      marginBottom: 2,
    },
    detailInfoPill: {
      minWidth: '47%',
      flexGrow: 1,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.04)' : 'rgba(255,255,255,0.04)',
      paddingHorizontal: 10,
      paddingVertical: 9,
      gap: 3,
    },
    detailInfoLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    detailInfoValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
    },
    detailImage: {
      width: '100%',
      height: 170,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.04)' : '#101018',
    },
    detailImageEmpty: {
      width: '100%',
      height: 170,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.04)' : '#101018',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    detailImageEmptyText: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    detailSectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      marginTop: 6,
    },
    input: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.04)',
      paddingHorizontal: 11,
      paddingVertical: 10,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '700',
    },
    multilineInput: {
      minHeight: 68,
      textAlignVertical: 'top',
    },
    primaryBtn: {
      borderRadius: 14,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 11,
    },
    primaryBtnDisabled: {
      opacity: 0.55,
    },
    primaryBtnText: {
      color: theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
    },
    secondaryBtnInline: {
      minHeight: 40,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(255,255,255,0.05)',
      alignItems: 'center',
      justifyContent: 'center',
      minWidth: 138,
    },
    secondaryBtnInlineText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.3,
    },
    actionStack: {
      gap: 8,
      marginTop: 4,
    },
    detailActionRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    moneySelectCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.04)',
      padding: 9,
      gap: 7,
    },
    moneySelectRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 10,
      paddingVertical: 9,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.03)' : 'rgba(255,255,255,0.03)',
    },
    moneySelectRowActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    emptyStateCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.03)' : 'rgba(255,255,255,0.04)',
      paddingHorizontal: 14,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      minHeight: 132,
    },
    emptyStateTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
      textAlign: 'center',
    },
    emptyStateBody: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
      textAlign: 'center',
    },
  });

const StageGrid = ({
  styles,
  theme,
  counts,
  selectedStage,
  onSelect,
  pulseAnim,
}: {
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
  counts: Record<BookingStage, number>;
  selectedStage: BookingStage;
  onSelect: (stage: BookingStage) => void;
  pulseAnim: Animated.Value;
}) => (
  <View style={styles.stageGrid}>
    {STAGES.map((stage) => {
      const active = selectedStage === stage.key;
      const iconColor = stageColor(stage.key, theme.colors.accent);
      return (
        <TouchableOpacity key={stage.key} activeOpacity={0.95} onPress={() => onSelect(stage.key)} style={[styles.stageTile, active && styles.stageTileActive]}>
          {active ? (
            <Animated.View
              style={[
                styles.stageGlow,
                {
                  transform: [
                    {
                      scale: pulseAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.92, 1.14],
                      }),
                    },
                  ],
                  opacity: pulseAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.08, 0.18],
                  }),
                },
              ]}
            />
          ) : null}
          <View style={styles.stageIconRow}>
            <View style={styles.stageIconShell}>
              <Ionicons name={stage.icon} size={16} color={iconColor} />
            </View>
            <View style={styles.stageTileBody}>
              <Text style={styles.stageTitle}>{stage.short}</Text>
              <Text style={styles.stageSubtitle}>{STAGE_SUBTITLES[stage.key]}</Text>
            </View>
          </View>
          <View style={styles.stageTileMeta}>
            <Text style={styles.stageCount}>{counts[stage.key]}</Text>
            <Text style={styles.stageChevron}>{'>'}</Text>
          </View>
        </TouchableOpacity>
      );
    })}
  </View>
);

const BookingCard = ({
  item,
  styles,
  theme,
  avatarUri,
  quotePulse,
  onPress,
}: {
  item: BookingModel;
  styles: ReturnType<typeof createStyles>;
  theme: AppTheme;
  avatarUri?: string | null;
  quotePulse: Animated.Value;
  onPress: () => void;
}) => {
  const stage = bookingStageForRow(item);
  const waiting = isQuoteWaiting(item);
  const tone = stageTone(stage);

  return (
    <TouchableOpacity activeOpacity={0.95} onPress={onPress} style={styles.card}>
      <LinearGradient
        colors={
          tone === 'accent'
            ? [theme.colors.accentSoft, 'rgba(122, 92, 255, 0.04)', 'transparent']
            : tone === 'good'
              ? ['rgba(34, 177, 111, 0.1)', 'rgba(11, 11, 15, 0.02)', 'transparent']
              : tone === 'warn'
                ? ['rgba(216, 157, 32, 0.08)', 'rgba(11, 11, 15, 0.02)', 'transparent']
                : ['rgba(126, 134, 148, 0.08)', 'rgba(11, 11, 15, 0.02)', 'transparent']
        }
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cardGradient}
      />

      <View style={styles.cardHeader}>
        <View style={styles.profileRow}>
          <View style={styles.avatarShell}>
            {avatarUri ? (
              <Image source={{ uri: avatarUri }} style={styles.avatarImage} resizeMode="cover" />
            ) : (
              <LinearGradient colors={[theme.colors.accentSoft, theme.colors.accent, 'rgba(11,11,15,0.18)']} style={styles.avatarGradient}>
                <Text style={styles.avatarText}>{avatarLabel(item.userName ?? item.userEmail ?? 'Client')}</Text>
              </LinearGradient>
            )}
          </View>

          <View style={styles.nameBlock}>
            <Text style={styles.name} numberOfLines={1}>
              {item.userName ?? item.userEmail ?? 'Client'}
            </Text>
            <Text style={styles.city} numberOfLines={1}>
              {cityFromLocation(item.location)}
            </Text>
          </View>
        </View>

        <View style={styles.badgeRow}>
          <View style={[styles.miniBadge, styles.badgeMuted]}>
            <View style={styles.badgeDot} />
            <Text style={styles.miniBadgeText}>{String(item.aiSkinCheckStatus ?? 'safe').toUpperCase() === 'SAFE' ? 'Safe' : String(item.aiSkinCheckStatus ?? 'safe').toUpperCase()}</Text>
          </View>
          <View
            style={[
              styles.miniBadge,
              tone === 'accent' ? styles.badgeAccent : tone === 'good' ? styles.badgeGood : tone === 'warn' ? styles.badgeWarn : styles.badgeMuted,
            ]}
          >
            <View style={styles.badgeDot} />
            <Text style={styles.miniBadgeText}>{bookingStatusLabel(item.status)}</Text>
          </View>
        </View>
      </View>

      <Text style={styles.quoteText} numberOfLines={1}>
        {item.quoteRangeLabel ? item.quoteRangeLabel : 'Quote pending'}
      </Text>

      {stage === 'work_done' && !item.finalStudioAmount ? (
        <View style={styles.finalAmountHint}>
          <Ionicons name="cash-outline" size={13} color={theme.colors.accent} />
          <Text style={styles.finalAmountHintText}>User marked work done</Text>
        </View>
      ) : null}

      {waiting ? (
        <>
          <Text style={styles.helperText}>Waiting for artist response</Text>
          <View style={styles.responseTrack}>
            <Animated.View
              style={[
                styles.responseBar,
                {
                  transform: [
                    {
                      translateX: quotePulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-28, 190],
                      }),
                    },
                  ],
                },
              ]}
            />
          </View>
        </>
      ) : null}

      <View style={styles.statusInkBadge}>
        <View style={styles.statusInkGlow} />
        <View style={[styles.statusInkSplash, styles.statusInkSplashA]} />
        <View style={[styles.statusInkSplash, styles.statusInkSplashB]} />
        <View style={styles.statusInkRow}>
          <Ionicons
            name={stage === 'confirmed' ? 'checkmark-circle' : stage === 'work_done' ? 'ribbon-outline' : stage === 'rejected' ? 'close-circle-outline' : 'ellipse'}
            size={13}
            color={theme.colors.accent}
          />
          <Text style={styles.statusInkLabel}>Current status</Text>
        </View>
        <Text style={styles.statusInkText}>{bookingStatusLabel(item.status)}</Text>
      </View>
    </TouchableOpacity>
  );
};

const SkeletonCard = ({ theme, styles }: { theme: AppTheme; styles: ReturnType<typeof createStyles> }) => (
  <View style={[styles.card, { backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.04)' }]}>
    <View style={styles.skeletonLine} />
    <View style={[styles.skeletonLine, { width: '72%' }]} />
    <View style={[styles.skeletonLine, { width: '58%' }]} />
  </View>
);

const ArtistBookingsPanel = ({ header, initialBookingId }: ArtistBookingsPanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const uid = auth.currentUser?.uid ?? '';

  const [rows, setRows] = useState<BookingModel[]>([]);
  const [detail, setDetail] = useState<BookingModel | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState<BookingStage>('requested');
  const [stagePageOpen, setStagePageOpen] = useState(false);
  const [userImageMap, setUserImageMap] = useState<Record<string, string>>({});
  const [revenueBusy, setRevenueBusy] = useState(false);
  const [selectedRevenueBookingId, setSelectedRevenueBookingId] = useState('');
  const [collectedAmount, setCollectedAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [quoteInput, setQuoteInput] = useState('');
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [rescheduleBusy, setRescheduleBusy] = useState<'accept' | 'reject' | null>(null);

  const pulseAnim = useRef(new Animated.Value(0)).current;
  const quotePulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 1200, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ]),
    );
    const quoteLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(quotePulse, { toValue: 1, duration: 1100, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(quotePulse, { toValue: 0, duration: 1100, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ]),
    );

    pulseLoop.start();
    quoteLoop.start();

    return () => {
      pulseLoop.stop();
      quoteLoop.stop();
    };
  }, [pulseAnim, quotePulse]);

  useEffect(() => {
    if (!uid) return;
    void expireStaleQuotesForUser({ uid, role: 'artist' }).catch(() => {});

    const q = query(collection(db, 'bookings'), where('artistUid', '==', uid), orderBy('updatedAt', 'desc'), limit(250));
    const fallbackQuery = query(collection(db, 'bookings'), where('artistUid', '==', uid), limit(250));
    let fallbackUnsub: (() => void) | null = null;
    let active = true;
    const applyRows = (snap: any) => {
      const next = snap.docs
        .map((docSnap: any) => ({ id: docSnap.id, ...(docSnap.data() as any) }) as BookingModel)
        .sort((a: BookingModel, b: BookingModel) => activityMillis(b) - activityMillis(a));
      setRows(next);
      setLoading(false);
      setDetail((prev) => {
        if (!prev) return prev;
        return next.find((row: BookingModel) => row.id === prev.id) ?? prev;
      });
    };
    const startFallback = () => {
      if (!active || fallbackUnsub) return;
      fallbackUnsub = onSnapshot(fallbackQuery, applyRows, () => {
        setRows([]);
        setLoading(false);
      });
    };
    const unsub = onSnapshot(
      q,
      applyRows,
      startFallback,
    );

    return () => {
      active = false;
      unsub();
      fallbackUnsub?.();
    };
  }, [uid]);

  useEffect(() => {
    const safeBookingId = String(initialBookingId ?? '').trim();
    if (!safeBookingId || !rows.length) return;
    const target = rows.find((row) => row.id === safeBookingId);
    if (!target) return;
    setSelectedStage(bookingStageForRow(target));
    setStagePageOpen(true);
    setDetail(target);
  }, [initialBookingId, rows]);

  const stageCounts = useMemo<Record<BookingStage, number>>(
    () =>
      rows.reduce<Record<BookingStage, number>>(
        (acc, row) => {
          acc[bookingStageForRow(row)] += 1;
          return acc;
        },
        { requested: 0, confirmed: 0, reschedule_requested: 0, work_done: 0, rejected: 0 },
      ),
    [rows],
  );

  const filteredRows = useMemo(
    () => rows.filter((row) => bookingStageForRow(row) === selectedStage),
    [rows, selectedStage],
  );

  const workDoneRows = useMemo(() => rows.filter((row) => bookingStageForRow(row) === 'work_done'), [rows]);
  const selectedRevenueBooking = useMemo(
    () => workDoneRows.find((row) => row.id === selectedRevenueBookingId) ?? workDoneRows[0] ?? null,
    [selectedRevenueBookingId, workDoneRows],
  );

  useEffect(() => {
    let cancelled = false;
    const userUids = Array.from(new Set(rows.map((row) => String(row.userUid ?? '')).filter(Boolean)));
    if (!userUids.length) {
      setUserImageMap({});
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const entries = await Promise.all(
        userUids.map(async (userUid) => {
          try {
            const snap = await getDoc(doc(db, 'users', userUid));
            const imageUrl = snap.exists() ? String((snap.data() as any)?.profileImageUrl ?? '').trim() : '';
            return [userUid, imageUrl] as const;
          } catch {
            return [userUid, ''] as const;
          }
        }),
      );

      if (cancelled) return;
      setUserImageMap(
        entries.reduce<Record<string, string>>((acc, [userUid, imageUrl]) => {
          if (imageUrl) acc[userUid] = imageUrl;
          return acc;
        }, {}),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [rows]);

  useEffect(() => {
    if (!menuOpen) return;
    const nextBooking = workDoneRows[0]?.id ?? '';
    setSelectedRevenueBookingId((prev) => (prev && workDoneRows.some((row) => row.id === prev) ? prev : nextBooking));
  }, [menuOpen, workDoneRows]);

  useEffect(() => {
    if (!detail) {
      setQuoteInput('');
      return;
    }
    setQuoteInput(String(detail.quoteRangeLabel ?? '').replace('Rs. ', '').replace(/,/g, '').trim());
  }, [detail]);

  const canShareQuote = detail
    ? ['pending_artist_quote', 'pending_artist_approval', 'artist_approved_payment_pending'].includes(String(detail.status ?? ''))
    : false;

  const saveManualQuote = async () => {
    if (!detail || !canShareQuote || quoteBusy) return;
    const numeric = Number(String(quoteInput).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    setQuoteBusy(true);
    try {
      const quoteLabel = `Rs. ${numeric.toLocaleString('en-IN')}`;
      await updateDoc(doc(db, 'bookings', detail.id), {
        quoteRangeLabel: quoteLabel,
        quoteReason: 'Shared by artist from booking dashboard.',
        status: 'quote_sent_payment_pending',
        quotedAt: serverTimestamp(),
        quotedByArtistUid: uid,
        updatedAt: serverTimestamp(),
      } as any);

      if (detail.userUid) {
        await writeNotificationDual({
          id: `booking_quote_sent_${detail.id}_manual`,
          toUid: String(detail.userUid),
          fromUid: uid,
          fromName: auth.currentUser?.displayName ?? detail.artistName ?? 'Artist',
          type: 'booking_quote_sent',
          title: 'Artist shared your quote',
          message: `Estimated tattoo amount: ${quoteLabel}.`,
          entityType: 'booking',
          entityId: detail.id,
          bookingId: detail.id,
          dateISO: detail.dateISO ?? null,
          metadata: { quoteRangeLabel: quoteLabel, manualQuote: true },
        });
      }
      setDetail((prev) => (prev ? { ...prev, quoteRangeLabel: quoteLabel, status: 'quote_sent_payment_pending' as any } : prev));
    } finally {
      setQuoteBusy(false);
    }
  };

  const saveCollectedRevenue = async () => {
    if (!selectedRevenueBooking || revenueBusy) return;
    const numeric = Number(String(collectedAmount).replace(/[^\d.]/g, ''));
    if (!Number.isFinite(numeric) || numeric <= 0) return;
    setRevenueBusy(true);
    try {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const method = /upi/i.test(paymentNote) ? 'upi' : 'manual';

      await setDoc(
        doc(db, 'artistTransactions', selectedRevenueBooking.id),
        {
          bookingId: selectedRevenueBooking.id,
          artistUid: uid,
          artistId: selectedRevenueBooking.artistId ?? uid,
          userUid: String(selectedRevenueBooking.userUid ?? ''),
          userId: String(selectedRevenueBooking.userUid ?? ''),
          clientName: selectedRevenueBooking.userName ?? selectedRevenueBooking.userEmail ?? 'Client',
          bookingConfirmationFee: numeric,
          finalStudioAmount: numeric,
          finalPaymentAmount: numeric,
          payoutStatus: 'manual_tracked',
          payoutMethod: method,
          paymentMethodNote: paymentNote.trim() || null,
          amount: numeric,
          date: now.toISOString(),
          month,
          status: 'collected',
          collectedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      await updateDoc(doc(db, 'bookings', selectedRevenueBooking.id), {
        finalStudioAmount: numeric,
        finalAmountNote: paymentNote.trim() || null,
        finalAmountSubmittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      } as any);

      setCollectedAmount('');
      setPaymentNote('');
      setMenuOpen(false);
    } finally {
      setRevenueBusy(false);
    }
  };


  const activeHeading =
    selectedStage === 'requested'
      ? 'Request'
      : selectedStage === 'confirmed'
        ? 'Confirmed'
        : selectedStage === 'reschedule_requested'
          ? 'Reschedule'
          : selectedStage === 'work_done'
            ? 'Work Done'
            : 'Rejected';

  return (
    <View style={styles.container}>
      {!stagePageOpen ? (
        <>
          {header ? <View style={styles.headerWrap}>{header}</View> : null}

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Bookings</Text>
            <TouchableOpacity activeOpacity={0.95} onPress={() => setMenuOpen(true)} style={styles.moreBtn} accessibilityRole="button" accessibilityLabel="Booking dashboard options">
              <Ionicons name="cash-outline" size={20} color={theme.colors.accent} />
            </TouchableOpacity>
          </View>

          <StageGrid
            styles={styles}
            theme={theme}
            counts={stageCounts}
            selectedStage={selectedStage}
            onSelect={(stage) => {
              setSelectedStage(stage);
              setStagePageOpen(true);
            }}
            pulseAnim={pulseAnim}
          />
        </>
      ) : null}

      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)} />
        <View style={styles.menuSheet}>
          <View style={styles.menuCard}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>How much amount did you collect from this client?</Text>
              <TouchableOpacity activeOpacity={0.95} onPress={() => setMenuOpen(false)} style={styles.iconBtn}>
                <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            <Text style={styles.menuBody}>Pick a work-done client, enter the final amount collected, and save it for revenue tracking.</Text>
            <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={styles.menuList} showsVerticalScrollIndicator={false}>
              <View style={styles.moneyFlowCard}>
                <View style={styles.moneyIconShell}>
                  <Ionicons name="cash-outline" size={22} color={theme.colors.accent} />
                </View>
                <View style={styles.moneyFlowCopy}>
                  <Text style={styles.moneyFlowTitle}>Client name</Text>
                  <Text style={styles.moneyFlowText}>{selectedRevenueBooking?.userName ?? selectedRevenueBooking?.userEmail ?? 'Choose a client below'}</Text>
                </View>
              </View>

              {workDoneRows.length ? (
                <View style={styles.moneySelectCard}>
                  {workDoneRows.map((row) => (
                    <TouchableOpacity
                      key={row.id}
                      activeOpacity={0.92}
                      onPress={() => setSelectedRevenueBookingId(row.id)}
                      style={[styles.moneySelectRow, selectedRevenueBookingId === row.id && styles.moneySelectRowActive]}
                    >
                      <Text style={styles.menuRowLabel}>{row.userName ?? row.userEmail ?? 'Client'}</Text>
                      <Text style={styles.selectedStageCity}>{requestDateTimeLabel(row)}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyStateCard}>
                  <Ionicons name="cash-outline" size={22} color={theme.colors.textMuted} />
                  <Text style={styles.emptyStateTitle}>No work done clients</Text>
                  <Text style={styles.emptyStateBody}>Once a client marks work done, collected amount tracking appears here.</Text>
                </View>
              )}

              <TextInput
                value={collectedAmount}
                onChangeText={setCollectedAmount}
                keyboardType="numeric"
                placeholder="Final amount collected"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
              />
              <TextInput
                value={paymentNote}
                onChangeText={setPaymentNote}
                placeholder="Payment method / UPI note (optional)"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, styles.multilineInput]}
                multiline
              />
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={saveCollectedRevenue}
                disabled={!selectedRevenueBooking || !collectedAmount.trim() || revenueBusy}
                style={[styles.primaryBtn, (!selectedRevenueBooking || !collectedAmount.trim() || revenueBusy) && styles.primaryBtnDisabled]}
              >
                <Text style={styles.primaryBtnText}>{revenueBusy ? 'Saving...' : 'Save'}</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {stagePageOpen ? (
        <View style={styles.stagePageSheet}>
          <View style={styles.stagePageHeader}>
            <TouchableOpacity activeOpacity={0.92} onPress={() => setStagePageOpen(false)} style={styles.stagePageBack}>
              <Ionicons name="arrow-back" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
            </TouchableOpacity>
            <View style={styles.stagePageTitleWrap}>
              <Text style={styles.selectedStageTitle}>{activeHeading}</Text>
              <Text style={styles.selectedStageMeta}>{stageCounts[selectedStage]} booking{stageCounts[selectedStage] === 1 ? '' : 's'}</Text>
            </View>
            <View style={styles.selectedStageCountPill}>
              <Text style={styles.selectedStageCountText}>{stageCounts[selectedStage]}</Text>
            </View>
          </View>

          <View style={styles.stageWorkflowRow}>
            {STAGES.map((stage) => {
              const active = stage.key === selectedStage;
              return (
                <TouchableOpacity key={stage.key} activeOpacity={0.9} onPress={() => setSelectedStage(stage.key)} style={[styles.stageWorkflowChip, active && styles.stageWorkflowChipActive]}>
                  <View style={styles.stageWorkflowIcon}>
                    <Ionicons name={stage.icon} size={12} color={active ? theme.colors.accent : theme.colors.textMuted} />
                  </View>
                  <Text numberOfLines={2} style={styles.stageWorkflowLabel}>
                    {stage.short}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {loading ? (
            <View style={styles.stagePageBody}>
              <SkeletonCard theme={theme} styles={styles} />
              <SkeletonCard theme={theme} styles={styles} />
              <SkeletonCard theme={theme} styles={styles} />
            </View>
          ) : (
            <FlatList
              data={filteredRows}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.stagePageBody}
              ListEmptyComponent={
                <View style={styles.emptyStateCard}>
                  <Ionicons name="albums-outline" size={22} color={theme.colors.textMuted} />
                  <Text style={styles.emptyStateTitle}>No clients in this stage</Text>
                  <Text style={styles.emptyStateBody}>New requests and updates will appear here as the workflow moves.</Text>
                </View>
              }
              renderItem={({ item }) => (
                <BookingCard
                  item={item}
                  styles={styles}
                  theme={theme}
                  avatarUri={userImageMap[String(item.userUid ?? '')] ?? null}
                  quotePulse={quotePulse}
                  onPress={() => setDetail(item)}
                />
              )}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      ) : null}

      <Modal visible={Boolean(detail)} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.backdrop} onPress={() => setDetail(null)} />
        <View style={styles.menuSheet}>
          <View style={styles.detailCard}>
            <View style={styles.menuHeader}>
              <Text style={styles.menuTitle}>Booking Detail</Text>
              <TouchableOpacity activeOpacity={0.95} onPress={() => setDetail(null)} style={styles.iconBtn}>
                <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>

            {detail ? (
              <ScrollView contentContainerStyle={styles.detailBody} showsVerticalScrollIndicator={false}>
                <View style={styles.detailProfileRow}>
                  <View style={styles.detailAvatar}>
                    {userImageMap[String(detail.userUid ?? '')] ? (
                      <Image source={{ uri: userImageMap[String(detail.userUid ?? '')] }} style={styles.detailAvatarImage} resizeMode="cover" />
                    ) : (
                      <Text style={styles.detailAvatarText}>{avatarLabel(detail.userName ?? detail.userEmail ?? 'Client')}</Text>
                    )}
                  </View>
                  <View style={styles.detailMeta}>
                    <Text style={styles.detailName}>{detail.userName ?? detail.userEmail ?? 'Client'}</Text>
                    <Text style={styles.detailLine}>Location: {String(detail.location ?? cityFromLocation(detail.location))}</Text>
                    <Text style={styles.detailLine}>Requested on: {requestDateTimeLabel(detail)}</Text>
                  </View>
                </View>
                <View style={styles.detailInfoGrid}>
                  <View style={styles.detailInfoPill}>
                    <Text style={styles.detailInfoLabel}>Status</Text>
                    <Text style={styles.detailInfoValue}>{bookingStatusLabel(detail.status)}</Text>
                  </View>
                  <View style={styles.detailInfoPill}>
                    <Text style={styles.detailInfoLabel}>Safety</Text>
                    <Text style={styles.detailInfoValue}>{String(detail.aiSkinCheckStatus ?? 'safe').replace(/^\w/, (m) => m.toUpperCase())}</Text>
                  </View>
                  <View style={styles.detailInfoPill}>
                    <Text style={styles.detailInfoLabel}>Quote</Text>
                    <Text style={styles.detailInfoValue}>{detail.quoteRangeLabel ?? 'Quote pending'}</Text>
                  </View>
                  <View style={styles.detailInfoPill}>
                    <Text style={styles.detailInfoLabel}>Slot</Text>
                    <Text style={styles.detailInfoValue}>{detail.dateISO} • {bookingSlotLabel(detail)}</Text>
                  </View>
                </View>
                <Text style={styles.detailLine}>Tattoo Size: {detail.tattooSizeInches ?? 'Not shared'}</Text>
                <Text style={styles.detailLine}>Booking details: {detail.aiSkinCheckNotes || 'Artist can review slot, location, and reference from this request.'}</Text>
                {detail.designImageUrl ? (
                  <>
                    <Text style={styles.detailSectionTitle}>Tattoo Reference Image</Text>
                    <Image source={{ uri: detail.designImageUrl }} style={styles.detailImage} resizeMode="cover" />
                  </>
                ) : (
                  <View style={styles.detailImageEmpty}>
                    <Ionicons name="image-outline" size={28} color={theme.colors.textMuted} />
                    <Text style={styles.detailImageEmptyText}>No tattoo reference image uploaded</Text>
                  </View>
                )}

                {canShareQuote ? (
                  <View style={styles.actionStack}>
                    <Text style={styles.detailSectionTitle}>Share your quote</Text>
                    <TextInput
                      value={quoteInput}
                      onChangeText={setQuoteInput}
                      keyboardType="numeric"
                      placeholder="Enter amount to share with user"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.input}
                    />
                    <TouchableOpacity
                      activeOpacity={0.92}
                      onPress={saveManualQuote}
                      disabled={!quoteInput.trim() || quoteBusy}
                      style={[styles.primaryBtn, (!quoteInput.trim() || quoteBusy) && styles.primaryBtnDisabled]}
                    >
                      <Text style={styles.primaryBtnText}>{quoteBusy ? 'Sharing...' : 'Share Quote'}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {String(detail.status ?? '') === 'reschedule_requested' ? (
                  <View style={styles.actionStack}>
                    <Text style={styles.detailSectionTitle}>Reschedule request</Text>
                    <Text style={styles.detailLine}>
                      Proposed Slot: {detail.proposedDateISO ?? detail.dateISO} • {String(detail.proposedSlotTimeLabel ?? detail.proposedSlotId ?? 'Time updating')}
                    </Text>
                    <View style={styles.detailActionRow}>
                      <TouchableOpacity
                        activeOpacity={0.92}
                        onPress={async () => {
                          setRescheduleBusy('reject');
                          try {
                            await respondToBookingReschedule({ bookingId: detail.id, accept: false });
                            setDetail((prev) => (prev ? { ...prev, status: 'confirmed' as any, proposedDateISO: null, proposedSlotId: null, proposedSlotTimeLabel: null } : prev));
                          } finally {
                            setRescheduleBusy(null);
                          }
                        }}
                        disabled={Boolean(rescheduleBusy)}
                        style={[styles.secondaryBtnInline, Boolean(rescheduleBusy) && styles.primaryBtnDisabled]}
                      >
                        <Text style={styles.secondaryBtnInlineText}>{rescheduleBusy === 'reject' ? 'Rejecting...' : 'Reject Reschedule'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        activeOpacity={0.92}
                        onPress={async () => {
                          setRescheduleBusy('accept');
                          try {
                            await respondToBookingReschedule({ bookingId: detail.id, accept: true });
                            setDetail((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    status: 'confirmed' as any,
                                    dateISO: prev.proposedDateISO ?? prev.dateISO,
                                    slotId: (prev.proposedSlotId as any) ?? prev.slotId,
                                    slotTimeLabel: prev.proposedSlotTimeLabel ?? prev.slotTimeLabel,
                                    proposedDateISO: null,
                                    proposedSlotId: null,
                                    proposedSlotTimeLabel: null,
                                  }
                                : prev,
                            );
                          } finally {
                            setRescheduleBusy(null);
                          }
                        }}
                        disabled={Boolean(rescheduleBusy)}
                        style={[styles.primaryBtn, Boolean(rescheduleBusy) && styles.primaryBtnDisabled]}
                      >
                        <Text style={styles.primaryBtnText}>{rescheduleBusy === 'accept' ? 'Accepting...' : 'Accept Reschedule'}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default ArtistBookingsPanel;
