import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword, updateProfile } from 'firebase/auth';
import { collection, deleteDoc, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../../config/firebaseConfig';
import { getBookingPaymentStatus, getSharedBookingStage } from '../../services/bookings';
import { pickSingleImageFromDevice, uploadProfileImage } from '../../services/mediaUpload';
import { syncUserProfile } from '../../services/userProfile';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { BookingModel, UserProfile } from '../../types/app';
import ProfileAvatar from '../ui/ProfileAvatar';

type SavedPreviewItem = {
  id: string;
  postId: string;
  artistUid: string;
  artistName: string;
  caption?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
};

type FollowingArtistItem = {
  id: string;
  artistUid: string;
  name: string;
  studioName?: string | null;
  location?: string | null;
  profileImageUrl?: string | null;
  verified?: boolean;
};

type UserProfilePanelProps = {
  header?: React.ReactNode;
  profile: UserProfile | null;
  bookingCount: number;
  followingCount: number;
  savedCount: number;
  recentBookings: BookingModel[];
  savedItems: SavedPreviewItem[];
  onOpenArtistProfile?: (artistUid: string) => void;
  onOpenBookingDetail?: (bookingId: string) => void;
  onOpenBookings: () => void;
  onOpenNotifications: () => void;
  onSignOut: () => void;
  openEditRequestKey?: number;
};

type ProfilePage = 'main' | 'saved' | 'following' | 'history' | 'settings' | 'settingsAppearance' | 'settingsPrivacy' | 'settingsBlocked' | 'settingsAbout' | 'settingsHelp' | 'edit';

type BlockedRow = {
  id: string;
  blockedUid?: string;
  blockedName?: string | null;
  blockedProfileImageUrl?: string | null;
  blockedAt?: unknown;
};

type ReportRow = {
  id: string;
  postId?: string;
  reason?: string;
  status?: string;
  createdAt?: unknown;
};

const statusLabel = (value: ReturnType<typeof getSharedBookingStage>) => value.replace(/_/g, ' ');
const paymentLabel = (value: ReturnType<typeof getBookingPaymentStatus>) => value.charAt(0).toUpperCase() + value.slice(1);

const UserProfilePanel = ({
  header,
  profile,
  bookingCount,
  followingCount,
  savedCount,
  recentBookings,
  savedItems,
  onOpenArtistProfile,
  onOpenBookingDetail,
  onOpenBookings,
  onOpenNotifications,
  onSignOut,
  openEditRequestKey = 0,
}: UserProfilePanelProps) => {
  const { theme, themePreference, setThemePreference, fontSizeMode, setFontSizeMode } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, insets.bottom), [theme, insets.bottom]);
  const [previewItem, setPreviewItem] = useState<SavedPreviewItem | null>(null);
  const [page, setPage] = useState<ProfilePage>('main');
  const [savedTab, setSavedTab] = useState<'posts' | 'reels'>('posts');
  const [followingArtists, setFollowingArtists] = useState<FollowingArtistItem[]>([]);
  const [blockedRows, setBlockedRows] = useState<BlockedRow[]>([]);
  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploadingProfileImage, setUploadingProfileImage] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editArea, setEditArea] = useState('');
  const [editBio, setEditBio] = useState('');
  const [profileVisibility, setProfileVisibility] = useState<'public' | 'private'>('public');
  const [showContactDetails, setShowContactDetails] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  useEffect(() => {
    if (openEditRequestKey > 0) setPage('edit');
  }, [openEditRequestKey]);

  const displayName = String(profile?.displayName ?? 'Tatzo User').trim() || 'Tatzo User';
  const email = String(profile?.email ?? '').trim();
  const phone = String(profile?.phone ?? '').trim();
  const location = [String(profile?.locationArea ?? '').trim(), String(profile?.locationCity ?? '').trim()].filter(Boolean).join(', ') || String(profile?.location ?? '').trim() || 'Location hidden';
  const historyBookings = recentBookings.filter((booking) => ['work_done', 'rejected'].includes(getSharedBookingStage(booking)) || new Date(String(booking.dateISO ?? '')).getTime() < Date.now());
  const completedHistoryCount = recentBookings.filter((booking) => getSharedBookingStage(booking) === 'work_done').length;
  const rejectedHistoryCount = recentBookings.filter((booking) => getSharedBookingStage(booking) === 'rejected').length;
  const bookingHistoryGraph = useMemo(() => {
    const now = new Date();
    const buckets = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      return { key, label: date.toLocaleString('en-US', { month: 'short' }), count: 0 };
    });
    const indexByKey = new Map(buckets.map((item, index) => [item.key, index]));
    recentBookings.forEach((booking) => {
      const rawDate = String(booking.dateISO ?? '').trim();
      if (!rawDate) return;
      const date = new Date(rawDate);
      if (Number.isNaN(date.getTime())) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const bucketIndex = indexByKey.get(key);
      if (bucketIndex !== undefined) buckets[bucketIndex].count += 1;
    });
    const maxCount = Math.max(1, ...buckets.map((item) => item.count));
    return buckets.map((item) => ({ ...item, heightPercent: Math.max(10, Math.round((item.count / maxCount) * 100)) }));
  }, [recentBookings]);
  const savedPosts = savedItems.filter((item) => Boolean(item.imageUrl?.trim()));
  const savedReels = savedItems.filter((item) => Boolean(item.videoUrl?.trim()));
  const userSettings = ((profile as any)?.userSettings ?? {}) as any;

  useEffect(() => {
    setEditName(displayName);
    setEditPhone(phone);
    setEditCity(String(profile?.locationCity ?? '').trim());
    setEditArea(String(profile?.locationArea ?? '').trim());
    setEditBio(String(profile?.bio ?? '').trim());
  }, [displayName, phone, profile?.locationArea, profile?.locationCity, profile?.bio]);

  useEffect(() => {
    const privacy = userSettings.privacy ?? {};
    setProfileVisibility(privacy.profileVisibility === 'private' ? 'private' : 'public');
    setShowContactDetails(privacy.showContactDetails !== false);
  }, [userSettings.privacy?.profileVisibility, userSettings.privacy?.showContactDetails]);

  useEffect(() => {
    const uid = profile?.uid || auth.currentUser?.uid;
    if (!uid) return;

    const mapFollowingRows = async (docs: Array<{ id: string; data: () => any }>) => {
      const rows = await Promise.all(
        docs.slice(0, 30).map(async (row) => {
          const saved = row.data() as any;
          const artistUid = String(saved.artistUid ?? saved.uid ?? saved.toUid ?? row.id).trim();
          const fallback = {
            id: artistUid,
            artistUid,
            name: String(saved.name ?? saved.artistName ?? saved.displayName ?? 'Artist').trim() || 'Artist',
            studioName: String(saved.studioName ?? saved.shopName ?? '').trim() || null,
            location: String(saved.location ?? [saved.locationArea, saved.locationCity].filter(Boolean).join(', ')).trim() || null,
            profileImageUrl: String(saved.profileImageUrl ?? saved.artistProfileImageUrl ?? '').trim() || null,
            verified: saved.verified === true,
          };
          if (!artistUid) return fallback;
          try {
            const artistSnap = await getDoc(doc(db, 'artists', artistUid));
            const artist = artistSnap.exists() ? (artistSnap.data() as any) : {};
            return {
              id: artistUid,
              artistUid,
              name: String(artist.artistName ?? artist.displayName ?? fallback.name).trim() || fallback.name,
              studioName: String(artist.studioName ?? artist.shopName ?? fallback.studioName ?? '').trim() || null,
              location: String(artist.location ?? [artist.locationArea, artist.locationCity].filter(Boolean).join(', ') ?? fallback.location ?? '').trim() || fallback.location,
              profileImageUrl: String(artist.profileImageUrl ?? fallback.profileImageUrl ?? '').trim() || null,
              verified: artist.verifiedPro === true || String(artist.verificationStatus ?? '') === 'approved' || fallback.verified,
            };
          } catch {
            return fallback;
          }
        }),
      );
      setFollowingArtists(rows.filter((row) => Boolean(row.artistUid)));
    };

    const followingRef = collection(db, 'users', uid, 'following');
    const unsub = onSnapshot(
      query(followingRef, orderBy('createdAt', 'desc'), limit(30)),
      (snap) => { void mapFollowingRows(snap.docs); },
      async () => {
        try {
          const snap = await getDocs(query(followingRef, limit(30)));
          await mapFollowingRows(snap.docs);
        } catch {
          setFollowingArtists([]);
        }
      },
    );
    return () => unsub();
  }, [profile?.uid]);

  useEffect(() => {
    const uid = profile?.uid || auth.currentUser?.uid;
    if (!uid) return;
    const blockedUnsub = onSnapshot(
      query(collection(db, 'users', uid, 'blockedUsers'), orderBy('blockedAt', 'desc'), limit(50)),
      (snap) => setBlockedRows(snap.docs.map((row) => ({ id: row.id, ...(row.data() as any) }) as BlockedRow)),
      () => setBlockedRows([]),
    );
    const reportUnsub = onSnapshot(
      query(collection(db, 'postReports'), where('reportedByUid', '==', uid), limit(50)),
      (snap) => setReportRows(snap.docs.map((row) => ({ id: row.id, ...(row.data() as any) }) as ReportRow)),
      () => setReportRows([]),
    );
    return () => {
      blockedUnsub();
      reportUnsub();
    };
  }, [profile?.uid]);

  const openBooking = (bookingId: string) => {
    if (onOpenBookingDetail) onOpenBookingDetail(bookingId);
    else onOpenBookings();
  };

  const saveProfile = async () => {
    const user = auth.currentUser;
    if (!user || savingProfile) return;
    if (!editCity.trim() || !editArea.trim()) {
      Alert.alert('Tatzo', 'City and area are required before booking an artist.');
      return;
    }
    setSavingProfile(true);
    try {
      const nextName = editName.trim() || displayName;
      await updateProfile(user, { displayName: nextName });
      await syncUserProfile(user, {
        displayName: nextName,
        phone: editPhone.trim(),
        locationCity: editCity.trim(),
        locationArea: editArea.trim(),
        location: [editArea.trim(), editCity.trim()].filter(Boolean).join(', '),
        bio: editBio.trim(),
      });
      Alert.alert('Tatzo', 'Profile updated.');
      setPage('main');
    } catch (error: any) {
      Alert.alert('Tatzo', error?.message ?? 'Could not update profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const uploadUserProfileImage = async () => {
    const user = auth.currentUser;
    if (!user || uploadingProfileImage || savingProfile) return;
    setUploadingProfileImage(true);
    try {
      const picked = await pickSingleImageFromDevice();
      if (!picked) return;
      const uploaded = await uploadProfileImage({
        picked,
        storagePath: `users/${user.uid}/profile/profile-image.jpg`,
      });
      await syncUserProfile(user, {
        profileImageUrl: uploaded.downloadUrl,
        profileImageMeta: uploaded,
      });
      Alert.alert('Tatzo', 'Profile photo updated.');
    } catch (error: any) {
      Alert.alert('Tatzo', error?.message ?? 'Could not upload profile photo.');
    } finally {
      setUploadingProfileImage(false);
    }
  };

  const removeUserProfileImage = async () => {
    const user = auth.currentUser;
    if (!user || uploadingProfileImage || savingProfile) return;
    Alert.alert('Remove photo?', 'Your profile image will be removed from your Tatzo profile.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await syncUserProfile(user, {
              profileImageUrl: '',
              profileImageMeta: null as any,
            });
            Alert.alert('Tatzo', 'Profile photo removed.');
          } catch (error: any) {
            Alert.alert('Tatzo', error?.message ?? 'Could not remove profile photo.');
          }
        },
      },
    ]);
  };

  const saveUserSettings = async (next: Record<string, unknown>) => {
    const user = auth.currentUser;
    if (!user || savingSettings) return;
    setSavingSettings(true);
    try {
      await setDoc(doc(db, 'users', user.uid), { userSettings: next, updatedAt: serverTimestamp() }, { merge: true });
      Alert.alert('Tatzo', 'Settings saved.');
    } catch (error: any) {
      Alert.alert('Tatzo', error?.message ?? 'Could not save settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const savePrivacySettings = () =>
    saveUserSettings({
      ...userSettings,
      privacy: {
        ...(userSettings.privacy ?? {}),
        profileVisibility,
        showContactDetails,
      },
    });

  const handlePasswordUpdate = async () => {
    const user = auth.currentUser;
    if (!user?.email) return Alert.alert('Tatzo', 'Please sign in again to update your password.');
    if (!currentPassword || !newPassword || !confirmPassword) return Alert.alert('Tatzo', 'Please fill all password fields.');
    if (newPassword.length < 6) return Alert.alert('Tatzo', 'New password must be at least 6 characters.');
    if (newPassword !== confirmPassword) return Alert.alert('Tatzo', 'New password and confirm password do not match.');
    setSavingSettings(true);
    try {
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      Alert.alert('Tatzo', 'Password updated successfully.');
    } catch (error: any) {
      const code = String(error?.code ?? '');
      Alert.alert('Tatzo', code.includes('wrong-password') || code.includes('invalid-credential') ? 'Current password is incorrect.' : error?.message ?? 'Could not update password.');
    } finally {
      setSavingSettings(false);
    }
  };

  const unblockUser = async (row: BlockedRow) => {
    const uid = auth.currentUser?.uid;
    const targetUid = row.blockedUid || row.id;
    if (!uid || !targetUid) return;
    try {
      await deleteDoc(doc(db, 'users', uid, 'blockedUsers', targetUid));
      Alert.alert('Tatzo', 'Unblocked successfully.');
    } catch (error: any) {
      Alert.alert('Tatzo', error?.message ?? 'Could not unblock right now.');
    }
  };

  const confirmLogout = () => {
    Alert.alert('Logout?', 'Do you want to sign out from Tatzo?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: onSignOut },
    ]);
  };

  const openSupportEmail = () => {
    Linking.openURL('mailto:support@tatzo.co.in?subject=Tatzo%20Support').catch(() => Alert.alert('Tatzo', 'Email support: support@tatzo.co.in'));
  };

  const openPolicyUrl = (path: string, title: string) => {
    Linking.openURL(`https://tatzo.co.in/${path}`).catch(() => Alert.alert('Tatzo', `${title} will be available inside Tatzo soon.`));
  };

  const renderHeader = (title: string, subtitle?: string) => (
    <View style={styles.subHeader}>
      <TouchableOpacity activeOpacity={0.9} style={styles.roundIcon} onPress={() => setPage('main')}>
        <Ionicons name="arrow-back" size={19} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
      </TouchableOpacity>
      <View style={styles.subHeaderCopy}>
        <Text style={styles.subTitle}>{title}</Text>
        {subtitle ? <Text style={styles.subSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );

  const renderSavedTile = (item: SavedPreviewItem, large = false) => (
    <TouchableOpacity key={item.id} activeOpacity={0.9} style={[styles.savedTile, large && styles.savedTileLarge]} onPress={() => setPreviewItem(item)}>
      {item.imageUrl?.trim() ? (
        <Image source={{ uri: item.imageUrl.trim() }} style={styles.savedTileImage} />
      ) : (
        <View style={styles.savedTileVideo}>
          <Ionicons name={item.videoUrl ? 'play' : 'bookmark-outline'} size={large ? 22 : 16} color={theme.colors.textInverse} />
        </View>
      )}
      {item.videoUrl?.trim() ? <View style={styles.reelBadge}><Ionicons name="play" size={10} color={theme.colors.textInverse} /></View> : null}
    </TouchableOpacity>
  );

  const renderFollowingCard = (item: FollowingArtistItem, compact = false) => (
    <TouchableOpacity key={item.id} activeOpacity={0.9} style={[styles.followingCard, compact && styles.followingCardCompact]} onPress={() => onOpenArtistProfile?.(item.artistUid)}>
      <ProfileAvatar uri={item.profileImageUrl ?? undefined} name={item.name} size={compact ? 58 : 48} />
      <View style={styles.followingCopy}>
        <View style={styles.followingNameRow}>
          <Text style={styles.followingName} numberOfLines={1}>{item.name}</Text>
          {item.verified ? <Ionicons name="checkmark-circle" size={14} color="#38BDF8" /> : null}
        </View>
        <Text style={styles.followingMeta} numberOfLines={1}>{[item.studioName, item.location].filter(Boolean).join(' • ') || 'Tatzo Artist'}</Text>
      </View>
      {!compact ? <Text style={styles.viewArtistText}>View Artist</Text> : null}
    </TouchableOpacity>
  );

  const renderBookingRow = (booking: BookingModel) => {
    const stage = getSharedBookingStage(booking);
    const payment = getBookingPaymentStatus(booking);
    return (
      <TouchableOpacity key={booking.id} activeOpacity={0.9} style={styles.bookingHistoryRow} onPress={() => openBooking(booking.id)}>
        <ProfileAvatar name={booking.artistName} size={44} />
        <View style={styles.historyCopy}>
          <Text style={styles.historyName} numberOfLines={1}>{booking.artistName}</Text>
          <Text style={styles.historyMeta}>{booking.dateISO} • {String(booking.slotTimeLabel ?? booking.slotId)}</Text>
        </View>
        <View style={styles.historyStatusWrap}>
          <Text style={styles.statusPill}>{statusLabel(stage)}</Text>
          <Text style={styles.paymentPill}>Payment {paymentLabel(payment)}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  const previewModal = (
    <Modal visible={Boolean(previewItem)} transparent animationType="fade" onRequestClose={() => setPreviewItem(null)}>
      <Pressable style={styles.previewBackdrop} onPress={() => setPreviewItem(null)} />
      <View style={styles.previewSheetWrap}>
        <View style={styles.previewSheet}>
          <View style={styles.previewHeader}>
            <Text style={styles.previewTitle} numberOfLines={1}>{previewItem?.artistName || 'Saved item'}</Text>
            <TouchableOpacity activeOpacity={0.9} style={styles.previewClose} onPress={() => setPreviewItem(null)}>
              <Ionicons name="close" size={16} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
            </TouchableOpacity>
          </View>
          <View style={styles.previewMediaShell}>
            {previewItem?.imageUrl?.trim() ? (
              <Image source={{ uri: previewItem.imageUrl.trim() }} style={styles.previewMedia} resizeMode="cover" />
            ) : (
              <View style={styles.previewMediaFallback}>
                <Ionicons name={previewItem?.videoUrl ? 'play-circle-outline' : 'bookmark-outline'} size={36} color={theme.colors.accent} />
                <Text style={styles.previewFallbackText}>{previewItem?.videoUrl ? 'Reel preview' : 'Saved content'}</Text>
              </View>
            )}
          </View>
          {previewItem?.caption ? <Text style={styles.previewCaption}>{previewItem.caption}</Text> : null}
          <View style={styles.previewActions}>
            {previewItem?.artistUid && onOpenArtistProfile ? (
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.previewPrimaryBtn}
                onPress={() => {
                  const artistUid = previewItem.artistUid;
                  setPreviewItem(null);
                  onOpenArtistProfile(artistUid);
                }}
              >
                <Text style={styles.previewPrimaryText}>View Artist Profile</Text>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity activeOpacity={0.9} style={styles.previewSecondaryBtn} onPress={() => setPreviewItem(null)}>
              <Text style={styles.previewSecondaryText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  if (page === 'saved') {
    const visibleSavedItems = savedTab === 'posts' ? savedPosts : savedReels;
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderHeader('Saved', 'Posts and reels you saved.')}
        <View style={styles.tabsCard}>
          <TouchableOpacity activeOpacity={0.9} style={[styles.tabButton, savedTab === 'posts' && styles.tabButtonActive]} onPress={() => setSavedTab('posts')}>
            <Text style={[styles.tabText, savedTab === 'posts' && styles.tabTextActive]}>Posts ({savedPosts.length})</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.9} style={[styles.tabButton, savedTab === 'reels' && styles.tabButtonActive]} onPress={() => setSavedTab('reels')}>
            <Text style={[styles.tabText, savedTab === 'reels' && styles.tabTextActive]}>Reels ({savedReels.length})</Text>
          </TouchableOpacity>
        </View>
        {visibleSavedItems.length ? <View style={styles.savedGridFull}>{visibleSavedItems.map((item) => renderSavedTile(item, true))}</View> : (
          <View style={styles.emptyCardLarge}>
            <Ionicons name="bookmark-outline" size={34} color={theme.colors.accent} />
            <Text style={styles.emptyTitle}>No saved posts yet</Text>
            <Text style={styles.emptyTextCenter}>Save tattoo ideas you love and find them here.</Text>
          </View>
        )}
        {previewModal}
      </ScrollView>
    );
  }

  if (page === 'following') {
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderHeader('Following Artists', 'Artists you follow on Tatzo.')}
        {followingArtists.length ? followingArtists.map((item) => renderFollowingCard(item)) : (
          <View style={styles.emptyCardLarge}>
            <Ionicons name="people-outline" size={34} color={theme.colors.accent} />
            <Text style={styles.emptyTitle}>No following yet</Text>
            <Text style={styles.emptyTextCenter}>Follow artists to see them here.</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  if (page === 'history') {
    const rows = historyBookings.length ? historyBookings : recentBookings;
    const groupedRows = rows.reduce<Array<{ key: string; title: string; rows: BookingModel[] }>>((groups, booking) => {
      const rawDate = String(booking.dateISO ?? '').trim();
      const date = rawDate ? new Date(rawDate) : new Date();
      const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
      const key = `${safeDate.getFullYear()}-${String(safeDate.getMonth() + 1).padStart(2, '0')}`;
      const title = safeDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      const existing = groups.find((group) => group.key === key);
      if (existing) existing.rows.push(booking);
      else groups.push({ key, title, rows: [booking] });
      return groups;
    }, []);
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderHeader('Booking History', 'Past and completed tattoo bookings.')}
        {groupedRows.length ? groupedRows.map((group) => (
          <View key={group.key} style={styles.historyMonthBlock}>
            <Text style={styles.historyMonthTitle}>{group.title}</Text>
            <View style={styles.historyList}>{group.rows.map(renderBookingRow)}</View>
          </View>
        )) : (
          <View style={styles.emptyCardLarge}>
            <Ionicons name="time-outline" size={34} color={theme.colors.accent} />
            <Text style={styles.emptyTitle}>No booking history yet</Text>
            <Text style={styles.emptyTextCenter}>Your completed, rejected, and past bookings appear here.</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  if (page === 'edit') {
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderHeader('Edit Profile', 'Update your user profile details.')}
        <View style={styles.editHero}>
          <ProfileAvatar uri={profile?.profileImageUrl} name={displayName} size={96} />
          <TouchableOpacity activeOpacity={0.9} style={styles.cameraBadge} onPress={uploadUserProfileImage}>
            <Ionicons name="camera-outline" size={18} color={theme.colors.textInverse} />
          </TouchableOpacity>
          <View style={styles.profileImageActions}>
            <TouchableOpacity activeOpacity={0.9} style={styles.smallActionButton} onPress={uploadUserProfileImage} disabled={uploadingProfileImage}>
              <Text style={styles.smallActionText}>{uploadingProfileImage ? 'Uploading...' : profile?.profileImageUrl ? 'Replace Photo' : 'Upload Photo'}</Text>
            </TouchableOpacity>
            {profile?.profileImageUrl ? (
              <TouchableOpacity activeOpacity={0.9} style={styles.smallDangerButton} onPress={removeUserProfileImage}>
                <Text style={styles.smallDangerText}>Remove</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        <View style={styles.editForm}>
          {[
            ['person-outline', 'Name', editName, setEditName],
            ['call-outline', 'Phone', editPhone, setEditPhone],
            ['location-outline', 'Area', editArea, setEditArea],
            ['business-outline', 'City', editCity, setEditCity],
          ].map(([icon, placeholder, value, setter]) => (
            <View key={String(placeholder)} style={styles.inputRow}>
              <Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={theme.colors.textMuted} />
              <TextInput
                value={String(value)}
                onChangeText={setter as (value: string) => void}
                placeholder={String(placeholder)}
                placeholderTextColor={theme.colors.textMuted}
                style={styles.inputText}
              />
            </View>
          ))}
          <View style={styles.bioInputWrap}>
            <TextInput
              value={editBio}
              onChangeText={setEditBio}
              placeholder="Short bio"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.bioInput}
              multiline
              textAlignVertical="top"
            />
          </View>
        </View>
        <TouchableOpacity activeOpacity={0.9} style={[styles.saveButton, savingProfile && styles.saveButtonDisabled]} onPress={saveProfile} disabled={savingProfile}>
          <Text style={styles.saveButtonText}>{savingProfile ? 'Saving...' : 'Save Changes'}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  const renderChoice = (label: string, active: boolean, onPress: () => void) => (
    <TouchableOpacity activeOpacity={0.9} style={[styles.choicePill, active && styles.choicePillActive]} onPress={onPress}>
      <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderSettingsNavRow = (icon: keyof typeof Ionicons.glyphMap, title: string, subtitle: string, nextPage: ProfilePage) => (
    <TouchableOpacity key={title} activeOpacity={0.9} style={styles.settingsRow} onPress={() => setPage(nextPage)}>
      <View style={styles.settingsIcon}><Ionicons name={icon} size={18} color={theme.colors.accent} /></View>
      <View style={styles.settingsCopy}>
        <Text style={styles.settingsTitle}>{title}</Text>
        <Text style={styles.settingsSub}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );

  if (page === 'settingsAppearance') {
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderHeader('Appearance', 'Theme and text preferences.')}
        <View style={styles.settingsGroup}>
          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>Theme</Text>
            <View style={styles.choiceRow}>
              {renderChoice('Dark', themePreference === 'dark', () => setThemePreference('dark'))}
              {renderChoice('Light', themePreference === 'light', () => setThemePreference('light'))}
              {renderChoice('System', themePreference === 'system', () => setThemePreference('system'))}
            </View>
            <Text style={styles.settingsSub}>Theme applies instantly and stays saved after restart.</Text>
          </View>
          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>Font Size</Text>
            <View style={styles.choiceRow}>
              {renderChoice('Small', fontSizeMode === 'small', () => setFontSizeMode('small'))}
              {renderChoice('Medium', fontSizeMode === 'medium', () => setFontSizeMode('medium'))}
              {renderChoice('Large', fontSizeMode === 'large', () => setFontSizeMode('large'))}
            </View>
            <Text style={styles.settingsSub}>Font size updates app text immediately.</Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  if (page === 'settingsPrivacy') {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {renderHeader('Account Privacy', 'Control your profile and password.')}
          <View style={styles.settingsGroup}>
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Profile Visibility</Text>
              <View style={styles.choiceRow}>
                {renderChoice('Public', profileVisibility === 'public', () => setProfileVisibility('public'))}
                {renderChoice('Private', profileVisibility === 'private', () => setProfileVisibility('private'))}
              </View>
              <Text style={styles.settingsSub}>Private profile hides public profile details from unknown users.</Text>
            </View>
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Contact Details</Text>
              <View style={styles.choiceRow}>
                {renderChoice('Show', showContactDetails, () => setShowContactDetails(true))}
                {renderChoice('Hide', !showContactDetails, () => setShowContactDetails(false))}
              </View>
              <Text style={styles.settingsSub}>Booking through Tatzo still works when contact details are hidden.</Text>
            </View>
            <TouchableOpacity activeOpacity={0.9} style={[styles.saveButton, savingSettings && styles.saveButtonDisabled]} onPress={savePrivacySettings} disabled={savingSettings}>
              <Text style={styles.saveButtonText}>{savingSettings ? 'Saving...' : 'Save Privacy Settings'}</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.settingsGroup}>
            <View style={styles.settingsSection}>
              <Text style={styles.settingsSectionTitle}>Change Password</Text>
              <View style={styles.inputRow}><Ionicons name="lock-closed-outline" size={18} color={theme.colors.textMuted} /><TextInput value={currentPassword} onChangeText={setCurrentPassword} placeholder="Current Password" placeholderTextColor={theme.colors.textMuted} secureTextEntry style={styles.inputText} /></View>
              <View style={styles.inputRow}><Ionicons name="key-outline" size={18} color={theme.colors.textMuted} /><TextInput value={newPassword} onChangeText={setNewPassword} placeholder="New Password" placeholderTextColor={theme.colors.textMuted} secureTextEntry style={styles.inputText} /></View>
              <View style={styles.inputRow}><Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.textMuted} /><TextInput value={confirmPassword} onChangeText={setConfirmPassword} placeholder="Confirm Password" placeholderTextColor={theme.colors.textMuted} secureTextEntry style={styles.inputText} /></View>
              <TouchableOpacity activeOpacity={0.9} style={[styles.saveButton, savingSettings && styles.saveButtonDisabled]} onPress={handlePasswordUpdate} disabled={savingSettings}>
                <Text style={styles.saveButtonText}>{savingSettings ? 'Updating...' : 'Update Password'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (page === 'settingsBlocked') {
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderHeader('Blocked & Reported', 'Manage blocked accounts and report history.')}
        <View style={styles.settingsGroup}>
          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>Blocked Artists / Users</Text>
            {blockedRows.length ? blockedRows.map((row) => (
              <View key={row.id} style={styles.blockedRow}>
                <ProfileAvatar uri={row.blockedProfileImageUrl ?? undefined} name={row.blockedName || 'Blocked'} size={42} />
                <View style={styles.settingsCopy}>
                  <Text style={styles.settingsTitle}>{row.blockedName || 'Blocked account'}</Text>
                  <Text style={styles.settingsSub}>Hidden from your feed and discovery</Text>
                </View>
                <TouchableOpacity activeOpacity={0.9} style={styles.unblockButton} onPress={() => unblockUser(row)}>
                  <Text style={styles.unblockText}>Unblock</Text>
                </TouchableOpacity>
              </View>
            )) : <Text style={styles.emptyText}>No blocked accounts yet.</Text>}
          </View>
        </View>
        <View style={styles.settingsGroup}>
          <View style={styles.settingsSection}>
            <Text style={styles.settingsSectionTitle}>Reported Items</Text>
            {reportRows.length ? reportRows.map((row) => (
              <View key={row.id} style={styles.reportRow}>
                <Ionicons name="flag-outline" size={18} color={theme.colors.accent} />
                <View style={styles.settingsCopy}>
                  <Text style={styles.settingsTitle}>Post report</Text>
                  <Text style={styles.settingsSub} numberOfLines={2}>{row.reason || 'Report submitted'} • {row.status || 'open'}</Text>
                </View>
              </View>
            )) : <Text style={styles.emptyText}>No reports submitted yet.</Text>}
          </View>
        </View>
      </ScrollView>
    );
  }

  if (page === 'settingsAbout') {
    const rows = [
      ['information-circle-outline', 'About Tatzo', 'Tattoo + Technology + Premium Marketplace'],
      ['phone-portrait-outline', 'App Version', 'v1.0.0 Early Access'],
      ['document-text-outline', 'Terms & Conditions', 'Legal usage terms'],
      ['shield-checkmark-outline', 'Privacy Policy', 'How Tatzo handles data'],
      ['receipt-outline', 'Refund / Cancellation Policy', 'Booking and payment policy'],
      ['people-outline', 'Community Guidelines', 'Safe marketplace standards'],
    ] as const;
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderHeader('About', 'Tatzo policies and app info.')}
        <View style={styles.settingsGroup}>
          {rows.map(([icon, title, subtitle]) => (
            <TouchableOpacity
              key={title}
              activeOpacity={0.9}
              style={styles.settingsRow}
              onPress={() =>
                title === 'About Tatzo'
                  ? openPolicyUrl('about', title)
                  : title === 'App Version'
                    ? Alert.alert('Tatzo', 'Tatzo v1.0.0 Early Access')
                    : openPolicyUrl(title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), title)
              }
            >
              <View style={styles.settingsIcon}><Ionicons name={icon} size={18} color={theme.colors.accent} /></View>
              <View style={styles.settingsCopy}>
                <Text style={styles.settingsTitle}>{title}</Text>
                <Text style={styles.settingsSub}>{subtitle}</Text>
              </View>
              <Ionicons name="open-outline" size={17} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    );
  }

  if (page === 'settingsHelp') {
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderHeader('Help Center', 'Support and safety help.')}
        <View style={styles.settingsGroup}>
          <TouchableOpacity activeOpacity={0.9} style={styles.settingsRow} onPress={() => Alert.alert('FAQ', 'Booking, privacy, saved posts, and account help will be listed here.')}>
            <View style={styles.settingsIcon}><Ionicons name="help-circle-outline" size={18} color={theme.colors.accent} /></View>
            <View style={styles.settingsCopy}><Text style={styles.settingsTitle}>FAQ</Text><Text style={styles.settingsSub}>Common user questions</Text></View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.9} style={styles.settingsRow} onPress={openSupportEmail}>
            <View style={styles.settingsIcon}><Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.accent} /></View>
            <View style={styles.settingsCopy}><Text style={styles.settingsTitle}>Contact Support</Text><Text style={styles.settingsSub}>Email Tatzo support</Text></View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.9} style={styles.settingsRow} onPress={openSupportEmail}>
            <View style={styles.settingsIcon}><Ionicons name="bug-outline" size={18} color={theme.colors.accent} /></View>
            <View style={styles.settingsCopy}><Text style={styles.settingsTitle}>Report a Problem</Text><Text style={styles.settingsSub}>Tell us what went wrong</Text></View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
        <TouchableOpacity activeOpacity={0.9} style={styles.saveButton} onPress={openSupportEmail}>
          <Text style={styles.saveButtonText}>Email support@tatzo.co.in</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (page === 'settings') {
    return (
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {renderHeader('Settings', 'Manage your Tatzo account.')}
        <Text style={styles.settingsSectionLabel}>ACCOUNT</Text>
        <View style={styles.settingsGroup}>
          {renderSettingsNavRow('person-outline', 'Edit Profile', 'Name, photo and location', 'edit')}
          {renderSettingsNavRow('key-outline', 'Change Password', 'Update your login password', 'settingsPrivacy')}
        </View>
        <Text style={styles.settingsSectionLabel}>PREFERENCES</Text>
        <View style={styles.settingsGroup}>
          {renderSettingsNavRow('color-palette-outline', 'Appearance', 'Theme and font size', 'settingsAppearance')}
          <TouchableOpacity activeOpacity={0.9} style={styles.settingsRow} onPress={onOpenNotifications}>
            <View style={styles.settingsIcon}><Ionicons name="notifications-outline" size={18} color={theme.colors.accent} /></View>
            <View style={styles.settingsCopy}><Text style={styles.settingsTitle}>Notifications</Text><Text style={styles.settingsSub}>Booking and account updates</Text></View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.settingsSectionLabel}>PRIVACY & SAFETY</Text>
        <View style={styles.settingsGroup}>
          {renderSettingsNavRow('lock-closed-outline', 'Account Privacy', 'Profile and contact visibility', 'settingsPrivacy')}
          {renderSettingsNavRow('ban-outline', 'Blocked & Reported', 'Blocked accounts and report history', 'settingsBlocked')}
        </View>
        <Text style={styles.settingsSectionLabel}>SUPPORT</Text>
        <View style={styles.settingsGroup}>
          {renderSettingsNavRow('help-circle-outline', 'Help Center', 'FAQs and support', 'settingsHelp')}
          <TouchableOpacity activeOpacity={0.9} style={styles.settingsRow} onPress={openSupportEmail}>
            <View style={styles.settingsIcon}><Ionicons name="chatbubble-ellipses-outline" size={18} color={theme.colors.accent} /></View>
            <View style={styles.settingsCopy}><Text style={styles.settingsTitle}>Contact Support</Text><Text style={styles.settingsSub}>Email the Tatzo team</Text></View>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
        <Text style={styles.settingsSectionLabel}>LEGAL</Text>
        <View style={styles.settingsGroup}>
          {renderSettingsNavRow('information-circle-outline', 'About Tatzo', 'App information and policies', 'settingsAbout')}
          {[
            ['document-text-outline', 'Terms & Conditions', 'terms-and-conditions'],
            ['shield-checkmark-outline', 'Privacy Policy', 'privacy-policy'],
            ['receipt-outline', 'Refund Policy', 'refund-cancellation-policy'],
            ['people-outline', 'Community Guidelines', 'community-guidelines'],
          ].map(([icon, title, path]) => (
            <TouchableOpacity key={title} activeOpacity={0.9} style={styles.settingsRow} onPress={() => openPolicyUrl(path, title)}>
              <View style={styles.settingsIcon}><Ionicons name={icon as keyof typeof Ionicons.glyphMap} size={18} color={theme.colors.accent} /></View>
              <View style={styles.settingsCopy}><Text style={styles.settingsTitle}>{title}</Text></View>
              <Ionicons name="open-outline" size={17} color={theme.colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.settingsSectionLabel}>DANGER</Text>
        <TouchableOpacity activeOpacity={0.9} style={styles.logoutRow} onPress={confirmLogout}>
          <View style={styles.logoutIcon}><Ionicons name="log-out-outline" size={18} color="#FB7185" /></View>
          <View style={styles.settingsCopy}>
            <Text style={styles.logoutTitle}>Logout</Text>
            <Text style={styles.settingsSub}>Sign out from your account</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {header ? <View>{header}</View> : null}
      <View style={styles.heroCard}>
        <TouchableOpacity activeOpacity={0.9} style={styles.settingsFloat} onPress={() => setPage('settings')}>
          <Ionicons name="settings-outline" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
        </TouchableOpacity>
        <View style={styles.profileTopRow}>
          <ProfileAvatar uri={profile?.profileImageUrl} name={displayName} size={78} />
          <View style={styles.heroCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.name}>{displayName}</Text>
            </View>
            <Text style={styles.email}>{email || phone || 'Add email or phone'}</Text>
            <Text style={styles.location}>{location}</Text>
          </View>
        </View>
        <TouchableOpacity activeOpacity={0.9} style={styles.editButton} onPress={() => setPage('edit')}>
          <Ionicons name="pencil-outline" size={16} color={theme.colors.accent} />
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.profileStatsRow}>
        <TouchableOpacity activeOpacity={0.9} style={styles.profileStat} onPress={() => setPage('saved')}>
          <Text style={styles.profileStatValue}>{savedCount}</Text>
          <Text style={styles.profileStatLabel}>Saved</Text>
        </TouchableOpacity>
        <View style={styles.profileStatDivider} />
        <TouchableOpacity activeOpacity={0.9} style={styles.profileStat} onPress={() => setPage('following')}>
          <Text style={styles.profileStatValue}>{followingCount}</Text>
          <Text style={styles.profileStatLabel}>Following</Text>
        </TouchableOpacity>
        <View style={styles.profileStatDivider} />
        <TouchableOpacity activeOpacity={0.9} style={styles.profileStat} onPress={onOpenBookings}>
          <Text style={styles.profileStatValue}>{bookingCount}</Text>
          <Text style={styles.profileStatLabel}>Bookings</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.quickGrid}>
        <TouchableOpacity activeOpacity={0.9} style={styles.quickCard} onPress={() => setPage('saved')}>
          <View style={styles.quickIconWrap}>
            <Ionicons name="bookmark-outline" size={21} color={theme.colors.accent} />
          </View>
          <View style={styles.quickCopy}>
            <Text style={styles.quickTitle}>Saved Posts & Reels</Text>
            <Text style={styles.quickSub}>Tattoo ideas you saved</Text>
          </View>
          <Text style={styles.quickCount}>{savedCount}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.9} style={styles.quickCard} onPress={() => setPage('following')}>
          <View style={styles.quickIconWrap}>
            <Ionicons name="people-outline" size={21} color={theme.colors.accent} />
          </View>
          <View style={styles.quickCopy}>
            <Text style={styles.quickTitle}>Following Artists</Text>
            <Text style={styles.quickSub}>Artists you follow</Text>
          </View>
          <Text style={styles.quickCount}>{followingCount}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.9} style={styles.quickCard} onPress={() => setPage('history')}>
          <View style={styles.quickIconWrap}>
            <Ionicons name="time-outline" size={21} color={theme.colors.accent} />
          </View>
          <View style={styles.quickCopy}>
            <Text style={styles.quickTitle}>Booking History</Text>
            <Text style={styles.quickSub}>Past tattoo journeys</Text>
          </View>
          <Text style={styles.quickCount}>{historyBookings.length || recentBookings.length}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.9} style={styles.quickCard} onPress={() => setPage('settings')}>
          <View style={styles.quickIconWrap}>
            <Ionicons name="settings-outline" size={21} color={theme.colors.accent} />
          </View>
          <View style={styles.quickCopy}>
            <Text style={styles.quickTitle}>Settings</Text>
            <Text style={styles.quickSub}>Appearance, privacy and support</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={styles.sectionBlock}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>Booking History</Text>
          <TouchableOpacity activeOpacity={0.9} onPress={() => setPage('history')}><Text style={styles.linkText}>View All</Text></TouchableOpacity>
        </View>
        <View style={styles.historyGraphCard}>
          <View style={styles.historySummaryRow}>
            <View style={styles.historySummaryItem}>
              <Text style={styles.historySummaryValue}>{recentBookings.length}</Text>
              <Text style={styles.historySummaryLabel}>Total</Text>
            </View>
            <View style={styles.historySummaryDivider} />
            <View style={styles.historySummaryItem}>
              <Text style={styles.historySummaryValue}>{completedHistoryCount}</Text>
              <Text style={styles.historySummaryLabel}>Completed</Text>
            </View>
            <View style={styles.historySummaryDivider} />
            <View style={styles.historySummaryItem}>
              <Text style={styles.historySummaryValue}>{rejectedHistoryCount}</Text>
              <Text style={styles.historySummaryLabel}>Rejected</Text>
            </View>
          </View>
          <View style={styles.historyMonthList}>
            {bookingHistoryGraph.map((item) => (
              <View key={item.key} style={styles.historyMonthRow}>
                <Text style={styles.historyBarLabel}>{item.label}</Text>
                <View style={styles.historyBarTrack}>
                  <View style={[styles.historyBarFill, { width: `${item.heightPercent}%` }]} />
                </View>
                <Text style={styles.historyBarCount}>{item.count}</Text>
              </View>
            ))}
          </View>
        </View>
        {recentBookings.length ? <View style={styles.historyList}>{recentBookings.slice(0, 3).map(renderBookingRow)}</View> : <Text style={styles.emptyText}>Your recent bookings will appear here.</Text>}
      </View>

      {previewModal}
    </ScrollView>
  );
};

const createStyles = (theme: AppTheme, bottomInset: number) =>
  StyleSheet.create({
    content: {
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 120 + Math.max(0, bottomInset),
      gap: 16,
    },
    flex: {
      flex: 1,
    },
    heroCard: {
      borderRadius: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
      paddingTop: 8,
      paddingBottom: 4,
    },
    settingsFloat: {
      position: 'absolute',
      top: 4,
      right: 0,
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? '#F1F1F5' : 'rgba(255,255,255,0.05)',
      borderWidth: 0,
    },
    profileTopRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 0,
      paddingTop: 8,
    },
    heroCopy: {
      flex: 1,
      gap: 5,
      paddingBottom: 6,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    name: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 22,
      fontWeight: '900',
    },
    email: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '800',
    },
    location: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    editButton: {
      alignSelf: 'flex-start',
      marginTop: 12,
      marginLeft: 92,
      marginBottom: 4,
      minHeight: 44,
      borderRadius: 999,
      borderWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 18,
      backgroundColor: theme.mode === 'light' ? 'rgba(122,92,255,0.08)' : 'rgba(122,92,255,0.10)',
    },
    editButtonText: {
      color: theme.colors.accent,
      fontSize: 14,
      fontWeight: '900',
    },
    profileStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)',
    },
    profileStat: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
    },
    profileStatDivider: {
      width: StyleSheet.hairlineWidth,
      height: 30,
      backgroundColor: theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)',
    },
    profileStatValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 17,
      fontWeight: '900',
    },
    profileStatLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 10,
    },
    actionCard: {
      flex: 1,
      minHeight: 86,
      borderRadius: 19,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.035)',
      padding: 13,
      gap: 8,
    },
    actionIcon: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(122,92,255,0.08)' : 'rgba(122,92,255,0.12)',
    },
    actionCopy: {
      gap: 2,
    },
    actionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    actionSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    badge: {
      position: 'absolute',
      top: 10,
      right: 12,
      minWidth: 24,
      textAlign: 'center',
      borderRadius: 12,
      paddingHorizontal: 7,
      paddingVertical: 3,
      backgroundColor: theme.colors.accent,
      color: theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
    },
    quickGrid: {
      gap: 10,
    },
    quickCard: {
      minHeight: 62,
      borderRadius: 0,
      borderWidth: 0,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)',
      backgroundColor: 'transparent',
      paddingHorizontal: 2,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      shadowOpacity: 0,
      elevation: 0,
    },
    quickIconWrap: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(122,92,255,0.08)' : 'rgba(0,212,255,0.08)',
    },
    quickCopy: {
      flex: 1,
      gap: 3,
      minWidth: 0,
    },
    quickCount: {
      minWidth: 30,
      textAlign: 'center',
      paddingHorizontal: 8,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: theme.mode === 'light' ? 'rgba(122,92,255,0.10)' : 'rgba(0,212,255,0.10)',
      color: theme.colors.accent,
      fontWeight: '900',
      fontSize: 12,
    },
    quickTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
    },
    quickSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    sectionBlock: {
      gap: 12,
    },
    historyGraphCard: {
      borderRadius: 0,
      backgroundColor: 'transparent',
      paddingVertical: 4,
      gap: 14,
    },
    historySummaryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      backgroundColor: theme.mode === 'light' ? 'rgba(122,92,255,0.055)' : 'rgba(255,255,255,0.035)',
      paddingVertical: 12,
      paddingHorizontal: 10,
    },
    historySummaryItem: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
    },
    historySummaryValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 18,
      fontWeight: '900',
    },
    historySummaryLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    historySummaryDivider: {
      width: 1,
      height: 34,
      backgroundColor: theme.colors.border,
    },
    historyMonthList: {
      gap: 9,
    },
    historyMonthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    historyBarCount: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      width: 22,
      textAlign: 'right',
    },
    historyBarTrack: {
      flex: 1,
      height: 8,
      borderRadius: 999,
      backgroundColor: theme.mode === 'light' ? 'rgba(168,85,247,0.10)' : 'rgba(255,255,255,0.055)',
      overflow: 'hidden',
    },
    historyBarFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: theme.colors.accent,
    },
    historyBarLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '900',
      width: 32,
    },
    sectionHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 17,
      fontWeight: '900',
    },
    linkText: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: '900',
    },
    savedGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    savedGridFull: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    savedTile: {
      width: '30.8%',
      aspectRatio: 0.78,
      borderRadius: 14,
      backgroundColor: theme.colors.backgroundAlt,
      overflow: 'hidden',
    },
    savedTileLarge: {
      width: '31.2%',
      aspectRatio: 0.78,
    },
    savedTileImage: {
      width: '100%',
      height: '100%',
    },
    savedTileVideo: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.backgroundAlt,
    },
    reelBadge: {
      position: 'absolute',
      top: 8,
      left: 8,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.44)',
    },
    followingPreviewRow: {
      gap: 12,
      paddingRight: 8,
    },
    followingCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: 18,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.03)',
      padding: 12,
    },
    followingCardCompact: {
      width: 98,
      flexDirection: 'column',
      alignItems: 'center',
      padding: 10,
    },
    followingCopy: {
      flex: 1,
      gap: 3,
      minWidth: 0,
      alignItems: 'center',
    },
    followingNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      maxWidth: '100%',
    },
    followingName: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    followingMeta: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textAlign: 'center',
    },
    viewArtistText: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: '900',
    },
    historyList: {
      gap: 10,
    },
    historyMonthBlock: {
      gap: 10,
    },
    historyMonthTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
    },
    bookingHistoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      borderRadius: 17,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.035)',
      padding: 12,
    },
    historyCopy: {
      flex: 1,
      gap: 4,
      minWidth: 0,
    },
    historyName: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    historyMeta: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    historyStatusWrap: {
      alignItems: 'flex-end',
      gap: 6,
    },
    statusPill: {
      overflow: 'hidden',
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
      backgroundColor: 'rgba(0, 212, 255, 0.12)',
      color: theme.colors.accent,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'capitalize',
    },
    paymentPill: {
      overflow: 'hidden',
      borderRadius: 999,
      paddingHorizontal: 9,
      paddingVertical: 5,
      backgroundColor: theme.mode === 'light' ? 'rgba(122,92,255,0.08)' : 'rgba(168,85,247,0.12)',
      color: theme.mode === 'light' ? theme.colors.accent : '#C084FC',
      fontSize: 11,
      fontWeight: '900',
    },
    emptyInline: {
      borderRadius: 18,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.035)',
      padding: 16,
      gap: 4,
    },
    emptyCardLarge: {
      minHeight: 210,
      borderRadius: 22,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.035)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 22,
      gap: 10,
    },
    emptyTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 17,
      fontWeight: '900',
    },
    emptyText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
    },
    emptyTextCenter: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
      textAlign: 'center',
    },
    subHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 6,
    },
    roundIcon: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F1F1F5' : 'rgba(255,255,255,0.045)',
    },
    subHeaderCopy: {
      flex: 1,
      gap: 2,
    },
    subTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 20,
      fontWeight: '900',
    },
    subSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    tabsCard: {
      flexDirection: 'row',
      borderRadius: 17,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F1F1F5' : 'rgba(255,255,255,0.035)',
      padding: 5,
      gap: 6,
    },
    tabButton: {
      flex: 1,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
    },
    tabButtonActive: {
      backgroundColor: theme.colors.accent,
    },
    tabText: {
      textAlign: 'center',
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '900',
    },
    tabTextActive: {
      color: theme.colors.textInverse,
    },
    settingsGroup: {
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.03)',
    },
    settingsSectionLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.1,
      marginTop: 2,
      marginLeft: 4,
      marginBottom: -8,
    },
    settingsSection: {
      padding: 14,
      gap: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    settingsSectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
    },
    choiceRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    choicePill: {
      minHeight: 42,
      minWidth: 88,
      borderRadius: 999,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#ECECF2' : 'rgba(255,255,255,0.055)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    choicePillActive: {
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    choiceText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '900',
    },
    choiceTextActive: {
      color: theme.mode === 'light' ? theme.colors.accent : theme.colors.textInverse,
    },
    settingsRow: {
      minHeight: 74,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)',
    },
    settingsIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(122,92,255,0.08)' : 'rgba(122,92,255,0.12)',
    },
    settingsCopy: {
      flex: 1,
      gap: 3,
    },
    settingsTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
    },
    settingsSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    logoutRow: {
      minHeight: 74,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      borderRadius: 20,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#FFF4F5' : 'rgba(251,113,133,0.07)',
    },
    logoutIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(251,113,133,0.10)',
    },
    logoutTitle: {
      color: '#FB7185',
      fontSize: 15,
      fontWeight: '900',
    },
    blockedRow: {
      minHeight: 66,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      borderRadius: 16,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.035)' : 'rgba(255,255,255,0.035)',
      padding: 10,
    },
    unblockButton: {
      minHeight: 36,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      backgroundColor: theme.colors.accentSoft,
    },
    unblockText: {
      color: theme.colors.accent,
      fontSize: 11,
      fontWeight: '900',
    },
    reportRow: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 16,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.035)' : 'rgba(255,255,255,0.035)',
      padding: 10,
    },
    editHero: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 18,
    },
    cameraBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
      marginTop: -30,
      marginLeft: 70,
      borderWidth: 2,
      borderColor: theme.colors.surface,
    },
    profileImageActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 12,
    },
    smallActionButton: {
      minHeight: 38,
      borderRadius: 999,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    smallActionText: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: '900',
    },
    smallDangerButton: {
      minHeight: 38,
      borderRadius: 999,
      paddingHorizontal: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(251,113,133,0.10)',
      borderWidth: 1,
      borderColor: 'rgba(251,113,133,0.36)',
    },
    smallDangerText: {
      color: '#FB7185',
      fontSize: 12,
      fontWeight: '900',
    },
    editForm: {
      gap: 12,
    },
    inputRow: {
      minHeight: 56,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
    },
    inputText: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '800',
    },
    bioInputWrap: {
      minHeight: 110,
      borderRadius: 17,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    bioInput: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
    },
    saveButton: {
      minHeight: 58,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
    },
    saveButtonDisabled: {
      opacity: 0.68,
    },
    saveButtonText: {
      color: theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
    },
    previewBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.74)',
    },
    previewSheetWrap: {
      flex: 1,
      justifyContent: 'flex-end',
      padding: 16,
    },
    previewSheet: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 12,
    },
    previewHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    previewTitle: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 16,
      fontWeight: '900',
    },
    previewClose: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.backgroundAlt,
    },
    previewMediaShell: {
      height: 300,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: theme.colors.backgroundAlt,
    },
    previewMedia: {
      width: '100%',
      height: '100%',
    },
    previewMediaFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    previewFallbackText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '800',
    },
    previewCaption: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
    },
    previewActions: {
      flexDirection: 'row',
      gap: 10,
    },
    previewPrimaryBtn: {
      flex: 1,
      minHeight: 46,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
    },
    previewPrimaryText: {
      color: theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    previewSecondaryBtn: {
      minHeight: 46,
      borderRadius: 15,
      paddingHorizontal: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    previewSecondaryText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
  });

export default UserProfilePanel;
