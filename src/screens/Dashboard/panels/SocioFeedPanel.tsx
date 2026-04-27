import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../../../config/firebaseConfig';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import { dummyArtists } from '../../../data/dummyArtists';
import { brand } from '../../../theme/brand';
import { buildShareLink, sharePost, toggleFollow, toggleLike } from '../../../services/social';

type SocioFeedPanelProps = {
  header?: React.ReactNode;
};

type SocioPost = {
  id: string;
  artistId: string;
  caption: string;
  timeAgo: string;
  likes: string;
  tags: readonly string[];
};

const POSTS: SocioPost[] = [
  {
    id: 'post-1',
    artistId: 'artist-1',
    caption: 'Geometric sleeve concept. Clean lines, crisp spacing, premium contrast.',
    timeAgo: '2h',
    likes: '21.2K',
    tags: ['geometry', 'sleeve', 'fine line'],
  },
  {
    id: 'post-2',
    artistId: 'artist-2',
    caption: 'Neo traditional flash set ready for booking. Bold color + strong silhouettes.',
    timeAgo: '5h',
    likes: '9.4K',
    tags: ['neo traditional', 'bold', 'flash'],
  },
  {
    id: 'post-3',
    artistId: 'artist-3',
    caption: 'Blackwork with premium finish. Deep blacks and balanced negative space.',
    timeAgo: '1d',
    likes: '17.8K',
    tags: ['blackwork', 'premium', 'contrast'],
  },
  {
    id: 'post-4',
    artistId: 'artist-4',
    caption: 'Micro realism portrait study. Soft gradients, sharp edges, natural highlights.',
    timeAgo: '1d',
    likes: '6.1K',
    tags: ['micro', 'portrait', 'realism'],
  },
  {
    id: 'post-5',
    artistId: 'artist-5',
    caption: 'Mandala dotwork layout. Symmetry first, texture second, flow always.',
    timeAgo: '2d',
    likes: '8.8K',
    tags: ['dotwork', 'mandala', 'pattern'],
  },
];

