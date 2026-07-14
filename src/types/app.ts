import { User } from 'firebase/auth';

export type UserRole = 'user' | 'artist' | 'dealer';
export type RequestedRole = 'artist' | 'dealer';

export type DashboardRouteName = 'UserDashboard' | 'ArtistDashboard' | 'DealerDashboard';

export type RootStackParamList = {
  RoleSelect: undefined;
  Login: { role?: UserRole } | undefined;
  UserDashboard: undefined;
  ArtistDashboard: undefined;
  DealerDashboard: undefined;
};

export type VerificationStatus = 'unsubmitted' | 'pending' | 'pending_verification' | 'needs_more_samples' | 'approved' | 'rejected';
export type TimeSlotId = string;
export type DealerRequestStatus = 'unsubmitted' | 'pending' | 'approved' | 'rejected';
export type ArtistFamousDesign = { name: string; priceRange: string };
export type ProfileImageMeta = { fileName?: string; mimeType?: string; size?: number; storagePath?: string };
export type ArtistProfileVisibility = 'public' | 'private';
export type ArtistAvailabilityStatus = 'available' | 'unavailable';
export type ArtistAppearanceTheme = 'dark' | 'light' | 'system';
export type ArtistAppearanceFontSize = 'small' | 'medium' | 'large';

export type ArtistDashboardSettings = {
  privacy: {
    profileVisibility: ArtistProfileVisibility;
    postVisibility?: 'everyone' | 'followers';
    showLocation: boolean;
    showContactDetails: boolean;
    bookingVisibility: boolean;
  };
  timeManagement: {
    availabilityStatus: ArtistAvailabilityStatus;
    availableDays: string[];
    startTime: string;
    endTime: string;
    vacationMode: boolean;
    vacationReturnDate: string | null;
  };
  notifications: {
    bookingNotifications: boolean;
    paymentNotifications: boolean;
    marketingNotifications: boolean;
  };
  appearance: {
    theme: ArtistAppearanceTheme;
    fontSize: ArtistAppearanceFontSize;
  };
};

export type BookingStatus =
  | 'pending_payment' // legacy compatibility
  | 'pending_artist_approval' // legacy compatibility
  | 'artist_approved_payment_pending' // legacy compatibility
  | 'pending_artist_quote'
  | 'quote_sent_payment_pending'
  | 'quote_expired'
  | 'confirmed'
  | 'reschedule_requested'
  | 'final_payment_pending'
  | 'rejected'
  | 'completed'
  | 'cancelled'
  | 'payment_failed'
  | 'payment_timeout'
  | 'reschedule_proposed';

export type AiSkinCheckStatus = 'safe' | 'warning' | 'unsafe' | 'not_checked';

