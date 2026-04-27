import { Share } from 'react-native';
import { auth, db } from '../config/firebaseConfig';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';

export type SocialNotificationType = 'like' | 'share' | 'follow';

type ArtistIdentity = {
  uid?: string;
  displayName: string;
  handle?: string;
};

export const buildShareLink = (postId: string) => {
  // Placeholder deep link; we can swap to dynamic links later.
  return `https://tatzo.app/p/${encodeURIComponent(postId)}`;
};

const resolveArtistUid = async (identity: ArtistIdentity): Promise<string | null> => {
  if (identity.uid) return identity.uid;

  // With max privacy, we never query other users' private profiles.
  // Resolve from the public artists collection instead.
  const q = query(collection(db, 'artists'), where('displayName', '==', identity.displayName), limit(1));
  const snap = await getDocs(q);
  return snap.docs.length ? snap.docs[0].id : null;
};

const notificationDocId = (type: SocialNotificationType, params: { toUid: string; fromUid: string; postId?: string }) => {
  if (type === 'follow') return `follow_${params.toUid}_${params.fromUid}`;
  return `${type}_${params.postId ?? 'na'}_${params.fromUid}`;
};

const writeNotification = async (params: {
  toUid: string;
  type: SocialNotificationType;
  fromUid: string;
  fromName: string;
  postId?: string;
  postPreview?: string;
}) => {
  const ref = doc(db, 'users', params.toUid, 'notifications', notificationDocId(params.type, params));
  await setDoc(
    ref,
    {
      id: ref.id,
      type: params.type,
      toUid: params.toUid,
      fromUid: params.fromUid,
      fromName: params.fromName,
      postId: params.postId ?? null,
      postPreview: params.postPreview ?? null,
      createdAt: serverTimestamp(),
      read: false,
    },
    { merge: true },
  );
};

const deleteNotification = async (params: { toUid: string; type: SocialNotificationType; fromUid: string; postId?: string }) => {
  const ref = doc(db, 'users', params.toUid, 'notifications', notificationDocId(params.type, params));
  await deleteDoc(ref);
};

export const toggleLike = async (params: { postId: string; artist: ArtistIdentity; postPreview: string }) => {
  const actor = auth.currentUser;
  if (!actor) throw new Error('You must be signed in.');

  const actorUid = actor.uid;
  const actorName = actor.displayName ?? actor.email ?? 'User';

  const likeRef = doc(db, 'posts', params.postId, 'likes', actorUid);
  const likeSnap = await getDoc(likeRef);
  const artistUid = await resolveArtistUid(params.artist);

  if (likeSnap.exists()) {
    await deleteDoc(likeRef);
    if (artistUid) {
      await deleteNotification({ toUid: artistUid, type: 'like', fromUid: actorUid, postId: params.postId });
    }
    return { liked: false, artistUid };
  }

  await setDoc(likeRef, { uid: actorUid, createdAt: serverTimestamp() }, { merge: true });
  await setDoc(
    doc(db, 'posts', params.postId),
    { id: params.postId, artistName: params.artist.displayName, artistHandle: params.artist.handle ?? null, updatedAt: serverTimestamp() },
    { merge: true },
  );

  if (artistUid) {
    await writeNotification({
      toUid: artistUid,
      type: 'like',
      fromUid: actorUid,
      fromName: actorName,
      postId: params.postId,
      postPreview: params.postPreview,
    });
  }

  return { liked: true, artistUid };
};

export const sharePost = async (params: { postId: string; artist: ArtistIdentity; postPreview: string; shareMessage: string }) => {
  const actor = auth.currentUser;
  if (!actor) throw new Error('You must be signed in.');

  const actorUid = actor.uid;
  const actorName = actor.displayName ?? actor.email ?? 'User';

  // Best-effort native share. If it fails, we still record intent for analytics/notifications.
  try {
    await Share.share({ message: params.shareMessage });
  } catch {
    // ignore
  }

  const shareRef = doc(db, 'posts', params.postId, 'shares', actorUid);
  await setDoc(
    shareRef,
    { uid: actorUid, link: buildShareLink(params.postId), createdAt: serverTimestamp() },
    { merge: true },
  );

  const artistUid = await resolveArtistUid(params.artist);
  if (artistUid) {
    await writeNotification({
      toUid: artistUid,
      type: 'share',
      fromUid: actorUid,
      fromName: actorName,
      postId: params.postId,
      postPreview: params.postPreview,
    });
  }

  return { shared: true, artistUid };
};

export const toggleFollow = async (params: { artist: ArtistIdentity }) => {
  const actor = auth.currentUser;
  if (!actor) throw new Error('You must be signed in.');

  const actorUid = actor.uid;
  const actorName = actor.displayName ?? actor.email ?? 'User';

  const artistUid = await resolveArtistUid(params.artist);
  if (!artistUid) return { following: false, artistUid: null };

  const followRef = doc(db, 'follows', `${actorUid}_${artistUid}`);
  const followSnap = await getDoc(followRef);

  if (followSnap.exists()) {
    await deleteDoc(followRef);
    await deleteNotification({ toUid: artistUid, type: 'follow', fromUid: actorUid });
    return { following: false, artistUid };
  }

  await setDoc(
    followRef,
    { id: followRef.id, fromUid: actorUid, toUid: artistUid, createdAt: serverTimestamp() },
    { merge: true },
  );
  await writeNotification({ toUid: artistUid, type: 'follow', fromUid: actorUid, fromName: actorName });
  return { following: true, artistUid };
};


