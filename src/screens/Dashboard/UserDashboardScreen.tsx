import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { collection, doc, getCountFromServer, limit, onSnapshot, orderBy, query, where } from 'firebase/firestore';
import { auth, db } from '../../config/firebaseConfig';
import BottomNavigation, { FeedNavKey } from '../../components/navigation/BottomNavigation';
import ExplorePanel from './panels/ExplorePanel';
import FindArtistPanel from './panels/FindArtistPanel';
import SocioFeedPanel from './panels/SocioFeedPanel';
import TopBar from '../../components/navigation/TopBar';
import NotificationsModal from '../../components/notifications/NotificationsModal';
import ArtistPublicProfileModal from '../../components/profile/ArtistPublicProfileModal';
import BookingFlowModal from '../../components/booking/BookingFlowModal';
import StatusBanner from '../../components/verification/StatusBanner';
import DashboardTourModal from '../../components/onboarding/DashboardTourModal';
import UserProfilePanel from '../../components/user/UserProfilePanel';
import UserBookingsModal from '../../components/user/UserBookingsModal';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { BookingModel, NotificationDoc, UserProfile } from '../../types/app';
import { createResponsiveShadow } from '../../utils/responsiveShadow';
import { cleanupPastPayableBookingsForUser, createTodayBookingReminders, expireStaleArtistResponseBookingsForUser, expireStaleQuotesForUser } from '../../services/bookings';
import { markNotificationReadDual } from '../../services/notifications';
import { consumePendingPaymentReturn, subscribePaymentReturn } from '../../services/paymentReturn';
import { signOutAndCleanup } from '../../services/signout';
import { ANALYTICS_EVENTS, trackAnalyticsEventOnce } from '../../services/analytics/analytics';

type UserTabKey = FeedNavKey;

type SavedPreviewItem = {
  id: string;
  postId: string;
  artistUid: string;
  artistName: string;
  caption?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
};

const normalizeBookingRows = (rows: BookingModel[]) =>
  [...rows].sort((a, b) => {
    const left = String(b.dateISO ?? '');
    const right = String(a.dateISO ?? '');
    return left.localeCompare(right);
  });

const isBookingNotification = (type: string) =>
  [
    'booking_requested',
    'booking_quote_sent',
    'booking_quote_expired',
    'booking_rejected',
    'booking_artist_approved_payment_pending',
    'booking_reminder',
    'final_payment_requested',
    'final_payment_user_marked_paid',
    'final_payment_disputed',
    'final_payment_success',
    'payment_success',
    'booking_confirmed',
    'booking_cancelled',
    'booking_reschedule_requested',
    'booking_reschedule_accepted',
    'booking_reschedule_rejected',
  ].includes(type);

const isBookingBadgeNotification = (type: string) =>
  [
    'booking_quote_sent',
    'booking_quote_expired',
    'booking_rejected',
    'booking_artist_approved_payment_pending',
    'booking_reminder',
    'final_payment_requested',
    'final_payment_user_marked_paid',
    'final_payment_disputed',
    'final_payment_success',
    'payment_success',
    'booking_confirmed',
    'booking_cancelled',
    'booking_reschedule_requested',
    'booking_reschedule_accepted',
    'booking_reschedule_rejected',
  ].includes(type);

