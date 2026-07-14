import {
  collection,
  DocumentData,
  doc,
  getDocs,
  getDoc,
  getCountFromServer,
  limit,
  onSnapshot,
  orderBy,
  QueryDocumentSnapshot,
  query,
  serverTimestamp,
  setDoc,
  startAfter,
  writeBatch,
  where,
} from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';
import { writeNotificationDual } from './notifications';
import { getArtistSettingsFromProfile, getArtistPublicVisibility } from './artistSettings';

export type ArtistPostRow = {
  id: string;
  artistUid: string;
  artistName: string;
  artistHandle?: string | null;
  artistProfileImageUrl?: string | null;
  artistApproved: boolean;
  artistVisible: boolean;
  bookingVisible?: boolean;
  caption: string;
  imageUrl: string;
  imageStoragePath?: string | null;
  videoUrl?: string | null;
  videoStoragePath?: string | null;
  mediaType?: 'image' | 'video' | null;
  tags: string[];
  status: 'active';
  createdAt?: unknown;
  updatedAt?: unknown;
  lastVisibilitySyncAt?: unknown;
};

type CreateArtistPostInput = {
  artistUid: string;
  artistName: string;
  artistHandle?: string;
  caption: string;
  imageUrl: string;
  imageStoragePath?: string;
  videoUrl?: string;
  videoStoragePath?: string;
  mediaType?: 'image' | 'video' | null;
  tags?: string[];
};

const parseTags = (value: string[]) =>
  value
    .map((tag) => String(tag).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);

const resolveArtistVisibilityFlags = async (
  artistUid: string,
  userData?: { role?: string; verificationStatus?: string; displayName?: string } | null,
) => {
  const safeUid = String(artistUid ?? '').trim();
  if (!safeUid) {
    return { artistApproved: false, artistVisible: false };
  }

  try {
    const artistSnap = await getDoc(doc(db, 'artists', safeUid));
    if (!artistSnap.exists()) {
      return { artistApproved: false, artistVisible: false };
    }

    const artistData = artistSnap.data() as any;
    const artistApproved = String(artistData?.verificationStatus ?? '') === 'approved';
    const settings = getArtistSettingsFromProfile(artistData);
    const artistVisible = artistApproved && artistData?.isVisible !== false && getArtistPublicVisibility(settings);
    const bookingVisible = settings.privacy.bookingVisibility !== false;

    return {
      artistApproved,
      artistVisible,
      bookingVisible,
    };
  } catch {
    return { artistApproved: false, artistVisible: false, bookingVisible: false };
  }
};

const resolveArtistPublishAccess = async (
  artistUid: string,
  userData?: { role?: string; verificationStatus?: string; postingEnabled?: boolean } | null,
) => {
  const userApproved =
    String(userData?.role ?? '') === 'artist' &&
    String(userData?.verificationStatus ?? '') === 'approved' &&
    userData?.postingEnabled !== false;

  try {
    const artistSnap = await getDoc(doc(db, 'artists', artistUid));
    const artistData = artistSnap.exists() ? (artistSnap.data() as any) : null;
    const artistApproved =
      String(artistData?.verificationStatus ?? '') === 'approved' &&
      artistData?.postingEnabled !== false &&
      artistData?.artistVisible !== false &&
      artistData?.bookingVisible !== false;

    return { canPublish: userApproved || artistApproved, artistData };
  } catch {
    return { canPublish: userApproved, artistData: null };
  }
};

