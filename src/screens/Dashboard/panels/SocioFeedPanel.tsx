import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  AppState,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';
import { auth, db } from '../../../config/firebaseConfig';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import type { ArtistPostRow } from '../../../services/posts';
import { sharePost, toggleBlockUser, toggleFollow, toggleLike, toggleSavePost } from '../../../services/social';
import { reportPost } from '../../../services/reports';
import ProfileAvatar from '../../../components/ui/ProfileAvatar';

type SocioFeedPanelProps = {
  header?: React.ReactNode;
  onOpenArtistProfile?: (artistUid: string) => void;
  onExploreArtists?: () => void;
  onGetQuote?: () => void;
  hideSearchBar?: boolean;
  hideFollowAction?: boolean;
};

type FeedReportTarget = {
  postId: string;
  artistUid: string;
  artistName: string;
  postPreview: string;
};

type FeedMenuTarget = ArtistPostRow | null;

const safeTrim = (value: unknown) => String(value ?? '').trim();
const FEED_PAGE_SIZE = 12;

const renderTags = (tags: unknown) =>
  Array.isArray(tags) ? tags.map((tag) => safeTrim(tag)).filter(Boolean).slice(0, 4) : [];

const FeedVideoPreview = ({
  uri,
  style,
  accentColor,
  shouldAutoPlay,
}: {
  uri: string;
  style: any;
  accentColor: string;
  shouldAutoPlay: boolean;
}) => {
  const [playing, setPlaying] = useState(false);
  const [manualPaused, setManualPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const player = useVideoPlayer({ uri }, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.volume = 0;
  });

  useEffect(() => {
    setManualPaused(false);
    setPlaying(false);
    setMuted(true);
  }, [uri]);

  useEffect(() => {
    player.muted = muted;
    player.volume = muted ? 0 : 1;
  }, [muted, player]);

  useEffect(() => {
    if (shouldAutoPlay && !manualPaused) {
      player.play();
      setPlaying(true);
      return;
    }
    player.pause();
    setPlaying(false);
  }, [manualPaused, player, shouldAutoPlay]);

  const togglePlayback = () => {
    if (playing) {
      player.pause();
      setManualPaused(true);
      setPlaying(false);
      return;
    }
    setManualPaused(false);
    player.play();
    setPlaying(true);
  };

  return (
    <Pressable style={style} onPress={togglePlayback}>
      <VideoView player={player} style={StyleSheet.absoluteFillObject} nativeControls={false} contentFit="cover" fullscreenOptions={{ enable: false }} />
      <View style={feedVideoStyles.reelBadge}>
        <Ionicons name="play" size={10} color="#ffffff" />
        <Text style={feedVideoStyles.reelBadgeText}>REEL</Text>
      </View>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setMuted((value) => !value)} style={feedVideoStyles.soundButton}>
        <Ionicons name={muted ? 'volume-mute' : 'volume-high'} size={15} color="#ffffff" />
      </TouchableOpacity>
      {playing ? null : (
        <View style={feedVideoStyles.playOverlay}>
          <View style={[feedVideoStyles.playButton, { borderColor: accentColor }]}>
            <Ionicons name="play" size={24} color="#ffffff" />
          </View>
        </View>
      )}
    </Pressable>
  );
};

const friendlyActionError = (error: unknown, fallback: string) => {
  const code = String((error as any)?.code ?? '').toLowerCase();
  const message = String((error as any)?.message ?? '').trim();
  if (code.includes('permission-denied') || message.toLowerCase().includes('missing or insufficient permissions')) {
    return 'Tatzo could not complete that action right now. Please try again.';
  }
  if (message) return message;
  return fallback;
};

