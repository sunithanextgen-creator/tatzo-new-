import { Share } from 'react-native';
import { auth, db } from '../config/firebaseConfig';
import {
  writeBatch,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { writeNotificationDual } from './notifications';
import { getArtistSettingsFromProfile, getArtistPublicVisibility } from './artistSettings';

export type SocialNotificationType = 'like' | 'follow';

type ArtistIdentity = {
  uid?: string;
  displayName: string;
  handle?: string;
  studioName?: string | null;
  location?: string | null;
  profileImageUrl?: string | null;
};

export const buildShareLink = (postId: string) => {
  const safe = encodeURIComponent(postId);
  return `tatzo://post/${safe}`;
};

export const buildArtistShareLink = (artistUid: string) => {
  const safe = encodeURIComponent(artistUid);
  return `tatzo://artist/${safe}`;
};

const buildWebFallbackLink = (kind: 'post' | 'artist', id: string) => {
  const safe = encodeURIComponent(id);
  return `https://tatzo.app/${kind}/${safe}`;
};

const resolveTargetUid = async (identity: ArtistIdentity): Promise<string | null> => {
  if (identity.uid) return identity.uid;

  // With max privacy, resolve only from public artists collection.
  const byDisplay = query(
    collection(db, 'artists'),
    where('verificationStatus', '==', 'approved'),
    where('artistVisible', '==', true),
    where('bookingVisible', '==', true),
    where('displayName', '==', identity.displayName),
    limit(1),
  );
  const byArtistName = query(
    collection(db, 'artists'),
    where('verificationStatus', '==', 'approved'),
    where('artistVisible', '==', true),
    where('bookingVisible', '==', true),
    where('artistName', '==', identity.displayName),
    limit(1),
  );
  const [displaySnap, artistNameSnap] = await Promise.all([getDocs(byDisplay), getDocs(byArtistName)]);
  const candidateDocs = [...displaySnap.docs, ...artistNameSnap.docs];
  for (const candidate of candidateDocs) {
    const data = candidate.data() as any;
    const settings = getArtistSettingsFromProfile(data);
    const discoverable =
      String(data.verificationStatus ?? '') === 'approved' &&
      data.artistVisible !== false &&
      getArtistPublicVisibility(settings) &&
      settings.privacy.bookingVisibility !== false;
    if (discoverable) return candidate.id;
  }

  const safeHandle = String(identity.handle ?? '')
    .trim()
    .replace(/^@/, '');
  if (safeHandle) {
    const all = await getDocs(query(collection(db, 'artists'), where('verificationStatus', '==', 'approved'), where('artistVisible', '==', true), where('bookingVisible', '==', true), limit(60)));
    const match = all.docs.find((row) => {
      const data = row.data() as any;
      const settings = getArtistSettingsFromProfile(data);
      const discoverable =
        String(data.verificationStatus ?? '') === 'approved' &&
        data.artistVisible !== false &&
        getArtistPublicVisibility(settings) &&
        settings.privacy.bookingVisibility !== false;
      if (!discoverable) return false;
      const display = String(data.displayName ?? '').trim().toLowerCase();
      const artistName = String(data.artistName ?? '').trim().toLowerCase();
      const candidateHandle = (artistName || display).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      return candidateHandle === safeHandle.toLowerCase();
    });
    if (match) return match.id;
  }

  return null;
};

export const toggleSavePost = async (params: { postId: string; postPreview?: string }) => {
  const actor = auth.currentUser;
  if (!actor) throw new Error('You must be signed in.');

  const actorUid = actor.uid;
  const saveRef = doc(db, 'users', actorUid, 'savedPosts', params.postId);
  const postRef = doc(db, 'posts', params.postId);
  const snap = await getDoc(saveRef);

  if (snap.exists()) {
    await deleteDoc(saveRef);
    return { saved: false };
  }

  const postSnap = await getDoc(postRef);
  if (!postSnap.exists()) {
    throw new Error('Post not found.');
  }
  const post = postSnap.data() as any;
  const artistUid = String(post.artistUid ?? '').trim();
  await setDoc(
    saveRef,
    {
      id: params.postId,
      postId: params.postId,
      artistUid,
      artistName: String(post.artistName ?? '').trim() || 'Artist',
      artistHandle: String(post.artistHandle ?? '').trim() || null,
      artistLocation: String(post.artistLocation ?? '').trim() || null,
      artistProfileImageUrl: String(post.artistProfileImageUrl ?? '').trim() || null,
      caption: String(post.caption ?? '').trim() || null,
      imageUrl: String(post.imageUrl ?? '').trim() || null,
      videoUrl: String(post.videoUrl ?? '').trim() || null,
      tags: Array.isArray(post.tags) ? post.tags : [],
      savedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return { saved: true };
};

export const toggleBlockUser = async (params: { blockedUid: string; blockedName?: string; blockedProfileImageUrl?: string }) => {
  const actor = auth.currentUser;
  if (!actor) throw new Error('You must be signed in.');

  const actorUid = actor.uid;
  const blockedUid = String(params.blockedUid ?? '').trim();
  if (!blockedUid) throw new Error('Missing blocked user.');

  const blockRef = doc(db, 'users', actorUid, 'blockedUsers', blockedUid);
  const snap = await getDoc(blockRef);

  if (snap.exists()) {
    await deleteDoc(blockRef);
    return { blocked: false };
  }

  await setDoc(
    blockRef,
    {
      id: blockedUid,
      blockedUid,
      blockedName: params.blockedName ?? null,
      blockedProfileImageUrl: params.blockedProfileImageUrl ?? null,
      blockedAt: serverTimestamp(),
    },
    { merge: true },
  );

  return { blocked: true };
};

const notificationDocId = (type: SocialNotificationType, params: { toUid: string; fromUid: string; postId?: string }) => {
  if (type === 'follow') return `follow_${params.toUid}_${params.fromUid}`;
  return `${type}_${params.postId ?? 'na'}_${params.fromUid}`;
};

export const toggleLike = async (params: { postId: string; artist: ArtistIdentity; postPreview: string }) => {
  const actor = auth.currentUser;
  if (!actor) throw new Error('You must be signed in.');

  const actorUid = actor.uid;
  const actorName = actor.displayName ?? actor.email ?? 'User';
  const targetUidPromise = resolveTargetUid(params.artist);

  const likeRef = doc(db, 'posts', params.postId, 'likes', actorUid);
  const userLikeRef = doc(db, 'users', actorUid, 'likedPosts', params.postId);
  const postRef = doc(db, 'posts', params.postId);
  const [likeSnap, userLikeSnap] = await Promise.all([getDoc(likeRef), getDoc(userLikeRef).catch(() => null)]);

  if (likeSnap.exists() || userLikeSnap?.exists()) {
    const batch = writeBatch(db);
    batch.delete(likeRef);
    batch.delete(userLikeRef);
    await batch.commit();
    await updateDoc(postRef, { likesCount: increment(-1), updatedAt: serverTimestamp() }).catch(() => {});
    return { liked: false, targetUid: params.artist.uid ?? null, likeDelta: -1 };
  }

  const likePayload = {
    uid: actorUid,
    postId: params.postId,
    artistUid: params.artist.uid ?? null,
    artistName: params.artist.displayName,
    postPreview: params.postPreview,
    createdAt: serverTimestamp(),
  };
  const batch = writeBatch(db);
  batch.set(likeRef, likePayload, { merge: true });
  batch.set(userLikeRef, likePayload, { merge: true });
  await batch.commit();
  await updateDoc(postRef, { likesCount: increment(1), updatedAt: serverTimestamp() }).catch(() => {});
  const targetUid = await targetUidPromise.catch(() => null);
  const notifId = targetUid ? notificationDocId('like', { toUid: targetUid, fromUid: actorUid, postId: params.postId }) : '';

  if (targetUid && notifId) {
    try {
      await writeNotificationDual({
        id: notifId,
        toUid: targetUid,
        type: 'like',
        fromUid: actorUid,
        fromName: actorName,
        title: 'New Like',
        message: `${actorName} liked your post.`,
        entityType: 'post',
        entityId: params.postId,
        postId: params.postId,
        postPreview: params.postPreview,
        createOnly: true,
      });
    } catch {
      // Keep like interaction successful even if notification write fails.
    }
  }

  return { liked: true, targetUid, likeDelta: 1 };
};

export const sharePost = async (params: {
  postId: string;
  artist: ArtistIdentity;
  postPreview: string;
  shareMessage: string;
}) => {
  const actor = auth.currentUser;
  if (!actor) throw new Error('You must be signed in.');

  const actorUid = actor.uid;
  const targetUidPromise = resolveTargetUid(params.artist);

  const postLink = buildShareLink(params.postId);
  const postFallback = buildWebFallbackLink('post', params.postId);
  const artistLink = params.artist.uid ? buildArtistShareLink(params.artist.uid) : '';
  const artistFallback = params.artist.uid ? buildWebFallbackLink('artist', params.artist.uid) : '';

  await Share.share({
    message: `${params.shareMessage}\n\n${postLink}\n${postFallback}${artistLink ? `\n${artistLink}\n${artistFallback}` : ''}`,
  });

  const shareRef = doc(db, 'posts', params.postId, 'shares', actorUid);
  await setDoc(
    shareRef,
    { uid: actorUid, link: postLink, createdAt: serverTimestamp() },
    { merge: true },
  ).catch(() => {});

  const artistUid = await targetUidPromise.catch(() => null);
  return { shared: true, artistUid };
};

export const toggleFollow = async (params: { artist: ArtistIdentity }) => {
  const actor = auth.currentUser;
  if (!actor) throw new Error('You must be signed in.');

  const actorUid = actor.uid;
  const actorName = actor.displayName ?? actor.email ?? 'User';

  const targetUid = await resolveTargetUid(params.artist);
  if (!targetUid) return { following: false, targetUid: null };

  const followRef = doc(db, 'follows', `${actorUid}_${targetUid}`);
  const followingRef = doc(db, 'users', actorUid, 'following', targetUid);
  const [followSnap, followingSnap] = await Promise.all([getDoc(followRef), getDoc(followingRef)]);
  const notifId = notificationDocId('follow', { toUid: targetUid, fromUid: actorUid });

  if (followSnap.exists() || followingSnap.exists()) {
    const batch = writeBatch(db);
    batch.delete(followRef);
    batch.delete(followingRef);
    await batch.commit();
    return { following: false, targetUid };
  }

  const artistSnap = await getDoc(doc(db, 'artists', targetUid)).catch(() => null);
  const artistData = artistSnap?.exists() ? (artistSnap.data() as any) : {};
  const displayName = String(artistData.artistName ?? artistData.displayName ?? params.artist.displayName ?? 'Artist').trim() || 'Artist';
  const studioName = String(artistData.studioName ?? artistData.shopName ?? params.artist.studioName ?? '').trim();
  const location = String(
    artistData.location ??
      [artistData.locationArea, artistData.locationCity].filter(Boolean).join(', ') ??
      params.artist.location ??
      '',
  ).trim();
  const profileImageUrl = String(artistData.profileImageUrl ?? params.artist.profileImageUrl ?? '').trim();

  const batch = writeBatch(db);
  batch.set(
    followRef,
    { id: followRef.id, fromUid: actorUid, toUid: targetUid, createdAt: serverTimestamp() },
    { merge: true },
  );
  batch.set(
    followingRef,
    {
      id: targetUid,
      uid: targetUid,
      artistUid: targetUid,
      fromUid: actorUid,
      toUid: targetUid,
      name: displayName,
      artistName: displayName,
      displayName,
      studioName,
      location,
      profileImageUrl,
      artistProfileImageUrl: profileImageUrl,
      verified: String(artistData.verificationStatus ?? '') === 'approved' || artistData.verifiedPro === true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
  await batch.commit();

  try {
    await writeNotificationDual({
      id: notifId,
      toUid: targetUid,
      type: 'follow',
      fromUid: actorUid,
      fromName: actorName,
      title: 'New Follower',
      message: `${actorName} started following you.`,
      entityType: 'profile',
      entityId: actorUid,
      createOnly: true,
    });
  } catch {
    // Keep follow relation successful even if notification write fails.
  }

  return { following: true, targetUid };
};

export const getPostLikeState = async (postId: string, uid: string) => {
  if (!postId || !uid) return false;
  const [userLikeSnap, postLikeSnap] = await Promise.all([
    getDoc(doc(db, 'users', uid, 'likedPosts', postId)).catch(() => null),
    getDoc(doc(db, 'posts', postId, 'likes', uid)).catch(() => null),
  ]);
  return Boolean(userLikeSnap?.exists() || postLikeSnap?.exists());
};

export const getFollowState = async (targetUid: string | undefined, uid: string) => {
  const safeTarget = String(targetUid ?? '').trim();
  if (!safeTarget || !uid || safeTarget === uid) return false;
  const [followingSnap, legacySnap] = await Promise.all([
    getDoc(doc(db, 'users', uid, 'following', safeTarget)).catch(() => null),
    getDoc(doc(db, 'follows', `${uid}_${safeTarget}`)).catch(() => null),
  ]);
  return Boolean(followingSnap?.exists() || legacySnap?.exists());
};
