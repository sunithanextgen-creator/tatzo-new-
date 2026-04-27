import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { db, storage } from './firebase';
import type { RequestedRole, UserDoc, VerificationDoc } from './types';

export const listPendingVerifications = async () => {
  const q = query(collection(db, 'verifications'), where('status', '==', 'pending'), orderBy('submittedAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<{ id: string } & VerificationDoc>;
};

export const getVerificationWithUser = async (uid: string) => {
  const [vSnap, uSnap] = await Promise.all([getDoc(doc(db, 'verifications', uid)), getDoc(doc(db, 'users', uid))]);

  return {
    verification: (vSnap.exists() ? ({ uid: vSnap.id, ...(vSnap.data() as any) } as VerificationDoc) : null),
    user: (uSnap.exists() ? ({ uid: uSnap.id, ...(uSnap.data() as any) } as UserDoc) : null),
  };
};

export const getCertificateUrls = async (paths: string[]) => {
  const urls = await Promise.all(
    paths.map(async (p) => {
      const url = await getDownloadURL(storageRef(storage, p));
      return { path: p, url };
    }),
  );
  return urls;
};

const buildPublicProfilePayload = (uid: string, role: RequestedRole, user: UserDoc | null, verification: VerificationDoc) => {
  const displayName = user?.displayName ?? user?.email ?? 'TATZO Pro';
  const locationCity = verification.locationCity ?? user?.locationCity ?? '';
  const locationArea = verification.locationArea ?? user?.locationArea ?? '';

  return {
    uid,
    role,
    displayName,
    studioName: verification.shopName ?? displayName,
    locationCity,
    locationArea,
    location: [locationArea, locationCity].filter(Boolean).join(', '),
    verifiedPro: role === 'artist',
    authorizedSeller: role === 'dealer',
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
};

const createNotification = async (uid: string, payload: Record<string, unknown>) => {
  const notificationId = `verification_${Date.now()}`;
  await setDoc(doc(db, 'users', uid, 'notifications', notificationId), {
    id: notificationId,
    toUid: uid,
    read: false,
    createdAt: serverTimestamp(),
    ...payload,
  });
};

export const approveVerification = async (params: {
  uid: string;
  requestedRole: RequestedRole;
  adminUid: string;
  user: UserDoc | null;
  verification: VerificationDoc;
}) => {
  const { uid, requestedRole, adminUid, user, verification } = params;
  const batch = writeBatch(db);

  batch.update(doc(db, 'verifications', uid), {
    status: 'approved',
    rejectReason: '',
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
      verificationUpdatedAt: serverTimestamp(),
      isProfileComplete: true,
      verifiedPro: requestedRole === 'artist',
      authorizedSeller: requestedRole === 'dealer',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const targetCollection = requestedRole === 'artist' ? 'artists' : 'dealers';
  batch.set(doc(db, targetCollection, uid), buildPublicProfilePayload(uid, requestedRole, user, verification), { merge: true });

  await batch.commit();

  await createNotification(uid, {
    type: 'verification_approved',
    fromUid: adminUid,
    fromName: 'TATZO Admin',
  });
};

export const rejectVerification = async (params: {
  uid: string;
  requestedRole: RequestedRole;
  adminUid: string;
  reason: string;
}) => {
  const { uid, adminUid, reason } = params;
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error('Reject reason is required.');

  const batch = writeBatch(db);

  batch.update(doc(db, 'verifications', uid), {
    status: 'rejected',
    rejectReason: cleanReason,
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(
    doc(db, 'users', uid),
    {
      role: 'user',
      verificationStatus: 'rejected',
      verificationRejectReason: cleanReason,
      verificationUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();

  await createNotification(uid, {
    type: 'verification_rejected',
    fromUid: adminUid,
    fromName: 'TATZO Admin',
    reason: cleanReason,
  });
};

export const rollbackToPending = async (uid: string, adminUid: string) => {
  await updateDoc(doc(db, 'verifications', uid), {
    status: 'pending',
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};
