import { Platform } from 'react-native';
import type { AnalyticsEventName, AnalyticsParams, AnalyticsUserProperties } from './analyticsEvents';

type FirebaseAnalyticsModule = typeof import('@react-native-firebase/analytics');

let modulePromise: Promise<FirebaseAnalyticsModule | null> | null = null;

const loadFirebaseAnalytics = () => {
  if (Platform.OS === 'web') return Promise.resolve(null);
  if (!modulePromise) {
    modulePromise = import('@react-native-firebase/analytics').catch(() => null);
  }
  return modulePromise;
};

export const initializeFirebaseAnalytics = async () => {
  const analyticsModule = await loadFirebaseAnalytics();
  if (!analyticsModule) return false;
  await analyticsModule.setAnalyticsCollectionEnabled(analyticsModule.getAnalytics(), true);
  return true;
};

export const logFirebaseAnalyticsEvent = async (name: AnalyticsEventName, params: AnalyticsParams) => {
  const analyticsModule = await loadFirebaseAnalytics();
  if (!analyticsModule) return;
  const instance = analyticsModule.getAnalytics();
  await analyticsModule.logEvent(instance, name, params as Record<string, string | number | boolean>);

  if (name === 'payment_success') {
    const value = typeof params.value === 'number' ? params.value : 249;
    const transactionId = String(params.event_id ?? params.payment_id ?? '');
    await analyticsModule.logEvent(instance, 'purchase', {
      currency: String(params.currency ?? 'INR'),
      value,
      transaction_id: transactionId,
      items: [{ item_id: 'booking_confirmation', item_name: 'Tatzo Booking Confirmation', price: value, quantity: 1 }],
    });
  }
};

export const setFirebaseAnalyticsUser = async (uid: string | null, properties: AnalyticsUserProperties) => {
  const analyticsModule = await loadFirebaseAnalytics();
  if (!analyticsModule) return;
  const instance = analyticsModule.getAnalytics();
  await analyticsModule.setUserId(instance, uid);
  await analyticsModule.setUserProperties(instance, properties);
};

