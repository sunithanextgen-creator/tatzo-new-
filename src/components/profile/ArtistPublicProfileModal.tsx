import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, Modal, Pressable, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Ionicons } from '@expo/vector-icons';
import { collection, doc, getDoc, onSnapshot, orderBy, query, where, limit } from 'firebase/firestore';
import { auth, db } from '../../config/firebaseConfig';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { DummyArtist } from '../../data/dummyArtists';
import { buildArtistShareLink, toggleFollow } from '../../services/social';
import { getArtistBookingMessage, getArtistLocationLabel, getArtistSettingsFromProfile, isArtistDiscoverableForPublic } from '../../services/artistSettings';
import ProfileAvatar from '../ui/ProfileAvatar';
import { ANALYTICS_EVENTS, trackAnalyticsEvent } from '../../services/analytics/analytics';

type ArtistPublicProfileModalProps = {
  visible: boolean;
  artistUid: string | null;
  onClose: () => void;
  onBook?: (artist: DummyArtist | any) => void;
};

type ArtistPublicProfileRow = DummyArtist & {
  uid: string;
  bio?: string | null;
  profileImageUrl?: string | null;
  coverImageUrl?: string | null;
  artistVisible?: boolean;
  bookingVisible?: boolean;
  verificationStatus?: string;
  artistApproved?: boolean;
  artistName?: string;
  displayName?: string;
  studioName?: string;
  locationCity?: string;
  locationArea?: string;
  location?: string;
  styles?: string[];
  startingPrice?: number;
  experience?: string;
  artistHandle?: string | null;
};

const safeTrim = (value: unknown) => String(value ?? '').trim();

const friendlyActionError = (error: unknown, fallback: string) => {
  const code = String((error as any)?.code ?? '').toLowerCase();
  const message = String((error as any)?.message ?? '').trim();
  if (code.includes('permission-denied') || message.toLowerCase().includes('missing or insufficient permissions')) {
    return 'Tatzo could not complete that action right now. Please try again.';
  }
  if (message) return message;
  return fallback;
};


type ProfileMediaItem = { id: string; imageUrl?: string | null; videoUrl?: string | null; caption?: string | null };

const ProfileVideoTile = ({ uri, accentColor }: { uri: string; accentColor: string }) => {
  const player = useVideoPlayer({ uri }, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.volume = 0;
  });

  useEffect(() => {
    player.pause();
  }, [player, uri]);

  return (
    <View style={StyleSheet.absoluteFillObject}>
      <VideoView player={player} style={StyleSheet.absoluteFillObject} nativeControls={false} contentFit="cover" fullscreenOptions={{ enable: false }} />
      <View style={profileMediaStyles.videoBadge}>
        <Ionicons name="play" size={10} color="#ffffff" />
        <Text style={profileMediaStyles.videoBadgeText}>REEL</Text>
      </View>
      <View style={[profileMediaStyles.tilePlay, { borderColor: accentColor }]}>
        <Ionicons name="play" size={18} color="#ffffff" />
      </View>
    </View>
  );
};

const ProfileMediaViewer = ({ item, theme, onClose }: { item: ProfileMediaItem; theme: AppTheme; onClose: () => void }) => {
  const videoUri = safeTrim(item.videoUrl);
  const imageUri = safeTrim(item.imageUrl);
  const [muted, setMuted] = useState(false);
  const player = useVideoPlayer(videoUri ? { uri: videoUri } : null, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = false;
    videoPlayer.volume = 1;
  });

  useEffect(() => {
    if (!videoUri) return;
    player.play();
    return () => player.pause();
  }, [player, videoUri]);

  useEffect(() => {
    player.muted = muted;
    player.volume = muted ? 0 : 1;
  }, [muted, player]);

  return (
    <View style={profileMediaStyles.viewerOverlay}>
      <View style={profileMediaStyles.viewerTopRow}>
        <TouchableOpacity activeOpacity={0.85} onPress={onClose} style={profileMediaStyles.viewerButton}>
          <Ionicons name="close" size={22} color="#ffffff" />
        </TouchableOpacity>
        {videoUri ? (
          <TouchableOpacity activeOpacity={0.85} onPress={() => setMuted((value) => !value)} style={profileMediaStyles.viewerButton}>
            <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={20} color="#ffffff" />
          </TouchableOpacity>
        ) : null}
      </View>
      {videoUri ? (
        <VideoView player={player} style={profileMediaStyles.viewerMedia} nativeControls contentFit="contain" fullscreenOptions={{ enable: true }} />
      ) : imageUri ? (
        <Image source={{ uri: imageUri }} style={profileMediaStyles.viewerMedia} resizeMode="contain" />
      ) : (
        <View style={profileMediaStyles.viewerEmpty}>
          <Ionicons name="image-outline" size={30} color={theme.colors.accent} />
        </View>
      )}
    </View>
  );
};