const SocioFeedPanel = ({ header }: SocioFeedPanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const accent = useMemo(() => [brand.electricNeonBlue, brand.cyberPurple, brand.electricNeonBlue] as const, []);
  const actionIcon = theme.colors.accent;
  const [likedMap, setLikedMap] = useState<Record<string, boolean>>({});
  const [followingMap, setFollowingMap] = useState<Record<string, boolean>>({});

  const posts = useMemo(() => {
    const byId = new Map(dummyArtists.map((artist) => [artist.id, artist]));
    return POSTS.map((post) => ({ post, artist: byId.get(post.artistId)! })).filter((row) => Boolean(row.artist));
  }, []);

  useEffect(() => {
    const actor = auth.currentUser;
    if (!actor) return;
    let isActive = true;

    (async () => {
      try {
        // Lightweight best-effort state hydration (no blocking UI).
        // If it fails, we still allow actions to write.
        const nextLiked: Record<string, boolean> = {};
        const nextFollowing: Record<string, boolean> = {};
        for (const row of posts) {
          // We don't hydrate from Firestore yet to keep reads low.
          nextLiked[row.post.id] = false;
          nextFollowing[row.artist.id] = false;
        }
        if (isActive) {
          setLikedMap(nextLiked);
          setFollowingMap(nextFollowing);
        }
      } catch {
        // ignore
      }
    })();

    return () => {
      isActive = false;
    };
  }, [posts]);

  const ensureSignedIn = () => {
    if (!auth.currentUser) {
      Alert.alert('Tatzo', 'Please sign in to use this action.');
      return false;
    }
    return true;
  };

  return (
    <FlatList
      data={posts}
      keyExtractor={(item) => item.post.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 110 }}
      ListHeaderComponent={
        <View style={styles.headerWrap}>
          {header ? <View style={styles.externalHeader}>{header}</View> : null}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Feed</Text>
            <Text style={styles.sectionBadge}>Socio</Text>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={styles.profileRow}>
              <LinearGradient colors={accent} style={styles.avatar}>
                <Text style={styles.avatarText}>{item.artist.name.charAt(0)}</Text>
              </LinearGradient>
              <View style={styles.profileCopy}>
                <Text style={styles.artistName}>{item.artist.name}</Text>
                <Text style={styles.artistMeta}>
                  {item.artist.handle} | {item.artist.location} | {item.post.timeAgo}
                </Text>
              </View>
            </View>
            <TouchableOpacity activeOpacity={0.85} onPress={() => Alert.alert('Tatzo', 'Post options soon.')}>
              <Ionicons name="ellipsis-horizontal" size={18} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <LinearGradient colors={[theme.colors.backgroundAlt, 'rgba(0, 229, 255, 0.16)', 'rgba(122, 92, 255, 0.22)']} style={styles.media}>
            <View style={styles.mediaOverlay}>
              <Text style={styles.mediaLabel}>Design preview placeholder</Text>
            </View>
          </LinearGradient>

          <View style={styles.actionsRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={async () => {
                if (!ensureSignedIn()) return;
                try {
                  const result = await toggleLike({
                    postId: item.post.id,
                    artist: { displayName: item.artist.name, handle: item.artist.handle },
                    postPreview: item.post.caption,
                  });
                  if (!result.artistUid) {
                    Alert.alert('Tatzo', 'This artist is not onboarded yet. Notification will work once they sign up as an artist.');
                  }
                  setLikedMap((prev) => ({ ...prev, [item.post.id]: result.liked }));
                } catch (error: any) {
                  Alert.alert('Tatzo', error?.message ?? 'Could not like right now.');
                }
              }}
              style={styles.actionButton}
            >
              <Ionicons name={likedMap[item.post.id] ? 'heart' : 'heart-outline'} size={18} color={actionIcon} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={async () => {
                if (!ensureSignedIn()) return;
                try {
                  const link = buildShareLink(item.post.id);
                  const result = await sharePost({
                    postId: item.post.id,
                    artist: { displayName: item.artist.name, handle: item.artist.handle },
                    postPreview: item.post.caption,
                    shareMessage: `Tatzo\n${link}\n\n${item.post.caption}`,
                  });
                  if (!result.artistUid) {
                    Alert.alert('Tatzo', 'This artist is not onboarded yet. Notification will work once they sign up as an artist.');
                  }
                } catch (error: any) {
                  Alert.alert('Tatzo', error?.message ?? 'Could not share right now.');
                }
              }}
              style={styles.actionButton}
            >
              <Ionicons name="share-social-outline" size={18} color={actionIcon} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={async () => {
                if (!ensureSignedIn()) return;
                try {
                  const result = await toggleFollow({ artist: { displayName: item.artist.name, handle: item.artist.handle } });
                  if (!result.artistUid) {
                    Alert.alert('Tatzo', 'This artist is not onboarded yet. Follow will work once they sign up as an artist.');
                  } else {
                    setFollowingMap((prev) => ({ ...prev, [item.artist.id]: result.following }));
                  }
                } catch (error: any) {
                  Alert.alert('Tatzo', error?.message ?? 'Could not follow right now.');
                }
              }}
              style={styles.actionButton}
            >
              <Ionicons name={followingMap[item.artist.id] ? 'person' : 'person-add-outline'} size={18} color={actionIcon} />
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => Alert.alert('Tatzo', 'Reported (placeholder).')}
              style={[styles.actionButton, styles.reportButton]}
            >
              <Ionicons name="flag-outline" size={18} color={theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf'} />
            </TouchableOpacity>
          </View>

          <View style={styles.metaRow}>
            <Text style={styles.likes}>{item.post.likes} likes</Text>
          </View>
          <Text style={styles.caption}>{item.post.caption}</Text>
          <View style={styles.tagsRow}>
            {item.post.tags.map((tag) => (
              <View key={tag} style={styles.tagPill}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        </View>
      )}
    />
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    headerWrap: {
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 14,
      gap: 14,
    },
    externalHeader: {
      gap: 18,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 20,
      fontFamily: theme.fonts.display,
    },
    sectionBadge: {
      color: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      fontSize: 11,
      fontWeight: '700',
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.22)' : 'rgba(122, 92, 255, 0.3)',
    },
    card: {
      marginHorizontal: 18,
      marginBottom: 14,
      backgroundColor: theme.colors.surface,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: theme.colors.textInverse,
      fontWeight: '800',
      fontSize: 15,
    },
    profileCopy: {
      flex: 1,
      gap: 2,
    },
    artistName: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '800',
    },
    artistMeta: {
      color: theme.colors.textMuted,
      fontSize: 11,
      lineHeight: 16,
    },
    media: {
      minHeight: 280,
      justifyContent: 'flex-end',
    },
    mediaOverlay: {
      padding: 14,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(5, 10, 20, 0.22)',
    },
    mediaLabel: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.6,
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingTop: 12,
    },
    actionButton: {
      width: 44,
      height: 38,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.08)' : 'rgba(255, 255, 255, 0.06)',
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.18)' : theme.colors.border,
    },
    reportButton: {
      marginLeft: 'auto',
      backgroundColor: 'rgba(142, 75, 69, 0.14)',
      borderColor: 'rgba(142, 75, 69, 0.38)',
    },
    metaRow: {
      paddingHorizontal: 14,
      paddingTop: 10,
    },
    likes: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
    },
    caption: {
      paddingHorizontal: 14,
      paddingTop: 8,
      paddingBottom: 10,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      lineHeight: 19,
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 14,
      paddingBottom: 14,
    },
    tagPill: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.22)' : 'rgba(122, 92, 255, 0.26)',
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.08)' : 'rgba(122, 92, 255, 0.1)',
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    tagText: {
      color: theme.mode === 'light' ? 'rgba(58, 0, 132, 0.85)' : 'rgba(237, 229, 255, 0.95)',
      fontSize: 11,
      fontWeight: '700',
    },
  });

export default SocioFeedPanel;
