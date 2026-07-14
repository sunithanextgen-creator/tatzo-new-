import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Linking } from 'react-native';
import Constants from 'expo-constants';
import { auth, db } from '../config/firebaseConfig';
import { getPaymentsServerUrl } from '../config/payments';
import type { AiSkinCheckStatus, BookingStatus, TimeSlotId } from '../types/app';
import { writeNotificationDual } from './notifications';
import { getArtistBookingMessage, getArtistSettingsFromProfile, getArtistPublicVisibility, isArtistAcceptingBookings, isArtistAvailableOnDate } from './artistSettings';

const SLOT_HOLD_MINUTES = 15;
export const BOOKING_CONFIRMATION_FEE_RUPEES = 249;
export const QUOTE_EXPIRY_HOURS = 24;
export const ARTIST_RESPONSE_SLA_HOURS = 24;
export const AUTO_REJECT_REASON_NO_RESPONSE = 'Artist did not respond in time.';
export type SharedBookingStage = 'requested' | 'confirmed' | 'reschedule_requested' | 'work_done' | 'rejected';
export type BookingPaymentState = 'pending' | 'paid' | 'failed' | 'expired';
export type BookingQuoteRangeId = '1000_2000' | '2000_3000' | '3000_5000' | '5000_8000' | '8000_plus';
export const BOOKING_QUOTE_RANGES: Array<{ id: BookingQuoteRangeId; label: string }> = [
  { id: '1000_2000', label: 'Rs. 1,000-2,000' },
  { id: '2000_3000', label: 'Rs. 2,000-3,000' },
  { id: '3000_5000', label: 'Rs. 3,000-5,000' },
  { id: '5000_8000', label: 'Rs. 5,000-8,000' },
  { id: '8000_plus', label: 'Rs. 8,000+' },
];

export const createBookingDraftId = () => doc(collection(db, 'bookings')).id;

const buildPaymentReturnUrl = () => {
  const appOwnership = String((Constants as any)?.appOwnership ?? '').toLowerCase();
  if (appOwnership !== 'expo') return 'tatzo://payment';

  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri;

  if (!hostUri) return 'tatzo://payment';
  const host = String(hostUri);
  return `exp://${host}/--/payment`;
};

const toMillis = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1_000_000);
  return 0;
};

const quoteRangeLabel = (id?: string | null) => BOOKING_QUOTE_RANGES.find((row) => row.id === id)?.label ?? null;
const slotLockDocId = (artistUid: string, dateISO: string, slotId: TimeSlotId) => `${artistUid}_${dateISO}_${slotId}`;
const bookingFee = () => BOOKING_CONFIRMATION_FEE_RUPEES;
const quoteExpiryFromNow = () => Timestamp.fromMillis(Date.now() + QUOTE_EXPIRY_HOURS * 60 * 60 * 1000);
const requestHoldExpiryFromNow = () => Timestamp.fromMillis(Date.now() + QUOTE_EXPIRY_HOURS * 60 * 60 * 1000);

const isTerminalStatus = (status: BookingStatus | string | null | undefined) =>
  status === 'confirmed' ||
  status === 'completed' ||
  status === 'cancelled' ||
  status === 'rejected' ||
  status === 'payment_failed' ||
  status === 'payment_timeout' ||
  status === 'quote_expired';

const isPayableStatus = (status: BookingStatus | string | null | undefined) =>
  status === 'quote_sent_payment_pending' ||
  status === 'payment_failed' ||
  // Legacy records only. New bookings must use quote_sent_payment_pending.
  status === 'artist_approved_payment_pending';

export const getSharedBookingStage = (row: { status?: unknown; completionRequestedByUser?: unknown }): SharedBookingStage => {
  const status = String(row?.status ?? '');
  if (['rejected', 'cancelled', 'expired', 'quote_expired', 'booking_quote_expired', 'payment_timeout'].includes(status)) return 'rejected';
  if (status === 'reschedule_requested') return 'reschedule_requested';
  if (Boolean(row?.completionRequestedByUser) || status === 'final_payment_pending' || status === 'completed') return 'work_done';
  if (status === 'confirmed') return 'confirmed';
  return 'requested';
};

export const getBookingPaymentStatus = (row: { status?: unknown; payment?: any; finalPaymentStatus?: unknown; finalPayment?: any }): BookingPaymentState => {
  const status = String(row?.status ?? '');
  if (status === 'quote_expired' || status === 'payment_timeout') return 'expired';
  if (status === 'payment_failed') return 'failed';
  if (status === 'final_payment_pending') {
    const finalState = String(row?.finalPaymentStatus ?? '');
    if (['artist_confirmed_paid', 'completed'].includes(finalState) || String(row?.finalPayment?.status ?? '') === 'paid') return 'paid';
    return 'pending';
  }
  if (status === 'confirmed' || status === 'reschedule_requested' || status === 'completed') return 'paid';
  if (String(row?.payment?.status ?? '') === 'paid') return 'paid';
  return 'pending';
};

const isLockActive = (lock: any, nowMs: number) => {
  if (!lock) return false;
  const status = String(lock.status ?? '');
  if (status === 'confirmed') return true;
  if (status !== 'held') return false;
  const expiresAtMs = toMillis(lock.expiresAt);
  return expiresAtMs > nowMs;
};

const slotStartHour24 = (slotTimeLabel?: string | null, slotId?: string | null) => {
  const explicit = String(slotTimeLabel ?? '').trim();
  const match = explicit.match(/(\d{1,2})\s*(AM|PM)/i);
  if (match) {
    let hour = Number(match[1]) % 12;
    if (match[2].toUpperCase() === 'PM') hour += 12;
    return hour;
  }
  if (slotId === 'morning') return 10;
  if (slotId === 'afternoon') return 13;
  if (slotId === 'evening') return 17;
  return 10;
};

const slotDateTimeMs = (dateISO?: string | null, slotTimeLabel?: string | null, slotId?: string | null) => {
  const value = String(dateISO ?? '');
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 0;
  const [, year, month, day] = match;
  const startHour = slotStartHour24(slotTimeLabel, slotId);
  return new Date(Number(year), Number(month) - 1, Number(day), startHour, 0, 0, 0).getTime();
};

const resolveArtistUidByIdentity = async (params: { artistUid?: string; artistName: string; artistHandle?: string }) => {
  if (params.artistUid?.trim()) return params.artistUid.trim();

  const byName = query(collection(db, 'artists'), where('displayName', '==', params.artistName), limit(1));
  const byNameSnap = await getDocs(byName);
  if (!byNameSnap.empty) return byNameSnap.docs[0].id;

  if (params.artistHandle?.trim()) {
    const byHandle = query(collection(db, 'artists'), where('handle', '==', params.artistHandle.trim()), limit(1));
    const byHandleSnap = await getDocs(byHandle);
    if (!byHandleSnap.empty) return byHandleSnap.docs[0].id;
  }

  return null;
};

export type BookingDesignMeta = {
  fileName?: string;
  mimeType?: string;
  size?: number;
  storagePath?: string;
};

export type CreateBookingInput = {
  artistId: string;
  artistUid?: string;
  artistName: string;
  artistHandle?: string;
  location: string;
  dateISO: string;
  slotId: TimeSlotId;
  slotTimeLabel?: string;
  startingFrom: number;
  depositAmount?: number;
  bookingId?: string;
  tattooSizeInches?: string | null;
  tattooSizeNotSure?: boolean;
  designImageUrl?: string | null;
  designImageMeta?: BookingDesignMeta | null;
  aiSkinCheckStatus: AiSkinCheckStatus;
  aiRiskScore: number;
  aiSkinCheckNotes: string;
  aiFlagForArtist: boolean;
  skinAnswers?: Record<string, string>;
};

export type UserPayableBooking = {
  id: string;
  artistName: string;
  dateISO: string;
  slotId: TimeSlotId;
  slotTimeLabel?: string;
  depositAmount: number;
  bookingConfirmationFee?: number;
  status: BookingStatus;
  paymentKind: 'booking_confirmation' | 'final_payment';
  finalStudioAmount?: number | null;
  finalAmountNote?: string | null;
  finalPaymentStatus?: 'pending' | 'user_marked_paid' | 'artist_confirmed_paid' | 'disputed' | 'completed' | null;
  artistPaymentMethod?: 'upi' | 'razorpay_link' | null;
  artistUpiId?: string | null;
  artistRazorpayPaymentLink?: string | null;
  paymentProofUrl?: string | null;
  paymentProofMeta?: { fileName?: string; mimeType?: string; size?: number; storagePath?: string } | null;
  quoteRange?: BookingQuoteRangeId | null;
  quoteRangeLabel?: string | null;
  quoteReason?: string | null;
  quoteExpiresAt?: unknown;
};

