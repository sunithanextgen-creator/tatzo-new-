import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { updateProfile } from 'firebase/auth';
import { auth, db } from '../../config/firebaseConfig';
import { collection, doc, getCountFromServer, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { RequestedRole, UserProfile, UserRole, VerificationStatus } from '../../types/app';
import { getUserProfile } from '../../services/profile';
import { syncUserProfile } from '../../services/userProfile';
import { submitVerificationApplication } from '../../services/verification';
import { pickSingleCertificateFromDevice, pickSingleImageFromDevice, uploadPickedCertificate, uploadProfileImage, type UploadedCertificate, type UploadedImage } from '../../services/mediaUpload';
import SettingsModal from './SettingsModal';
import ArtistProSection from './ArtistProSection';
import StatusBanner from '../verification/StatusBanner';
import SkeletonBlock from '../ui/SkeletonBlock';

type ProfileModalProps = {
  visible: boolean;
  onClose: () => void;
  onSignOut: () => Promise<void>;
  onOpenPayments?: () => void;
};

type ProfileStats = {
  bookingsCount: number;
  followingCount: number;
  likedPostsCount: number;
};

type RecentBookingSummary = {
  artistName: string;
  dateISO: string;
  status: string;
};

type SavedPostRow = {
  id: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  caption?: string | null;
};

type ApplyDraft = {
  shopName: string;
  businessEmail: string;
  idProof: string;
  portfolioLink: string;
  experience: string;
  stylesText: string;
  referralCode: string;
  upiId: string;
  bankDetails: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  const casted = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof casted?.toMillis === 'function') return casted.toMillis();
  if (typeof casted?.seconds === 'number') return casted.seconds * 1000 + Math.floor((casted.nanoseconds ?? 0) / 1_000_000);
  return 0;
};

const formatJoinedDate = (value: unknown) => {
  const millis = toMillis(value);
  if (!millis) return 'Joined recently';
  return 'Joined ' + new Date(millis).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
};

