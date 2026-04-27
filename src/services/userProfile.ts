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

  if (extra.createdAt) {
    profilePayload.createdAt = extra.createdAt;
  }

  await setDoc(
    userRef,
    profilePayload,
    { merge: true },
  );
};
