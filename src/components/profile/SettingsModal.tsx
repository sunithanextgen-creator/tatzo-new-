import React, { useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Animated, Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../../config/firebaseConfig';
import { collection, deleteDoc, doc, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme, FontSizeMode, ThemePreference } from '../../theme/theme';

type SettingsModalProps = {
  visible: boolean;
  onClose: () => void;
};

type ProfileVisibility = 'Public' | 'Private' | 'Followers Only';
type LocationVisibility = 'Exact Location' | 'City Only' | 'Hidden';
type MessageAccess = 'Everyone' | 'Followers Only' | 'Nobody';
type FollowAccess = 'Everyone' | 'Request Approval';
type FontOption = 'Small' | 'Medium' | 'Large';
type ThemeOption = 'Dark Theme' | 'Light Theme' | 'System Theme';
type VacationDateOption = 'Tomorrow' | 'In 3 Days' | 'In 1 Week';
type PromptKind = 'hideLocation' | 'disableBookingNotifications' | 'privateProfile' | 'vacationMode' | null;

type NotificationPreferences = {
  newBookingRequest: boolean;
  bookingConfirmed: boolean;
  bookingRejected: boolean;
  bookingReminder: boolean;
  likeActivity: boolean;
  followActivity: boolean;
  saveActivity: boolean;
  commentsFuture: boolean;
  paymentReceived: boolean;
  revenueUpdates: boolean;
  subscriptionRenewal: boolean;
  tatzoNews: boolean;
  newFeatures: boolean;
  promotions: boolean;
  push: boolean;
  email: boolean;
  sms: boolean;
};

type PrivacyPreferences = {
  showEmail: boolean;
  showContactDetails: boolean;
  showLocation: boolean;
  whoCanMessageMe: MessageAccess;
  whoCanFollowMe: FollowAccess;
};

type TimeManagementPreferences = {
  availableDays: string[];
  workingHours: string;
  manualApproval: boolean;
  maxBookingsPerDay: string;
  vacationMode: boolean;
  vacationReturnDate: string;
  blockSpecificDates: boolean;
};

type BlockedUserRow = {
  id: string;
  blockedUid?: string | null;
  blockedName?: string | null;
  blockedProfileImageUrl?: string | null;
  blockedAt?: unknown;
};

type ReportHistoryRow = {
  id: string;
  postId?: string | null;
  reason?: string | null;
  status?: string | null;
  createdAt?: unknown;
};

const FONT_OPTIONS: readonly FontOption[] = ['Small', 'Medium', 'Large'];
const THEME_OPTIONS: readonly ThemeOption[] = ['Dark Theme', 'Light Theme', 'System Theme'];
const PROFILE_VISIBILITY_OPTIONS: readonly ProfileVisibility[] = ['Public', 'Private', 'Followers Only'];
const LOCATION_OPTIONS: readonly LocationVisibility[] = ['Exact Location', 'City Only', 'Hidden'];
const MESSAGE_OPTIONS: readonly MessageAccess[] = ['Everyone', 'Followers Only', 'Nobody'];
const FOLLOW_OPTIONS: readonly FollowAccess[] = ['Everyone', 'Request Approval'];
const VACATION_OPTIONS: readonly VacationDateOption[] = ['Tomorrow', 'In 3 Days', 'In 1 Week'];
const DAY_OPTIONS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const SETTINGS_STATE_KEY = 'tatzo.settingsModal.preferences.v2';

const defaultNotifications = (push: boolean, email: boolean, sms: boolean): NotificationPreferences => ({
  newBookingRequest: true,
  bookingConfirmed: true,
  bookingRejected: true,
  bookingReminder: false,
  likeActivity: true,
  followActivity: true,
  saveActivity: true,
  commentsFuture: false,
  paymentReceived: true,
  revenueUpdates: true,
  subscriptionRenewal: true,
  tatzoNews: false,
  newFeatures: true,
  promotions: false,
  push,
  email,
  sms,
});

const defaultPrivacy: PrivacyPreferences = {
  showEmail: false,
  showContactDetails: false,
  showLocation: true,
  whoCanMessageMe: 'Everyone',
  whoCanFollowMe: 'Everyone',
};

const defaultTimeManagement: TimeManagementPreferences = {
  availableDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  workingHours: '10 AM - 8 PM',
  manualApproval: true,
  maxBookingsPerDay: '5',
  vacationMode: false,
  vacationReturnDate: '',
  blockSpecificDates: false,
};

const getThemeLabel = (preference: ThemePreference): ThemeOption => {
  if (preference === 'light') return 'Light Theme';
  if (preference === 'system') return 'System Theme';
  return 'Dark Theme';
};

const mapThemeLabelToPreference = (value: ThemeOption): ThemePreference => {
  if (value === 'Light Theme') return 'light';
  if (value === 'System Theme') return 'system';
  return 'dark';
};

const mapFontOption = (value: FontOption): FontSizeMode => {
  if (value === 'Small') return 'small';
  if (value === 'Large') return 'large';
  return 'medium';
};

const mapFontMode = (value: FontSizeMode): FontOption => {
  if (value === 'small') return 'Small';
  if (value === 'large') return 'Large';
  return 'Medium';
};

const getFutureDateLabel = (option: VacationDateOption) => {
  const date = new Date();
  if (option === 'Tomorrow') date.setDate(date.getDate() + 1);
  if (option === 'In 3 Days') date.setDate(date.getDate() + 3);
  if (option === 'In 1 Week') date.setDate(date.getDate() + 7);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  const casted = value as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof casted?.toMillis === 'function') return casted.toMillis();
  if (typeof casted?.seconds === 'number') return casted.seconds * 1000 + Math.floor((casted.nanoseconds ?? 0) / 1_000_000);
  return 0;
};

