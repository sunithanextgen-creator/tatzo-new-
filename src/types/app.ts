import { User } from 'firebase/auth';

export type UserRole = 'user' | 'artist' | 'dealer';
export type RequestedRole = 'artist' | 'dealer';

export type DashboardRouteName = 'UserDashboard' | 'ArtistDashboard' | 'DealerDashboard';

export type RootStackParamList = {
  Login: undefined;
  UserDashboard: undefined;
  ArtistDashboard: undefined;
  DealerDashboard: undefined;
};

export type VerificationStatus = 'unsubmitted' | 'pending' | 'approved' | 'rejected';

export type UserProfile = {
  uid?: string;
  email?: string;
  displayName?: string;
  role?: UserRole;
  setupComplete?: boolean;

  // Location (soft-required; gated for verification)
  locationCity?: string;
  locationArea?: string;

  // Legacy fallback (older docs/components). Keep until migration is complete.
  location?: string;

  bio?: string;
  phone?: string;
  createdAt?: unknown;
  updatedAt?: unknown;

  // Verification (Artist/Dealer)
  requestedRole?: RequestedRole | null;
  verificationStatus?: VerificationStatus;
  verificationRejectReason?: string;
  isProfileComplete?: boolean;
  verifiedPro?: boolean;
  authorizedSeller?: boolean;
  verificationUpdatedAt?: unknown;

  // Subscription state
  subscriptionStatus?: 'inactive' | 'active';
  subscriptionPlan?: 'tatzo_pro';
  subscriptionExpiresAt?: unknown;

  // Payout setup (placeholder until real Razorpay onboarding)
  payoutStatus?: 'unconfigured' | 'pending' | 'ready';
};

export type AppSessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'needsProfile'; user: User; profile: UserProfile | null }
  | {
      status: 'ready';
      user: User;
      profile: UserProfile & { role: UserRole; setupComplete: true };
      route: DashboardRouteName;
    };