export const createArtistPost = async (input: CreateArtistPostInput) => {
  const artistUid = input.artistUid.trim();
  if (!artistUid) throw new Error('Missing artist UID.');
  if (!input.caption.trim() && !input.imageUrl.trim() && !String(input.videoUrl ?? '').trim()) {
    throw new Error('Add caption, image, or video.');
  }

  const userSnap = await getDoc(doc(db, 'users', artistUid));
  const userData = userSnap.exists() ? (userSnap.data() as any) : null;
  if (String(userData?.role ?? '') === 'artist' && String(userData?.verificationStatus ?? '') === 'approved') {
    const safeDisplayName = String(userData?.displayName ?? input.artistName ?? 'Artist').trim() || 'Artist';
    const safeArtistName = String(userData?.artistName ?? input.artistName ?? safeDisplayName).trim() || safeDisplayName;
    const safeLocationCity = String(userData?.locationCity ?? '').trim();
    const safeLocationArea = String(userData?.locationArea ?? '').trim();
    await setDoc(
      doc(db, 'artists', artistUid),
      {
        uid: artistUid,
        role: 'artist',
        displayName: safeDisplayName,
        artistName: safeArtistName,
        locationCity: safeLocationCity,
        locationArea: safeLocationArea,
        location: [safeLocationArea, safeLocationCity].filter(Boolean).join(', '),
        artistSettings: userData?.artistSettings ?? undefined,
        verificationStatus: 'approved',
        verifiedPro: true,
        isVisible: getArtistPublicVisibility(getArtistSettingsFromProfile(userData)),
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
  const publishAccess = await resolveArtistPublishAccess(artistUid, userData);
  const canPublish = publishAccess.canPublish;
  if (!canPublish) {
    throw new Error('Artist approval is required before publishing posts.');
  }

  const visibility = await resolveArtistVisibilityFlags(artistUid, userData);
  const artistProfileImageUrl = String(userData?.profileImageUrl ?? publishAccess.artistData?.profileImageUrl ?? '').trim();

  const postRef = doc(collection(db, 'posts'));
  const payload: ArtistPostRow = {
    id: postRef.id,
    artistUid,
    artistName: input.artistName.trim() || 'Artist',
    artistHandle: (input.artistHandle || '').trim() || null,
    artistProfileImageUrl: artistProfileImageUrl || null,
    artistApproved: visibility.artistApproved,
    artistVisible: visibility.artistVisible,
    bookingVisible: visibility.bookingVisible,
    caption: input.caption.trim(),
    imageUrl: (input.imageUrl || '').trim(),
    imageStoragePath: (input.imageStoragePath || '').trim() || null,
    videoUrl: (input.videoUrl || '').trim() || null,
    videoStoragePath: (input.videoStoragePath || '').trim() || null,
    mediaType: input.mediaType ?? ((input.videoUrl || '').trim() ? 'video' : (input.imageUrl || '').trim() ? 'image' : null),
    tags: parseTags(input.tags || []),
    status: 'active',
  };

  await setDoc(postRef, {
    ...payload,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastVisibilitySyncAt: serverTimestamp(),
  });

  await writeNotificationDual({
    id: `post_created_${postRef.id}_${artistUid}`,
    toUid: artistUid,
    fromUid: auth.currentUser?.uid ?? artistUid,
    fromName: auth.currentUser?.displayName ?? input.artistName ?? 'Artist',
    type: 'post_created',
    title: 'Post published',
    message: payload.caption,
    entityType: 'post',
    entityId: postRef.id,
    postId: postRef.id,
    postPreview: payload.caption,
  });

  return payload;
};

export const syncArtistPostVisibilityForUid = async (artistUid: string, maxRows = 80) => {
  const safeUid = String(artistUid ?? '').trim();
  if (!safeUid) return { seen: 0, updated: 0 };

  const userSnap = await getDoc(doc(db, 'users', safeUid));
  const userData = userSnap.exists() ? (userSnap.data() as any) : null;
  const target = await resolveArtistVisibilityFlags(safeUid, userData);

  const snap = await getDocs(
    query(
      collection(db, 'posts'),
      where('artistUid', '==', safeUid),
      where('status', '==', 'active'),
      limit(maxRows),
    ),
  );

  if (snap.empty) return { seen: 0, updated: 0 };

  let updates = 0;
  const batch = writeBatch(db);
  snap.docs.forEach((row) => {
    const d = row.data() as any;
    const currentApproved = d.artistApproved === true;
    const currentVisible = d.artistVisible === true;
    const currentBookingVisible = d.bookingVisible === true;
    if (currentApproved === target.artistApproved && currentVisible === target.artistVisible && currentBookingVisible === target.bookingVisible) return;

    batch.update(row.ref, {
      artistApproved: target.artistApproved,
      artistVisible: target.artistVisible,
      bookingVisible: target.bookingVisible,
      lastVisibilitySyncAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    updates += 1;
  });

  if (updates > 0) {
    await batch.commit();
  }

  return { seen: snap.docs.length, updated: updates };
};

export const listArtistPosts = async (artistUid: string, maxRows = 20) => {
  const q = query(
    collection(db, 'posts'),
    where('artistUid', '==', artistUid),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc'),
    limit(maxRows),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ArtistPostRow[];
};

export type ArtistPostsPage = {
  rows: ArtistPostRow[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

export const listArtistPostsPage = async (
  artistUid: string,
  pageSize = 10,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
): Promise<ArtistPostsPage> => {
  const base = [
    where('artistUid', '==', artistUid),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc'),
  ] as const;

  const q = cursor
    ? query(collection(db, 'posts'), ...base, startAfter(cursor), limit(pageSize))
    : query(collection(db, 'posts'), ...base, limit(pageSize));

  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ArtistPostRow[];
  const nextCursor = snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : null;

  return {
    rows,
    cursor: nextCursor,
    hasMore: snap.docs.length === pageSize,
  };
};

export const subscribeArtistPosts = (
  artistUid: string,
  onRows: (rows: ArtistPostRow[]) => void,
  onError?: (error: Error) => void,
) => {
  const q = query(
    collection(db, 'posts'),
    where('artistUid', '==', artistUid),
    where('status', '==', 'active'),
    orderBy('createdAt', 'desc'),
    limit(30),
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as ArtistPostRow[];
      onRows(rows);
    },
    (error) => onError?.(error as Error),
  );
};

export const getArtistPostCount = async (artistUid: string) => {
  const q = query(collection(db, 'posts'), where('artistUid', '==', artistUid), where('status', '==', 'active'));
  const snap = await getCountFromServer(q);
  return snap.data().count;
};


