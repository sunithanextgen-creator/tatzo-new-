import * as DocumentPicker from 'expo-document-picker';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../config/firebaseConfig';
import { logCrashlyticsError } from './crashlytics';

export type PickedMedia = {
  uri: string;
  name: string;
  mimeType: string;
  blob?: Blob;
};

export type UploadedMedia = {
  downloadUrl: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  size: number;
};

export type UploadedImage = UploadedMedia;
export type UploadedCertificate = UploadedMedia;

const MB = 1024 * 1024;
export const MAX_IMAGE_BYTES = 5 * MB;
export const MAX_VIDEO_BYTES = 30 * MB;
export const MAX_CERTIFICATE_PDF_BYTES = 10 * MB;

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_VIDEO_TYPES = new Set(['video/mp4']);
const ALLOWED_CERTIFICATE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const PROFILE_IMAGE_FILE_NAME = 'profile-image.jpg';

const sanitizeFileName = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80);

const sanitizeStoragePath = (value: string) =>
  value
    .replace(/\\+/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/');

const withCacheBust = (url: string) => `${url}${url.includes('?') ? '&' : '?'}v=${Date.now()}`;

const uriToBlobWithXhr = (uri: string): Promise<Blob> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onerror = () => reject(new Error('Could not read file.'));
    xhr.onload = () => resolve(xhr.response);
    xhr.responseType = 'blob';
    xhr.open('GET', uri, true);
    xhr.send(null);
  });

const uriToBlob = async (uri: string): Promise<Blob> => {
  try {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('Could not read file.');
    return await response.blob();
  } catch {
    return uriToBlobWithXhr(uri);
  }
};

const normalizeMimeType = (mimeType?: string) => String(mimeType || '').trim().toLowerCase();

const ensureImageType = (mimeType: string) => {
  const cleanType = normalizeMimeType(mimeType);
  if (!ALLOWED_IMAGE_TYPES.has(cleanType)) {
    throw new Error('Please select a JPG, PNG, or WebP image.');
  }
  return cleanType;
};

const ensureVideoType = (mimeType: string) => {
  const cleanType = normalizeMimeType(mimeType);
  if (!ALLOWED_VIDEO_TYPES.has(cleanType)) {
    throw new Error('Please select an MP4 video.');
  }
  return cleanType;
};

const ensureCertificateType = (mimeType: string) => {
  const cleanType = normalizeMimeType(mimeType);
  if (!ALLOWED_CERTIFICATE_TYPES.has(cleanType)) {
    throw new Error('Please upload a JPG, PNG, WebP, or PDF certificate file.');
  }
  return cleanType;
};

