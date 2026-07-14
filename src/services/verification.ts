import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import type { RequestedRole } from '../types/app';

type CertificateUploadMeta = {
  downloadUrl: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  storagePath?: string;
};

type VerificationMediaUploadMeta = CertificateUploadMeta;

type SubmitVerificationApplicationParams = {
  uid: string;
  requestedRole: RequestedRole;

  // Snapshot at submit time
  locationCity: string;
  locationArea: string;

  // Business
  artistName?: string;
  shopName: string;
  businessEmail: string;
  experience?: string;
  styles?: string[];
  bio?: string;
  profileImageUrl?: string;

  // Trust / portfolio
  idProof?: string;
  portfolioLink?: string;
  website?: string;
  portfolioImageCount?: number;
  portfolioReelCount?: number;
  portfolioImages?: VerificationMediaUploadMeta[];
  portfolioVideos?: VerificationMediaUploadMeta[];
  referralCode?: string;
  certDownloadUrls?: string[];
  certificates?: CertificateUploadMeta[];
  certStoragePaths?: string[]; // legacy fallback only

  // Financials (v1 strings)
  upiId?: string;
  bankDetails?: string;

  // Waitlist metadata
  waitlistName?: string;
  waitlistPhone?: string;
  waitlistEmail?: string;
  waitlistStudio?: string;
  waitlistStyles?: string[];
  waitlistExperience?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cleanMediaUploads = (items: VerificationMediaUploadMeta[]) => items
  .map((item) => ({
    downloadUrl: String(item?.downloadUrl || '').trim(),
    storagePath: String(item?.storagePath || '').trim(),
    fileName: String(item?.fileName || '').trim(),
    mimeType: String(item?.mimeType || '').trim(),
    size: Math.max(0, Number(item?.size || 0)),
  }))
  .filter((item) => item.downloadUrl && item.storagePath)
  .map((item) => {
    if (!/^https:\/\//i.test(item.downloadUrl) || /^data:|^blob:/i.test(item.downloadUrl)) {
      throw new Error('Verification media must use a Firebase Storage download URL.');
    }
    return item;
  });

export const submitVerificationApplication = async (params: SubmitVerificationApplicationParams) => {
  const {
    uid,
    requestedRole,
    locationCity,
    locationArea,
    artistName = '',
    shopName,
    businessEmail,
    idProof = '',
    experience = '',
    styles = [],
    bio = '',
    profileImageUrl = '',
    portfolioLink,
    website = '',
    portfolioImageCount = 0,
    portfolioReelCount = 0,
    portfolioImages = [],
    portfolioVideos = [],
    referralCode = '',
    certDownloadUrls,
    certificates,
    certStoragePaths,
    upiId = '',
    bankDetails = '',
    waitlistName = '',
    waitlistPhone = '',
    waitlistEmail = '',
    waitlistStudio = '',
    waitlistStyles = [],
    waitlistExperience = '',
  } = params;

  const cleanShopName = shopName.trim();
  const cleanBusinessEmail = businessEmail.trim();
  const cleanArtistName = artistName.trim();
  const cleanIdProof = idProof.trim();
  const cleanExperience = experience.trim();
  const cleanBio = bio.trim();
  const cleanProfileImageUrl = profileImageUrl.trim();
  const cleanPortfolioLink = String(portfolioLink || '').trim();
  const cleanWebsite = String(website || '').trim();
  const cleanReferralCode = String(referralCode || '').trim().toUpperCase();
  const cleanStyles = Array.isArray(styles) ? styles.map((item) => String(item).trim()).filter(Boolean) : [];
  const cleanPortfolioImages = Array.isArray(portfolioImages) ? cleanMediaUploads(portfolioImages) : [];
  const cleanPortfolioVideos = Array.isArray(portfolioVideos) ? cleanMediaUploads(portfolioVideos) : [];
  const directUrls = Array.isArray(certDownloadUrls) ? certDownloadUrls.map((s) => String(s).trim()).filter(Boolean) : [];
  const certificateMeta = Array.isArray(certificates)
    ? certificates
        .map((item) => ({
          downloadUrl: String(item.downloadUrl || '').trim(),
          fileName: String(item.fileName || '').trim(),
          mimeType: String(item.mimeType || '').trim(),
          size: Number(item.size || 0),
          storagePath: String(item.storagePath || '').trim(),
        }))
        .filter((item) => item.downloadUrl)
    : directUrls.map((downloadUrl) => ({ downloadUrl }));
  const legacyCertPaths = Array.isArray(certStoragePaths) ? certStoragePaths.map((s) => String(s).trim()).filter(Boolean) : [];

  if (!uid) throw new Error('Missing uid.');
  if (!cleanArtistName) throw new Error('Artist name is required.');
  if (!cleanShopName) throw new Error('Studio/Shop name is required.');
  if (!cleanBusinessEmail || !emailPattern.test(cleanBusinessEmail)) throw new Error('Enter a valid email.');
  if (!cleanExperience) throw new Error('Experience is required.');
  if (cleanStyles.length < 1) throw new Error('At least one tattoo style is required.');
  if (!cleanBio) throw new Error('Bio is required.');
  if (!cleanProfileImageUrl) throw new Error('Profile image is required.');
  if (!cleanPortfolioLink) throw new Error('Instagram or portfolio link is required.');
  const verifiedImageCount = Math.max(Number(portfolioImageCount) || 0, cleanPortfolioImages.length);
  const verifiedVideoCount = Math.max(Number(portfolioReelCount) || 0, cleanPortfolioVideos.length);
  if (verifiedImageCount < 3) throw new Error('Upload at least 3 portfolio tattoo images.');
  if (verifiedVideoCount < 1) throw new Error('Upload at least 1 tattoo reel/video.');

  const city = locationCity.trim();
  const area = locationArea.trim();
  if (!city || !area) throw new Error('Location is required.');

  const batch = writeBatch(db);

  batch.set(
    doc(db, 'verifications', uid),
    {
      uid,
      requestedRole,
      status: 'pending_verification',

      locationCity: city,
      locationArea: area,

      shopName: cleanShopName,
      artistName: cleanArtistName,
      businessEmail: cleanBusinessEmail,
      idProof: cleanIdProof,
      experience: cleanExperience,
      styles: cleanStyles,
      bio: cleanBio,
      profileImageUrl: cleanProfileImageUrl,
      portfolioLink: cleanPortfolioLink,
      website: cleanWebsite,
      portfolioImageCount: verifiedImageCount,
      portfolioReelCount: verifiedVideoCount,
      portfolioImages: cleanPortfolioImages,
      portfolioVideos: cleanPortfolioVideos,
      referralCode: cleanReferralCode,
      certDownloadUrls: certificateMeta.map((item) => item.downloadUrl),
      certificates: certificateMeta,
      certificateUrl: certificateMeta[0]?.downloadUrl ?? directUrls[0] ?? '',
      certificateMeta: certificateMeta[0] ?? null,
      certificateReviewStatus: 'pending',
      legacyCertStoragePaths: legacyCertPaths,
      upiId: String(upiId || '').trim(),
      bankDetails: String(bankDetails || '').trim(),

      submittedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    doc(db, 'users', uid),
    {
      uid,
      requestedRole,
      verificationStatus: 'pending_verification',
      verificationRejectReason: '',
      foundingReferralCode: cleanReferralCode,
      certificateUrl: certificateMeta[0]?.downloadUrl ?? directUrls[0] ?? '',
      certificateMeta: certificateMeta[0] ?? null,
      certificateReviewStatus: 'pending',
      verifiedPro: false,
      authorizedSeller: false,
      setupComplete: true,
      verificationUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const cityKey = city.toLowerCase();
  if (requestedRole === 'artist' && cityKey && cityKey !== 'chennai') {
    batch.set(
      doc(collection(db, 'artistsWaitlist'), uid),
      {
        id: uid,
        artistId: uid,
        name: String(waitlistName || cleanShopName || uid).trim(),
        phone: String(waitlistPhone || '').trim(),
        email: String(waitlistEmail || cleanBusinessEmail || '').trim(),
        city,
        studio: String(waitlistStudio || cleanShopName || '').trim(),
        styles: Array.isArray(waitlistStyles) ? waitlistStyles.map((item) => String(item).trim()).filter(Boolean) : [],
        experience: String(waitlistExperience || '').trim(),
        instagram: cleanPortfolioLink,
        website: cleanWebsite,
        createdAt: serverTimestamp(),
        source: 'artist_onboarding',
      },
      { merge: true },
    );
  }

  await batch.commit();
};
