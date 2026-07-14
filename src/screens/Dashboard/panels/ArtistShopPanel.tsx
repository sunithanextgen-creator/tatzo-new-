import React, { useMemo } from 'react';
import { FlatList, ImageBackground, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';

type ArtistShopPanelProps = {
  header?: React.ReactNode;
  onOpenPost?: () => void;
};

const SHOP_COMING_SOON_BG = require('../../../../assets/shop-coming-soon-bg.png');

const ArtistShopPanel = ({ header }: ArtistShopPanelProps) => {
  const { theme } = useAppTheme();
  const { height } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme, height), [theme, height]);

  return (
    <FlatList
      data={[{ key: 'shop' }]}
      keyExtractor={(item) => item.key}
      contentContainerStyle={styles.wrap}
      ListHeaderComponent={header ? <View style={styles.externalHeader}>{header}</View> : null}
      renderItem={() => (
        <View style={styles.stack}>
          <Text style={styles.title}>Shop</Text>

          <ImageBackground source={SHOP_COMING_SOON_BG} style={styles.poster} imageStyle={styles.posterImage} resizeMode="contain">
            <View style={styles.posterOverlay} />
            <View style={styles.posterBottomScrim} />
            <View style={styles.posterContent}>
              <Text style={styles.posterKicker}>Tatzo Shop</Text>
              <Text style={styles.posterTitle}>Coming Soon</Text>
              <Text style={styles.posterSub}>Get ready for the massive market place.</Text>
              <View style={styles.posterBadge}>
                <Text style={styles.posterBadgeText}>Creative marketplace loading</Text>
              </View>
            </View>
          </ImageBackground>

          <Text style={styles.sub}>Creative supplies and artist essentials are being prepared.</Text>
        </View>
      )}
      showsVerticalScrollIndicator={false}
    />
  );
};

const createStyles = (theme: AppTheme, screenHeight: number) =>
  StyleSheet.create({
    wrap: {
      paddingHorizontal: 18,
      paddingTop: 10,
      paddingBottom: 102,
      flexGrow: 1,
    },
    externalHeader: {
      marginBottom: 10,
    },
    stack: {
      gap: 10,
      minHeight: Math.max(400, screenHeight - 240),
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.title,
      fontFamily: theme.fonts.display,
    },
    sub: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.body,
      lineHeight: 18,
      fontWeight: '700',
      textAlign: 'center',
    },
    poster: {
      width: '100%',
      aspectRatio: 1.5,
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      overflow: 'hidden',
      justifyContent: 'flex-end',
      alignItems: 'stretch',
      backgroundColor: '#050505',
    },
    posterImage: {
      borderRadius: 28,
      opacity: 1,
      resizeMode: 'cover',
    },
    posterOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(5, 5, 5, 0.04)',
    },
    posterBottomScrim: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      height: 150,
      backgroundColor: 'rgba(5, 5, 5, 0.42)',
    },
    posterContent: {
      paddingHorizontal: 16,
      paddingVertical: 16,
      gap: 5,
    },
    posterKicker: {
      color: theme.colors.accentStrong,
      fontSize: theme.typography.caption,
      fontWeight: '900',
      letterSpacing: 1.1,
      textTransform: 'uppercase',
    },
    posterTitle: {
      color: '#ffffff',
      fontSize: theme.typography.title + 4,
      lineHeight: theme.typography.title + 8,
      fontWeight: '900',
    },
    posterSub: {
      color: 'rgba(255,255,255,0.96)',
      fontSize: theme.typography.body - 1,
      lineHeight: 17 * theme.fontScale,
      fontWeight: '800',
      maxWidth: 240,
    },
    posterBadge: {
      marginTop: 4,
      alignSelf: 'flex-start',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.2)',
      backgroundColor: 'rgba(14, 9, 24, 0.62)',
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    posterBadgeText: {
      color: '#ffffff',
      fontSize: theme.typography.caption,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    signOutBtn: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.45)' : 'rgba(255, 211, 207, 0.4)',
      backgroundColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.12)' : 'rgba(142, 75, 69, 0.22)',
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    signOutText: {
      color: theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf',
      fontSize: 13,
      fontWeight: '900',
    },
  });

export default ArtistShopPanel;
