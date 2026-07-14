import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView as SafeAreaContextView } from 'react-native-safe-area-context';
import { auth, db } from '../../config/firebaseConfig';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import TopBar from '../../components/navigation/TopBar';
import NotificationsModal from '../../components/notifications/NotificationsModal';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { NotificationDoc } from '../../types/app';
import ArtistBottomNavigation, { ArtistNavKey } from '../../components/navigation/ArtistBottomNavigation';
import ArtistBookingsPanel from './panels/ArtistBookingsPanel';
import ArtistPostPanel from './panels/ArtistPostPanel';
import ArtistShopPanel from './panels/ArtistShopPanel';
import SocioFeedPanel from './panels/SocioFeedPanel';
import ArtistSettingPanel from './panels/ArtistSettingPanel';
import ArtistPublicProfileModal from '../../components/profile/ArtistPublicProfileModal';
import { syncArtistPostVisibilityForUid } from '../../services/posts';
import { createTodayBookingReminders, expireStaleQuotesForUser } from '../../services/bookings';
import DashboardTourModal from '../../components/onboarding/DashboardTourModal';
import { markNotificationReadDual } from '../../services/notifications';
import ArtistVerificationModal from '../../components/verification/ArtistVerificationModal';
import { ANALYTICS_EVENTS, trackAnalyticsEventOnce } from '../../services/analytics/analytics';

const isBookingNotificationType = (type: string) =>
  type === 'booking_request' ||
  type === 'booking_requested' ||
  type === 'booking_quote_sent' ||
  type === 'booking_quote_expired' ||
  type === 'booking_reschedule_requested' ||
  type === 'booking_reschedule_accepted' ||
  type === 'booking_reschedule_rejected' ||
  type === 'booking_artist_approved_payment_pending' ||
  type === 'booking_confirmed' ||
  type === 'booking_rejected' ||
  type === 'booking_reminder' ||
  type === 'payment_success' ||
  type === 'final_payment_requested' ||
  type === 'final_payment_user_marked_paid' ||
  type === 'final_payment_disputed' ||
  type === 'final_payment_success' ||
  type === 'session_completed';

