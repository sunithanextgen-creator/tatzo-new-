import {
  collection,
  type DocumentData,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  type QueryConstraint,
  type QueryDocumentSnapshot,
  serverTimestamp,
  setDoc,
  startAfter,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import type {
  AdminDashboardMetrics,
  DealerVerificationDoc,
  RequestedRole,
  UserDoc,
  VerificationDoc,
  ArtistTransactionDoc,
  FinalPaymentBookingDoc,
  PostReportDoc,
  ArtistAccessCandidate,
  EarlyAccessLeadDoc,
} from './types';

type FoundingPlan = {
  code: string;
  plan: 'Founder10' | 'Founding Artist';
  amount: number;
  badge: 'Founder Artist' | 'Founding Artist';
};

const ensureFreshAuthToken = async () => {
  if (!auth.currentUser) return;
  await auth.currentUser.getIdToken(true);
};

const countDocuments = async (q: ReturnType<typeof query>) => {
  const snap = await getCountFromServer(q);
  return snap.data().count;
};

const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value && 'toMillis' in value && typeof (value as any).toMillis === 'function') {
    try {
      return (value as any).toMillis();
    } catch {
      return 0;
    }
  }
  if (typeof value === 'object' && value && 'seconds' in value) {
    const secs = Number((value as any).seconds ?? 0);
    const nanos = Number((value as any).nanoseconds ?? 0);
    return secs * 1000 + Math.floor(nanos / 1_000_000);
  }
  return 0;
};

const normalizeReferralCode = (value: unknown) => String(value ?? '').trim().toUpperCase();
const normalizeSearchText = (value: unknown) => String(value ?? '').trim().toLowerCase();

export type VerificationQueueStatus = 'pending_verification' | 'needs_more_samples' | 'rejected' | 'approved';
export type VerificationPageCursor = QueryDocumentSnapshot<DocumentData>;

const verificationStatusConstraint = (status: VerificationQueueStatus) => status === 'pending_verification'
  ? where('status', 'in', ['pending_verification', 'pending'])
  : where('status', '==', status);

const parseFoundingCode = (value: unknown): FoundingPlan | null => {
  const code = normalizeReferralCode(value);
  const founder10 = /^FOUNDER10-(\d{3})$/.exec(code);
  if (founder10) {
    const index = Number(founder10[1]);
    if (index >= 1 && index <= 10) return { code, plan: 'Founder10', amount: 0, badge: 'Founder Artist' };
  }
  const founding15 = /^FOUNDING15-(\d{3})$/.exec(code);
  if (founding15) {
    const index = Number(founding15[1]);
    if (index >= 1 && index <= 15) return { code, plan: 'Founding Artist', amount: 2499, badge: 'Founding Artist' };
  }
  return null;
};

const getValidFoundingPlanForApproval = async (uid: string, rawCode: unknown): Promise<FoundingPlan | null> => {
  const code = normalizeReferralCode(rawCode);
  if (!code) return null;
  const plan = parseFoundingCode(code);
  if (!plan) throw new Error('Invalid founding/referral code.');

  const codeRef = doc(db, 'foundingArtistCodes', code);
  const codeSnap = await getDoc(codeRef);
  if (codeSnap.exists()) {
    const data = codeSnap.data() as any;
    if (data.used === true && data.artistUid !== uid) {
      throw new Error('Founding/referral code is already used.');
    }
  }
  return plan;
};

export const listVerificationPage = async (params: {
  status: VerificationQueueStatus;
  cursor?: VerificationPageCursor | null;
  pageSize?: number;
}) => {
  await ensureFreshAuthToken();
  const pageSize = Math.min(25, Math.max(1, params.pageSize ?? 25));
  const constraints: QueryConstraint[] = [verificationStatusConstraint(params.status), orderBy('submittedAt', 'desc')];
  if (params.cursor) constraints.push(startAfter(params.cursor));
  constraints.push(limit(pageSize + 1));
  const snap = await getDocs(query(collection(db, 'verifications'), ...constraints));
  const hasMore = snap.docs.length > pageSize;
  const pageDocs = hasMore ? snap.docs.slice(0, pageSize) : snap.docs;
  return {
    rows: pageDocs.map((item) => ({ id: item.id, ...(item.data() as any) })) as Array<{ id: string } & VerificationDoc>,
    nextCursor: hasMore ? pageDocs[pageDocs.length - 1] : null,
    hasMore,
  };
};