const mapPayableBooking = (id: string, d: any): UserPayableBooking => {
  const status = String(d.status ?? '') as BookingStatus;
  const finalAmount = Number(d.finalStudioAmount ?? 0);
  const isFinalPayment = status === 'final_payment_pending';
  return {
    id,
    artistName: String(d.artistName ?? 'Artist'),
    dateISO: String(d.dateISO ?? ''),
    slotId: (d.slotId ?? 'morning') as TimeSlotId,
    slotTimeLabel: String(d.slotTimeLabel ?? '').trim() || undefined,
    depositAmount: isFinalPayment && finalAmount > 0 ? finalAmount : Number(d.bookingConfirmationFee ?? d.depositAmount ?? bookingFee()),
    bookingConfirmationFee: Number(d.bookingConfirmationFee ?? bookingFee()),
    status,
    paymentKind: isFinalPayment ? 'final_payment' : 'booking_confirmation',
    finalStudioAmount: Number.isFinite(finalAmount) && finalAmount > 0 ? finalAmount : null,
    finalAmountNote: d.finalAmountNote ?? null,
    finalPaymentStatus: d.finalPaymentStatus ?? null,
    artistPaymentMethod: d.artistPaymentMethod ?? null,
    artistUpiId: d.artistUpiId ?? null,
    artistRazorpayPaymentLink: d.artistRazorpayPaymentLink ?? null,
    paymentProofUrl: d.paymentProofUrl ?? null,
    paymentProofMeta: d.paymentProofMeta ?? null,
    quoteRange: (d.quoteRange ?? null) as BookingQuoteRangeId | null,
    quoteRangeLabel: d.quoteRangeLabel ?? quoteRangeLabel(d.quoteRange),
    quoteReason: d.quoteReason ?? null,
    quoteExpiresAt: d.quoteExpiresAt ?? null,
  };
};