const ArtistDashboardScreen = () => {
  const { theme, toggleMode, themePreference, setThemePreference } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [activeTab, setActiveTab] = useState<ArtistNavKey>('home');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [publicArtistUid, setPublicArtistUid] = useState<string | null>(null);
  const [socialUnreadCount, setSocialUnreadCount] = useState(0);
  const [bookingUnreadCount, setBookingUnreadCount] = useState(0);
  const [bookingUnreadIds, setBookingUnreadIds] = useState<string[]>([]);
  const [tourOpen, setTourOpen] = useState(false);
  const [verificationOpen, setVerificationOpen] = useState(false);
  const [notificationBookingId, setNotificationBookingId] = useState<string | null>(null);
  const previousThemeRef = useRef<typeof themePreference | null>(null);

  const uid = auth.currentUser?.uid ?? null;


  useEffect(() => {
    if (!uid) return;
    const key = 'tatzo_tour_seen_artist_' + uid;
    AsyncStorage.getItem(key)
      .then((seen) => { if (seen !== 'yes') setTourOpen(true); })
      .catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (activeTab === 'profile') {
      if (previousThemeRef.current === null) {
        previousThemeRef.current = themePreference;
      }
      if (themePreference !== 'dark') {
        setThemePreference('dark');
      }
      return;
    }

    if (previousThemeRef.current) {
      const restoreTheme = previousThemeRef.current;
      previousThemeRef.current = null;
      if (restoreTheme !== 'dark') {
        setThemePreference(restoreTheme);
      }
    }
  }, [activeTab, setThemePreference, themePreference]);

  useEffect(() => {
    if (!uid) return;
    void syncArtistPostVisibilityForUid(uid).catch(() => {
      // best-effort sync only
    });
    void createTodayBookingReminders({ uid, role: 'artist' }).catch(() => {
      // best-effort reminder generation only
    });
    void expireStaleQuotesForUser({ uid, role: 'artist' }).catch(() => {
      // stale quote cleanup is best-effort
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const unreadQuery = query(collection(db, 'users', uid, 'notifications'), where('read', '==', false));
    const unsub = onSnapshot(
      unreadQuery,
      (snap) => {
        let social = 0;
        let booking = 0;
        const nextBookingIds: string[] = [];
        snap.docs.forEach((docSnap) => {
          const type = String((docSnap.data() as any)?.type ?? '');
          if (type === 'booking_requested') {
            void trackAnalyticsEventOnce(`first_booking_received_${uid}`, ANALYTICS_EVENTS.FIRST_BOOKING_RECEIVED, {
              artist_id: uid,
            });
          }
          if (type === 'like' || type === 'share' || type === 'follow') {
            social += 1;
            return;
          }
          if (isBookingNotificationType(type)) {
            booking += 1;
            nextBookingIds.push(docSnap.id);
          }
        });
        setSocialUnreadCount(social);
        setBookingUnreadCount(booking);
        setBookingUnreadIds(nextBookingIds);
      },
      () => {
        setSocialUnreadCount(0);
        setBookingUnreadCount(0);
        setBookingUnreadIds([]);
      },
    );

    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (activeTab !== 'booking' || !uid || !bookingUnreadIds.length) return;
    let cancelled = false;
    (async () => {
      for (const notificationId of bookingUnreadIds) {
        if (cancelled) break;
        try {
          await markNotificationReadDual(uid, notificationId, true);
        } catch {
          // best-effort read sync only
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, bookingUnreadIds, uid]);
  const title = useMemo(() => {
    if (activeTab === 'home') return 'Tatzo';
    if (activeTab === 'booking') return 'Booking Requests';
    if (activeTab === 'post') return 'Create Post';
    if (activeTab === 'profile') return 'Profile';
    return 'Shop';
  }, [activeTab]);

  const handleNotificationPress = (item: NotificationDoc) => {
    const type = String(item.type ?? '');
    if (isBookingNotificationType(type)) {
      setNotificationBookingId(String(item.bookingId ?? item.entityId ?? '').trim() || null);
      setActiveTab('booking');
      setNotificationsOpen(false);
      return;
    }

    if (type === 'like' || type === 'follow' || type === 'post_created') {
      setActiveTab('home');
      setNotificationsOpen(false);
      return;
    }

    if (type === 'verification_approved' || type === 'verification_rejected' || type === 'verification_needs_more_samples' || type === 'system_message' || type === 'subscription_update') {
      setActiveTab('profile');
    }
    setNotificationsOpen(false);
  };

  const openNotifications = () => {
    setNotificationsOpen(true);
    setSocialUnreadCount(0);
  };
  const header = (
    <TopBar
      title={title}
      brandLayout={activeTab === 'home'}
      onToggleTheme={toggleMode}
      onPressAlerts={activeTab === 'home' ? openNotifications : undefined}
      showThemeToggle={activeTab !== 'profile'}
      showSecondary={false}
      showAlerts={activeTab === 'home'}
      notificationCount={socialUnreadCount}
    />
  );



  return (
    <SafeAreaContextView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <LinearGradient colors={theme.gradients.canvas} style={styles.container}>
        <DashboardTourModal
          visible={tourOpen}
          role="artist"
          onDone={() => {
            const keyUid = auth.currentUser?.uid;
            if (keyUid) AsyncStorage.setItem('tatzo_tour_seen_artist_' + keyUid, 'yes').catch(() => {});
            setTourOpen(false);
          }}
        />
        <NotificationsModal visible={notificationsOpen} uid={uid} onClose={() => setNotificationsOpen(false)} onPressItem={handleNotificationPress} />
        <ArtistVerificationModal
          visible={verificationOpen}
          onClose={() => setVerificationOpen(false)}
          onStartPosting={() => setActiveTab('post')}
        />

        {activeTab === 'home' ? (
          <SocioFeedPanel
            header={header}
            onOpenArtistProfile={(artistUid) => setPublicArtistUid(artistUid)}
            hideSearchBar
            hideFollowAction
          />
        ) : null}

        <ArtistPublicProfileModal
          visible={Boolean(publicArtistUid)}
          artistUid={publicArtistUid}
          onClose={() => setPublicArtistUid(null)}
        />

        {activeTab === 'booking' ? <ArtistBookingsPanel header={header} initialBookingId={notificationBookingId} /> : null}
        {activeTab === 'post' ? <ArtistPostPanel header={header} onOpenVerification={() => setVerificationOpen(true)} /> : null}
        {activeTab === 'shop' ? <ArtistShopPanel header={header} onOpenPost={() => setActiveTab('post')} /> : null}
        {activeTab === 'profile' ? <ArtistSettingPanel header={header} onOpenVerification={() => setVerificationOpen(true)} /> : null}

        <ArtistBottomNavigation activeKey={activeTab} onChange={setActiveTab} badgeCounts={{ booking: bookingUnreadCount }} />
      </LinearGradient>
    </SafeAreaContextView>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    container: {
      flex: 1,
    },
    profileSafeArea: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    profileContainer: {
      flex: 1,
    },
    profileHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 6,
    },
    profileTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    profileClose: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
    },
    heroCard: {
      borderRadius: 28,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginHorizontal: 18,
      marginTop: 2,
      paddingHorizontal: 16,
      paddingVertical: 14,
      gap: 6,
    },
    heroTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 24,
      lineHeight: 30,
      fontFamily: theme.fonts.display,
    },
    heroBody: {
      color: theme.mode === 'light' ? theme.colors.textMuted : 'rgba(245, 247, 250, 0.82)',
      fontSize: 13,
      lineHeight: 20,
      fontWeight: '700',
    },
  });

export default ArtistDashboardScreen;
