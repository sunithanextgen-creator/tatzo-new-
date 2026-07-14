import { Platform } from 'react-native';
import type { AnalyticsEventName, AnalyticsParams } from './analyticsEvents';

type MetaModule = typeof import('react-native-fbsdk-next');

let modulePromise: Promise<MetaModule | null> | null = null;
let initialized = false;

const loadMeta = async () => {
  if (Platform.OS === 'web') return null;
  const appId = String(process.env.EXPO_PUBLIC_META_APP_ID ?? '').trim();
  const clientToken = String(process.env.EXPO_PUBLIC_META_CLIENT_TOKEN ?? '').trim();
  if (!appId || !clientToken) return null;

  if (!modulePromise) modulePromise = import('react-native-fbsdk-next').catch(() => null);
  const meta = await modulePromise;
  if (!meta) return null;

  if (!initialized) {
    meta.Settings.setAppID(appId);
    meta.Settings.setClientToken(clientToken);
    meta.Settings.setAutoLogAppEventsEnabled(true);
    meta.Settings.setAdvertiserIDCollectionEnabled(true);
    meta.Settings.initializeSDK();
    initialized = true;
  }
  return meta;
};

export const initializeMetaAnalytics = async () => Boolean(await loadMeta());

export const logMetaAnalyticsEvent = async (name: AnalyticsEventName, params: AnalyticsParams) => {
  const meta = await loadMeta();
  if (!meta) return;

  const cleanParams = params as Record<string, string | number>;
  if (name === 'payment_success') {
    meta.AppEventsLogger.logPurchase(
      typeof params.value === 'number' ? params.value : 249,
      String(params.currency ?? 'INR'),
      cleanParams,
    );
  }
  meta.AppEventsLogger.logEvent(name, cleanParams);
};

export const setMetaAnalyticsUser = async (uid: string | null) => {
  const meta = await loadMeta();
  if (!meta) return;
  meta.AppEventsLogger.setUserID(uid);
};

