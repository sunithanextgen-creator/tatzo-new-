import { doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import type { RequestedRole, VerificationStatus } from '../types/app';

type SubmitVerificationApplicationParams = {
  uid: string;
  requestedRole: RequestedRole;

  // Snapshot at submit time
  locationCity: string;
  locationArea: string;

  // Business
  shopName: string;
  businessEmail: string;

  // Trust/KYC (v1)
  // Mandatory: Aadhar/PAN text. Certificates are optional.
  idProof: string;
  portfolioLink: string;
  certStoragePaths?: string[];

  // Financials (v1 strings)
  upiId?: string;
  bankDetails?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const submitVerificationApplication = async (params: SubmitVerificationApplicationParams) => {
  const {
    uid,
    requestedRole,
    locationCity,
    locationArea,
    shopName,
    businessEmail,
    idProof,
    portfolioLink,
    certStoragePaths,
    upiId = '',
    bankDetails = '',
  } = params;

  const cleanShopName = shopName.trim();
  const cleanBusinessEmail = businessEmail.trim();
  const cleanIdProof = idProof.trim();

  if (!uid) throw new Error('Missing uid.');
  if (!cleanShopName) throw new Error('Studio/Shop name is required.');
  if (!cleanBusinessEmail || !emailPattern.test(cleanBusinessEmail)) throw new Error('Enter a valid email.');
  if (!cleanIdProof) throw new Error('Aadhar/PAN is required.');

  const city = locationCity.trim();
  const area = locationArea.trim();
  if (!city || !area) throw new Error('Location is required.');

  const certs = Array.isArray(certStoragePaths)
    ? certStoragePaths.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const batch = writeBatch(db);

  batch.set(
    doc(db, 'verifications', uid),
    {
      uid,
      requestedRole,
      status: 'pending' as VerificationStatus,

      locationCity: city,
      locationArea: area,

      shopName: cleanShopName,
      businessEmail: cleanBusinessEmail,
      idProof: cleanIdProof,
      portfolioLink: String(portfolioLink || '').trim(),
      certStoragePaths: certs,
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
      requestedRole,
      verificationStatus: 'pending' as VerificationStatus,
      verificationRejectReason: '',
      verificationUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();
};