export const listPendingVerifications = async () => {
  const page = await listVerificationPage({ status: 'pending_verification' });
  return page.rows;
};

export const listRecentVerifications = async (maxRows = 8) => {
  await ensureFreshAuthToken();
  const q = query(collection(db, 'verifications'), orderBy('updatedAt', 'desc'), limit(maxRows));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<{ id: string } & VerificationDoc>;
};

export const getAdminDashboardMetrics = async (): Promise<AdminDashboardMetrics> => {
  await ensureFreshAuthToken();

  const [
    totalUsers,
    totalArtists,
    totalDealers,
    totalPosts,
    totalBookings,
    bookingsPendingPayment,
    bookingsPendingArtistApproval,
    bookingsConfirmed,
    bookingsCompleted,
    bookingsCancelled,
    pendingVerifications,
    approvedVerifications,
    rejectedVerifications,
    pendingDealerVerifications,
    approvedDealerVerifications,
    rejectedDealerVerifications,
  ] = await Promise.all([
    countDocuments(query(collection(db, 'users'))),
    countDocuments(query(collection(db, 'artists'))),
    countDocuments(query(collection(db, 'dealers'))),
    countDocuments(query(collection(db, 'posts'))),
    countDocuments(query(collection(db, 'bookings'))),
    countDocuments(query(collection(db, 'bookings'), where('status', 'in', ['artist_approved_payment_pending', 'payment_failed']))),
    countDocuments(query(collection(db, 'bookings'), where('status', '==', 'pending_artist_approval'))),
    countDocuments(query(collection(db, 'bookings'), where('status', '==', 'confirmed'))),
    countDocuments(query(collection(db, 'bookings'), where('status', '==', 'completed'))),
    countDocuments(query(collection(db, 'bookings'), where('status', '==', 'cancelled'))),
    countDocuments(query(collection(db, 'verifications'), where('status', 'in', ['pending', 'pending_verification']))),
    countDocuments(query(collection(db, 'verifications'), where('status', '==', 'approved'))),
    countDocuments(query(collection(db, 'verifications'), where('status', '==', 'rejected'))),
    countDocuments(query(collection(db, 'dealerVerifications'), where('status', '==', 'pending'))),
    countDocuments(query(collection(db, 'dealerVerifications'), where('status', '==', 'approved'))),
    countDocuments(query(collection(db, 'dealerVerifications'), where('status', '==', 'rejected'))),
  ]);

  return {
    totalUsers,
    totalArtists,
    totalDealers,
    totalPosts,
    totalBookings,
    bookingsPendingPayment,
    bookingsPendingArtistApproval,
    bookingsConfirmed,
    bookingsCompleted,
    bookingsCancelled,
    pendingVerifications,
    approvedVerifications,
    rejectedVerifications,
    pendingDealerVerifications,
    approvedDealerVerifications,
    rejectedDealerVerifications,
  };
};

export const getVerificationWithUser = async (uid: string) => {
  await ensureFreshAuthToken();
  const [vSnap, uSnap] = await Promise.all([getDoc(doc(db, 'verifications', uid)), getDoc(doc(db, 'users', uid))]);

  return {
    verification: (vSnap.exists() ? ({ uid: vSnap.id, ...(vSnap.data() as any) } as VerificationDoc) : null),
    user: (uSnap.exists() ? ({ uid: uSnap.id, ...(uSnap.data() as any) } as UserDoc) : null),
  };
};

export const listPendingDealerVerifications = async () => {
  await ensureFreshAuthToken();
  const withOrder = query(collection(db, 'dealerVerifications'), where('status', '==', 'pending'), orderBy('updatedAt', 'desc'));
  try {
    const snap = await getDocs(withOrder);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<{ id: string } & DealerVerificationDoc>;
  } catch (e: any) {
    const withoutOrder = query(collection(db, 'dealerVerifications'), where('status', '==', 'pending'));
    const snap = await getDocs(withoutOrder);
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<{ id: string } & DealerVerificationDoc>;
    rows.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    return rows;
  }
};

