import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import type { UserProfile } from '../types/app';
import { getArtistPublicVisibility, getArtistSettingsFromProfile } from './artistSettings';

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
  let certificateReviewStatus = safeTrim(profile.certificateReviewStatus);
  try {
    const ver = await getDoc(doc(db, 'verifications', uid));
    if (ver.exists()) {
      const d = ver.data() as any;
      shopName = safeTrim(d.shopName);
      portfolioLink = safeTrim(d.portfolioLink);
      certificateReviewStatus = certificateReviewStatus || safeTrim(d.certificateReviewStatus);
    }
  } catch {
    // ignore
  }

  const payload: any = {
    uid,
    role,
    artistName: safeTrim(profile.artistName) || safeTrim(profile.displayName),
    displayName: safeTrim(profile.displayName),
    studioName: safeTrim(profile.studioName) || shopName || safeTrim(profile.displayName),
    shopAddressLine: safeTrim(profile.shopAddressLine),
    artistSinceYear: Number(profile.artistSinceYear ?? 0) || null,
    locationCity: safeTrim(profile.locationCity),
    locationArea: safeTrim(profile.locationArea),
    location: [safeTrim(profile.locationArea), safeTrim(profile.locationCity)].filter(Boolean).join(', '),
    startingPrice: Number(profile.startingPrice ?? 0) || 0,
    startingFrom: Number(profile.startingPrice ?? 0) || 0,
    experience: safeTrim(profile.experience),
    bio: safeTrim(profile.bio),
    styles: Array.isArray(profile.styles) ? profile.styles.map((tag) => safeTrim(tag)).filter(Boolean) : [],
    tags: Array.isArray(profile.styles) ? profile.styles.map((tag) => safeTrim(tag)).filter(Boolean) : [],
    profileImageUrl: safeTrim(profile.profileImageUrl),
    profileImageMeta: profile.profileImageMeta ?? null,
    coverImageUrl: safeTrim(profile.coverImageUrl),
    coverImageMeta: profile.coverImageMeta ?? null,
    certificateReviewStatus: certificateReviewStatus || 'pending',
    verificationStatus: 'approved',
    artistVisible: true,
    bookingVisible: getArtistSettingsFromProfile(profile).privacy.bookingVisibility !== false,
    postingEnabled: profile.postingEnabled === true,
    isVisible: getArtistPublicVisibility(getArtistSettingsFromProfile(profile)),
    portfolioLink,
    verifiedPro: role === 'artist',
    authorizedSeller: role === 'dealer',
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
