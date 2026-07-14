import { signOut } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../config/firebaseConfig';

type SignOutCleanupOptions = {
  // WARNING: Deletes the user's Firestore profile + some related docs.
  // Keep this true only for early-stage/testing flows.
  deleteProfile?: boolean;
  deleteNotificationsLimit?: number;
  deleteBookingsLimit?: number;
};

export const signOutAndCleanup = async (options: SignOutCleanupOptions = {}) => {
  const {
    deleteProfile = true,
    deleteNotificationsLimit = 100,
    deleteBookingsLimit = 50,
  } = options;

  const user = auth.currentUser;

  if (user && !deleteProfile) {
    await signOut(auth);
    return;
  }

  if (user && deleteProfile) {
    try {
      const batch = writeBatch(db);

      // Best-effort cleanup of a few subcollection docs.
      const notifsSnap = await getDocs(
        query(collection(db, 'users', user.uid, 'notifications'), limit(deleteNotificationsLimit)),
      );
      for (const d of notifsSnap.docs) batch.delete(d.ref);

      const bookingsSnap = await getDocs(
        query(collection(db, 'bookings'), where('userUid', '==', user.uid), limit(deleteBookingsLimit)),
      );
      for (const d of bookingsSnap.docs) batch.delete(d.ref);

      batch.delete(doc(db, 'users', user.uid));

      await batch.commit();
    } catch (e) {
      // Even if cleanup fails, still allow sign out.
      console.error('TATZO: signOut cleanup failed', e);
    }
  }

  await signOut(auth);
};