export const createBooking = async (input: CreateBookingInput) => {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');

  const artistUid = await resolveArtistUidByIdentity({
    artistUid: input.artistUid,
    artistName: input.artistName,
    artistHandle: input.artistHandle,
  });

  if (!artistUid) {
    throw new Error('Artist is not onboarded yet. Please choose an onboarded artist.');
  }

  const artistSnap = await getDoc(doc(db, 'artists', artistUid));
  if (!artistSnap.exists()) throw new Error('Artist profile is not available right now.');
  const artistData = artistSnap.data() as any;
  const artistSettings = getArtistSettingsFromProfile(artistData);
  if (!getArtistPublicVisibility(artistSettings)) {
    throw new Error('This profile is private.');
  }
  if (!isArtistAcceptingBookings(artistSettings)) {
    throw new Error(getArtistBookingMessage(artistSettings) || 'Bookings are currently unavailable.');
  }
  if (!isArtistAvailableOnDate(input.dateISO, artistSettings)) {
    throw new Error('Artist is unavailable on the selected day. Please choose an available day.');
  }

  const safeSize = String(input.tattooSizeInches ?? '').trim();
  const sizeNotSure = Boolean(input.tattooSizeNotSure || !safeSize);
  const fee = bookingFee();
  const bookingRef = input.bookingId ? doc(db, 'bookings', input.bookingId) : doc(collection(db, 'bookings'));
  const slotRef = doc(db, 'bookingSlots', slotLockDocId(artistUid, input.dateISO, input.slotId));
  const nowMs = Date.now();
  const expiresAt = requestHoldExpiryFromNow();

  try {
    await runTransaction(db, async (tx) => {
      const slotSnap = await tx.get(slotRef);
      const slotData = slotSnap.exists() ? slotSnap.data() : null;

      if (slotData && isLockActive(slotData, nowMs) && slotData.bookingId !== bookingRef.id) {
        throw new Error('This time slot is already booked. Please choose another slot.');
      }

      tx.set(slotRef, {
        artistUid,
        dateISO: input.dateISO,
        slotId: input.slotId,
        bookingId: bookingRef.id,
        status: 'held',
        expiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      tx.set(bookingRef, {
        id: bookingRef.id,
        userUid: user.uid,
        userEmail: user.email ?? null,
        userName: user.displayName ?? null,
        artistId: input.artistId,
        artistUid,
        artistName: input.artistName,
        artistHandle: input.artistHandle ?? null,
        location: input.location,
        dateISO: input.dateISO,
        slotId: input.slotId,
        slotTimeLabel: input.slotTimeLabel ?? null,
        startingFrom: input.startingFrom,
        depositAmount: fee,
        bookingConfirmationFee: fee,
        currency: 'INR',
        tattooSizeInches: sizeNotSure ? null : safeSize,
        tattooSizeNotSure: sizeNotSure,
        designImageUrl: input.designImageUrl ?? null,
        designImageMeta: input.designImageMeta ?? null,
        aiSkinCheckStatus: input.aiSkinCheckStatus,
        aiRiskScore: input.aiRiskScore,
        aiSkinCheckNotes: input.aiSkinCheckNotes,
        aiCheckedAt: serverTimestamp(),
        aiFlagForArtist: Boolean(input.aiFlagForArtist),
        skinAnswers: input.skinAnswers ?? {},
        paymentRetryCount: 0,
        status: 'pending_artist_quote' as BookingStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error: any) {
    const message = String(error?.message ?? 'Could not create booking.');
    if (message.toLowerCase().includes('already booked')) throw error;
    throw new Error(message);
  }

  await writeNotificationDual({
    id: `booking_requested_${bookingRef.id}`,
    toUid: artistUid,
    fromUid: user.uid,
    fromName: user.displayName ?? user.email ?? 'User',
    type: 'booking_requested',
    title: 'New quote request',
    message: `${user.displayName ?? 'A user'} shared tattoo details for ${input.dateISO} (${input.slotId}). Review and send an estimated range.`,
    entityType: 'booking',
    entityId: bookingRef.id,
    bookingId: bookingRef.id,
    dateISO: input.dateISO,
    metadata: {
      slotId: input.slotId,
      aiSkinCheckStatus: input.aiSkinCheckStatus,
      aiRiskScore: input.aiRiskScore,
      tattooSizeInches: sizeNotSure ? 'Not chosen yet' : safeSize,
      hasReferenceImage: Boolean(input.designImageUrl),
    },
  });

  return { id: bookingRef.id, alreadyExists: false as const, artistUid };
};

const startOfLocalToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
};

const dateISOToLocalStart = (dateISO: string) => {
  const match = String(dateISO || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return 0;
  const [, y, m, d] = match;
  return new Date(Number(y), Number(m) - 1, Number(d)).getTime();
};

const isPastDateISO = (dateISO: string) => {
  const ms = dateISOToLocalStart(dateISO);
  return ms > 0 && ms < startOfLocalToday();
};

const isPayableRowVisible = (row: UserPayableBooking) => {
  if (row.status === 'final_payment_pending') return true;
  if (isPastDateISO(row.dateISO)) return false;
  const expiresAtMs = toMillis(row.quoteExpiresAt);
  if (row.status === 'quote_sent_payment_pending' && expiresAtMs > 0 && expiresAtMs <= Date.now()) return false;
  return true;
};

export const listUserPayableBookings = async (uid: string) => {
  const q = query(
    collection(db, 'bookings'),
    where('userUid', '==', uid),
    where('status', 'in', ['quote_sent_payment_pending', 'payment_failed', 'artist_approved_payment_pending', 'final_payment_pending']),
    orderBy('updatedAt', 'desc'),
    limit(20),
  );
  const snap = await getDocs(q);
  const rows = snap.docs.map((row) => mapPayableBooking(row.id, row.data() as any));
  void cleanupPastPayableBookingsForUser(uid).catch(() => {});
  return rows.filter(isPayableRowVisible);
};

const ensureQuoteIsPayable = async (bookingId: string, data: any) => {
  const status = String(data?.status ?? '') as BookingStatus;
  if (!isPayableStatus(status)) {
    throw new Error('Payment is not available until the artist sends an estimated range.');
  }

  const expiresAtMs = toMillis(data?.quoteExpiresAt);
  if (status === 'quote_sent_payment_pending' && expiresAtMs > 0 && expiresAtMs <= Date.now()) {
    await expireQuoteIfNeeded(bookingId);
    throw new Error('Quote expired. Please request again.');
  }
};

export const openRazorpayCheckoutForBooking = async (bookingId: string) => {
  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Booking not found.');

  const data = snap.data() as any;
  await ensureQuoteIsPayable(bookingId, data);

  const amount = Number(data?.bookingConfirmationFee ?? data?.depositAmount ?? bookingFee());
  const user = auth.currentUser;
  const baseUrl = getPaymentsServerUrl();
  const name = encodeURIComponent(user?.displayName ?? 'Tatzo User');
  const email = encodeURIComponent(user?.email ?? '');
  const phone = encodeURIComponent('');
  const returnUrl = encodeURIComponent(buildPaymentReturnUrl());

  const url = `${baseUrl}/pay?bookingId=${encodeURIComponent(bookingId)}&amountRupees=${encodeURIComponent(String(amount))}&name=${name}&email=${email}&phone=${phone}&returnUrl=${returnUrl}`;
  await Linking.openURL(url);
};

const releaseSlotForBooking = async (bookingData: any, nextStatus: 'released' | 'confirmed') => {
  const artistUid = String(bookingData?.artistUid ?? '').trim();
  const dateISO = String(bookingData?.dateISO ?? '').trim();
  const slotId = String(bookingData?.slotId ?? '').trim() as TimeSlotId;
  const bookingId = String(bookingData?.id ?? bookingData?.bookingId ?? '').trim();

  if (!artistUid || !dateISO || !slotId || !bookingId) return;

  const lockRef = doc(db, 'bookingSlots', slotLockDocId(artistUid, dateISO, slotId));
  const lockSnap = await getDoc(lockRef);
  if (!lockSnap.exists()) return;

  const lockData = lockSnap.data() as any;
  if (String(lockData.bookingId ?? '') !== bookingId) return;

  await updateDoc(lockRef, {
    status: nextStatus,
    expiresAt: nextStatus === 'released' ? Timestamp.fromMillis(Date.now() - 1000) : lockData.expiresAt ?? null,
    updatedAt: serverTimestamp(),
  });
};

export const expireQuoteIfNeeded = async (bookingId: string, options: { force?: boolean } = {}) => {
  const ref = doc(db, 'bookings', bookingId);
  const expired = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    if (String(data?.status ?? '') !== 'quote_sent_payment_pending') return null;
    const quoteExpiresAtMs = toMillis(data?.quoteExpiresAt);
    if (!options.force && (!quoteExpiresAtMs || quoteExpiresAtMs > Date.now())) return null;

    tx.update(ref, {
      status: 'quote_expired' as BookingStatus,
      quoteExpiredAt: serverTimestamp(),
      quoteExpiredAtCleanupChecked: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    return { ...data, id: bookingId };
  });

  if (!expired) return false;
  await releaseSlotForBooking(expired, 'released');

  const userUid = String(expired?.userUid ?? '').trim();
  if (userUid) {
    await writeNotificationDual({
      id: `booking_quote_expired_${bookingId}`,
      toUid: userUid,
      fromUid: auth.currentUser?.uid || userUid,
      fromName: expired?.artistName ?? 'Artist',
      type: 'booking_quote_expired',
      title: 'Quote expired',
      message: 'Quote expired. Please request again.',
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: expired?.dateISO ?? null,
      createOnly: true,
    });
  }

  return true;
};

export const expireStaleQuotesForUser = async (params: { uid: string; role: 'user' | 'artist' }) => {
  const safeUid = String(params.uid ?? '').trim();
  if (!safeUid) return 0;

  const field = params.role === 'artist' ? 'artistUid' : 'userUid';
  const q = query(
    collection(db, 'bookings'),
    where(field, '==', safeUid),
    where('status', '==', 'quote_sent_payment_pending'),
    limit(30),
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  let count = 0;
  for (const row of snap.docs) {
    const data = row.data() as any;
    if (await expireQuoteIfNeeded(row.id, { force: isPastDateISO(String(data?.dateISO ?? '')) })) count += 1;
  }
  return count;
};

const isLocalPaymentsUrl = (url: string) =>
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/i.test(url);

const confirmBookingAfterLocalPaymentVerify = async (params: {
  bookingId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}) => {
  const { bookingId, orderId, paymentId, signature } = params;
  const ref = doc(db, 'bookings', bookingId);

  const result = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Booking not found.');

    const data = snap.data() as any;
    const currentStatus = String(data?.status ?? '') as BookingStatus;
    const existingPaymentId = String(data?.payment?.paymentId ?? '');

    if (currentStatus === 'confirmed') {
      if (existingPaymentId === paymentId) return { duplicate: true, data };
      throw new Error('Booking is already confirmed with a different payment.');
    }

    if (!isPayableStatus(currentStatus)) {
      throw new Error('Payment not allowed for this booking status.');
    }

    const expiresAtMs = toMillis(data?.quoteExpiresAt);
    if (currentStatus === 'quote_sent_payment_pending' && expiresAtMs > 0 && expiresAtMs <= Date.now()) {
      throw new Error('Quote expired. Please request again.');
    }

    const amount = Number(data?.bookingConfirmationFee ?? data?.depositAmount ?? bookingFee());
    tx.update(ref, {
      status: 'confirmed' as BookingStatus,
      reminderCreated: false,
      reminderSentAt: null,
      reminderScheduledFor: data?.dateISO ?? null,
      payment: {
        provider: 'razorpay',
        status: 'paid',
        amount,
        orderId,
        paymentId,
        signature,
        verifiedAt: serverTimestamp(),
        verifiedBy: 'local-payment-server',
      },
      updatedAt: serverTimestamp(),
    });

    return { duplicate: false, data: { ...data, depositAmount: amount, bookingConfirmationFee: amount, id: bookingId } };
  });

  if (result.duplicate) return;

  const data = result.data as any;
  await releaseSlotForBooking({ ...data, id: bookingId }, 'confirmed');

  const artistUid = String(data?.artistUid ?? '').trim();
  const userUid = String(data?.userUid ?? '').trim();
  const amount = Number(data?.bookingConfirmationFee ?? data?.depositAmount ?? bookingFee());

  if (artistUid) {
    await writeNotificationDual({
      id: `payment_success_${bookingId}`,
      toUid: artistUid,
      fromUid: userUid || artistUid,
      fromName: data?.userName ?? 'User',
      type: 'payment_success',
      title: 'Revenue Tracking Update',
      message: `${data?.userName ?? 'User'} paid the Rs. ${amount} booking confirmation fee for ${data?.dateISO ?? ''} - ${data?.slotId ?? ''}.`,
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
      depositAmount: amount,
    });
  }

  if (userUid) {
    await writeNotificationDual({
      id: `booking_confirmed_${bookingId}`,
      toUid: userUid,
      fromUid: artistUid || userUid,
      fromName: data?.artistName ?? 'Artist',
      type: 'booking_confirmed',
      title: 'Booking Confirmed',
      message: `Your tattoo appointment is confirmed for ${data?.dateISO ?? ''} - ${data?.slotId ?? ''}. Remaining tattoo amount is paid at the studio.`,
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
      depositAmount: amount,
    });
  }
};

export const markBookingPaidRazorpay = async (params: {
  bookingId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}) => {
  const { bookingId, orderId, paymentId, signature } = params;

  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Booking not found.');

  const data = snap.data() as any;
  const currentStatus = String(data?.status ?? '') as BookingStatus;
  if (currentStatus === 'confirmed' && String(data?.payment?.paymentId ?? '') === paymentId) return;
  await ensureQuoteIsPayable(bookingId, data);

  const baseUrl = getPaymentsServerUrl();
  const r = await fetch(`${baseUrl}/api/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flow: 'booking',
      bookingId,
      orderId,
      paymentId,
      signature,
    }),
  });

  const j = (await r.json().catch(() => null)) as any;
  if (!r.ok || !(j?.ok || j?.verified)) {
    throw new Error(j?.error ?? 'Payment verification failed.');
  }

  if (isLocalPaymentsUrl(baseUrl)) {
    await confirmBookingAfterLocalPaymentVerify({ bookingId, orderId, paymentId, signature });
  }
};

export const openRazorpayCheckoutForFinalPayment = async (bookingId: string) => {
  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Booking not found.');

  const data = snap.data() as any;
  const status = String(data?.status ?? '') as BookingStatus;
  if (status !== 'final_payment_pending') throw new Error('Final payment is not available yet.');
  const amount = Number(data?.finalStudioAmount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Artist final amount is missing.');

  const user = auth.currentUser;
  const baseUrl = getPaymentsServerUrl();
  const name = encodeURIComponent(user?.displayName ?? 'Tatzo User');
  const email = encodeURIComponent(user?.email ?? '');
  const phone = encodeURIComponent('');
  const returnUrl = encodeURIComponent(buildPaymentReturnUrl());

  const url = `${baseUrl}/pay?bookingId=${encodeURIComponent(bookingId)}&amountRupees=${encodeURIComponent(String(amount))}&name=${name}&email=${email}&phone=${phone}&returnUrl=${returnUrl}&flow=final_payment`;
  await Linking.openURL(url);
};

export const openArtistDirectFinalPayment = async (row: Pick<UserPayableBooking, 'id' | 'artistName' | 'depositAmount' | 'artistPaymentMethod' | 'artistUpiId' | 'artistRazorpayPaymentLink'>) => {
  const amount = Number(row.depositAmount ?? 0);
  const note = encodeURIComponent(`Tatzo final payment ${row.id}`);
  if (row.artistPaymentMethod === 'upi') {
    const upi = String(row.artistUpiId ?? '').trim();
    if (!upi) throw new Error('Artist UPI ID is not configured yet.');
    const url = `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(row.artistName || 'Tatzo Artist')}&am=${encodeURIComponent(String(amount))}&cu=INR&tn=${note}`;
    const supported = await Linking.canOpenURL(url).catch(() => false);
    if (!supported) throw new Error(`UPI app not available. Pay manually to UPI ID: ${upi}`);
    await Linking.openURL(url);
    return;
  }

  if (row.artistPaymentMethod === 'razorpay_link') {
    const link = String(row.artistRazorpayPaymentLink ?? '').trim();
    if (!/^https?:\/\//i.test(link)) throw new Error('Artist Razorpay payment link is not configured yet.');
    await Linking.openURL(link);
    return;
  }

  throw new Error('Artist payment setup is not ready yet.');
};

const completeBookingAfterLocalFinalPaymentVerify = async (params: {
  bookingId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}) => {
  const { bookingId, orderId, paymentId, signature } = params;
  const ref = doc(db, 'bookings', bookingId);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Booking not found.');
    const data = snap.data() as any;
    const status = String(data?.status ?? '') as BookingStatus;
    const existingPaymentId = String(data?.finalPayment?.paymentId ?? '');

    if (status === 'completed' && existingPaymentId === paymentId) return;
    if (status !== 'final_payment_pending') throw new Error('Final payment is not available for this booking.');

    const amount = Number(data?.finalStudioAmount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Artist final amount is missing.');

    tx.update(ref, {
      status: 'completed' as BookingStatus,
      completedAt: serverTimestamp(),
      finalPayment: {
        provider: 'razorpay',
        status: 'paid',
        amount,
        orderId,
        paymentId,
        signature,
        verifiedAt: serverTimestamp(),
        verifiedBy: 'local-payment-server',
      },
      updatedAt: serverTimestamp(),
    });

    const transactionRef = doc(db, 'artistTransactions', bookingId);
    tx.set(transactionRef, {
      bookingId,
      artistUid: String(data.artistUid ?? ''),
      userUid: String(data.userUid ?? ''),
      bookingConfirmationFee: Number(data.bookingConfirmationFee ?? data.depositAmount ?? bookingFee()),
      quotedRange: data.quoteRangeLabel ?? quoteRangeLabel(data.quoteRange) ?? null,
      finalStudioAmount: amount,
      finalPaymentAmount: amount,
      finalPaymentId: paymentId,
      platformFeeAmount: null,
      payoutStatus: 'pending',
      payoutMethod: 'razorpay',
      completedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      notes: data.finalAmountNote ?? '',
    }, { merge: true });
  });
};

export const markFinalPaymentPaidRazorpay = async (params: {
  bookingId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}) => {
  const { bookingId, orderId, paymentId, signature } = params;
  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Booking not found.');

  const data = snap.data() as any;
  const currentStatus = String(data?.status ?? '') as BookingStatus;
  if (currentStatus === 'completed' && String(data?.finalPayment?.paymentId ?? '') === paymentId) return;
  if (currentStatus !== 'final_payment_pending') throw new Error('Final payment is not available for this booking.');

  const baseUrl = getPaymentsServerUrl();
  const r = await fetch(`${baseUrl}/api/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flow: 'final_payment',
      bookingId,
      orderId,
      paymentId,
      signature,
    }),
  });

  const j = (await r.json().catch(() => null)) as any;
  if (!r.ok || !(j?.ok || j?.verified)) {
    throw new Error(j?.error ?? 'Final payment verification failed.');
  }

  if (isLocalPaymentsUrl(baseUrl)) {
    await completeBookingAfterLocalFinalPaymentVerify({ bookingId, orderId, paymentId, signature });
  }
};

export const requestBookingCompletionByUser = async (bookingId: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');

  const ref = doc(db, 'bookings', bookingId);
  let data: any = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Booking not found.');
    data = snap.data() as any;
    if (String(data?.userUid ?? '') !== user.uid) throw new Error('You can update only your booking.');
    if (String(data?.status ?? '') !== 'confirmed') throw new Error('Only confirmed bookings can be marked work completed.');
    tx.update(ref, {
      completionRequestedByUser: true,
      completionRequestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  const artistUid = String(data?.artistUid ?? '').trim();
  if (artistUid) {
    await writeNotificationDual({
      id: `final_amount_requested_${bookingId}`,
      toUid: artistUid,
      fromUid: user.uid,
      fromName: user.displayName ?? user.email ?? 'User',
      type: 'final_payment_requested',
      title: 'Client marked work completed',
      message: `${user.displayName ?? 'Client'} marked the session completed. Add collected amount for revenue tracking.`,
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
      createOnly: true,
    });
  }
};

export const artistSubmitFinalAmount = async (bookingId: string, params: { amount: number; note: string }) => {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in as artist.');
  const amount = Number(params.amount);
  const note = String(params.note ?? '').trim();
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter a valid final amount.');
  if (amount > 1000000) throw new Error('Final amount is too high. Contact Tatzo support.');
  if (!note) throw new Error('Add a short note for the client.');
  if (note.length > 500) throw new Error('Note must be 500 characters or less.');

  const profileSnap = await getDoc(doc(db, 'users', user.uid));
  const profile = profileSnap.exists() ? (profileSnap.data() as any) : {};
  const method = String(profile.artistPaymentMethod ?? '').trim() as 'upi' | 'razorpay_link' | '';
  const upiId = String(profile.artistUpiId ?? '').trim();
  const razorpayLink = String(profile.artistRazorpayPaymentLink ?? '').trim();

  if (profile.payoutSetupStatus === 'rejected') throw new Error('Payment setup is rejected. Update details before final payment.');
  if (method !== 'upi' && method !== 'razorpay_link') throw new Error('Set Payment Setup in Artist Settings before submitting final amount.');
  if (method === 'upi' && upiId.length < 4) throw new Error('Add a valid UPI ID in Payment Setup.');
  if (method === 'razorpay_link' && !/^https?:\/\//i.test(razorpayLink)) throw new Error('Add a valid Razorpay payment link in Payment Setup.');

  const ref = doc(db, 'bookings', bookingId);
  let data: any = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Booking not found.');
    data = snap.data() as any;
    if (String(data?.artistUid ?? '') !== user.uid) throw new Error('You can submit amount only for your booking.');
    if (String(data?.status ?? '') !== 'confirmed') throw new Error('Only confirmed bookings can receive final amount.');
    tx.update(ref, {
      status: 'final_payment_pending' as BookingStatus,
      finalStudioAmount: Math.round(amount),
      finalAmountNote: note,
      finalAmountSubmittedAt: serverTimestamp(),
      finalPaymentStatus: 'pending',
      artistPaymentMethod: method,
      artistUpiId: method === 'upi' ? upiId : null,
      artistRazorpayPaymentLink: method === 'razorpay_link' ? razorpayLink : null,
      updatedAt: serverTimestamp(),
    });
  });

  const toUserUid = String(data?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `final_payment_requested_${bookingId}`,
      toUid: toUserUid,
      fromUid: user.uid,
      fromName: user.displayName ?? data?.artistName ?? 'Artist',
      type: 'final_payment_requested',
      title: 'Collected amount shared',
      message: `Artist shared Rs. ${Math.round(amount)} as the collected amount. Pay the artist directly and mark paid in Tatzo.`,
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
      depositAmount: Math.round(amount),
      metadata: { finalStudioAmount: Math.round(amount), finalAmountNote: note, artistPaymentMethod: method },
    });
  }
};

