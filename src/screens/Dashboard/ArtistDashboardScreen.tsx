import React, { useMemo, useState } from 'react';
import { SafeAreaView, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth } from '../../config/firebaseConfig';
import TopBar from '../../components/navigation/TopBar';
import NotificationsModal from '../../components/notifications/NotificationsModal';
import ProfileModal from '../../components/profile/ProfileModal';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import { signOutAndCleanup } from '../../services/signout';
import ArtistBottomNavigation, { ArtistNavKey } from '../../components/navigation/ArtistBottomNavigation';
import ArtistFeedPanel from './panels/ArtistFeedPanel';
import ArtistAcademyPanel from './panels/ArtistAcademyPanel';
import ArtistShopPanel from './panels/ArtistShopPanel';
import ArtistBookingsPanel from './panels/ArtistBookingsPanel';
import ArtistCalendarPanel from './panels/ArtistCalendarPanel';

const ArtistDashboardScreen = () => {
  const { theme, toggleMode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [activeTab, setActiveTab] = useState<ArtistNavKey>('bookings');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const uid = auth.currentUser?.uid ?? null;

  const title = useMemo(() => {
    if (activeTab === 'feed') return 'Socio Studio';
    if (activeTab === 'bookings') return 'Bookings';
    if (activeTab === 'calendar') return 'Calendar';
    if (activeTab === 'shop') return 'Shop';
    return 'Academy';
  }, [activeTab]);

  const header = (
    <TopBar
      title={title}
      onToggleTheme={toggleMode}
      onPressAlerts={() => setNotificationsOpen(true)}
      onPressProfile={() => setProfileOpen(true)}
    />
  );

  const onSignOut = () => signOutAndCleanup({ deleteProfile: false });

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={theme.gradients.canvas} style={styles.container}>
        <NotificationsModal visible={notificationsOpen} uid={uid} onClose={() => setNotificationsOpen(false)} />
        <ProfileModal visible={profileOpen} onClose={() => setProfileOpen(false)} onSignOut={onSignOut} />

        {activeTab === 'feed' ? <ArtistFeedPanel header={header} /> : null}
        {activeTab === 'bookings' ? <ArtistBookingsPanel header={header} /> : null}
        {activeTab === 'calendar' ? <ArtistCalendarPanel header={header} /> : null}
        {activeTab === 'shop' ? <ArtistShopPanel /> : null}
        {activeTab === 'academy' ? <ArtistAcademyPanel /> : null}

        <ArtistBottomNavigation activeKey={activeTab} onChange={setActiveTab} />
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
  });

export default ArtistDashboardScreen;