export type NotificationType =
  | 'like'
  | 'follow'
  | 'share'
  | 'inquiry'
  | 'post_created'
  | 'booking_requested'
  | 'booking_quote_sent'
  | 'booking_quote_expired'
  | 'booking_rejected'
  | 'booking_artist_approved_payment_pending'
  | 'booking_reminder'
  | 'final_payment_requested'
  | 'final_payment_user_marked_paid'
  | 'final_payment_disputed'
  | 'final_payment_success'
  | 'payment_success'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'booking_reschedule_requested'
  | 'booking_reschedule_accepted'
  | 'booking_reschedule_rejected'
  | 'revenue_tracking'
  | 'subscription_update'
  | 'system_message'
  | 'dealer_request_submitted'
  | 'dealer_request_approved'
  | 'dealer_request_rejected'
  // Legacy notification types kept for compatibility while old docs exist.
  | 'booking_request'
  | 'booking_confirmed'
  | 'booking_declined'
  | 'reschedule_proposed'
  | 'session_completed'
  | 'verification_approved'
  | 'verification_rejected'
  | 'verification_needs_more_samples';

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
  studioName?: string;
  shopAddressLine?: string;
  artistSinceYear?: number;
  artistName?: string;
  artistNameLower?: string;
  studioNameLower?: string;
  emailLower?: string;
  startingPrice?: number;
  experience?: string;
  styles?: string[];
  profileImageUrl?: string;
  profileImageMeta?: ProfileImageMeta;
  coverImageUrl?: string;
  coverImageMeta?: ProfileImageMeta;
  certificateUrl?: string;
  certificateMeta?: ProfileImageMeta | null;
  certificateReviewStatus?: 'pending' | 'approved' | 'rejected';
  foundingReferralCode?: string;
  foundingPlan?: 'Founder10' | 'Founding Artist';
  foundingBadge?: 'Founder Artist' | 'Founding Artist';
  foundingAccessAmount?: number;
  foundingAccessExpiresAt?: unknown;
  famousDesigns?: ArtistFamousDesign[];
  createdAt?: unknown;
  updatedAt?: unknown;

  // Verification (Artist/Dealer)
  requestedRole?: RequestedRole | null;
  verificationStatus?: VerificationStatus;
  verificationRejectReason?: string;
  verificationFeedback?: string;
  isProfileComplete?: boolean;
  artistVisible?: boolean;
  bookingVisible?: boolean;
  postingEnabled?: boolean;
  verifiedPro?: boolean;
  authorizedSeller?: boolean;
  verificationUpdatedAt?: unknown;

  // Subscription state
  subscriptionStatus?: 'inactive' | 'active';
  subscriptionPlan?: 'tatzo_pro';
  subscriptionExpiresAt?: unknown;
  subscriptionPaymentStatus?: 'idle' | 'processing' | 'paid_pending_verification' | 'failed' | 'cancelled' | 'paid';
  subscriptionVerificationStatus?: 'pending' | 'verified' | 'failed';
  subscriptionVerificationRequestedAt?: unknown;
  subscriptionPaidAt?: unknown;
  subscriptionLastError?: string;
  subscriptionPayment?: {
    provider?: 'razorpay';
    orderId?: string;
    paymentId?: string;
    amount?: number;
    paidAt?: unknown;
  };

  // Payout setup (Razorpay account link/manual payout monitoring)
  payoutStatus?: 'unconfigured' | 'pending' | 'ready';
  payoutSetupStatus?: 'unconfigured' | 'pending' | 'ready' | 'rejected';
  razorpayAccountId?: string;
  razorpayContactId?: string;
  artistPaymentMethod?: 'upi' | 'razorpay_link';
  artistUpiId?: string;
  artistRazorpayPaymentLink?: string;
  payoutSetupUpdatedAt?: unknown;
  payoutSetupAdminNote?: string;

  // Secondary dealer request while remaining artist.
  dealerRequestStatus?: DealerRequestStatus;
  dealerRejectReason?: string;
  dealerRequestedAt?: unknown;

  // Artist onboarding checklist
  artistOnboarding?: {
    profileDone?: boolean;
    payoutDone?: boolean;
    firstPostDone?: boolean;
    dismissedAt?: unknown;
    updatedAt?: unknown;
  };
  artistSettings?: ArtistDashboardSettings;
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

