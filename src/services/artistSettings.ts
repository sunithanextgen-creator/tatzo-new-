import type {
  ArtistAppearanceFontSize,
  ArtistAppearanceTheme,
  ArtistAvailabilityStatus,
  ArtistDashboardSettings,
  ArtistProfileVisibility,
  UserProfile,
} from '../types/app';

export const DEFAULT_ARTIST_SETTINGS: ArtistDashboardSettings = {
  privacy: {
    profileVisibility: 'public',
    postVisibility: 'everyone',
    showLocation: true,
    showContactDetails: true,
    bookingVisibility: true,
  },
  timeManagement: {
    availabilityStatus: 'available',
    availableDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    startTime: '10:00 AM',
    endTime: '8:00 PM',
    vacationMode: false,
    vacationReturnDate: null,
  },
  notifications: {
    bookingNotifications: true,
    paymentNotifications: true,
    marketingNotifications: true,
  },
  appearance: {
    theme: 'dark',
    fontSize: 'medium',
  },
};

const asStringArray = (value: unknown, fallback: string[]) =>
  Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : fallback;

export const normalizeArtistSettings = (value: unknown): ArtistDashboardSettings => {
  const raw = (value ?? {}) as Partial<ArtistDashboardSettings>;
  const privacy = (raw.privacy ?? {}) as Partial<ArtistDashboardSettings['privacy']>;
  const timeManagement = (raw.timeManagement ?? {}) as Partial<ArtistDashboardSettings['timeManagement']>;
  const notifications = (raw.notifications ?? {}) as Partial<ArtistDashboardSettings['notifications']>;
  const appearance = (raw.appearance ?? {}) as Partial<ArtistDashboardSettings['appearance']>;

  const profileVisibility: ArtistProfileVisibility = privacy.profileVisibility === 'private' ? 'private' : 'public';
  const availabilityStatus: ArtistAvailabilityStatus = timeManagement.availabilityStatus === 'unavailable' ? 'unavailable' : 'available';
  const theme: ArtistAppearanceTheme = appearance.theme === 'light' || appearance.theme === 'system' ? appearance.theme : 'dark';
  const fontSize: ArtistAppearanceFontSize = appearance.fontSize === 'small' || appearance.fontSize === 'large' ? appearance.fontSize : 'medium';

  return {
    privacy: {
      profileVisibility,
      postVisibility: privacy.postVisibility === 'followers' ? 'followers' : DEFAULT_ARTIST_SETTINGS.privacy.postVisibility,
      showLocation: privacy.showLocation ?? DEFAULT_ARTIST_SETTINGS.privacy.showLocation,
      showContactDetails: privacy.showContactDetails ?? DEFAULT_ARTIST_SETTINGS.privacy.showContactDetails,
      bookingVisibility: privacy.bookingVisibility ?? DEFAULT_ARTIST_SETTINGS.privacy.bookingVisibility,
    },
    timeManagement: {
      availabilityStatus,
      availableDays: asStringArray(timeManagement.availableDays, DEFAULT_ARTIST_SETTINGS.timeManagement.availableDays),
      startTime: String(timeManagement.startTime ?? DEFAULT_ARTIST_SETTINGS.timeManagement.startTime).trim() || DEFAULT_ARTIST_SETTINGS.timeManagement.startTime,
      endTime: String(timeManagement.endTime ?? DEFAULT_ARTIST_SETTINGS.timeManagement.endTime).trim() || DEFAULT_ARTIST_SETTINGS.timeManagement.endTime,
      vacationMode: Boolean(timeManagement.vacationMode),
      vacationReturnDate: timeManagement.vacationReturnDate ? String(timeManagement.vacationReturnDate) : null,
    },
    notifications: {
      bookingNotifications: notifications.bookingNotifications ?? DEFAULT_ARTIST_SETTINGS.notifications.bookingNotifications,
      paymentNotifications: notifications.paymentNotifications ?? DEFAULT_ARTIST_SETTINGS.notifications.paymentNotifications,
      marketingNotifications: notifications.marketingNotifications ?? DEFAULT_ARTIST_SETTINGS.notifications.marketingNotifications,
    },
    appearance: {
      theme,
      fontSize,
    },
  };
};

export const getArtistSettingsFromProfile = (profile: Partial<UserProfile> | null | undefined) =>
  normalizeArtistSettings(profile?.artistSettings);

export const getArtistPublicVisibility = (settings: ArtistDashboardSettings) => settings.privacy.profileVisibility === 'public';

export const isArtistDiscoverableForPublic = (
  profile: Partial<UserProfile> | null | undefined,
) => {
  const settings = getArtistSettingsFromProfile(profile);
  const approved = String(profile?.verificationStatus ?? '') === 'approved';
  const artistVisible = profile?.artistVisible !== false;
  const bookingVisible = profile?.bookingVisible !== false && settings.privacy.bookingVisibility !== false;
  return approved && artistVisible && getArtistPublicVisibility(settings) && bookingVisible;
};

export const isArtistAcceptingBookings = (settings: ArtistDashboardSettings) =>
  settings.privacy.bookingVisibility &&
  settings.timeManagement.availabilityStatus === 'available' &&
  !settings.timeManagement.vacationMode;

export const getArtistAvailabilityLabel = (settings: ArtistDashboardSettings) => {
  if (settings.timeManagement.vacationMode) return 'On Vacation';
  return settings.timeManagement.availabilityStatus === 'available' ? 'Available' : 'Unavailable';
};

export const getArtistBookingMessage = (settings: ArtistDashboardSettings) => {
  if (settings.timeManagement.vacationMode) {
    return settings.timeManagement.vacationReturnDate
      ? `Artist is on vacation and not accepting new bookings. Available again from ${settings.timeManagement.vacationReturnDate}.`
      : 'Artist is on vacation and not accepting new bookings.';
  }
  if (settings.timeManagement.availabilityStatus === 'unavailable') {
    return 'This artist is currently unavailable for new bookings.';
  }
  if (!settings.privacy.bookingVisibility) {
    return 'Bookings are currently unavailable.';
  }
  return '';
};

export const getArtistLocationLabel = (
  profile: Pick<UserProfile, 'location' | 'locationArea' | 'locationCity'> | null | undefined,
  settings: ArtistDashboardSettings,
) => {
  if (!settings.privacy.showLocation) return 'Location hidden';
  const area = String(profile?.locationArea ?? '').trim();
  const city = String(profile?.locationCity ?? '').trim();
  const fallback = String(profile?.location ?? '').trim();
  return area && city ? `${area}, ${city}` : fallback || city || area || 'Location updating soon';
};

export const isArtistAvailableOnDate = (dateISO: string, settings: ArtistDashboardSettings) => {
  const match = String(dateISO ?? '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return true;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  if (!settings.timeManagement.availableDays.length) return true;
  return settings.timeManagement.availableDays.includes(dayName);
};