export const markFinalPaymentUserPaid = async (bookingId: string, proof?: { paymentProofUrl?: string | null; paymentProofMeta?: UserPayableBooking['paymentProofMeta'] | null }) => {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');

  const ref = doc(db, 'bookings', bookingId);
  let data: any = null;
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Booking not found.');
    data = snap.data() as any;
    if (String(data?.userUid ?? '') !== user.uid) throw new Error('You can update only your booking.');
    if (String(data?.status ?? '') !== 'final_payment_pending') throw new Error('Final payment is not pending for this booking.');
    const current = String(data?.finalPaymentStatus ?? 'pending');
    if (current === 'artist_confirmed_paid') return;
    const payload: Record<string, unknown> = {
      finalPaymentStatus: 'user_marked_paid',
      userMarkedPaidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    if (proof?.paymentProofUrl) {
      payload.paymentProofUrl = proof.paymentProofUrl;
      payload.paymentProofMeta = proof.paymentProofMeta ?? null;
    }
    tx.update(ref, payload);
  });

  const artistUid = String(data?.artistUid ?? '').trim();
  if (artistUid) {
    await writeNotificationDual({
      id: `final_payment_user_marked_paid_${bookingId}`,
      toUid: artistUid,
      fromUid: user.uid,
      fromName: user.displayName ?? user.email ?? 'User',
      type: 'final_payment_user_marked_paid',
      title: 'User marked final payment paid',
      message: 'User marked final payment as paid. Please verify and confirm receipt.',
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
      metadata: { finalStudioAmount: data?.finalStudioAmount ?? null, hasPaymentProof: Boolean(proof?.paymentProofUrl) },
      createOnly: true,
    });
  }
};

