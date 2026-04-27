import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { getPaymentsServerUrl } from '../config/payments';

export type BookingStatus =
  | 'pending_payment'
  | 'pending_artist_approval'
  | 'reschedule_proposed'
  | 'confirmed'
  | 'completed'
  | 'cancelled';

export type CreateBookingInput = {
  artistId: string;
  artistUid?: string;
  artistName: string;
  location: string;
  dateISO: string; // YYYY-MM-DD
  startingFrom: number;
  depositAmount: number; // e.g. 249
  skinFlag: 'GREEN' | 'RED';
  skinScore: number;
  // Map questionId -> optionId
  skinAnswers: Record<string, string>;
};

export const bookingDocId = (params: { userUid: string; artistId: string; dateISO: string }) =>
  `${params.userUid}_${params.artistId}_${params.dateISO}`;

const resolveArtistUidByName = async (artistName: string) => {
  const q = query(collection(db, 'artists'), where('displayName', '==', artistName), limit(1));
  const snap = await getDocs(q);
  return snap.docs.length ? snap.docs[0].id : null;
};
const notifyArtistAfterPayment = async (bookingId: string, amount: number) => {
  try {
    const user = auth.currentUser;
    const ref = doc(db, 'bookings', bookingId);
    const snap = await getDoc(ref);
    const data = snap.exists() ? (snap.data() as any) : null;

    const artistName = (data?.artistName as string | undefined) ?? '';

    const explicitUid = (data?.artistUid as string | undefined) ?? '';
    const artistUid = explicitUid || (artistName ? await resolveArtistUidByName(artistName) : null);
    if (!artistUid) return;

    const notifRef = doc(db, 'users', artistUid, 'notifications', `booking_${bookingId}`);
    await setDoc(
      notifRef,
      {
        id: notifRef.id,
        type: 'booking_request',
        toUid: artistUid,
        fromUid: user?.uid ?? null,
        fromName: user?.displayName ?? user?.email ?? 'User',
        bookingId,
        artistName,
        dateISO: data?.dateISO ?? null,
        depositAmount: data?.depositAmount ?? amount,
        skinFlag: data?.skinFlag ?? null,
        skinScore: data?.skinScore ?? null,
        createdAt: serverTimestamp(),
        read: false,
      },
      { merge: true },
    );
  } catch {
    // ignore
  }
};

export const createBooking = async (input: CreateBookingInput) => {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');

  const id = bookingDocId({ userUid: user.uid, artistId: input.artistId, dateISO: input.dateISO });
  const ref = doc(db, 'bookings', id);

  const exists = await getDoc(ref);
  if (exists.exists()) {
    return { id, alreadyExists: true as const };
  }

  await setDoc(ref, {
    id,
    userUid: user.uid,
    userEmail: user.email ?? null,
    userName: user.displayName ?? null,
    artistId: input.artistId,
    artistUid: input.artistUid ?? null,
    artistName: input.artistName,
    location: input.location,
    dateISO: input.dateISO,
    startingFrom: input.startingFrom,
    depositAmount: input.depositAmount,
    currency: 'INR',
    skinFlag: input.skinFlag,
    skinScore: input.skinScore,
    skinAnswers: input.skinAnswers,
    status: 'pending_payment' as BookingStatus,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Important: do NOT notify the artist yet. We notify after payment succeeds.
  return { id, alreadyExists: false as const };
};

export const markBookingPaidSimulated = async (bookingId: string, amount: number = 249) => {
  const ref = doc(db, 'bookings', bookingId);

  await updateDoc(ref, {
    status: 'pending_artist_approval' as BookingStatus,
    payment: {
      provider: 'razorpay',
      status: 'simulated_paid',
      amount,
      at: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });

  await notifyArtistAfterPayment(bookingId, amount);
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
  const currentStatus = String(data?.status ?? '');
  if (currentStatus !== 'pending_payment') {
    // Already processed (or cancelled). Do nothing.
    return;
  }

  const amount = Number(data?.depositAmount ?? 249);
  const baseUrl = getPaymentsServerUrl();

  const r = await fetch(`${baseUrl}/api/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, paymentId, signature }),
  });

  const j = (await r.json().catch(() => null)) as any;
  if (!r.ok || !j?.verified) {
    throw new Error('Payment verification failed.');
  }

  await updateDoc(ref, {
    status: 'pending_artist_approval' as BookingStatus,
    payment: {
      provider: 'razorpay',
      status: 'paid',
      amount,
      orderId,
      paymentId,
      signature,
      at: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });

  await notifyArtistAfterPayment(bookingId, amount);
};


