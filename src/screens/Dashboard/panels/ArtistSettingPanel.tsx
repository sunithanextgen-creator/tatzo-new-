import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Image, Linking, Modal, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { auth } from '../../../config/firebaseConfig';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import type { ArtistDashboardSettings, ArtistFamousDesign, ArtistSubscriptionPaymentStatus, DealerRequestStatus, UserProfile } from '../../../types/app';
import { getUserProfile } from '../../../services/profile';
import { syncUserProfile } from '../../../services/userProfile';
import { submitDealerRequest } from '../../../services/dealerRequests';
import { signOutAndCleanup } from '../../../services/signout';
import GradientButton from '../../../components/ui/GradientButton';
import { db } from '../../../config/firebaseConfig';
import { listArtistPosts, syncArtistPostVisibilityForUid } from '../../../services/posts';
import { pickSingleImageFromDevice, uploadPickedImage, uploadProfileImage, type UploadedImage } from '../../../services/mediaUpload';
import { DEFAULT_ARTIST_SETTINGS, getArtistAvailabilityLabel, getArtistLocationLabel, getArtistPublicVisibility, getArtistSettingsFromProfile } from '../../../services/artistSettings';

type ArtistSettingPanelProps = {
  header?: React.ReactNode;
  onOpenVerification?: () => void;
};

type DealerDraft = {
  shopName: string;
  businessEmail: string;
  idProof: string;
  portfolioLink: string;
  upiId: string;
  bankDetails: string;
};

type RevenueRow = {
  id: string;
  artistUid?: string | null;
  amount?: number | null;
  month?: string | null;
  status?: string | null;
  finalPaymentAmount?: number | null;
  finalStudioAmount?: number | null;
  collectedAt?: unknown;
};

type SavedPostRow = {
  id: string;
  postId?: string | null;
  artistUid?: string | null;
  artistName?: string | null;
  artistHandle?: string | null;
  artistLocation?: string | null;
  artistProfileImageUrl?: string | null;
  caption?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  tags?: string[] | null;
  savedAt?: unknown;
};

type ReportHistoryRow = {
  id: string;
  postId?: string | null;
  reason?: string | null;
  status?: string | null;
  createdAt?: unknown;
};

type BlockedUserRow = {
  id: string;
  blockedUid?: string | null;
  blockedName?: string | null;
  blockedProfileImageUrl?: string | null;
  blockedAt?: unknown;
};

type ArtistMediaItem = {
  id: string;
  imageUrl?: string | null;
  videoUrl?: string | null;
  caption?: string;
};

const ArtistMediaVideo = ({ uri }: { uri: string }) => {
  const player = useVideoPlayer({ uri }, (instance) => {
    instance.loop = true;
    instance.play();
  });
  return <VideoView player={player} style={StyleSheet.absoluteFillObject} nativeControls contentFit="contain" />;
};

const ArtistMediaViewer = ({ item, onClose }: { item: ArtistMediaItem | null; onClose: () => void }) => (
  <Modal visible={Boolean(item)} animationType="fade" presentationStyle="fullScreen" onRequestClose={onClose}>
    <View style={mediaViewerStyles.screen}>
      <View style={mediaViewerStyles.header}>
        <Text style={mediaViewerStyles.title}>{item?.videoUrl?.trim() ? 'Reel' : 'Post'}</Text>
        <TouchableOpacity activeOpacity={0.9} onPress={onClose} style={mediaViewerStyles.closeButton}>
          <Ionicons name="close" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
      <View style={mediaViewerStyles.media}>
        {item?.videoUrl?.trim() ? (
          <ArtistMediaVideo uri={item.videoUrl.trim()} />
        ) : item?.imageUrl?.trim() ? (
          <Image source={{ uri: item.imageUrl.trim() }} style={StyleSheet.absoluteFillObject} resizeMode="contain" />
        ) : null}
      </View>
      {item?.caption?.trim() ? <Text style={mediaViewerStyles.caption}>{item.caption.trim()}</Text> : null}
    </View>
  </Modal>
);

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const csvToTags = (value: string) =>
  value
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);

const sanitizeFamousDesigns = (value: unknown): ArtistFamousDesign[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ({
      name: String((item as ArtistFamousDesign)?.name ?? '').trim(),
      priceRange: String((item as ArtistFamousDesign)?.priceRange ?? '').trim(),
    }))
    .filter((item) => item.name && item.priceRange)
    .slice(0, 8);
};

const famousDesignDrafts = (value: unknown): ArtistFamousDesign[] => {
  const clean = sanitizeFamousDesigns(value);
  return clean.length ? clean : [{ name: '', priceRange: '' }];
};
const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  const casted = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof casted?.toMillis === 'function') return casted.toMillis();
  if (typeof casted?.seconds === 'number') return casted.seconds * 1000 + Math.floor((casted.nanoseconds ?? 0) / 1_000_000);
  return 0;
};