const UserDashboardScreen = () => {
  const { theme, toggleMode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [activeTab, setActiveTab] = useState<UserTabKey>('home');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [bookingsOpen, setBookingsOpen] = useState(false);
  const [bookingArtist, setBookingArtist] = useState<any | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [publicArtistUid, setPublicArtistUid] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [bookings, setBookings] = useState<BookingModel[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState<NotificationDoc[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [savedCount, setSavedCount] = useState(0);
  const [savedPreviewItems, setSavedPreviewItems] = useState<SavedPreviewItem[]>([]);
  const [tourOpen, setTourOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [notificationBookingId, setNotificationBookingId] = useState<string | null>(null);
  const [profileEditRequestKey, setProfileEditRequestKey] = useState(0);
  const bookingReadSyncingRef = useRef(false);

  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      doc(db, 'users', uid),
      (snap) => setProfile(snap.exists() ? ({ uid, ...(snap.data() as UserProfile) } as UserProfile) : null),
      () => setProfile(null),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    void expireStaleQuotesForUser({ uid, role: 'user' }).catch(() => {});
    void cleanupPastPayableBookingsForUser(uid).catch(() => {});
    void expireStaleArtistResponseBookingsForUser(uid).catch(() => {});
    void createTodayBookingReminders({ uid, role: 'user' }).catch(() => {});
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'bookings'), where('userUid', '==', uid), orderBy('updatedAt', 'desc'), limit(80));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((row) => ({ id: row.id, ...(row.data() as any) }) as BookingModel);
        setBookings(normalizeBookingRows(rows));
        rows.forEach((booking) => {
          const payment = (booking as any).payment;
          const paymentId = String(payment?.paymentId ?? '').trim();
          if (String(booking.status ?? '') !== 'confirmed' || String(payment?.status ?? '') !== 'paid' || !paymentId) return;
          void trackAnalyticsEventOnce(`booking_purchase_${booking.id}_${paymentId}`, ANALYTICS_EVENTS.PAYMENT_SUCCESS, {
            booking_id: booking.id,
            payment_id: paymentId,
            value: Number(payment?.amount ?? 249),
            currency: String((booking as any).currency ?? 'INR'),
          });
          void trackAnalyticsEventOnce(`booking_confirmed_${booking.id}_${paymentId}`, ANALYTICS_EVENTS.BOOKING_CONFIRMED, {
            booking_id: booking.id,
            payment_id: paymentId,
          });
        });
      },
      () => setBookings([]),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const unreadQuery = query(collection(db, 'users', uid, 'notifications'), where('read', '==', false));
    const unsub = onSnapshot(
      unreadQuery,
      (snap) => {
        const rows = snap.docs.map((row) => ({
          id: row.id,
          ...(row.data() as any),
        })) as NotificationDoc[];
        setUnreadNotifications(rows);
        rows.forEach((item) => {
          if (String(item.type ?? '') !== 'booking_quote_sent') return;
          const bookingId = String(item.bookingId ?? item.entityId ?? '').trim();
          void trackAnalyticsEventOnce(`quote_received_${item.id}`, ANALYTICS_EVENTS.QUOTE_RECEIVED, {
            booking_id: bookingId,
          });
        });
      },
      () => setUnreadNotifications([]),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    let active = true;
    (async () => {
      try {
        const [followingSnap, savedSnap] = await Promise.all([
          getCountFromServer(query(collection(db, 'users', uid, 'following'))),
          getCountFromServer(query(collection(db, 'users', uid, 'savedPosts'))),
        ]);
        if (!active) return;
        setFollowingCount(followingSnap.data().count);
        setSavedCount(savedSnap.data().count);
      } catch {
        if (!active) return;
        setFollowingCount(0);
        setSavedCount(0);
      }
    })();
    return () => {
      active = false;
    };
  }, [uid, bookings.length]);

  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      query(collection(db, 'users', uid, 'savedPosts')),
      (snap) => {
        const rows = snap.docs
          .map((row) => {
            const data = row.data() as any;
            return {
              id: row.id,
              postId: String(data?.postId ?? row.id).trim(),
              artistUid: String(data?.artistUid ?? '').trim(),
              artistName: String(data?.artistName ?? 'Artist').trim() || 'Artist',
              caption: String(data?.caption ?? '').trim() || null,
              imageUrl: String(data?.imageUrl ?? '').trim() || null,
              videoUrl: String(data?.videoUrl ?? '').trim() || null,
            } as SavedPreviewItem;
          })
          .filter((item) => Boolean(item.imageUrl || item.videoUrl))
          .slice(0, 60);
        setSavedPreviewItems(rows);
      },
      () => setSavedPreviewItems([]),
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    AsyncStorage.getItem(`tatzo_tour_seen_user_${uid}`)
      .then((value) => {
        if (value !== 'yes') setTourOpen(true);
      })
      .catch(() => {});
  }, [uid]);

  useEffect(() => {
    const pending = consumePendingPaymentReturn();
    if (pending?.bookingId) {
      openBookingsFromNotification(pending.bookingId);
    }

    const unsubscribe = subscribePaymentReturn((payload) => {
      if (payload?.bookingId) {
        openBookingsFromNotification(payload.bookingId);
      }
    });

    return unsubscribe;
  }, []);

  const notificationCount = useMemo(
    () => unreadNotifications.filter((item) => !isBookingBadgeNotification(String(item.type ?? ''))).length,
    [unreadNotifications],
  );

  const bookingBadgeCount = useMemo(
    () => unreadNotifications.filter((item) => isBookingBadgeNotification(String(item.type ?? ''))).length,
    [unreadNotifications],
  );

  const markUnreadNotificationsRead = async (items: NotificationDoc[]) => {
    if (!uid || !items.length) return;
    await Promise.all(
      items.map((item) => markNotificationReadDual(uid, item.id, true).catch(() => {})),
    );
  };

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      setNotificationsOpen(false);
      setBookingsOpen(false);
      setBookingArtist(null);
      setBookingOpen(false);
      setPublicArtistUid(null);
      setNotificationBookingId(null);
      await signOutAndCleanup({ deleteProfile: false });
    } catch (error) {
      console.error('TATZO sign out failed', error);
      Alert.alert('Tatzo', 'Could not sign out right now. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  };

  const openArtistPublicProfile = (artistUid: string) => {
    const safe = String(artistUid ?? '').trim();
    if (safe) setPublicArtistUid(safe);
  };

  const openBookingFlowFromProfile = (artist: any) => {
    const locationCity = String(profile?.locationCity ?? '').trim();
    const locationArea = String(profile?.locationArea ?? '').trim();
    if (!locationCity || !locationArea) {
      Alert.alert(
        'Add your location',
        'Add your city and area in User Profile before requesting a quote.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Update Profile',
            onPress: () => {
              setPublicArtistUid(null);
              setActiveTab('profile');
              setProfileEditRequestKey((value) => value + 1);
            },
          },
        ],
      );
      return;
    }
    setPublicArtistUid(null);
    setBookingArtist(artist);
    setBookingOpen(true);
  };

  const openBookingsFromNotification = (bookingId?: string | null) => {
    setNotificationsOpen(false);
    setNotificationBookingId(String(bookingId ?? '').trim() || null);
    setBookingsOpen(true);
  };

  const openNotifications = () => {
    setNotificationsOpen(true);
  };

  const handleNotificationPress = (item: NotificationDoc) => {
    const type = String(item.type ?? '');
    if (isBookingNotification(type)) {
      openBookingsFromNotification(item.bookingId ?? item.entityId ?? null);
      return;
    }
    if (type === 'like' || type === 'follow' || type === 'share' || type === 'post_created') {
      setNotificationsOpen(false);
      setActiveTab('home');
      return;
    }
    if (type === 'subscription_update' || type === 'system_message' || type.startsWith('dealer_')) {
      setNotificationsOpen(false);
      setActiveTab('profile');
      return;
    }
    setNotificationsOpen(false);
    setActiveTab('home');
  };

  useEffect(() => {
    if (!bookingsOpen || !unreadNotifications.length || bookingReadSyncingRef.current) return;
    const bookingUnread = unreadNotifications.filter((item) => isBookingBadgeNotification(String(item.type ?? '')));
    if (!bookingUnread.length) return;
    bookingReadSyncingRef.current = true;
    void markUnreadNotificationsRead(bookingUnread).finally(() => {
      bookingReadSyncingRef.current = false;
    });
  }, [bookingsOpen, unreadNotifications]);

  const renderHeader = (title: string, showStatusBanner = true, brandLayout = false) => (
    <>
        <TopBar
          title={title}
          brandLayout={brandLayout}
          onToggleTheme={toggleMode}
        onPressAlerts={openNotifications}
        onPressSecondary={() => setBookingsOpen(true)}
        showSecondary
        showAlerts
        secondaryEmphasis
        secondaryIconName="calendar-outline"
        secondaryBadgeCount={bookingBadgeCount}
        notificationCount={notificationCount}
      />
      {showStatusBanner ? (
        <StatusBanner
          status={profile?.verificationStatus}
          requestedRole={profile?.requestedRole}
          rejectReason={profile?.verificationRejectReason}
          onPressAction={() => setActiveTab('profile')}
        />
      ) : null}
    </>
  );

  const renderShop = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {renderHeader('Shop')}
      <View style={styles.shopCard}>
        <Image source={require('../../../assets/shop-coming-soon-bg.png')} style={styles.shopImage} resizeMode="contain" />
        <Text style={styles.shopTitle}>Tatzo Shop</Text>
        <Text style={styles.shopBody}>Creative supplies and artist essentials are being prepared.</Text>
      </View>
    </ScrollView>
  );

  const mainContent = (() => {
    if (activeTab === 'home') {
      return (
        <SocioFeedPanel
          hideSearchBar
          onOpenArtistProfile={openArtistPublicProfile}
          onExploreArtists={() => setActiveTab('explore')}
          onGetQuote={() => setActiveTab('findArtist')}
          header={renderHeader('Tatzo', false, true)}
        />
      );
    }

    if (activeTab === 'explore') {
      return (
        <ExplorePanel
          onViewArtist={openArtistPublicProfile}
          header={renderHeader('Explore')}
        />
      );
    }

    if (activeTab === 'findArtist') {
      return (
        <FindArtistPanel
          onViewArtist={openArtistPublicProfile}
          viewerProfile={profile}
          header={
            <>
              {renderHeader('Find Artist')}
              <LinearGradient colors={theme.gradients.dark} style={styles.heroCard}>
                <Text style={styles.heroTitle}>Booking Focused</Text>
                <Text style={styles.heroBody}>Open profiles, check availability, and book faster.</Text>
              </LinearGradient>
            </>
          }
        />
      );
    }

    if (activeTab === 'profile') {
      return (
        <UserProfilePanel
          header={renderHeader('Profile')}
          profile={profile}
          bookingCount={bookings.length}
          followingCount={followingCount}
          savedCount={savedCount}
          recentBookings={bookings}
          savedItems={savedPreviewItems}
          onOpenArtistProfile={openArtistPublicProfile}
          onOpenBookingDetail={openBookingsFromNotification}
          onOpenBookings={() => setBookingsOpen(true)}
          onOpenNotifications={openNotifications}
          onSignOut={handleSignOut}
          openEditRequestKey={profileEditRequestKey}
        />
      );
    }

    return renderShop();
  })();

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={theme.gradients.canvas} style={styles.container}>
        {mainContent}

        <NotificationsModal
          visible={notificationsOpen}
          uid={uid}
          onClose={() => setNotificationsOpen(false)}
          onPressItem={handleNotificationPress}
        />
        <UserBookingsModal
          visible={bookingsOpen}
          bookings={bookings}
          onClose={() => {
            setBookingsOpen(false);
            setNotificationBookingId(null);
          }}
          onOpenFindArtist={() => setActiveTab('findArtist')}
          initialBookingId={notificationBookingId}
        />
        <ArtistPublicProfileModal
          visible={Boolean(publicArtistUid)}
          artistUid={publicArtistUid}
          onClose={() => setPublicArtistUid(null)}
          onBook={openBookingFlowFromProfile}
        />
        {bookingArtist ? (
          <BookingFlowModal
            visible={bookingOpen}
            artist={bookingArtist}
            onClose={() => {
              setBookingOpen(false);
              setBookingArtist(null);
            }}
          />
        ) : null}
        <DashboardTourModal
          visible={tourOpen}
          role="user"
          onDone={() => {
            if (uid) AsyncStorage.setItem(`tatzo_tour_seen_user_${uid}`, 'yes').catch(() => {});
            setTourOpen(false);
          }}
        />
        <BottomNavigation activeKey={activeTab} onChange={setActiveTab} />
      </LinearGradient>
    </SafeAreaView>
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
    heroCard: {
      marginHorizontal: 18,
      marginTop: 6,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
      ...createResponsiveShadow({
        web: theme.mode === 'light' ? '0px 16px 30px rgba(8, 18, 32, 0.08)' : '0px 16px 30px rgba(8, 18, 32, 0.2)',
        native: {
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: theme.mode === 'light' ? 0.08 : 0.14,
          shadowRadius: 20,
          elevation: 6,
        },
      }),
    },
    heroTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.heading,
      fontWeight: '800',
    },
    heroBody: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.caption,
      lineHeight: 16,
    },
    heroActions: {
      flexDirection: 'row',
      gap: 10,
      marginTop: 0,
    },
    heroPrimaryBtn: {
      flex: 1,
      minHeight: 38,
      borderRadius: 14,
      backgroundColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroPrimaryText: {
      color: theme.colors.textInverse,
      fontSize: theme.typography.body,
      fontWeight: '800',
    },
    heroSecondaryBtn: {
      flex: 1,
      minHeight: 38,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroSecondaryText: {
      color: theme.colors.accent,
      fontSize: theme.typography.body,
      fontWeight: '800',
    },
    scrollContent: {
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: 120,
      gap: 16,
    },
    shopCard: {
      borderRadius: 26,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      padding: 14,
      gap: 10,
      alignItems: 'center',
      marginTop: 8,
      ...createResponsiveShadow({
        web: theme.mode === 'light' ? '0px 14px 26px rgba(8, 18, 32, 0.1)' : '0px 14px 26px rgba(8, 18, 32, 0.22)',
        native: {
          shadowColor: theme.colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: theme.mode === 'light' ? 0.1 : 0.16,
          shadowRadius: 18,
          elevation: 7,
        },
      }),
    },
    shopImage: {
      width: '100%',
      height: 240,
      borderRadius: 20,
    },
    shopTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.heading,
      fontWeight: '800',
      alignSelf: 'flex-start',
    },
    shopBody: {
      color: theme.colors.textMuted,
      fontSize: theme.typography.body,
      lineHeight: 20,
      alignSelf: 'flex-start',
    },
  });

export default UserDashboardScreen;
