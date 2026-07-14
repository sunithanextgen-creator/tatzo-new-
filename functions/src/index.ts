import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import * as admin from 'firebase-admin';
import crypto from 'crypto';
import type { Request, Response } from 'express';

admin.initializeApp();

const REGION = 'asia-south1';
const RAZORPAY_KEY_ID = defineSecret('RAZORPAY_KEY_ID');
const RAZORPAY_KEY_SECRET = defineSecret('RAZORPAY_KEY_SECRET');

const SUBSCRIPTION_REGULAR_RUPEES = 1499;
const SUBSCRIPTION_BASE_RUPEES = 499;
const SUBSCRIPTION_GST_RATE = 0.18;
const SUBSCRIPTION_GST_RUPEES = Number((SUBSCRIPTION_BASE_RUPEES * SUBSCRIPTION_GST_RATE).toFixed(2));
const SUBSCRIPTION_TOTAL_RUPEES = Number((SUBSCRIPTION_BASE_RUPEES + SUBSCRIPTION_GST_RUPEES).toFixed(2));
const SUBSCRIPTION_DURATION_MONTHS = 6;

const addMonths = (date: Date, months: number) => {
  const copy = new Date(date.getTime());
  copy.setMonth(copy.getMonth() + months);
  return copy;
};

type Json = Record<string, any>;

type VerifyInput = {
  flow: 'booking' | 'subscription' | 'final_payment';
  bookingId: string;
  uid: string;
  orderId: string;
  paymentId: string;
  signature: string;
};

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;
const STORAGE_BUCKET = 'tatzo-as0711.firebasestorage.app';

const cleanSecret = (value: string) => String(value || '').trim().replace(/^['"]|['"]$/g, '');
const getKeyId = () => cleanSecret(RAZORPAY_KEY_ID.value());
const getKeySecret = () => cleanSecret(RAZORPAY_KEY_SECRET.value());
const getPaymentMode = () => {
  const keyId = getKeyId();
  if (keyId.startsWith('rzp_test_')) return 'test';
  if (keyId.startsWith('rzp_live_')) return 'live';
  return 'unknown';
};

const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

const json = (res: Response, status: number, body: Json) => {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
};

const withCors = (req: Request, res: Response): boolean => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return true;
  }
  return false;
};

const makeReceipt = (value: string) => {
  const fallback = `tatzo_${Date.now().toString(36)}`;
  const safe = String(value || fallback).replace(/[^a-zA-Z0-9_]/g, '').slice(0, 40);
  return safe.length >= 6 ? safe : fallback.slice(0, 40);
};

const razorpayAuthHeader = () => {
  const keyId = getKeyId();
  const keySecret = getKeySecret();
  if (!keyId || !keySecret) throw new Error('Missing Razorpay secrets.');
  return `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;
};

const razorpayFetch = async (path: string, options: RequestInit) => {
  const resp = await fetch(`https://api.razorpay.com/v1${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: razorpayAuthHeader(),
      ...(options.headers || {}),
    },
  });
  const body = await resp.json().catch(() => null) as any;
  if (!resp.ok) {
    const err = new Error(body?.error?.description ?? `Razorpay API error (${resp.status})`) as Error & { statusCode?: number; details?: any };
    err.statusCode = resp.status;
    err.details = body;
    throw err;
  }
  return body;
};

const createRazorpayOrder = async (params: { reference: string; amountRupees: number; notes?: Json }) => {
  const amount = Math.round(Number(params.amountRupees) * 100);
  if (!Number.isFinite(amount) || amount < 100) {
    const err = new Error('Invalid payment amount.') as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }
  const order = await razorpayFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({
      amount,
      currency: 'INR',
      receipt: makeReceipt(params.reference),
      notes: params.notes ?? {},
    }),
  });
  return {
    keyId: getKeyId(),
    orderId: String(order.id),
    amount: Number(order.amount),
    currency: String(order.currency ?? 'INR'),
    receipt: String(order.receipt ?? ''),
  };
};

const verifySignature = (params: { orderId: string; paymentId: string; signature: string }) => {
  const secret = getKeySecret();
  if (!secret) throw new Error('Missing Razorpay secret.');
  const expected = crypto.createHmac('sha256', secret).update(`${params.orderId}|${params.paymentId}`).digest('hex');
  return expected === params.signature;
};

const slotLockDocId = (artistUid: string, dateISO: string, slotId: string) => `${artistUid}_${dateISO}_${slotId}`;