export const getDealerVerificationWithUser = async (uid: string) => {
  await ensureFreshAuthToken();
  const [dSnap, uSnap] = await Promise.all([getDoc(doc(db, 'dealerVerifications', uid)), getDoc(doc(db, 'users', uid))]);

  return {
    dealerVerification: (dSnap.exists() ? ({ uid: dSnap.id, ...(dSnap.data() as any) } as DealerVerificationDoc) : null),
    user: (uSnap.exists() ? ({ uid: uSnap.id, ...(uSnap.data() as any) } as UserDoc) : null),
  };
};

export const getCertificateUrls = async (paths: string[]) => {
  await ensureFreshAuthToken();
  const urls = await Promise.all(
    paths.map(async (p) => {
      const url = await getDownloadURL(storageRef(storage, p));
      return { path: p, url };
    }),
  );
  return urls;
};

const buildPublicProfilePayload = (uid: string, role: RequestedRole, user: UserDoc | null, verification: VerificationDoc, foundingPlan: FoundingPlan | null = null) => {
  const displayName = user?.displayName ?? user?.email ?? 'TATZO Pro';
  const artistName = user?.artistName ?? displayName;
  const locationCity = verification.locationCity ?? user?.locationCity ?? '';
  const locationArea = verification.locationArea ?? user?.locationArea ?? '';
  const startingPrice = Number((user as any)?.startingPrice ?? 0) || 0;
  const styles = Array.isArray((user as any)?.styles)
    ? (user as any).styles.map((tag: unknown) => String(tag).trim()).filter(Boolean)
    : [];

  return {
    uid,
    role,
    artistName,
    displayName,
    studioName: verification.shopName ?? displayName,
    locationCity,
    locationArea,
    location: [locationArea, locationCity].filter(Boolean).join(', '),
    startingPrice,
    startingFrom: startingPrice,
    experience: String((user as any)?.experience ?? '').trim(),
    bio: String((user as any)?.bio ?? '').trim(),
    styles,
    tags: styles,
    profileImageUrl: String((user as any)?.profileImageUrl ?? '').trim(),
    certificateReviewStatus: String((user as any)?.certificateReviewStatus ?? verification.certificateReviewStatus ?? 'pending').trim(),
    verificationStatus: 'approved',
    isVisible: true,
    artistVisible: true,
    bookingVisible: true,
    postingEnabled: role === 'artist',
    verifiedPro: role === 'artist',
    authorizedSeller: role === 'dealer',
    foundingReferralCode: foundingPlan?.code ?? normalizeReferralCode(verification.referralCode),
    foundingPlan: foundingPlan?.plan ?? null,
    foundingBadge: foundingPlan?.badge ?? null,
    foundingAccessAmount: foundingPlan?.amount ?? null,
    badge: foundingPlan?.badge ?? null,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
};

const toArtistAccessCandidate = (uid: string, data: Record<string, unknown>): ArtistAccessCandidate => ({
  ...(data as UserDoc),
  uid,
  email: typeof data.email === 'string' ? data.email : null,
});

export const searchExistingArtists = async (rawSearch: string): Promise<ArtistAccessCandidate[]> => {
  await ensureFreshAuthToken();
  const search = normalizeSearchText(rawSearch);
  const usersRef = collection(db, 'users');
  if (!search) {
    const snap = await getDocs(query(usersRef, where('role', '==', 'artist'), limit(25)));
    return snap.docs.map((item) => toArtistAccessCandidate(item.id, item.data()));
  }

  const exactUid = await getDoc(doc(db, 'users', rawSearch.trim())).catch(() => null);
  const prefixEnd = `${search}\uf8ff`;
  const snapshots = await Promise.all([
    getDocs(query(usersRef, where('emailLower', '==', search), limit(25))),
    getDocs(query(usersRef, where('artistNameLower', '>=', search), where('artistNameLower', '<=', prefixEnd), limit(25))),
    getDocs(query(usersRef, where('studioNameLower', '>=', search), where('studioNameLower', '<=', prefixEnd), limit(25))),
  ]);

  const candidates = new Map<string, ArtistAccessCandidate>();
  if (exactUid?.exists()) candidates.set(exactUid.id, toArtistAccessCandidate(exactUid.id, exactUid.data()));
  snapshots.forEach((snap) => snap.docs.forEach((item) => candidates.set(item.id, toArtistAccessCandidate(item.id, item.data()))));
  return Array.from(candidates.values())
    .filter((item) => item.role === 'artist' || item.requestedRole === 'artist')
    .slice(0, 25);
};

export const grantLegacyArtistAccess = async (params: { uid: string; adminUid: string }) => {
  await ensureFreshAuthToken();
  const uid = params.uid.trim();
  if (!uid) throw new Error('Artist UID is required.');
  const [userSnap, artistSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid)),
    getDoc(doc(db, 'artists', uid)),
  ]);
  if (!userSnap.exists()) throw new Error('User account not found.');
  const user = userSnap.data() as Record<string, any>;
  const artist = artistSnap.exists() ? artistSnap.data() as Record<string, any> : {};
  if (user.role !== 'artist' && user.requestedRole !== 'artist' && !artistSnap.exists()) {
    throw new Error('Selected account is not an artist account.');
  }

  const displayName = String(user.artistName || user.displayName || artist.artistName || artist.displayName || user.email || 'Tatzo Artist').trim();
  const studioName = String(user.studioName || artist.studioName || '').trim();
  const locationCity = String(user.locationCity || artist.locationCity || '').trim();
  const locationArea = String(user.locationArea || artist.locationArea || '').trim();
  const styles = Array.isArray(user.styles) ? user.styles : Array.isArray(artist.styles) ? artist.styles : [];
  const email = String(user.email || '').trim();
  const notificationId = `artist_approved_${uid}`;
  const notificationBody = {
    id: notificationId,
    toUid: uid,
    fromUid: params.adminUid,
    fromName: 'TATZO Admin',
    type: 'artist_approved',
    title: 'Profile Approved',
    message: 'Your Tatzo artist profile has been approved. You can now post, appear in Find Artist, and receive booking requests.',
    entityType: 'verification',
    entityId: uid,
    read: false,
    readAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid), {
    role: 'artist',
    requestedRole: null,
    verificationStatus: 'approved',
    verificationRejectReason: '',
    verificationFeedback: '',
    postingEnabled: true,
    artistVisible: true,
    bookingVisible: true,
    verifiedPro: true,
    artistNameLower: normalizeSearchText(displayName),
    studioNameLower: normalizeSearchText(studioName),
    emailLower: normalizeSearchText(email),
    verificationApprovedBy: params.adminUid,
    verificationApprovedAt: serverTimestamp(),
    verificationUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.set(doc(db, 'artists', uid), {
    uid,
    role: 'artist',
    artistName: displayName,
    displayName,
    studioName,
    locationCity,
    locationArea,
    location: [locationArea, locationCity].filter(Boolean).join(', '),
    experience: String(user.experience || artist.experience || '').trim(),
    bio: String(user.bio || artist.bio || '').trim(),
    styles,
    tags: styles,
    profileImageUrl: String(user.profileImageUrl || artist.profileImageUrl || '').trim(),
    startingPrice: Number(user.startingPrice || artist.startingPrice || 0) || 0,
    verificationStatus: 'approved',
    postingEnabled: true,
    isVisible: true,
    artistVisible: true,
    bookingVisible: true,
    verifiedPro: true,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.set(doc(db, 'verifications', uid), {
    uid,
    requestedRole: 'artist',
    status: 'approved',
    source: 'legacy_admin_grant',
    reviewedBy: params.adminUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.set(doc(db, 'notifications', notificationId), notificationBody, { merge: true });
  batch.set(doc(db, 'users', uid, 'notifications', notificationId), notificationBody, { merge: true });
  await batch.commit();
};

const writeNotificationDual = async (
  uid: string,
  payload: {
    id?: string;
    fromUid?: string;
    fromName?: string;
    type: string;
    title: string;
    message: string;
    entityType: string;
    entityId: string;
    reason?: string;
  },
) => {
  const notificationId = payload.id || `${payload.type}_${payload.entityId}`;
  const body = {
    id: notificationId,
    toUid: uid,
    fromUid: payload.fromUid ?? null,
    fromName: payload.fromName ?? null,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    entityType: payload.entityType,
    entityId: payload.entityId,
    reason: payload.reason ?? null,
    read: false,
    readAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await Promise.all([
    setDoc(doc(db, 'notifications', notificationId), body, { merge: true }),
    setDoc(doc(db, 'users', uid, 'notifications', notificationId), body, { merge: true }),
  ]);
};

const validateArtistVerificationForApproval = (verification: VerificationDoc) => {
  const requiredText = [
    ['artist name', verification.artistName],
    ['studio name', verification.shopName],
    ['city', verification.locationCity],
    ['area', verification.locationArea],
    ['experience', verification.experience],
    ['bio', verification.bio],
    ['profile image', verification.profileImageUrl],
    ['Instagram/portfolio link', verification.portfolioLink],
  ] as Array<[string, unknown]>;
  const missing = requiredText.filter(([, value]) => !String(value ?? '').trim()).map(([label]) => label);
  const styles = Array.isArray(verification.styles) ? verification.styles.filter(Boolean) : [];
  const portfolioImages = Array.isArray(verification.portfolioImages) ? verification.portfolioImages : [];
  const portfolioVideos = Array.isArray(verification.portfolioVideos) ? verification.portfolioVideos : [];
  if (!styles.length) missing.push('styles');
  if (portfolioImages.length < 3) missing.push('3 portfolio images');
  if (portfolioVideos.length < 1) missing.push('1 portfolio video');
  const invalidMedia = [...portfolioImages, ...portfolioVideos].some((item) => (
    !/^https:\/\//i.test(String(item.downloadUrl ?? ''))
    || /^data:|^blob:/i.test(String(item.downloadUrl ?? ''))
    || !String(item.storagePath ?? '').trim()
  ));
  if (invalidMedia) missing.push('valid Storage media URLs');
  if (missing.length) throw new Error(`Cannot approve. Missing: ${missing.join(', ')}.`);
};

export const approveVerification = async (params: {
  uid: string;
  requestedRole: RequestedRole;
  adminUid: string;
  user: UserDoc | null;
  verification: VerificationDoc;
}) => {
  await ensureFreshAuthToken();
  const { uid, requestedRole, adminUid, user, verification } = params;
  if (requestedRole === 'artist') validateArtistVerificationForApproval(verification);
  const foundingPlan = requestedRole === 'artist' ? await getValidFoundingPlanForApproval(uid, verification.referralCode) : null;
  const foundingExpiresAt = foundingPlan ? Timestamp.fromDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)) : null;
  const userWasApprovedArtist = user?.role === 'artist' && user?.verificationStatus === 'approved';
  const hasActiveSubscription =
    user?.subscriptionStatus === 'active' &&
    user?.subscriptionPaymentStatus === 'paid' &&
    user?.subscriptionVerificationStatus === 'verified';
  const shouldResetSubscriptionForNewArtist = requestedRole === 'artist' && !userWasApprovedArtist && !hasActiveSubscription && !foundingPlan;
  const batch = writeBatch(db);

  batch.update(doc(db, 'verifications', uid), {
    status: 'approved',
    rejectReason: '',
    adminFeedback: '',
    foundingReferralCode: foundingPlan?.code ?? normalizeReferralCode(verification.referralCode),
    foundingPlan: foundingPlan?.plan ?? null,
    foundingBadge: foundingPlan?.badge ?? null,
    foundingAccessAmount: foundingPlan?.amount ?? null,
    certificateReviewStatus: 'approved',
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(
    doc(db, 'users', uid),
    {
      role: requestedRole,
      requestedRole: null,
      verificationStatus: 'approved',
      verificationRejectReason: '',
      verificationFeedback: '',
      foundingReferralCode: foundingPlan?.code ?? normalizeReferralCode(verification.referralCode),
      foundingPlan: foundingPlan?.plan ?? null,
      foundingBadge: foundingPlan?.badge ?? null,
      foundingAccessAmount: foundingPlan?.amount ?? null,
      foundingAccessExpiresAt: foundingExpiresAt,
      badge: foundingPlan?.badge ?? null,
      ...(foundingPlan
        ? {
            subscriptionStatus: 'active',
            subscriptionPaymentStatus: 'paid',
            subscriptionVerificationStatus: 'verified',
            subscriptionPlan: 'tatzo_pro',
            subscriptionExpiresAt: foundingExpiresAt,
          }
        : {}),
      certificateReviewStatus: 'approved',
      verificationUpdatedAt: serverTimestamp(),
      analyticsVerificationApprovedEventId: `artist_verification_approved_${uid}`,
      analyticsVerificationApprovedAt: serverTimestamp(),
      isProfileComplete: true,
      verifiedPro: requestedRole === 'artist',
      authorizedSeller: requestedRole === 'dealer',
      postingEnabled: requestedRole === 'artist',
      artistVisible: requestedRole === 'artist',
      bookingVisible: requestedRole === 'artist',
      ...(shouldResetSubscriptionForNewArtist
        ? {
            subscriptionStatus: 'inactive',
            subscriptionPaymentStatus: 'idle',
            subscriptionVerificationStatus: 'failed',
            subscriptionVerificationRequestedAt: null,
            subscriptionPaidAt: null,
            subscriptionLastError: '',
            subscriptionPayment: null,
          }
        : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const targetCollection = requestedRole === 'artist' ? 'artists' : 'dealers';
  batch.set(doc(db, targetCollection, uid), buildPublicProfilePayload(uid, requestedRole, user, verification, foundingPlan), { merge: true });
  if (foundingPlan) {
    batch.set(
      doc(db, 'foundingArtistCodes', foundingPlan.code),
      {
        code: foundingPlan.code,
        plan: foundingPlan.plan,
        amount: foundingPlan.amount,
        badge: foundingPlan.badge,
        used: true,
        artistUid: uid,
        usedAt: serverTimestamp(),
        expiresAt: foundingExpiresAt,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  await batch.commit();

  await writeNotificationDual(uid, {
    id: `verification_approved_${uid}`,
    type: 'verification_approved',
    fromUid: adminUid,
    fromName: 'TATZO Admin',
    title: 'Verification approved',
    message: 'Your role verification is approved. Artist dashboard is now unlocked.',
    entityType: 'verification',
    entityId: uid,
  });
};

export const rejectVerification = async (params: {
  uid: string;
  requestedRole: RequestedRole;
  adminUid: string;
  reason: string;
}) => {
  await ensureFreshAuthToken();
  const { uid, requestedRole, adminUid, reason } = params;
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error('Reject reason is required.');

  const batch = writeBatch(db);

  batch.update(doc(db, 'verifications', uid), {
    status: 'rejected',
    rejectReason: cleanReason,
    certificateReviewStatus: 'rejected',
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(
    doc(db, 'users', uid),
    {
      role: requestedRole === 'artist' ? 'artist' : 'user',
      verificationStatus: 'rejected',
      verificationRejectReason: cleanReason,
      postingEnabled: false,
      artistVisible: false,
      bookingVisible: false,
      verifiedPro: false,
      certificateReviewStatus: 'rejected',
      verificationUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (requestedRole === 'artist') {
    batch.set(doc(db, 'artists', uid), {
      verificationStatus: 'rejected',
      postingEnabled: false,
      isVisible: false,
      artistVisible: false,
      bookingVisible: false,
      verifiedPro: false,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();

  await writeNotificationDual(uid, {
    id: `verification_rejected_${uid}`,
    type: 'verification_rejected',
    fromUid: adminUid,
    fromName: 'TATZO Admin',
    title: 'Verification rejected',
    message: 'Your role verification was rejected. Check reason and resubmit.',
    entityType: 'verification',
    entityId: uid,
    reason: cleanReason,
  });
};

export const requestMoreVerificationSamples = async (params: {
  uid: string;
  requestedRole: RequestedRole;
  adminUid: string;
  feedback: string;
}) => {
  await ensureFreshAuthToken();
  const { uid, requestedRole, adminUid, feedback } = params;
  const cleanFeedback = feedback.trim();
  if (!cleanFeedback) throw new Error('Feedback message is required.');

  const batch = writeBatch(db);

  batch.update(doc(db, 'verifications', uid), {
    status: 'needs_more_samples',
    rejectReason: '',
    adminFeedback: cleanFeedback,
    certificateReviewStatus: 'pending',
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(
    doc(db, 'users', uid),
    {
      verificationStatus: 'needs_more_samples',
      verificationRejectReason: '',
      verificationFeedback: cleanFeedback,
      postingEnabled: false,
      artistVisible: false,
      bookingVisible: false,
      verifiedPro: false,
      verificationUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  if (requestedRole === 'artist') {
    batch.set(doc(db, 'artists', uid), {
      verificationStatus: 'needs_more_samples',
      postingEnabled: false,
      isVisible: false,
      artistVisible: false,
      bookingVisible: false,
      verifiedPro: false,
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }

  await batch.commit();

  await writeNotificationDual(uid, {
    id: `verification_needs_more_samples_${uid}`,
    type: 'verification_needs_more_samples',
    fromUid: adminUid,
    fromName: 'TATZO Admin',
    title: 'More portfolio samples needed',
    message: cleanFeedback,
    entityType: 'verification',
    entityId: uid,
    reason: cleanFeedback,
  });
};

export const approveDealerVerification = async (params: {
  uid: string;
  adminUid: string;
  user: UserDoc | null;
  dealerVerification: DealerVerificationDoc;
}) => {
  await ensureFreshAuthToken();
  const { uid, adminUid, user, dealerVerification } = params;
  const batch = writeBatch(db);

  batch.set(
    doc(db, 'dealerVerifications', uid),
    {
      status: 'approved',
      rejectReason: '',
      reviewedBy: adminUid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    doc(db, 'users', uid),
    {
      dealerRequestStatus: 'approved',
      dealerRejectReason: '',
      authorizedSeller: true,
      // Critical: keep role unchanged (artist stays artist)
      role: user?.role === 'artist' ? 'artist' : user?.role ?? 'artist',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    doc(db, 'dealers', uid),
    {
      uid,
      role: 'dealer',
      displayName: user?.displayName ?? user?.email ?? 'TATZO Dealer',
      studioName: dealerVerification.shopName ?? user?.displayName ?? 'Dealer Studio',
      locationCity: dealerVerification.locationCity ?? user?.locationCity ?? '',
      locationArea: dealerVerification.locationArea ?? user?.locationArea ?? '',
      location: [dealerVerification.locationArea ?? user?.locationArea ?? '', dealerVerification.locationCity ?? user?.locationCity ?? '']
        .filter(Boolean)
        .join(', '),
      authorizedSeller: true,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();

  await writeNotificationDual(uid, {
    id: `dealer_request_approved_${uid}`,
    fromUid: adminUid,
    fromName: 'TATZO Admin',
    type: 'dealer_request_approved',
    title: 'Dealer request approved',
    message: 'Your dealer request is approved. Artist role remains active.',
    entityType: 'dealerVerification',
    entityId: uid,
  });
};

export const rejectDealerVerification = async (params: {
  uid: string;
  adminUid: string;
  reason: string;
}) => {
  await ensureFreshAuthToken();
  const { uid, adminUid, reason } = params;
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error('Reject reason is required.');

  const batch = writeBatch(db);

  batch.set(
    doc(db, 'dealerVerifications', uid),
    {
      status: 'rejected',
      rejectReason: cleanReason,
      reviewedBy: adminUid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    doc(db, 'users', uid),
    {
      dealerRequestStatus: 'rejected',
      dealerRejectReason: cleanReason,
      authorizedSeller: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();

  await writeNotificationDual(uid, {
    id: `dealer_request_rejected_${uid}`,
    fromUid: adminUid,
    fromName: 'TATZO Admin',
    type: 'dealer_request_rejected',
    title: 'Dealer request rejected',
    message: 'Your dealer request was rejected. Check reason and re-apply.',
    entityType: 'dealerVerification',
    entityId: uid,
    reason: cleanReason,
  });
};

export const rollbackToPending = async (uid: string, adminUid: string) => {
  await ensureFreshAuthToken();
  const batch = writeBatch(db);
  batch.update(doc(db, 'verifications', uid), {
    status: 'pending_verification',
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, 'users', uid), {
    verificationStatus: 'pending_verification',
    postingEnabled: false,
    artistVisible: false,
    bookingVisible: false,
    verifiedPro: false,
    verificationUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });
  batch.set(doc(db, 'artists', uid), {
    verificationStatus: 'pending_verification',
    postingEnabled: false,
    isVisible: false,
    artistVisible: false,
    bookingVisible: false,
    verifiedPro: false,
    updatedAt: serverTimestamp(),
  }, { merge: true });
  await batch.commit();
};

export const listFinalPaymentBookings = async (maxRows = 30) => {
  await ensureFreshAuthToken();
  const q = query(collection(db, 'bookings'), where('status', 'in', ['final_payment_pending', 'completed']), orderBy('updatedAt', 'desc'), limit(maxRows));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((row) => row.status === 'final_payment_pending' || row.finalPaymentStatus) as Array<{ id: string } & FinalPaymentBookingDoc>;
};

export const updateFinalPaymentBookingAdmin = async (id: string, action: 'completed' | 'disputed', note = '') => {
  await ensureFreshAuthToken();
  const cleanNote = note.trim();
  if (action === 'completed') {
    await updateDoc(doc(db, 'bookings', id), {
      status: 'completed',
      finalPaymentStatus: 'artist_confirmed_paid',
      completedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      adminFinalPaymentNote: cleanNote,
    });
    return;
  }

  await updateDoc(doc(db, 'bookings', id), {
    finalPaymentStatus: 'disputed',
    finalPaymentDisputeNote: cleanNote || 'Marked disputed by admin.',
    updatedAt: serverTimestamp(),
    adminFinalPaymentNote: cleanNote,
  });
};

export const listRecentArtistTransactions = async (maxRows = 20) => {
  await ensureFreshAuthToken();
  const q = query(collection(db, 'artistTransactions'), orderBy('updatedAt', 'desc'), limit(maxRows));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<{ id: string } & ArtistTransactionDoc>;
};

export const updateArtistTransactionPayout = async (id: string, payoutStatus: NonNullable<ArtistTransactionDoc['payoutStatus']>, notes = '') => {
  await ensureFreshAuthToken();
  await updateDoc(doc(db, 'artistTransactions', id), {
    payoutStatus,
    notes: notes.trim(),
    updatedAt: serverTimestamp(),
  });
};

export const listEarlyAccessLeads = async (maxRows = 200) => {
  await ensureFreshAuthToken();
  const leadsQuery = query(collection(db, 'earlyAccessWaitlist'), orderBy('createdAt', 'desc'), limit(maxRows));
  const snap = await getDocs(leadsQuery);
  return snap.docs.map((row) => ({ id: row.id, ...(row.data() as EarlyAccessLeadDoc) }));
};

export const updateEarlyAccessLeadStatus = async (id: string, status: NonNullable<EarlyAccessLeadDoc['status']>) => {
  await ensureFreshAuthToken();
  await updateDoc(doc(db, 'earlyAccessWaitlist', id), {
    status,
    updatedAt: serverTimestamp(),
    contactedBy: auth.currentUser?.uid ?? null,
  });
};


export const updateArtistPayoutSetupStatus = async (uid: string, status: NonNullable<UserDoc['payoutSetupStatus']>) => {
  await ensureFreshAuthToken();
  const payload = {
    payoutSetupStatus: status,
    payoutSetupUpdatedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await Promise.all([
    setDoc(doc(db, 'users', uid), payload, { merge: true }),
    setDoc(doc(db, 'artists', uid), payload, { merge: true }),
  ]);
};

export const listRecentPostReports = async (maxRows = 30) => {
  await ensureFreshAuthToken();
  const q = query(collection(db, 'postReports'), orderBy('createdAt', 'desc'), limit(maxRows));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<{ id: string } & PostReportDoc>;
};
