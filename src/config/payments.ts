const PRODUCTION_PAYMENTS_URL = 'https://asia-south1-tatzo-as0711.cloudfunctions.net/payments';
const stripTrailingSlash = (s: string) => s.replace(/\/+$/, '');

const fromEnv = () => {
  const v = process.env.EXPO_PUBLIC_PAYMENTS_URL;
  if (!v) return null;
  return stripTrailingSlash(String(v));
};

export const getPaymentsServerUrl = () => {
  const env = fromEnv();
  if (env) return env;

  return PRODUCTION_PAYMENTS_URL;
};