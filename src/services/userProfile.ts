import { User } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import { UserProfile } from '../types/app';

export const buildProfileFromAuthUser = (user: User): UserProfile => {
  return {
    uid: user.uid,
    email: user.email ?? undefined,
    displayName: user.displayName ?? undefined,
  };
};

export const syncUserProfile = async (user: User, extra: Partial<UserProfile> = {}) => {
  const userRef = doc(db, 'users', user.uid);
  const profile = buildProfileFromAuthUser(user);
  const profilePayload: Record<string, unknown> = {
    ...profile,
    ...extra,
    updatedAt: serverTimestamp(),
  };
  const email = String(extra.email ?? profile.email ?? '').trim().toLowerCase();
  const artistName = String(extra.artistName ?? extra.displayName ?? '').trim().toLowerCase();
  const studioName = String(extra.studioName ?? '').trim().toLowerCase();
  if (email) profilePayload.emailLower = email;
  if (artistName) profilePayload.artistNameLower = artistName;
  if (studioName) profilePayload.studioNameLower = studioName;

  if (extra.createdAt) {
    profilePayload.createdAt = extra.createdAt;
  }

  Object.keys(profilePayload).forEach((key) => {
    if (profilePayload[key] === undefined) {
      delete profilePayload[key];
    }
  });

  await setDoc(
    userRef,
    profilePayload,
    { merge: true },
  );
};