const profileMediaStyles = StyleSheet.create({
  videoBadge: {
    position: 'absolute',
    left: 8,
    top: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  videoBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
  },
  tilePlay: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 38,
    height: 38,
    marginLeft: -19,
    marginTop: -19,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  viewerOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    backgroundColor: '#000000',
  },
  viewerTopRow: {
    position: 'absolute',
    top: 18,
    left: 14,
    right: 14,
    zIndex: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  viewerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  viewerMedia: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  viewerEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const ArtistPublicProfileModal = ({ visible, artistUid, onClose, onBook }: ArtistPublicProfileModalProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const currentUid = auth.currentUser?.uid ?? '';

  const [artist, setArtist] = useState<ArtistPublicProfileRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [postRows, setPostRows] = useState<ProfileMediaItem[]>([]);
  const [following, setFollowing] = useState(false);
  const [tab, setTab] = useState<'posts' | 'reels'>('posts');
  const [selectedMedia, setSelectedMedia] = useState<ProfileMediaItem | null>(null);

  useEffect(() => {
    if (!visible || !artistUid) return;
    void trackAnalyticsEvent(ANALYTICS_EVENTS.VIEW_ARTIST, { artist_id: artistUid, source: 'artist_profile' });
  }, [artistUid, visible]);

  useEffect(() => {
    if (!visible || !artistUid) {
      setArtist(null);
      setPostRows([]);
      setFollowing(false);
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    (async () => {
      try {
        const artistSnap = await getDoc(doc(db, 'artists', artistUid));
        if (!active) return;
        const artistData = artistSnap.exists() ? ({ uid: artistUid, ...(artistSnap.data() as any) } as ArtistPublicProfileRow) : null;
        if (artistData) {
          setArtist(artistData);
        } else {
          const userSnap = await getDoc(doc(db, 'users', artistUid));
          if (!active) return;
          setArtist(userSnap.exists() ? ({ uid: artistUid, ...(userSnap.data() as any) } as ArtistPublicProfileRow) : null);
        }
      } catch {
        if (active) setArtist(null);
      } finally {
        if (active) setLoading(false);
      }
    })();

    const postsUnsub = onSnapshot(
      query(collection(db, 'posts'), where('artistUid', '==', artistUid), where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(12)),
      (snap) => setPostRows(snap.docs.map((row) => ({ id: row.id, ...(row.data() as any) }))),
      () => setPostRows([]),
    );

    const followingUnsub = currentUid
      ? onSnapshot(doc(db, 'users', currentUid, 'following', artistUid), (snap) => setFollowing(snap.exists()), () => setFollowing(false))
      : () => {};

    return () => {
      active = false;
      postsUnsub();
      followingUnsub();
    };
  }, [artistUid, currentUid, visible]);

  const settings = useMemo(() => getArtistSettingsFromProfile(artist as any), [artist]);
  const discoverable = useMemo(() => isArtistDiscoverableForPublic(artist as any), [artist]);
  const locationLabel = useMemo(() => getArtistLocationLabel(artist, settings), [artist, settings]);
  const bookingMessage = useMemo(() => getArtistBookingMessage(settings), [settings]);
  const recentPosts = useMemo(() => postRows.filter((row) => Boolean(row.imageUrl?.trim()) || Boolean(row.videoUrl?.trim())), [postRows]);
  const reels = useMemo(() => postRows.filter((row) => Boolean(row.videoUrl?.trim())), [postRows]);
  const visiblePosts = tab === 'posts' ? recentPosts.filter((row) => !row.videoUrl) : reels;
  const title = artist?.artistName || artist?.displayName || 'Artist profile';
  const handle = artist?.artistHandle || `@${safeTrim(title).toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
  const experienceLabel = safeTrim((artist as any)?.experienceYears ?? artist?.experience ?? (artist as any)?.artistSinceYear);
  const startingPriceLabel =
    typeof artist?.startingPrice === 'number' && artist.startingPrice > 0
      ? `₹${Number(artist.startingPrice).toLocaleString('en-IN')}`
      : 'Updating';
  const availabilityLabel = settings.timeManagement.vacationMode
    ? 'On Vacation'
    : settings.timeManagement.availabilityStatus === 'available'
      ? 'Available'
      : 'Unavailable';

  const handleFollow = async () => {
    if (!artist?.uid) return;
    try {
      const result = await toggleFollow({
        artist: {
          uid: artist.uid,
          displayName: title,
          handle,
          studioName: artist.studioName ?? null,
          location: locationLabel,
          profileImageUrl: artist.profileImageUrl ?? null,
        },
      });
      setFollowing(Boolean(result.following));
    } catch (error: any) {
      Alert.alert('Tatzo', friendlyActionError(error, 'Could not update follow state.'));
    }
  };

  const handleShare = async () => {
    if (!artist?.uid) return;
    try {
      await Share.share({ message: `${title} on Tatzo\n${buildArtistShareLink(artist.uid)}` });
    } catch {
      // best effort
    }
  };

  const handleBook = () => {
    if (!artist) return;
    if (!discoverable) {
      Alert.alert('Tatzo', bookingMessage || 'Bookings are currently unavailable.');
      return;
    }
    void trackAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_STARTED, { artist_id: artist.uid, source: 'artist_profile' });
    onBook({
      id: artist.uid,
      uid: artist.uid,
      name: artist.artistName || artist.displayName || 'Artist',
      displayName: artist.displayName || artist.artistName || 'Artist',
      handle,
      studioName: artist.studioName || 'Studio',
      location: locationLabel,
      specialty: (artist.styles ?? []).join(' · ') || 'Tattoo artist',
      status: settings.timeManagement.vacationMode ? 'On Vacation' : settings.timeManagement.availabilityStatus === 'available' ? 'Available' : 'Unavailable',
      category: (artist.styles ?? [])[0] || 'Tattoo',
      verified: artist.verificationStatus === 'approved',
      tags: artist.styles ?? [],
      profileImageUrl: artist.profileImageUrl ?? undefined,
      bookingEnabled: settings.privacy.bookingVisibility !== false && discoverable,
      bookingDisabledMessage: bookingMessage,
      availableDays: settings.timeManagement.availableDays,
      startTime: settings.timeManagement.startTime,
      endTime: settings.timeManagement.endTime,
      vacationReturnDate: settings.timeManagement.vacationReturnDate,
      profileVisibility: settings.privacy.profileVisibility,
      availabilityStatus: settings.timeManagement.availabilityStatus,
    });
  };

  const profileGrid = (
    <FlatList
      data={visiblePosts}
      keyExtractor={(item) => item.id}
      numColumns={2}
      scrollEnabled={false}
      columnWrapperStyle={styles.gridRow}
      contentContainerStyle={styles.gridList}
      renderItem={({ item }) => (
        <TouchableOpacity activeOpacity={0.9} style={styles.gridTile} onPress={() => setSelectedMedia(item)}>
          {item.videoUrl?.trim() ? (
            <ProfileVideoTile uri={item.videoUrl.trim()} accentColor={theme.colors.accent} />
          ) : item.imageUrl?.trim() ? (
            <Image source={{ uri: item.imageUrl.trim() }} style={styles.gridImage} resizeMode="cover" />
          ) : (
            <View style={styles.gridFallback}>
              <Ionicons name="image-outline" size={22} color={theme.colors.accent} />
            </View>
          )}
        </TouchableOpacity>
      )}
      ListEmptyComponent={
        <View style={styles.emptyGrid}>
          <Ionicons name="images-outline" size={18} color={theme.colors.accent} />
          <Text style={styles.helper}>No public portfolio items yet.</Text>
        </View>
      }
    />
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap}>
        <View style={styles.sheet}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Artist Profile</Text>
            <TouchableOpacity activeOpacity={0.9} onPress={onClose} style={styles.iconBtn}>
              <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingState}>
              <Text style={styles.helper}>Loading artist profile...</Text>
            </View>
          ) : artist ? (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
              <View style={styles.profileHeaderCard}>
                {artist.coverImageUrl?.trim() ? (
                  <View style={styles.coverShell}>
                    <Image source={{ uri: artist.coverImageUrl.trim() }} style={styles.coverImage} resizeMode="cover" />
                    <View style={styles.coverScrim} />
                  </View>
                ) : null}
                <View style={styles.profileRow}>
                  <ProfileAvatar uri={artist.profileImageUrl ?? undefined} name={title} size={68} />
                  <View style={styles.profileCopy}>
                    <View style={styles.titleRow}>
                      <Text style={styles.name}>{title}</Text>
                      {artist.verificationStatus === 'approved' ? <Ionicons name="checkmark-circle" size={16} color={theme.colors.accentStrong} /> : null}
                    </View>
                    <Text style={styles.handle}>{handle}</Text>
                    <Text style={styles.meta}>{locationLabel}{experienceLabel ? ` · ${experienceLabel} Years Exp.` : ''}</Text>
                  </View>
                </View>
              </View>

              {!discoverable ? (
                <View style={styles.privateCard}>
                  <Text style={styles.privateTitle}>This profile is private or unavailable.</Text>
                  <Text style={styles.privateBody}>{bookingMessage || 'Please try another artist.'}</Text>
                </View>
              ) : null}

              <View style={styles.statsRow}>
                <View style={styles.statPill}><Text style={styles.statValue}>{experienceLabel || 'Not set'}</Text><Text style={styles.statLabel}>Experience</Text></View>
                <View style={styles.statPill}><Text style={styles.statValue}>{startingPriceLabel}</Text><Text style={styles.statLabel}>Starting From</Text></View>
                <View style={styles.statPill}><Text style={[styles.statValue, discoverable && styles.availableValue]}>{availabilityLabel}</Text><Text style={styles.statLabel}>Availability</Text></View>
              </View>

              <View style={styles.styleChipRow}>
                {(artist.styles?.length ? artist.styles : ['Black & Grey', 'Realism']).slice(0, 5).map((tag) => (
                  <View key={tag} style={styles.styleChip}>
                    <Text style={styles.styleChipText}>{tag}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.actionsRow}>
                {onBook ? (
                  <TouchableOpacity activeOpacity={0.9} style={[styles.primaryBtn, !discoverable && styles.disabledBtn]} onPress={handleBook} disabled={!discoverable}>
                    <Text style={styles.primaryBtnText}>{discoverable ? 'Book Artist' : 'Unavailable'}</Text>
                  </TouchableOpacity>
                ) : null}
                <TouchableOpacity activeOpacity={0.9} style={[styles.secondaryBtn, following && styles.secondaryBtnActive]} onPress={handleFollow}>
                  <Text style={[styles.secondaryBtnText, following && styles.secondaryBtnTextActive]}>{following ? 'Following' : 'Follow'}</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.9} style={styles.iconActionBtn} onPress={handleShare}>
                  <Ionicons name="share-social-outline" size={16} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
                </TouchableOpacity>
              </View>

              <View style={styles.sectionBlock}>
                <Text style={styles.sectionTitle}>About Artist</Text>
                <Text style={styles.sectionBody}>{safeTrim(artist.bio) || 'Premium tattoo artist on Tatzo.'}</Text>
                <Text style={styles.sectionBody}>{artist.studioName || 'Independent Studio'} · {typeof artist.startingPrice === 'number' && artist.startingPrice > 0 ? `Starting Rs. ${Number(artist.startingPrice).toLocaleString('en-IN')}` : 'Starting price updating'}</Text>
              </View>

              <View style={styles.tabsRow}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => setTab('posts')} style={[styles.tabPill, tab === 'posts' && styles.tabPillActive]}>
                  <Text style={[styles.tabText, tab === 'posts' && styles.tabTextActive]}>Portfolio</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.9} onPress={() => setTab('reels')} style={[styles.tabPill, tab === 'reels' && styles.tabPillActive]}>
                  <Text style={[styles.tabText, tab === 'reels' && styles.tabTextActive]}>Reels</Text>
                </TouchableOpacity>
              </View>

              {profileGrid}
            </ScrollView>
          ) : (
            <View style={styles.loadingState}>
              <Text style={styles.privateTitle}>Artist profile unavailable.</Text>
              <Text style={styles.helper}>This profile is private, hidden, or missing.</Text>
            </View>
          )}
        </View>
        {selectedMedia ? <ProfileMediaViewer item={selectedMedia} theme={theme} onClose={() => setSelectedMedia(null)} /> : null}
      </View>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.7)',
    },
    sheetWrap: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    sheet: {
      maxHeight: '94%',
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      backgroundColor: theme.colors.background,
      borderTopWidth: 0,
      overflow: 'hidden',
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 10,
    },
    headerTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 16,
      fontWeight: '900',
    },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      borderWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? '#ffffff' : theme.colors.surface,
    },
    content: {
      paddingHorizontal: 16,
      paddingBottom: 24,
      gap: 12,
    },
    loadingState: {
      paddingHorizontal: 16,
      paddingBottom: 24,
      gap: 8,
    },
    helper: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 17,
      fontWeight: '700',
    },
    profileHeaderCard: {
      borderRadius: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
      padding: 0,
      gap: 12,
      overflow: 'hidden',
    },
    coverShell: {
      height: 82,
      borderRadius: 16,
      overflow: 'hidden',
      backgroundColor: theme.mode === 'light' ? '#F8FAFC' : '#080808',
    },
    coverImage: {
      ...StyleSheet.absoluteFillObject,
    },
    coverScrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.18)',
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 2,
      paddingBottom: 2,
    },
    profileCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    name: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 19,
      fontWeight: '900',
      flexShrink: 1,
    },
    handle: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    meta: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      lineHeight: 16,
    },
    privateCard: {
      borderRadius: 18,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.035)',
      padding: 14,
      gap: 6,
    },
    privateTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    privateBody: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    statsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    statPill: {
      flex: 1,
      borderRadius: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
      paddingVertical: 10,
      alignItems: 'center',
      gap: 3,
    },
    statValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    availableValue: {
      color: '#22C55E',
    },
    statLabel: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
    },
    bio: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '700',
    },
    stylesLine: {
      color: theme.colors.accent,
      fontSize: 11,
      fontWeight: '900',
    },
    styleChipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    styleChip: {
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    styleChipText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '900',
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    primaryBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      paddingVertical: 12,
      backgroundColor: theme.colors.accent,
    },
    disabledBtn: {
      opacity: 0.6,
    },
    primaryBtnText: {
      color: theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
    },
    secondaryBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      paddingVertical: 12,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F1F1F5' : 'rgba(255,255,255,0.055)',
    },
    secondaryBtnActive: {
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    secondaryBtnText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
    },
    secondaryBtnTextActive: {
      color: theme.colors.accent,
    },
    iconActionBtn: {
      width: 46,
      borderRadius: 14,
      borderWidth: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)',
    },
    sectionBlock: {
      borderRadius: 0,
      borderWidth: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)',
      backgroundColor: 'transparent',
      paddingTop: 14,
      gap: 6,
    },
    sectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    sectionBody: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    tabsRow: {
      flexDirection: 'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)',
    },
    tabPill: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 0,
      borderWidth: 0,
      backgroundColor: 'transparent',
    },
    tabPillActive: {
      borderWidth: 0,
      borderBottomWidth: 2,
      borderBottomColor: theme.colors.accent,
      backgroundColor: 'transparent',
    },
    tabText: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '900',
    },
    tabTextActive: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
    },
    gridRow: {
      gap: 8,
      marginBottom: 8,
    },
    gridList: {
      paddingBottom: 8,
    },
    gridTile: {
      flex: 1,
      maxWidth: '49%',
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.045)',
      aspectRatio: 0.78,
    },
    gridImage: {
      width: '100%',
      height: '100%',
    },
    gridFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyGrid: {
      borderRadius: 18,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.035)',
      padding: 14,
      alignItems: 'center',
      gap: 8,
    },
  });

export default ArtistPublicProfileModal;



