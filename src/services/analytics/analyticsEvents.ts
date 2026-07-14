export const ANALYTICS_EVENTS = {
  APP_OPEN: 'app_open',
  SIGNUP: 'signup',
  ARTIST_SIGNUP: 'artist_signup',
  ARTIST_VERIFICATION_SUBMITTED: 'artist_verification_submitted',
  ARTIST_VERIFICATION_APPROVED: 'artist_verification_approved',
  SEARCH_ARTIST: 'search_artist',
  VIEW_ARTIST: 'view_artist',
  BOOKING_STARTED: 'booking_started',
  BOOKING_REQUEST_SUBMITTED: 'booking_request_submitted',
  QUOTE_RECEIVED: 'quote_received',
  PAYMENT_SUCCESS: 'payment_success',
  BOOKING_CONFIRMED: 'booking_confirmed',
  FIRST_BOOKING_RECEIVED: 'first_booking_received',
} as const;

export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];
export type AnalyticsPrimitive = string | number | boolean;
export type AnalyticsParams = Record<string, AnalyticsPrimitive | null | undefined>;

export type AnalyticsUserProperties = {
  user_role?: 'user' | 'artist';
  verification_status?: string | null;
  founding_plan?: string | null;
  launch_city_cohort?: string | null;
};

