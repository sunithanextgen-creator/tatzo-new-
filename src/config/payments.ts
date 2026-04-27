import Constants from 'expo-constants';
import { Platform } from 'react-native';

const stripTrailingSlash = (s: string) => s.replace(/\/+$/, '');

const fromEnv = () => {
  const v = process.env.EXPO_PUBLIC_PAYMENTS_URL;
  if (!v) return null;
  return stripTrailingSlash(String(v));
};

const fromExpoHostUri = () => {
  // In Expo Go, hostUri is usually like "192.168.x.x:8081".
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri;

  if (!hostUri) return null;

  const host = String(hostUri).split(':')[0];
  if (!host) return null;

  return `http://${host}:5055`;
};

export const getPaymentsServerUrl = () => {
  const env = fromEnv();
  if (env) return env;

  if (Platform.OS === 'web') return 'http://localhost:5055';

  const inferred = fromExpoHostUri();
  if (inferred) return inferred;

  // Fallback. On real devices this likely won't work unless you set EXPO_PUBLIC_PAYMENTS_URL.
  return 'http://localhost:5055';
};
