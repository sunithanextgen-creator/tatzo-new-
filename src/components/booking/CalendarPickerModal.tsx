import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

type CalendarPickerModalProps = {
  visible: boolean;
  initialDateISO: string; // YYYY-MM-DD
  allowedWeekdays?: number[];
  minDateISO?: string;
  maxDateISO?: string;
  disabledDateISOs?: string[];
  onSelect: (dateISO: string) => void;
  onClose: () => void;
};

const pad2 = (n: number) => `${n}`.padStart(2, '0');
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const monthLabel = (d: Date) => d.toLocaleString('en-US', { month: 'long', year: 'numeric' });

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const daysInMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const isUnavailableDate = (date: Date, today: Date) => {
  if (date < today) return true;
  const now = new Date();
  return isSameDay(date, today) && now.getHours() >= 21;
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

const CalendarPickerModal = ({ visible, initialDateISO, allowedWeekdays, minDateISO, maxDateISO, disabledDateISOs, onSelect, onClose }: CalendarPickerModalProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const initial = useMemo(() => {
    const [y, m, d] = initialDateISO.split('-').map((v) => Number(v));
    return new Date(y, m - 1, d);
  }, [initialDateISO]);

  const [cursor, setCursor] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));

  const today = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }, []);

  const monthStart = useMemo(() => startOfMonth(cursor), [cursor]);
  const count = useMemo(() => daysInMonth(cursor), [cursor]);
  const startDay = useMemo(() => monthStart.getDay(), [monthStart]); // 0 Sun .. 6 Sat

  const cells = useMemo(() => {
    const items: Array<{ key: string; date: Date | null }> = [];
    for (let i = 0; i < startDay; i++) items.push({ key: `pad-${i}`, date: null });
    for (let day = 1; day <= count; day++) {
      items.push({ key: `d-${day}`, date: new Date(cursor.getFullYear(), cursor.getMonth(), day) });
    }
    // Fill to 6 rows (42 cells) for stable layout.
    while (items.length < 42) items.push({ key: `tail-${items.length}`, date: null });
    return items;
  }, [count, cursor, startDay]);

  const selectDate = (d: Date) => {
    onSelect(toISODate(d));
    onClose();
  };

  const moveMonth = (delta: number) => {
    const next = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
    setCursor(next);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Select Date</Text>
          <Pressable onPress={onClose} style={styles.iconBtn}>
            <Ionicons
              name="close"
              size={18}
              color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse}
            />
          </Pressable>
        </View>

        <View style={styles.monthRow}>
          <TouchableOpacity activeOpacity={0.9} onPress={() => moveMonth(-1)} style={styles.navBtn}>
            <Ionicons name="chevron-back" size={18} color={theme.colors.accent} />
          </TouchableOpacity>
          <Text style={styles.monthText}>{monthLabel(cursor)}</Text>
          <TouchableOpacity activeOpacity={0.9} onPress={() => moveMonth(1)} style={styles.navBtn}>
            <Ionicons name="chevron-forward" size={18} color={theme.colors.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((d, idx) => (
            <Text key={`${d}-${idx}`} style={styles.weekText}>
              {d}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((cell) => {
            if (!cell.date) return <View key={cell.key} style={styles.dayCell} />;

            const weekdayBlocked = Array.isArray(allowedWeekdays) && allowedWeekdays.length > 0 && !allowedWeekdays.includes(cell.date.getDay());
            const iso = toISODate(cell.date);
            const beforeMin = Boolean(minDateISO && iso < minDateISO);
            const afterMax = Boolean(maxDateISO && iso > maxDateISO);
            const explicitlyDisabled = Array.isArray(disabledDateISOs) && disabledDateISOs.includes(iso);
            const isPast = isUnavailableDate(cell.date, today) || weekdayBlocked || beforeMin || afterMax || explicitlyDisabled;
            const selected = isSameDay(cell.date, initial);
            return (
              <TouchableOpacity
                key={cell.key}
                activeOpacity={0.9}
                disabled={isPast}
                onPress={() => selectDate(cell.date!)}
                style={[styles.dayCell, selected && styles.dayCellSelected, isPast && styles.dayCellDisabled]}
              >
                <Text style={[styles.dayText, selected && styles.dayTextSelected, isPast && styles.dayTextDisabled]}>
                  {cell.date.getDate()}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
      position: 'absolute',
      left: 14,
      right: 14,
      top: 120,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
      overflow: 'hidden',
      maxWidth: 520,
      alignSelf: 'center',
    },
    header: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    monthRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    navBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    monthText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '800',
    },
    weekRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingBottom: 8,
    },
    weekText: {
      width: 40,
      textAlign: 'center',
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 14,
      paddingBottom: 14,
      gap: 8,
    },
    dayCell: {
      width: 40,
      height: 40,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    dayCellSelected: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
    },
    dayCellDisabled: {
      opacity: 0.45,
    },
    dayText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
    },
    dayTextSelected: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
    },
    dayTextDisabled: {
      color: theme.colors.textMuted,
    },
  });

export default CalendarPickerModal;
