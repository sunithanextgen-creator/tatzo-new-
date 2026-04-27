import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '../../../config/firebaseConfig';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';

type ArtistCalendarPanelProps = {
  header?: React.ReactNode;
};

type BookingRow = {
  id: string;
  dateISO?: string;
  userName?: string | null;
  userEmail?: string | null;
  location?: string;
  status?: string;
};

const ArtistCalendarPanel = ({ header }: ArtistCalendarPanelProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [items, setItems] = useState<BookingRow[]>([]);
  const artistName = auth.currentUser?.displayName ?? '';

  useEffect(() => {
    if (!artistName) return;

    const q = query(
      collection(db, 'bookings'),
      where('artistName', '==', artistName),
      where('status', 'in', ['confirmed', 'completed']),
      limit(80),
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        setItems(
          snap.docs
            .map((d) => {
              const data = d.data() as any;
              return {
                id: d.id,
                dateISO: data.dateISO,
                userName: data.userName ?? null,
                userEmail: data.userEmail ?? null,
                location: data.location,
                status: data.status,
              } as BookingRow;
            })
            .sort((a, b) => String(a.dateISO ?? '').localeCompare(String(b.dateISO ?? ''))),
        );
      },
      () => setItems([]),
    );

    return () => unsub();
  }, [artistName]);

  return (
    <View style={styles.container}>
      {header ? <View>{header}</View> : null}
      <View style={styles.pad}>
        <Text style={styles.title}>Confirmed Slots</Text>
        <Text style={styles.sub}>Tap to expand details (next). For now, this is a clean list view.</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 120, gap: 12 }}
        ListEmptyComponent={<Text style={styles.empty}>No confirmed slots yet.</Text>}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.dateISO ?? 'TBD'}</Text>
            <Text style={styles.cardSub} numberOfLines={1}>
              {item.userName ?? item.userEmail ?? 'Client'} {item.location ? `| ${item.location}` : ''}
            </Text>
            <Text style={styles.cardMeta}>{String(item.status ?? '').toUpperCase()}</Text>
          </View>
        )}
      />
    </View>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    pad: {
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 12,
      gap: 6,
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 20,
      fontFamily: theme.fonts.display,
    },
    sub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontWeight: '700',
      marginTop: -2,
    },
    empty: {
      color: theme.colors.textMuted,
      paddingTop: 22,
      fontSize: 13,
      textAlign: 'center',
    },
    card: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 6,
    },
    cardTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    cardSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    cardMeta: {
      color: theme.colors.accent,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
  });

export default ArtistCalendarPanel;