export const artistConfirmFinalPaymentReceived = async (bookingId: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in as artist.');
  const ref = doc(db, 'bookings', bookingId);
  let data: any = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Booking not found.');
    data = snap.data() as any;
    if (String(data?.artistUid ?? '') !== user.uid) throw new Error('You can confirm only your booking.');
    if (String(data?.status ?? '') !== 'final_payment_pending') throw new Error('Final payment is not pending.');
    if (String(data?.finalPaymentStatus ?? 'pending') !== 'user_marked_paid') throw new Error('Wait until user marks final payment as paid.');

    const amount = Number(data?.finalStudioAmount ?? 0);
    tx.update(ref, {
      status: 'completed' as BookingStatus,
      finalPaymentStatus: 'artist_confirmed_paid',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const transactionRef = doc(db, 'artistTransactions', bookingId);
    tx.set(transactionRef, {
      bookingId,
      artistUid: String(data.artistUid ?? ''),
      userUid: String(data.userUid ?? ''),
      bookingConfirmationFee: Number(data.bookingConfirmationFee ?? data.depositAmount ?? bookingFee()),
      quotedRange: data.quoteRangeLabel ?? quoteRangeLabel(data.quoteRange) ?? null,
      finalStudioAmount: amount,
      finalAmountNote: data.finalAmountNote ?? '',
      finalPaymentStatus: 'artist_confirmed_paid',
      paymentMethod: data.artistPaymentMethod ?? 'manual',
      payoutStatus: 'manual_tracked',
      payoutMethod: data.artistPaymentMethod ?? 'manual',
      paymentProofUrl: data.paymentProofUrl ?? null,
      completedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      notes: data.finalAmountNote ?? '',
    }, { merge: true });
  });

  const toUserUid = String(data?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `final_payment_success_${bookingId}`,
      toUid: toUserUid,
      fromUid: user.uid,
      fromName: user.displayName ?? data?.artistName ?? 'Artist',
      type: 'final_payment_success',
      title: 'Final payment confirmed',
      message: 'Artist confirmed the collected amount. Your booking is completed.',
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
      createOnly: true,
    });
  }
};

export const artistMarkFinalPaymentDisputed = async (bookingId: string, note = '') => {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in as artist.');
  const cleanNote = String(note ?? '').trim().slice(0, 500);
  const ref = doc(db, 'bookings', bookingId);
  let data: any = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Booking not found.');
    data = snap.data() as any;
    if (String(data?.artistUid ?? '') !== user.uid) throw new Error('You can update only your booking.');
    if (String(data?.status ?? '') !== 'final_payment_pending') throw new Error('Final payment is not pending.');
    tx.update(ref, {
      finalPaymentStatus: 'disputed',
      finalPaymentDisputedAt: serverTimestamp(),
      finalPaymentDisputeNote: cleanNote || 'Artist marked payment issue.',
      updatedAt: serverTimestamp(),
    });
  });

  const toUserUid = String(data?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `final_payment_disputed_${bookingId}`,
      toUid: toUserUid,
      fromUid: user.uid,
      fromName: user.displayName ?? data?.artistName ?? 'Artist',
      type: 'final_payment_disputed',
      title: 'Final payment issue',
      message: cleanNote || 'Artist marked a payment issue. Tatzo admin can review this booking.',
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
      createOnly: true,
    });
  }
};

export const artistApproveBooking = async (bookingId: string) => {
  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Booking not found.');

  const data = snap.data() as any;
  const status = String(data?.status ?? '') as BookingStatus;
  if (status !== 'pending_artist_approval') {
    throw new Error('Only legacy pending requests can be accepted directly. New requests need a quote first.');
  }

  await updateDoc(ref, {
    status: 'artist_approved_payment_pending' as BookingStatus,
    artistApprovedAt: serverTimestamp(),
    bookingConfirmationFee: bookingFee(),
    depositAmount: bookingFee(),
    updatedAt: serverTimestamp(),
  });

  const toUserUid = String(data?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `booking_artist_approved_payment_pending_${bookingId}`,
      toUid: toUserUid,
      fromUid: auth.currentUser?.uid || String(data?.artistUid ?? '') || toUserUid,
      fromName: auth.currentUser?.displayName ?? 'Artist',
      type: 'booking_artist_approved_payment_pending',
      title: 'Artist Approved Your Booking',
      message: 'Your booking is approved. Tap Pay Now to confirm your slot.',
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
      depositAmount: bookingFee(),
    });
  }
};

