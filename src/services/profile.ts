import { doc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import type { UserProfile } from '../types/app';

export const getUserProfile = async (uid: string): Promise<UserProfile | null> => {
  const ref = doc(db, 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
};