const writeNotificationDual = async (id: string, payload: Json) => {
  const notification = {
    id,
    read: false,
    createdAt: FieldValue.serverTimestamp(),
    ...payload,
  };
  await Promise.all([
    db.collection('notifications').doc(id).set(notification, { merge: true }),
    db.collection('users').doc(String(payload.toUid)).collection('notifications').doc(id).set(notification, { merge: true }),
  ]);
};

const renderErrorPage = (status: number, message: string) => `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Tatzo Payment Issue</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#080b12;color:#f5f7fa;font-family:Arial,Helvetica,sans-serif;padding:18px}.card{max-width:560px;border:1px solid rgba(255,255,255,.12);border-radius:20px;padding:20px;background:#111827}.brand{letter-spacing:3px;color:#00e5ff;font-weight:900;font-size:12px}.title{font-size:22px;font-weight:900;margin:10px 0}.box{border:1px solid rgba(255,93,122,.38);background:rgba(255,93,122,.12);border-radius:14px;padding:12px;line-height:1.5}</style>
</head><body><div class="card"><div class="brand">TATZO PAYMENTS</div><div class="title">Payment could not start</div><div class="box">Status: ${status}<br/>${escapeHtml(message)}<br/>Mode: ${escapeHtml(getPaymentMode().toUpperCase())}</div></div></body></html>`;