const pickSingleMediaFromDevice = async (params: {
  type: string | string[];
  fallbackName: string;
  fallbackMimeType: string;
  validate: (mimeType: string) => string;
}): Promise<PickedMedia | null> => {
  const result = await DocumentPicker.getDocumentAsync({
    type: params.type,
    multiple: false,
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  const name = sanitizeFileName(String(asset.name || params.fallbackName));
  const mimeType = params.validate(String(asset.mimeType || params.fallbackMimeType));

  return {
    uri: asset.uri,
    name,
    mimeType,
    blob: (asset as any).file instanceof Blob ? ((asset as any).file as Blob) : undefined,
  };
};

const uploadPickedMedia = async (params: {
  uri: string;
  fileName: string;
  folderPath: string;
  storagePath?: string;
  mimeType?: string;
  blob?: Blob;
  maxBytes: number;
  validate: (mimeType: string) => string;
  kindLabel: string;
}): Promise<UploadedMedia> => {
  const safeFolder = sanitizeStoragePath(String(params.folderPath || 'uploads'));
  const safeName = sanitizeFileName(params.fileName || `${params.kindLabel}_${Date.now()}`);
  const finalPath = params.storagePath
    ? sanitizeStoragePath(params.storagePath)
    : `${safeFolder}/${Date.now()}_${safeName}`;

  const blob = params.blob ?? (await uriToBlob(params.uri));
  const contentType = params.validate(params.mimeType || blob.type || 'application/octet-stream');

  if (blob.size > params.maxBytes) {
    const maxMb = Math.floor(params.maxBytes / MB);
    throw new Error(`${params.kindLabel} is too large. Please upload below ${maxMb} MB.`);
  }

  const storageRef = ref(storage, finalPath);
  try {
    await uploadBytes(storageRef, blob, { contentType });
  } catch (error: any) {
    const code = String(error?.code ?? '');
    void logCrashlyticsError(error, { source: 'media_upload', storagePath: finalPath, kind: params.kindLabel, code });
    if (code.includes('unauthorized')) {
      throw new Error(`Upload permission denied (${code || 'storage/unauthorized'}) at ${finalPath}. Please sign in again and deploy latest storage rules.`);
    }
    throw new Error(error?.message ? `${error.message} (${finalPath})` : `${params.kindLabel} upload failed at ${finalPath}. Please try again.`);
  }

  const downloadUrl = await getDownloadURL(storageRef);

  return {
    downloadUrl,
    storagePath: finalPath,
    fileName: safeName,
    mimeType: contentType,
    size: blob.size,
  };
};

export const prepareProfileImageForUpload = async (picked: PickedMedia): Promise<PickedMedia> => {
  const mimeType = ensureImageType(picked.mimeType);
  const blob = picked.blob ?? (await uriToBlob(picked.uri));

  if (blob.size > MAX_IMAGE_BYTES) {
    throw new Error('Profile image is too large. Please upload below 5 MB.');
  }

  return {
    ...picked,
    name: PROFILE_IMAGE_FILE_NAME,
    mimeType,
    blob,
  };
};

export const pickSingleImageFromDevice = async (): Promise<PickedMedia | null> =>
  pickSingleMediaFromDevice({
    type: Array.from(ALLOWED_IMAGE_TYPES),
    fallbackName: `image_${Date.now()}.jpg`,
    fallbackMimeType: 'image/jpeg',
    validate: ensureImageType,
  });

export const pickSingleVideoFromDevice = async (): Promise<PickedMedia | null> =>
  pickSingleMediaFromDevice({
    type: 'video/mp4',
    fallbackName: `video_${Date.now()}.mp4`,
    fallbackMimeType: 'video/mp4',
    validate: ensureVideoType,
  });

export const pickSingleCertificateFromDevice = async (): Promise<PickedMedia | null> =>
  pickSingleMediaFromDevice({
    type: Array.from(ALLOWED_CERTIFICATE_TYPES),
    fallbackName: 'certificate_' + Date.now() + '.jpg',
    fallbackMimeType: 'image/jpeg',
    validate: ensureCertificateType,
  });

export const uploadPickedImage = async (params: {
  uri: string;
  fileName: string;
  folderPath: string;
  storagePath?: string;
  mimeType?: string;
  blob?: Blob;
}): Promise<UploadedImage> =>
  uploadPickedMedia({
    ...params,
    maxBytes: MAX_IMAGE_BYTES,
    validate: ensureImageType,
    kindLabel: 'Image',
  });

export const uploadProfileImage = async (params: {
  picked: PickedMedia;
  storagePath: string;
}): Promise<UploadedImage> => {
  const prepared = await prepareProfileImageForUpload(params.picked);
  const uploaded = await uploadPickedImage({
    uri: prepared.uri,
    fileName: PROFILE_IMAGE_FILE_NAME,
    mimeType: prepared.mimeType,
    blob: prepared.blob,
    folderPath: 'profile-images',
    storagePath: params.storagePath,
  });

  return { ...uploaded, downloadUrl: withCacheBust(uploaded.downloadUrl) };
};

export const uploadPickedVideo = async (params: {
  uri: string;
  fileName: string;
  folderPath: string;
  mimeType?: string;
  blob?: Blob;
}): Promise<UploadedMedia> =>
  uploadPickedMedia({
    ...params,
    maxBytes: MAX_VIDEO_BYTES,
    validate: ensureVideoType,
    kindLabel: 'Video',
  });

export const uploadPickedCertificate = async (params: {
  uri: string;
  fileName: string;
  folderPath: string;
  mimeType?: string;
  blob?: Blob;
}): Promise<UploadedCertificate> => {
  const contentType = ensureCertificateType(params.mimeType || params.blob?.type || 'application/octet-stream');
  return uploadPickedMedia({
    ...params,
    mimeType: contentType,
    maxBytes: contentType === 'application/pdf' ? MAX_CERTIFICATE_PDF_BYTES : MAX_IMAGE_BYTES,
    validate: ensureCertificateType,
    kindLabel: contentType === 'application/pdf' ? 'Certificate PDF' : 'Certificate image',
  });
};
