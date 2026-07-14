import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { VideoView, useVideoPlayer } from 'expo-video';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db } from '../../../config/firebaseConfig';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import type { ArtistPostRow } from '../../../services/posts';
import { sharePost, toggleFollow, toggleLike, toggleSavePost } from '../../../services/social';
import ProfileAvatar from '../../../components/ui/ProfileAvatar';

type ExplorePanelProps = {
  header?: React.ReactNode;
  onViewArtist?: (artistUid: string) => void;
};

type ArtistMeta = {
  location: string;
  studioName: string;
  bio: string;
};

const safeTrim = (value: unknown) => String(value ?? '').trim();
const EXPLORE_PAGE_SIZE = 18;

const friendlyActionError = (error: unknown, fallback: string) => {
  const code = String((error as any)?.code ?? '').toLowerCase();
  const message = String((error as any)?.message ?? '').trim();
  if (code.includes('permission-denied') || message.toLowerCase().includes('missing or insufficient permissions')) {
    return 'Tatzo could not complete that action right now. Please try again.';
  }
  if (message) return message;
  return fallback;
};

const isDiscoverable = (post: ArtistPostRow) =>
  post.artistApproved !== false && post.artistVisible !== false && post.bookingVisible !== false;

const ViewerVideo = ({ uri, style }: { uri: string; style: any }) => {
  const player = useVideoPlayer({ uri }, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = false;
    videoPlayer.volume = 1;
    videoPlayer.play();
  });

  return <VideoView player={player} style={style} nativeControls={false} contentFit="cover" fullscreenOptions={{ enable: false }} />;
};

const GridVideoPreview = ({ uri, style }: { uri: string; style: any }) => {
  const player = useVideoPlayer({ uri }, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = true;
    videoPlayer.volume = 0;
  });

  return <VideoView player={player} style={style} nativeControls={false} contentFit="cover" fullscreenOptions={{ enable: false }} />;
};

