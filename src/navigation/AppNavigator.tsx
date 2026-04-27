import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import Login from '../screens/Auth/Login';
import ArtistDashboardScreen from '../screens/Dashboard/ArtistDashboardScreen';
import DealerDashboardScreen from '../screens/Dashboard/DealerDashboardScreen';
import UserDashboardScreen from '../screens/Dashboard/UserDashboardScreen';
import SplashScreen from '../screens/Shared/SplashScreen';
import { markBookingPaidRazorpay } from '../services/bookings';
import { RootStackParamList } from '../types/app';
import { useSessionRouting } from './useSessionRouting';
import { useAppTheme } from '../theme/useAppTheme';

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator = () => {
  const session = useSessionRouting();
  const [bootReady, setBootReady] = useState(false);
  const { theme } = useAppTheme();

  const navigationTheme = useMemo(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        background: theme.colors.background,
        card: theme.colors.surface,
        text: theme.colors.text,
        border: theme.colors.border,
        primary: theme.colors.accent,
      },
    }),
    [theme],
  );

  useEffect(() => {
    const timer = setTimeout(() => setBootReady(true), 1600);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    let lastUrl = '';

    const processPaymentDeepLink = async (url: string) => {
      if (!mounted) return;
      if (!url || url === lastUrl) return;
      lastUrl = url;

      try {
        // Supports:
        // - tatzo-new://payment?...
        // - exp://.../--/payment?...
        const isPayment = /(^|\/|:)payment(\?|$)/.test(url) || url.includes('/--/payment');
        if (!isPayment) return;

        const getParam = (key: string) => {
          const re = new RegExp(`[?&]${key}=([^&]+)`);
          const m = url.match(re);
          return m && m[1] ? decodeURIComponent(m[1]) : '';
        };

        const status = getParam('status');
        if (status && status !== 'success') return;

        const bookingId = getParam('bookingId');
        const orderId = getParam('orderId');
        const paymentId = getParam('paymentId');
        const signature = getParam('signature');

        if (!bookingId || !orderId || !paymentId || !signature) return;

        await markBookingPaidRazorpay({ bookingId, orderId, paymentId, signature });
        Alert.alert('Tatzo', 'Payment verified. Booking request sent to artist.');
      } catch (e: any) {
        Alert.alert('Tatzo', e?.message ?? 'Payment verification failed.');
      }
    };

    const sub = Linking.addEventListener('url', ({ url }) => {
      void processPaymentDeepLink(url);
    });

    void Linking.getInitialURL().then((url) => {
      if (url) void processPaymentDeepLink(url);
    });

    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  // Chill onboarding: show only splash while booting or provisioning profile defaults.
  if (!bootReady || session.status === 'loading' || session.status === 'needsProfile') {
    return (
      <>
        <StatusBar style="light" />
        <SplashScreen />
      </>
    );
  }

  const navigationKey = session.status === 'ready' ? session.route : 'auth';
  const initialRouteName = session.status === 'ready' ? session.route : 'Login';

  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar style="light" />
      <Stack.Navigator
        id="root-stack"
        key={navigationKey}
        initialRouteName={initialRouteName}
        screenOptions={{
          headerShown: false,
          animation: 'fade',
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="UserDashboard" component={UserDashboardScreen} />
        <Stack.Screen name="ArtistDashboard" component={ArtistDashboardScreen} />
        <Stack.Screen name="DealerDashboard" component={DealerDashboardScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
