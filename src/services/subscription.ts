import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Linking } from 'react-native';
import Constants from 'expo-constants';
import { auth, db } from '../config/firebaseConfig';
import { getPaymentsServerUrl } from '../config/payments';

export const ARTIST_SUBSCRIPTION_REGULAR_RUPEES = 1499;
export const ARTIST_SUBSCRIPTION_BASE_RUPEES = 499;
export const ARTIST_SUBSCRIPTION_GST_RATE = 0.18;
export const ARTIST_SUBSCRIPTION_GST_RUPEES = Number((ARTIST_SUBSCRIPTION_BASE_RUPEES * ARTIST_SUBSCRIPTION_GST_RATE).toFixed(2));
export const ARTIST_SUBSCRIPTION_AMOUNT_RUPEES = Number((ARTIST_SUBSCRIPTION_BASE_RUPEES + ARTIST_SUBSCRIPTION_GST_RUPEES).toFixed(2));
export const ARTIST_SUBSCRIPTION_DURATION_MONTHS = 6;
export const ARTIST_SUBSCRIPTION_AMOUNT_PAISE = Math.round(ARTIST_SUBSCRIPTION_AMOUNT_RUPEES * 100);
export const ARTIST_SUBSCRIPTION_OFFER_LABEL =
  `Tatzo Pro Launch Offer: Rs.${ARTIST_SUBSCRIPTION_BASE_RUPEES} + 18% GST = Rs.${ARTIST_SUBSCRIPTION_AMOUNT_RUPEES} for ${ARTIST_SUBSCRIPTION_DURATION_MONTHS} months. Later renewal: Rs.${ARTIST_SUBSCRIPTION_REGULAR_RUPEES} + GST.`;

const buildSubscriptionReturnUrl = (uid: string) => {
  const appOwnership = String((Constants as any)?.appOwnership ?? '').toLowerCase();
  if (appOwnership !== 'expo') return `tatzo://payment?flow=subscription&uid=${encodeURIComponent(uid)}`;

  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri;

  if (!hostUri) return `tatzo://payment?flow=subscription&uid=${encodeURIComponent(uid)}`;
  const host = String(hostUri);
  return `exp://${host}/--/payment?flow=subscription&uid=${encodeURIComponent(uid)}`;
};

const resolveUid = (uid?: string) => {
  const safe = String(uid ?? '').trim();
  if (safe) return safe;
  const current = String(auth.currentUser?.uid ?? '').trim();
  if (current) return current;
  throw new Error('User is not signed in.');
};

const setSubscriptionState = async (
  uid: string,
  payload: Record<string, unknown>,
) => {
  await setDoc(
    doc(db, 'users', uid),
    {
      subscriptionPlan: 'tatzo_pro',
      ...payload,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
};

export const openRazorpayCheckoutForSubscription = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');

  const uid = resolveUid(user.uid);
  const amount = ARTIST_SUBSCRIPTION_AMOUNT_RUPEES; // Rs.499 base + 18% GST Rs.89.82 = Rs.588.82 total (58882 paise)
  // Razorpay receipt max length = 40 chars, so keep this short and predictable.
  const reference = `sub_${uid.slice(-8)}_${Date.now().toString(36)}`;

  await setSubscriptionState(uid, {
    subscriptionStatus: 'inactive',
    subscriptionPaymentStatus: 'processing',
    subscriptionVerificationStatus: 'pending',
    subscriptionVerificationRequestedAt: serverTimestamp(),
    subscriptionLastError: '',
  });

  const baseUrl = getPaymentsServerUrl();
  const name = encodeURIComponent(user.displayName ?? 'Tatzo Artist');
  const email = encodeURIComponent(user.email ?? '');
  const phone = encodeURIComponent('');
  const returnUrl = encodeURIComponent(buildSubscriptionReturnUrl(uid));

  const url = `${baseUrl}/pay?bookingId=${encodeURIComponent(reference)}&amountRupees=${encodeURIComponent(String(amount))}&name=${name}&email=${email}&phone=${phone}&returnUrl=${returnUrl}&flow=subscription&uid=${encodeURIComponent(uid)}`;
  await Linking.openURL(url);

  return { uid, reference };
};

export const markSubscriptionPaymentCancelled = async (input?: { uid?: string; reason?: string }) => {
  const uid = resolveUid(input?.uid);
  const reason = String(input?.reason ?? 'Payment cancelled by user').trim();

  await setSubscriptionState(uid, {
    subscriptionStatus: 'inactive',
    subscriptionPaymentStatus: 'cancelled',
    subscriptionVerificationStatus: 'failed',
    subscriptionVerificationRequestedAt: null,
    subscriptionLastError: reason,
  });
};

export const markSubscriptionPaymentFailed = async (input?: { uid?: string; reason?: string }) => {
  const uid = resolveUid(input?.uid);
  const reason = String(input?.reason ?? 'Payment failed. Please retry.').trim();

  await setSubscriptionState(uid, {
    subscriptionStatus: 'inactive',
    subscriptionPaymentStatus: 'failed',
    subscriptionVerificationStatus: 'failed',
    subscriptionVerificationRequestedAt: null,
    subscriptionLastError: reason,
  });
};

export const markSubscriptionPaidRazorpay = async (params: {
  uid?: string;
  orderId: string;
  paymentId: string;
  signature: string;
}) => {
  const uid = resolveUid(params.uid);
  const baseUrl = getPaymentsServerUrl();

  const verifyResponse = await fetch(`${baseUrl}/api/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      flow: 'subscription',
      uid,
      orderId: params.orderId,
      paymentId: params.paymentId,
      signature: params.signature,
    }),
  });

  const verifyBody = (await verifyResponse.json().catch(() => null)) as any;
  if (!verifyResponse.ok || !verifyBody?.verified) {
    await markSubscriptionPaymentFailed({ uid, reason: 'Payment verification failed.' });
    throw new Error('Subscription payment verification failed. Please retry.');
  }

  // Trusted Function has already activated Pro after Razorpay signature verification. The client never activates Pro directly.
};