export const artistSendBookingQuote = async (
  bookingId: string,
  params: { quoteRange: BookingQuoteRangeId; quoteReason: string },
) => {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in as artist.');

  const quoteReason = String(params.quoteReason ?? '').trim();
  const selected = BOOKING_QUOTE_RANGES.find((row) => row.id === params.quoteRange);
  if (!selected) throw new Error('Choose a valid estimated range.');
  if (quoteReason.length < 8) throw new Error('Please explain why this estimated range fits the design.');
  if (quoteReason.length > 500) throw new Error('Quote reason is too long.');

  const ref = doc(db, 'bookings', bookingId);
  const quoteExpiresAt = quoteExpiryFromNow();
  const data = await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Booking not found.');
    const d = snap.data() as any;
    if (String(d?.artistUid ?? '') !== user.uid) throw new Error('You can quote only your assigned bookings.');
    if (String(d?.status ?? '') !== 'pending_artist_quote') throw new Error('Quote can be sent only for pending quote requests.');

    tx.update(ref, {
      status: 'quote_sent_payment_pending' as BookingStatus,
      quoteRange: params.quoteRange,
      quoteRangeLabel: selected.label,
      quoteReason,
      quotedAt: serverTimestamp(),
      quoteExpiresAt,
      quotedByArtistUid: user.uid,
      bookingConfirmationFee: bookingFee(),
      depositAmount: bookingFee(),
      updatedAt: serverTimestamp(),
    });

    const lockRef = doc(db, 'bookingSlots', slotLockDocId(String(d.artistUid), String(d.dateISO), d.slotId as TimeSlotId));
    tx.set(lockRef, {
      artistUid: String(d.artistUid),
      dateISO: String(d.dateISO),
      slotId: d.slotId,
      bookingId,
      status: 'held',
      expiresAt: quoteExpiresAt,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    return { ...d, id: bookingId };
  });

  const toUserUid = String(data?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `booking_quote_sent_${bookingId}`,
      toUid: toUserUid,
      fromUid: user.uid,
      fromName: auth.currentUser?.displayName ?? data?.artistName ?? 'Artist',
      type: 'booking_quote_sent',
      title: 'Artist sent your estimate',
      message: `Estimated tattoo range: ${selected.label}. Pay Rs. ${bookingFee()} to reserve your appointment slot.`,
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
      depositAmount: bookingFee(),
      reason: quoteReason,
      metadata: {
        quoteRange: params.quoteRange,
        quoteRangeLabel: selected.label,
        quoteReason,
        quoteExpiresAt: quoteExpiresAt.toMillis(),
      },
    });
  }
};

export const artistRejectBooking = async (bookingId: string, reason = '') => {
  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Booking not found.');

  const data = snap.data() as any;
  const status = String(data?.status ?? '') as BookingStatus;
  if (!['pending_artist_quote', 'quote_sent_payment_pending', 'pending_artist_approval', 'artist_approved_payment_pending'].includes(status)) {
    throw new Error('Booking cannot be rejected in this status.');
  }

  await updateDoc(ref, {
    status: 'rejected' as BookingStatus,
    rejectReason: reason.trim() || null,
    updatedAt: serverTimestamp(),
  });

  await releaseSlotForBooking({ ...data, id: bookingId }, 'released');

  const toUserUid = String(data?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `booking_rejected_${bookingId}`,
      toUid: toUserUid,
      fromUid: auth.currentUser?.uid || String(data?.artistUid ?? '') || toUserUid,
      fromName: auth.currentUser?.displayName ?? 'Artist',
      type: 'booking_rejected',
      title: 'Artist marked not eligible',
      message: reason.trim() ? `Reason: ${reason.trim()}` : 'The artist rejected this quote request.',
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      reason: reason.trim() || null,
      dateISO: data?.dateISO ?? null,
    });
  }
};

export const artistCompleteBooking = async (bookingId: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in as artist.');

  const ref = doc(db, 'bookings', bookingId);
  let data: any = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Booking not found.');

    data = snap.data() as any;
    const status = String(data?.status ?? '') as BookingStatus;
    if (status !== 'confirmed') throw new Error('Only confirmed bookings can be completed.');
    if (String(data?.artistUid ?? '') !== user.uid) throw new Error('You can complete only your assigned bookings.');

    tx.update(ref, {
      status: 'completed' as BookingStatus,
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    const transactionRef = doc(db, 'artistTransactions', bookingId);
    tx.set(transactionRef, {
      bookingId,
      artistUid: String(data.artistUid ?? user.uid),
      userUid: String(data.userUid ?? ''),
      bookingConfirmationFee: Number(data.bookingConfirmationFee ?? data.depositAmount ?? bookingFee()),
      quotedRange: data.quoteRangeLabel ?? quoteRangeLabel(data.quoteRange) ?? null,
      finalStudioAmount: null,
      platformFeeAmount: null,
      payoutStatus: 'pending',
      payoutMethod: 'manual',
      completedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      notes: '',
    }, { merge: true });
  });

  const toUserUid = String(data?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `booking_completed_${bookingId}`,
      toUid: toUserUid,
      fromUid: user.uid || String(data?.artistUid ?? '') || toUserUid,
      fromName: user.displayName ?? 'Artist',
      type: 'booking_confirmed',
      title: 'Session completed',
      message: 'Your tattoo session was marked as completed.',
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
    });
  }
};
export const cancelBookingByUser = async (bookingId: string) => {
  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Booking not found.');

  const data = snap.data() as any;
  const status = String(data?.status ?? '') as BookingStatus;
  if (isTerminalStatus(status)) return;

  await updateDoc(ref, {
    status: 'cancelled' as BookingStatus,
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await releaseSlotForBooking({ ...data, id: bookingId }, 'released');

  const toArtistUid = String(data?.artistUid ?? '').trim();
  if (toArtistUid) {
    await writeNotificationDual({
      id: `booking_cancelled_${bookingId}`,
      toUid: toArtistUid,
      fromUid: auth.currentUser?.uid || String(data?.userUid ?? '') || toArtistUid,
      fromName: auth.currentUser?.displayName ?? auth.currentUser?.email ?? 'User',
      type: 'booking_cancelled',
      title: 'Booking cancelled',
      message: `User cancelled booking ${data?.dateISO ?? ''} (${data?.slotId ?? ''}).`,
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
    });
  }
};

export const markPaymentTimeout = async (bookingId: string) => {
  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as any;
  const status = String(data?.status ?? '') as BookingStatus;
  if (!isPayableStatus(status)) return;

  await updateDoc(ref, {
    status: 'payment_timeout' as BookingStatus,
    updatedAt: serverTimestamp(),
  });
  await releaseSlotForBooking({ ...data, id: bookingId }, 'released');

  const toUserUid = String(data?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `payment_timeout_${bookingId}`,
      toUid: toUserUid,
      fromUid: auth.currentUser?.uid || toUserUid,
      fromName: data?.artistName ?? 'Artist',
      type: 'booking_cancelled',
      title: 'Payment timed out',
      message: 'Booking payment window expired. You can request a fresh quote again.',
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
      createOnly: true,
    });
  }
};

export const cleanupPastPayableBookingsForUser = async (uid: string) => {
  const safeUid = String(uid ?? '').trim();
  if (!safeUid) return 0;

  const q = query(
    collection(db, 'bookings'),
    where('userUid', '==', safeUid),
    where('status', 'in', ['quote_sent_payment_pending', 'payment_failed', 'artist_approved_payment_pending', 'final_payment_pending']),
    limit(30),
  );
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  let cleaned = 0;
  for (const row of snap.docs) {
    const data = row.data() as any;
    const status = String(data?.status ?? '') as BookingStatus;
    const dateISO = String(data?.dateISO ?? '');
    const quoteExpired = status === 'quote_sent_payment_pending' && toMillis(data?.quoteExpiresAt) > 0 && toMillis(data?.quoteExpiresAt) <= Date.now();
    if (!isPastDateISO(dateISO) && !quoteExpired) continue;

    if (status === 'quote_sent_payment_pending') {
      if (await expireQuoteIfNeeded(row.id, { force: true })) cleaned += 1;
    } else if (status === 'artist_approved_payment_pending' || status === 'payment_failed') {
      await markPaymentTimeout(row.id);
      cleaned += 1;
    }
  }

  return cleaned;
};

export const subscribeUserPayableBookings = (
  uid: string,
  onRows: (rows: UserPayableBooking[]) => void,
  onError?: (error: Error) => void,
) => {
  const q = query(
    collection(db, 'bookings'),
    where('userUid', '==', uid),
    where('status', 'in', ['quote_sent_payment_pending', 'payment_failed', 'artist_approved_payment_pending', 'final_payment_pending']),
    orderBy('updatedAt', 'desc'),
    limit(20),
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((row) => mapPayableBooking(row.id, row.data() as any));
      const visibleRows = rows.filter(isPayableRowVisible);
      if (rows.length !== visibleRows.length) void cleanupPastPayableBookingsForUser(uid).catch(() => {});
      onRows(visibleRows);
    },
    (err) => onError?.(err as Error),
  );
};

const todayISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const createTodayBookingReminders = async (params: { uid: string; role: 'user' | 'artist' }) => {
  const safeUid = String(params.uid ?? '').trim();
  if (!safeUid) return 0;

  const field = params.role === 'artist' ? 'artistUid' : 'userUid';
  const addDaysISO = (days: number) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + days);
    const yyyy = d.getFullYear();
    const mm = `${d.getMonth() + 1}`.padStart(2, '0');
    const dd = `${d.getDate()}`.padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const reminderJobs = [
    {
      kind: 'day_before' as const,
      dateISO: addDaysISO(1),
      legacyFlag: 'reminderDayBeforeCreated',
      legacySentAt: 'reminderDayBeforeSentAt',
      legacyScheduledFor: 'reminderDayBeforeScheduledFor',
      userNotificationId: (bookingId: string) => `booking_reminder_day_before_user_${bookingId}`,
      artistNotificationId: (bookingId: string) => `booking_reminder_day_before_artist_${bookingId}`,
      userMessage: (slotId: string) => `Reminder: Your tattoo booking is tomorrow for ${slotId}.`,
      artistMessage: (userName: string, slotId: string) => `Reminder: You have a confirmed booking with ${userName} tomorrow for ${slotId}.`,
    },
    {
      kind: 'one_hour' as const,
      dateISO: todayISO(),
      legacyFlag: 'reminderCreated',
      legacySentAt: 'reminderSentAt',
      legacyScheduledFor: 'reminderScheduledFor',
      userNotificationId: (bookingId: string) => `booking_reminder_one_hour_user_${bookingId}`,
      artistNotificationId: (bookingId: string) => `booking_reminder_one_hour_artist_${bookingId}`,
      userMessage: (slotId: string) => `Reminder: Your tattoo booking starts in about 1 hour for ${slotId}.`,
      artistMessage: (userName: string, slotId: string) => `Reminder: Booking with ${userName} starts in about 1 hour for ${slotId}.`,
    },
    {
      kind: 'fifteen_minutes' as const,
      dateISO: todayISO(),
      legacyFlag: 'reminder15MinCreated',
      legacySentAt: 'reminder15MinSentAt',
      legacyScheduledFor: 'reminder15MinScheduledFor',
      userNotificationId: (bookingId: string) => `booking_reminder_fifteen_user_${bookingId}`,
      artistNotificationId: (bookingId: string) => `booking_reminder_fifteen_artist_${bookingId}`,
      userMessage: (slotId: string) => `Can't make it? Reschedule your appointment. Your session is in 15 minutes for ${slotId}.`,
      artistMessage: (userName: string, slotId: string) => `Reminder: Booking with ${userName} starts in 15 minutes for ${slotId}.`,
    },
  ];

  let created = 0;

  for (const job of reminderJobs) {
    const reminderQuery = query(
      collection(db, 'bookings'),
      where(field, '==', safeUid),
      where('status', '==', 'confirmed'),
      where('dateISO', '==', job.dateISO),
      limit(30),
    );

    const snap = await getDocs(reminderQuery);
    if (snap.empty) continue;

    for (const row of snap.docs) {
      const bookingId = row.id;

      const reminderPayload = await runTransaction(db, async (tx) => {
        const latest = await tx.get(doc(db, 'bookings', bookingId));
        if (!latest.exists()) return null;
        const d = latest.data() as any;
        if (String(d?.status ?? '') !== 'confirmed') return null;
        if (String(d?.dateISO ?? '') !== job.dateISO) return null;
        const sessionAtMs = slotDateTimeMs(String(d?.dateISO ?? ''), String(d?.slotTimeLabel ?? ''), String(d?.slotId ?? ''));
        const diffMs = sessionAtMs - Date.now();
        if (job.kind === 'one_hour' && (diffMs > 60 * 60 * 1000 || diffMs <= 15 * 60 * 1000)) return null;
        if (job.kind === 'fifteen_minutes' && (diffMs > 15 * 60 * 1000 || diffMs < 0)) return null;

        const remindersCreated = (d?.remindersCreated ?? {}) as Record<string, unknown>;
        if (d?.[job.legacyFlag] === true || remindersCreated[job.kind] === true) return null;

        tx.update(latest.ref, {
          [job.legacyFlag]: true,
          [job.legacySentAt]: serverTimestamp(),
          [job.legacyScheduledFor]: d?.dateISO ?? job.dateISO,
          [`remindersCreated.${job.kind}`]: true,
          [`remindersSentAt.${job.kind}`]: serverTimestamp(),
          [`remindersScheduledFor.${job.kind}`]: d?.dateISO ?? job.dateISO,
          updatedAt: serverTimestamp(),
        });

        return {
          bookingId,
          reminderKind: job.kind,
          userUid: String(d?.userUid ?? '').trim(),
          artistUid: String(d?.artistUid ?? '').trim(),
          userName: String(d?.userName ?? 'User').trim() || 'User',
          artistName: String(d?.artistName ?? 'Artist').trim() || 'Artist',
          slotId: String(d?.slotId ?? ''),
          dateISO: String(d?.dateISO ?? job.dateISO),
        };
      });

      if (!reminderPayload) continue;

      if (reminderPayload.userUid) {
        await writeNotificationDual({
          id: job.userNotificationId(bookingId),
          toUid: reminderPayload.userUid,
          fromUid: reminderPayload.artistUid || reminderPayload.userUid,
          fromName: reminderPayload.artistName,
          type: 'booking_reminder',
          title: 'Booking Reminder',
          message: job.userMessage(reminderPayload.slotId),
          entityType: 'booking',
          entityId: bookingId,
          bookingId,
          dateISO: reminderPayload.dateISO,
          metadata: { reminderKind: reminderPayload.reminderKind },
          createOnly: true,
        });
      }

      if (reminderPayload.artistUid) {
        await writeNotificationDual({
          id: job.artistNotificationId(bookingId),
          toUid: reminderPayload.artistUid,
          fromUid: reminderPayload.userUid || reminderPayload.artistUid,
          fromName: reminderPayload.userName,
          type: 'booking_reminder',
          title: 'Booking Reminder',
          message: job.artistMessage(reminderPayload.userName, reminderPayload.slotId),
          entityType: 'booking',
          entityId: bookingId,
          bookingId,
          dateISO: reminderPayload.dateISO,
          metadata: { reminderKind: reminderPayload.reminderKind },
          createOnly: true,
        });
      }

      created += 1;
    }
  }

  return created;
};

export const expireStaleArtistResponseBookingsForUser = async (uid: string) => {
  if (!uid) return 0;

  const q = query(
    collection(db, 'bookings'),
    where('userUid', '==', uid),
    where('status', 'in', ['pending_artist_quote', 'pending_artist_approval']),
  );

  const snap = await getDocs(q);
  if (snap.empty) return 0;

  let changed = 0;
  await Promise.all(
    snap.docs.map(async (row) => {
      const data = row.data() as any;
      const createdAtMs = toMillis(data?.createdAt) || toMillis(data?.updatedAt);
      if (!createdAtMs) return;
      if (createdAtMs + ARTIST_RESPONSE_SLA_HOURS * 60 * 60 * 1000 > Date.now()) return;
      if (String(data?.status ?? '') !== 'pending_artist_quote' && String(data?.status ?? '') !== 'pending_artist_approval') return;

      await updateDoc(doc(db, 'bookings', row.id), {
        status: 'rejected' as BookingStatus,
        rejectReason: AUTO_REJECT_REASON_NO_RESPONSE,
        updatedAt: serverTimestamp(),
      }).catch(() => {});

      try {
        await writeNotificationDual({
          id: `booking_rejected_no_response_${row.id}`,
          toUid: uid,
          fromUid: data?.artistUid ?? null,
          fromName: data?.artistName ?? 'Tatzo',
          type: 'booking_rejected',
          title: 'Booking auto rejected',
          message: AUTO_REJECT_REASON_NO_RESPONSE,
          entityType: 'booking',
          entityId: row.id,
          bookingId: row.id,
          reason: AUTO_REJECT_REASON_NO_RESPONSE,
          createOnly: true,
        });
      } catch {}
      changed += 1;
    }),
  );

  return changed;
};

export const listLockedSlotsForArtistDate = async (params: { artistUid: string; dateISO: string; excludeBookingId?: string | null }) => {
  const artistUid = String(params.artistUid ?? '').trim();
  const dateISO = String(params.dateISO ?? '').trim();
  if (!artistUid || !dateISO) return [] as TimeSlotId[];

  const q = query(collection(db, 'bookingSlots'), where('artistUid', '==', artistUid), where('dateISO', '==', dateISO), limit(10));
  const snap = await getDocs(q);
  const nowMs = Date.now();
  return snap.docs
    .map((row) => row.data() as any)
    .filter((row) => String(row.bookingId ?? '') !== String(params.excludeBookingId ?? '').trim())
    .filter((row) => isLockActive(row, nowMs))
    .map((row) => String(row.slotId ?? '') as TimeSlotId)
    .filter(Boolean);
};

