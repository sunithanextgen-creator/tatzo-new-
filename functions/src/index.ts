import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import crypto from 'crypto';
import type { Request, Response } from 'express';

admin.initializeApp();

type Json = Record<string, any>;

// Store Razorpay keys as Firebase Secrets (safe). Set them later via Firebase CLI.
const RAZORPAY_KEY_ID = defineSecret('RAZORPAY_KEY_ID');
const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET');

const json = (res: any, status: number, body: Json) => {
  res.status(status);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
};

const withCors = (req: any, res: any): boolean => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
};

const razorpayAuthHeader = (): string => {
  const keyId = RAZORPAY_KEY_ID.value();
  const keySecret = RAZORPAY_KEY_SECRET.value();
  if (!keyId || !keySecret) throw new Error('Missing Razorpay secrets.');
  const token = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  return `Basic ${token}`;
};

const createRazorpayOrder = async (params: { amount: number; currency: string; receipt: string; notes?: Json }) => {
  const resp = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: razorpayAuthHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: params.amount,
      currency: params.currency,
      receipt: params.receipt,
      notes: params.notes ?? {},
    }),
  });

  const data = (await resp.json()) as any;
  if (!resp.ok) {
    throw new Error(data?.error?.description ?? `Razorpay order failed: HTTP ${resp.status}`);
  }
  return data as { id: string; amount: number; currency: string; receipt: string; status: string };
};

const verifySignature = (params: { orderId: string; paymentId: string; signature: string }) => {
  const secret = RAZORPAY_KEY_SECRET.value();
  if (!secret) throw new Error('Missing Razorpay secret.');
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${params.orderId}|${params.paymentId}`)
    .digest('hex');
  return expected === params.signature;
};

// POST { bookingId } -> returns { keyId, orderId, amount, currency }
export const createOrder = onRequest({ region: 'asia-south1', secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] }, async (req: Request, res: Response) => {
  try {
    if (withCors(req, res)) return;
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

    const bookingId = String(req.body?.bookingId ?? '');
    if (!bookingId) return json(res, 400, { ok: false, error: 'bookingId is required' });

    const db = admin.firestore();
    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) return json(res, 404, { ok: false, error: 'Booking not found' });

    const booking = bookingSnap.data() as any;
    if (booking.status !== 'pending_payment') {
      return json(res, 409, { ok: false, error: `Booking status is ${booking.status}` });
    }

    const amountRupees = Number(booking.depositAmount ?? 249);
    const amountPaise = Math.round(amountRupees * 100);
    const currency = 'INR';

    const order = await createRazorpayOrder({
      amount: amountPaise,
      currency,
      receipt: bookingId,
      notes: { bookingId },
    });

    await bookingRef.set(
      {
        payment: {
          provider: 'razorpay',
          status: 'order_created',
          orderId: order.id,
          amount: order.amount,
          currency: order.currency,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return json(res, 200, {
      ok: true,
      keyId: RAZORPAY_KEY_ID.value(),
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
    });
  } catch (e: any) {
    console.error('createOrder error', e);
    return json(res, 500, { ok: false, error: e?.message ?? 'Unknown error' });
  }
});

// POST { bookingId, razorpay_order_id, razorpay_payment_id, razorpay_signature }
export const verifyPayment = onRequest({ region: 'asia-south1', secrets: [RAZORPAY_KEY_SECRET] }, async (req: Request, res: Response) => {
  try {
    if (withCors(req, res)) return;
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });

    const bookingId = String(req.body?.bookingId ?? '');
    const orderId = String(req.body?.razorpay_order_id ?? '');
    const paymentId = String(req.body?.razorpay_payment_id ?? '');
    const signature = String(req.body?.razorpay_signature ?? '');

    if (!bookingId || !orderId || !paymentId || !signature) {
      return json(res, 400, { ok: false, error: 'Missing required fields' });
    }

    const valid = verifySignature({ orderId, paymentId, signature });
    if (!valid) return json(res, 401, { ok: false, error: 'Invalid signature' });

    const db = admin.firestore();
    const bookingRef = db.collection('bookings').doc(bookingId);
    const bookingSnap = await bookingRef.get();
    if (!bookingSnap.exists) return json(res, 404, { ok: false, error: 'Booking not found' });

    await bookingRef.set(
      {
        status: 'pending_artist_approval',
        payment: {
          provider: 'razorpay',
          status: 'paid',
          orderId,
          paymentId,
          signature,
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return json(res, 200, { ok: true });
  } catch (e: any) {
    console.error('verifyPayment error', e);
    return json(res, 500, { ok: false, error: e?.message ?? 'Unknown error' });
  }
});
