import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import Login from '../screens/Auth/Login';
import ArtistDashboardScreen from '../screens/Dashboard/ArtistDashboardScreen';
import DealerDashboardScreen from '../screens/Dashboard/DealerDashboardScreen';
import RoleSelectScreen from '../screens/Dashboard/RoleSelectScreen';
import UserDashboardScreen from '../screens/Dashboard/UserDashboardScreen';
import SplashScreen from '../screens/Shared/SplashScreen';
import { markBookingPaidRazorpay, markFinalPaymentPaidRazorpay } from '../services/bookings';
import {
  markSubscriptionPaidRazorpay,
  markSubscriptionPaymentCancelled,
  markSubscriptionPaymentFailed,
} from '../services/subscription';
import { emitPaymentReturn, type PaymentReturnPayload } from '../services/paymentReturn';
import { RootStackParamList } from '../types/app';
import { useSessionRouting } from './useSessionRouting';
import { useAppTheme } from '../theme/useAppTheme';
import { ANALYTICS_EVENTS, identifyAnalyticsUser, trackAnalyticsEventOnce } from '../services/analytics/analytics';

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator = () => {
  const session = useSessionRouting();
  const [bootReady, setBootReady] = useState(false);
  const { theme } = useAppTheme();

  useEffect(() => {
    if (session.status !== 'ready') return;
    const role = session.profile.role === 'artist' ? 'artist' : 'user';
    void identifyAnalyticsUser(session.user.uid, {
      user_role: role,
      verification_status: String(session.profile.verificationStatus ?? 'unsubmitted'),
      founding_plan: String((session.profile as any).plan ?? (session.profile as any).foundingPlan ?? '') || null,
      launch_city_cohort: String(session.profile.locationCity ?? '').trim().toLowerCase() === 'chennai' ? 'chennai' : 'other',
    });
    if (role === 'artist' && session.profile.verificationStatus === 'approved') {
      void trackAnalyticsEventOnce(
        `artist_verification_approved_${session.user.uid}`,
        ANALYTICS_EVENTS.ARTIST_VERIFICATION_APPROVED,
        { artist_id: session.user.uid },
      );
    }
  }, [session]);

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
        const flow = (getParam('flow') || 'booking') as NonNullable<PaymentReturnPayload['flow']>;
        const uid = getParam('uid');

        if (flow === 'subscription') {
          if (status === 'cancelled') {
            await markSubscriptionPaymentCancelled({ uid, reason: 'Payment cancelled by user.' });
            Alert.alert('Tatzo', 'Subscription payment cancelled. You can retry from Profile.');
            return;
          }

          if (status && status !== 'success') {
            await markSubscriptionPaymentFailed({ uid, reason: 'Payment failed. Please retry.' });
            Alert.alert('Tatzo', 'Subscription payment failed. Retry from Profile.');
            return;
          }
        } else if (status && status !== 'success') {
          return;
        }

        const orderId = getParam('orderId');
        const paymentId = getParam('paymentId');
        const signature = getParam('signature');

        if (!orderId || !paymentId || !signature) return;

        if (flow === 'subscription') {
          await markSubscriptionPaidRazorpay({
            uid,
            orderId,
            paymentId,
            signature,
          });
          Alert.alert('Tatzo', 'Payment verified. Pro is active now.');
          return;
        }

        const bookingId = getParam('bookingId');
        if (!bookingId) return;

        if (flow === 'final_payment') {
          await markFinalPaymentPaidRazorpay({ bookingId, orderId, paymentId, signature });
          emitPaymentReturn({ bookingId, flow, orderId, paymentId, signature, status: 'success' });
          Alert.alert('Tatzo', 'Final payment verified. Booking completed.');
          return;
        }

        await markBookingPaidRazorpay({ bookingId, orderId, paymentId, signature });
        await trackAnalyticsEventOnce(`booking_purchase_${bookingId}_${paymentId}`, ANALYTICS_EVENTS.PAYMENT_SUCCESS, {
          booking_id: bookingId,
          payment_id: paymentId,
          value: 249,
          currency: 'INR',
        });
        await trackAnalyticsEventOnce(`booking_confirmed_${bookingId}_${paymentId}`, ANALYTICS_EVENTS.BOOKING_CONFIRMED, {
          booking_id: bookingId,
          payment_id: paymentId,
        });
        emitPaymentReturn({ bookingId, flow, orderId, paymentId, signature, status: 'success' });
        Alert.alert('Tatzo', 'Payment verified. Booking confirmed.');
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

  // Show splash only while booting/auth is genuinely loading. Never hold needsProfile here.
  if (!bootReady || session.status === 'loading') {
    return (
      <>
        <StatusBar style="light" />
        <SplashScreen onPlaybackEnd={() => setBootReady(true)} />
      </>
    );
  }

  const navigationKey = session.status === 'ready' ? session.route : 'auth';
  const initialRouteName = session.status === 'ready' ? session.route : 'RoleSelect';

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
        <Stack.Screen name="RoleSelect" component={RoleSelectScreen} />
        <Stack.Screen name="Login" component={Login} />
        <Stack.Screen name="UserDashboard" component={UserDashboardScreen} />
        <Stack.Screen name="ArtistDashboard" component={ArtistDashboardScreen} />
        <Stack.Screen name="DealerDashboard" component={DealerDashboardScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;



