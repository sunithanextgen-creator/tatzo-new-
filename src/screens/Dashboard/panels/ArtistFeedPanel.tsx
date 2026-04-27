import React, { useMemo } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import { brand } from '../../../theme/brand';

type ArtistFeedPanelProps = {
  header?: React.ReactNode;
};

type PostRow = {
  id: string;
  caption: string;
  views: string;
  timeAgo: string;
};

const POSTS: PostRow[] = [
  { id: 'a-post-1', caption: 'Studio drop: fresh neo-traditional flash set.', views: '2.1K', timeAgo: '1h' },
  { id: 'a-post-2', caption: 'Linework practice: crisp geometry and flow.', views: '1.4K', timeAgo: '6h' },
  { id: 'a-post-3', caption: 'Aftercare reminder: keep it clean, keep it calm.', views: '3.3K', timeAgo: '1d' },
];

const ArtistFeedPanel = ({ header }: ArtistFeedPanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  return (
    <FlatList
      data={POSTS}
      keyExtractor={(item) => item.id}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 110 }}
      ListHeaderComponent={
        <View style={styles.headerWrap}>
          {header ? <View style={styles.externalHeader}>{header}</View> : null}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Your Socio Feed</Text>
            <Text style={styles.sectionBadge}>Artist</Text>
          </View>
          <LinearGradient colors={theme.gradients.accent} style={styles.heroCard}>
            <Text style={styles.heroTitle}>Post to Socio</Text>
            <Text style={styles.heroBody}>Next we will add photo/video upload and push this into the user feed.</Text>
          </LinearGradient>
        </View>
      }
      renderItem={({ item }) => (
        <View style={styles.card}>
          <LinearGradient colors={[theme.colors.backgroundAlt, 'rgba(122, 92, 255, 0.18)', 'rgba(0, 229, 255, 0.12)']} style={styles.media}>
            <Text style={styles.mediaText}>TATZO POST</Text>
          </LinearGradient>
          <View style={styles.cardBody}>
            <Text style={styles.caption}>{item.caption}</Text>
            <Text style={styles.meta}>Views: {item.views} | {item.timeAgo}</Text>
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
    heroCard: {
      borderRadius: 24,
      padding: 16,
      gap: 6,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.12)',
    },
    heroTitle: {
      color: brand.deepInkBlack,
      fontSize: 18,
      fontWeight: '900',
    },
    heroBody: {
      color: 'rgba(11, 11, 15, 0.78)',
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
      maxWidth: 420,
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
    media: {
      height: 180,
      justifyContent: 'flex-end',
      padding: 14,
    },
    mediaText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 2,
    },
    cardBody: {
      padding: 14,
      gap: 8,
    },
    caption: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      lineHeight: 19,
      fontWeight: '800',
    },
    meta: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
  });

export default ArtistFeedPanel;
