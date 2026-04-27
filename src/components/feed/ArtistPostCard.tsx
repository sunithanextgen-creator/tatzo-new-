import React, { useMemo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { createResponsiveShadow } from '../../utils/responsiveShadow';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

export type ArtistPost = {
  id: string;
  artistName: string;
  handle: string;
  specialty: string;
  timeAgo: string;
  likes: string;
  caption: string;
  previewTitle: string;
  previewBody: string;
  tags: readonly string[];
  accent: readonly [string, string, string];
};

type ArtistPostCardProps = {
  post: ArtistPost;
};

const ArtistPostCard = ({ post }: ArtistPostCardProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View style={styles.profileRow}>
          <LinearGradient colors={post.accent} style={styles.avatar}>
            <Text style={styles.avatarText}>{post.artistName.charAt(0)}</Text>
          </LinearGradient>

          <View style={styles.profileCopy}>
            <Text style={styles.artistName}>{post.artistName}</Text>
            <Text style={styles.artistMeta}>
              {post.handle} | {post.specialty}
            </Text>
          </View>
        </View>

        <Text style={styles.moreButton}>...</Text>
      </View>

      <LinearGradient colors={post.accent} style={styles.mediaPlaceholder}>
        <View style={styles.mediaOverlay}>
          <View style={styles.previewPill}>
            <Text style={styles.previewPillText}>No image yet</Text>
          </View>
          <Text style={styles.previewTitle}>{post.previewTitle}</Text>
          <Text style={styles.previewBody}>{post.previewBody}</Text>
        </View>
      </LinearGradient>

      <View style={styles.actionRow}>
        <TouchableOpacity activeOpacity={0.85} style={styles.actionButton}>
          <Text style={styles.actionText}>Share</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.85} style={styles.actionButton}>
          <Text style={styles.actionText}>Like</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.85} style={styles.actionButton}>
          <Text style={styles.actionText}>Follow</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.85} style={[styles.actionButton, styles.reportButton]}>
          <Text style={[styles.actionText, styles.reportText]}>Report abuse</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.metaRow}>
        <Text style={styles.likes}>{post.likes} likes</Text>
        <Text style={styles.timeAgo}>{post.timeAgo}</Text>
      </View>

      <Text style={styles.caption}>
        <Text style={styles.captionHandle}>{post.handle}</Text> {post.caption}
      </Text>

      <View style={styles.tagsRow}>
        {post.tags.map((tag) => (
          <View key={tag} style={styles.tagPill}>
            <Text style={styles.tagText}>{tag}</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 14,
      gap: 12,
      ...createResponsiveShadow({
        web: theme.mode === 'light' ? '0px 16px 30px rgba(5, 10, 20, 0.14)' : '0px 16px 30px rgba(5, 10, 20, 0.24)',
        native: {
          shadowColor: theme.mode === 'light' ? 'rgba(5, 10, 20, 0.22)' : theme.colors.shadow,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: theme.mode === 'light' ? 0.14 : 0.24,
          shadowRadius: 30,
          elevation: 9,
        },
      }),
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 16,
    },
    profileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      flex: 1,
    },
    avatar: {
      width: 46,
      height: 46,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      color: theme.colors.textInverse,
      fontSize: 18,
      fontWeight: '800',
    },
    profileCopy: {
      flex: 1,
      gap: 3,
    },
    artistName: {
      color: theme.colors.text,
      fontSize: 16,
      fontWeight: '800',
    },
    artistMeta: {
      color: theme.colors.textMuted,
      fontSize: 12,
    },
    moreButton: {
      color: theme.colors.textMuted,
      fontSize: 24,
      lineHeight: 24,
      width: 26,
      textAlign: 'center',
    },
    mediaPlaceholder: {
      minHeight: 260,
      borderRadius: 24,
      overflow: 'hidden',
      justifyContent: 'flex-end',
    },
    mediaOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      padding: 18,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(5, 10, 20, 0.22)',
    },
    previewPill: {
      alignSelf: 'flex-start',
      backgroundColor: theme.mode === 'light' ? 'rgba(255, 255, 255, 0.72)' : 'rgba(255, 255, 255, 0.14)',
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.08)' : 'rgba(255, 255, 255, 0.08)',
    },
    previewPillText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    previewTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 24,
      fontFamily: theme.fonts.display,
      lineHeight: 30,
    },
    previewBody: {
      color: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.66)' : 'rgba(246, 248, 255, 0.88)',
      fontSize: 13,
      lineHeight: 20,
      marginTop: 8,
      maxWidth: 240,
    },
    actionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    actionButton: {
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(255, 255, 255, 0.05)',
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.1)' : 'rgba(199, 204, 214, 0.12)',
    },
    reportButton: {
      backgroundColor: 'rgba(142, 75, 69, 0.14)',
      borderColor: 'rgba(142, 75, 69, 0.38)',
    },
    actionText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '700',
    },
    reportText: {
      color: theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf',
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    likes: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    timeAgo: {
      color: theme.colors.textMuted,
      fontSize: 12,
    },
    caption: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      lineHeight: 21,
    },
    captionHandle: {
      fontWeight: '800',
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
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

export default ArtistPostCard;
