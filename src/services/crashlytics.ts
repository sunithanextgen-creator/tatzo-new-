import { NativeModules, Platform } from 'react-native';
import { auth } from '../config/firebaseConfig';

type CrashContext = Record<string, string | number | boolean | null | undefined>;

declare const require: any;

let crashlyticsInstance: any | null | undefined;
let initialized = false;
let previousGlobalHandler: ((error: Error, isFatal?: boolean) => void) | undefined;

const hasNativeCrashlytics = () => {
  if (Platform.OS === 'web') return false;
  return Boolean((NativeModules as any)?.RNFBCrashlyticsModule);
};

const getCrashlytics = () => {
  if (!hasNativeCrashlytics()) return null;
  if (crashlyticsInstance !== undefined) return crashlyticsInstance;
  try {
    const mod = require('@react-native-firebase/crashlytics');
    const factory = mod.default ?? mod;
    crashlyticsInstance = typeof factory === 'function' ? factory() : null;
  } catch {
    crashlyticsInstance = null;
  }
  return crashlyticsInstance;
};

const toError = (error: unknown, fallback = 'Tatzo non-fatal error') => {
  if (error instanceof Error) return error;
  if (typeof error === 'string') return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(fallback);
  }
};

const applyContext = (crashlytics: any, context?: CrashContext) => {
  if (!context) return;
  for (const [key, value] of Object.entries(context)) {
    if (value === undefined || value === null) continue;
    try {
      crashlytics.setAttribute(String(key), String(value));
    } catch {
      // Crashlytics context is best-effort only.
    }
  }
};

export const setCrashlyticsUser = async (uid?: string | null, role?: string | null) => {
  const crashlytics = getCrashlytics();
  if (!crashlytics) return;
  try {
    await crashlytics.setUserId(uid || 'signed_out');
    if (role) await crashlytics.setAttribute('user_role', role);
  } catch {
    // Best-effort only.
  }
};

export const logCrashlyticsMessage = async (message: string, context?: CrashContext) => {
  const crashlytics = getCrashlytics();
  if (!crashlytics) return;
  try {
    applyContext(crashlytics, context);
    crashlytics.log(message);
  } catch {
    // Best-effort only.
  }
};

export const logCrashlyticsError = async (error: unknown, context?: CrashContext) => {
  const crashlytics = getCrashlytics();
  if (!crashlytics) return;
  try {
    applyContext(crashlytics, context);
    crashlytics.recordError(toError(error));
  } catch {
    // Best-effort only.
  }
};

export const initializeCrashlytics = async () => {
  if (initialized) return;
  initialized = true;
  const crashlytics = getCrashlytics();
  if (!crashlytics) return;

  try {
    await crashlytics.setCrashlyticsCollectionEnabled(true);
    await setCrashlyticsUser(auth.currentUser?.uid ?? null);
  } catch {
    // Best-effort only.
  }

  const errorUtils = (globalThis as any).ErrorUtils;
  if (errorUtils?.getGlobalHandler && errorUtils?.setGlobalHandler) {
    previousGlobalHandler = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
      void logCrashlyticsError(error, { isFatal: Boolean(isFatal), source: 'global_js_error' });
      previousGlobalHandler?.(error, isFatal);
    });
  }
};