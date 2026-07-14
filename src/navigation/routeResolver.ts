import { DashboardRouteName, UserProfile, UserRole, VerificationStatus } from '../types/app';

const ROLE_ROUTE_MAP: Record<UserRole, DashboardRouteName> = {
  user: 'UserDashboard',
  artist: 'ArtistDashboard',
  dealer: 'DealerDashboard',
};

export const isUserRole = (value: unknown): value is UserRole => {
  return value === 'user' || value === 'artist' || value === 'dealer';
};

export const isVerificationStatus = (value: unknown): value is VerificationStatus => {
  return (
    value === 'unsubmitted' ||
    value === 'pending' ||
    value === 'pending_verification' ||
    value === 'needs_more_samples' ||
    value === 'approved' ||
    value === 'rejected'
  );
};

// Route by the saved role. Public visibility is controlled separately.
export const resolveEffectiveRole = (profile: Pick<UserProfile, 'role' | 'verificationStatus'>): UserRole => {
  return isUserRole(profile.role) ? profile.role : 'user';
};

// Session-level readiness: we only need a valid role + setupComplete.
// Location + verification gating is handled inside the UI (Profile/Apply flow).
export const isProfileComplete = (
  profile: UserProfile | null,
): profile is UserProfile & { role: UserRole; setupComplete: true } => {
  return Boolean(profile?.setupComplete && isUserRole(profile.role));
};

export const resolveDashboardRoute = (role: UserRole): DashboardRouteName => {
  return ROLE_ROUTE_MAP[role];
};