export type BookingModel = {
  id: string;
  userUid: string;
  userEmail?: string | null;
  userName?: string | null;
  artistId?: string;
  artistUid: string;
  artistName: string;
  artistHandle?: string | null;
  location?: string;
  dateISO: string;
  slotId: TimeSlotId;
  slotTimeLabel?: string | null;
  startingFrom?: number;
  depositAmount: number;
  bookingConfirmationFee?: number;
  currency?: string;
  status: BookingStatus;
  tattooSizeInches?: string | null;
  tattooSizeNotSure?: boolean;
  designImageUrl?: string | null;
  designImageMeta?: {
    fileName?: string;
    mimeType?: string;
    size?: number;
    storagePath?: string;
  } | null;
  quoteRange?: '1000_2000' | '2000_3000' | '3000_5000' | '5000_8000' | '8000_plus' | null;
  quoteRangeLabel?: string | null;
  quoteReason?: string | null;
  quotedAt?: unknown;
  quoteExpiresAt?: unknown;
  quotedByArtistUid?: string | null;
  quoteExpiredAt?: unknown;
  quoteExpiredAtCleanupChecked?: unknown;
  rejectReason?: string | null;
  originalDateISO?: string | null;
  originalSlotId?: TimeSlotId | null;
  originalSlotTimeLabel?: string | null;
  proposedDateISO?: string | null;
  proposedSlotId?: TimeSlotId | null;
  proposedSlotTimeLabel?: string | null;
  rescheduleRequestedAt?: unknown;
  rescheduleRequestedByUid?: string | null;
  rescheduleResolvedAt?: unknown;
  completionRequestedByUser?: boolean;
  completionRequestedAt?: unknown;
  finalStudioAmount?: number | null;
  finalAmountNote?: string | null;
  finalAmountSubmittedAt?: unknown;
  finalPaymentStatus?: 'pending' | 'user_marked_paid' | 'artist_confirmed_paid' | 'disputed' | 'completed';
  artistPaymentMethod?: 'upi' | 'razorpay_link' | null;
  artistUpiId?: string | null;
  artistRazorpayPaymentLink?: string | null;
  userMarkedPaidAt?: unknown;
  finalPaymentDisputedAt?: unknown;
  finalPaymentDisputeNote?: string | null;
  paymentProofUrl?: string | null;
  paymentProofMeta?: { fileName?: string; mimeType?: string; size?: number; storagePath?: string } | null;
  finalPayment?: {
    provider?: 'razorpay';
    status?: 'paid';
    amount?: number;
    orderId?: string;
    paymentId?: string;
    signature?: string;
    verifiedAt?: unknown;
  };
  aiSkinCheckStatus: AiSkinCheckStatus;
  aiRiskScore: number;
  aiSkinCheckNotes: string;
  aiCheckedAt?: unknown;
  aiFlagForArtist: boolean;
  reminderCreated?: boolean;
  reminderSentAt?: unknown;
  reminderScheduledFor?: unknown;
  skinAnswers?: Record<string, string>;
  paymentRetryCount?: number;
  payment?: {
    provider?: 'razorpay';
    status?: 'paid';
    amount?: number;
    orderId?: string;
    paymentId?: string;
    signature?: string;
    at?: unknown;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ArtistSubscriptionPaymentStatus = 'idle' | 'processing' | 'paid_pending_verification' | 'failed' | 'cancelled' | 'paid';

export type ArtistTransaction = {
  id?: string;
  bookingId: string;
  artistUid: string;
  userUid: string;
  bookingConfirmationFee: number;
  quotedRange?: string | null;
  finalStudioAmount?: number | null;
  finalPaymentAmount?: number | null;
  finalPaymentId?: string | null;
  platformFeeAmount?: number | null;
  payoutStatus: 'pending' | 'processing' | 'paid' | 'failed';
  payoutMethod: 'razorpay' | 'manual' | 'upi';
  createdAt?: unknown;
  updatedAt?: unknown;
  completedAt?: unknown;
  notes?: string;
};

export type DealerVerificationDoc = {
  uid: string;
  shopName: string;
  businessEmail: string;
  idProof: string;
  portfolioLink?: string;
  upiId?: string;
  bankDetails?: string;
  locationCity: string;
  locationArea: string;
  status: DealerRequestStatus;
  rejectReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type NotificationDoc = {
  id: string;
  toUid: string;
  fromUid?: string | null;
  fromName?: string | null;
  type: NotificationType;
  title?: string;
  message?: string;
  entityType?: string;
  entityId?: string;
  bookingId?: string;
  postId?: string;
  dateISO?: string;
  proposedDateISO?: string;
  depositAmount?: number;
  reason?: string | null;
  read: boolean;
  readAt?: unknown;
  createdAt?: unknown;
  metadata?: Record<string, unknown>;
};