const SocioFeedPanel = ({
  header,
  onOpenArtistProfile,
  onExploreArtists,
  onGetQuote,
  hideSearchBar = false,
  hideFollowAction = false,
}: SocioFeedPanelProps) => {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const uid = auth.currentUser?.uid ?? '';

  const [posts, setPosts] = useState<ArtistPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pageCursor, setPageCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const didLoadPosts = useRef(false);
  const [search, setSearch] = useState('');
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [blockedArtistIds, setBlockedArtistIds] = useState<Set<string>>(new Set());
  const [artistMetaMap, setArtistMetaMap] = useState<Record<string, { location: string; studioName: string }>>({});
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [menuTarget, setMenuTarget] = useState<FeedMenuTarget>(null);
  const [reportTarget, setReportTarget] = useState<FeedReportTarget | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [sharingPostId, setSharingPostId] = useState<string | null>(null);
  const [activeVideoPostId, setActiveVideoPostId] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 70 }).current;
  const handleViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item?: ArtistPostRow }> }) => {
      const nextVideo = viewableItems
        .map((row) => row.item)
        .find((post) => post && (post.mediaType === 'video' || Boolean(safeTrim(post.videoUrl))));
      setActiveVideoPostId(nextVideo?.id ?? null);
    },
  ).current;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);

  const loadPosts = useCallback(async (reset = false) => {
    if (!reset && (loadingMore || !hasMore)) return;
    if (reset) setRefreshing(true);
    else setLoadingMore(true);

    try {
      const constraints = [where('status', '==', 'active'), orderBy('createdAt', 'desc'), limit(FEED_PAGE_SIZE)];
      const postsQuery = reset || !pageCursor
        ? query(collection(db, 'posts'), ...constraints)
        : query(collection(db, 'posts'), ...constraints.slice(0, 2), startAfter(pageCursor), limit(FEED_PAGE_SIZE));
      const snap = await getDocs(postsQuery);
      const nextRows = snap.docs.map((row) => ({ id: row.id, ...(row.data() as any) }) as ArtistPostRow);

      setPosts((current) => {
        if (reset) return nextRows;
        const merged = new Map(current.map((post) => [post.id, post]));
        nextRows.forEach((post) => merged.set(post.id, post));
        return Array.from(merged.values());
      });
      setPageCursor(snap.docs.at(-1) ?? null);
      setHasMore(snap.docs.length === FEED_PAGE_SIZE);
    } catch {
      if (reset) setPosts([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, pageCursor]);

  useEffect(() => {
    if (didLoadPosts.current) return;
    didLoadPosts.current = true;
    void loadPosts(true);
  }, [loadPosts]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      collection(db, 'users', uid, 'savedPosts'),
      (snap) => setSavedIds(new Set(snap.docs.map((row) => row.id))),
      () => setSavedIds(new Set()),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setLikedIds(new Set());
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'users', uid, 'likedPosts'),
      (snap) => setLikedIds(new Set(snap.docs.map((row) => row.id))),
      () => setLikedIds(new Set()),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setFollowingIds(new Set());
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'users', uid, 'following'),
      (snap) =>
        setFollowingIds(
          new Set(
            snap.docs
              .map((row) => String((row.data() as any)?.artistUid ?? row.id).trim())
              .filter(Boolean),
          ),
        ),
      () => setFollowingIds(new Set()),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setBlockedArtistIds(new Set());
      return;
    }
    const unsub = onSnapshot(
      collection(db, 'users', uid, 'blockedUsers'),
      (snap) => setBlockedArtistIds(new Set(snap.docs.map((row) => row.id))),
      () => setBlockedArtistIds(new Set()),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    const artistUids = Array.from(new Set(posts.map((post) => String(post.artistUid ?? '').trim()).filter(Boolean)));
    if (!artistUids.length) {
      setArtistMetaMap({});
      return;
    }

    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        artistUids.map(async (artistUid) => {
          try {
            const snap = await getDoc(doc(db, 'artists', artistUid));
            if (!snap.exists()) return [artistUid, { location: '', studioName: '' }] as const;
            const data = snap.data() as any;
            const location = String((data?.location || [data?.locationArea, data?.locationCity].filter(Boolean).join(', ')) ?? '').trim();
            const studioName = String(data?.studioName ?? data?.shopName ?? '').trim();
            return [artistUid, { location, studioName }] as const;
          } catch {
            return [artistUid, { location: '', studioName: '' }] as const;
          }
        }),
      );

      if (cancelled) return;
      setArtistMetaMap(
        entries.reduce<Record<string, { location: string; studioName: string }>>((acc, [artistUid, meta]) => {
          acc[artistUid] = meta;
          return acc;
        }, {}),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [posts]);

  const visiblePosts = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return posts.filter((post) => {
      if (post.artistVisible === false || post.artistApproved === false || post.bookingVisible === false) return false;
      if (blockedArtistIds.has(post.artistUid)) return false;
      if (!needle) return true;
      const haystack = [
        post.caption,
        post.artistName,
        post.artistHandle,
        (post.tags ?? []).join(' '),
        post.artistProfileImageUrl,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [blockedArtistIds, posts, search]);

  const handleSave = async (post: ArtistPostRow) => {
    if (!uid) return Alert.alert('Tatzo', 'Please sign in first.');
    setBusyPostId(post.id);
    const wasSaved = savedIds.has(post.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (wasSaved) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
    try {
      await toggleSavePost({ postId: post.id, postPreview: post.caption });
    } catch (error: any) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (wasSaved) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
      Alert.alert('Tatzo', friendlyActionError(error, 'Could not save this post.'));
    } finally {
      setBusyPostId(null);
    }
  };

  const handleLike = async (post: ArtistPostRow) => {
    if (!uid) return Alert.alert('Tatzo', 'Please sign in first.');
    setBusyPostId(post.id);
    const wasLiked = likedIds.has(post.id);
    setLikedIds((prev) => {
      const next = new Set(prev);
      if (wasLiked) next.delete(post.id);
      else next.add(post.id);
      return next;
    });
    try {
      const result = await toggleLike({
        postId: post.id,
        artist: { uid: post.artistUid, displayName: post.artistName, handle: post.artistHandle ?? undefined },
        postPreview: post.caption,
      });
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (result.liked) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
    } catch (error: any) {
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.add(post.id);
        else next.delete(post.id);
        return next;
      });
      Alert.alert('Tatzo', friendlyActionError(error, 'Could not like this post.'));
    } finally {
      setBusyPostId(null);
    }
  };

  const handleFollow = async (post: ArtistPostRow) => {
    if (!uid) return Alert.alert('Tatzo', 'Please sign in first.');
    setBusyPostId(post.id);
    const wasFollowing = followingIds.has(post.artistUid);
    setFollowingIds((prev) => {
      const next = new Set(prev);
      if (wasFollowing) next.delete(post.artistUid);
      else next.add(post.artistUid);
      return next;
    });
    try {
      await toggleFollow({
        artist: { uid: post.artistUid, displayName: post.artistName, handle: post.artistHandle ?? undefined },
      });
    } catch (error: any) {
      setFollowingIds((prev) => {
        const next = new Set(prev);
        if (wasFollowing) next.add(post.artistUid);
        else next.delete(post.artistUid);
        return next;
      });
      Alert.alert('Tatzo', friendlyActionError(error, 'Could not follow this artist.'));
    } finally {
      setBusyPostId(null);
    }
  };

  const handleShare = async (post: ArtistPostRow) => {
    if (!uid) return Alert.alert('Tatzo', 'Please sign in first.');
    setSharingPostId(post.id);
    try {
      await sharePost({
        postId: post.id,
        artist: { uid: post.artistUid, displayName: post.artistName, handle: post.artistHandle ?? undefined },
        postPreview: post.caption,
        shareMessage: `${post.artistName} on Tatzo`,
      });
    } catch (error: any) {
      Alert.alert('Tatzo', friendlyActionError(error, 'Could not share this post.'));
    } finally {
      setSharingPostId(null);
    }
  };

  const handleBlock = async (post: ArtistPostRow) => {
    if (!uid) return Alert.alert('Tatzo', 'Please sign in first.');
    try {
      await toggleBlockUser({
        blockedUid: post.artistUid,
        blockedName: post.artistName,
        blockedProfileImageUrl: post.artistProfileImageUrl ?? undefined,
      });
      setBlockedArtistIds((prev) => new Set(prev).add(post.artistUid));
    } catch (error: any) {
      Alert.alert('Tatzo', friendlyActionError(error, 'Could not block this artist.'));
    }
  };

  const handleReport = async () => {
    if (!reportTarget) return;
    const reason = reportReason.trim();
    if (!reason) {
      Alert.alert('Tatzo', 'Please tell us why you are reporting this post.');
      return;
    }
    try {
      await reportPost({ postId: reportTarget.postId, postOwnerUid: reportTarget.artistUid, reason });
      setReportTarget(null);
      setReportReason('');
      Alert.alert('Tatzo', 'Report submitted.');
    } catch (error: any) {
      Alert.alert('Tatzo', friendlyActionError(error, 'Could not submit report.'));
    }
  };

  const renderPost = ({ item }: { item: ArtistPostRow }) => {
    const imageUrl = safeTrim(item.imageUrl);
    const videoUrl = safeTrim(item.videoUrl);
    const isVideo = item.mediaType === 'video' || Boolean(videoUrl);
    const isSaved = savedIds.has(item.id);
    const isLiked = likedIds.has(item.id);
    const isBusy = busyPostId === item.id;
    const isSharing = sharingPostId === item.id;
    const tags = renderTags(item.tags);
    const artistMeta = artistMetaMap[item.artistUid] ?? { location: '', studioName: '' };
    const locationLine =
      safeTrim(artistMeta.studioName) && safeTrim(artistMeta.location)
        ? `${safeTrim(artistMeta.studioName)} • ${safeTrim(artistMeta.location)}`
        : safeTrim(artistMeta.studioName) || safeTrim(artistMeta.location) || 'Chennai, Tamil Nadu';

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <TouchableOpacity activeOpacity={0.9} style={styles.cardHeaderPressable} onPress={() => onOpenArtistProfile?.(item.artistUid)}>
            <ProfileAvatar uri={item.artistProfileImageUrl ?? undefined} name={item.artistName} size={42} />
            <View style={styles.cardHeaderCopy}>
              <View style={styles.nameRow}>
                <Text style={styles.artistName} numberOfLines={1}>{item.artistName}</Text>
                {item.artistApproved ? <Ionicons name="checkmark-circle" size={14} color={theme.colors.accentStrong} /> : null}
              </View>
              <Text style={styles.artistMeta} numberOfLines={1}>{locationLine}</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} style={styles.menuButton} onPress={() => setMenuTarget(item)}>
            <Ionicons name="ellipsis-vertical" size={14} color={theme.colors.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={[styles.mediaShell, isVideo ? styles.reelMediaShell : styles.imageMediaShell]}>
          {isVideo && videoUrl ? (
            <FeedVideoPreview
              uri={videoUrl}
              style={styles.media}
              accentColor={theme.colors.accent}
              shouldAutoPlay={appActive && activeVideoPostId === item.id}
            />
          ) : imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.media} resizeMode="cover" />
          ) : (
            <LinearGradient colors={theme.gradients.dark} style={styles.mediaFallback}>
              <Ionicons name={isVideo ? 'play-circle-outline' : 'image-outline'} size={26} color={theme.colors.textInverse} />
              <Text style={styles.mediaFallbackText}>{isVideo ? 'Reel' : 'Post'}</Text>
            </LinearGradient>
          )}
        </View>

        <Text style={styles.caption} numberOfLines={2}>{item.caption || 'Tattoo art from Tatzo'}</Text>

        {tags.length ? (
          <View style={styles.tagRow}>
            {tags.map((tag) => (
              <View key={tag} style={styles.tagPill}>
                <Text style={styles.tagText}>#{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.actionRow}>
          <View style={styles.leftActionRow}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={[styles.actionIconButton, isLiked && styles.actionIconButtonActive]}
              onPress={() => handleLike(item)}
              disabled={isBusy}
            >
              <Ionicons name={isLiked ? 'heart' : 'heart-outline'} size={18} color={isLiked ? theme.colors.accent : theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.9} style={styles.actionIconButton} onPress={() => handleShare(item)} disabled={isSharing}>
              <Ionicons name="share-social-outline" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
            {hideFollowAction ? null : (
              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.actionIconButton, followingIds.has(item.artistUid) && styles.actionIconButtonActive]}
                onPress={() => handleFollow(item)}
                disabled={isBusy}
              >
                <Ionicons
                  name={followingIds.has(item.artistUid) ? 'person' : 'person-add-outline'}
                  size={18}
                  color={followingIds.has(item.artistUid) ? theme.colors.accent : theme.colors.textMuted}
                />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            activeOpacity={0.9}
            style={[styles.actionIconButton, styles.saveAction, isSaved && styles.actionIconButtonActive]}
            onPress={() => handleSave(item)}
            disabled={isBusy}
          >
            <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={18} color={isSaved ? theme.colors.accent : theme.colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {header ? <View style={styles.headerWrap}>{header}</View> : null}

      {hideSearchBar ? null : (
        <View style={styles.searchCard}>
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search artists, tags, tattoos..."
              placeholderTextColor={theme.colors.textMuted}
              style={styles.searchInput}
            />
          </View>
          <View style={styles.discoveryRow}>
            <TouchableOpacity activeOpacity={0.9} style={styles.discoveryPill} onPress={onExploreArtists}>
              <Text style={styles.discoveryPillText}>Trending Posts</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.9} style={styles.discoveryPill} onPress={onGetQuote}>
              <Text style={styles.discoveryPillText}>Find Artist</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {loading ? (
        <View style={styles.loadingState}>
          <Text style={styles.loadingText}>Loading feed...</Text>
        </View>
      ) : (
        <FlatList
          data={visiblePosts}
          keyExtractor={(item) => item.id}
          renderItem={renderPost}
          contentContainerStyle={[styles.listContent, { paddingBottom: 120 + insets.bottom }]}
          onViewableItemsChanged={handleViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={() => void loadPosts(true)}
          onEndReachedThreshold={0.55}
          onEndReached={() => void loadPosts(false)}
          ListFooterComponent={loadingMore ? <Text style={styles.loadingText}>Loading more...</Text> : null}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="albums-outline" size={26} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>No posts yet</Text>
              <Text style={styles.emptyBody}>Discover tattoo photos and reels from approved artists here.</Text>
            </View>
          }
        />
      )}

      <Modal visible={Boolean(menuTarget)} transparent animationType="fade" onRequestClose={() => setMenuTarget(null)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuTarget(null)} />
        <View style={styles.menuSheetWrap}>
          <View style={styles.menuSheet}>
            <Text style={styles.menuSheetTitle}>More</Text>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.menuSheetAction}
              onPress={() => {
                if (!menuTarget) return;
                setReportTarget({
                  postId: menuTarget.id,
                  artistUid: menuTarget.artistUid,
                  artistName: menuTarget.artistName,
                  postPreview: menuTarget.caption,
                });
                setMenuTarget(null);
              }}
            >
              <Ionicons name="flag-outline" size={18} color={theme.colors.accent} />
              <Text style={styles.menuSheetActionText}>Report</Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.menuSheetAction}
              onPress={() => {
                if (!menuTarget) return;
                handleBlock(menuTarget);
                setMenuTarget(null);
              }}
            >
              <Ionicons name="ban-outline" size={18} color={theme.colors.accent} />
              <Text style={styles.menuSheetActionText}>Block</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={Boolean(reportTarget)} transparent animationType="fade" onRequestClose={() => setReportTarget(null)}>
        <Pressable style={styles.backdrop} onPress={() => setReportTarget(null)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Report post</Text>
              <TouchableOpacity activeOpacity={0.9} onPress={() => setReportTarget(null)} style={styles.iconBtn}>
                <Ionicons name="close" size={16} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.sheetBody}>
              <Text style={styles.sheetText}>Tell us what went wrong. You can also block this artist from the 3-dot menu above.</Text>
              <TextInput
                value={reportReason}
                onChangeText={setReportReason}
                placeholder="Why are you reporting this post?"
                placeholderTextColor={theme.colors.textMuted}
                style={[styles.input, styles.reportInput]}
                multiline
              />
              <View style={styles.sheetActions}>
                <TouchableOpacity activeOpacity={0.9} onPress={() => setReportTarget(null)} style={styles.secondaryBtn}>
                  <Text style={styles.secondaryBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity activeOpacity={0.9} onPress={handleReport} style={styles.primaryBtn}>
                  <Text style={styles.primaryBtnText}>Submit report</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const feedVideoStyles = StyleSheet.create({
  reelBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  reelBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  soundButton: {
    position: 'absolute',
    right: 12,
    top: 12,
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.48)',
  },
  playOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.08)',
  },
  playButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    backgroundColor: 'rgba(0,0,0,0.34)',
  },
});

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1 },
    headerWrap: { marginBottom: 8 },
    searchCard: {
      marginHorizontal: 18,
      marginBottom: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.03)',
      padding: 12,
      gap: 8,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.02)',
      paddingHorizontal: 11,
      paddingVertical: 9,
    },
    searchInput: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '700',
    },
    discoveryRow: {
      flexDirection: 'row',
      gap: 6,
      flexWrap: 'wrap',
    },
    discoveryPill: {
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.accentSoft,
    },
    discoveryPillText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '900',
    },
    loadingState: {
      paddingHorizontal: 16,
      paddingVertical: 24,
    },
    loadingText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    listContent: {
      paddingHorizontal: 18,
      paddingBottom: 120,
      gap: 10,
    },
    card: {
      borderRadius: 22,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.025)',
      padding: 12,
      gap: 10,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardHeaderPressable: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    cardHeaderCopy: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    menuButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.04)' : 'rgba(255,255,255,0.03)',
      borderWidth: 0,
    },
    artistName: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      flexShrink: 1,
    },
    artistMeta: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
    },
    mediaShell: {
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: '#08080b',
      position: 'relative',
    },
    imageMediaShell: {
      aspectRatio: 4 / 5,
    },
    reelMediaShell: {
      aspectRatio: 9 / 16,
    },
    media: {
      width: '100%',
      height: '100%',
    },
    mediaFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    mediaFallbackText: {
      color: theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '800',
    },
    caption: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      lineHeight: 16,
      fontWeight: '700',
      paddingBottom: 2,
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    tagPill: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)',
    },
    tagText: {
      color: theme.colors.accent,
      fontSize: 10,
      fontWeight: '900',
    },
    actionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    leftActionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    actionIconButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F3F3F7' : 'rgba(255,255,255,0.035)',
    },
    actionIconButtonActive: {
      borderWidth: 0,
      backgroundColor: theme.colors.accentSoft,
    },
    saveAction: {
      marginLeft: 'auto',
    },
    menuBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.28)',
    },
    menuSheetWrap: {
      flex: 1,
      justifyContent: 'flex-start',
      alignItems: 'flex-end',
      paddingTop: 116,
      paddingRight: 18,
    },
    menuSheet: {
      width: 130,
      borderRadius: 16,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : '#101117',
      paddingVertical: 10,
      paddingHorizontal: 10,
      gap: 8,
    },
    menuSheetTitle: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 2,
    },
    menuSheetAction: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      minHeight: 36,
      borderRadius: 12,
      paddingHorizontal: 10,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.03)' : 'rgba(255,255,255,0.03)',
    },
    menuSheetActionText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '800',
    },
    emptyState: {
      borderRadius: 20,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)',
      padding: 14,
      alignItems: 'center',
      gap: 8,
      minHeight: 132,
      justifyContent: 'center',
    },
    emptyTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    emptyBody: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 18,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.62)',
    },
    sheetWrap: {
      flex: 1,
      justifyContent: 'flex-end',
      paddingHorizontal: 12,
      paddingBottom: 18,
    },
    sheet: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : '#0f1015',
      overflow: 'hidden',
      maxHeight: '78%',
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingTop: 14,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    sheetTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
    },
    iconBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.04)' : 'rgba(255,255,255,0.04)',
    },
    sheetBody: {
      padding: 14,
      gap: 12,
    },
    sheetText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
    },
    input: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)',
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '700',
    },
    reportInput: {
      minHeight: 96,
      textAlignVertical: 'top',
    },
    sheetActions: {
      flexDirection: 'row',
      gap: 10,
    },
    secondaryBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingVertical: 12,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.04)' : 'rgba(255,255,255,0.03)',
    },
    secondaryBtnText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
    },
    primaryBtn: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 14,
      paddingVertical: 12,
      backgroundColor: theme.colors.accent,
    },
    primaryBtnText: {
      color: theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
    },
  });

export default SocioFeedPanel;
