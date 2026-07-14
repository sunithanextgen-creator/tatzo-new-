import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { collection, getDocs, limit, query, startAfter, where, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../../../config/firebaseConfig';
import ProfileAvatar from '../../../components/ui/ProfileAvatar';
import { getArtistAvailabilityLabel, getArtistBookingMessage, getArtistLocationLabel, getArtistSettingsFromProfile, isArtistDiscoverableForPublic } from '../../../services/artistSettings';
import type { AppTheme } from '../../../theme/theme';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { UserProfile } from '../../../types/app';
import { ANALYTICS_EVENTS, trackAnalyticsEvent } from '../../../services/analytics/analytics';

type FindArtistPanelProps = {
  header?: React.ReactNode;
  onViewArtist?: (artistUid: string) => void;
  viewerProfile?: UserProfile | null;
};

type ArtistRow = UserProfile & { uid: string; artistUid?: string };
type NearbyLocation = { area: string; city: string };

const PAGE_SIZE = 40;
const STYLE_FILTERS = ['All', 'Black & Grey', 'Minimal', 'Realism', 'Portrait', 'Traditional', 'Color', 'Mandala'];
const LOCATION_FILTERS = ['Nearby', 'Chennai', 'Guindy', 'Tambaram', 'T Nagar', 'Anna Nagar', 'Velachery', 'Adyar', 'OMR'];
const CHENNAI_AREA_TOKENS = [
  'chennai', 'guindy', 'tambaram', 't nagar', 'anna nagar', 'velachery', 'adyar', 'omr',
  'porur', 'chromepet', 'pallavaram', 'ambattur', 'avadi', 'sholinganallur', 'medavakkam',
  'perungalathur', 'nungambakkam', 'mylapore', 'kodambakkam', 'egmore', 'besant nagar',
];

const safeTrim = (value: unknown) => String(value ?? '').trim();
const normalizeToken = (value: unknown) => safeTrim(value).toLowerCase();

const getArtistSearchText = (row: ArtistRow) => {
  const settings = getArtistSettingsFromProfile(row);
  return [
    row.artistName,
    row.displayName,
    row.studioName,
    (row as any).shopName,
    (row as any).businessName,
    row.bio,
    row.locationCity,
    row.locationArea,
    row.location,
    (row as any).shopAddressLine,
    (row as any).address,
    (row.styles ?? []).join(' '),
    getArtistLocationLabel(row, settings),
    getArtistBookingMessage(settings),
  ].filter(Boolean).join(' ').toLowerCase();
};

const getLocationTokens = (row: ArtistRow) => [
  row.locationArea,
  row.locationCity,
  row.location,
  row.studioName,
  (row as any).shopName,
  (row as any).businessName,
  (row as any).shopAddressLine,
  (row as any).address,
].map(normalizeToken).filter(Boolean);

const hasLocationMatch = (row: ArtistRow, locationNeedle: string) => {
  if (!locationNeedle) return true;
  return getLocationTokens(row).some((token) => token.includes(locationNeedle) || locationNeedle.includes(token));
};

const isChennaiArtist = (row: ArtistRow) => {
  const locationText = getLocationTokens(row).join(' ');
  return CHENNAI_AREA_TOKENS.some((token) => locationText.includes(token));
};

const matchesSearch = (row: ArtistRow, needle: string) => !needle || getArtistSearchText(row).includes(needle);

const isFindArtistVisible = (row: ArtistRow) =>
  row.verificationStatus === 'approved' &&
  row.artistVisible !== false &&
  row.bookingVisible !== false &&
  isArtistDiscoverableForPublic(row);

const FindArtistPanel = ({ header, onViewArtist, viewerProfile }: FindArtistPanelProps) => {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [search, setSearch] = useState('');
  const [styleFilter, setStyleFilter] = useState('All');
  const [locationFilter, setLocationFilter] = useState('Nearby');
  const [artists, setArtists] = useState<ArtistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [deviceLocation, setDeviceLocation] = useState<NearbyLocation | null>(null);
  const [locationStatus, setLocationStatus] = useState<'loading' | 'gps' | 'fallback'>('loading');
  const deviceLocationIsChennai = useMemo(() => {
    const area = normalizeToken(deviceLocation?.area);
    const city = normalizeToken(deviceLocation?.city);
    return CHENNAI_AREA_TOKENS.some((token) => area.includes(token) || city.includes(token));
  }, [deviceLocation]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const permission = await Location.requestForegroundPermissionsAsync();
        if (permission.status !== Location.PermissionStatus.GRANTED) {
          if (active) setLocationStatus('fallback');
          return;
        }

        const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        const addresses = await Location.reverseGeocodeAsync(position.coords);
        const address = addresses[0] as (Location.LocationGeocodedAddress & { subregion?: string | null }) | undefined;
        const area = safeTrim(address?.district || address?.subregion || address?.name);
        const city = safeTrim(address?.city || address?.subregion || address?.region);
        if (!active) return;
        setDeviceLocation({ area, city });
        setLocationStatus(area || city ? 'gps' : 'fallback');
      } catch {
        if (active) setLocationStatus('fallback');
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadArtistPage = async (mode: 'replace' | 'append', pageCursor: QueryDocumentSnapshot<DocumentData> | null = null) => {
    const baseConstraints = [
      where('verificationStatus', '==', 'approved'),
      where('isVisible', '==', true),
    ] as const;
    const q = pageCursor
      ? query(collection(db, 'artists'), ...baseConstraints, startAfter(pageCursor), limit(PAGE_SIZE))
      : query(collection(db, 'artists'), ...baseConstraints, limit(PAGE_SIZE));
    const snap = await getDocs(q);
    const rows = snap.docs.map((row) => ({
      uid: row.id,
      artistUid: row.id,
      ...(row.data() as any),
    }));
    setArtists((prev) => (mode === 'append' ? [...prev, ...rows] : rows));
    setCursor(snap.docs.length > 0 ? snap.docs[snap.docs.length - 1] : pageCursor);
    setHasMore(snap.docs.length === PAGE_SIZE);
  };

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        if (active) {
          setLoading(true);
          await loadArtistPage('replace', null);
        }
      } catch {
        if (active) setArtists([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const loadMoreArtists = async () => {
    if (loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      await loadArtistPage('append', cursor);
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  };

  const visibleArtists = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const gpsArea = normalizeToken(deviceLocation?.area);
    const gpsCity = normalizeToken(deviceLocation?.city);
    const profileArea = normalizeToken(viewerProfile?.locationArea);
    const profileCity = normalizeToken(viewerProfile?.locationCity || viewerProfile?.location);
    const profileIsChennai = CHENNAI_AREA_TOKENS.some((token) => profileArea.includes(token) || profileCity.includes(token));
    const viewerArea = deviceLocationIsChennai ? gpsArea : profileIsChennai ? profileArea : '';
    const viewerCity = deviceLocationIsChennai ? gpsCity : profileIsChennai ? profileCity : 'chennai';
    const activeLocation = locationFilter === 'Nearby' ? viewerArea || viewerCity || 'chennai' : normalizeToken(locationFilter);

    const getSearchRank = (row: ArtistRow) => {
      if (!needle) return 0;
      const area = normalizeToken(row.locationArea);
      const city = normalizeToken(row.locationCity || row.location);
      if (area && (area.includes(needle) || needle.includes(area))) return 0;
      if (city && (city.includes(needle) || needle.includes(city))) return 1;
      return 2;
    };

    const getLocationRank = (row: ArtistRow) => {
      const area = normalizeToken(row.locationArea);
      const city = normalizeToken(row.locationCity || row.location);
      const text = getArtistSearchText(row);

      if (locationFilter === 'Nearby') {
        if (viewerArea && area && (area.includes(viewerArea) || viewerArea.includes(area))) return 0;
        if (viewerCity && city && (city.includes(viewerCity) || viewerCity.includes(city))) return 1;
        if (city === 'chennai' || text.includes('chennai')) return 2;
        return 20;
      }

      if (area && (area.includes(activeLocation) || activeLocation.includes(area))) return 0;
      if (city && (city.includes(activeLocation) || activeLocation.includes(city))) return 1;
      if (text.includes(activeLocation)) return 2;
      return 20;
    };

    return artists.filter((row) => {
      if (!isChennaiArtist(row)) return false;
      if (!isFindArtistVisible(row)) return false;
      const rowStyles = (row.styles ?? []).map((item) => safeTrim(item).toLowerCase());
      if (styleFilter !== 'All' && !rowStyles.some((style) => style.includes(styleFilter.toLowerCase()))) return false;
      if (locationFilter !== 'Nearby' && !hasLocationMatch(row, activeLocation)) return false;
      return matchesSearch(row, needle);
    }).sort((left, right) => {
      const searchRank = getSearchRank(left) - getSearchRank(right);
      if (searchRank !== 0) return searchRank;
      const locationRank = getLocationRank(left) - getLocationRank(right);
      if (locationRank !== 0) return locationRank;
      const leftPrice = Number(left.startingPrice ?? Number.MAX_SAFE_INTEGER);
      const rightPrice = Number(right.startingPrice ?? Number.MAX_SAFE_INTEGER);
      return leftPrice - rightPrice;
    });
  }, [artists, search, styleFilter, locationFilter, viewerProfile, deviceLocation, deviceLocationIsChennai]);

  useEffect(() => {
    const searchTerm = search.trim();
    if (searchTerm.length < 2) return;
    const timer = setTimeout(() => {
      void trackAnalyticsEvent(ANALYTICS_EVENTS.SEARCH_ARTIST, {
        search_length: searchTerm.length,
        result_count: visibleArtists.length,
        style_filter: styleFilter,
        location_filter: locationFilter,
      });
    }, 650);
    return () => clearTimeout(timer);
  }, [locationFilter, search, styleFilter, visibleArtists.length]);

  const renderItem = ({ item }: { item: ArtistRow }) => {
    const settings = getArtistSettingsFromProfile(item);
    const location = getArtistLocationLabel(item, settings);
    const availability = getArtistAvailabilityLabel(settings);
    const startingPrice = Number(item.startingPrice ?? 0);
    const experience = safeTrim((item as any).experienceYears ?? item.experience ?? (item as any).artistSinceYear);
    const stylesToShow = (item.styles ?? []).slice(0, 3);

    return (
      <View style={styles.card}>
        <TouchableOpacity activeOpacity={0.9} style={styles.cardTop} onPress={() => onViewArtist?.(item.uid)}>
          <ProfileAvatar uri={item.profileImageUrl} name={item.artistName || item.displayName || 'Artist'} size={66} />
          <View style={styles.cardCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{item.artistName || item.displayName || 'Artist'}</Text>
              <Ionicons name="checkmark-circle" size={15} color={theme.colors.accentStrong} />
            </View>
            <Text style={styles.subText} numberOfLines={1}>{item.studioName || 'Tatzo Studio'}</Text>
            <Text style={styles.subText} numberOfLines={1}>{location}</Text>
            <Text style={styles.subText} numberOfLines={1}>{experience ? `${experience} Years Experience` : 'Experience not added'}</Text>
          </View>
        </TouchableOpacity>

        <View style={styles.tagRow}>
          {stylesToShow.map((tag) => (
            <View key={tag} style={styles.styleTag}>
              <Text style={styles.styleTagText}>{tag}</Text>
            </View>
          ))}
          <View style={styles.availabilityTag}>
            <Ionicons name={availability === 'Available' ? 'checkmark-circle' : 'time-outline'} size={12} color={theme.colors.accent} />
            <Text style={styles.metaText}>{availability}</Text>
          </View>
          <View style={styles.priceTag}>
            <Text style={styles.metaText}>Starting Rs. {startingPrice > 0 ? startingPrice : '—'}</Text>
          </View>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity activeOpacity={0.9} style={styles.viewBtn} onPress={() => onViewArtist?.(item.uid)}>
            <Text style={styles.viewBtnText}>View Artist</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const listHeader = (
    <View>
      {header ? <View style={styles.headerWrap}>{header}</View> : null}

      <View style={styles.searchCard}>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={theme.colors.textMuted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search artist, studio, style, city, area"
            placeholderTextColor={theme.colors.textMuted}
            style={styles.searchInput}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {STYLE_FILTERS.map((item) => (
            <TouchableOpacity key={item} activeOpacity={0.9} onPress={() => setStyleFilter(item)} style={[styles.filterChip, styleFilter === item && styles.filterChipActive]}>
              <Text style={[styles.filterText, styleFilter === item && styles.filterTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
          {LOCATION_FILTERS.map((item) => (
            <TouchableOpacity key={item} activeOpacity={0.9} onPress={() => setLocationFilter(item)} style={[styles.locationChip, locationFilter === item && styles.locationChipActive]}>
              <Ionicons name={item === 'Nearby' ? 'navigate-outline' : 'location-outline'} size={12} color={locationFilter === item ? theme.colors.accent : theme.colors.textMuted} />
              <Text style={[styles.filterText, locationFilter === item && styles.filterTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={styles.locationHint}>
          {locationStatus === 'loading'
            ? 'Finding your location...'
            : locationStatus === 'gps' && deviceLocationIsChennai
              ? `Nearby uses ${[deviceLocation?.area, deviceLocation?.city].filter(Boolean).join(', ')}`
              : 'Tatzo currently shows artists in Chennai and nearby areas.'}
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={loading ? [] : visibleArtists}
        keyExtractor={(item) => item.uid}
        renderItem={renderItem}
        contentContainerStyle={[styles.listContent, { paddingBottom: 120 + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={listHeader}
        onEndReachedThreshold={0.4}
        onEndReached={loadMoreArtists}
        ListEmptyComponent={
          loading ? (
            <Text style={styles.loading}>Loading artists...</Text>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={24} color={theme.colors.textMuted} />
              <Text style={styles.emptyTitle}>No artists found near this location yet</Text>
              <Text style={styles.emptyBody}>Try searching another area or style.</Text>
            </View>
          )
        }
        ListFooterComponent={loadingMore ? <Text style={styles.loading}>Loading more artists...</Text> : null}
      />
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: { flex: 1 },
    headerWrap: { marginBottom: 8 },
    searchCard: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 22,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)',
      padding: 12,
      gap: 10,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(168,85,247,0.22)' : 'rgba(0,212,255,0.18)',
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(0,0,0,0.22)',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    searchInput: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    locationHint: {
      color: theme.colors.textMuted,
      fontSize: Math.max(10, theme.typography.caption - 1),
      paddingHorizontal: 2,
    },
    filterRow: {
      gap: 9,
      paddingRight: 4,
    },
    filterChip: {
      paddingHorizontal: 13,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)',
    },
    filterChipActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    locationChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(168,85,247,0.18)' : 'rgba(0,212,255,0.15)',
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.025)',
    },
    locationChipActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    filterText: {
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '900',
    },
    filterTextActive: {
      color: theme.mode === 'light' ? theme.colors.accent : theme.colors.textInverse,
    },
    loading: {
      paddingHorizontal: 16,
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    listContent: {
      paddingHorizontal: 16,
      gap: 12,
    },
    card: {
      borderRadius: 22,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.035)',
      padding: 13,
      gap: 12,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
    },
    cardCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    name: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
      flexShrink: 1,
    },
    subText: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
    },
    tagRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    styleTag: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)',
    },
    availabilityTag: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    priceTag: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)',
    },
    styleTagText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '900',
    },
    metaText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 10,
      fontWeight: '900',
    },
    actionRow: {
      flexDirection: 'row',
      gap: 9,
    },
    viewBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.mode === 'light' ? '#ffffff' : 'rgba(255,255,255,0.03)',
    },
    viewBtnText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
    },
    emptyState: {
      marginTop: 20,
      borderRadius: 20,
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
  });

export default FindArtistPanel;
