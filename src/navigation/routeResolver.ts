import { DashboardRouteName, UserProfile, UserRole } from '../types/app';

const ROLE_ROUTE_MAP: Record<UserRole, DashboardRouteName> = {
  user: 'UserDashboard',
  artist: 'ArtistDashboard',
  dealer: 'DealerDashboard',
};

export const isUserRole = (value: unknown): value is UserRole => {
  return value === 'user' || value === 'artist' || value === 'dealer';
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