const buildDeepLink = (base: string, params: Json) => {
  if (!base) return '';
  const query = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && String(v) !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${base}${base.includes('?') ? '&' : '?'}${query}`;
};

const createCheckoutOrderFromQuery = async (req: Request) => {
  const rawFlow = String(req.query.flow || 'booking');
  const flow: 'booking' | 'subscription' | 'final_payment' = rawFlow === 'subscription' ? 'subscription' : rawFlow === 'final_payment' ? 'final_payment' : 'booking';
  const bookingId = String(req.query.bookingId || '').trim();
  const uid = String(req.query.uid || '').trim();

  if (flow === 'subscription') {
    if (!uid) throw Object.assign(new Error('uid is required for subscription payment.'), { statusCode: 400 });
    const order = await createRazorpayOrder({
      reference: bookingId || `sub_${uid.slice(-8)}_${Date.now().toString(36)}`,
      amountRupees: SUBSCRIPTION_TOTAL_RUPEES,
      notes: { flow, uid },
    });
    return { flow, bookingId, uid, amountRupees: SUBSCRIPTION_TOTAL_RUPEES, order };
  }

  if (flow === 'final_payment') {
    if (!bookingId) throw Object.assign(new Error('bookingId is required.'), { statusCode: 400 });
    const bookingSnap = await db.collection('bookings').doc(bookingId).get();
    if (!bookingSnap.exists) throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
    const booking = bookingSnap.data() as any;
    const status = String(booking?.status ?? '');
    if (status !== 'final_payment_pending' && status !== 'completed') {
      throw Object.assign(new Error(`Final payment is not available for booking status ${status}.`), { statusCode: 409 });
    }
    if (status === 'completed') {
      throw Object.assign(new Error('This booking is already completed.'), { statusCode: 409 });
    }
    const amountRupees = Number(booking?.finalStudioAmount ?? 0);
    if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
      throw Object.assign(new Error('Final amount is missing.'), { statusCode: 400 });
    }
    const order = await createRazorpayOrder({
      reference: `final_${bookingId}`,
      amountRupees,
      notes: { flow, bookingId, userUid: booking?.userUid ?? '', artistUid: booking?.artistUid ?? '' },
    });
    await bookingSnap.ref.set({ finalPaymentOrder: { provider: 'razorpay', orderId: order.orderId, amount: order.amount, currency: order.currency, createdAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return { flow, bookingId, uid, amountRupees, order };
  }
  if (!bookingId) throw Object.assign(new Error('bookingId is required.'), { statusCode: 400 });
  const bookingSnap = await db.collection('bookings').doc(bookingId).get();
  if (!bookingSnap.exists) throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
  const booking = bookingSnap.data() as any;
  const status = String(booking?.status ?? '');
  if (status !== 'quote_sent_payment_pending' && status !== 'payment_failed' && status !== 'confirmed') {
    throw Object.assign(new Error(`Payment is not available for booking status ${status}.`), { statusCode: 409 });
  }
  if (status === 'confirmed') {
    throw Object.assign(new Error('This booking is already confirmed.'), { statusCode: 409 });
  }
  const amountRupees = Number(booking?.bookingConfirmationFee ?? booking?.depositAmount ?? 249);
  const order = await createRazorpayOrder({
    reference: bookingId,
    amountRupees,
    notes: { flow, bookingId, userUid: booking?.userUid ?? '', artistUid: booking?.artistUid ?? '' },
  });
  await bookingSnap.ref.set({ paymentOrder: { provider: 'razorpay', orderId: order.orderId, amount: order.amount, currency: order.currency, createdAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { flow, bookingId, uid, amountRupees, order };
};

const renderCheckoutPage = (params: {
  flow: 'booking' | 'subscription' | 'final_payment';
  bookingId: string;
  uid: string;
  amountRupees: number;
  order: { keyId: string; orderId: string; amount: number; currency: string };
  name: string;
  email: string;
  phone: string;
  returnUrl: string;
}) => {
  const paymentTitle = params.flow === 'subscription' ? 'Tatzo Pro subscription' : params.flow === 'final_payment' ? 'Final tattoo payment' : 'Booking payment';
  const paymentDescription = params.flow === 'subscription'
    ? `Discount plan Rs.${SUBSCRIPTION_BASE_RUPEES} + GST Rs.${SUBSCRIPTION_GST_RUPEES}`
    : params.flow === 'final_payment'
      ? 'Final tattoo studio amount'
      : 'Booking payment';
  const successLink = buildDeepLink(params.returnUrl, { bookingId: params.bookingId, orderId: params.order.orderId, status: 'success', flow: params.flow, uid: params.uid });
  const cancelLink = buildDeepLink(params.returnUrl, { bookingId: params.bookingId, status: 'cancelled', flow: params.flow, uid: params.uid });

  return `<!doctype html>
<html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Tatzo Payment</title>
<style>body{margin:0;font-family:Arial,Helvetica,sans-serif;background:#0b0b0f;color:#f5f7fa;display:flex;align-items:center;justify-content:center;min-height:100vh}.card{width:min(520px,92vw);border:1px solid rgba(255,255,255,.10);border-radius:18px;padding:18px;background:rgba(255,255,255,.04);box-shadow:0 18px 34px rgba(0,0,0,.35)}.brand{letter-spacing:3px;font-weight:800;font-size:12px;color:#7a5cff;text-transform:uppercase}.title{font-size:20px;font-weight:800;margin:10px 0 6px}.muted{color:rgba(245,247,250,.75);font-size:13px;line-height:1.55}.btn{width:100%;border:none;border-radius:14px;padding:14px 16px;margin-top:14px;font-weight:800;cursor:pointer;background:linear-gradient(90deg,#00e5ff,#7a5cff);color:#0b0b0f}.fine{margin-top:10px;font-size:12px;color:rgba(245,247,250,.6)}.status{margin-top:14px;font-size:13px;white-space:pre-wrap}.open-app{display:none;width:100%;text-align:center;margin-top:12px}.open-app a{display:inline-block;padding:11px 16px;border-radius:12px;border:1px solid rgba(0,229,255,.45);background:rgba(0,229,255,.12);text-decoration:none;color:#f5f7fa;font-weight:700}</style>
</head><body><div class="card"><div class="brand">TATZO</div><div class="title">${escapeHtml(paymentTitle)}</div><div class="muted">Amount: <b>Rs. ${escapeHtml(params.amountRupees)}</b>${params.flow === 'subscription' ? `<br/>Offer: <b>Regular Rs. ${SUBSCRIPTION_REGULAR_RUPEES}, now Rs. ${SUBSCRIPTION_BASE_RUPEES} + 18% GST (Rs. ${SUBSCRIPTION_GST_RUPEES})</b>` : ''}<br/>Mode: <b>${escapeHtml(getPaymentMode().toUpperCase())}</b></div><button class="btn" id="payBtn">Pay now</button><div class="fine">Do not close this tab until payment returns to Tatzo.</div><div class="status" id="status"></div><div class="open-app" id="openAppWrap"><a id="openAppLink" href="#">Open Tatzo App</a></div></div>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
const statusEl=document.getElementById('status');const setStatus=(m)=>{statusEl.textContent=m};
const buildDeepLink=(base,params)=>{if(!base)return'';const q=Object.entries(params).filter(([,v])=>v!==undefined&&v!==null&&String(v)!=='').map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(String(v))).join('&');return base+(base.includes('?')?'&':'?')+q};
const showOpenApp=(url,msg)=>{const wrap=document.getElementById('openAppWrap');const link=document.getElementById('openAppLink');if(link)link.href=url;if(wrap)wrap.style.display='block';setStatus(msg);setTimeout(()=>{window.location.assign(url)},250)};
const verifyEndpoint=window.location.pathname.startsWith('/payments')?'/payments/api/razorpay/verify':'/api/razorpay/verify';const options={key:${JSON.stringify(params.order.keyId)},amount:${JSON.stringify(params.order.amount)},currency:${JSON.stringify(params.order.currency)},name:'Tatzo',description:${JSON.stringify(paymentDescription)},order_id:${JSON.stringify(params.order.orderId)},prefill:{name:${JSON.stringify(params.name)},email:${JSON.stringify(params.email)},contact:${JSON.stringify(params.phone)}},theme:{color:'#7A5CFF'},method:{upi:true,card:true,netbanking:true,wallet:true},handler:async function(resp){try{setStatus('Verifying payment...');const r=await fetch(verifyEndpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({flow:${JSON.stringify(params.flow)},bookingId:${JSON.stringify(params.bookingId)},uid:${JSON.stringify(params.uid)},orderId:resp.razorpay_order_id,paymentId:resp.razorpay_payment_id,signature:resp.razorpay_signature})});const j=await r.json().catch(()=>null);if(!r.ok||!j?.ok){setStatus((j&&j.error)||'Verification failed. Please contact support.');return;}const url=buildDeepLink(${JSON.stringify(params.returnUrl)},{bookingId:${JSON.stringify(params.bookingId)},orderId:resp.razorpay_order_id,paymentId:resp.razorpay_payment_id,signature:resp.razorpay_signature,status:'success',flow:${JSON.stringify(params.flow)},uid:${JSON.stringify(params.uid)}});showOpenApp(url,'Success. Payment verified. Returning to Tatzo...')}catch(e){setStatus('Error: '+(e&&e.message?e.message:String(e)))}} ,modal:{ondismiss:function(){showOpenApp(${JSON.stringify(cancelLink)},'Payment cancelled. Returning to Tatzo...')}}};
let opened=false;const openCheckout=()=>{if(opened)return;opened=true;setStatus('Opening Razorpay Checkout...');new Razorpay(options).open()};document.getElementById('payBtn').addEventListener('click',openCheckout);window.addEventListener('load',()=>setTimeout(openCheckout,250));
</script></body></html>`;
};

const handlePay = async (req: Request, res: Response) => {
  const checkout = await createCheckoutOrderFromQuery(req);
  const html = renderCheckoutPage({
    ...checkout,
    name: String(req.query.name || 'Tatzo User'),
    email: String(req.query.email || ''),
    phone: String(req.query.phone || ''),
    returnUrl: String(req.query.returnUrl || 'tatzo://payment'),
  });
  res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
};

const normalizeVerifyInput = (body: any): VerifyInput => ({
  flow: String(body?.flow || 'booking') === 'subscription' ? 'subscription' : String(body?.flow || 'booking') === 'final_payment' ? 'final_payment' : 'booking',
  bookingId: String(body?.bookingId || '').trim(),
  uid: String(body?.uid || '').trim(),
  orderId: String(body?.orderId || body?.razorpay_order_id || '').trim(),
  paymentId: String(body?.paymentId || body?.razorpay_payment_id || '').trim(),
  signature: String(body?.signature || body?.razorpay_signature || '').trim(),
});

const verifyBookingPayment = async (input: VerifyInput) => {
  if (!input.bookingId) throw Object.assign(new Error('bookingId is required.'), { statusCode: 400 });
  const bookingRef = db.collection('bookings').doc(input.bookingId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists) throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
    const booking = snap.data() as any;
    const status = String(booking?.status ?? '');
    const existingPaymentId = String(booking?.payment?.paymentId ?? '');

    if (status === 'confirmed') {
      if (existingPaymentId === input.paymentId) return { duplicate: true, booking };
      tx.set(db.collection('paymentReviews').doc(`booking_${input.bookingId}_${input.paymentId}`), {
        bookingId: input.bookingId,
        paymentId: input.paymentId,
        orderId: input.orderId,
        reason: 'confirmed_booking_different_payment',
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      throw Object.assign(new Error('Booking is already confirmed with a different payment.'), { statusCode: 409 });
    }

    if (status !== 'quote_sent_payment_pending' && status !== 'payment_failed') {
      throw Object.assign(new Error(`Payment not allowed for booking status ${status}.`), { statusCode: 409 });
    }

    const amount = Number(booking?.bookingConfirmationFee ?? booking?.depositAmount ?? 249);
    tx.update(bookingRef, {
      status: 'confirmed',
      reminderCreated: false,
      reminderSentAt: null,
      reminderScheduledFor: booking?.dateISO ?? null,
      payment: {
        provider: 'razorpay',
        status: 'paid',
        amount,
        orderId: input.orderId,
        paymentId: input.paymentId,
        signature: input.signature,
        verifiedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    const purchaseEventId = `booking_purchase_${input.bookingId}_${input.paymentId}`;
    tx.set(db.collection('analyticsEvents').doc(purchaseEventId), {
      eventId: purchaseEventId,
      eventName: 'payment_success',
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      value: amount,
      currency: 'INR',
      verificationSource: 'razorpay_backend',
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: false });
    tx.set(db.collection('analyticsEvents').doc(`booking_confirmed_${input.bookingId}_${input.paymentId}`), {
      eventId: `booking_confirmed_${input.bookingId}_${input.paymentId}`,
      eventName: 'booking_confirmed',
      bookingId: input.bookingId,
      paymentId: input.paymentId,
      verificationSource: 'razorpay_backend',
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: false });

    const artistUid = String(booking?.artistUid ?? '').trim();
    const dateISO = String(booking?.dateISO ?? '').trim();
    const slotId = String(booking?.slotId ?? '').trim();
    if (artistUid && dateISO && slotId) {
      const slotRef = db.collection('bookingSlots').doc(slotLockDocId(artistUid, dateISO, slotId));
      tx.set(slotRef, { artistUid, dateISO, slotId, bookingId: input.bookingId, status: 'confirmed', updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }

    return { duplicate: false, booking: { ...booking, depositAmount: amount, bookingConfirmationFee: amount } };
  });

  if (!result.duplicate) {
    const booking = result.booking;
    const artistUid = String(booking?.artistUid ?? '').trim();
    const userUid = String(booking?.userUid ?? '').trim();
    const amount = Number(booking?.bookingConfirmationFee ?? booking?.depositAmount ?? 249);
    if (artistUid) {
      await writeNotificationDual(`payment_success_${input.bookingId}`, {
        toUid: artistUid,
        fromUid: userUid || artistUid,
        fromName: booking?.userName ?? 'User',
        type: 'payment_success',
        title: 'Collected Amount Recorded',
        message: `${booking?.userName ?? 'User'} paid the booking confirmation fee. Booking confirmed for ${booking?.dateISO ?? ''} - ${booking?.slotId ?? ''}.`,
        entityType: 'booking',
        entityId: input.bookingId,
        bookingId: input.bookingId,
        dateISO: booking?.dateISO ?? null,
        depositAmount: amount,
      });
    }
    if (userUid) {
      await writeNotificationDual(`booking_confirmed_${input.bookingId}`, {
        toUid: userUid,
        fromUid: artistUid || userUid,
        fromName: booking?.artistName ?? 'Artist',
        type: 'booking_confirmed',
        title: 'Booking Confirmed',
        message: `Your tattoo appointment is confirmed for ${booking?.dateISO ?? ''} - ${booking?.slotId ?? ''}.`,
        entityType: 'booking',
        entityId: input.bookingId,
        bookingId: input.bookingId,
        dateISO: booking?.dateISO ?? null,
        depositAmount: amount,
      });
    }
  }

  return { ok: true, verified: true, duplicate: result.duplicate, status: 'confirmed' };
};

const verifyFinalPayment = async (input: VerifyInput) => {
  if (!input.bookingId) throw Object.assign(new Error('bookingId is required.'), { statusCode: 400 });
  const bookingRef = db.collection('bookings').doc(input.bookingId);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(bookingRef);
    if (!snap.exists) throw Object.assign(new Error('Booking not found.'), { statusCode: 404 });
    const booking = snap.data() as any;
    const status = String(booking?.status ?? '');
    const existingPaymentId = String(booking?.finalPayment?.paymentId ?? '');

    if (status === 'completed') {
      if (existingPaymentId === input.paymentId) return { duplicate: true, booking };
      tx.set(db.collection('paymentReviews').doc(`final_${input.bookingId}_${input.paymentId}`), {
        bookingId: input.bookingId,
        paymentId: input.paymentId,
        orderId: input.orderId,
        reason: 'completed_booking_different_final_payment',
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      throw Object.assign(new Error('Booking is already completed with a different final payment.'), { statusCode: 409 });
    }

    if (status !== 'final_payment_pending') {
      throw Object.assign(new Error(`Final payment not allowed for booking status ${status}.`), { statusCode: 409 });
    }

    const amount = Number(booking?.finalStudioAmount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) throw Object.assign(new Error('Final amount is missing.'), { statusCode: 400 });

    tx.update(bookingRef, {
      status: 'completed',
      completedAt: FieldValue.serverTimestamp(),
      finalPayment: {
        provider: 'razorpay',
        status: 'paid',
        amount,
        orderId: input.orderId,
        paymentId: input.paymentId,
        signature: input.signature,
        verifiedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    const transactionRef = db.collection('artistTransactions').doc(input.bookingId);
    tx.set(transactionRef, {
      bookingId: input.bookingId,
      artistUid: String(booking?.artistUid ?? ''),
      userUid: String(booking?.userUid ?? ''),
      bookingConfirmationFee: Number(booking?.bookingConfirmationFee ?? booking?.depositAmount ?? 249),
      quotedRange: booking?.quoteRangeLabel ?? null,
      finalStudioAmount: amount,
      finalPaymentAmount: amount,
      finalPaymentId: input.paymentId,
      platformFeeAmount: null,
      payoutStatus: 'pending',
      payoutMethod: 'razorpay',
      completedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      notes: booking?.finalAmountNote ?? '',
    }, { merge: true });

    return { duplicate: false, booking: { ...booking, finalStudioAmount: amount } };
  });

  if (!result.duplicate) {
    const booking = result.booking;
    const artistUid = String(booking?.artistUid ?? '').trim();
    const userUid = String(booking?.userUid ?? '').trim();
    const amount = Number(booking?.finalStudioAmount ?? 0);
    if (artistUid) {
      await writeNotificationDual(`final_payment_success_artist_${input.bookingId}`, {
        toUid: artistUid,
        fromUid: userUid || artistUid,
        fromName: booking?.userName ?? 'User',
        type: 'final_payment_success',
        title: 'Collected Amount Recorded',
        message: `${booking?.userName ?? 'User'} paid the final tattoo amount Rs. ${amount}.`,
        entityType: 'booking',
        entityId: input.bookingId,
        bookingId: input.bookingId,
        dateISO: booking?.dateISO ?? null,
        depositAmount: amount,
      });
    }
    if (userUid) {
      await writeNotificationDual(`final_payment_success_user_${input.bookingId}`, {
        toUid: userUid,
        fromUid: artistUid || userUid,
        fromName: booking?.artistName ?? 'Artist',
        type: 'final_payment_success',
        title: 'Booking Completed',
        message: 'Final payment received. Your tattoo booking is completed.',
        entityType: 'booking',
        entityId: input.bookingId,
        bookingId: input.bookingId,
        dateISO: booking?.dateISO ?? null,
        depositAmount: amount,
      });
    }
  }

  return { ok: true, verified: true, duplicate: result.duplicate, status: 'completed' };
};
const verifySubscriptionPayment = async (input: VerifyInput) => {
  if (!input.uid) throw Object.assign(new Error('uid is required.'), { statusCode: 400 });
  const userRef = db.collection('users').doc(input.uid);

  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists) throw Object.assign(new Error('User not found.'), { statusCode: 404 });
    const user = snap.data() as any;
    const existingPaymentId = String(user?.subscriptionPayment?.paymentId ?? '');
    const alreadyActive =
      user?.subscriptionStatus === 'active' &&
      user?.subscriptionPaymentStatus === 'paid' &&
      user?.subscriptionVerificationStatus === 'verified';

    if (alreadyActive && existingPaymentId === input.paymentId) return { duplicate: true };

    if (alreadyActive && existingPaymentId && existingPaymentId !== input.paymentId) {
      tx.set(db.collection('paymentReviews').doc(`subscription_${input.uid}_${input.paymentId}`), {
        uid: input.uid,
        paymentId: input.paymentId,
        orderId: input.orderId,
        reason: 'active_subscription_different_payment',
        status: 'open',
        createdAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      throw Object.assign(new Error('Subscription is already active with a different payment.'), { statusCode: 409 });
    }

    const now = new Date();
    const expiresAt = admin.firestore.Timestamp.fromDate(addMonths(now, SUBSCRIPTION_DURATION_MONTHS));
    const serverNow = FieldValue.serverTimestamp();

    tx.set(userRef, {
      subscriptionPlan: 'tatzo_pro',
      subscriptionStatus: 'active',
      subscriptionPaymentStatus: 'paid',
      subscriptionVerificationStatus: 'verified',
      subscriptionVerificationRequestedAt: null,
      subscriptionPaidAt: serverNow,
      subscriptionActivatedAt: serverNow,
      subscriptionExpiresAt: expiresAt,
      subscriptionLastError: '',
      subscriptionPayment: {
        provider: 'razorpay',
        orderId: input.orderId,
        paymentId: input.paymentId,
        amount: SUBSCRIPTION_TOTAL_RUPEES,
        baseAmount: SUBSCRIPTION_BASE_RUPEES,
        gstAmount: SUBSCRIPTION_GST_RUPEES,
        regularRenewalAmount: SUBSCRIPTION_REGULAR_RUPEES,
        durationMonths: SUBSCRIPTION_DURATION_MONTHS,
        paidAt: serverNow,
      },
      updatedAt: serverNow,
    }, { merge: true });
    return { duplicate: false };
  });

  return { ok: true, verified: true, duplicate: result.duplicate, status: 'active' };
};

const handleVerify = async (req: Request, res: Response) => {
  const input = normalizeVerifyInput(req.body || {});
  if (!input.orderId || !input.paymentId || !input.signature) {
    return json(res, 400, { ok: false, verified: false, error: 'Missing payment verification fields.' });
  }
  if (!verifySignature(input)) {
    return json(res, 401, { ok: false, verified: false, error: 'Invalid payment signature.' });
  }
  const result = input.flow === 'subscription' ? await verifySubscriptionPayment(input) : input.flow === 'final_payment' ? await verifyFinalPayment(input) : await verifyBookingPayment(input);
  return json(res, 200, result);
};

const handleCreateOrder = async (req: Request, res: Response) => {
  const bookingId = String(req.body?.bookingId || '').trim();
  const rawFlow = String(req.body?.flow || 'booking');
  const flow = rawFlow === 'subscription' ? 'subscription' : rawFlow === 'final_payment' ? 'final_payment' : 'booking';
  if (flow === 'subscription') {
    const uid = String(req.body?.uid || '').trim();
    if (!uid) return json(res, 400, { ok: false, error: 'uid is required.' });
    const order = await createRazorpayOrder({ reference: bookingId || `sub_${uid.slice(-8)}_${Date.now().toString(36)}`, amountRupees: SUBSCRIPTION_TOTAL_RUPEES, notes: { flow, uid } });
    return json(res, 200, { ok: true, ...order });
  }
  if (flow === 'final_payment') {
    if (!bookingId) return json(res, 400, { ok: false, error: 'bookingId is required.' });
    const bookingSnap = await db.collection('bookings').doc(bookingId).get();
    if (!bookingSnap.exists) return json(res, 404, { ok: false, error: 'Booking not found.' });
    const booking = bookingSnap.data() as any;
    const status = String(booking?.status ?? '');
    if (status !== 'final_payment_pending') return json(res, 409, { ok: false, error: `Final payment is not available for booking status ${status}.` });
    const amountRupees = Number(booking?.finalStudioAmount ?? 0);
    if (!Number.isFinite(amountRupees) || amountRupees <= 0) return json(res, 400, { ok: false, error: 'Final amount is missing.' });
    const order = await createRazorpayOrder({ reference: `final_${bookingId}`, amountRupees, notes: { flow, bookingId, userUid: booking?.userUid ?? '', artistUid: booking?.artistUid ?? '' } });
    await bookingSnap.ref.set({ finalPaymentOrder: { provider: 'razorpay', orderId: order.orderId, amount: order.amount, currency: order.currency, createdAt: FieldValue.serverTimestamp() }, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return json(res, 200, { ok: true, ...order });
  }
  if (!bookingId) return json(res, 400, { ok: false, error: 'bookingId is required.' });
  const bookingSnap = await db.collection('bookings').doc(bookingId).get();
  if (!bookingSnap.exists) return json(res, 404, { ok: false, error: 'Booking not found.' });
  const booking = bookingSnap.data() as any;
  const order = await createRazorpayOrder({ reference: bookingId, amountRupees: Number(booking?.bookingConfirmationFee ?? booking?.depositAmount ?? 249), notes: { flow, bookingId } });
  return json(res, 200, { ok: true, ...order });
};

export const payments = onRequest({ region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] }, async (req: Request, res: Response) => {
  try {
    if (withCors(req, res)) return;
    const url = String(req.originalUrl || req.url || '');
    if (req.method === 'GET' && (url.includes('/pay') || url === '/' || url.includes('?bookingId='))) return await handlePay(req, res);
    if (req.method === 'GET' && url.includes('/health')) return json(res, 200, { ok: true, service: 'tatzo-payments-functions', region: REGION, razorpayMode: getPaymentMode(), keyPrefix: getKeyId().slice(0, 9) });
    if (req.method === 'POST' && url.includes('/api/razorpay/order')) return await handleCreateOrder(req, res);
    if (req.method === 'POST' && url.includes('/api/razorpay/verify')) return await handleVerify(req, res);
    return json(res, 404, { ok: false, error: 'Not found.' });
  } catch (e: any) {
    const status = Number(e?.statusCode ?? 500);
    const message = e?.message ?? 'Payment server error.';
    if (req.method === 'GET') {
      res.status(status).setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderErrorPage(status, message));
      return;
    }
    return json(res, status, { ok: false, verified: false, error: message });
  }
});

// Compatibility exports for older clients/tests that call function endpoints directly.
export const createOrder = onRequest({ region: REGION, secrets: [RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET] }, async (req: Request, res: Response) => {
  try {
    if (withCors(req, res)) return;
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
    return await handleCreateOrder(req, res);
  } catch (e: any) {
    return json(res, Number(e?.statusCode ?? 500), { ok: false, error: e?.message ?? 'Unknown error' });
  }
});

export const verifyPayment = onRequest({ region: REGION, secrets: [RAZORPAY_KEY_SECRET] }, async (req: Request, res: Response) => {
  try {
    if (withCors(req, res)) return;
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
    return await handleVerify(req, res);
  } catch (e: any) {
    return json(res, Number(e?.statusCode ?? 500), { ok: false, verified: false, error: e?.message ?? 'Unknown error' });
  }
});

export const earlyAccessSignup = onRequest({ region: REGION }, async (req: Request, res: Response) => {
  try {
    if (withCors(req, res)) return;
    if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed.' });

  const body = (req.body ?? {}) as Json;
  const role = String(body.role ?? '').trim().toLowerCase();
  const name = String(body.name ?? '').trim().slice(0, 80);
  const email = String(body.email ?? '').trim().toLowerCase().slice(0, 160);
  const phone = String(body.phone ?? '').replace(/[^0-9+]/g, '').slice(0, 16);
  const city = String(body.city ?? '').trim().slice(0, 80);
  const platform = String(body.platform ?? '').trim().toLowerCase().slice(0, 20);
  const interests = String(body.interests ?? '').trim().slice(0, 240);
  const instagram = String(body.instagram ?? '').trim().replace(/^@/, '').slice(0, 80);
  const imageData = String(body.imageData ?? '');
  const imageName = String(body.imageName ?? 'tattoo-sample.jpg').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
  const imageType = String(body.imageType ?? '').trim().toLowerCase();
  const website = String(body.website ?? '').trim();
  const consent = body.consent === true;

  if (website) return json(res, 200, { ok: true });
  if (!['user', 'artist'].includes(role)) return json(res, 400, { ok: false, error: 'Choose User or Artist.' });
  if (name.length < 2 || !city || !consent) return json(res, 400, { ok: false, error: 'Name, city and consent are required.' });
  if (!email && phone.length < 8) return json(res, 400, { ok: false, error: 'Enter a valid email or phone number.' });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json(res, 400, { ok: false, error: 'Enter a valid email address.' });
  if (role === 'artist' && !instagram) return json(res, 400, { ok: false, error: 'Instagram ID is required.' });

  const identity = email || phone;
  const leadId = crypto.createHash('sha256').update(`${role}:${identity}`).digest('hex').slice(0, 40);
  const leadRef = db.collection('earlyAccessWaitlist').doc(leadId);
  const existing = await leadRef.get();
  let portfolioImage = existing.data()?.portfolioImage ?? null;

  if (role === 'artist' && imageData) {
    const match = imageData.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match || !['image/jpeg', 'image/png', 'image/webp'].includes(imageType || match[1])) {
      return json(res, 400, { ok: false, error: 'Upload a JPG, PNG or WebP image.' });
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 2 * 1024 * 1024) return json(res, 400, { ok: false, error: 'Image must be under 2 MB.' });

    const storagePath = `early-access/${leadId}/portfolio/${Date.now()}_${imageName}`;
    const token = crypto.randomUUID();
    const bucket = admin.storage().bucket(STORAGE_BUCKET);
    await bucket.file(storagePath).save(bytes, {
      resumable: false,
      contentType: imageType || match[1],
      metadata: { metadata: { firebaseStorageDownloadTokens: token } },
    });
    const downloadUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`;
    portfolioImage = { downloadUrl, storagePath, fileName: imageName, mimeType: imageType || match[1], size: bytes.length };
  }

  await leadRef.set({
    role,
    name,
    email: email || null,
    phone: phone || null,
    city,
    platform: platform || 'unknown',
    interests: role === 'user' ? interests || null : null,
    instagram: role === 'artist' ? instagram : null,
    portfolioImage: role === 'artist' ? portfolioImage : null,
    source: 'july_12_early_access',
    status: existing.exists ? String(existing.data()?.status ?? 'waiting') : 'waiting',
    consentAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    createdAt: existing.exists ? existing.data()?.createdAt ?? FieldValue.serverTimestamp() : FieldValue.serverTimestamp(),
  }, { merge: true });

  return json(res, 200, {
    ok: true,
    message: role === 'artist'
      ? 'Your artist early-access application is received.'
      : 'You are on the Tatzo early-access list.',
  });
  } catch (error: any) {
    console.error('earlyAccessSignup failed', error);
    return json(res, 500, { ok: false, error: error?.message ?? 'Could not submit right now.' });
  }
});
