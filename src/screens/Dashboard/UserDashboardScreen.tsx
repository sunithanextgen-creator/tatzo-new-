import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { auth, db } from '../../config/firebaseConfig';
import { doc, onSnapshot } from 'firebase/firestore';
import { signOutAndCleanup } from '../../services/signout';
import { createResponsiveShadow } from '../../utils/responsiveShadow';
import BottomNavigation, { FeedNavKey } from '../../components/navigation/BottomNavigation';
import ExplorePanel from './panels/ExplorePanel';
import TopBar from '../../components/navigation/TopBar';
import NotificationsModal from '../../components/notifications/NotificationsModal';
import ProfileModal from '../../components/profile/ProfileModal';
import BookingFlowModal from '../../components/booking/BookingFlowModal';
import { useAppTheme } from '../../theme/useAppTheme';
import { brand } from '../../theme/brand';
import type { AppTheme } from '../../theme/theme';
import type { UserProfile } from '../../types/app';
import { dummyArtists } from '../../data/dummyArtists';
import SocioFeedPanel from './panels/SocioFeedPanel';
import FindArtistPanel from './panels/FindArtistPanel';
import StatusBanner from '../../components/verification/StatusBanner';

const FIND_ARTIST_CARDS = dummyArtists.slice(0, 8);

const LEARNING_MODULES = [
  { title: 'Aftercare basics', detail: 'Simple healing reminders for every session' },
  { title: 'Style guides', detail: 'Understand linework, shading, and placement' },
  { title: 'Booking etiquette', detail: 'Prepare before consults and studio visits' },
];

const SHOP_CARDS = [
  { title: 'Aftercare essentials', detail: 'Liners, balms, and healing kits' },
  { title: 'Tattoo machines', detail: 'Premium gear for studio partners' },
  { title: 'Stencil supplies', detail: 'Transfer sheets and setup tools' },
];

type FeedPanelKey = FeedNavKey;

