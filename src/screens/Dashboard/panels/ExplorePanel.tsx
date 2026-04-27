import React, { useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import { dummyArtists } from '../../../data/dummyArtists';

type ExplorePanelProps = {
  header?: React.ReactNode;
};

const tiles: Array<{ id: string; artistName: string; handle: string; tags: readonly string[] }> = dummyArtists.map((artist) => ({
  id: artist.id,
  artistName: artist.name,
  handle: artist.handle,
  tags: artist.tags,
}));

const ExplorePanel = ({ header }: ExplorePanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();

  const [query, setQuery] = useState('');
  const tileGradient = useMemo(
    () => [theme.colors.backgroundAlt, 'rgba(122, 92, 255, 0.22)', theme.colors.backgroundAlt] as const,
    [theme],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tiles;
    return tiles.filter((tile) => {
      const haystack = `${tile.artistName} ${tile.handle} ${tile.tags.join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  const layout = useMemo(() => {
    const cols = 3;
    const gap = 8;
    const containerPadding = 18;
    const usable = Math.max(280, width) - containerPadding * 2;
    const tile = Math.floor((usable - gap * (cols - 1)) / cols);
    return { cols, gap, tile };
  }, [width]);

  return (
    <FlatList
      data={filtered}
      keyExtractor={(item) => item.id}
      numColumns={layout.cols}
      columnWrapperStyle={{ gap: layout.gap }}
      contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 110, gap: layout.gap }}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.headerWrap}>
          {header ? <View style={styles.externalHeader}>{header}</View> : null}
          <View style={styles.searchRow}>
            <View style={styles.searchInputShell}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search artists, styles"
                placeholderTextColor={theme.colors.textMuted}
                autoCorrect={false}
                autoCapitalize="none"
                nativeID="exploreSearch"
                style={styles.searchInput}
              />
              {query.length ? (
                <TouchableOpacity activeOpacity={0.85} onPress={() => setQuery('')} style={styles.clearButton}>
                  <Text style={styles.clearText}>X</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <Text style={styles.resultText}>{filtered.length}</Text>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <TouchableOpacity
          activeOpacity={0.9}
          onPress={() => Alert.alert('Tatzo', `Open ${item.artistName} profile next.`)}
          style={[styles.tile, { width: layout.tile, height: layout.tile }]}
        >
          <LinearGradient colors={tileGradient} style={styles.tileGradient} />
          <View style={styles.tileOverlay}>
            <Text numberOfLines={1} style={styles.tileHandle}>
              {item.handle}
            </Text>
          </View>
        </TouchableOpacity>
      )}
    />
  );
};

const createStyles = (theme: AppTheme) => {
  return StyleSheet.create({
    headerWrap: {
      gap: 14,
      paddingBottom: 6,
    },
    externalHeader: {
      gap: 18,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    searchInputShell: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 999,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.06)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      gap: 10,
    },
    searchInput: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '600',
      paddingVertical: 0,
    },
    clearButton: {
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.22)' : 'rgba(122, 92, 255, 0.3)',
    },
    clearText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
    },
    resultText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.6,
      minWidth: 26,
      textAlign: 'right',
    },
    tile: {
      borderRadius: 16,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
    },
    tileGradient: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 16,
    },
    tileOverlay: {
      flex: 1,
      justifyContent: 'flex-end',
      padding: 10,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(5, 10, 20, 0.22)',
    },
    tileHandle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 11,
      fontWeight: '800',
    },
  });
};

export default ExplorePanel;
