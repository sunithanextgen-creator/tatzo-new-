import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  initializeFirebaseAnalytics,
  logFirebaseAnalyticsEvent,
  setFirebaseAnalyticsUser,
} from './firebaseAnalytics';
import { initializeMetaAnalytics, logMetaAnalyticsEvent, setMetaAnalyticsUser } from './metaAnalytics';
import type { AnalyticsEventName, AnalyticsParams, AnalyticsUserProperties } from './analyticsEvents';

const DEDUPE_PREFIX = 'tatzo.analytics.sent.v1.';
const BLOCKED_PARAM_PARTS = ['email', 'phone', 'allergy', 'skin', 'readiness', 'address', 'description', 'image_url', 'video_url', 'reference'];

const sanitizeParams = (params: AnalyticsParams = {}) =>
  Object.entries(params).reduce<Record<string, string | number>>((safe, [key, value]) => {
    const normalizedKey = key.trim().toLowerCase();
    if (!normalizedKey || BLOCKED_PARAM_PARTS.some((part) => normalizedKey.includes(part))) return safe;
    if (typeof value === 'boolean') safe[normalizedKey] = value ? 1 : 0;
    if (typeof value === 'number' && Number.isFinite(value)) safe[normalizedKey] = value;
    if (typeof value === 'string' && value.trim()) safe[normalizedKey] = value.trim().slice(0, 100);
    return safe;
  }, {});

export const initializeAnalytics = async () => {
  await Promise.allSettled([initializeFirebaseAnalytics(), initializeMetaAnalytics()]);
};

export const identifyAnalyticsUser = async (uid: string | null, properties: AnalyticsUserProperties = {}) => {
  const safeProperties = Object.entries(properties).reduce<AnalyticsUserProperties>((safe, [key, value]) => {
    if (value !== undefined) (safe as Record<string, string | null>)[key] = value === null ? null : String(value).slice(0, 36);
    return safe;
  }, {});
  await Promise.allSettled([
    setFirebaseAnalyticsUser(uid, safeProperties),
    setMetaAnalyticsUser(uid),
  ]);
};

export const trackAnalyticsEvent = async (name: AnalyticsEventName, params: AnalyticsParams = {}) => {
  const safeParams = sanitizeParams(params);
  await Promise.allSettled([
    logFirebaseAnalyticsEvent(name, safeParams),
    logMetaAnalyticsEvent(name, safeParams),
  ]);
};

export const trackAnalyticsEventOnce = async (eventId: string, name: AnalyticsEventName, params: AnalyticsParams = {}) => {
  const cleanEventId = eventId.trim().slice(0, 180);
  if (!cleanEventId) return trackAnalyticsEvent(name, params);
  const key = `${DEDUPE_PREFIX}${cleanEventId}`;
  try {
    if (await AsyncStorage.getItem(key)) return;
    await trackAnalyticsEvent(name, { ...params, event_id: cleanEventId });
    await AsyncStorage.setItem(key, new Date().toISOString());
  } catch {
    await trackAnalyticsEvent(name, { ...params, event_id: cleanEventId });
  }
};

export { ANALYTICS_EVENTS } from './analyticsEvents';
export type { AnalyticsEventName, AnalyticsParams, AnalyticsUserProperties } from './analyticsEvents';

