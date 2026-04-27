import React, { useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import { dummyArtists, DummyArtist } from '../../../data/dummyArtists';
import { brand } from '../../../theme/brand';
import GradientButton from '../../../components/ui/GradientButton';

type FindArtistPanelProps = {
  header?: React.ReactNode;
  onBook: (artist: DummyArtist) => void;
};

const formatMoney = (value?: number) => {
  if (!value) return '0';
  return new Intl.NumberFormat('en-IN').format(value);
};

const FindArtistPanel = ({ header, onBook }: FindArtistPanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { width } = useWindowDimensions();

  const [query, setQuery] = useState('');
  const location = 'Chennai';

  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = dummyArtists.filter((a) => a.location === location);
    if (!q) return base;
    return base.filter((artist) => {
      const haystack = `${artist.name} ${artist.handle} ${artist.specialty} ${artist.tags.join(' ')}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  const cardWidth = useMemo(() => {
    const padding = 18;
    const gap = 12;
    const usable = Math.max(320, width) - padding * 2;
    return Math.floor((usable - gap) / 2);
  }, [width]);

  const renderCard = ({ item }: { item: DummyArtist }) => {
    const verified = Boolean(item.verified);
    const rating = item.rating ?? 0;
    const starting = item.startingFrom ?? 0;
    const category = (item.category ?? 'TATZO').toUpperCase();

    return (
      <View style={[styles.artistCard, { width: cardWidth }]}>
        <LinearGradient
          colors={[theme.colors.backgroundAlt, 'rgba(0, 229, 255, 0.16)', 'rgba(122, 92, 255, 0.22)']}
          style={styles.media}
        >
          {verified ? (
            <View style={styles.verifiedPill}>
              <Ionicons name="checkmark-circle" size={14} color={brand.electricNeonBlue} />
              <Text style={styles.verifiedText}>VERIFIED</Text>
            </View>
          ) : null}
          <Text style={styles.category}>{category}</Text>
        </LinearGradient>

        <View style={styles.cardBody}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={styles.name}>
              {item.name}
            </Text>
            <View style={styles.ratingRow}>
              <Ionicons name="star" size={12} color={brand.electricNeonBlue} />
              <Text style={styles.ratingText}>{rating.toFixed(1)}</Text>
            </View>
          </View>

          <Text style={styles.priceText}>Starting from Rs. {formatMoney(starting)}+</Text>

          <GradientButton title="Book Now" onPress={() => onBook(item)} size="md" />
        </View>
      </View>
    );
  };

  return (
    <FlatList
      data={data}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={{ gap: 12 }}
      contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 16, paddingBottom: 110, gap: 12 }}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View style={styles.headerWrap}>
          {header ? <View style={styles.externalHeader}>{header}</View> : null}

          <View style={styles.searchShell}>
            <Ionicons name="search-outline" size={16} color={theme.colors.textMuted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search artists or styles..."
              placeholderTextColor={theme.colors.textMuted}
              autoCorrect={false}
              autoCapitalize="none"
              nativeID="findArtistSearch"
              style={styles.searchInput}
            />
            {query.length ? (
              <TouchableOpacity activeOpacity={0.85} onPress={() => setQuery('')} style={styles.clearBtn}>
                <Text style={styles.clearText}>X</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.regionRow}>
            <View style={styles.regionLeft}>
              <Ionicons name="location-outline" size={16} color={brand.electricNeonBlue} />
              <Text style={styles.regionTitle}>SELECT REGION</Text>
            </View>
            <Text style={styles.regionValue}>{location}</Text>
          </View>

          <View style={styles.topRow}>
            <Text style={styles.topTitle}>Top Artists</Text>
            <Text style={styles.countPill}>{data.length} Found</Text>
          </View>
        </View>
      }
      renderItem={renderCard}
    />
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    headerWrap: {
      gap: 14,
      paddingBottom: 4,
    },
    externalHeader: {
      gap: 18,
    },
    searchShell: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 14,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.06)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    searchInput: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '600',
      paddingVertical: 0,
    },
    clearBtn: {
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
    regionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 2,
    },
    regionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    regionTitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.6,
    },
    regionValue: {
      color: brand.electricNeonBlue,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 6,
    },
    topTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 20,
      fontFamily: theme.fonts.display,
    },
    countPill: {
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
    artistCard: {
      borderRadius: 22,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    media: {
      height: 170,
      justifyContent: 'flex-end',
      padding: 12,
    },
    verifiedPill: {
      position: 'absolute',
      top: 10,
      right: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: 'rgba(11, 11, 15, 0.6)',
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: 'rgba(0, 229, 255, 0.3)',
    },
    verifiedText: {
      color: theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1,
    },
    category: {
      color: brand.electricNeonBlue,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
    },
    cardBody: {
      padding: 12,
      gap: 10,
    },
    nameRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 10,
    },
    name: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '800',
    },
    ratingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    ratingText: {
      color: theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
    },
    priceText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    // Book button is now GradientButton for consistent neon+purple CTA.
  });

export default FindArtistPanel;