export const requestBookingReschedule = async (params: {
  bookingId: string;
  newDateISO: string;
  newSlotId: TimeSlotId;
  newSlotTimeLabel?: string;
}) => {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');

  const ref = doc(db, 'bookings', params.bookingId);
  let bookingData: any = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Booking not found.');
    bookingData = snap.data() as any;
    if (String(bookingData?.userUid ?? '') !== user.uid) throw new Error('You can update only your booking.');
    if (String(bookingData?.status ?? '') !== 'confirmed') throw new Error('Only confirmed bookings can be rescheduled.');

    const originalDateISO = String(bookingData?.dateISO ?? '').trim();
    const newDateISO = String(params.newDateISO ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDateISO)) throw new Error('Choose a valid reschedule date.');

    const originalMs = dateISOToLocalStart(originalDateISO);
    const newMs = dateISOToLocalStart(newDateISO);
    const todayMs = startOfLocalToday();
    if (!newMs || newMs < todayMs) throw new Error('This date is unavailable. Please choose another date.');
    if (originalMs && newMs > originalMs + 30 * 24 * 60 * 60 * 1000) {
      throw new Error('Please choose a new date within 30 days from the original booking date.');
    }

    const artistUid = String(bookingData?.artistUid ?? '').trim();
    const artistSnap = await tx.get(doc(db, 'artists', artistUid));
    if (!artistSnap.exists()) throw new Error('Artist is not available right now.');
    const artistSettings = getArtistSettingsFromProfile(artistSnap.data() as any);
    if (!isArtistAvailableOnDate(newDateISO, artistSettings)) {
      throw new Error('This date is unavailable. Please choose another date.');
    }

    const newSlotRef = doc(db, 'bookingSlots', slotLockDocId(artistUid, newDateISO, params.newSlotId));
    const slotSnap = await tx.get(newSlotRef);
    const slotData = slotSnap.exists() ? (slotSnap.data() as any) : null;
    if (slotData && isLockActive(slotData, Date.now()) && String(slotData.bookingId ?? '') !== params.bookingId) {
      throw new Error('This slot is unavailable. Please choose another time.');
    }

    tx.update(ref, {
      status: 'reschedule_requested' as BookingStatus,
      originalDateISO,
      originalSlotId: bookingData?.slotId ?? null,
      originalSlotTimeLabel: bookingData?.slotTimeLabel ?? null,
      proposedDateISO: newDateISO,
      proposedSlotId: params.newSlotId,
      proposedSlotTimeLabel: params.newSlotTimeLabel ?? null,
      rescheduleRequestedAt: serverTimestamp(),
      rescheduleRequestedByUid: user.uid,
      updatedAt: serverTimestamp(),
    });
  });

  const artistUid = String(bookingData?.artistUid ?? '').trim();
  if (artistUid) {
    await writeNotificationDual({
      id: `booking_reschedule_requested_${params.bookingId}`,
      toUid: artistUid,
      fromUid: user.uid,
      fromName: user.displayName ?? user.email ?? 'User',
      type: 'booking_reschedule_requested',
      title: 'Reschedule requested',
      message: 'User requested to reschedule this booking.',
      entityType: 'booking',
      entityId: params.bookingId,
      bookingId: params.bookingId,
      dateISO: params.newDateISO,
      proposedDateISO: params.newDateISO,
      metadata: {
        proposedSlotId: params.newSlotId,
        proposedSlotTimeLabel: params.newSlotTimeLabel ?? null,
        originalDateISO: bookingData?.dateISO ?? null,
        originalSlotId: bookingData?.slotId ?? null,
      },
      createOnly: true,
    });
  }
};

export const respondToBookingReschedule = async (params: { bookingId: string; accept: boolean }) => {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in as artist.');

  const ref = doc(db, 'bookings', params.bookingId);
  let bookingData: any = null;

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Booking not found.');
    bookingData = snap.data() as any;
    if (String(bookingData?.artistUid ?? '') !== user.uid) throw new Error('You can update only your booking.');
    if (String(bookingData?.status ?? '') !== 'reschedule_requested') throw new Error('No pending reschedule request found.');

    const originalDateISO = String(bookingData?.originalDateISO ?? bookingData?.dateISO ?? '').trim();
    const originalSlotId = String(bookingData?.originalSlotId ?? bookingData?.slotId ?? '').trim() as TimeSlotId;
    const proposedDateISO = String(bookingData?.proposedDateISO ?? '').trim();
    const proposedSlotId = String(bookingData?.proposedSlotId ?? '').trim() as TimeSlotId;
    const proposedSlotTimeLabel = String(bookingData?.proposedSlotTimeLabel ?? '').trim() || null;
    const artistUid = String(bookingData?.artistUid ?? '').trim();

    if (params.accept) {
      const newSlotRef = doc(db, 'bookingSlots', slotLockDocId(artistUid, proposedDateISO, proposedSlotId));
      const currentLockRef = doc(db, 'bookingSlots', slotLockDocId(artistUid, originalDateISO, originalSlotId));
      const [newSlotSnap, currentLockSnap] = await Promise.all([tx.get(newSlotRef), tx.get(currentLockRef)]);
      const newSlotData = newSlotSnap.exists() ? (newSlotSnap.data() as any) : null;
      const currentLockData = currentLockSnap.exists() ? (currentLockSnap.data() as any) : null;
      if (newSlotData && isLockActive(newSlotData, Date.now()) && String(newSlotData.bookingId ?? '') !== params.bookingId) {
        throw new Error('This slot is unavailable. Please choose another time.');
      }

      if (currentLockData && String(currentLockData.bookingId ?? '') === params.bookingId) {
        tx.set(
          currentLockRef,
          {
            status: 'released',
            expiresAt: Timestamp.fromMillis(Date.now() - 1000),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      tx.set(
        newSlotRef,
        {
          artistUid,
          dateISO: proposedDateISO,
          slotId: proposedSlotId,
          bookingId: params.bookingId,
          status: 'confirmed',
          expiresAt: null,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      tx.update(ref, {
        status: 'confirmed' as BookingStatus,
        dateISO: proposedDateISO,
        slotId: proposedSlotId,
        slotTimeLabel: proposedSlotTimeLabel,
        proposedDateISO: null,
        proposedSlotId: null,
        proposedSlotTimeLabel: null,
        rescheduleResolvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return;
    }

    tx.update(ref, {
      status: 'confirmed' as BookingStatus,
      proposedDateISO: null,
      proposedSlotId: null,
      proposedSlotTimeLabel: null,
      rescheduleResolvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  const toUserUid = String(bookingData?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `booking_reschedule_${params.accept ? 'accepted' : 'rejected'}_${params.bookingId}`,
      toUid: toUserUid,
      fromUid: user.uid,
      fromName: user.displayName ?? bookingData?.artistName ?? 'Artist',
      type: params.accept ? 'booking_reschedule_accepted' : 'booking_reschedule_rejected',
      title: params.accept ? 'Reschedule accepted' : 'Reschedule rejected',
      message: params.accept
        ? 'Artist accepted your new date and time.'
        : 'Artist rejected your reschedule request. Your original booking stays confirmed.',
      entityType: 'booking',
      entityId: params.bookingId,
      bookingId: params.bookingId,
      dateISO: params.accept ? bookingData?.proposedDateISO ?? bookingData?.dateISO ?? null : bookingData?.dateISO ?? null,
      proposedDateISO: bookingData?.proposedDateISO ?? null,
      createOnly: true,
    });
  }
};

export const migrateLegacyPendingPaymentBookingsForUser = async (uid: string) => {
  const q = query(collection(db, 'bookings'), where('userUid', '==', uid), where('status', '==', 'pending_payment'), limit(50));
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  await Promise.all(
    snap.docs.map((row) =>
      updateDoc(row.ref, {
        status: 'pending_artist_quote' as BookingStatus,
        bookingConfirmationFee: bookingFee(),
        depositAmount: bookingFee(),
        migratedFromPendingPaymentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    ),
  );

  return snap.docs.length;
};


