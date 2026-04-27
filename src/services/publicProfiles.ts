import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import type { UserProfile } from '../types/app';

const safeTrim = (v: any) => String(v ?? '').trim();

export const ensurePublicRoleProfile = async (profile: UserProfile) => {
  const uid = safeTrim(profile.uid);
  if (!uid) return;

  const role = profile.role;
  const approved = profile.verificationStatus === 'approved';
  if (!approved) return;

  if (role !== 'artist' && role !== 'dealer') return;

  const targetCollection = role === 'artist' ? 'artists' : 'dealers';
  const targetRef = doc(db, targetCollection, uid);
  const existing = await getDoc(targetRef);

  // Pull non-sensitive business label from the verification doc if available.
  let shopName = '';
  let portfolioLink = '';
  try {
    const ver = await getDoc(doc(db, 'verifications', uid));
    if (ver.exists()) {
      const d = ver.data() as any;
      shopName = safeTrim(d.shopName);
      portfolioLink = safeTrim(d.portfolioLink);
    }
  } catch {
    // ignore
  }

  const payload: any = {
    uid,
    role,
    displayName: safeTrim(profile.displayName),
    studioName: shopName || safeTrim(profile.displayName),
    locationCity: safeTrim(profile.locationCity),
    locationArea: safeTrim(profile.locationArea),
    location: [safeTrim(profile.locationArea), safeTrim(profile.locationCity)].filter(Boolean).join(', '),
    portfolioLink,
    verifiedPro: true,
    updatedAt: serverTimestamp(),
  };

  if (!existing.exists()) {
    payload.createdAt = serverTimestamp();
    await setDoc(targetRef, payload, { merge: true });
    return;
  }

  // Minimal merge update (do not overwrite custom fields like styles/startingFrom if set later).
  await setDoc(targetRef, payload, { merge: true });
};
