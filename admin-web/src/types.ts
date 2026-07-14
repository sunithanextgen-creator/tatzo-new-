export type RequestedRole = 'artist' | 'dealer';

export type VerificationStatus = 'unsubmitted' | 'pending' | 'pending_verification' | 'approved' | 'rejected' | 'needs_more_samples';

export type VerificationDoc = {
  uid: string;
  requestedRole: RequestedRole;
  status: VerificationStatus;
  shopName?: string;
  artistName?: string;
  businessEmail?: string;
  idProof?: string;
  portfolioLink?: string;
  experience?: string;
  bio?: string;
  styles?: string[];
  profileImageUrl?: string;
  portfolioImageCount?: number;
  portfolioReelCount?: number;
  portfolioImages?: Array<{ downloadUrl: string; fileName?: string; mimeType?: string; size?: number; storagePath?: string }>;
  portfolioVideos?: Array<{ downloadUrl: string; fileName?: string; mimeType?: string; size?: number; storagePath?: string }>;
  referralCode?: string;
  adminFeedback?: string;
  foundingPlan?: 'Founder10' | 'Founding Artist';
  foundingBadge?: 'Founder Artist' | 'Founding Artist';
  foundingAccessAmount?: number;
  certStoragePaths?: string[];
  legacyCertStoragePaths?: string[];
  certDownloadUrls?: string[];
  certificates?: Array<{ downloadUrl: string; fileName?: string; mimeType?: string; size?: number; storagePath?: string }>;
  certificateUrl?: string;
  certificateMeta?: { downloadUrl?: string; fileName?: string; mimeType?: string; size?: number; storagePath?: string };
  certificateReviewStatus?: 'pending' | 'approved' | 'rejected';
  locationCity?: string;
  locationArea?: string;
  submittedAt?: unknown;
  updatedAt?: unknown;
  reviewedAt?: unknown;
  reviewedBy?: string;
  rejectReason?: string;
  source?: 'artist_submission' | 'legacy_admin_grant' | string;
};

export type DealerVerificationStatus = 'pending' | 'approved' | 'rejected' | 'unsubmitted';

export type DealerVerificationDoc = {
  uid: string;
  shopName?: string;
  businessEmail?: string;
  idProof?: string;
  portfolioLink?: string;
  upiId?: string;
  bankDetails?: string;
  locationCity?: string;
  locationArea?: string;
  status: DealerVerificationStatus;
  rejectReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type UserDoc = {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  role?: 'user' | 'artist' | 'dealer';
  requestedRole?: RequestedRole | null;
  verificationStatus?: VerificationStatus;
  verificationRejectReason?: string;
  verificationFeedback?: string;
  locationCity?: string;
  locationArea?: string;
  artistName?: string;
  startingPrice?: number;
  experience?: string;
  bio?: string;
  styles?: string[];
  profileImageUrl?: string;
  certificateReviewStatus?: 'pending' | 'approved' | 'rejected';
  subscriptionStatus?: 'inactive' | 'active';
  subscriptionPaymentStatus?: 'idle' | 'processing' | 'paid_pending_verification' | 'failed' | 'cancelled' | 'paid';
  subscriptionVerificationStatus?: 'pending' | 'verified' | 'failed';
  foundingReferralCode?: string;
  foundingPlan?: 'Founder10' | 'Founding Artist';
  foundingBadge?: 'Founder Artist' | 'Founding Artist';
  foundingAccessAmount?: number;
  foundingAccessExpiresAt?: unknown;
  dealerRequestStatus?: DealerVerificationStatus;
  dealerRejectReason?: string;
  dealerRequestedAt?: unknown;
  razorpayAccountId?: string;
  razorpayContactId?: string;
  payoutSetupStatus?: 'unconfigured' | 'pending' | 'ready' | 'rejected';
  payoutSetupUpdatedAt?: unknown;
  studioName?: string;
  emailLower?: string;
  artistNameLower?: string;
  studioNameLower?: string;
  postingEnabled?: boolean;
  artistVisible?: boolean;
  bookingVisible?: boolean;
};

export type ArtistAccessCandidate = UserDoc & {
  uid: string;
  email?: string | null;
};

export type AdminDashboardMetrics = {
  totalUsers: number;
  totalArtists: number;
  totalDealers: number;
  totalPosts: number;
  totalBookings: number;
  bookingsPendingPayment: number;
  bookingsPendingArtistApproval: number;
  bookingsConfirmed: number;
  bookingsCompleted: number;
  bookingsCancelled: number;
  pendingVerifications: number;
  approvedVerifications: number;
  rejectedVerifications: number;
  pendingDealerVerifications: number;
  approvedDealerVerifications: number;
  rejectedDealerVerifications: number;
};



export type FinalPaymentBookingDoc = {
  id?: string;
  artistUid?: string;
  userUid?: string;
  artistName?: string;
  userName?: string | null;
  userEmail?: string | null;
  dateISO?: string;
  slotId?: string;
  status?: 'final_payment_pending' | 'completed' | string;
  finalStudioAmount?: number | null;
  finalAmountNote?: string | null;
  finalPaymentStatus?: 'pending' | 'user_marked_paid' | 'artist_confirmed_paid' | 'disputed' | 'completed' | string;
  artistPaymentMethod?: 'upi' | 'razorpay_link' | string | null;
  finalPaymentDisputeNote?: string | null;
  paymentProofUrl?: string | null;
  paymentProofMeta?: { fileName?: string; mimeType?: string; size?: number; storagePath?: string } | null;
  updatedAt?: unknown;
  completedAt?: unknown;
};

export type ArtistTransactionDoc = {
  id?: string;
  bookingId: string;
  artistUid: string;
  userUid: string;
  bookingConfirmationFee?: number;
  quotedRange?: string | null;
  finalStudioAmount?: number | null;
  finalPaymentAmount?: number | null;
  finalPaymentId?: string | null;
  platformFeeAmount?: number | null;
  payoutStatus?: 'pending' | 'processing' | 'paid' | 'failed' | 'manual_tracked';
  payoutMethod?: 'razorpay' | 'razorpay_link' | 'manual' | 'upi';
  finalPaymentStatus?: string;
  paymentMethod?: string;
  paymentProofUrl?: string | null;
  completedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  notes?: string;
};

export type PostReportDoc = {
  id?: string;
  postId: string;
  postOwnerUid?: string;
  reportedByUid: string;
  reportedByEmail?: string | null;
  reason: string;
  status?: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type EarlyAccessLeadDoc = {
  id?: string;
  role: 'user' | 'artist';
  name: string;
  email?: string | null;
  phone?: string | null;
  city?: string;
  platform?: 'android' | 'ios' | 'unknown' | string;
  interests?: string | null;
  studio?: string | null;
  experience?: string | null;
  instagram?: string | null;
  portfolioImage?: { downloadUrl: string; storagePath: string; fileName: string; mimeType: string; size: number } | null;
  source?: string;
  status?: 'waiting' | 'contacted' | 'invited' | 'onboarded' | 'not_interested';
  createdAt?: unknown;
  updatedAt?: unknown;
};