const UserDashboardScreen = () => {
  const { theme, mode, toggleMode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const [activeTab, setActiveTab] = useState<FeedPanelKey>('home');
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [bookingArtist, setBookingArtist] = useState<(typeof dummyArtists)[number] | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  
  useEffect(() => {
    const uidNow = auth.currentUser?.uid;
    if (!uidNow) return;

    const unsub = onSnapshot(
      doc(db, 'users', uidNow),
      (snap) => {
        setUserProfile(snap.exists() ? (snap.data() as UserProfile) : null);
      },
      () => {
        setUserProfile(null);
      },
    );

    return () => unsub();
  }, []);
  const feedTitle = useMemo(() => {
    switch (activeTab) {
      case 'explore':
        return 'Discover styles and trends.';
      case 'findArtist':
        return 'Pick the right artist.';
      case 'learning':
        return 'Learn before you book.';
      case 'shop':
        return 'Tools, supplies, and aftercare.';
      default:
        return 'Tap through discovery, artists, learning, and shop.';
    }
  }, [activeTab]);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      await signOutAndCleanup({ deleteProfile: false });
    } catch (error) {
      console.error('TATZO: sign out failed', error);
      Alert.alert('Tatzo', 'Could not sign out right now. Please try again.');
    } finally {
      setIsSigningOut(false);
    }
  };

  const handleTopAction = (label: string) => {
    Alert.alert('Tatzo', `${label} opens next.`);
  };

  const handleProfilePress = () => setProfileOpen(true);

  const renderContent = () => {
    switch (activeTab) {
      case 'findArtist':
        return (
          <View style={styles.sectionStack}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Find Artist</Text>
              <Text style={styles.sectionBadge}>Dummy</Text>
            </View>
            <View style={styles.sectionList}>
              {FIND_ARTIST_CARDS.map((artist, index) => (
                <View key={artist.id} style={styles.listCard}>
                  <View style={styles.artistCardRow}>
                    <View style={styles.artistRank}>
                      <Text style={styles.artistRankText}>{index + 1}</Text>
                    </View>
                    <View style={styles.artistCardCopy}>
                      <Text style={styles.listTitle}>{artist.name}</Text>
                      <Text style={styles.listDetail}>
                        {artist.specialty} | {artist.location}
                      </Text>
                      <Text style={styles.artistNote}>{artist.status}</Text>
                    </View>
                  </View>
                  <TouchableOpacity activeOpacity={0.85} style={styles.artistButton}>
                    <Text style={styles.artistButtonText}>Open profile</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        );

      case 'learning':
        return (
          <View style={styles.sectionStack}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Learning</Text>
              <Text style={styles.sectionBadge}>Guide</Text>
            </View>
            <View style={styles.sectionList}>
              {LEARNING_MODULES.map((module) => (
                <View key={module.title} style={styles.listCard}>
                  <Text style={styles.listTitle}>{module.title}</Text>
                  <Text style={styles.listDetail}>{module.detail}</Text>
                </View>
              ))}
            </View>
          </View>
        );

      case 'shop':
        return (
          <View style={styles.sectionStack}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Shop preview</Text>
              <Text style={styles.sectionBadge}>B2B</Text>
            </View>
            <View style={styles.sectionList}>
              {SHOP_CARDS.map((item) => (
                <View key={item.title} style={styles.listCard}>
                  <Text style={styles.listTitle}>{item.title}</Text>
                  <Text style={styles.listDetail}>{item.detail}</Text>
                </View>
              ))}
            </View>
          </View>
        );

      case 'home':
      default:
        return (
          <View style={styles.sectionStack}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Shortcuts</Text>
              <Text style={styles.sectionBadge}>Hub</Text>
            </View>
            <View style={styles.hubGrid}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => setActiveTab('explore')} style={styles.hubCard}>
                <LinearGradient colors={[brand.electricNeonBlue, brand.cyberPurple, brand.electricNeonBlue]} style={styles.hubGlow} />
                <Text style={styles.hubTitle}>Explore</Text>
                <Text style={styles.hubBody}>Search styles and artists.</Text>
              </TouchableOpacity>
              <TouchableOpacity activeOpacity={0.9} onPress={() => setActiveTab('findArtist')} style={styles.hubCard}>
                <LinearGradient colors={[brand.cyberPurple, brand.electricNeonBlue, brand.cyberPurple]} style={styles.hubGlow} />
                <Text style={styles.hubTitle}>Find Artist</Text>
                <Text style={styles.hubBody}>Open profiles and book.</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
    }
  };

  if (activeTab === 'home') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient colors={theme.gradients.canvas} style={styles.container}>
          <SocioFeedPanel
            header={
              <>
                <TopBar
                  title="Socio Hub"
                  onToggleTheme={toggleMode}
                  onPressAlerts={() => setNotificationsOpen(true)}
                  onPressProfile={handleProfilePress}
                />
                <LinearGradient colors={theme.gradients.dark} style={styles.heroCard}>
                  <Text style={styles.heroTitle}>Socio Hub</Text>
                  <Text style={styles.heroBody}>A clean feed for discovery. Images will connect next.</Text>
                </LinearGradient>
                <StatusBanner
                  status={userProfile?.verificationStatus}
                  requestedRole={userProfile?.requestedRole}
                  rejectReason={userProfile?.verificationRejectReason}
                  onPressAction={() => setProfileOpen(true)}
                />
              </>
            }
          />
          <NotificationsModal
            visible={notificationsOpen}
            uid={auth.currentUser?.uid ?? null}
            onClose={() => setNotificationsOpen(false)}
          />
          <ProfileModal
            visible={profileOpen}
            onClose={() => setProfileOpen(false)}
            onSignOut={handleSignOut}
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
          <BottomNavigation activeKey={activeTab} onChange={setActiveTab} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  if (activeTab === 'explore') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient colors={theme.gradients.canvas} style={styles.container}>
          <ExplorePanel
            header={
              <>
                <TopBar
                  title="Socio Hub"
                  onToggleTheme={toggleMode}
                  onPressAlerts={() => setNotificationsOpen(true)}
                  onPressProfile={handleProfilePress}
                />

                <LinearGradient colors={theme.gradients.dark} style={styles.heroCard}>
                  <Text style={styles.heroTitle}>{feedTitle}</Text>
                  <Text style={styles.heroBody}>Search and preview artists before you book.</Text>
                </LinearGradient>
                <StatusBanner
                  status={userProfile?.verificationStatus}
                  requestedRole={userProfile?.requestedRole}
                  rejectReason={userProfile?.verificationRejectReason}
                  onPressAction={() => setProfileOpen(true)}
                />
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Search</Text>
                  <Text style={styles.sectionBadge}>Grid</Text>
                </View>
              </>
            }
          />

          <NotificationsModal
            visible={notificationsOpen}
            uid={auth.currentUser?.uid ?? null}
            onClose={() => setNotificationsOpen(false)}
          />
          <ProfileModal
            visible={profileOpen}
            onClose={() => setProfileOpen(false)}
            onSignOut={handleSignOut}
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
          <BottomNavigation activeKey={activeTab} onChange={setActiveTab} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  if (activeTab === 'findArtist') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient colors={theme.gradients.canvas} style={styles.container}>
          <FindArtistPanel
            header={
              <>
                <TopBar
                  title="Socio Hub"
                  onToggleTheme={toggleMode}
                  onPressAlerts={() => setNotificationsOpen(true)}
                  onPressProfile={handleProfilePress}
                />
                <LinearGradient colors={theme.gradients.dark} style={styles.heroCard}>
                  <Text style={styles.heroTitle}>Find Artist</Text>
                  <Text style={styles.heroBody}>Search by location and style. Chennai is selected by default.</Text>
                </LinearGradient>
                <StatusBanner
                  status={userProfile?.verificationStatus}
                  requestedRole={userProfile?.requestedRole}
                  rejectReason={userProfile?.verificationRejectReason}
                  onPressAction={() => setProfileOpen(true)}
                />
              </>
            }
            onBook={(artist) => {
              setBookingArtist(artist);
              setBookingOpen(true);
            }}
          />
          <NotificationsModal
            visible={notificationsOpen}
            uid={auth.currentUser?.uid ?? null}
            onClose={() => setNotificationsOpen(false)}
          />
          <ProfileModal
            visible={profileOpen}
            onClose={() => setProfileOpen(false)}
            onSignOut={handleSignOut}
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
          <BottomNavigation activeKey={activeTab} onChange={setActiveTab} />
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={theme.gradients.canvas} style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <TopBar
            title="Socio Hub"
            onToggleTheme={toggleMode}
            onPressAlerts={() => handleTopAction('Notifications')}
            onPressProfile={handleProfilePress}
          />

          <LinearGradient colors={theme.gradients.dark} style={styles.heroCard}>
            <Text style={styles.heroTitle}>Socio Hub</Text>
            <Text style={styles.heroBody}>
              Explore and find artists. We will add posts once uploads are connected.
            </Text>
          </LinearGradient>

          {renderContent()}
        </ScrollView>

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
    scrollContent: {
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 20,
      gap: 18,
    },
    hubGrid: {
      flexDirection: 'row',
      gap: 12,
    },
    hubCard: {
      flex: 1,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      overflow: 'hidden',
      gap: 8,
      ...createResponsiveShadow({
        web: theme.mode === 'light' ? '0px 14px 26px rgba(5, 10, 20, 0.12)' : '0px 14px 26px rgba(5, 10, 20, 0.22)',
        native: {
          shadowColor: theme.mode === 'light' ? 'rgba(5, 10, 20, 0.18)' : theme.colors.shadow,
          shadowOffset: { width: 0, height: 14 },
          shadowOpacity: theme.mode === 'light' ? 0.12 : 0.22,
          shadowRadius: 26,
          elevation: 7,
        },
      }),
    },
    hubGlow: {
      position: 'absolute',
      top: -40,
      right: -60,
      width: 180,
      height: 180,
      borderRadius: 90,
      opacity: theme.mode === 'light' ? 0.22 : 0.26,
    },
    hubTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 18,
      fontFamily: theme.fonts.display,
    },
    hubBody: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      maxWidth: 140,
    },
    heroCard: {
      borderRadius: 30,
      padding: 22,
      gap: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      ...createResponsiveShadow({
        web: theme.mode === 'light' ? '0px 16px 28px rgba(5, 10, 20, 0.12)' : '0px 16px 28px rgba(5, 10, 20, 0.22)',
        native: {
          shadowColor: theme.mode === 'light' ? 'rgba(5, 10, 20, 0.18)' : theme.colors.shadow,
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: theme.mode === 'light' ? 0.12 : 0.22,
          shadowRadius: 28,
          elevation: 8,
        },
      }),
    },
    heroTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 28,
      lineHeight: 34,
      fontFamily: theme.fonts.display,
    },
    heroBody: {
      color: theme.mode === 'light' ? theme.colors.textMuted : 'rgba(245, 247, 250, 0.78)',
      fontSize: 14,
      lineHeight: 22,
      maxWidth: 320,
    },
    sectionStack: {
      gap: 14,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    sectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 20,
      fontFamily: theme.fonts.display,
    },
    sectionBadge: {
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
    sectionList: {
      gap: 12,
    },
    listCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 22,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 10,
    },
    artistCardRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
    },
    artistRank: {
      width: 34,
      height: 34,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.22)' : 'rgba(122, 92, 255, 0.3)',
    },
    artistRankText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontWeight: '800',
      fontSize: 13,
    },
    artistCardCopy: {
      flex: 1,
      gap: 4,
    },
    listTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 16,
      fontWeight: '800',
    },
    listDetail: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    artistNote: {
      color: theme.mode === 'light' ? theme.colors.textMuted : 'rgba(237, 229, 255, 0.9)',
      fontSize: 12,
      fontWeight: '700',
    },
    artistButton: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      paddingHorizontal: 14,
      paddingVertical: 9,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(255, 255, 255, 0.06)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    artistButtonText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '700',
    },
    signOutInline: {
      alignSelf: 'center',
      marginTop: 6,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(255, 255, 255, 0.06)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    signOutInlineText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
    },
  });

export default UserDashboardScreen;








