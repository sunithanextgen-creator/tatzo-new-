import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

type TourRole = 'user' | 'artist';

type TourStep = {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
};

type DashboardTourModalProps = {
  visible: boolean;
  role: TourRole;
  onDone: () => void;
};

const USER_STEPS: TourStep[] = [
  { icon: 'home-outline', title: 'Socio Feed', body: 'Discover artist posts, reels, designs, likes, follows, and reports from one clean feed.' },
  { icon: 'search-outline', title: 'Explore', body: 'Search styles and tattoo ideas before choosing an artist.' },
  { icon: 'add-circle-outline', title: 'Find Artist', body: 'Open verified artist profiles, check work, then book through AI Checker and quote flow.' },
  { icon: 'notifications-outline', title: 'Notifications', body: 'Quotes, payment requests, reminders, and final payment updates will appear here.' },
  { icon: 'person-outline', title: 'Profile', body: 'Update your profile, settings, account, privacy, and artist application from here.' },
];

const ARTIST_STEPS: TourStep[] = [
  { icon: 'people-outline', title: 'Socio Hub', body: 'View public feed activity and open artist profiles from posts.' },
  { icon: 'calendar-outline', title: 'Booking Requests', body: 'Review newest client requests, send quotes, track confirmed, expired, and final payments.' },
  { icon: 'add-circle-outline', title: 'Create Post', body: 'Upload portfolio images or reels, then add caption so users can discover your work.' },
  { icon: 'person-circle-outline', title: 'Profile Settings', body: 'Update studio details, certificate, Pro status, payment setup, and public profile trust info.' },
  { icon: 'notifications-outline', title: 'Notifications', body: 'Client requests, work-complete alerts, and payment updates route back to the right page.' },
];

const DashboardTourModal = ({ visible, role, onDone }: DashboardTourModalProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const steps = role === 'artist' ? ARTIST_STEPS : USER_STEPS;
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  const close = () => {
    setIndex(0);
    onDone();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.topRow}>
            <Text style={styles.eyebrow}>{role === 'artist' ? 'Artist Tour' : 'Tatzo Tour'}</Text>
            <Pressable onPress={close} style={styles.closeBtn}>
              <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
            </Pressable>
          </View>

          <LinearGradient colors={theme.gradients.accent} style={styles.iconMark}>
            <Ionicons name={step.icon} size={30} color="#0B0B0F" />
          </LinearGradient>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>

          <View style={styles.dots}>
            {steps.map((_, dotIndex) => <View key={dotIndex} style={[styles.dot, dotIndex === index && styles.dotActive]} />)}
          </View>

          <View style={styles.actions}>
            <TouchableOpacity activeOpacity={0.85} onPress={close} style={styles.ghostBtn}>
              <Text style={styles.ghostText}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity activeOpacity={0.9} onPress={() => (isLast ? close() : setIndex((v) => v + 1))} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>{isLast ? 'Start using Tatzo' : 'Next'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.62)', alignItems: 'center', justifyContent: 'center', padding: 18 },
    card: { width: '100%', maxWidth: 430, borderRadius: 28, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surfaceStrong, padding: 18, gap: 12 },
    topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: { color: theme.colors.accentStrong, fontSize: 12, fontWeight: '900', letterSpacing: 1.8, textTransform: 'uppercase' },
    closeBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
    iconMark: { width: 64, height: 64, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    title: { color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse, fontSize: 24, fontFamily: theme.fonts.display, lineHeight: 30 },
    body: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 21, fontWeight: '700' },
    dots: { flexDirection: 'row', gap: 7, paddingTop: 4 },
    dot: { width: 7, height: 7, borderRadius: 999, backgroundColor: theme.colors.border },
    dotActive: { width: 22, backgroundColor: theme.colors.accent },
    actions: { flexDirection: 'row', gap: 10, justifyContent: 'flex-end', paddingTop: 6 },
    ghostBtn: { minHeight: 46, borderRadius: 16, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: theme.colors.border },
    ghostText: { color: theme.colors.textMuted, fontSize: 13, fontWeight: '900' },
    primaryBtn: { minHeight: 46, borderRadius: 16, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accent },
    primaryText: { color: theme.colors.textInverse, fontSize: 13, fontWeight: '900' },
  });

export default DashboardTourModal;