const formatDateLabel = (value: unknown) => {
  const ms = toMillis(value);
  if (!ms) return 'Date unavailable';
  return new Date(ms).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const SettingsModal = ({ visible, onClose }: SettingsModalProps) => {
  const {
    theme,
    themePreference,
    setThemePreference,
    fontSizeMode,
    setFontSizeMode,
    dataSaverMode,
    setDataSaverMode,
    notifications: globalNotifications,
    setNotifications: setGlobalNotifications,
  } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [fontSize, setFontSize] = useState<FontOption>(mapFontMode(fontSizeMode));
  const [selectedTheme, setSelectedTheme] = useState<ThemeOption>(getThemeLabel(themePreference));
  const [profileVisibility, setProfileVisibility] = useState<ProfileVisibility>('Public');
  const [locationVisibility, setLocationVisibility] = useState<LocationVisibility>('City Only');
  const [notifications, setNotifications] = useState<NotificationPreferences>(defaultNotifications(globalNotifications.push, globalNotifications.email, globalNotifications.sms));
  const [privacy, setPrivacy] = useState<PrivacyPreferences>(defaultPrivacy);
  const [timeManagement, setTimeManagement] = useState<TimeManagementPreferences>(defaultTimeManagement);
  const [dataSaver, setDataSaver] = useState(dataSaverMode);
  const [promptKind, setPromptKind] = useState<PromptKind>(null);
  const [pendingLocation, setPendingLocation] = useState<LocationVisibility>('Hidden');
  const [pendingProfileVisibility, setPendingProfileVisibility] = useState<ProfileVisibility>('Private');
  const [vacationChoice, setVacationChoice] = useState<VacationDateOption>('In 3 Days');
  const [themeToastVisible, setThemeToastVisible] = useState(false);
  const [blockedUsers, setBlockedUsers] = useState<BlockedUserRow[]>([]);
  const [reportHistory, setReportHistory] = useState<ReportHistoryRow[]>([]);
  const themeToastAnim = useRef(new Animated.Value(0)).current;
  const initializedRef = useRef(false);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!visible) return;
    let alive = true;
    AsyncStorage.getItem(SETTINGS_STATE_KEY)
      .then((value) => {
        if (!alive || !value) return;
        try {
          const parsed = JSON.parse(value) as {
            profileVisibility?: ProfileVisibility;
            locationVisibility?: LocationVisibility;
            notifications?: Partial<NotificationPreferences>;
            privacy?: Partial<PrivacyPreferences>;
            timeManagement?: Partial<TimeManagementPreferences>;
          };
          if (parsed.profileVisibility) setProfileVisibility(parsed.profileVisibility);
          if (parsed.locationVisibility) setLocationVisibility(parsed.locationVisibility);
          if (parsed.notifications) {
            setNotifications((prev) => ({
              ...prev,
              ...parsed.notifications,
              push: parsed.notifications.push ?? globalNotifications.push,
              email: parsed.notifications.email ?? globalNotifications.email,
              sms: parsed.notifications.sms ?? globalNotifications.sms,
            }));
          }
          if (parsed.privacy) {
            setPrivacy((prev) => ({ ...prev, ...parsed.privacy }));
          }
          if (parsed.timeManagement) {
            setTimeManagement((prev) => ({ ...prev, ...parsed.timeManagement }));
          }
        } catch {
          // ignore corrupt setting state
        }
      })
      .catch(() => {})
      .finally(() => {
        initializedRef.current = true;
      });

    return () => {
      alive = false;
    };
  }, [globalNotifications.email, globalNotifications.push, globalNotifications.sms, visible]);

  useEffect(() => {
    setFontSize(mapFontMode(fontSizeMode));
  }, [fontSizeMode]);

  useEffect(() => {
    setSelectedTheme(getThemeLabel(themePreference));
  }, [themePreference]);

  useEffect(() => {
    setDataSaver(dataSaverMode);
  }, [dataSaverMode]);

  useEffect(() => {
    setNotifications((prev) => ({
      ...prev,
      push: globalNotifications.push,
      email: globalNotifications.email,
      sms: globalNotifications.sms,
    }));
  }, [globalNotifications]);

  useEffect(() => {
    if (!initializedRef.current) return;
    AsyncStorage.setItem(
      SETTINGS_STATE_KEY,
      JSON.stringify({
        profileVisibility,
        locationVisibility,
        notifications,
        privacy,
        timeManagement,
      }),
    ).catch(() => {});
  }, [locationVisibility, notifications, privacy, profileVisibility, timeManagement]);

  useEffect(() => {
    if (!visible || !uid) {
      setBlockedUsers([]);
      setReportHistory([]);
      return;
    }

    const blockedUnsub = onSnapshot(
      collection(db, 'users', uid, 'blockedUsers'),
      (snap) => {
        const rows = snap.docs
          .map((row) => ({ id: row.id, ...(row.data() as any) }) as BlockedUserRow)
          .sort((a, b) => toMillis(b.blockedAt) - toMillis(a.blockedAt));
        setBlockedUsers(rows);
      },
      () => setBlockedUsers([]),
    );

    const reportUnsub = onSnapshot(
      query(collection(db, 'postReports'), where('reportedByUid', '==', uid)),
      (snap) => {
        const rows = snap.docs
          .map((row) => ({ id: row.id, ...(row.data() as any) }) as ReportHistoryRow)
          .sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setReportHistory(rows);
      },
      () => setReportHistory([]),
    );

    return () => {
      blockedUnsub();
      reportUnsub();
    };
  }, [uid, visible]);

  const showThemeToast = () => {
    setThemeToastVisible(true);
    themeToastAnim.setValue(0);
    Animated.sequence([
      Animated.timing(themeToastAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.delay(260),
      Animated.timing(themeToastAnim, { toValue: 0, duration: 160, useNativeDriver: true }),
    ]).start(() => setThemeToastVisible(false));
  };

  const openUrl = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const renderSegment = <T extends string,>(options: readonly T[], value: T, onChange: (next: T) => void) => (
    <View style={styles.segmentWrap}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable key={option} onPress={() => onChange(option)} style={[styles.segmentBtn, active && styles.segmentBtnActive]}>
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderSectionHeader = (icon: keyof typeof Ionicons.glyphMap, title: string, description: string) => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionIcon}>
        <Ionicons name={icon} size={16} color={theme.colors.accent} />
      </View>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionDesc}>{description}</Text>
      </View>
    </View>
  );

  const renderToggleRow = (
    label: string,
    value: boolean,
    onValueChange: (next: boolean) => void,
    description?: string,
    accentColor?: string,
  ) => (
    <View style={styles.toggleRow}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowText}>{label}</Text>
        {description ? <Text style={styles.rowSub}>{description}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={{
          false: theme.mode === 'light' ? 'rgba(17,24,39,0.12)' : 'rgba(255,255,255,0.16)',
          true: accentColor ?? theme.colors.accent,
        }}
        thumbColor={theme.colors.textInverse}
      />
    </View>
  );

  const applyThemeSelection = (next: ThemeOption) => {
    setSelectedTheme(next);
    setThemePreference(mapThemeLabelToPreference(next));
    showThemeToast();
  };

  const requestProfileVisibilityChange = (next: ProfileVisibility) => {
    if (next === 'Private' && profileVisibility !== 'Private') {
      setPendingProfileVisibility(next);
      setPromptKind('privateProfile');
      return;
    }
    setProfileVisibility(next);
  };

  const requestLocationChange = (next: LocationVisibility) => {
    if (next === 'Hidden' && locationVisibility !== 'Hidden') {
      setPendingLocation(next);
      setPromptKind('hideLocation');
      return;
    }
    setLocationVisibility(next);
    setPrivacy((prev) => ({ ...prev, showLocation: next !== 'Hidden' }));
  };

  const requestBookingNotificationChange = (next: boolean) => {
    if (!next && notifications.newBookingRequest) {
      setPromptKind('disableBookingNotifications');
      return;
    }
    setNotifications((prev) => ({ ...prev, newBookingRequest: next }));
  };

  const requestVacationModeChange = (next: boolean) => {
    if (next && !timeManagement.vacationMode) {
      setPromptKind('vacationMode');
      return;
    }
    setTimeManagement((prev) => ({ ...prev, vacationMode: next, vacationReturnDate: next ? prev.vacationReturnDate : '' }));
  };

  const confirmPrompt = () => {
    if (promptKind === 'hideLocation') {
      setLocationVisibility(pendingLocation);
      setPrivacy((prev) => ({ ...prev, showLocation: false }));
    }
    if (promptKind === 'disableBookingNotifications') {
      setNotifications((prev) => ({ ...prev, newBookingRequest: false }));
    }
    if (promptKind === 'privateProfile') {
      setProfileVisibility(pendingProfileVisibility);
      if (pendingProfileVisibility === 'Private') {
        setPrivacy((prev) => ({ ...prev, whoCanFollowMe: 'Request Approval' }));
      }
    }
    if (promptKind === 'vacationMode') {
      setTimeManagement((prev) => ({
        ...prev,
        vacationMode: true,
        vacationReturnDate: getFutureDateLabel(vacationChoice),
      }));
    }
    setPromptKind(null);
  };

  const dismissPrompt = () => {
    setPromptKind(null);
  };

  const promptContent = useMemo(() => {
    if (promptKind === 'hideLocation') {
      return {
        emoji: '📍',
        title: 'Hide Location?',
        description: 'Your city and location details will no longer be visible to users browsing your profile. This may reduce local discovery opportunities.',
        primary: 'Hide Location',
        secondary: 'Keep Visible',
      };
    }
    if (promptKind === 'disableBookingNotifications') {
      return {
        emoji: '🔕',
        title: 'Pause Booking Notifications?',
        description: 'You may miss new booking requests and artist updates.',
        primary: 'Disable Notifications',
        secondary: 'Keep Enabled',
      };
    }
    if (promptKind === 'privateProfile') {
      return {
        emoji: '🔒',
        title: 'Switch to Private Profile?',
        description: 'Only approved followers will be able to view your portfolio and profile information.',
        primary: 'Make Private',
        secondary: 'Cancel',
      };
    }
    if (promptKind === 'vacationMode') {
      return {
        emoji: '🏖️',
        title: 'Enable Vacation Mode?',
        description: "You won't receive new booking requests until you turn it off.",
        primary: 'Enable',
        secondary: 'Cancel',
      };
    }
    return null;
  }, [promptKind]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />

      {themeToastVisible ? (
        <Animated.View style={[styles.themeToast, { opacity: themeToastAnim, transform: [{ scale: themeToastAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] }]}>
          <Text style={styles.themeToastEmoji}>{theme.mode === 'dark' ? '💜 → 💙' : '💙 → 💜'}</Text>
          <Text style={styles.themeToastTitle}>Tatzo Theme Updated</Text>
          <Text style={styles.themeToastSub}>Premium neon look applied instantly.</Text>
        </Animated.View>
      ) : null}

      {promptContent ? (
        <View style={styles.promptOverlay}>
          <View style={styles.promptCard}>
            <Text style={styles.promptEmoji}>{promptContent.emoji}</Text>
            <Text style={styles.promptTitle}>{promptContent.title}</Text>
            <Text style={styles.promptDesc}>{promptContent.description}</Text>
            {promptKind === 'vacationMode' ? (
              <View style={styles.promptExtra}>
                <Text style={styles.fieldLabel}>Return Date</Text>
                {renderSegment<VacationDateOption>(VACATION_OPTIONS, vacationChoice, setVacationChoice)}
                <Text style={styles.promptHint}>Selected return: {getFutureDateLabel(vacationChoice)}</Text>
              </View>
            ) : null}
            <View style={styles.promptActions}>
              <Pressable onPress={dismissPrompt} style={[styles.promptButton, styles.promptButtonSecondary]}>
                <Text style={styles.promptButtonSecondaryText}>{promptContent.secondary}</Text>
              </Pressable>
              <Pressable onPress={confirmPrompt} style={[styles.promptButton, styles.promptButtonPrimary]}>
                <Text style={styles.promptButtonPrimaryText}>{promptContent.primary}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}

      <View style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            {renderSectionHeader('color-palette-outline', 'Appearance', 'Switch Tatzo between dark, light, and system-based viewing with instant live preview.')}
            <Text style={styles.fieldLabel}>Theme</Text>
            {renderSegment(THEME_OPTIONS, selectedTheme, applyThemeSelection)}
            <Text style={styles.fieldLabel}>Font Size</Text>
            {renderSegment(FONT_OPTIONS, fontSize, (next) => {
              setFontSize(next);
              setFontSizeMode(mapFontOption(next));
            })}
            <View style={styles.previewCard}>
              <Text style={[styles.previewTitle, { fontSize: fontSize === 'Small' ? 20 : fontSize === 'Large' ? 28 : 24 }]}>Shiva Ink</Text>
              <Text style={[styles.previewBody, { fontSize: fontSize === 'Small' ? 12 : fontSize === 'Large' ? 16 : 14 }]}>Realism • Black & Grey</Text>
              <Text style={[styles.previewHint, { fontSize: fontSize === 'Small' ? 11 : fontSize === 'Large' ? 14 : 12 }]}>Live preview of your current text scale.</Text>
            </View>
            {renderToggleRow('Data Saver Mode', dataSaver, (next) => {
              setDataSaver(next);
              setDataSaverMode(next);
            }, 'Reduce heavy media load on slower Android data.')}
          </View>

          <View style={styles.section}>
            {renderSectionHeader('notifications-outline', 'Notifications', 'Control booking alerts, activity updates, payment updates, and your preferred delivery channels.')}
            <Text style={styles.fieldLabel}>Booking Notifications</Text>
            {renderToggleRow('New Booking Request', notifications.newBookingRequest, requestBookingNotificationChange, 'Get alerted instantly when a fresh booking lands.')}
            {renderToggleRow('Booking Confirmed', notifications.bookingConfirmed, (next) => setNotifications((prev) => ({ ...prev, bookingConfirmed: next })), 'User confirms your quote or booking flow.')}
            {renderToggleRow('Booking Rejected', notifications.bookingRejected, (next) => setNotifications((prev) => ({ ...prev, bookingRejected: next })), 'Stay updated on declined requests.')}
            {renderToggleRow('Booking Reminder', notifications.bookingReminder, (next) => setNotifications((prev) => ({ ...prev, bookingReminder: next })), 'Helpful reminder before scheduled work.')}

            <Text style={styles.fieldLabel}>Activity Notifications</Text>
            {renderToggleRow('Like Activity', notifications.likeActivity, (next) => setNotifications((prev) => ({ ...prev, likeActivity: next })), 'Likes on your posts and portfolio work.')}
            {renderToggleRow('Follow Activity', notifications.followActivity, (next) => setNotifications((prev) => ({ ...prev, followActivity: next })), 'New followers and audience growth.')}
            {renderToggleRow('Save Activity', notifications.saveActivity, (next) => setNotifications((prev) => ({ ...prev, saveActivity: next })), 'When users save your posts or reels.')}
            {renderToggleRow('Comments (Future)', notifications.commentsFuture, (next) => setNotifications((prev) => ({ ...prev, commentsFuture: next })), 'Prepared for future social comments support.')}

            <Text style={styles.fieldLabel}>Payment Notifications</Text>
            {renderToggleRow('Collected Amount', notifications.paymentReceived, (next) => setNotifications((prev) => ({ ...prev, paymentReceived: next })), 'Collected amount and payout-related updates.')}
            {renderToggleRow('Revenue Updates', notifications.revenueUpdates, (next) => setNotifications((prev) => ({ ...prev, revenueUpdates: next })), 'Monthly revenue and tracking updates.')}
            {renderToggleRow('Subscription Renewal', notifications.subscriptionRenewal, (next) => setNotifications((prev) => ({ ...prev, subscriptionRenewal: next })), 'Tatzo Pro and plan renewal reminders.')}

            <Text style={styles.fieldLabel}>Marketing Notifications</Text>
            {renderToggleRow('Tatzo News', notifications.tatzoNews, (next) => setNotifications((prev) => ({ ...prev, tatzoNews: next })), 'Major marketplace and company updates.')}
            {renderToggleRow('New Features', notifications.newFeatures, (next) => setNotifications((prev) => ({ ...prev, newFeatures: next })), 'Product improvements and feature drops.')}
            {renderToggleRow('Promotions & Offers', notifications.promotions, (next) => setNotifications((prev) => ({ ...prev, promotions: next })), 'Offers, campaigns, and promo announcements.')}

            <Text style={styles.fieldLabel}>Push Controls</Text>
            {renderToggleRow('Push Notifications', notifications.push, (next) => {
              setNotifications((prev) => ({ ...prev, push: next }));
              setGlobalNotifications((prev) => ({ ...prev, push: next }));
            })}
            {renderToggleRow('Email Notifications', notifications.email, (next) => {
              setNotifications((prev) => ({ ...prev, email: next }));
              setGlobalNotifications((prev) => ({ ...prev, email: next }));
            })}
            {renderToggleRow('SMS Notifications', notifications.sms, (next) => {
              setNotifications((prev) => ({ ...prev, sms: next }));
              setGlobalNotifications((prev) => ({ ...prev, sms: next }));
            })}
          </View>

          <View style={styles.section}>
            {renderSectionHeader('lock-closed-outline', 'Account Privacy', 'Decide who can view your profile, contact you, and discover your location.')}
            <Text style={styles.fieldLabel}>Profile Visibility</Text>
            {renderSegment(PROFILE_VISIBILITY_OPTIONS, profileVisibility, requestProfileVisibilityChange)}
            <Text style={styles.fieldLabel}>Location Controls</Text>
            {renderSegment(LOCATION_OPTIONS, locationVisibility, requestLocationChange)}
            <Text style={styles.fieldLabel}>Contact Visibility</Text>
            {renderToggleRow('Show Email', privacy.showEmail, (next) => setPrivacy((prev) => ({ ...prev, showEmail: next })), 'Allow users to see your email while browsing your profile.')}
            {renderToggleRow('Show Contact Details', privacy.showContactDetails, (next) => setPrivacy((prev) => ({ ...prev, showContactDetails: next })), 'Show your contact info directly on profile.')}
            <Text style={styles.fieldLabel}>Social Controls</Text>
            {renderSegment(MESSAGE_OPTIONS, privacy.whoCanMessageMe, (next) => setPrivacy((prev) => ({ ...prev, whoCanMessageMe: next })))}
            {renderSegment(FOLLOW_OPTIONS, privacy.whoCanFollowMe, (next) => setPrivacy((prev) => ({ ...prev, whoCanFollowMe: next })))}
            <Text style={styles.fieldLabel}>Security</Text>
            <View style={styles.infoRow}><Text style={styles.infoText}>Change Password</Text><Text style={styles.infoState}>Available</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Two-Factor Authentication</Text><Text style={styles.infoState}>Later</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Login Activity</Text><Text style={styles.infoState}>Tracked</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Active Devices</Text><Text style={styles.infoState}>Visible soon</Text></View>
          </View>

          <View style={styles.section}>
            {renderSectionHeader('time-outline', 'Time Management', 'Control available days, working hours, booking approvals, and artist availability.')}
            <Text style={styles.fieldLabel}>Available Days</Text>
            <View style={styles.segmentWrap}>
              {DAY_OPTIONS.map((day) => {
                const active = timeManagement.availableDays.includes(day);
                return (
                  <Pressable
                    key={day}
                    onPress={() =>
                      setTimeManagement((prev) => ({
                        ...prev,
                        availableDays: active ? prev.availableDays.filter((item) => item !== day) : [...prev.availableDays, day],
                      }))
                    }
                    style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{day}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Working Hours</Text><Text style={styles.infoState}>{timeManagement.workingHours}</Text></View>
            {renderToggleRow('Manual Approval', timeManagement.manualApproval, (next) => setTimeManagement((prev) => ({ ...prev, manualApproval: next })), 'Approve each booking manually before confirmation.')}
            <View style={styles.infoRow}><Text style={styles.infoText}>Maximum Bookings Per Day</Text><Text style={styles.infoState}>{timeManagement.maxBookingsPerDay}</Text></View>
            {renderToggleRow('Vacation Mode', timeManagement.vacationMode, requestVacationModeChange, timeManagement.vacationMode && timeManagement.vacationReturnDate ? `Currently unavailable until ${timeManagement.vacationReturnDate}.` : 'Pause fresh bookings while keeping your profile visible.')}
            {renderToggleRow('Block Specific Dates', timeManagement.blockSpecificDates, (next) => setTimeManagement((prev) => ({ ...prev, blockSpecificDates: next })), 'Reserve blackout dates for personal or studio time.')}
            <View style={styles.infoRow}><Text style={styles.infoText}>Upcoming Appointments</Text><Text style={styles.infoState}>Check Bookings</Text></View>
          </View>

          <View style={styles.section}>
            {renderSectionHeader('shield-outline', 'Blocked / Reported', 'Review blocked users, report history, and safety actions taken in your account.')}
            {blockedUsers.length ? (
              blockedUsers.map((item) => (
                <View key={item.id} style={styles.infoRow}>
                  <View style={styles.infoCopy}>
                    <Text style={styles.infoText}>{item.blockedName?.trim() || 'Blocked user'}</Text>
                    <Text style={styles.rowSub}>Blocked on {formatDateLabel(item.blockedAt)}</Text>
                  </View>
                  <Pressable
                    onPress={() => uid ? deleteDoc(doc(db, 'users', uid, 'blockedUsers', item.id)).catch(() => {}) : null}
                    style={styles.inlineActionBtn}
                  >
                    <Text style={styles.inlineActionText}>Unblock</Text>
                  </Pressable>
                </View>
              ))
            ) : (
              <View style={styles.infoRow}><Text style={styles.infoText}>No blocked users</Text><Text style={styles.infoState}>Clean</Text></View>
            )}
            {reportHistory.length ? (
              reportHistory.map((item) => (
                <View key={item.id} style={styles.infoRow}>
                  <View style={styles.infoCopy}>
                    <Text style={styles.infoText}>Report #{String(item.postId ?? item.id).slice(0, 8)}</Text>
                    <Text style={styles.rowSub}>{item.reason?.trim() || 'Reason not available'}</Text>
                  </View>
                  <Text style={styles.infoState}>{String(item.status ?? 'under review')}</Text>
                </View>
              ))
            ) : (
              <View style={styles.infoRow}><Text style={styles.infoText}>No report history</Text><Text style={styles.infoState}>Clear</Text></View>
            )}
          </View>

          <View style={styles.section}>
            {renderSectionHeader('information-circle-outline', 'About', 'Legal, app policy, versioning, and core Tatzo company information in one place.')}
            <Pressable onPress={() => openUrl('https://tatzo-as0711.web.app/terms.html')} style={styles.linkRow}>
              <Text style={styles.linkText}>Terms & Conditions</Text>
              <Ionicons name="open-outline" size={16} color={theme.colors.textMuted} />
            </Pressable>
            <Pressable onPress={() => openUrl('https://tatzo-as0711.web.app/privacy-policy.html')} style={styles.linkRow}>
              <Text style={styles.linkText}>Privacy Policy</Text>
              <Ionicons name="open-outline" size={16} color={theme.colors.textMuted} />
            </Pressable>
            <View style={styles.infoRow}><Text style={styles.infoText}>Artist Policy</Text><Text style={styles.infoState}>Active</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Cancellation Policy</Text><Text style={styles.infoState}>Available</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Refund & Reschedule Policy</Text><Text style={styles.infoState}>Available</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>App Version</Text><Text style={styles.infoState}>v1.0.0</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Build Number</Text><Text style={styles.infoState}>2026.06</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>What&apos;s New</Text><Text style={styles.infoState}>Neon UI polish</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>About Tatzo</Text><Text style={styles.infoState}>Tattoo-Tech</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Partnerships</Text><Text style={styles.infoState}>Open soon</Text></View>
          </View>

          <View style={styles.section}>
            {renderSectionHeader('help-circle-outline', 'Help Center', 'Get quick guidance for onboarding, bookings, safety, support, and Tatzo workflow.')}
            <View style={styles.infoRow}><Text style={styles.infoText}>How Tatzo Works</Text><Text style={styles.infoState}>Guide</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Artist Onboarding Guide</Text><Text style={styles.infoState}>Guide</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>User Booking Guide</Text><Text style={styles.infoState}>Guide</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Booking Workflow</Text><Text style={styles.infoState}>Guide</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Payment Process</Text><Text style={styles.infoState}>Guide</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Revenue Tracking</Text><Text style={styles.infoState}>Guide</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Privacy & Security</Text><Text style={styles.infoState}>Guide</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>FAQ</Text><Text style={styles.infoState}>Support</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Contact Support</Text><Text style={styles.infoState}>support@tatzo.co.in</Text></View>
            <View style={styles.infoRow}><Text style={styles.infoText}>Submit Feedback</Text><Text style={styles.infoState}>Available</Text></View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.68)',
    },
    sheet: {
      position: 'absolute',
      left: 14,
      right: 14,
      top: 68,
      bottom: 22,
      borderRadius: 26,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(0, 212, 255, 0.35)' : 'rgba(168, 85, 247, 0.25)',
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.98)' : 'rgba(20,20,20,0.96)',
      overflow: 'hidden',
      shadowColor: theme.mode === 'light' ? '#00D4FF' : '#A855F7',
      shadowOpacity: theme.mode === 'light' ? 0.18 : 0.24,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 12,
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
      fontSize: theme.typography.bodyLg,
      fontWeight: '800',
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      textShadowColor: theme.mode === 'light' ? 'rgba(0, 212, 255, 0.24)' : 'rgba(168, 85, 247, 0.36)',
      textShadowRadius: 8,
    },
    closeBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.06)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      shadowColor: theme.colors.accent,
      shadowOpacity: theme.mode === 'light' ? 0.12 : 0.18,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
    },
    content: {
      padding: 14,
      gap: 12,
    },
    section: {
      gap: 10,
      padding: 14,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(0, 212, 255, 0.26)' : 'rgba(168, 85, 247, 0.22)',
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.96)' : 'rgba(20,20,20,0.92)',
      shadowColor: theme.mode === 'light' ? '#00D4FF' : '#A855F7',
      shadowOpacity: theme.mode === 'light' ? 0.1 : 0.15,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    sectionHeader: {
      flexDirection: 'row',
      gap: 10,
      alignItems: 'flex-start',
    },
    sectionIcon: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.borderStrong,
    },
    sectionHeaderCopy: {
      flex: 1,
      gap: 2,
    },
    sectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.bodyLg,
      fontWeight: '800',
    },
    sectionDesc: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
      lineHeight: theme.typography.caption + 4,
      fontWeight: '600',
    },
    fieldLabel: {
      color: theme.colors.accent,
      fontSize: theme.typography.caption,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginTop: 2,
    },
    segmentWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    segmentBtn: {
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(0,102,255,0.04)' : 'rgba(255,255,255,0.04)',
    },
    segmentBtnActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.colors.accent,
      shadowColor: theme.colors.accent,
      shadowOpacity: theme.mode === 'light' ? 0.16 : 0.24,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
    },
    segmentText: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.body,
      fontWeight: '700',
    },
    segmentTextActive: {
      color: theme.colors.accent,
    },
    previewCard: {
      padding: 14,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(248,250,252,0.92)' : 'rgba(5,5,5,0.72)',
      gap: 4,
    },
    previewTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontWeight: '800',
    },
    previewBody: {
      color: theme.colors.text,
      fontWeight: '700',
    },
    previewHint: {
      color: theme.colors.textMuted,
      fontWeight: '600',
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 50,
    },
    rowCopy: {
      flex: 1,
      gap: 2,
    },
    rowText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '700',
    },
    rowSub: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
      lineHeight: 15,
      fontWeight: '600',
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      minHeight: 38,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
      paddingBottom: 8,
    },
    infoCopy: {
      flex: 1,
      minWidth: 0,
      gap: 4,
    },
    infoText: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '700',
    },
    infoState: {
      color: theme.colors.accent,
      fontSize: theme.typography.caption,
      fontWeight: '800',
    },
    inlineActionBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
      paddingHorizontal: 12,
      paddingVertical: 7,
    },
    inlineActionText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.caption,
      fontWeight: '900',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      minHeight: 42,
      paddingVertical: 4,
    },
    linkText: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '700',
    },
    promptOverlay: {
      ...StyleSheet.absoluteFillObject,
      zIndex: 20,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      backgroundColor: 'rgba(2, 2, 2, 0.5)',
    },
    promptCard: {
      width: '100%',
      borderRadius: 24,
      padding: 18,
      gap: 10,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(0,212,255,0.35)' : 'rgba(168,85,247,0.32)',
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.98)' : 'rgba(10,10,10,0.96)',
      shadowColor: theme.mode === 'light' ? '#00D4FF' : '#A855F7',
      shadowOpacity: 0.22,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 12 },
      elevation: 16,
    },
    promptEmoji: {
      fontSize: 26,
    },
    promptTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.title,
      fontWeight: '800',
    },
    promptDesc: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.body,
      lineHeight: theme.typography.body + 6,
      fontWeight: '600',
    },
    promptExtra: {
      gap: 8,
      marginTop: 4,
    },
    promptHint: {
      color: theme.colors.accent,
      fontSize: theme.typography.caption,
      fontWeight: '700',
    },
    promptActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 6,
    },
    promptButton: {
      flex: 1,
      minHeight: 44,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    promptButtonSecondary: {
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(248,250,252,0.96)' : 'rgba(255,255,255,0.04)',
    },
    promptButtonPrimary: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.24,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
    },
    promptButtonSecondaryText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '800',
    },
    promptButtonPrimaryText: {
      color: theme.colors.accent,
      fontSize: theme.typography.body,
      fontWeight: '800',
    },
    themeToast: {
      position: 'absolute',
      top: '38%',
      alignSelf: 'center',
      zIndex: 30,
      minWidth: 220,
      borderRadius: 22,
      paddingHorizontal: 20,
      paddingVertical: 18,
      alignItems: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.96)' : 'rgba(10,10,10,0.94)',
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(0,212,255,0.35)' : 'rgba(168,85,247,0.32)',
      shadowColor: theme.mode === 'light' ? '#00D4FF' : '#A855F7',
      shadowOpacity: 0.24,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 20,
    },
    themeToastEmoji: {
      fontSize: 24,
      marginBottom: 6,
    },
    themeToastTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.bodyLg,
      fontWeight: '800',
    },
    themeToastSub: {
      marginTop: 2,
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
      fontWeight: '700',
    },
  });

export default SettingsModal;