const ProfileModal = ({ visible, onClose, onSignOut, onOpenPayments }: ProfileModalProps) => {
  const { theme, mode, toggleMode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const uid = auth.currentUser?.uid ?? null;
  const email = auth.currentUser?.email ?? '';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileStats, setProfileStats] = useState<ProfileStats>({ bookingsCount: 0, followingCount: 0, likedPostsCount: 0 });
  const [recentBooking, setRecentBooking] = useState<RecentBookingSummary | null>(null);
  const [savedPosts, setSavedPosts] = useState<SavedPostRow[]>([]);
  const [portfolioCounts, setPortfolioCounts] = useState({ images: 0, reels: 0 });

  const [displayName, setDisplayName] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [locationArea, setLocationArea] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [profileImageMeta, setProfileImageMeta] = useState<UploadedImage | null>(null);

  const [locationEditorOpen, setLocationEditorOpen] = useState(false);
  const [pendingApplyRole, setPendingApplyRole] = useState<RequestedRole | null>(null);

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyRole, setApplyRole] = useState<RequestedRole>('artist');
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [applyCertUploading, setApplyCertUploading] = useState(false);
  const [applyCerts, setApplyCerts] = useState<UploadedCertificate[]>([]);
  const [applyDraft, setApplyDraft] = useState<ApplyDraft>({
    shopName: '',
    businessEmail: '',
    idProof: '',
    portfolioLink: '',
    experience: '',
    stylesText: '',
    referralCode: '',
    upiId: '',
    bankDetails: '',
  });

  const role: UserRole = (profile?.role ?? 'user') as UserRole;
  const verificationStatus: VerificationStatus = (profile?.verificationStatus ?? 'unsubmitted') as VerificationStatus;
  const requestedRole = profile?.requestedRole ?? null;
  const locationMissing = !locationCity.trim() || !locationArea.trim();
  const locationLocked = verificationStatus === 'pending' || verificationStatus === 'pending_verification';
  const joinedLabel = formatJoinedDate(profile?.createdAt);
  const profileLocationLabel = [locationArea.trim(), locationCity.trim()].filter(Boolean).join(', ');

  useEffect(() => {
    if (!visible) return;

    // Reset UI state each open.
    setSettingsOpen(false);
    setApplyOpen(false);
    setLocationEditorOpen(false);
    setPendingApplyRole(null);
    setApplyCertUploading(false);
    setApplyCerts([]);

    if (!uid) {
      setProfile(null);
      setDisplayName(auth.currentUser?.displayName ?? '');
      setLocationCity('');
      setLocationArea('');
      setBio('');
      setPhone('');
      setProfileImageUrl('');
      setProfileImageMeta(null);
      return;
    }

    let active = true;
    setLoading(true);

    (async () => {
      try {
        const data = await getUserProfile(uid);
        if (!active) return;
        setProfile(data);

        setDisplayName(data?.displayName ?? auth.currentUser?.displayName ?? '');
        setLocationCity(data?.locationCity ?? '');
        setLocationArea(data?.locationArea ?? '');

        // Legacy fallback: location="City, Area"
        if ((!data?.locationCity || !data?.locationArea) && data?.location) {
          const parts = String(data.location)
            .split(',')
            .map((p) => p.trim());
          if (parts[0] && !data?.locationCity) setLocationCity(parts[0]);
          if (parts[1] && !data?.locationArea) setLocationArea(parts[1]);
        }

        setBio(data?.bio ?? '');
        setPhone(data?.phone ?? '');
        setProfileImageUrl(String(data?.profileImageUrl ?? ''));
        setProfileImageMeta((data?.profileImageMeta as UploadedImage | undefined) ?? null);

        // Draft defaults
        setApplyDraft((prev) => ({
          ...prev,
          businessEmail: prev.businessEmail || (data?.email ?? auth.currentUser?.email ?? ''),
        }));
      } catch (e: any) {
        if (!active) return;
        Alert.alert('Tatzo', e?.message ?? 'Could not load profile.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [uid, visible]);

  useEffect(() => {
    if (!visible || !uid) return;
    let active = true;

    (async () => {
      try {
        const [bookingsCountSnap, followingCountSnap, legacyFollowingSnap, recentBookingSnap] = await Promise.all([
          getCountFromServer(query(collection(db, 'bookings'), where('userUid', '==', uid))),
          getCountFromServer(query(collection(db, 'users', uid, 'following'))),
          getCountFromServer(query(collection(db, 'follows'), where('fromUid', '==', uid))),
          getDocs(query(collection(db, 'bookings'), where('userUid', '==', uid), limit(1))).catch(() => null),
        ]);

        if (!active) return;
        setProfileStats({
          bookingsCount: bookingsCountSnap.data().count,
          followingCount: Math.max(followingCountSnap.data().count, legacyFollowingSnap.data().count),
          likedPostsCount: 0,
        });

        const firstBooking = recentBookingSnap?.docs?.[0];
        if (firstBooking) {
          const booking = firstBooking.data() as any;
          setRecentBooking({
            artistName: String(booking.artistName ?? 'Artist'),
            dateISO: String(booking.dateISO ?? ''),
            status: String(booking.status ?? ''),
          });
        } else {
          setRecentBooking(null);
        }
      } catch {
        if (active) {
          setProfileStats({ bookingsCount: 0, followingCount: 0, likedPostsCount: 0 });
          setRecentBooking(null);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [uid, visible]);

  useEffect(() => {
    if (!visible || !uid) {
      setSavedPosts([]);
      setPortfolioCounts({ images: 0, reels: 0 });
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'users', uid, 'savedPosts'), orderBy('savedAt', 'desc')),
      (snap) => setSavedPosts(snap.docs.map((row) => ({ id: row.id, ...(row.data() as any) }) as SavedPostRow)),
      () => setSavedPosts([]),
    );
    return () => unsub();
  }, [uid, visible]);

  useEffect(() => {
    if (!visible || !uid) {
      setPortfolioCounts({ images: 0, reels: 0 });
      return;
    }

    let active = true;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'posts'), where('artistUid', '==', uid), where('status', '==', 'active')));
        if (!active) return;
        const rows = snap.docs.map((row) => row.data() as any);
        const images = rows.filter((row) => Boolean(row.imageUrl?.trim())).length;
        const reels = rows.filter((row) => Boolean(row.videoUrl?.trim())).length;
        setPortfolioCounts({ images, reels });
      } catch {
        if (active) setPortfolioCounts({ images: 0, reels: 0 });
      }
    })();

    return () => {
      active = false;
    };
  }, [uid, visible]);

  const close = () => {
    setApplyOpen(false);
    setLocationEditorOpen(false);
    setPendingApplyRole(null);
    setApplyCertUploading(false);
    setApplyCerts([]);
    onClose();
  };

  const patchLocalProfile = (patch: Partial<UserProfile>) => {
    setProfile((prev) => ({ ...(prev ?? {}), ...patch }));
  };

  const handleSaveProfile = async () => {
    if (!uid || !auth.currentUser) return;

    const name = displayName.trim();
    if (!name) {
      Alert.alert('Tatzo', 'Enter your name.');
      return;
    }
    if (uploadingProfileImage) {
      Alert.alert('Tatzo', 'Please wait. Profile image upload is still in progress.');
      return;
    }

    if (bio.length > 140) {
      Alert.alert('Tatzo', 'Bio is too long.');
      return;
    }

    if (locationLocked && locationEditorOpen) {
      Alert.alert('Tatzo', 'Location is locked while verification is pending.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: name });

      const city = locationCity.trim();
      const area = locationArea.trim();

      await syncUserProfile(auth.currentUser, {
        displayName: name,
        phone: phone.trim(),
        bio: bio.trim(),
        profileImageUrl: profileImageUrl.trim(),
        profileImageMeta: profileImageMeta ?? undefined,
        locationCity: city,
        locationArea: area,
        location: city && area ? `${city}, ${area}` : '',
      });

      patchLocalProfile({
        displayName: name,
        phone: phone.trim(),
        bio: bio.trim(),
        profileImageUrl: profileImageUrl.trim(),
        profileImageMeta: profileImageMeta ?? undefined,
        locationCity: city,
        locationArea: area,
        location: city && area ? `${city}, ${area}` : '',
      });

      // If user tapped Apply earlier, continue automatically once location is saved.
      if (pendingApplyRole && city && area) {
        setApplyRole(pendingApplyRole);
        setPendingApplyRole(null);
        setApplyCertUploading(false);
        setApplyCerts([]);
        setApplyOpen(true);
      } else {
        Alert.alert('Tatzo', 'Profile updated.');
      }
    } catch (e: any) {
      Alert.alert('Tatzo', e?.code ? `${e.code}: ${e?.message ?? ''}` : (e?.message ?? 'Could not save profile.'));
    } finally {
      setSaving(false);
    }
  };

  const openApply = (nextRole: RequestedRole) => {
    if (verificationStatus === 'pending' || verificationStatus === 'pending_verification') return;

    if (locationMissing) {
      setPendingApplyRole(nextRole);
      Alert.alert('Tatzo', 'Set your location first to continue.');
      setLocationEditorOpen(true);
      return;
    }

    setApplyRole(nextRole);
    setApplyOpen(true);
  };

  const handlePickCertificate = async () => {
    if (!uid || applyCertUploading || applySubmitting) return;

    try {
      setApplyCertUploading(true);
      const picked = await pickSingleCertificateFromDevice();
      if (!picked) return;

      const uploaded = await uploadPickedCertificate({
        uri: picked.uri,
        fileName: picked.name,
        mimeType: picked.mimeType,
        blob: picked.blob,
        folderPath: `verifications/${uid}/certificates`,
      });

      setApplyCerts((prev) => [...prev, uploaded].slice(-3));
      Alert.alert('Tatzo', 'Certificate file uploaded.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not upload certificate file.');
    } finally {
      setApplyCertUploading(false);
    }
  };

  const removeCertificate = (storagePath: string) => {
    setApplyCerts((prev) => prev.filter((item) => item.storagePath !== storagePath));
  };

  const handlePickProfileImage = async () => {
    if (!uid || uploadingProfileImage || saving) return;

    try {
      setUploadingProfileImage(true);
      const picked = await pickSingleImageFromDevice();
      if (!picked) return;

      const uploaded = await uploadProfileImage({
        picked,
        storagePath: `users/${uid}/profile/profile-image.jpg`,
      });

      setProfileImageUrl(uploaded.downloadUrl);
      setProfileImageMeta(uploaded);
      patchLocalProfile({ profileImageUrl: uploaded.downloadUrl, profileImageMeta: uploaded });

      const profileImagePayload = {
        uid,
        profileImageUrl: uploaded.downloadUrl,
        profileImageMeta: uploaded,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', uid), profileImagePayload, { merge: true });
      if (role === 'artist' && verificationStatus === 'approved') {
        await setDoc(
          doc(db, 'artists', uid),
          { ...profileImagePayload, role: 'artist', verificationStatus: 'approved', isVisible: true },
          { merge: true },
        );
      }

      Alert.alert('Tatzo', 'Profile photo updated and saved.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not upload profile photo.');
    } finally {
      setUploadingProfileImage(false);
    }
  };

  const handleSubmitApplication = async () => {
    if (!uid) return;

    const shopName = applyDraft.shopName.trim();
    const businessEmail = applyDraft.businessEmail.trim();
    const idProof = applyDraft.idProof.trim();
    const artistDisplayName = displayName.trim() || auth.currentUser?.displayName || '';
    const stylesList = applyDraft.stylesText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    if (!artistDisplayName) {
      Alert.alert('Tatzo', 'Artist name is required. Add your profile name first.');
      return;
    }
    if (!shopName) {
      Alert.alert('Tatzo', 'Enter your shop / studio name.');
      return;
    }
    if (!businessEmail || !emailPattern.test(businessEmail)) {
      Alert.alert('Tatzo', 'Enter a valid email.');
      return;
    }
    if (!applyDraft.experience.trim()) {
      Alert.alert('Tatzo', 'Experience is required.');
      return;
    }
    if (stylesList.length < 1) {
      Alert.alert('Tatzo', 'Add at least one tattoo style.');
      return;
    }
    if (!bio.trim()) {
      Alert.alert('Tatzo', 'Bio is required.');
      return;
    }
    if (!profileImageUrl.trim()) {
      Alert.alert('Tatzo', 'Profile image is required.');
      return;
    }
    if (applyCertUploading) {
      Alert.alert('Tatzo', 'Please wait. Certificate file upload is still in progress.');
      return;
    }
    if (portfolioCounts.images < 3 || portfolioCounts.reels < 1 || !applyDraft.portfolioLink.trim()) {
      Alert.alert('Tatzo', 'Add at least 3 portfolio images, 1 reel/video, and your Instagram/portfolio link first.');
      return;
    }
    const city = locationCity.trim();
    const area = locationArea.trim();
    if (!city || !area) {
      Alert.alert('Tatzo', 'Set your location first.');
      setLocationEditorOpen(true);
      return;
    }

    setApplySubmitting(true);
    try {
      await submitVerificationApplication({
        uid,
        requestedRole: applyRole,
        locationCity: city,
        locationArea: area,
        artistName: artistDisplayName,
        shopName,
        businessEmail,
        idProof,
        experience: applyDraft.experience.trim(),
        styles: stylesList,
        bio: bio.trim(),
        profileImageUrl: profileImageUrl.trim(),
        portfolioLink: applyDraft.portfolioLink.trim(),
        portfolioImageCount: portfolioCounts.images,
        portfolioReelCount: portfolioCounts.reels,
        referralCode: applyDraft.referralCode.trim(),
        certDownloadUrls: applyCerts.map((item) => item.downloadUrl),
        certificates: applyCerts.map((item) => ({
          downloadUrl: item.downloadUrl,
          fileName: item.fileName,
          mimeType: item.mimeType,
          size: item.size,
          storagePath: item.storagePath,
        })),
        upiId: applyDraft.upiId.trim(),
        bankDetails: applyDraft.bankDetails.trim(),
        waitlistName: displayName.trim(),
        waitlistPhone: phone.trim(),
        waitlistEmail: email.trim(),
        waitlistStudio: shopName,
        waitlistStyles: stylesList,
        waitlistExperience: applyDraft.experience.trim(),
      });

      patchLocalProfile({
        requestedRole: applyRole,
        verificationStatus: 'pending_verification',
        verificationRejectReason: '',
        verifiedPro: false,
        authorizedSeller: false,
      });

      setApplyOpen(false);
      Alert.alert('Tatzo', 'Verification submitted. Admin review is in progress.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.code ? `${e.code}: ${e?.message ?? ''}` : (e?.message ?? 'Could not submit application.'));
    } finally {
      setApplySubmitting(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Tatzo', 'Sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void onSignOut() },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <Pressable onPress={close} style={styles.iconBtn} accessibilityRole="button">
            <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <View style={styles.loadingCard}>
              <SkeletonBlock width={82} height={82} radius={41} />
              <View style={styles.loadingCopy}>
                <SkeletonBlock width="62%" height={16} />
                <SkeletonBlock width="48%" height={12} />
                <SkeletonBlock width="86%" height={12} />
                <SkeletonBlock width="72%" height={12} />
              </View>
              <View style={styles.loadingActions}>
                <SkeletonBlock width="100%" height={42} radius={14} />
                <SkeletonBlock width="100%" height={42} radius={14} />
              </View>
            </View>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <StatusBanner
              status={verificationStatus}
              requestedRole={requestedRole}
              rejectReason={profile?.verificationFeedback || profile?.verificationRejectReason}
              onPressAction={verificationStatus === 'rejected' || verificationStatus === 'needs_more_samples' ? () => openApply((requestedRole as any) || 'artist') : undefined}
            />

            <View style={styles.profileHeroCard}>
              <View style={styles.profileHeroTop}>
                {profileImageUrl.trim() ? (
                  <Image source={{ uri: profileImageUrl.trim() }} style={styles.profileHeroAvatar} resizeMode="cover" />
                ) : (
                  <LinearGradient colors={[theme.colors.accentStrong, theme.colors.accent]} style={styles.profileHeroAvatarFallback}>
                    <Text style={styles.profileHeroInitial}>{(displayName.trim() || email || 'U').slice(0, 1).toUpperCase()}</Text>
                  </LinearGradient>
                )}
                <View style={styles.profileHeroCopy}>
                  <Text numberOfLines={1} style={styles.profileHeroName}>{displayName.trim() || 'Tatzo User'}</Text>
                  <Text numberOfLines={1} style={styles.profileHeroEmail}>{email || 'Email not available'}</Text>
                  <Text numberOfLines={1} style={styles.profileHeroMeta}>{profileLocationLabel || 'Location will be updated soon'} | {joinedLabel}</Text>
                </View>
              </View>
              <Text style={styles.profileHeroBio}>{bio.trim() || 'Add a short bio so artists understand your tattoo taste and preferences.'}</Text>
              <View style={styles.profileStatsGrid}>
                <View style={styles.profileStatPill}><Text style={styles.profileStatValue}>{profileStats.bookingsCount}</Text><Text style={styles.profileStatLabel}>Bookings</Text></View>
                <View style={styles.profileStatPill}><Text style={styles.profileStatValue}>{profileStats.followingCount}</Text><Text style={styles.profileStatLabel}>Following</Text></View>
              </View>
              <View style={styles.recentBookingCard}>
                <Text style={styles.recentBookingTitle}>Recent booking</Text>
                <Text style={styles.recentBookingText}>
                  {recentBooking ? [recentBooking.artistName, recentBooking.dateISO || 'Date pending', recentBooking.status.replace(/_/g, ' ')].join(' | ') : 'No booking history yet.'}
                </Text>
                {onOpenPayments ? (
                  <Pressable
                    onPress={() => {
                      close();
                      onOpenPayments();
                    }}
                    style={styles.paymentHistoryBtn}
                    accessibilityRole="button"
                  >
                    <Ionicons name="receipt-outline" size={16} color={theme.colors.accent} />
                    <Text style={styles.paymentHistoryText}>Open payment history</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>

            <View style={styles.savedSectionCard}>
              <View style={styles.savedSectionHead}>
                <Text style={styles.sectionTitle}>Saved</Text>
                <Text style={styles.savedSectionCount}>{savedPosts.length}</Text>
              </View>
              {savedPosts.length ? (
                <View style={styles.savedGrid}>
                  {savedPosts.slice(0, 6).map((item) => (
                    <View key={item.id} style={styles.savedTile}>
                      {item.imageUrl?.trim() ? (
                        <Image source={{ uri: item.imageUrl.trim() }} style={styles.savedTileImage} resizeMode="cover" />
                      ) : item.videoUrl?.trim() ? (
                        <View style={styles.savedTileVideo}>
                          <Ionicons name="play" size={18} color={theme.colors.textInverse} />
                        </View>
                      ) : (
                        <View style={styles.savedTileVideo}>
                          <Ionicons name="bookmark-outline" size={18} color={theme.colors.textInverse} />
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              ) : (
                <Text style={styles.helper}>Saved posts and reels from feed will appear here.</Text>
              )}
            </View>

            {locationMissing ? (
              <Pressable onPress={() => setLocationEditorOpen(true)} style={styles.banner} accessibilityRole="button">
                <View style={styles.bannerLeft}>
                  <Ionicons
                    name="location-outline"
                    size={18}
                    color={theme.mode === 'light' ? theme.colors.accentStrong : theme.colors.textInverse}
                  />
                  <View style={styles.bannerCopy}>
                    <Text style={styles.bannerTitle}>Complete your profile</Text>
                    <Text style={styles.bannerSub} numberOfLines={2}>
                      Set your location to unlock full features.
                    </Text>
                  </View>
                </View>
                <Text style={styles.bannerCta}>Set Location</Text>
              </Pressable>
            ) : null}

            <View style={styles.row}>
              <Text style={styles.label}>Name</Text>
              <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} nativeID="profileName" />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{email}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Profile Photo</Text>
              <View style={styles.profileImageRow}>
                {profileImageUrl.trim() ? (
                  <Image source={{ uri: profileImageUrl.trim() }} style={styles.profileAvatar} resizeMode="cover" />
                ) : (
                  <View style={styles.profileAvatarFallback}>
                    <Text style={styles.profileAvatarText}>{(displayName.trim() || email || 'U').slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                <Pressable
                  onPress={handlePickProfileImage}
                  disabled={uploadingProfileImage || saving}
                  style={[styles.uploadMiniBtn, (uploadingProfileImage || saving) && styles.inputDisabled]}
                  accessibilityRole="button"
                >
                  <Ionicons name="camera-outline" size={17} color={theme.colors.accent} />
                  <Text style={styles.uploadMiniText}>{uploadingProfileImage ? 'Uploading...' : 'Upload Photo'}</Text>
                </Pressable>
              </View>
              <Text style={styles.helper}>Square profile image, compressed before upload.</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Role</Text>
              <Text style={styles.value}>{String(role).toUpperCase()}</Text>
            </View>

            {locationEditorOpen ? (
              <View style={styles.row}>
                <Text style={styles.label}>Location (City)</Text>
                <TextInput
                  value={locationCity}
                  onChangeText={setLocationCity}
                  style={[styles.input, locationLocked && styles.inputDisabled]}
                  editable={!locationLocked}
                  nativeID="profileLocationCity"
                />
                <Text style={[styles.label, styles.labelAlt]}>Location (Area)</Text>
                <TextInput
                  value={locationArea}
                  onChangeText={setLocationArea}
                  style={[styles.input, locationLocked && styles.inputDisabled]}
                  editable={!locationLocked}
                  nativeID="profileLocationArea"
                />
                {locationLocked ? <Text style={styles.helper}>Location is locked while verification is pending.</Text> : null}
              </View>
            ) : null}

            <View style={styles.row}>
              <Text style={styles.label}>Phone</Text>
              <TextInput value={phone} onChangeText={setPhone} style={styles.input} nativeID="profilePhone" />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Bio</Text>
              <TextInput value={bio} onChangeText={setBio} style={[styles.input, styles.bio]} multiline nativeID="profileBio" />
              <Text style={styles.helper}>{bio.length}/140</Text>
            </View>

            {role === 'user' ? (
              <View style={styles.actionsBlock}>
                <Text style={styles.sectionTitle}>Upgrade</Text>

                <Pressable
                  disabled={verificationStatus === 'pending' || verificationStatus === 'pending_verification'}
                  onPress={() => openApply('artist')}
                  style={[styles.upgradeCard, (verificationStatus === 'pending' || verificationStatus === 'pending_verification') && styles.upgradeCardDisabled]}
                >
                  <View style={styles.upgradeLeft}>
                    <Ionicons
                      name="sparkles-outline"
                      size={18}
                      color={theme.mode === 'light' ? theme.colors.accentStrong : theme.colors.textInverse}
                    />
                    <View style={styles.upgradeTextBlock}>
                      <Text style={styles.upgradeTitle}>Become an Artist</Text>
                      <Text style={styles.upgradeSub} numberOfLines={2}>
                        Submit verification documents to unlock Artist Suite.
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.mode === 'light' ? theme.colors.accentStrong : theme.colors.textInverse}
                  />
                </Pressable>

                <Pressable
                  disabled={verificationStatus === 'pending' || verificationStatus === 'pending_verification'}
                  onPress={() => openApply('dealer')}
                  style={[styles.upgradeCard, (verificationStatus === 'pending' || verificationStatus === 'pending_verification') && styles.upgradeCardDisabled]}
                >
                  <View style={styles.upgradeLeft}>
                    <Ionicons
                      name="cart-outline"
                      size={18}
                      color={theme.mode === 'light' ? theme.colors.accentStrong : theme.colors.textInverse}
                    />
                    <View style={styles.upgradeTextBlock}>
                      <Text style={styles.upgradeTitle}>Become a Dealer</Text>
                      <Text style={styles.upgradeSub} numberOfLines={2}>
                        Apply as an authorized seller for B2B shop access.
                      </Text>
                    </View>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={18}
                    color={theme.mode === 'light' ? theme.colors.accentStrong : theme.colors.textInverse}
                  />
                </Pressable>

                {verificationStatus === 'pending' || verificationStatus === 'pending_verification' ? (
                  <Text style={styles.pendingNote}>Verification is in progress.</Text>
                ) : null}
              </View>
            ) : (
              <ArtistProSection uid={uid} role={role} profile={profile} onPatchProfile={patchLocalProfile} />
            )}

            <View style={styles.actions}>
              <Pressable onPress={toggleMode} style={styles.actionBtn} accessibilityRole="button">
                <Ionicons name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={18} color={theme.colors.accent} />
                <Text style={styles.actionText}>{mode === 'dark' ? 'Light theme' : 'Dark theme'}</Text>
              </Pressable>

              <Pressable onPress={() => setSettingsOpen(true)} style={styles.actionBtn} accessibilityRole="button">
                <Ionicons name="settings-outline" size={18} color={theme.colors.accent} />
                <Text style={styles.actionText}>Settings</Text>
              </Pressable>

              <Pressable onPress={handleSignOut} style={[styles.actionBtn, styles.dangerBtn]} accessibilityRole="button">
                <Ionicons name="log-out-outline" size={18} color={theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf'} />
                <Text style={[styles.actionText, styles.dangerText]}>Sign out</Text>
              </Pressable>
            </View>

            <Pressable disabled={saving} onPress={handleSaveProfile} style={[styles.saveBtn, saving && styles.saveBtnDisabled]} accessibilityRole="button">
              <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Modal visible={applyOpen} transparent animationType="fade" onRequestClose={() => setApplyOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setApplyOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.applySheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Apply: {applyRole.toUpperCase()}</Text>
            <Pressable onPress={() => setApplyOpen(false)} style={styles.iconBtn} accessibilityRole="button">
              <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.note}>Submit your professional details. Admin will review and approve.</Text>

            <View style={styles.row}>
              <Text style={styles.label}>Shop / Studio Name</Text>
              <TextInput
                value={applyDraft.shopName}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, shopName: t }))}
                style={styles.input}
                nativeID="applyShopName"
              />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Business Email</Text>
              <TextInput
                value={applyDraft.businessEmail}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, businessEmail: t }))}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                nativeID="applyBusinessEmail"
              />
              <Text style={styles.helper}>Any valid email is allowed (Gmail/Yahoo/etc).</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Aadhar / PAN (Optional)</Text>
              <TextInput
                value={applyDraft.idProof}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, idProof: t }))}
                style={styles.input}
                nativeID="applyIdProof"
              />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Experience</Text>
              <TextInput
                value={applyDraft.experience}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, experience: t }))}
                style={styles.input}
                placeholder="Example: 5 years"
                placeholderTextColor={theme.colors.textMuted}
                nativeID="applyExperience"
              />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Tattoo Styles</Text>
              <TextInput
                value={applyDraft.stylesText}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, stylesText: t }))}
                style={styles.input}
                placeholder="Black & Grey, Realism, Minimal"
                placeholderTextColor={theme.colors.textMuted}
                nativeID="applyStyles"
              />
              <Text style={styles.helper}>Separate styles with commas.</Text>
            </View>

            <View style={[styles.row, styles.certificateCard]}>
              <View style={styles.certificateHeaderRow}>
                <Ionicons name="ribbon-outline" size={18} color={theme.colors.accentStrong} />
                <Text style={styles.label}>Certificate File (Optional)</Text>
              </View>
              <Pressable
                disabled={applyCertUploading || applySubmitting}
                onPress={handlePickCertificate}
                style={[styles.uploadBtn, (applyCertUploading || applySubmitting) && styles.uploadBtnDisabled]}
                accessibilityRole="button"
              >
                <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.accentStrong} />
                <Text style={styles.uploadBtnText}>{applyCertUploading ? 'Uploading certificate...' : 'Upload Certificate File'}</Text>
              </Pressable>
              <Text style={styles.helper}>Optional for launch. Use JPG/PNG/WebP below 5 MB or PDF below 10 MB.</Text>
              {applyCerts.length ? (
                <View style={styles.fileList}>
                  {applyCerts.map((item) => (
                    <View key={item.storagePath} style={styles.fileRow}>
                      <Ionicons name="document-attach-outline" size={16} color={theme.colors.accentStrong} />
                      <Text style={styles.fileName} numberOfLines={1}>{item.fileName}</Text>
                      <Pressable onPress={() => removeCertificate(item.storagePath)} style={styles.fileRemove} accessibilityRole="button">
                        <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Instagram / Portfolio Link</Text>
              <TextInput
                value={applyDraft.portfolioLink}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, portfolioLink: t }))}
                style={styles.input}
                autoCapitalize="none"
                nativeID="applyPortfolio"
              />
              <Text style={styles.helper}>
                Need {Math.max(0, 3 - portfolioCounts.images)} more image posts and {Math.max(0, 1 - portfolioCounts.reels)} reel(s) before submit.
              </Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Founding / Referral Code (Optional)</Text>
              <TextInput
                value={applyDraft.referralCode}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, referralCode: t.toUpperCase() }))}
                style={styles.input}
                autoCapitalize="characters"
                placeholder="FOUNDER10-001"
                placeholderTextColor={theme.colors.textMuted}
                nativeID="applyReferralCode"
              />
              <Text style={styles.helper}>Admin will validate this code during review.</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>UPI ID (Optional)</Text>
              <TextInput
                value={applyDraft.upiId}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, upiId: t }))}
                style={styles.input}
                nativeID="applyUpi"
              />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Bank Details (Optional)</Text>
              <TextInput
                value={applyDraft.bankDetails}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, bankDetails: t }))}
                style={[styles.input, styles.multiline]}
                multiline
                nativeID="applyBank"
              />
            </View>

            <Pressable
              disabled={
                applySubmitting ||
                !displayName.trim() ||
                !profileImageUrl.trim() ||
                !bio.trim() ||
                !applyDraft.shopName.trim() ||
                !applyDraft.businessEmail.trim() ||
                !applyDraft.experience.trim() ||
                !applyDraft.stylesText.trim() ||
                portfolioCounts.images < 3 ||
                portfolioCounts.reels < 1 ||
                !applyDraft.portfolioLink.trim()
              }
              onPress={handleSubmitApplication}
              style={[styles.saveBtn, (
                applySubmitting ||
                !displayName.trim() ||
                !profileImageUrl.trim() ||
                !bio.trim() ||
                !applyDraft.shopName.trim() ||
                !applyDraft.businessEmail.trim() ||
                !applyDraft.experience.trim() ||
                !applyDraft.stylesText.trim() ||
                portfolioCounts.images < 3 ||
                portfolioCounts.reels < 1 ||
                !applyDraft.portfolioLink.trim()
              ) && styles.saveBtnDisabled]}
              accessibilityRole="button"
            >
              <Text style={styles.saveText}>{applySubmitting ? 'Submitting...' : 'Submit for Review'}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      borderRadius: 0,
      borderWidth: 0,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
      overflow: 'hidden',
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },
    header: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    loading: {
      flex: 1,
      paddingHorizontal: 14,
      paddingVertical: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    loadingCard: {
      width: '100%',
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 16,
      gap: 14,
    },
    loadingCopy: {
      gap: 8,
    },
    loadingActions: {
      gap: 10,
    },
    scroll: {
      flex: 1,
    },
    body: {
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 18,
      gap: 14,
    },
    profileHeroCard: {
      borderRadius: 26,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : theme.colors.surface,
      padding: 14,
      gap: 12,
    },
    profileHeroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
    },
    profileHeroAvatar: {
      width: 82,
      height: 82,
      borderRadius: 41,
      borderWidth: 2,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.25)' : 'rgba(255,255,255,0.14)',
      backgroundColor: theme.colors.backgroundAlt,
    },
    profileHeroAvatarFallback: {
      width: 82,
      height: 82,
      borderRadius: 41,
      alignItems: 'center',
      justifyContent: 'center',
    },
    profileHeroInitial: {
      color: theme.colors.textInverse,
      fontSize: 28,
      fontWeight: '900',
    },
    profileHeroCopy: {
      flex: 1,
      minWidth: 0,
      gap: 5,
    },
    profileHeroName: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 22,
      fontWeight: '900',
    },
    profileHeroEmail: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    profileHeroMeta: {
      color: theme.colors.accentStrong,
      fontSize: 11,
      fontWeight: '900',
    },
    profileHeroBio: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 19,
    },
    profileStatsGrid: {
      flexDirection: 'row',
      gap: 8,
    },
    profileStatPill: {
      flex: 1,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.03)' : 'rgba(255,255,255,0.05)',
      alignItems: 'center',
      paddingVertical: 10,
      gap: 2,
    },
    profileStatValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 16,
      fontWeight: '900',
    },
    profileStatLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    recentBookingCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(0, 229, 255, 0.08)' : 'rgba(0, 229, 255, 0.09)',
      padding: 11,
      gap: 4,
    },
    recentBookingTitle: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
    },
    recentBookingText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 17,
    },
    savedSectionCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : theme.colors.surface,
      padding: 14,
      gap: 12,
    },
    savedSectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    savedSectionCount: {
      minWidth: 28,
      textAlign: 'center',
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    savedGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    savedTile: {
      width: '31%',
      aspectRatio: 1,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(255, 255, 255, 0.06)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    savedTileImage: {
      width: '100%',
      height: '100%',
    },
    savedTileVideo: {
      width: '100%',
      height: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? theme.colors.accentSoft : 'rgba(122, 92, 255, 0.2)',
    },
    paymentHistoryBtn: {
      marginTop: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.accentSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    paymentHistoryText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    banner: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.34)' : theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.12)' : 'rgba(122, 92, 255, 0.14)',
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    bannerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    bannerCopy: {
      flex: 1,
      gap: 2,
    },
    bannerTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    bannerSub: {
      color: theme.mode === 'light' ? theme.colors.textMuted : 'rgba(245, 247, 250, 0.78)',
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    bannerCta: {
      color: theme.mode === 'light' ? theme.colors.accentStrong : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    row: {
      gap: 10,
    },
    certificateCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.accentStrong,
      backgroundColor: 'rgba(27, 217, 255, 0.08)',
      padding: 12,
    },
    certificateHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    label: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    labelAlt: {
      marginTop: 6,
    },
    value: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    input: {
      borderRadius: 18,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(255, 255, 255, 0.06)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 14,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
    },
    inputDisabled: {
      opacity: 0.6,
    },
    bio: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    helper: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
      paddingHorizontal: 2,
    },
    profileImageRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    profileAvatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: theme.colors.backgroundAlt,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    profileAvatarFallback: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    profileAvatarText: {
      color: theme.mode === 'light' ? theme.colors.accentStrong : theme.colors.textInverse,
      fontSize: 24,
      fontWeight: '900',
    },
    uploadMiniBtn: {
      minHeight: 44,
      borderRadius: 18,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
    },
    uploadMiniText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    sectionTitle: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      paddingHorizontal: 2,
    },
    actionsBlock: {
      gap: 10,
    },
    upgradeCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.34)' : 'rgba(255, 255, 255, 0.12)',
      overflow: 'hidden',
      paddingHorizontal: 14,
      paddingVertical: 14,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(0, 229, 255, 0.08)',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    upgradeCardDisabled: {
      opacity: 0.55,
    },
    upgradeLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    upgradeTextBlock: {
      flex: 1,
      gap: 2,
    },
    upgradeTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.3,
    },
    upgradeSub: {
      color: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.78)' : 'rgba(245, 247, 250, 0.82)',
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    pendingNote: {
      color: theme.mode === 'light' ? theme.colors.accentStrong : theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
      paddingHorizontal: 2,
    },
    actions: {
      gap: 10,
      marginTop: 2,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    actionText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    dangerBtn: {
      backgroundColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.12)' : 'rgba(142, 75, 69, 0.18)',
      borderColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.34)' : 'rgba(255, 211, 207, 0.22)',
    },
    dangerText: {
      color: theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf',
    },
    saveBtn: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.14)',
      overflow: 'hidden',
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentStrong,
      marginTop: 6,
    },
    saveBtnDisabled: {
      opacity: 0.65,
    },
    saveText: {
      color: theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    note: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
      paddingHorizontal: 2,
    },
    multiline: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    uploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    uploadBtnDisabled: {
      opacity: 0.62,
    },
    uploadBtnText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    fileList: {
      marginTop: 10,
      gap: 8,
    },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
    },
    fileName: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '700',
    },
    fileRemove: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    applySheet: {
      position: 'absolute',
      left: 14,
      right: 14,
      top: 92,
      bottom: 14,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
      overflow: 'hidden',
      width: '100%',
      maxWidth: 560,
      alignSelf: 'center',
    },
  });

export default ProfileModal;