const formatDateLabel = (value: unknown) => {
  const ms = toMillis(value);
  if (!ms) return 'Date unavailable';
  return new Date(ms).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

const monthKeyFromRevenue = (row: RevenueRow) => {
  const saved = String(row.month ?? '').trim();
  if (saved) return saved;
  const ms = toMillis(row.collectedAt);
  if (!ms) return '';
  const date = new Date(ms);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const WEEKDAY_OPTIONS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

const statusCopy = (status: DealerRequestStatus | undefined, rejectReason?: string) => {
  if (status === 'approved') {
    return { title: 'Dealer request approved', message: 'You are now listed as an authorized seller profile.', tone: 'good' as const };
  }
  if (status === 'pending') {
    return { title: 'Dealer request pending', message: 'Admin review is in progress. We will notify you once completed.', tone: 'warn' as const };
  }
  if (status === 'rejected') {
    return {
      title: 'Dealer request rejected',
      message: rejectReason?.trim() ? `Reason: ${rejectReason.trim()}` : 'Please update details and re-apply.',
      tone: 'danger' as const,
    };
  }
  return { title: 'Not applied yet', message: 'Submit your request to become a dealer while staying an artist.', tone: 'muted' as const };
};

const ArtistSettingPanel = ({ header, onOpenVerification }: ArtistSettingPanelProps) => {
  const { theme, themePreference, setThemePreference, fontSizeMode, setFontSizeMode, dataSaverMode, setDataSaverMode, notifications, setNotifications } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const uid = auth.currentUser?.uid ?? '';

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submittingDealer, setSubmittingDealer] = useState(false);
  const [subscriptionOpening, setSubscriptionOpening] = useState(false);
  const [subscriptionRefreshing, setSubscriptionRefreshing] = useState(false);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [uploadingCoverImage, setUploadingCoverImage] = useState(false);
  const [autosaveState, setAutosaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [proDetailsOpen, setProDetailsOpen] = useState(false);
  const autosaveReadyRef = useRef(false);
  const showFriendlyError = (label: string, error: any) => {
    console.error(`TATZO ${label} failed`, error);
    if (label === 'load settings') {
      Alert.alert('Tatzo', 'Could not load your settings right now. Please refresh and try again.');
      return;
    }
    if (label === 'save profile') {
      Alert.alert('Tatzo', 'Could not save your profile right now. Please try again.');
      return;
    }
    if (label === 'upload cover') {
      Alert.alert('Tatzo', 'Could not upload your cover image right now. Please try again.');
      return;
    }
    if (label === 'change password') {
      Alert.alert('Tatzo', 'Could not update your password right now. Please try again.');
      return;
    }
    Alert.alert('Tatzo', 'Something went wrong. Please try again.');
  };

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState(auth.currentUser?.email ?? '');
  const [phone, setPhone] = useState('');
  const [bio, setBio] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [locationArea, setLocationArea] = useState('');
  const [artistName, setArtistName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [shopAddressLine, setShopAddressLine] = useState('');
  const [artistSinceYear, setArtistSinceYear] = useState('');
  const [startingPrice, setStartingPrice] = useState('');
  const [experience, setExperience] = useState('');
  const [stylesText, setStylesText] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [profileImageMeta, setProfileImageMeta] = useState<UploadedImage | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [coverImageMeta, setCoverImageMeta] = useState<UploadedImage | null>(null);
  const [famousDesigns, setFamousDesigns] = useState<ArtistFamousDesign[]>([{ name: '', priceRange: '' }]);
  const [role, setRole] = useState<'user' | 'artist' | 'dealer'>('artist');
  const [verificationStatus, setVerificationStatus] = useState<'unsubmitted' | 'pending' | 'pending_verification' | 'needs_more_samples' | 'approved' | 'rejected'>('unsubmitted');

  const [subscriptionStatus, setSubscriptionStatus] = useState<'inactive' | 'active'>('inactive');
  const [subscriptionPaymentStatus, setSubscriptionPaymentStatus] = useState<ArtistSubscriptionPaymentStatus>('idle');
  const [subscriptionVerificationStatus, setSubscriptionVerificationStatus] = useState<'pending' | 'verified' | 'failed'>('failed');
  const [subscriptionVerificationRequestedAt, setSubscriptionVerificationRequestedAt] = useState<unknown>(null);
  const [subscriptionPaidAt, setSubscriptionPaidAt] = useState<unknown>(null);
  const [subscriptionPlan, setSubscriptionPlan] = useState('tatzo_pro');
  const [payoutStatus, setPayoutStatus] = useState<'unconfigured' | 'pending' | 'ready'>('unconfigured');
  const [payoutSetupStatus, setPayoutSetupStatus] = useState<'unconfigured' | 'pending' | 'ready' | 'rejected'>('unconfigured');
  const [artistPaymentMethod, setArtistPaymentMethod] = useState<'upi' | 'razorpay_link'>('upi');
  const [artistUpiId, setArtistUpiId] = useState('');
  const [artistRazorpayPaymentLink, setArtistRazorpayPaymentLink] = useState('');
  const [revenueRows, setRevenueRows] = useState<RevenueRow[]>([]);
  const [recentPosts, setRecentPosts] = useState<ArtistMediaItem[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<ArtistMediaItem | null>(null);
  const [profileTab, setProfileTab] = useState<'posts' | 'reels' | 'saved'>('posts');
  const [menuPanel, setMenuPanel] = useState<null | 'advanced' | 'profile' | 'pro' | 'business' | 'settings' | 'settings_hub_v2' | 'appearance' | 'privacy' | 'time' | 'notifications' | 'blockReport' | 'about' | 'help'>(null);
  const [savedPosts, setSavedPosts] = useState<SavedPostRow[]>([]);
  const [reportHistory, setReportHistory] = useState<ReportHistoryRow[]>([]);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserRow[]>([]);
  const [artistNotifications, setArtistNotifications] = useState<Array<{ id: string; title: string; message: string; type: string }>>([]);
  const artistFontSize: 'Small' | 'Medium' | 'Large' = fontSizeMode === 'small' ? 'Small' : fontSizeMode === 'large' ? 'Large' : 'Medium';
  const artistDataSaver = dataSaverMode;
  const [artistProfileVisibility, setArtistProfileVisibility] = useState<'Public' | 'Private'>('Public');
  const [artistPostVisibility, setArtistPostVisibility] = useState<'Everyone' | 'Followers Only'>('Everyone');
  const [artistLocationVisibility, setArtistLocationVisibility] = useState<'Exact Location' | 'City Only' | 'Hidden'>('City Only');
  const [artistNotificationPrefs, setArtistNotificationPrefs] = useState({
    newBookingRequest: true,
    bookingConfirmed: true,
    bookingRejected: true,
    bookingReminder: false,
    paymentReceived: true,
    revenueUpdates: true,
    subscriptionRenewal: true,
    tatzoNews: false,
    newFeatures: true,
    promotions: false,
    push: notifications.push,
    email: notifications.email,
    sms: notifications.sms,
  });
  const [artistPrivacyPrefs, setArtistPrivacyPrefs] = useState({
    showEmail: false,
    hideContact: true,
    whoCanFollowMe: true,
  });
  const [artistBookingVisibility, setArtistBookingVisibility] = useState(true);
  const [artistAvailabilityStatus, setArtistAvailabilityStatus] = useState<'Available' | 'Unavailable'>('Available');
  const [artistAvailableDays, setArtistAvailableDays] = useState<string[]>(DEFAULT_ARTIST_SETTINGS.timeManagement.availableDays);
  const [artistStartTime, setArtistStartTime] = useState(DEFAULT_ARTIST_SETTINGS.timeManagement.startTime);
  const [artistEndTime, setArtistEndTime] = useState(DEFAULT_ARTIST_SETTINGS.timeManagement.endTime);
  const [artistVacationReturnDate, setArtistVacationReturnDate] = useState('');
  const [artistTimePrefs, setArtistTimePrefs] = useState({
    manualApproval: true,
    vacationMode: false,
    blockSpecificDates: false,
  });
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const buildArtistSettings = (): ArtistDashboardSettings => ({
    privacy: {
      profileVisibility: artistProfileVisibility === 'Public' ? 'public' : 'private',
      postVisibility: artistProfileVisibility === 'Private' ? 'followers' : artistPostVisibility === 'Followers Only' ? 'followers' : 'everyone',
      showLocation: artistLocationVisibility !== 'Hidden',
      showContactDetails: !artistPrivacyPrefs.hideContact,
      bookingVisibility: artistBookingVisibility,
    },
    timeManagement: {
      availabilityStatus: artistTimePrefs.vacationMode ? 'unavailable' : artistAvailabilityStatus === 'Unavailable' ? 'unavailable' : 'available',
      availableDays: artistAvailableDays.length ? artistAvailableDays : DEFAULT_ARTIST_SETTINGS.timeManagement.availableDays,
      startTime: artistStartTime.trim() || DEFAULT_ARTIST_SETTINGS.timeManagement.startTime,
      endTime: artistEndTime.trim() || DEFAULT_ARTIST_SETTINGS.timeManagement.endTime,
      vacationMode: artistTimePrefs.vacationMode,
      vacationReturnDate: artistVacationReturnDate.trim() || null,
    },
    notifications: {
      bookingNotifications:
        artistNotificationPrefs.newBookingRequest ||
        artistNotificationPrefs.bookingConfirmed ||
        artistNotificationPrefs.bookingRejected ||
        artistNotificationPrefs.bookingReminder,
      paymentNotifications:
        artistNotificationPrefs.paymentReceived ||
        artistNotificationPrefs.revenueUpdates ||
        artistNotificationPrefs.subscriptionRenewal,
      marketingNotifications:
        artistNotificationPrefs.tatzoNews ||
        artistNotificationPrefs.newFeatures ||
        artistNotificationPrefs.promotions,
    },
    appearance: {
      theme: themePreference,
      fontSize: fontSizeMode,
    },
  });

  useEffect(() => {
    setArtistNotificationPrefs((prev) => ({ ...prev, push: notifications.push, email: notifications.email, sms: notifications.sms }));
  }, [notifications]);

  const [dealerStatus, setDealerStatus] = useState<DealerRequestStatus>('unsubmitted');
  const [dealerRejectReason, setDealerRejectReason] = useState('');
  const [dealerFormOpen, setDealerFormOpen] = useState(false);

  const [dealerDraft, setDealerDraft] = useState<DealerDraft>({
    shopName: '',
    businessEmail: '',
    idProof: '',
    portfolioLink: '',
    upiId: '',
    bankDetails: '',
  });

  useEffect(() => {
    if (!uid) return;

    let active = true;
    autosaveReadyRef.current = false;
    (async () => {
      setLoading(true);
      try {
        const profile = await getUserProfile(uid);
        if (!active) return;

        const p = (profile ?? {}) as UserProfile;
        setDisplayName(p.displayName ?? auth.currentUser?.displayName ?? '');
        setArtistName(String(p.artistName ?? p.displayName ?? auth.currentUser?.displayName ?? ''));
        setStudioName(String(p.studioName ?? ''));
        setShopAddressLine(String(p.shopAddressLine ?? ''));
        setArtistSinceYear(p.artistSinceYear ? String(p.artistSinceYear) : '');
        setEmail(p.email ?? auth.currentUser?.email ?? '');
        setPhone(p.phone ?? '');
        setBio(p.bio ?? '');
        setLocationCity(p.locationCity ?? '');
        setLocationArea(p.locationArea ?? '');
        setStartingPrice(String(p.startingPrice ?? ''));
        setExperience(String(p.experience ?? ''));
        setStylesText(Array.isArray(p.styles) ? p.styles.join(', ') : '');
        setProfileImageUrl(String(p.profileImageUrl ?? ''));
        setProfileImageMeta((p.profileImageMeta as UploadedImage | undefined) ?? null);
        setCoverImageUrl(String(p.coverImageUrl ?? ''));
        setCoverImageMeta((p.coverImageMeta as UploadedImage | undefined) ?? null);
        setFamousDesigns(famousDesignDrafts(p.famousDesigns));
        setRole((p.role ?? 'artist') as 'user' | 'artist' | 'dealer');
        setVerificationStatus((p.verificationStatus ?? 'unsubmitted') as 'unsubmitted' | 'pending' | 'pending_verification' | 'needs_more_samples' | 'approved' | 'rejected');
        setSubscriptionStatus((p.subscriptionStatus ?? 'inactive') as 'inactive' | 'active');
        setSubscriptionPaymentStatus((p.subscriptionPaymentStatus ?? 'idle') as ArtistSubscriptionPaymentStatus);
        setSubscriptionVerificationStatus((p.subscriptionVerificationStatus ?? 'failed') as 'pending' | 'verified' | 'failed');
        setSubscriptionVerificationRequestedAt(p.subscriptionVerificationRequestedAt ?? null);
        setSubscriptionPaidAt(p.subscriptionPaidAt ?? null);
        setSubscriptionPlan(String(p.subscriptionPlan ?? 'tatzo_pro'));
        setPayoutStatus((p.payoutStatus ?? 'unconfigured') as 'unconfigured' | 'pending' | 'ready');
        setPayoutSetupStatus((p.payoutSetupStatus ?? p.payoutStatus ?? 'unconfigured') as 'unconfigured' | 'pending' | 'ready' | 'rejected');
        setArtistPaymentMethod((p.artistPaymentMethod === 'razorpay_link' ? 'razorpay_link' : 'upi') as 'upi' | 'razorpay_link');
        setArtistUpiId(String(p.artistUpiId ?? ''));
        setArtistRazorpayPaymentLink(String(p.artistRazorpayPaymentLink ?? ''));
        setDealerStatus((p.dealerRequestStatus ?? 'unsubmitted') as DealerRequestStatus);
        setDealerRejectReason(String(p.dealerRejectReason ?? ''));
        setDealerDraft((prev) => ({
          ...prev,
          businessEmail: prev.businessEmail || String(p.email ?? auth.currentUser?.email ?? ''),
        }));
        const artistSettings = getArtistSettingsFromProfile(p);
        setArtistProfileVisibility(artistSettings.privacy.profileVisibility === 'private' ? 'Private' : 'Public');
        setArtistPostVisibility(artistSettings.privacy.postVisibility === 'followers' ? 'Followers Only' : 'Everyone');
        setArtistLocationVisibility(artistSettings.privacy.showLocation ? 'City Only' : 'Hidden');
        setArtistPrivacyPrefs({
          showEmail: Boolean(p.email && artistSettings.privacy.showContactDetails),
          hideContact: !artistSettings.privacy.showContactDetails,
          whoCanFollowMe: artistSettings.privacy.profileVisibility !== 'public',
        });
        setArtistBookingVisibility(artistSettings.privacy.bookingVisibility);
        setArtistAvailabilityStatus(artistSettings.timeManagement.availabilityStatus === 'unavailable' ? 'Unavailable' : 'Available');
        setArtistAvailableDays(artistSettings.timeManagement.availableDays);
        setArtistStartTime(artistSettings.timeManagement.startTime);
        setArtistEndTime(artistSettings.timeManagement.endTime);
        setArtistVacationReturnDate(artistSettings.timeManagement.vacationReturnDate ?? '');
        setArtistTimePrefs((prev) => ({
          ...prev,
          vacationMode: artistSettings.timeManagement.vacationMode,
        }));
        setArtistNotificationPrefs((prev) => ({
          ...prev,
          newBookingRequest: artistSettings.notifications.bookingNotifications,
          bookingConfirmed: artistSettings.notifications.bookingNotifications,
          bookingRejected: artistSettings.notifications.bookingNotifications,
          bookingReminder: artistSettings.notifications.bookingNotifications,
          paymentReceived: artistSettings.notifications.paymentNotifications,
          revenueUpdates: artistSettings.notifications.paymentNotifications,
          subscriptionRenewal: artistSettings.notifications.paymentNotifications,
          tatzoNews: artistSettings.notifications.marketingNotifications,
          newFeatures: artistSettings.notifications.marketingNotifications,
          promotions: artistSettings.notifications.marketingNotifications,
        }));
        if (artistSettings.appearance.theme !== themePreference) {
          setThemePreference(artistSettings.appearance.theme);
        }
        if (artistSettings.appearance.fontSize !== fontSizeMode) {
          setFontSizeMode(artistSettings.appearance.fontSize);
        }
      } catch (e: any) {
        showFriendlyError('load settings', e);
      } finally {
        if (active) {
          setLoading(false);
          setTimeout(() => {
            if (active) autosaveReadyRef.current = true;
          }, 0);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    void listArtistPosts(uid, 12)
      .then((rows) => {
        if (!active) return;
        setRecentPosts(rows.map((row) => ({ id: row.id, imageUrl: row.imageUrl, videoUrl: row.videoUrl, caption: row.caption })));
      })
      .catch(() => {
        if (active) setRecentPosts([]);
      });
    return () => {
      active = false;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setArtistNotifications([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc'), limit(30)),
      (snap) => {
        const rows = snap.docs
          .map((row) => {
            const data = row.data() as any;
            return {
              id: row.id,
              title: String(data.title ?? '').trim(),
              message: String(data.message ?? '').trim(),
              type: String(data.type ?? '').trim(),
            };
          })
          .filter((row) =>
            ['booking_requested', 'booking_confirmed', 'final_payment_requested', 'payment_success', 'dealer_request_approved', 'dealer_request_rejected', 'verification_approved', 'verification_rejected', 'system'].includes(row.type),
          )
          .slice(0, 20);
        setArtistNotifications(rows);
      },
      () => setArtistNotifications([]),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'artistTransactions'), where('artistUid', '==', uid), orderBy('collectedAt', 'desc'), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = snap.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() as any) }) as RevenueRow);
        setRevenueRows(next);
      },
      () => setRevenueRows([]),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setSavedPosts([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'users', uid, 'savedPosts'), orderBy('savedAt', 'desc'), limit(30)),
      (snap) => {
        setSavedPosts(snap.docs.map((row) => ({ id: row.id, ...(row.data() as any) }) as SavedPostRow));
      },
      () => setSavedPosts([]),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setReportHistory([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'postReports'), where('reportedByUid', '==', uid), orderBy('createdAt', 'desc'), limit(50)),
      (snap) => {
        const rows = snap.docs
          .map((row) => ({ id: row.id, ...(row.data() as any) }) as ReportHistoryRow)
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setReportHistory(rows);
      },
      () => setReportHistory([]),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setBlockedUsers([]);
      return;
    }
    const unsub = onSnapshot(
      query(collection(db, 'users', uid, 'blockedUsers'), orderBy('blockedAt', 'desc'), limit(50)),
      (snap) => {
        const rows = snap.docs
          .map((row) => ({ id: row.id, ...(row.data() as any) }) as BlockedUserRow)
          .sort((a, b) => toMillis(b.blockedAt) - toMillis(a.blockedAt));
        setBlockedUsers(rows);
      },
      () => setBlockedUsers([]),
    );
    return () => unsub();
  }, [uid]);

  const imagePosts = useMemo(() => recentPosts.filter((post) => Boolean(post.imageUrl?.trim()) && !post.videoUrl), [recentPosts]);
  const reelPosts = useMemo(() => recentPosts.filter((post) => Boolean(post.videoUrl?.trim())), [recentPosts]);
  const visiblePosts = useMemo(() => {
    if (profileTab === 'posts') return imagePosts;
    if (profileTab === 'reels') return reelPosts;
    return [];
  }, [imagePosts, profileTab, reelPosts]);
  const isManagementPageOpen = menuPanel !== null;
  const monthlyRevenueBars = useMemo(() => {
    const sums = new Map<string, number>();
    revenueRows.forEach((row) => {
      const key = monthKeyFromRevenue(row);
      if (!key) return;
      const amount = Number(row.amount ?? row.finalPaymentAmount ?? row.finalStudioAmount ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) return;
      if (String(row.status ?? '').trim() && String(row.status) !== 'collected') return;
      sums.set(key, (sums.get(key) ?? 0) + amount);
    });
    const keys = Array.from(sums.keys()).sort().slice(-6);
    const max = Math.max(...keys.map((key) => sums.get(key) ?? 0), 1);
    return keys.map((key) => {
      const value = sums.get(key) ?? 0;
      const [year, month] = key.split('-');
      const date = new Date(Number(year), Number(month) - 1, 1);
      return {
        key,
        label: date.toLocaleDateString('en-IN', { month: 'short' }),
        value,
        height: Math.max(8, Math.round((value / max) * 100)),
      };
    });
  }, [revenueRows]);
  const artistHandle = useMemo(
    () => `@${(artistName.trim() || displayName.trim() || 'artist').toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    [artistName, displayName],
  );
  const artistSettingsPreview = useMemo(
    () => buildArtistSettings(),
    [
      artistAvailabilityStatus,
      artistAvailableDays,
      artistBookingVisibility,
      artistEndTime,
      artistLocationVisibility,
      artistNotificationPrefs,
      artistPrivacyPrefs.hideContact,
      artistProfileVisibility,
      artistStartTime,
      artistTimePrefs.vacationMode,
      artistVacationReturnDate,
      fontSizeMode,
      themePreference,
    ],
  );
  const locationLabel = useMemo(
    () => getArtistLocationLabel({ locationArea, locationCity, location: `${locationArea.trim()}, ${locationCity.trim()}` }, artistSettingsPreview),
    [artistSettingsPreview, locationArea, locationCity],
  );
  const specializationLabel = useMemo(() => {
    const tags = csvToTags(stylesText);
    if (tags.length) return tags.slice(0, 3).join(' • ');
    return 'Styles not added';
  }, [stylesText]);
  const worksDoneCount = useMemo(() => {
    return revenueRows.filter((row) => String(row.status ?? '').trim() === 'collected').length;
  }, [revenueRows]);
  const totalRevenue = useMemo(
    () => revenueRows.reduce((sum, row) => sum + Number(row.amount ?? row.finalPaymentAmount ?? row.finalStudioAmount ?? 0), 0),
    [revenueRows],
  );
  const totalBookings = useMemo(() => revenueRows.length, [revenueRows.length]);
  const totalClients = useMemo(() => Math.max(worksDoneCount, revenueRows.filter((row) => String(row.status ?? '') === 'collected').length), [revenueRows, worksDoneCount]);
  const conversionRate = useMemo(() => `${totalBookings > 0 ? Math.round((worksDoneCount / totalBookings) * 100) : 0}%`, [totalBookings, worksDoneCount]);
  const ratingLabel = '0';
  const savedVisiblePosts = useMemo(
    () => savedPosts.filter((post) => Boolean(post.imageUrl?.trim()) || Boolean(post.videoUrl?.trim())),
    [savedPosts],
  );
  const infoCards = useMemo(
    () => [
      { key: 'experience', label: 'Experience', value: experience.trim() || 'Not set', icon: 'time-outline' as const },
      { key: 'price', label: 'Starting Price', value: startingPrice.trim() ? `₹${startingPrice.trim()}` : 'Not set', icon: 'cash-outline' as const },
      { key: 'availability', label: 'Availability', value: getArtistAvailabilityLabel(artistSettingsPreview), icon: 'sparkles-outline' as const },
    ],
    [artistSettingsPreview, experience, startingPrice],
  );

  const availableDaysLabel = useMemo(
    () => (artistAvailableDays.length ? artistAvailableDays.map((day) => day.slice(0, 3)).join(', ') : 'Not set'),
    [artistAvailableDays],
  );
  const workingHoursLabel = useMemo(() => {
    const start = artistStartTime.trim();
    const end = artistEndTime.trim();
    if (start && end) return `${start} - ${end}`;
    if (start) return `${start} onwards`;
    if (end) return `Until ${end}`;
    return 'Not set';
  }, [artistEndTime, artistStartTime]);
  const timeManagementSummary = useMemo(() => {
    if (artistTimePrefs.vacationMode) {
      return artistVacationReturnDate.trim() ? `On Vacation · Back on ${artistVacationReturnDate.trim()}` : 'On Vacation';
    }
    if (artistAvailabilityStatus === 'Unavailable') return 'Currently unavailable';
    if (!artistBookingVisibility) return 'Bookings hidden';
    return 'Accepting new bookings';
  }, [artistAvailabilityStatus, artistBookingVisibility, artistTimePrefs.vacationMode, artistVacationReturnDate]);

  const onSaveProfile = async () => {
    if (!uid || !auth.currentUser) return;
    if (uploadingProfileImage || uploadingCoverImage) {
      Alert.alert('Tatzo', 'Please wait. Image upload is still in progress.');
      return;
    }

    const name = displayName.trim();
    if (!name) {
      Alert.alert('Tatzo', 'Name is required.');
      return;
    }

    if (!locationCity.trim() || !locationArea.trim()) {
      Alert.alert('Tatzo', 'Location city and area are required.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: name });
      const cleanArtistName = artistName.trim() || name;
      const cleanExperience = experience.trim();
      const cleanStudioName = studioName.trim();
      const cleanShopAddressLine = shopAddressLine.trim();
      const parsedArtistSinceYear = Number(artistSinceYear);
      const safeArtistSinceYear = Number.isFinite(parsedArtistSinceYear) && parsedArtistSinceYear >= 1900 && parsedArtistSinceYear <= new Date().getFullYear() ? Math.floor(parsedArtistSinceYear) : null;
      const cleanProfileImageUrl = profileImageUrl.trim();
      const cleanCoverImageUrl = coverImageUrl.trim();
      const parsedStyles = csvToTags(stylesText);
      const parsedStartingPrice = Number(startingPrice);
      const cleanFamousDesigns = sanitizeFamousDesigns(famousDesigns);
      const safeStartingPrice = Number.isFinite(parsedStartingPrice) && parsedStartingPrice > 0 ? Math.floor(parsedStartingPrice) : 0;
      const cleanArtistUpiId = artistUpiId.trim();
      const cleanArtistRazorpayPaymentLink = artistRazorpayPaymentLink.trim();
      const paymentSetupConfigured = artistPaymentMethod === 'upi' ? cleanArtistUpiId.length >= 4 : /^https?:\/\//i.test(cleanArtistRazorpayPaymentLink);
      const safePayoutSetupStatus = paymentSetupConfigured ? (payoutSetupStatus === 'ready' ? 'ready' : 'pending') : 'unconfigured';
      const artistSettings = buildArtistSettings();
      const isVisible = getArtistPublicVisibility(artistSettings);

      await syncUserProfile(auth.currentUser, {
        displayName: name,
        artistName: cleanArtistName,
        phone: phone.trim(),
        bio: bio.trim(),
        studioName: cleanStudioName,
        shopAddressLine: cleanShopAddressLine,
        artistSinceYear: safeArtistSinceYear ?? undefined,
        locationCity: locationCity.trim(),
        locationArea: locationArea.trim(),
        location: `${locationArea.trim()}, ${locationCity.trim()}`,
        startingPrice: safeStartingPrice,
        experience: cleanExperience,
        styles: parsedStyles,
        profileImageUrl: cleanProfileImageUrl,
        profileImageMeta: profileImageMeta ?? undefined,
        coverImageUrl: cleanCoverImageUrl,
        coverImageMeta: coverImageMeta ?? undefined,
        famousDesigns: cleanFamousDesigns,
        artistPaymentMethod,
        artistUpiId: cleanArtistUpiId,
        artistRazorpayPaymentLink: cleanArtistRazorpayPaymentLink,
        payoutSetupStatus: safePayoutSetupStatus,
        payoutSetupUpdatedAt: serverTimestamp(),
        artistSettings,
        artistVisible: isVisible,
        bookingVisible: artistBookingVisibility,
      });

      if (role === 'artist' && verificationStatus === 'approved') {
        await setDoc(
          doc(db, 'artists', uid),
          {
            uid,
            role: 'artist',
            artistName: cleanArtistName,
            displayName: name,
            locationCity: locationCity.trim(),
            locationArea: locationArea.trim(),
            location: `${locationArea.trim()}, ${locationCity.trim()}`,
            bio: bio.trim(),
            studioName: cleanStudioName,
            shopAddressLine: cleanShopAddressLine,
            ...(safeArtistSinceYear ? { artistSinceYear: safeArtistSinceYear } : {}),
            startingPrice: safeStartingPrice,
            startingFrom: safeStartingPrice,
            experience: cleanExperience,
            styles: parsedStyles,
            tags: parsedStyles,
            profileImageUrl: cleanProfileImageUrl,
            ...(profileImageMeta ? { profileImageMeta } : {}),
            coverImageUrl: cleanCoverImageUrl,
            ...(coverImageMeta ? { coverImageMeta } : {}),
            famousDesigns: cleanFamousDesigns,
            email: email.trim(),
            phone: phone.trim(),
            artistSettings,
            razorpayAccountId: null,
            razorpayContactId: null,
            payoutSetupStatus: safePayoutSetupStatus,
            payoutSetupUpdatedAt: serverTimestamp(),
            verificationStatus: 'approved',
            verifiedPro: true,
            isVisible,
            artistVisible: isVisible,
            bookingVisible: artistBookingVisibility,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          },
          { merge: true },
        );
        await syncArtistPostVisibilityForUid(uid, 200);
      }
      Alert.alert('Tatzo', 'Profile updated.');
    } catch (e: any) {
      showFriendlyError('save profile', e);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!uid || !autosaveReadyRef.current || loading) return;

    const timer = setTimeout(async () => {
      const artistSettings = buildArtistSettings();
      const isVisible = getArtistPublicVisibility(artistSettings);
      try {
        setAutosaveState('saving');
        await setDoc(doc(db, 'users', uid), { artistSettings, updatedAt: serverTimestamp() }, { merge: true });
        if (role === 'artist' && verificationStatus === 'approved') {
          await setDoc(doc(db, 'artists', uid), { artistSettings, isVisible, updatedAt: serverTimestamp() }, { merge: true });
        }
        setAutosaveState('saved');
      } catch (error) {
        console.error('TATZO settings autosave failed', error);
        setAutosaveState('error');
      }
    }, 700);

    return () => clearTimeout(timer);
  }, [
    uid,
    loading,
    role,
    verificationStatus,
    artistProfileVisibility,
    artistPostVisibility,
    artistLocationVisibility,
    artistBookingVisibility,
    artistAvailabilityStatus,
    artistAvailableDays,
    artistStartTime,
    artistEndTime,
    artistTimePrefs.vacationMode,
    artistVacationReturnDate,
    artistNotificationPrefs,
    themePreference,
    fontSizeMode,
  ]);

  useEffect(() => {
    if (!uid || !auth.currentUser || loading || saving || uploadingProfileImage || uploadingCoverImage || !autosaveReadyRef.current) return;
    const name = displayName.trim();
    const city = locationCity.trim();
    const area = locationArea.trim();

    const timer = setTimeout(async () => {
      const user = auth.currentUser;
      if (!user) return;
      const safeDisplayName = name || String(auth.currentUser?.displayName ?? 'Artist').trim() || 'Artist';
      const safeCity = city;
      const safeArea = area;
      const safeLocation = [safeArea, safeCity].filter(Boolean).join(', ');
      const cleanArtistName = artistName.trim() || safeDisplayName;
      const cleanStudioName = studioName.trim();
      const cleanShopAddressLine = shopAddressLine.trim();
      const parsedArtistSinceYear = Number(artistSinceYear);
      const safeArtistSinceYear = Number.isFinite(parsedArtistSinceYear) && parsedArtistSinceYear >= 1900 && parsedArtistSinceYear <= new Date().getFullYear() ? Math.floor(parsedArtistSinceYear) : undefined;
      const parsedStartingPrice = Number(startingPrice);
      const safeStartingPrice = Number.isFinite(parsedStartingPrice) && parsedStartingPrice > 0 ? Math.floor(parsedStartingPrice) : 0;
      const parsedStyles = csvToTags(stylesText);
      const cleanFamousDesigns = sanitizeFamousDesigns(famousDesigns);
      const cleanCoverImageUrl = coverImageUrl.trim();
      const cleanArtistUpiId = artistUpiId.trim();
      const cleanArtistRazorpayPaymentLink = artistRazorpayPaymentLink.trim();
      const paymentSetupConfigured = artistPaymentMethod === 'upi' ? cleanArtistUpiId.length >= 4 : /^https?:\/\//i.test(cleanArtistRazorpayPaymentLink);
      const safePayoutSetupStatus = paymentSetupConfigured ? (payoutSetupStatus === 'ready' ? 'ready' : 'pending') : 'unconfigured';
      const artistSettings = buildArtistSettings();
      const isVisible = getArtistPublicVisibility(artistSettings);

      setAutosaveState('saving');
      try {
      await syncUserProfile(user, {
          displayName: safeDisplayName,
          artistName: cleanArtistName,
          phone: phone.trim(),
          bio: bio.trim(),
          studioName: cleanStudioName,
          shopAddressLine: cleanShopAddressLine,
          artistSinceYear: safeArtistSinceYear,
          locationCity: safeCity,
          locationArea: safeArea,
          location: safeLocation,
          startingPrice: safeStartingPrice,
          experience: experience.trim(),
          styles: parsedStyles,
          profileImageUrl: profileImageUrl.trim(),
          profileImageMeta: profileImageMeta ?? undefined,
          coverImageUrl: cleanCoverImageUrl,
          coverImageMeta: coverImageMeta ?? undefined,
          famousDesigns: cleanFamousDesigns,
          artistPaymentMethod,
          artistUpiId: cleanArtistUpiId,
          artistRazorpayPaymentLink: cleanArtistRazorpayPaymentLink,
          payoutSetupStatus: safePayoutSetupStatus,
          payoutSetupUpdatedAt: serverTimestamp(),
          artistSettings,
          artistVisible: isVisible,
          bookingVisible: artistBookingVisibility,
        });

        if (role === 'artist' && verificationStatus === 'approved') {
          await setDoc(doc(db, 'artists', uid), {
            uid,
            role: 'artist',
            artistName: cleanArtistName,
            displayName: safeDisplayName,
            locationCity: safeCity,
            locationArea: safeArea,
            location: safeLocation,
            bio: bio.trim(),
            studioName: cleanStudioName,
            shopAddressLine: cleanShopAddressLine,
            ...(safeArtistSinceYear ? { artistSinceYear: safeArtistSinceYear } : {}),
            startingPrice: safeStartingPrice,
            startingFrom: safeStartingPrice,
            experience: experience.trim(),
            styles: parsedStyles,
            tags: parsedStyles,
            profileImageUrl: profileImageUrl.trim(),
            ...(profileImageMeta ? { profileImageMeta } : {}),
            coverImageUrl: cleanCoverImageUrl,
            ...(coverImageMeta ? { coverImageMeta } : {}),
            famousDesigns: cleanFamousDesigns,
            email: email.trim(),
            phone: phone.trim(),
            artistSettings,
            razorpayAccountId: null,
            razorpayContactId: null,
            payoutSetupStatus: safePayoutSetupStatus,
            payoutSetupUpdatedAt: serverTimestamp(),
            verificationStatus: 'approved',
            verifiedPro: true,
            isVisible,
            artistVisible: isVisible,
            bookingVisible: artistBookingVisibility,
            updatedAt: serverTimestamp(),
            createdAt: serverTimestamp(),
          }, { merge: true });
        }
        setPayoutSetupStatus(safePayoutSetupStatus);
        setAutosaveState('saved');
      } catch {
        setAutosaveState('error');
      }
    }, 1400);

    return () => clearTimeout(timer);
  }, [
    uid, loading, saving, uploadingProfileImage, uploadingCoverImage, displayName, phone, bio, artistName, studioName, shopAddressLine,
    artistSinceYear, locationCity, locationArea, startingPrice, experience, stylesText, profileImageUrl, profileImageMeta, coverImageUrl, coverImageMeta,
    famousDesigns, artistPaymentMethod, artistUpiId, artistRazorpayPaymentLink, payoutSetupStatus, role, verificationStatus,
    artistProfileVisibility, artistLocationVisibility, artistPrivacyPrefs.hideContact, artistBookingVisibility,
    artistAvailabilityStatus, artistAvailableDays, artistStartTime, artistEndTime, artistTimePrefs.vacationMode,
    artistVacationReturnDate, artistNotificationPrefs, themePreference, fontSizeMode, email,
  ]);

  const onSubmitDealer = async () => {
    if (!uid) return;

    const shopName = dealerDraft.shopName.trim();
    const businessEmail = dealerDraft.businessEmail.trim();
    const idProof = dealerDraft.idProof.trim();

    if (!locationCity.trim() || !locationArea.trim()) {
      Alert.alert('Tatzo', 'Set your location before dealer request.');
      return;
    }

    if (!shopName) {
      Alert.alert('Tatzo', 'Shop / Studio name is required.');
      return;
    }

    if (!businessEmail || !emailPattern.test(businessEmail)) {
      Alert.alert('Tatzo', 'Enter a valid email.');
      return;
    }

    if (!idProof) {
      Alert.alert('Tatzo', 'Aadhar / PAN is required.');
      return;
    }

    setSubmittingDealer(true);
    try {
      await submitDealerRequest({
        uid,
        shopName,
        businessEmail,
        idProof,
        portfolioLink: dealerDraft.portfolioLink.trim(),
        upiId: dealerDraft.upiId.trim(),
        bankDetails: dealerDraft.bankDetails.trim(),
        locationCity: locationCity.trim(),
        locationArea: locationArea.trim(),
        actorName: displayName.trim() || auth.currentUser?.displayName || 'Artist',
      });

      setDealerStatus('pending');
      setDealerRejectReason('');
      setDealerFormOpen(false);
      Alert.alert('Tatzo', 'Dealer request submitted.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not submit dealer request.');
    } finally {
      setSubmittingDealer(false);
    }
  };

  const dealer = statusCopy(dealerStatus, dealerRejectReason);
  const paidAtLabel = useMemo(() => {
    const ms = toMillis(subscriptionPaidAt);
    return ms ? new Date(ms).toLocaleString() : '';
  }, [subscriptionPaidAt]);
  const pendingTooLong = useMemo(() => {
    if (subscriptionStatus === 'active') return false;
    if (!(subscriptionPaymentStatus === 'processing' || subscriptionPaymentStatus === 'paid_pending_verification' || subscriptionVerificationStatus === 'pending')) return false;
    const ms = toMillis(subscriptionVerificationRequestedAt);
    return ms > 0 && Date.now() - ms > 2 * 60 * 1000;
  }, [subscriptionStatus, subscriptionPaymentStatus, subscriptionVerificationStatus, subscriptionVerificationRequestedAt]);

  const paymentStatusLabel = useMemo(() => {
    if (subscriptionStatus === 'active') return 'PAID';
    if (subscriptionPaymentStatus === 'paid_pending_verification') return 'PAID - ACTIVATING';
    if (subscriptionPaymentStatus === 'processing') return 'CHECKOUT OPENED';
    return subscriptionPaymentStatus.toUpperCase();
  }, [subscriptionPaymentStatus, subscriptionStatus]);

  const verificationStatusLabel = useMemo(() => {
    if (subscriptionStatus === 'active') return 'VERIFIED';
    if (subscriptionPaymentStatus === 'paid_pending_verification') return 'SECURE CHECK';
    if (subscriptionPaymentStatus === 'processing') return 'WAITING RETURN';
    return subscriptionVerificationStatus.toUpperCase();
  }, [subscriptionPaymentStatus, subscriptionStatus, subscriptionVerificationStatus]);

  const subscriptionStatusMessage = useMemo(() => {
    if (subscriptionStatus === 'active' && paidAtLabel) return `Pro Active - Paid on ${paidAtLabel}`;
    if (subscriptionPaymentStatus === 'paid_pending_verification') {
      return pendingTooLong
        ? 'Payment was received. Tap Refresh status once; if it still does not activate, contact Tatzo support.'
        : 'Payment received. Tatzo is activating your Pro access securely.';
    }
    if (subscriptionPaymentStatus === 'processing') {
      return pendingTooLong
        ? 'Checkout was opened but confirmation did not return. Refresh; retry only if money was not debited.'
        : 'Waiting for Razorpay payment return. Complete checkout, then refresh status.';
    }
    return 'Tatzo Pro subscription is disabled for launch. Approved artists keep full access.';
  }, [paidAtLabel, pendingTooLong, subscriptionPaymentStatus, subscriptionStatus]);

  const openRazorpayAccountSetup = async () => {
    try {
      await Linking.openURL('https://dashboard.razorpay.com/app/payment-links');
    } catch {
      Alert.alert('Tatzo', 'Could not open Razorpay payment links. Please visit dashboard.razorpay.com.');
    }
  };

  const activateSubscription = async () => {
    Alert.alert('Tatzo', 'Tatzo Pro subscription is not required for launch access.');
  };

  const refreshSubscriptionStatus = async () => {
    if (!uid || subscriptionRefreshing) return;
    setSubscriptionRefreshing(true);
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      const latest = (snap.data() ?? {}) as any;
      setSubscriptionStatus((latest?.subscriptionStatus ?? 'inactive') as 'inactive' | 'active');
      setSubscriptionPaymentStatus((latest?.subscriptionPaymentStatus ?? 'idle') as ArtistSubscriptionPaymentStatus);
      setSubscriptionVerificationStatus((latest?.subscriptionVerificationStatus ?? 'failed') as 'pending' | 'verified' | 'failed');
      setSubscriptionVerificationRequestedAt(latest?.subscriptionVerificationRequestedAt ?? null);
      setSubscriptionPaidAt(latest?.subscriptionPaidAt ?? null);

      if (latest?.subscriptionStatus === 'active') {
        Alert.alert('Tatzo', 'Pro Active confirmed.');
      } else if (latest?.subscriptionPaymentStatus === 'processing' || latest?.subscriptionPaymentStatus === 'paid_pending_verification' || latest?.subscriptionVerificationStatus === 'pending') {
        Alert.alert('Tatzo', 'Payment status is syncing. If payment succeeded, Pro should activate shortly.');
      } else if (latest?.subscriptionPaymentStatus === 'failed' || latest?.subscriptionPaymentStatus === 'cancelled') {
        Alert.alert('Tatzo', 'Payment was not completed. Use Retry Payment.');
      } else {
        Alert.alert('Tatzo', 'Subscription is inactive. Activate Pro to publish posts.');
      }
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not refresh subscription status.');
    } finally {
      setSubscriptionRefreshing(false);
    }
  };

  const subscriptionActionLabel = useMemo(() => {
    return 'Free Access';
  }, []);

  const disableSubscriptionAction =
    true;

  const onPickAndUploadProfileImage = async () => {
    if (!uid || uploadingProfileImage || saving) return;

    try {
      setUploadingProfileImage(true);
      const picked = await pickSingleImageFromDevice();
      if (!picked) return;

      const uploaded = await uploadProfileImage({
        picked,
        storagePath: `artists/${uid}/profile/profile-image.jpg`,
      });

      setProfileImageUrl(uploaded.downloadUrl);
      setProfileImageMeta(uploaded);

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

      Alert.alert('Tatzo', 'Profile image uploaded and published.');
    } catch (e: any) {
      Alert.alert('Tatzo', e?.message ?? 'Could not upload profile image.');
    } finally {
      setUploadingProfileImage(false);
    }
  };

  const renderMediaPreview = (post: { id: string; imageUrl?: string | null; videoUrl?: string | null }) => {
    if (post.videoUrl?.trim()) {
      return (
        <View style={styles.mediaTile}>
          <Ionicons name="play-circle-outline" size={24} color={theme.colors.textInverse} />
          <Text style={styles.mediaTileText}>Reel</Text>
        </View>
      );
    }
    if (post.imageUrl?.trim()) {
      return <Image source={{ uri: post.imageUrl.trim() }} style={styles.mediaTileImage} resizeMode="cover" />;
    }
    return null;
  };

  const onPickAndUploadCoverImage = async () => {
    if (!uid || uploadingCoverImage || saving) return;
    try {
      const picked = await pickSingleImageFromDevice();
      if (!picked) return;
      setUploadingCoverImage(true);
      const uploaded = await uploadPickedImage({
        uri: picked.uri,
        fileName: picked.name || 'cover-image.jpg',
        mimeType: picked.mimeType,
        blob: picked.blob,
        folderPath: `cover-images/${uid}`,
        storagePath: `cover-images/${uid}/cover-image.jpg`,
      });
      setCoverImageUrl(uploaded.downloadUrl);
      setCoverImageMeta(uploaded);
      const coverPayload = {
        coverImageUrl: uploaded.downloadUrl,
        coverImageMeta: uploaded,
        updatedAt: serverTimestamp(),
      };
      await setDoc(doc(db, 'users', uid), coverPayload, { merge: true });
      if (role === 'artist' && verificationStatus === 'approved') {
        await setDoc(doc(db, 'artists', uid), { ...coverPayload, role: 'artist', verificationStatus: 'approved' }, { merge: true });
      }
      Alert.alert('Tatzo', 'Cover image uploaded.');
    } catch (error: any) {
      showFriendlyError('upload cover', error);
    } finally {
      setUploadingCoverImage(false);
    }
  };

  const onRemoveCoverImage = async () => {
    if (!uid) return;
    setCoverImageUrl('');
    setCoverImageMeta(null);
    const payload = { coverImageUrl: '', coverImageMeta: null, updatedAt: serverTimestamp() };
    await setDoc(doc(db, 'users', uid), payload, { merge: true });
    if (role === 'artist' && verificationStatus === 'approved') {
      await setDoc(doc(db, 'artists', uid), payload, { merge: true });
    }
  };

  const onUnblockUser = async (blockedUserId: string) => {
    if (!uid || !blockedUserId) return;
    await deleteDoc(doc(db, 'users', uid, 'blockedUsers', blockedUserId));
  };

  const onChangePassword = async () => {
    const user = auth.currentUser;
    if (!user || !user.email) {
      Alert.alert('Tatzo', 'Please sign in again to change password.');
      return;
    }
    if (!currentPassword.trim() || !newPassword.trim() || !confirmPassword.trim()) {
      Alert.alert('Tatzo', 'Fill current, new, and confirm password.');
      return;
    }
    if (newPassword.trim().length < 6) {
      Alert.alert('Tatzo', 'New password must be at least 6 characters.');
      return;
    }
    if (newPassword.trim() !== confirmPassword.trim()) {
      Alert.alert('Tatzo', 'New password and confirm password do not match.');
      return;
    }
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword.trim());
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword.trim());
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Tatzo', 'Password updated successfully.');
    } catch (error: any) {
      showFriendlyError('change password', error);
    }
  };


  const renderGridTile = (post: ArtistMediaItem) => (
    <TouchableOpacity activeOpacity={0.9} style={styles.gridTile} onPress={() => setSelectedMedia(post)}>
      {post.imageUrl?.trim() ? (
        <Image source={{ uri: post.imageUrl.trim() }} style={styles.gridTileImage} resizeMode="cover" />
      ) : (
        <View style={styles.gridTileFallback}>
          <Ionicons name="image-outline" size={20} color={theme.colors.textMuted} />
        </View>
      )}
      {post.videoUrl?.trim() ? (
        <View style={styles.gridPlayBadge}>
          <Ionicons name="play" size={12} color={theme.colors.textInverse} />
        </View>
      ) : null}
    </TouchableOpacity>
  );

  const renderSettingsHubRow = (
    icon: keyof typeof Ionicons.glyphMap,
    title: string,
    subtitle: string,
    onPress: () => void,
    danger = false,
  ) => (
    <TouchableOpacity key={title} activeOpacity={0.85} style={[styles.settingRow, danger && styles.settingDanger]} onPress={onPress}>
      <View style={[styles.settingsHubIcon, danger && styles.settingsHubIconDanger]}><Ionicons name={icon} size={18} color={danger ? '#FB7185' : theme.colors.accentStrong} /></View>
      <View style={styles.settingCopy}><Text style={[styles.settingTitle, danger && styles.dangerText]}>{title}</Text><Text style={styles.settingSub}>{subtitle}</Text></View>
      <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <>
      <FlatList
      data={[{ key: 'content' }]}
      keyExtractor={(item) => item.key}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.headWrap}>
          {header ? <View style={styles.externalHeader}>{header}</View> : null}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Profile</Text>
            <Text style={styles.sectionBadge}>Artist Dashboard</Text>
          </View>
        </View>
      }
      renderItem={() => (
          <View style={styles.stack}>
          {verificationStatus !== 'approved' ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>
                {verificationStatus === 'pending' || verificationStatus === 'pending_verification'
                  ? 'Verification Pending'
                  : verificationStatus === 'needs_more_samples'
                    ? 'Update Verification Portfolio'
                    : 'Complete Artist Verification'}
              </Text>
              <Text style={styles.hint}>
                {verificationStatus === 'pending' || verificationStatus === 'pending_verification'
                  ? 'Tatzo admin is reviewing your artist portfolio.'
                  : 'Submit your artist details, profile image, 3 tattoo images, and 1 tattoo video before posting.'}
              </Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.uploadBtn} onPress={onOpenVerification}>
                <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.accentStrong} />
                <Text style={styles.uploadBtnText}>
                  {verificationStatus === 'pending' || verificationStatus === 'pending_verification' ? 'View Verification' : 'Submit Verification'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}
          {!isManagementPageOpen ? (
          <View style={styles.heroCard}>
            <View style={styles.heroTopRow}>
              <View />
              <View style={styles.heroTopActions}>
                <TouchableOpacity activeOpacity={0.9} style={styles.heroIconBtn} onPress={() => setMenuPanel('notifications')}>
                  <Ionicons name="notifications-outline" size={16} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.9} style={styles.heroIconBtn} onPress={() => setMenuPanel('settings_hub_v2')}>
                  <Ionicons name="settings-outline" size={16} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.profileRow}>
              <View style={styles.avatarWrap}>
                {profileImageUrl.trim() ? (
                  <Image source={{ uri: profileImageUrl.trim() }} style={styles.publicAvatar} resizeMode="cover" />
                ) : (
                  <View style={styles.publicAvatarFallback}>
                    <Text style={styles.publicAvatarText}>{(artistName.trim() || displayName.trim() || 'A').slice(0, 1).toUpperCase()}</Text>
                  </View>
                )}
                {verificationStatus === 'approved' ? (
                  <View style={styles.avatarTick}>
                    <Ionicons name="checkmark" size={10} color={theme.colors.textInverse} />
                  </View>
                ) : null}
              </View>

              <View style={styles.profileMetaBlock}>
                <View style={styles.publicNameRow}>
                  <Text style={styles.publicName}>{artistName.trim() || displayName.trim() || 'Artist'}</Text>
                  {verificationStatus === 'approved' ? <Ionicons name="checkmark-circle" size={16} color={theme.colors.accentStrong} /> : null}
                </View>
                <Text style={styles.publicHandle}>{artistHandle}</Text>
                <Text style={styles.publicStudio}>{studioName.trim() || 'Independent Studio'}</Text>
                <Text style={styles.publicMeta}>{locationLabel}</Text>
              </View>
            </View>

            <TouchableOpacity activeOpacity={0.85} style={styles.profileEditButton} onPress={() => setMenuPanel('profile')}>
              <Ionicons name="create-outline" size={16} color={theme.colors.accentStrong} />
              <Text style={styles.profileEditButtonText}>Edit Profile</Text>
            </TouchableOpacity>

            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{imagePosts.length + reelPosts.length}</Text>
                <Text style={styles.statLabel}>Posts</Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{worksDoneCount}</Text>
                <Text style={styles.statLabel}>Works Done</Text>
              </View>
              <View style={styles.statsDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{ratingLabel}</Text>
                <Text style={styles.statLabel}>Rating</Text>
              </View>
            </View>

            <View style={styles.bioBlock}>
              <Text style={styles.publicQuote}>{bio.trim() || 'Bio not added'}</Text>
              <Text style={styles.specializationLine}>{specializationLabel}</Text>
            </View>

            <View style={styles.infoCardGrid}>
              {infoCards.map((item) => (
                <View key={item.key} style={styles.profileInfoCard}>
                  <Ionicons name={item.icon} size={14} color={theme.colors.accentStrong} />
                  <Text style={styles.profileInfoLabel}>{item.label}</Text>
                  <Text style={styles.profileInfoValue}>{item.value}</Text>
                </View>
              ))}
            </View>

            <View style={styles.timeSummaryCard}>
              <View style={styles.timeSummaryHead}>
                <View style={styles.timeSummaryCopy}>
                  <Text style={styles.timeSummaryTitle}>Time Management</Text>
                  <Text style={styles.timeSummaryStatus}>{timeManagementSummary}</Text>
                </View>
                <TouchableOpacity activeOpacity={0.9} style={styles.timeSummaryBtn} onPress={() => setMenuPanel('time')}>
                  <Text style={styles.timeSummaryBtnText}>Manage</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.timeSummaryGrid}>
                <View style={styles.timeSummaryItem}>
                  <Text style={styles.timeSummaryLabel}>Available Days</Text>
                  <Text style={styles.timeSummaryValue}>{availableDaysLabel}</Text>
                </View>
                <View style={styles.timeSummaryItem}>
                  <Text style={styles.timeSummaryLabel}>Working Hours</Text>
                  <Text style={styles.timeSummaryValue}>{workingHoursLabel}</Text>
                </View>
              </View>
              {!artistBookingVisibility ? <Text style={styles.timeSummaryHint}>Bookings are currently unavailable.</Text> : null}
              {artistTimePrefs.vacationMode && artistVacationReturnDate.trim() ? <Text style={styles.timeSummaryHint}>Available again on {artistVacationReturnDate.trim()}</Text> : null}
            </View>

            <View style={styles.tabRow}>
              {[
                { key: 'posts', label: 'Posts' },
                { key: 'reels', label: 'Reels' },
                { key: 'saved', label: 'Saved' },
              ].map((tab) => {
                const active = profileTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    activeOpacity={0.9}
                    onPress={() => setProfileTab(tab.key as typeof profileTab)}
                    style={[styles.profileTabPill, active && styles.profileTabPillActive]}
                  >
                    <Text style={[styles.profileTabText, active && styles.profileTabTextActive]}>{tab.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {profileTab === 'saved' ? (
              savedVisiblePosts.length ? (
                <FlatList
                  data={savedVisiblePosts}
                  keyExtractor={(item) => item.id}
                  numColumns={2}
                  scrollEnabled={false}
                  columnWrapperStyle={styles.gridRow}
                  contentContainerStyle={styles.gridList}
                  renderItem={({ item }) =>
                    renderGridTile({
                      id: item.id,
                      imageUrl: item.imageUrl ?? '',
                      videoUrl: item.videoUrl ?? '',
                    })
                  }
                />
              ) : (
                <View style={styles.emptyPanel}>
                  <Text style={styles.emptyTitle}>Saved content</Text>
                  <Text style={styles.hint}>Posts and reels you save from the app will appear here.</Text>
                </View>
              )
            ) : visiblePosts.length ? (
              <FlatList
                data={visiblePosts}
                keyExtractor={(item) => item.id}
                numColumns={2}
                scrollEnabled={false}
                columnWrapperStyle={styles.gridRow}
                contentContainerStyle={styles.gridList}
                renderItem={({ item }) => renderGridTile(item)}
              />
            ) : (
              <View style={styles.emptyPanel}>
                <Text style={styles.emptyTitle}>{profileTab === 'posts' ? 'No posts yet' : 'No reels yet'}</Text>
                <Text style={styles.hint}>{profileTab === 'posts' ? 'Uploaded tattoo images will appear here.' : 'Creative reels will appear here.'}</Text>
              </View>
            )}

            {false ? <View style={styles.profileMenu}>
              {[
                { key: 'edit', icon: 'create-outline' as const, title: 'Edit Profile', subtitle: 'Update your public artist details', onPress: () => setMenuPanel('profile') },
                {
                  key: 'verification',
                  icon: verificationStatus === 'approved' ? 'shield-checkmark' as const : 'shield-checkmark-outline' as const,
                  title: 'Verification',
                  subtitle: verificationStatus === 'approved' ? 'Verified · View approval' : verificationStatus === 'pending' || verificationStatus === 'pending_verification' ? 'Verification pending' : 'Complete one-time artist onboarding',
                  onPress: onOpenVerification,
                },
                { key: 'membership', icon: 'diamond-outline' as const, title: 'Membership', subtitle: verificationStatus === 'approved' ? 'Manage Founder / Founding access' : 'Available after verification', onPress: () => setMenuPanel('pro') },
                { key: 'revenue', icon: 'wallet-outline' as const, title: 'Revenue', subtitle: 'Collected amount and monthly insights', onPress: () => setMenuPanel('business') },
                { key: 'availability', icon: 'calendar-outline' as const, title: 'Availability', subtitle: timeManagementSummary, onPress: () => setMenuPanel('time') },
                { key: 'settings', icon: 'settings-outline' as const, title: 'Settings', subtitle: 'Appearance, privacy and support', onPress: () => setMenuPanel('settings_hub_v2') },
              ].map((item) => (
                <TouchableOpacity key={item.key} activeOpacity={0.85} style={styles.profileMenuRow} onPress={item.onPress}>
                  <View style={styles.profileMenuIcon}><Ionicons name={item.icon} size={19} color={theme.colors.accentStrong} /></View>
                  <View style={styles.profileMenuCopy}><Text style={styles.profileMenuTitle}>{item.title}</Text><Text style={styles.profileMenuSubtitle}>{item.subtitle}</Text></View>
                  <Ionicons name="chevron-forward" size={17} color={theme.colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View> : null}
          </View>

          ) : null}

          {menuPanel === 'notifications' ? (
          <View style={styles.card}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>Notifications</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.panelCloseBtn} onPress={() => setMenuPanel(null)}>
                <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            <View style={styles.settingSection}>
              <Text style={styles.settingSectionTitle}>Booking & System</Text>
              <View style={styles.settingRow}>
                <Ionicons name="calendar-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Booking Notifications</Text>
                  <Text style={styles.settingSub}>New booking requests and artist workflow alerts.</Text>
                </View>
                <Switch value={artistNotificationPrefs.newBookingRequest} onValueChange={(next) => setArtistNotificationPrefs((prev) => ({ ...prev, newBookingRequest: next, bookingReminder: next }))} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
              </View>
              <View style={styles.settingRow}>
                <Ionicons name="checkmark-done-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Booking Confirmations</Text>
                  <Text style={styles.settingSub}>Confirmed bookings and approval status updates.</Text>
                </View>
                <Switch value={artistNotificationPrefs.bookingConfirmed} onValueChange={(next) => setArtistNotificationPrefs((prev) => ({ ...prev, bookingConfirmed: next, bookingRejected: next }))} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
              </View>
              <View style={styles.settingRow}>
                <Ionicons name="ribbon-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Work Completed</Text>
                  <Text style={styles.settingSub}>Completion and payout related activity updates.</Text>
                </View>
                <Switch value={artistNotificationPrefs.paymentReceived} onValueChange={(next) => setArtistNotificationPrefs((prev) => ({ ...prev, paymentReceived: next, revenueUpdates: next }))} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
              </View>
              <View style={styles.settingRow}>
                <Ionicons name="sparkles-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Subscription Updates</Text>
                  <Text style={styles.settingSub}>Tatzo Pro, verification, and renewal updates.</Text>
                </View>
                <Switch value={artistNotificationPrefs.subscriptionRenewal} onValueChange={(next) => setArtistNotificationPrefs((prev) => ({ ...prev, subscriptionRenewal: next }))} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
              </View>
              <View style={styles.settingRow}>
                <Ionicons name="information-circle-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>System Messages</Text>
                  <Text style={styles.settingSub}>Tatzo updates, support messages, and app notices.</Text>
                </View>
                <Switch value={artistNotificationPrefs.newFeatures} onValueChange={(next) => setArtistNotificationPrefs((prev) => ({ ...prev, newFeatures: next, tatzoNews: next }))} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
              </View>
              <View style={styles.methodRow}>
                {[
                  ['Push', artistNotificationPrefs.push, 'push'],
                  ['Email', artistNotificationPrefs.email, 'email'],
                  ['SMS', artistNotificationPrefs.sms, 'sms'],
                ].map(([label, enabled, key]) => (
                  <TouchableOpacity
                    key={String(key)}
                    activeOpacity={0.9}
                    style={[styles.methodPill, enabled && styles.methodPillActive]}
                    onPress={() => {
                      const next = !enabled;
                      setArtistNotificationPrefs((prev) => ({ ...prev, [key as 'push' | 'email' | 'sms']: next }));
                      setNotifications((prev) => ({ ...prev, [key as 'push' | 'email' | 'sms']: next }));
                    }}
                  >
                    <Text style={[styles.methodText, enabled && styles.methodTextActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={styles.settingSection}>
              <Text style={styles.settingSectionTitle}>Recent Notification Center</Text>
              {artistNotifications.length ? artistNotifications.map((item) => (
                <View key={item.id} style={styles.settingRow}>
                  <Ionicons name="notifications-outline" size={18} color={theme.colors.accentStrong} />
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingTitle}>{item.title || item.type.replace(/_/g, ' ')}</Text>
                    <Text style={styles.settingSub}>{item.message || 'Notification received in your artist account.'}</Text>
                  </View>
                </View>
              )) : (
                <View style={styles.emptyPanel}>
                  <Text style={styles.emptyTitle}>No notifications yet</Text>
                  <Text style={styles.hint}>Booking, work completed, subscription, and system updates will appear here.</Text>
                </View>
              )}
            </View>
          </View>
          ) : null}

          {menuPanel === 'advanced' ? (
          <View style={styles.card}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>Profile Management</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.panelCloseBtn} onPress={() => setMenuPanel(null)}>
                <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity activeOpacity={0.9} style={styles.settingRow} onPress={() => setMenuPanel('pro')}>
              <Ionicons name="sparkles-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Launch Access</Text>
                <Text style={styles.settingSub}>Approved artists keep full access during launch.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.9} style={styles.settingRow} onPress={() => setMenuPanel('business')}>
              <Ionicons name="bar-chart-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Business Analytics</Text>
                <Text style={styles.settingSub}>Monthly revenue, total clients, bookings, conversion rate, and subscription status.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.9} style={styles.settingRow} onPress={() => setMenuPanel('profile')}>
              <Ionicons name="create-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Edit Profile</Text>
                <Text style={styles.settingSub}>Update artist info, bio, studio, and profile image.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.9} style={styles.settingRow} onPress={() => setMenuPanel('settings_hub_v2')}>
              <Ionicons name="settings-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Settings</Text>
                <Text style={styles.settingSub}>Appearance, privacy, time management, about, and help.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
          ) : null}

          {menuPanel === 'profile' ? (
          <View style={styles.card}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>Edit Profile</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.panelCloseBtn} onPress={() => setMenuPanel('advanced')}>
                <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            {loading ? <Text style={styles.hint}>Loading...</Text> : null}

            <Text style={styles.label}>Name</Text>
            <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} />

            <Text style={styles.label}>Email</Text>
            <TextInput value={email} editable={false} style={[styles.input, styles.inputDisabled]} />

            <Text style={styles.label}>Phone</Text>
            <TextInput value={phone} onChangeText={setPhone} style={styles.input} keyboardType="phone-pad" />

            <Text style={styles.label}>Bio</Text>
            <TextInput value={bio} onChangeText={setBio} style={[styles.input, styles.multiline]} multiline />

            <Text style={styles.label}>Artist Name</Text>
            <TextInput value={artistName} onChangeText={setArtistName} style={styles.input} />

            <Text style={styles.label}>Studio / Shop Name</Text>
            <TextInput
              value={studioName}
              onChangeText={setStudioName}
              style={styles.input}
              placeholder="ex: Ink Temple Studio"
              placeholderTextColor={theme.colors.textMuted}
            />

            <Text style={styles.label}>Shop Details</Text>
            <TextInput
              value={shopAddressLine}
              onChangeText={setShopAddressLine}
              style={styles.input}
              placeholder="ex: Private studio, Anna Nagar"
              placeholderTextColor={theme.colors.textMuted}
            />

            <Text style={styles.label}>Tattooing Since</Text>
            <TextInput
              value={artistSinceYear}
              onChangeText={setArtistSinceYear}
              style={styles.input}
              keyboardType="numeric"
              placeholder="ex: 2023"
              placeholderTextColor={theme.colors.textMuted}
            />

            <Text style={styles.label}>Location City</Text>
            <TextInput value={locationCity} onChangeText={setLocationCity} style={styles.input} />

            <Text style={styles.label}>Location Area</Text>
            <TextInput value={locationArea} onChangeText={setLocationArea} style={styles.input} />

            <Text style={styles.label}>Starting Price</Text>
            <TextInput value={startingPrice} onChangeText={setStartingPrice} style={styles.input} keyboardType="numeric" />

            <Text style={styles.label}>Experience</Text>
            <TextInput
              value={experience}
              onChangeText={setExperience}
              style={styles.input}
              placeholder="ex: 4 years"
              placeholderTextColor={theme.colors.textMuted}
            />

            <Text style={styles.label}>Styles / Tags (optional)</Text>
            <TextInput
              value={stylesText}
              onChangeText={setStylesText}
              style={styles.input}
              placeholder="fineline, blackwork, realism"
              placeholderTextColor={theme.colors.textMuted}
            />

            <View style={styles.famousHeader}>
              <Text style={styles.label}>Famous designs</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.smallAddBtn}
                onPress={() => setFamousDesigns((prev) => (prev.length >= 8 ? prev : [...prev, { name: '', priceRange: '' }]))}
              >
                <Ionicons name="add" size={14} color={theme.colors.accentStrong} />
                <Text style={styles.smallAddText}>Add</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>Examples: Portrait - Rs. 5,000-10,000, Geometric - Rs. 3,000-7,000.</Text>
            {famousDesigns.map((item, index) => (
              <View key={`famous_${index}`} style={styles.famousRow}>
                <TextInput
                  value={item.name}
                  onChangeText={(value) => setFamousDesigns((prev) => prev.map((row, i) => (i === index ? { ...row, name: value } : row)))}
                  style={[styles.input, styles.famousInput]}
                  placeholder="Design name"
                  placeholderTextColor={theme.colors.textMuted}
                />
                <TextInput
                  value={item.priceRange}
                  onChangeText={(value) => setFamousDesigns((prev) => prev.map((row, i) => (i === index ? { ...row, priceRange: value } : row)))}
                  style={[styles.input, styles.famousInput]}
                  placeholder="Price range"
                  placeholderTextColor={theme.colors.textMuted}
                />
                {famousDesigns.length > 1 ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.removeDesignBtn}
                    onPress={() => setFamousDesigns((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <Ionicons name="trash-outline" size={16} color={theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf'} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}

            <Text style={styles.label}>Profile Image</Text>
            <Text style={styles.hint}>Square image, cropped to center and compressed before upload.</Text>
            {profileImageUrl.trim() ? (
              <Image source={{ uri: profileImageUrl.trim() }} style={styles.profilePreviewImage} resizeMode="cover" />
            ) : null}
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.uploadBtn, uploadingProfileImage && styles.uploadBtnDisabled]}
              onPress={onPickAndUploadProfileImage}
              disabled={uploadingProfileImage || saving}
            >
              <Ionicons name="cloud-upload-outline" size={16} color={theme.colors.accentStrong} />
              <Text style={styles.uploadBtnText}>{uploadingProfileImage ? 'Uploading image...' : 'Change Profile Photo'}</Text>
            </TouchableOpacity>

            <GradientButton title={saving ? 'Saving...' : 'Save profile'} loading={saving} onPress={onSaveProfile} />
            <Text style={styles.hint}>Auto-save: {autosaveState === 'saving' ? 'Saving...' : autosaveState === 'saved' ? 'Saved' : autosaveState === 'error' ? 'Could not autosave. Use Save profile.' : 'Ready'}</Text>
          </View>
          ) : null}
          {menuPanel === 'business' ? (
          <View style={styles.card}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>Business Center</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.panelCloseBtn} onPress={() => setMenuPanel('advanced')}>
                <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Monthly Revenue</Text>
              <Text style={styles.infoValue}>₹{Math.round(totalRevenue)}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Total Clients</Text>
              <Text style={styles.infoValue}>{totalClients}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Total Bookings</Text>
              <Text style={styles.infoValue}>{totalBookings}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Conversion Rate</Text>
              <Text style={styles.infoValue}>{conversionRate}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Revenue Graph</Text>
              <Text style={styles.infoValue}>{monthlyRevenueBars.length ? 'Ready' : 'Awaiting data'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Subscription Status</Text>
              <Text style={styles.infoValue}>{subscriptionStatus.toUpperCase()}</Text>
            </View>
            {monthlyRevenueBars.length ? (
              <View style={styles.revenueBars}>
                {monthlyRevenueBars.map((bar) => (
                  <View key={bar.key} style={styles.revenueBarCol}>
                    <Text style={styles.revenueBarValue}>₹{Math.round(bar.value)}</Text>
                    <View style={styles.revenueBarTrack}>
                      <View style={[styles.revenueBarFill, { height: `${bar.height}%` }]} />
                    </View>
                    <Text style={styles.revenueBarLabel}>{bar.label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <View style={styles.emptyPanel}>
                <Text style={styles.emptyTitle}>Revenue Graph</Text>
                <Text style={styles.hint}>Collected artist payments start reflecting here once revenue data is saved.</Text>
              </View>
            )}
          </View>
          ) : null}

          {menuPanel === 'pro' ? (
            <View style={styles.card}>
              <View style={styles.panelHeader}>
                <Text style={styles.cardTitle}>Launch Access</Text>
                <TouchableOpacity activeOpacity={0.9} style={styles.panelCloseBtn} onPress={() => setMenuPanel('advanced')}>
                  <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
                </TouchableOpacity>
              </View>
              <View style={styles.proHead}>
                <View style={styles.proIcon}>
                  <Ionicons name="sparkles-outline" size={18} color={theme.colors.accentStrong} />
                </View>
                <View style={styles.proCopy}>
                  <Text style={styles.cardTitle}>Founding Artist Access</Text>
                  <Text style={styles.hint}>Approved artists keep full access during launch. No subscription paywall is required.</Text>
                </View>
                <Text style={[styles.proStatusPill, styles.proStatusGood]}>FREE</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Subscription</Text>
                <Text style={styles.infoValue}>DISABLED FOR LAUNCH</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Payment</Text>
                <Text style={styles.infoValue}>NOT REQUIRED</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Verification</Text>
                <Text style={styles.infoValue}>APPROVED ARTISTS ONLY</Text>
              </View>
            </View>
          ) : null}

          {menuPanel === 'settings_hub_v2' ? (
          <View style={styles.card}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>Settings</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.panelCloseBtn} onPress={() => setMenuPanel(null)}>
                <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            <Text style={styles.settingsHubLabel}>ACCOUNT</Text>
            <View style={styles.settingsHubGroup}>
              {renderSettingsHubRow('person-outline', 'Edit Profile', 'Public artist details and studio information', () => setMenuPanel('profile'))}
              {renderSettingsHubRow('key-outline', 'Change Password', 'Update your login password', () => setMenuPanel('privacy'))}
            </View>
            <Text style={styles.settingsHubLabel}>BUSINESS</Text>
            <View style={styles.settingsHubGroup}>
              {renderSettingsHubRow('shield-checkmark-outline', 'Verification', verificationStatus === 'approved' ? 'Verified artist account' : 'Complete one-time onboarding', () => onOpenVerification?.())}
              {renderSettingsHubRow('diamond-outline', 'Membership', 'Founder and Founding Artist access', () => setMenuPanel('pro'))}
              {renderSettingsHubRow('calendar-outline', 'Availability', timeManagementSummary, () => setMenuPanel('time'))}
              {renderSettingsHubRow('wallet-outline', 'Revenue', 'Collected amount and monthly insights', () => setMenuPanel('business'))}
            </View>
            <Text style={styles.settingsHubLabel}>PREFERENCES</Text>
            <View style={styles.settingsHubGroup}>
              {renderSettingsHubRow('color-palette-outline', 'Appearance', 'Theme and display preferences', () => setMenuPanel('appearance'))}
              {renderSettingsHubRow('notifications-outline', 'Notifications', 'Booking and account alerts', () => setMenuPanel('notifications'))}
            </View>
            <Text style={styles.settingsHubLabel}>PRIVACY</Text>
            <View style={styles.settingsHubGroup}>
              {renderSettingsHubRow('lock-closed-outline', 'Account Privacy', 'Profile, location and contact visibility', () => setMenuPanel('privacy'))}
              {renderSettingsHubRow('ban-outline', 'Blocked Users', 'Blocked accounts and report history', () => setMenuPanel('blockReport'))}
            </View>
            <Text style={styles.settingsHubLabel}>SUPPORT</Text>
            <View style={styles.settingsHubGroup}>
              {renderSettingsHubRow('help-circle-outline', 'Help Center', 'FAQ and artist workflow support', () => setMenuPanel('help'))}
              {renderSettingsHubRow('chatbubble-ellipses-outline', 'Contact Support', 'Contact the Tatzo team', () => setMenuPanel('help'))}
            </View>
            <Text style={styles.settingsHubLabel}>LEGAL</Text>
            <View style={styles.settingsHubGroup}>
              {renderSettingsHubRow('document-text-outline', 'Terms & Conditions', 'Tatzo platform usage terms', () => setMenuPanel('about'))}
              {renderSettingsHubRow('shield-checkmark-outline', 'Privacy Policy', 'How Tatzo protects account data', () => setMenuPanel('about'))}
              {renderSettingsHubRow('receipt-outline', 'Refund Policy', 'Booking and payment policy', () => setMenuPanel('about'))}
              {renderSettingsHubRow('people-outline', 'Community Guidelines', 'Safe marketplace standards', () => setMenuPanel('about'))}
            </View>
            <Text style={styles.settingsHubLabel}>DANGER</Text>
            <View style={styles.settingsHubGroup}>
              {renderSettingsHubRow('log-out-outline', 'Logout', 'Sign out from the artist dashboard', () => Alert.alert('Tatzo', 'Sign out?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: () => { void signOutAndCleanup({ deleteProfile: false }); } }]), true)}
            </View>
          </View>
          ) : null}

          {menuPanel === 'appearance' ? (
          <View style={styles.card}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>Appearance</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.panelCloseBtn} onPress={() => setMenuPanel('settings_hub_v2')}>
                <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            <View style={styles.settingRow}>
              <Ionicons name="moon-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Dark Theme</Text>
                <Text style={styles.settingSub}>Artist dashboard profile is fixed to dark mode for a clean premium look.</Text>
              </View>
              <Text style={styles.settingStateText}>Active</Text>
            </View>
            <View style={styles.settingRow}>
              <Ionicons name="speedometer-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Data Saver Mode</Text>
                <Text style={styles.settingSub}>Reduce heavy media load on slower Android data.</Text>
              </View>
              <Switch value={artistDataSaver} onValueChange={setDataSaverMode} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
            </View>
          </View>
          ) : null}

          {menuPanel === 'privacy' ? (
          <View style={styles.card}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>Account Privacy</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.panelCloseBtn} onPress={() => setMenuPanel('settings_hub_v2')}>
                <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            <Text style={styles.settingSectionTitle}>Profile Visibility</Text>
            <View style={styles.methodRow}>
              {(['Public', 'Private'] as const).map((option) => (
                <TouchableOpacity
                  key={option}
                  activeOpacity={0.9}
                  style={[styles.methodPill, artistProfileVisibility === option && styles.methodPillActive]}
                  onPress={() => {
                    setArtistProfileVisibility(option);
                    if (option === 'Private') setArtistPostVisibility('Followers Only');
                  }}
                >
                  <Text style={[styles.methodText, artistProfileVisibility === option && styles.methodTextActive]}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.settingSectionTitle}>Who can view my posts?</Text>
            <View style={styles.methodRow}>
              {(artistProfileVisibility === 'Private' ? (['Followers Only'] as const) : (['Everyone', 'Followers Only'] as const)).map((option) => (
                <TouchableOpacity key={option} activeOpacity={0.9} style={[styles.methodPill, artistPostVisibility === option && styles.methodPillActive]} onPress={() => setArtistPostVisibility(option)}>
                  <Text style={[styles.methodText, artistPostVisibility === option && styles.methodTextActive]}>{option}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.settingRow}>
              <Ionicons name="location-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Location Visibility</Text>
                <Text style={styles.settingSub}>{artistLocationVisibility === 'Hidden' ? 'Location Hidden' : 'Show city/location on profile and artist cards.'}</Text>
              </View>
            </View>
            <View style={styles.methodRow}>
              {(['City Only', 'Hidden'] as const).map((option) => (
                <TouchableOpacity key={option} activeOpacity={0.9} style={[styles.methodPill, artistLocationVisibility === option && styles.methodPillActive]} onPress={() => setArtistLocationVisibility(option)}>
                  <Text style={[styles.methodText, artistLocationVisibility === option && styles.methodTextActive]}>{option === 'City Only' ? 'Show Location' : 'Hide Location'}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.settingRow}>
              <Ionicons name="mail-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Show Contact Details</Text>
                <Text style={styles.settingSub}>{artistPrivacyPrefs.hideContact ? 'Direct contact details are hidden. Tatzo booking flow still works.' : 'Phone and email can appear on your profile.'}</Text>
              </View>
              <Switch value={!artistPrivacyPrefs.hideContact} onValueChange={(next) => setArtistPrivacyPrefs((prev) => ({ ...prev, hideContact: !next, showEmail: next }))} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
            </View>
            <View style={styles.settingRow}>
              <Ionicons name="calendar-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Booking Visibility</Text>
                <Text style={styles.settingSub}>{artistBookingVisibility ? 'Show Book Now and allow request flow.' : 'Bookings are currently unavailable.'}</Text>
              </View>
              <Switch value={artistBookingVisibility} onValueChange={setArtistBookingVisibility} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
            </View>
            <Text style={styles.settingSectionTitle}>Change Password</Text>
            <TextInput value={currentPassword} onChangeText={setCurrentPassword} secureTextEntry style={styles.input} placeholder="Current Password" placeholderTextColor={theme.colors.textMuted} />
            <TextInput value={newPassword} onChangeText={setNewPassword} secureTextEntry style={styles.input} placeholder="New Password" placeholderTextColor={theme.colors.textMuted} />
            <TextInput value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry style={styles.input} placeholder="Confirm Password" placeholderTextColor={theme.colors.textMuted} />
            <GradientButton title="Update password" onPress={onChangePassword} />
          </View>
          ) : null}

          {menuPanel === 'time' ? (
          <View style={styles.card}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>Time Management</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.panelCloseBtn} onPress={() => setMenuPanel('settings_hub_v2')}>
                <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            <Text style={styles.settingSectionTitle}>Availability Status</Text>
            <View style={styles.methodRow}>
              {(['Available', 'Unavailable'] as const).map((status) => (
                <TouchableOpacity
                  key={status}
                  activeOpacity={0.9}
                  style={[styles.methodPill, artistAvailabilityStatus === status && styles.methodPillActive]}
                  onPress={() => {
                    setArtistAvailabilityStatus(status);
                    if (status === 'Available') {
                      setArtistTimePrefs((prev) => ({ ...prev, vacationMode: false }));
                    }
                  }}
                >
                  <Text style={[styles.methodText, artistAvailabilityStatus === status && styles.methodTextActive]}>{status}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.settingSectionTitle}>Available Days</Text>
            <View style={styles.methodRow}>
              {WEEKDAY_OPTIONS.map((day) => {
                const active = artistAvailableDays.includes(day);
                return (
                  <TouchableOpacity
                    key={day}
                    activeOpacity={0.9}
                    style={[styles.methodPill, active && styles.methodPillActive]}
                    onPress={() => setArtistAvailableDays((prev) => (prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]))}
                  >
                    <Text style={[styles.methodText, active && styles.methodTextActive]}>{day.slice(0, 3)}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.settingSectionTitle}>Working Hours</Text>
            <View style={styles.settingRow}>
              <Ionicons name="time-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Start Time</Text>
                <TextInput value={artistStartTime} onChangeText={setArtistStartTime} placeholder="10:00 AM" placeholderTextColor={theme.colors.textMuted} style={styles.inlineInput} />
              </View>
            </View>
            <View style={styles.settingRow}>
              <Ionicons name="time-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>End Time</Text>
                <TextInput value={artistEndTime} onChangeText={setArtistEndTime} placeholder="8:00 PM" placeholderTextColor={theme.colors.textMuted} style={styles.inlineInput} />
              </View>
            </View>
            <View style={styles.settingRow}>
              <Ionicons name="airplane-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Vacation Mode</Text>
                <Text style={styles.settingSub}>{artistTimePrefs.vacationMode ? 'On Vacation badge is active and new bookings are blocked.' : 'Pause fresh bookings while keeping confirmed bookings intact.'}</Text>
              </View>
              <Switch value={artistTimePrefs.vacationMode} onValueChange={(next) => setArtistTimePrefs((prev) => ({ ...prev, vacationMode: next }))} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
            </View>
            <View style={styles.settingRow}>
              <Ionicons name="calendar-clear-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Vacation Return Date</Text>
                <TextInput value={artistVacationReturnDate} onChangeText={setArtistVacationReturnDate} placeholder="2026-06-30" placeholderTextColor={theme.colors.textMuted} style={styles.inlineInput} />
              </View>
            </View>
            {artistTimePrefs.vacationMode && artistVacationReturnDate.trim() ? <Text style={styles.hint}>Available again on {artistVacationReturnDate.trim()}</Text> : null}
          </View>
          ) : null}

          {false ? (
          <View style={styles.card}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>Settings</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.panelCloseBtn} onPress={() => setMenuPanel('advanced')}>
                <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            <View style={styles.settingSection}>
              <Text style={styles.settingSectionTitle}>Appearance</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.settingRow} onPress={() => setThemePreference('dark')}>
                <Ionicons name="moon-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Dark Theme</Text>
                  <Text style={styles.settingSub}>Deep black with purple neon accents.</Text>
                </View>
                <Text style={styles.settingStateText}>{themePreference === 'dark' ? 'Active' : 'Select'}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.9} style={styles.settingRow} onPress={() => setThemePreference('light')}>
                <Ionicons name="sunny-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Light Theme</Text>
                  <Text style={styles.settingSub}>White with neon electric blue accents.</Text>
                </View>
                <Text style={styles.settingStateText}>{themePreference === 'light' ? 'Active' : 'Select'}</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.9} style={styles.settingRow} onPress={() => setThemePreference('system')}>
                <Ionicons name="phone-portrait-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>System Theme</Text>
                  <Text style={styles.settingSub}>Match Tatzo with your device theme automatically.</Text>
                </View>
                <Text style={styles.settingStateText}>{themePreference === 'system' ? 'Active' : 'Select'}</Text>
              </TouchableOpacity>
              <View style={styles.methodRow}>
                {(['Small', 'Medium', 'Large'] as const).map((size) => (
                  <TouchableOpacity key={size} activeOpacity={0.9} style={[styles.methodPill, artistFontSize === size && styles.methodPillActive]} onPress={() => setFontSizeMode(size === 'Small' ? 'small' : size === 'Large' ? 'large' : 'medium')}>
                    <Text style={[styles.methodText, artistFontSize === size && styles.methodTextActive]}>{size}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.settingRow}>
                <Ionicons name="speedometer-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Data Saver Mode</Text>
                  <Text style={styles.settingSub}>Reduce heavy media load on slower Android data.</Text>
                </View>
                <Switch value={artistDataSaver} onValueChange={setDataSaverMode} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
              </View>
            </View>

            <View style={styles.settingSection}>
              <Text style={styles.settingSectionTitle}>Account Privacy</Text>
              <View style={styles.methodRow}>
                {(['Public', 'Private'] as const).map((option) => (
                  <TouchableOpacity key={option} activeOpacity={0.9} style={[styles.methodPill, artistProfileVisibility === option && styles.methodPillActive]} onPress={() => setArtistProfileVisibility(option)}>
                    <Text style={[styles.methodText, artistProfileVisibility === option && styles.methodTextActive]}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.settingRow}>
                <Ionicons name="mail-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Show Email</Text>
                  <Text style={styles.settingSub}>Show artist mail on visible profile.</Text>
                </View>
                <Switch value={artistPrivacyPrefs.showEmail} onValueChange={(next) => setArtistPrivacyPrefs((prev) => ({ ...prev, showEmail: next }))} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
              </View>
              <View style={styles.settingRow}>
                <Ionicons name="lock-closed-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Hide Contact Details</Text>
                  <Text style={styles.settingSub}>Keep personal contact secured inside Tatzo.</Text>
                </View>
                <Switch value={artistPrivacyPrefs.hideContact} onValueChange={(next) => setArtistPrivacyPrefs((prev) => ({ ...prev, hideContact: next }))} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
              </View>
              <View style={styles.methodRow}>
                {(['Exact Location', 'City Only', 'Hidden'] as const).map((option) => (
                  <TouchableOpacity key={option} activeOpacity={0.9} style={[styles.methodPill, artistLocationVisibility === option && styles.methodPillActive]} onPress={() => setArtistLocationVisibility(option)}>
                    <Text style={[styles.methodText, artistLocationVisibility === option && styles.methodTextActive]}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.settingRow}>
                <Ionicons name="calendar-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Booking Visibility</Text>
                  <Text style={styles.settingSub}>{artistBookingVisibility ? 'Show Book Now and allow request flow.' : 'Bookings are currently unavailable.'}</Text>
                </View>
                <Switch value={artistBookingVisibility} onValueChange={setArtistBookingVisibility} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
              </View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Change Password</Text><Text style={styles.infoValue}>Available</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Two-Factor Authentication</Text><Text style={styles.infoValue}>Later</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Login Activity</Text><Text style={styles.infoValue}>Soon</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Active Devices</Text><Text style={styles.infoValue}>Soon</Text></View>
              <View style={styles.settingBulletRow}><Text style={styles.settingBullet}>•</Text><Text style={styles.settingBulletText}>Profile visibility</Text></View>
              <View style={styles.settingBulletRow}><Text style={styles.settingBullet}>•</Text><Text style={styles.settingBulletText}>Show location</Text></View>
              <View style={styles.settingBulletRow}><Text style={styles.settingBullet}>•</Text><Text style={styles.settingBulletText}>Show contact details</Text></View>
              <View style={styles.settingBulletRow}><Text style={styles.settingBullet}>•</Text><Text style={styles.settingBulletText}>Account privacy controls</Text></View>
              <TouchableOpacity activeOpacity={0.9} style={styles.settingRow} onPress={() => setMenuPanel('blockReport')}>
                <Ionicons name="shield-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Blocked / Reported</Text>
                  <Text style={styles.settingSub}>Blocked users list and report history live here.</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.settingSection}>
              <Text style={styles.settingSectionTitle}>Time Management</Text>
              <View style={styles.methodRow}>
                {(['Available', 'Unavailable'] as const).map((status) => (
                  <TouchableOpacity
                    key={status}
                    activeOpacity={0.9}
                    style={[styles.methodPill, artistAvailabilityStatus === status && styles.methodPillActive]}
                    onPress={() => {
                      setArtistAvailabilityStatus(status);
                      if (status === 'Available') {
                        setArtistTimePrefs((prev) => ({ ...prev, vacationMode: false }));
                      }
                    }}
                  >
                    <Text style={[styles.methodText, artistAvailabilityStatus === status && styles.methodTextActive]}>{status}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.settingSub}>Available Days</Text>
              <View style={styles.methodRow}>
                {WEEKDAY_OPTIONS.map((day) => {
                  const active = artistAvailableDays.includes(day);
                  return (
                    <TouchableOpacity
                      key={day}
                      activeOpacity={0.9}
                      style={[styles.methodPill, active && styles.methodPillActive]}
                      onPress={() => setArtistAvailableDays((prev) => (prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day]))}
                    >
                      <Text style={[styles.methodText, active && styles.methodTextActive]}>{day.slice(0, 3)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.settingRow}>
                <Ionicons name="time-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Start Time</Text>
                  <TextInput value={artistStartTime} onChangeText={setArtistStartTime} placeholder="10:00 AM" placeholderTextColor={theme.colors.textMuted} style={styles.inlineInput} />
                </View>
              </View>
              <View style={styles.settingRow}>
                <Ionicons name="time-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>End Time</Text>
                  <TextInput value={artistEndTime} onChangeText={setArtistEndTime} placeholder="8:00 PM" placeholderTextColor={theme.colors.textMuted} style={styles.inlineInput} />
                </View>
              </View>
              <View style={styles.settingRow}>
                <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Manual Approval</Text>
                  <Text style={styles.settingSub}>Artist reviews each booking before confirming.</Text>
                </View>
                <Switch value={artistTimePrefs.manualApproval} onValueChange={(next) => setArtistTimePrefs((prev) => ({ ...prev, manualApproval: next }))} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
              </View>
              <View style={styles.settingRow}>
                <Ionicons name="airplane-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Enable Vacation</Text>
                  <Text style={styles.settingSub}>Pause bookings while away from studio.</Text>
                </View>
                <Switch value={artistTimePrefs.vacationMode} onValueChange={(next) => setArtistTimePrefs((prev) => ({ ...prev, vacationMode: next }))} trackColor={{ false: theme.colors.border, true: theme.colors.accent }} thumbColor={theme.colors.textInverse} />
              </View>
              <View style={styles.settingRow}>
                <Ionicons name="calendar-clear-outline" size={18} color={theme.colors.accentStrong} />
                <View style={styles.settingCopy}>
                  <Text style={styles.settingTitle}>Vacation Return Date</Text>
                  <TextInput value={artistVacationReturnDate} onChangeText={setArtistVacationReturnDate} placeholder="2026-06-30" placeholderTextColor={theme.colors.textMuted} style={styles.inlineInput} />
                </View>
              </View>
              <View style={styles.settingBulletRow}><Text style={styles.settingBullet}>•</Text><Text style={styles.settingBulletText}>Available days</Text></View>
              <View style={styles.settingBulletRow}><Text style={styles.settingBullet}>•</Text><Text style={styles.settingBulletText}>Available time slots</Text></View>
              <View style={styles.settingBulletRow}><Text style={styles.settingBullet}>•</Text><Text style={styles.settingBulletText}>Vacation mode</Text></View>
              <View style={styles.settingBulletRow}><Text style={styles.settingBullet}>•</Text><Text style={styles.settingBulletText}>Booking availability controls</Text></View>
            </View>
            <TouchableOpacity activeOpacity={0.9} style={styles.settingRow} onPress={() => setMenuPanel('about')}>
              <Ionicons name="information-circle-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>About</Text>
                <Text style={styles.settingSub}>Legal, app info, release notes, company details, and policies.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.9} style={styles.settingRow} onPress={() => setMenuPanel('help')}>
              <Ionicons name="help-circle-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Help</Text>
                <Text style={styles.settingSub}>Workflow guides, payment process, privacy, FAQ, support, and feedback.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.settingRow, styles.settingDanger]}
              onPress={() => {
                Alert.alert('Tatzo', 'Sign out?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Sign out',
                    style: 'destructive',
                    onPress: () => {
                      void signOutAndCleanup({ deleteProfile: false });
                    },
                  },
                ]);
              }}
            >
              <Ionicons name="log-out-outline" size={18} color={theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf'} />
              <View style={styles.settingCopy}>
                <Text style={[styles.settingTitle, styles.dangerText]}>Logout</Text>
                <Text style={styles.settingSub}>Sign out from the artist dashboard.</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>
          ) : null}

          {menuPanel === 'blockReport' ? (
          <View style={styles.card}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>Blocked / Reported</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.panelCloseBtn} onPress={() => setMenuPanel('settings_hub_v2')}>
                <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            {blockedUsers.length ? (
              blockedUsers.map((item) => (
                <View key={item.id} style={styles.settingRow}>
                  {item.blockedProfileImageUrl ? (
                    <Image source={{ uri: item.blockedProfileImageUrl }} style={styles.notificationAvatar} resizeMode="cover" />
                  ) : (
                    <View style={styles.notificationAvatarFallback}>
                      <Text style={styles.notificationAvatarText}>{String(item.blockedName ?? 'U').slice(0, 1).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingTitle}>{item.blockedName?.trim() || 'Blocked user'}</Text>
                    <Text style={styles.settingSub}>Blocked on {formatDateLabel(item.blockedAt)}</Text>
                  </View>
                  <TouchableOpacity activeOpacity={0.9} style={styles.inlineActionBtn} onPress={() => void onUnblockUser(item.id)}>
                    <Text style={styles.inlineActionText}>Unblock</Text>
                  </TouchableOpacity>
                </View>
              ))
            ) : (
              <View style={styles.emptyPanel}>
                <Text style={styles.emptyTitle}>Blocked Users</Text>
                <Text style={styles.hint}>Blocked profiles will appear here and can be removed instantly.</Text>
              </View>
            )}
            {reportHistory.length ? (
              reportHistory.map((item) => (
                <View key={item.id} style={styles.settingRow}>
                  <Ionicons name="alert-circle-outline" size={18} color={theme.colors.accentStrong} />
                  <View style={styles.settingCopy}>
                    <Text style={styles.settingTitle}>Report #{String(item.postId ?? item.id).slice(0, 8)}</Text>
                    <Text style={styles.settingSub}>{item.reason?.trim() || 'Reason not available'} • {String(item.status ?? 'under review')}</Text>
                  </View>
                </View>
              ))
            ) : (
              <View style={styles.emptyPanel}>
                <Text style={styles.emptyTitle}>Report history</Text>
                <Text style={styles.hint}>Posts you report from Tatzo will appear here.</Text>
              </View>
            )}
          </View>
          ) : null}

          {menuPanel === 'about' ? (
          <View style={styles.card}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>About</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.panelCloseBtn} onPress={() => setMenuPanel('settings_hub_v2')}>
                <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity activeOpacity={0.9} style={styles.settingRow} onPress={() => Linking.openURL('https://tatzo-as0711.web.app/terms.html').catch(() => Alert.alert('Tatzo', 'Terms page is not available right now.'))}>
              <Ionicons name="document-text-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Terms & Conditions</Text>
                <Text style={styles.settingSub}>Tatzo terms for booking, content, and profile usage.</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.9} style={styles.settingRow} onPress={() => Linking.openURL('https://tatzo-as0711.web.app/privacy-policy.html').catch(() => Alert.alert('Tatzo', 'Privacy page is not available right now.'))}>
              <Ionicons name="lock-closed-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Privacy Policy</Text>
                <Text style={styles.settingSub}>How profile, booking, upload, and payment data is handled.</Text>
              </View>
              <Ionicons name="open-outline" size={16} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <View style={styles.settingRow}>
              <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Artist Policy</Text>
                <Text style={styles.settingSub}>Verified artists must maintain safe, original, and policy-compliant work on Tatzo.</Text>
              </View>
            </View>
            <View style={styles.settingRow}>
              <Ionicons name="phone-portrait-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>App Version</Text>
                <Text style={styles.settingSub}>Current Tatzo artist dashboard build information.</Text>
              </View>
            </View>
            <View style={styles.settingRow}>
              <Ionicons name="sparkles-outline" size={18} color={theme.colors.accentStrong} />
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>What's New</Text>
                <Text style={styles.settingSub}>Latest updates include privacy, booking, and profile customization improvements.</Text>
              </View>
            </View>
          </View>
          ) : null}

          {menuPanel === 'help' ? (
          <View style={styles.card}>
            <View style={styles.panelHeader}>
              <Text style={styles.cardTitle}>Help</Text>
              <TouchableOpacity activeOpacity={0.9} style={styles.panelCloseBtn} onPress={() => setMenuPanel('settings_hub_v2')}>
                <Ionicons name="close" size={14} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>How Tatzo Works</Text>
              <Text style={styles.hint}>Tatzo flow: artist creates profile → uploads portfolio → receives booking requests → sends quote → completes work → tracks revenue and trust.</Text>
            </View>
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>Artist Onboarding Guide</Text>
              <Text style={styles.hint}>Complete profile, upload posts and reels, review settings, and keep availability updated before taking bookings.</Text>
            </View>
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>Booking Workflow Guide</Text>
              <Text style={styles.hint}>User finds artist → books slot → artist reviews → quote gets shared → work completes → revenue gets tracked.</Text>
            </View>
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>Privacy & Security</Text>
              <Text style={styles.hint}>Tatzo keeps profile, booking, upload, and payment setup data inside secured app collections and controlled artist views.</Text>
            </View>
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>Terms & Conditions</Text>
              <Text style={styles.hint}>Use only original work, follow artist policy, and keep client communication and bookings professional inside Tatzo.</Text>
            </View>
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>FAQ</Text>
              <Text style={styles.hint}>Common topics: saved posts, profile visibility, Pro subscription, booking requests, and revenue tracking.</Text>
            </View>
            <View style={styles.emptyPanel}>
              <Text style={styles.emptyTitle}>Contact Support</Text>
              <Text style={styles.hint}>Support connection can be linked next for direct artist help inside Tatzo.</Text>
            </View>
          </View>
          ) : null}
        </View>
      )}
      />
      <ArtistMediaViewer item={selectedMedia} onClose={() => setSelectedMedia(null)} />
    </>
  );
};

const mediaViewerStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000', paddingTop: 42, paddingBottom: 24 },
  header: { minHeight: 52, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  closeButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.10)' },
  media: { flex: 1, marginHorizontal: 8, overflow: 'hidden', backgroundColor: '#000000' },
  caption: { color: 'rgba(255,255,255,0.86)', fontSize: 14, lineHeight: 20, paddingHorizontal: 18, paddingTop: 14 },
});

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 120,
    },
    headWrap: {
      gap: 12,
      marginBottom: 12,
    },
    externalHeader: {
      gap: 12,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.title,
      fontFamily: theme.fonts.display,
      textShadowColor: theme.mode === 'light' ? 'rgba(168,85,247,0.12)' : 'rgba(168,85,247,0.34)',
      textShadowRadius: 6,
    },
    sectionBadge: {
      color: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      fontSize: Math.max(10, theme.typography.caption - 1),
      fontWeight: '700',
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(168,85,247,0.28)' : 'rgba(168,85,247,0.32)',
    },
    stack: {
      gap: 6,
    },
    heroCard: {
      borderRadius: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
      paddingHorizontal: 4,
      paddingVertical: 8,
      gap: 14,
      shadowOpacity: 0,
      elevation: 0,
    },
    heroBackdropWrap: {
      height: 150,
      borderRadius: 22,
      overflow: 'hidden',
      backgroundColor: theme.mode === 'light' ? '#E9EEF6' : '#11131a',
      marginBottom: 0,
    },
    heroBackdrop: {
      ...StyleSheet.absoluteFillObject,
      width: '100%',
      height: '100%',
      opacity: theme.mode === 'light' ? 0.98 : 0.94,
    },
    heroBackdropOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.mode === 'light' ? 'rgba(245,248,255,0.16)' : 'rgba(8,8,12,0.28)',
    },
    coverUploadCta: {
      position: 'absolute',
      left: 14,
      right: 14,
      bottom: 16,
      minHeight: 52,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(255,255,255,0.44)' : 'rgba(255,255,255,0.2)',
      backgroundColor: theme.mode === 'light' ? 'rgba(168,85,247,0.18)' : 'rgba(8,12,18,0.38)',
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 12,
      zIndex: 2,
    },
    coverUploadCtaText: {
      color: theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '900',
      letterSpacing: 0.3,
    },
    heroTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    heroTopActions: {
      flexDirection: 'row',
      gap: 8,
    },
    heroIconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F1F1F5' : 'rgba(255,255,255,0.05)',
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    avatarWrap: {
      position: 'relative',
    },
    publicProfileHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    publicAvatar: {
      width: 76,
      height: 76,
      borderRadius: 38,
      borderWidth: 0,
      backgroundColor: theme.colors.backgroundAlt,
    },
    publicAvatarFallback: {
      width: 76,
      height: 76,
      borderRadius: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.accentSoft,
    },
    avatarTick: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 16,
      height: 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentStrong,
      borderWidth: 2,
      borderColor: theme.mode === 'light' ? '#FFFFFF' : '#09090d',
    },
    profileMetaBlock: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    publicAvatarText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.heading,
      fontWeight: '900',
    },
    publicProfileCopy: {
      flex: 1,
      gap: 4,
    },
    publicNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    publicName: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.title,
      fontWeight: '900',
    },
    publicHandle: {
      color: theme.colors.accentStrong,
      fontSize: Math.max(10, theme.typography.caption - 1),
      fontWeight: '800',
    },
    publicStudio: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.caption,
      fontWeight: '800',
    },
    publicMeta: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
      fontWeight: '700',
    },
    profileEditButton: {
      alignSelf: 'flex-start',
      minHeight: 38,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      borderRadius: 999,
      paddingHorizontal: 15,
      marginLeft: 86,
      backgroundColor: theme.colors.accentSoft,
    },
    profileEditButtonText: {
      color: theme.colors.accentStrong,
      fontSize: theme.typography.caption,
      fontWeight: '900',
    },
    publicQuote: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '800',
      lineHeight: theme.typography.bodyLg + 3,
    },
    specializationLine: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
      fontWeight: '700',
      lineHeight: theme.typography.body + 4,
    },
    bioBlock: {
      gap: 5,
    },
    statsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)',
    },
    statItem: {
      flex: 1,
      alignItems: 'center',
      gap: 2,
    },
    statsDivider: {
      width: StyleSheet.hairlineWidth,
      height: 28,
      backgroundColor: theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)',
    },
    statValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.bodyLg,
      fontWeight: '900',
    },
    statLabel: {
      color: theme.colors.textMuted,
      fontSize: Math.max(10, theme.typography.caption - 1),
      fontWeight: '700',
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    profileActionBtn: {
      flex: 1,
      minHeight: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F5F5F8' : 'rgba(255,255,255,0.05)',
    },
    primaryActionBtn: {
      borderWidth: 1,
      backgroundColor: theme.mode === 'light' ? 'rgba(64,148,255,0.16)' : 'rgba(122, 92, 255, 0.18)',
      borderColor: theme.mode === 'light' ? 'rgba(64,148,255,0.36)' : 'rgba(122, 92, 255, 0.42)',
    },
    primaryActionText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.caption,
      fontWeight: '900',
    },
    secondaryActionText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.caption,
      fontWeight: '800',
    },
    iconActionBtn: {
      width: 40,
      height: 40,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
    },
    infoCardGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    profileInfoCard: {
      width: '31.5%',
      borderRadius: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
      paddingHorizontal: 4,
      paddingVertical: 6,
      gap: 3,
    },
    profileInfoLabel: {
      color: theme.colors.textMuted,
      fontSize: Math.max(10, theme.typography.caption - 1),
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    profileInfoValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.caption,
      fontWeight: '900',
    },
    timeSummaryCard: {
      marginTop: 4,
      borderRadius: 0,
      borderWidth: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)',
      backgroundColor: 'transparent',
      paddingTop: 12,
      gap: 8,
    },
    timeSummaryHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    timeSummaryCopy: {
      flex: 1,
      gap: 3,
    },
    timeSummaryTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '900',
    },
    timeSummaryStatus: {
      color: theme.colors.accent,
      fontSize: theme.typography.caption,
      fontWeight: '800',
    },
    timeSummaryBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    timeSummaryBtnText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: Math.max(11, theme.typography.caption - 1),
      fontWeight: '900',
      letterSpacing: 0.3,
    },
    timeSummaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    timeSummaryItem: {
      flex: 1,
      minWidth: 122,
      borderRadius: 14,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F5F5F8' : 'rgba(255,255,255,0.035)',
      paddingHorizontal: 9,
      paddingVertical: 9,
      gap: 3,
    },
    timeSummaryLabel: {
      color: theme.colors.textMuted,
      fontSize: Math.max(10, theme.typography.caption - 1),
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.6,
    },
    timeSummaryValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.caption,
      fontWeight: '900',
    },
    timeSummaryHint: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
      fontWeight: '700',
      lineHeight: theme.typography.caption + 5,
    },
    tabRow: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)',
    },
    profileTabPill: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 10,
      borderRadius: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
    },
    profileTabPillActive: {
      borderWidth: 0,
      borderBottomWidth: 2,
      borderBottomColor: theme.colors.accent,
      backgroundColor: 'transparent',
    },
    profileTabText: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
      fontWeight: '800',
    },
    profileTabTextActive: {
      color: theme.colors.accent,
    },
    gridList: {
      gap: 8,
    },
    gridRow: {
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    gridTile: {
      width: '48.6%',
      aspectRatio: 0.8,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#E9EEF6' : '#11131a',
    },
    gridTileImage: {
      width: '100%',
      height: '100%',
    },
    gridTileFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    gridPlayBadge: {
      position: 'absolute',
      right: 8,
      bottom: 8,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(8,8,12,0.72)',
    },
    emptyPanel: {
      borderRadius: 18,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F5F5F8' : 'rgba(255,255,255,0.04)',
      padding: 14,
      gap: 3,
    },
    emptyTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '900',
    },
    profileMenu: {
      marginTop: 6,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)',
    },
    profileMenuRow: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingVertical: 9,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)',
    },
    profileMenuIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
    },
    profileMenuCopy: {
      flex: 1,
      gap: 2,
    },
    profileMenuTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '900',
    },
    profileMenuSubtitle: {
      color: theme.colors.textMuted,
      fontSize: Math.max(10, theme.typography.caption - 1),
      fontWeight: '700',
    },
    mediaTabRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 4,
    },
    mediaTab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 40,
      borderRadius: 14,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F5F5F8' : 'rgba(255, 255, 255, 0.05)',
    },
    mediaTabActive: {
      borderWidth: 1,
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    mediaTabText: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    mediaTabTextActive: {
      color: theme.colors.accent,
    },
    mediaList: {
      gap: 10,
      paddingTop: 2,
    },
    mediaCard: {
      width: 120,
      height: 150,
      borderRadius: 18,
      overflow: 'hidden',
      borderWidth: 0,
      backgroundColor: theme.colors.surface,
    },
    mediaTile: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.backgroundAlt,
      gap: 6,
    },
    mediaTileText: {
      color: theme.colors.textInverse,
      fontSize: theme.typography.caption,
      fontWeight: '800',
    },
    mediaTileImage: {
      width: '100%',
      height: '100%',
    },
    card: {
      borderRadius: 20,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.96)' : 'rgba(24,24,24,0.96)',
      padding: 10,
      gap: 6,
      shadowColor: theme.colors.accent,
      shadowOpacity: theme.mode === 'light' ? 0.03 : 0.05,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 8 },
      elevation: 1,
    },
    cardTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.bodyLg,
      fontWeight: '900',
      marginBottom: 4,
    },
    settingSection: {
      gap: 8,
      paddingTop: 6,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    settingSectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '900',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    settingStateText: {
      color: theme.colors.accentStrong,
      fontSize: theme.typography.caption,
      fontWeight: '900',
    },
    settingBulletRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      paddingHorizontal: 4,
    },
    settingBullet: {
      color: theme.colors.accentStrong,
      fontSize: 12,
      fontWeight: '900',
      marginTop: 1,
    },
    settingBulletText: {
      flex: 1,
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
    },
    panelHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    panelActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    panelCloseBtn: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.05)',
    },
    label: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginTop: 2,
    },
    input: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.06)',
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      paddingHorizontal: 12,
      paddingVertical: 10,
      fontSize: 13,
    },
    inputDisabled: {
      opacity: 0.7,
    },
    multiline: {
      minHeight: 82,
      textAlignVertical: 'top',
    },
    famousHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginTop: 2,
    },
    smallAddBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    smallAddText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    famousRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    famousInput: {
      flex: 1,
      minWidth: 0,
    },
    removeDesignBtn: {
      width: 42,
      minHeight: 42,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.38)' : 'rgba(255, 211, 207, 0.34)',
      backgroundColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.08)' : 'rgba(142, 75, 69, 0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    profilePreviewImage: {
      width: 112,
      height: 112,
      borderRadius: 30,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.backgroundAlt,
      alignSelf: 'center',
      marginVertical: 4,
    },
    coverPreviewImage: {
      width: '100%',
      height: 140,
      borderRadius: 20,
      borderWidth: 0,
      backgroundColor: theme.colors.backgroundAlt,
      marginVertical: 4,
    },
    coverPreviewPlaceholder: {
      width: '100%',
      height: 140,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginVertical: 4,
    },
    uploadBtn: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      minHeight: 42,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    uploadBtnDisabled: {
      opacity: 0.65,
    },
    uploadBtnText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    removeCoverBtn: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.38)' : 'rgba(255, 211, 207, 0.28)',
      backgroundColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.08)' : 'rgba(142, 75, 69, 0.12)',
      minHeight: 40,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    removeCoverText: {
      color: theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf',
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    hint: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    revenueHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    revenueBars: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      gap: 8,
      minHeight: 140,
      paddingTop: 10,
    },
    revenueBarCol: {
      flex: 1,
      alignItems: 'center',
      gap: 8,
    },
    revenueBarTrack: {
      width: '100%',
      height: 110,
      borderRadius: 14,
      justifyContent: 'flex-end',
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.06)' : 'rgba(255,255,255,0.05)',
      overflow: 'hidden',
      padding: 4,
    },
    revenueBarFill: {
      width: '100%',
      borderRadius: 12,
      backgroundColor: theme.colors.accent,
      minHeight: 8,
    },
    revenueBarLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '800',
    },
    revenueBarValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '900',
    },
    proHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    proIcon: {
      width: 42,
      height: 42,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(0, 229, 255, 0.3)' : 'rgba(0, 229, 255, 0.42)',
      backgroundColor: theme.mode === 'light' ? 'rgba(0, 229, 255, 0.1)' : 'rgba(0, 229, 255, 0.12)',
    },
    proCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    proStatusPill: {
      overflow: 'hidden',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      borderWidth: 1,
    },
    proStatusGood: {
      color: theme.mode === 'light' ? '#1f6f3d' : '#b3ffd2',
      borderColor: theme.mode === 'light' ? 'rgba(31, 111, 61, 0.36)' : 'rgba(179, 255, 210, 0.34)',
      backgroundColor: theme.mode === 'light' ? 'rgba(31, 111, 61, 0.1)' : 'rgba(31, 111, 61, 0.18)',
    },
    proStatusWarn: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.28)' : 'rgba(122, 92, 255, 0.45)',
      backgroundColor: theme.colors.accentSoft,
    },
    proDetails: {
      gap: 8,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.22)' : 'rgba(122, 92, 255, 0.34)',
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.08)' : 'rgba(122, 92, 255, 0.12)',
      padding: 10,
    },
    benefitLine: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 17,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 14,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.04)',
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    infoLabel: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    infoValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    methodRow: {
      flexDirection: 'row',
      gap: 8,
    },
    methodPill: {
      flex: 1,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceMuted,
      paddingVertical: 10,
      alignItems: 'center',
    },
    methodPillActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    methodText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.5,
    },
    methodTextActive: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
    },
    infoLine: {
      color: theme.mode === 'light' ? '#2f4c7b' : '#b8d5ff',
      fontSize: 12,
      fontWeight: '700',
    },
    offerLine: {
      color: theme.mode === 'light' ? '#512aa5' : '#d9ceff',
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 17,
    },
    goodLine: {
      color: theme.mode === 'light' ? '#2f6a3b' : '#b3ffd2',
      fontSize: 12,
      fontWeight: '700',
    },
    warnLine: {
      color: theme.mode === 'light' ? '#7b2f2f' : '#ffc8c3',
      fontSize: 12,
      fontWeight: '700',
    },
    ctaBtn: {
      marginTop: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.35)' : 'rgba(122, 92, 255, 0.45)',
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.14)' : 'rgba(122, 92, 255, 0.2)',
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    ctaBtnDisabled: {
      opacity: 0.68,
    },
    ctaText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    refreshBtn: {
      marginTop: 4,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.06)',
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    refreshBtnDisabled: {
      opacity: 0.7,
    },
    refreshText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.35,
      textTransform: 'uppercase',
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 0,
      borderWidth: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)',
      backgroundColor: 'transparent',
      paddingHorizontal: 11,
      paddingVertical: 11,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 4 },
    },
    settingsHubLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.1,
      marginTop: 8,
      marginLeft: 4,
      marginBottom: -2,
    },
    settingsHubGroup: {
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.03)',
    },
    settingsHubIcon: {
      width: 36,
      height: 36,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
    },
    settingsHubIconDanger: {
      backgroundColor: 'rgba(251,113,133,0.10)',
    },
    settingCopy: {
      flex: 1,
      minWidth: 0,
      gap: 0,
    },
    notificationAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
    },
    notificationAvatarFallback: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
    },
    notificationAvatarText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    settingTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '900',
    },
    settingSub: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
      fontWeight: '700',
      lineHeight: 15,
    },
    inlineInput: {
      marginTop: 6,
      borderRadius: 12,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F5F5F8' : 'rgba(255,255,255,0.04)',
      paddingHorizontal: 10,
      paddingVertical: 8,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.caption,
      fontWeight: '700',
    },
    inlineActionBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: theme.colors.accentSoft,
    },
    inlineActionText: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: '900',
    },
    settingDanger: {
      borderColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.34)' : 'rgba(255, 211, 207, 0.24)',
      backgroundColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.08)' : 'rgba(142, 75, 69, 0.16)',
    },
    dangerText: {
      color: theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf',
    },
    dealerCard: {
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : theme.colors.surface,
      padding: 12,
      gap: 8,
    },
    dealerHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    dealerTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    dealerState: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    dealerSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 17,
    },
    dealerCta: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.35)' : 'rgba(122, 92, 255, 0.4)',
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.14)' : theme.colors.accentSoft,
      paddingHorizontal: 12,
      paddingVertical: 10,
      alignItems: 'center',
    },
    dealerCtaText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    dealerForm: {
      gap: 8,
      marginTop: 2,
    },
    dealerGood: {
      borderColor: theme.mode === 'light' ? 'rgba(25, 135, 84, 0.45)' : 'rgba(25, 135, 84, 0.5)',
      backgroundColor: theme.mode === 'light' ? 'rgba(25, 135, 84, 0.1)' : 'rgba(25, 135, 84, 0.14)',
    },
    dealerWarn: {
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.45)' : 'rgba(122, 92, 255, 0.5)',
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.1)' : 'rgba(122, 92, 255, 0.14)',
    },
    dealerDanger: {
      borderColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.45)' : 'rgba(255, 211, 207, 0.4)',
      backgroundColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.12)' : 'rgba(142, 75, 69, 0.22)',
    },
    signOutBtn: {
      borderRadius: 16,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 11,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      justifyContent: 'center',
    },
    signOutText: {
      color: theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf',
      fontSize: 13,
      fontWeight: '900',
    },
  });

export default ArtistSettingPanel;