const ExplorePanel = ({ header, onViewArtist }: ExplorePanelProps) => {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme, insets.bottom), [theme, insets.bottom]);
  const numColumns = width >= 430 ? 3 : 2;
  const uid = auth.currentUser?.uid ?? '';

  const [search, setSearch] = useState('');
  const [posts, setPosts] = useState<ArtistPostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [pageCursor, setPageCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const didLoadPosts = useRef(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [blockedArtistIds, setBlockedArtistIds] = useState<Set<string>>(new Set());
  const [artistMetaMap, setArtistMetaMap] = useState<Record<string, ArtistMeta>>({});
  const [busyPostId, setBusyPostId] = useState<string | null>(null);
  const [sharingPostId, setSharingPostId] = useState<string | null>(null);
  const [viewerPost, setViewerPost] = useState<ArtistPostRow | null>(null);

  const loadPosts = useCallback(async (reset = false) => {
    if (!reset && (loadingMore || !hasMore)) return;
    if (reset) setRefreshing(true);
    else setLoadingMore(true);

    try {
      const baseConstraints = [where('status', '==', 'active'), orderBy('createdAt', 'desc')];
      const postsQuery = reset || !pageCursor
        ? query(collection(db, 'posts'), ...baseConstraints, limit(EXPLORE_PAGE_SIZE))
        : query(collection(db, 'posts'), ...baseConstraints, startAfter(pageCursor), limit(EXPLORE_PAGE_SIZE));
      const snap = await getDocs(postsQuery);
      const nextRows = snap.docs.map((row) => ({ id: row.id, ...(row.data() as any) }) as ArtistPostRow);

      setPosts((current) => {
        if (reset) return nextRows;
        const merged = new Map(current.map((post) => [post.id, post]));
        nextRows.forEach((post) => merged.set(post.id, post));
        return Array.from(merged.values());
      });
      setPageCursor(snap.docs.at(-1) ?? null);
      setHasMore(snap.docs.length === EXPLORE_PAGE_SIZE);
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
    let cancelled = false;
    const artistUids = Array.from(
      new Set(
        posts
          .filter(isDiscoverable)
          .map((post) => String(post.artistUid ?? '').trim())
          .filter(Boolean),
      ),
    );

    if (!artistUids.length) {
      setArtistMetaMap({});
      return () => {
        cancelled = true;
      };
    }

    (async () => {
      const entries = await Promise.all(
        artistUids.map(async (artistUid) => {
          try {
            const snap = await getDoc(doc(db, 'artists', artistUid));
            if (!snap.exists()) return [artistUid, { location: '', studioName: '', bio: '' }] as const;
            const data = snap.data() as any;
            const location = String((data?.location || [data?.locationArea, data?.locationCity].filter(Boolean).join(', ')) ?? '').trim();
            const studioName = String(data?.studioName ?? data?.shopName ?? '').trim();
            const bio = String(data?.bio ?? data?.specialization ?? data?.artistBio ?? '').trim();
            return [artistUid, { location, studioName, bio }] as const;
          } catch {
            return [artistUid, { location: '', studioName: '', bio: '' }] as const;
          }
        }),
      );

      if (cancelled) return;
      setArtistMetaMap(
        entries.reduce<Record<string, ArtistMeta>>((acc, [artistUid, meta]) => {
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
      if (!isDiscoverable(post)) return false;
      if (blockedArtistIds.has(post.artistUid)) return false;
      if (!needle) return true;
      const meta = artistMetaMap[post.artistUid] ?? { location: '', studioName: '', bio: '' };
      const haystack = [
        post.caption,
        post.artistName,
        post.artistHandle,
        (post.tags ?? []).join(' '),
        meta.location,
        meta.studioName,
        meta.bio,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [artistMetaMap, blockedArtistIds, posts, search]);

  const trendingTags = useMemo(() => {
    const counts = new Map<string, number>();
    visiblePosts.forEach((post) => {
      (post.tags ?? []).forEach((tag) => {
        const key = safeTrim(tag).toLowerCase();
        if (!key) return;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      });
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([tag]) => tag);
  }, [visiblePosts]);

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
      await toggleLike({
        postId: post.id,
        artist: { uid: post.artistUid, displayName: post.artistName, handle: post.artistHandle ?? undefined },
        postPreview: post.caption,
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

  const viewerMeta = viewerPost ? artistMetaMap[viewerPost.artistUid] ?? { location: '', studioName: '', bio: '' } : null;
  const viewerImageUrl = safeTrim(viewerPost?.imageUrl);
  const viewerVideoUrl = safeTrim(viewerPost?.videoUrl);
  const viewerIsVideo = Boolean(viewerVideoUrl);
  const viewerSaved = viewerPost ? savedIds.has(viewerPost.id) : false;
  const viewerLiked = viewerPost ? likedIds.has(viewerPost.id) : false;
  const viewerLocation =
    viewerMeta && (safeTrim(viewerMeta.studioName) || safeTrim(viewerMeta.location))
      ? [viewerMeta.studioName, viewerMeta.location].filter(Boolean).join(' • ')
      : 'Tatzo artist';
  const viewerTags = viewerPost?.tags ?? [];

  const renderGridItem = ({ item }: { item: ArtistPostRow }) => {
    const imageUrl = safeTrim(item.imageUrl);
    const videoUrl = safeTrim(item.videoUrl);
    const isVideo = item.mediaType === 'video' || Boolean(videoUrl);
    const isSaved = savedIds.has(item.id);
    const isBusy = busyPostId === item.id;
    const aspectRatio = isVideo ? 9 / 16 : 4 / 5;

    return (
      <TouchableOpacity
        activeOpacity={0.92}
        style={styles.gridCard}
        onPress={() => setViewerPost(item)}
      >
        <View style={[styles.gridMediaShell, { aspectRatio }]}>
          {isVideo && videoUrl ? (
            <>
              {imageUrl ? <Image source={{ uri: imageUrl }} style={styles.gridMedia} resizeMode="cover" /> : null}
              <GridVideoPreview uri={videoUrl} style={styles.gridMedia} />
            </>
          ) : imageUrl ? (
            <Image source={{ uri: imageUrl }} style={styles.gridMedia} resizeMode="cover" />
          ) : (
            <LinearGradient
              colors={
                theme.mode === 'light'
                  ? ['#ffffff', '#f3e8ff', '#dbeafe']
                  : ['rgba(124,58,237,0.88)', 'rgba(31,41,55,0.92)', 'rgba(8,8,12,1)']
              }
              locations={[0, 0.56, 1]}
              style={styles.gridMediaFallback}
            >
              <View style={styles.posterBadge}>
                <Ionicons name={isVideo ? 'play' : 'image'} size={14} color={theme.colors.textInverse} />
                <Text style={styles.posterBadgeText}>{isVideo ? 'Reel' : 'Photo'}</Text>
              </View>
              <Ionicons name={isVideo ? 'play-circle' : 'image-outline'} size={28} color={theme.colors.textInverse} />
            </LinearGradient>
          )}

          {isVideo ? (
            <LinearGradient colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0)']} style={styles.videoTopScrim} />
          ) : null}

          <View style={styles.gridCornerRow}>
            {isVideo ? (
              <View style={styles.gridReelBadge}>
                <Ionicons name="play" size={10} color={theme.colors.textInverse} />
                <Text style={styles.gridReelBadgeText}>Reel</Text>
              </View>
            ) : (
              <View style={styles.gridTinyBadge}>
                <Ionicons name="image" size={11} color={theme.colors.textInverse} />
              </View>
            )}
            <TouchableOpacity
              activeOpacity={0.92}
              style={[styles.gridSaveBtn, isSaved && styles.gridSaveBtnActive]}
              onPress={() => handleSave(item)}
              disabled={isBusy}
            >
              <Ionicons name={isSaved ? 'bookmark' : 'bookmark-outline'} size={13} color={isSaved ? theme.colors.accent : theme.colors.textInverse} />
            </TouchableOpacity>
          </View>

          {isVideo ? (
            <View style={styles.videoCenterCue}>
              <Ionicons name="play" size={16} color={theme.colors.textInverse} />
            </View>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {header ? <View style={styles.headerWrap}>{header}</View> : null}

      <View style={styles.searchCard}>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search tattoos, artists, styles..."
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {(trendingTags.length ? trendingTags : ['blackwork', 'minimal', 'realism', 'portrait']).map((tag) => (
            <TouchableOpacity key={tag} activeOpacity={0.9} onPress={() => setSearch(tag)} style={styles.chip}>
              <Text style={styles.chipText}>#{tag}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {loading ? (
        <Text style={styles.loading}>Loading discovery...</Text>
      ) : (
        <FlatList
          key={numColumns}
          data={visiblePosts}
          keyExtractor={(item) => item.id}
          renderItem={renderGridItem}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? styles.column : undefined}
          contentContainerStyle={[styles.listContent, { paddingBottom: 120 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          refreshing={refreshing}
          onRefresh={() => void loadPosts(true)}
          onEndReachedThreshold={0.55}
          onEndReached={() => void loadPosts(false)}
          ListFooterComponent={loadingMore ? <Text style={styles.loading}>Loading more...</Text> : null}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="sparkles-outline" size={26} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>No discovery results</Text>
              <Text style={styles.emptyBody}>Try a different tattoo style, hashtag, or artist name.</Text>
            </View>
          }
        />
      )}

      <Modal visible={Boolean(viewerPost)} animationType="fade" presentationStyle="fullScreen" onRequestClose={() => setViewerPost(null)}>
        <View style={[styles.viewerScreen, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Pressable style={styles.viewerBackdrop} onPress={() => setViewerPost(null)} />

          <View style={styles.viewerTopBar}>
            <TouchableOpacity activeOpacity={0.9} onPress={() => setViewerPost(null)} style={styles.viewerRoundBtn}>
              <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
            </TouchableOpacity>
          </View>

          <View style={styles.viewerMediaWrap}>
            {viewerPost?.videoUrl?.trim() ? (
              <View style={styles.viewerVideoShell}>
                <LinearGradient
                  colors={
                    theme.mode === 'light'
                      ? ['#ffffff', '#f3e8ff', '#dbeafe']
                      : ['rgba(124,58,237,0.85)', 'rgba(31,41,55,0.92)', 'rgba(8,8,12,1)']
                  }
                  locations={[0, 0.56, 1]}
                  style={styles.viewerFallback}
                />
                <ViewerVideo uri={viewerVideoUrl} style={styles.viewerMedia} />
              </View>
            ) : viewerImageUrl ? (
              <Image source={{ uri: viewerImageUrl }} style={styles.viewerMedia} resizeMode="contain" />
            ) : (
              <LinearGradient
                colors={
                  theme.mode === 'light'
                    ? ['#ffffff', '#f3e8ff', '#dbeafe']
                    : ['rgba(124,58,237,0.85)', 'rgba(31,41,55,0.92)', 'rgba(8,8,12,1)']
                }
                locations={[0, 0.56, 1]}
                style={styles.viewerMedia}
              >
                <Ionicons name="image-outline" size={42} color={theme.colors.textInverse} />
              </LinearGradient>
            )}
          </View>

          <View style={styles.viewerRail}>
            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.viewerAvatarBtn}
              onPress={() => {
                if (!viewerPost) return;
                setViewerPost(null);
                onViewArtist?.(viewerPost.artistUid);
              }}
            >
              <ProfileAvatar uri={viewerPost?.artistProfileImageUrl ?? undefined} name={viewerPost?.artistName ?? 'Artist'} size={42} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.92}
              style={[styles.viewerActionBtn, viewerLiked && styles.viewerActionBtnActive]}
              onPress={() => {
                if (viewerPost) void handleLike(viewerPost);
              }}
              disabled={!viewerPost || busyPostId === viewerPost.id}
            >
              <Ionicons name={viewerLiked ? 'heart' : 'heart-outline'} size={20} color={viewerLiked ? '#ff5470' : theme.colors.textInverse} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.92}
              style={[styles.viewerActionBtn, viewerSaved && styles.viewerActionBtnActive]}
              onPress={() => {
                if (viewerPost) void handleSave(viewerPost);
              }}
              disabled={!viewerPost || busyPostId === viewerPost.id}
            >
              <Ionicons name={viewerSaved ? 'bookmark' : 'bookmark-outline'} size={20} color={viewerSaved ? theme.colors.accent : theme.colors.textInverse} />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.92}
              style={styles.viewerActionBtn}
              onPress={() => {
                if (viewerPost) void handleShare(viewerPost);
              }}
              disabled={!viewerPost || sharingPostId === viewerPost?.id}
            >
              <Ionicons name="share-social-outline" size={20} color={theme.colors.textInverse} />
            </TouchableOpacity>
          </View>

          <LinearGradient
            colors={theme.mode === 'light' ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.86)', 'rgba(255,255,255,0.97)'] : ['rgba(0,0,0,0)', 'rgba(5,5,8,0.72)', 'rgba(5,5,8,0.96)']}
            locations={[0, 0.24, 1]}
            style={styles.viewerBottomSheet}
          >
            <View style={styles.viewerProfileRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.viewerProfilePressable}
                onPress={() => {
                  if (!viewerPost) return;
                  setViewerPost(null);
                  onViewArtist?.(viewerPost.artistUid);
                }}
              >
                <View style={styles.viewerProfileCopy}>
                  <Text style={styles.viewerArtistName} numberOfLines={1}>
                    {viewerPost?.artistName ?? 'Artist'}
                  </Text>
                  <Text style={styles.viewerArtistLocation} numberOfLines={1}>
                    {viewerLocation}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textMuted} />
              </TouchableOpacity>
            </View>

            {viewerPost?.caption ? (
              <Text style={styles.viewerCaption} numberOfLines={3}>
                {viewerPost.caption}
              </Text>
            ) : null}

            {viewerTags.length ? (
              <View style={styles.viewerTagRow}>
                {viewerTags.slice(0, 4).map((tag) => (
                  <View key={String(tag)} style={styles.viewerTag}>
                    <Text style={styles.viewerTagText}>#{safeTrim(tag)}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <View style={styles.viewerFooterActions}>
              <TouchableOpacity
                activeOpacity={0.9}
                style={styles.viewerArtistButton}
                onPress={() => {
                  if (!viewerPost) return;
                  setViewerPost(null);
                  onViewArtist?.(viewerPost.artistUid);
                }}
              >
                <Text style={styles.viewerArtistButtonText}>View Artist Profile</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>
      </Modal>
    </View>
  );
};

const createStyles = (theme: AppTheme, bottomInset: number) =>
  StyleSheet.create({
    container: { flex: 1 },
    headerWrap: { marginBottom: 0 },
    searchCard: {
      marginHorizontal: 18,
      marginBottom: 12,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(168, 85, 247, 0.16)' : 'rgba(0, 212, 255, 0.14)',
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.94)' : 'rgba(255,255,255,0.035)',
      padding: 10,
      gap: 8,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(168, 85, 247, 0.18)' : 'rgba(0, 212, 255, 0.10)',
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.02)',
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    searchInput: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '700',
    },
    chipRow: {
      flexDirection: 'row',
      gap: 8,
      paddingRight: 8,
    },
    chip: {
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(168, 85, 247, 0.28)' : 'rgba(168, 85, 247, 0.32)',
      backgroundColor: theme.mode === 'light' ? 'rgba(168, 85, 247, 0.08)' : 'rgba(168, 85, 247, 0.12)',
    },
    chipText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '900',
    },
    loading: {
      paddingHorizontal: 16,
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    listContent: {
      paddingHorizontal: 18,
      gap: 9,
    },
    column: {
      gap: 9,
    },
    gridCard: {
      flex: 1,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.025)',
      marginBottom: 3,
    },
    gridMediaShell: {
      width: '100%',
      backgroundColor: '#08080b',
      position: 'relative',
      borderRadius: 18,
      overflow: 'hidden',
    },
    gridMedia: {
      width: '100%',
      height: '100%',
    },
    gridMediaFallback: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 14,
      gap: 10,
    },
    posterBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: 'rgba(11,11,15,0.34)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    posterBadgeText: {
      color: theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '900',
    },
    gridCornerRow: {
      position: 'absolute',
      top: 9,
      left: 9,
      right: 9,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    videoTopScrim: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 54,
    },
    gridTinyBadge: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(11,11,15,0.56)',
    },
    gridReelBadge: {
      minHeight: 24,
      borderRadius: 12,
      paddingHorizontal: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: 'rgba(11,11,15,0.66)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.18)',
    },
    gridReelBadgeText: {
      color: theme.colors.textInverse,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.2,
    },
    gridSaveBtn: {
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(11,11,15,0.56)',
    },
    gridSaveBtnActive: {
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    videoCenterCue: {
      position: 'absolute',
      left: '50%',
      top: '50%',
      width: 34,
      height: 34,
      marginLeft: -17,
      marginTop: -17,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(11,11,15,0.45)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
    },
    emptyState: {
      marginTop: 20,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)',
      padding: 16,
      alignItems: 'center',
      gap: 8,
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
    viewerScreen: {
      flex: 1,
      backgroundColor: theme.mode === 'light' ? '#f7f7fb' : '#040408',
    },
    viewerBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.9)',
    },
    viewerTopBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 3,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-start',
      paddingHorizontal: 16,
      paddingTop: 12,
    },
    viewerRoundBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(11,11,15,0.6)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    viewerMediaWrap: {
      flex: 1,
      zIndex: 1,
      marginTop: 52,
      marginHorizontal: 8,
      marginBottom: 152,
      borderRadius: 18,
      overflow: 'hidden',
      backgroundColor: '#000000',
    },
    viewerVideoShell: {
      flex: 1,
      backgroundColor: '#06060a',
    },
    viewerFallback: {
      ...StyleSheet.absoluteFillObject,
    },
    viewerMedia: {
      width: '100%',
      height: '100%',
    },
    viewerRail: {
      position: 'absolute',
      right: 14,
      top: 0,
      bottom: Math.max(166, bottomInset + 154),
      zIndex: 4,
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 14,
    },
    viewerAvatarBtn: {
      padding: 2,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: 'rgba(11,11,15,0.45)',
    },
    viewerActionBtn: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(11,11,15,0.54)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.16)',
    },
    viewerActionBtnActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    viewerBottomSheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 3,
      paddingHorizontal: 16,
      paddingTop: 24,
      paddingBottom: Math.max(18, bottomInset + 18),
      gap: 7,
    },
    viewerProfileRow: {
      gap: 10,
    },
    viewerProfilePressable: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingBottom: 2,
    },
    viewerProfileCopy: {
      flex: 1,
      gap: 2,
      minWidth: 0,
    },
    viewerArtistName: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
    },
    viewerArtistLocation: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
    },
    viewerCaption: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      lineHeight: 17,
      fontWeight: '700',
    },
    viewerTagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    viewerTag: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.04)',
    },
    viewerTagText: {
      color: theme.colors.accent,
      fontSize: 10,
      fontWeight: '900',
    },
    viewerFooterActions: {
      flexDirection: 'row',
      gap: 10,
      paddingTop: 2,
    },
    viewerArtistButton: {
      flex: 1,
      minHeight: 48,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accent,
    },
    viewerArtistButtonText: {
      color: theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
  });

export default ExplorePanel;
