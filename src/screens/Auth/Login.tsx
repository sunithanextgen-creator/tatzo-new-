import React, { useMemo, useState } from 'react';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../config/firebaseConfig';
import { resolveDashboardRoute, isUserRole, resolveEffectiveRole } from '../../navigation/routeResolver';
import { RootStackParamList, UserRole } from '../../types/app';
import { syncUserProfile } from '../../services/userProfile';
import { createResponsiveShadow } from '../../utils/responsiveShadow';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import { ANALYTICS_EVENTS, identifyAnalyticsUser, trackAnalyticsEvent } from '../../services/analytics/analytics';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TATZO_ROLE_LOGO = require('../../../assets/tatzo-role-logo.png');

const Login = () => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const accentGradient = theme.gradients.accent;

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const route = useRoute<RouteProp<RootStackParamList, 'Login'>>();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const signUpRole = route.params?.role ?? 'user';
  const isArtistRole = signUpRole === 'artist';
  const roleLabel = isArtistRole ? 'Artist' : 'User';
  const titleText = isArtistRole ? 'Welcome Artist' : 'Welcome to Tatzo';
  const subtitleText = isArtistRole ? 'Showcase your work and manage bookings' : 'Find your next tattoo artist';
  const primaryActionText = isSignUp ? `Create ${roleLabel} Account` : `Login as ${roleLabel}`;
  const secondaryToggleText = isSignUp ? 'Already have an account? Login' : `Create ${roleLabel} Account`;
  const oppositeRole = isArtistRole ? 'user' : 'artist';
  const roleSwitchText = isArtistRole ? 'Are you a user? Login as User' : 'Are you an artist? Login as Artist';

  const goToDashboard = (role: UserRole) => {
    navigation.reset({ index: 0, routes: [{ name: resolveDashboardRoute(role) }] });
  };

  const isValidEmail = (value: string) => emailPattern.test(value.trim());

  const getPasswordStrengthError = (value: string) => {
    if (value.length < 8) return 'Password must be at least 8 characters long.';
    if (!/[A-Z]/.test(value)) return 'Add at least one uppercase letter.';
    if (!/[a-z]/.test(value)) return 'Add at least one lowercase letter.';
    if (!/[0-9]/.test(value)) return 'Add at least one number.';
    if (!/[^A-Za-z0-9]/.test(value)) return 'Add at least one special character.';
    return null;
  };

  const getErrorMessage = (code: string) => {
    const messages = {
      'auth/email-already-in-use': 'This email already has an account.',
      'auth/invalid-email': 'Enter a valid email address.',
      'auth/weak-password': 'Use a stronger password with 8+ characters, numbers, and symbols.',
      'auth/wrong-password': 'The password does not match this account.',
      'auth/user-not-found': 'No account was found for this email.',
      'auth/invalid-credential': 'Invalid email or password. Please check your credentials.',
      'auth/operation-not-allowed': 'Email/password sign-in is not enabled in Firebase.',
      'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
      'auth/network-request-failed': 'Network error. Check your internet connection and try again.',
    };

    return messages[code as keyof typeof messages] || 'Authentication failed. Please try again.';
  };


  const openForgotPassword = () => {
    setResetEmail(email.trim());
    setResetOpen(true);
  };

  const handleForgotPassword = async () => {
    const trimmed = resetEmail.trim();

    if (!trimmed) {
      Alert.alert('Tatzo', 'Enter your email to reset your password.');
      return;
    }

    if (!isValidEmail(trimmed)) {
      Alert.alert('Tatzo', 'Enter a valid email address.');
      return;
    }

    setResetLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmed);
      setResetOpen(false);
      Alert.alert('Tatzo', 'Password reset link sent. Please check your email inbox.');
    } catch (error: any) {
      Alert.alert('Tatzo', getErrorMessage(error?.code));
    } finally {
      setResetLoading(false);
    }
  };
  const handleAuth = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      Alert.alert('Tatzo', 'Fill in your email and password to continue.');
      return;
    }

    if (!isValidEmail(trimmedEmail)) {
      Alert.alert('Tatzo', 'Enter a valid email address.');
      return;
    }

    setIsLoading(true);

    try {
      if (isSignUp) {
        if (!fullName.trim()) {
          Alert.alert('Tatzo', 'Enter your name to create your profile.');
          return;
        }

        if (password !== confirmPassword) {
          Alert.alert('Tatzo', 'Password confirmation does not match.');
          return;
        }

        const passwordStrengthError = getPasswordStrengthError(password);
        if (passwordStrengthError) {
          Alert.alert('Tatzo', passwordStrengthError);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        await updateProfile(userCredential.user, { displayName: fullName.trim() });

        try {
          await syncUserProfile(userCredential.user, {
            displayName: fullName.trim(),
            role: signUpRole,
            setupComplete: true,
            requestedRole: null,
            verificationStatus: 'unsubmitted',
            subscriptionStatus: 'inactive',
            subscriptionPaymentStatus: 'idle',
            subscriptionVerificationStatus: 'failed',
            subscriptionLastError: '',
            isProfileComplete: false,
            locationCity: '',
            locationArea: '',
            createdAt: serverTimestamp(),
          });
        } catch (error: any) {
          console.error('TATZO: sign-up profile sync failed', error);
          if (error?.code === 'permission-denied') {
            Alert.alert('Tatzo', 'Database access is blocked. Please check Firestore rules.');
            return;
          }
        }

        const createdRole = signUpRole === 'artist' ? 'artist' : 'user';
        await identifyAnalyticsUser(userCredential.user.uid, {
          user_role: createdRole,
          verification_status: 'unsubmitted',
          founding_plan: null,
          launch_city_cohort: 'unknown',
        });
        await trackAnalyticsEvent(
          createdRole === 'artist' ? ANALYTICS_EVENTS.ARTIST_SIGNUP : ANALYTICS_EVENTS.SIGNUP,
          { method: 'email_password', user_role: createdRole },
        );
        goToDashboard(signUpRole as UserRole);
        return;
      }

      const userCredential = await signInWithEmailAndPassword(auth, trimmedEmail, password);

      let profileSnapshot: any;
      try {
        profileSnapshot = await getDoc(doc(db, 'users', userCredential.user.uid));
      } catch (readError: any) {
        if (readError?.code === 'permission-denied') {
          Alert.alert('Tatzo', 'Database access is blocked. Please check Firestore rules.');
          return;
        }
        throw readError;
      }

      if (!profileSnapshot.exists()) {
        await signOut(auth);
        Alert.alert('Tatzo', 'This account is not registered yet. Please sign up first.');
        return;
      }

      const profile = profileSnapshot.data() as { setupComplete?: boolean; role?: UserRole; verificationStatus?: any } | undefined;
      if (profile?.setupComplete && isUserRole(profile.role)) {
        const effectiveRole = resolveEffectiveRole({
          role: profile.role,
          verificationStatus: profile.verificationStatus,
        });
        goToDashboard(effectiveRole);
        return;
      }
    } catch (error: any) {
      if (error?.code === 'permission-denied') {
        Alert.alert('Tatzo', 'Database access is blocked. Please check Firestore rules.');
        return;
      }

      Alert.alert('Tatzo', getErrorMessage(error.code));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.backgroundGlowTop} />
      <View style={styles.backgroundGlowBottom} />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardWrap}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.brandBlock}>
            <Image source={TATZO_ROLE_LOGO} style={styles.logoImage} resizeMode="contain" />
            <Text style={styles.headline}>{titleText}</Text>
            <Text style={styles.subheadline}>{subtitleText}</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.segmentRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setIsSignUp(false)}
                style={[styles.segmentButton, !isSignUp && styles.segmentButtonActive]}
              >
                <Text style={[styles.segmentText, !isSignUp && styles.segmentTextActive]}>Log in</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => setIsSignUp(true)}
                style={[styles.segmentButton, isSignUp && styles.segmentButtonActive]}
              >
                <Text style={[styles.segmentText, isSignUp && styles.segmentTextActive]}>Sign up</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                id="email"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder={isArtistRole ? 'artist@tatzo.com' : 'you@email.com'}
                placeholderTextColor={theme.colors.textMuted}
                style={styles.input}
                value={email}
              />
            </View>

            {isSignUp ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  id="full-name"
                  autoCapitalize="words"
                  autoCorrect={false}
                  onChangeText={setFullName}
                  placeholder="Your full name"
                  placeholderTextColor={theme.colors.textMuted}
                  style={styles.input}
                  value={fullName}
                />
              </View>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.inputRow}>
                <TextInput
                  id="password"
                  onChangeText={setPassword}
                  placeholder="Enter your password"
                  placeholderTextColor={theme.colors.textMuted}
                  secureTextEntry={!showPassword}
                  style={[styles.input, styles.inputFlex]}
                  value={password}
                />
                <TouchableOpacity activeOpacity={0.9} onPress={() => setShowPassword((prev) => !prev)} style={styles.eyeBtn}>
                  <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
              {isSignUp ? <Text style={styles.helperText}>Use 8+ characters with uppercase, lowercase, number, and a symbol.</Text> : null}
            </View>

            {isSignUp ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirm password</Text>
                <View style={styles.inputRow}>
                  <TextInput
                    id="confirm-password"
                    onChangeText={setConfirmPassword}
                    placeholder="Repeat your password"
                    placeholderTextColor={theme.colors.textMuted}
                    secureTextEntry={!showConfirmPassword}
                    style={[styles.input, styles.inputFlex]}
                    value={confirmPassword}
                  />
                  <TouchableOpacity activeOpacity={0.9} onPress={() => setShowConfirmPassword((prev) => !prev)} style={styles.eyeBtn}>
                    <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}

            {!isSignUp ? (
              <TouchableOpacity activeOpacity={0.85} onPress={openForgotPassword} style={styles.forgotLink}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity activeOpacity={0.9} disabled={isLoading} onPress={handleAuth} style={styles.ctaWrap}>
              <LinearGradient colors={accentGradient} style={styles.ctaButton}>
                {isLoading ? (
                  <ActivityIndicator color={theme.colors.textInverse} />
                ) : (
                  <Text style={styles.ctaText}>{primaryActionText}</Text>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.8} onPress={() => setIsSignUp((prev) => !prev)} style={styles.switchLink}>
              <Text style={styles.switchLinkText}>
                {secondaryToggleText}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.replace('Login', { role: oppositeRole })}
              style={styles.roleSwitchLink}
            >
              <Text style={styles.roleSwitchText}>{roleSwitchText}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Modal visible={resetOpen} transparent animationType="fade" onRequestClose={() => setResetOpen(false)}>
        <Pressable style={styles.resetBackdrop} onPress={() => setResetOpen(false)} />
        <View style={styles.resetSheet}>
          <View style={styles.resetHeader}>
            <Text style={styles.resetTitle}>Reset password</Text>
            <Pressable onPress={() => setResetOpen(false)} style={styles.resetClose}>
              <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
            </Pressable>
          </View>

          <View style={styles.resetBody}>
            <Text style={styles.resetCopy}>We'll send a password reset link to your email.</Text>
            <TextInput
              id="reset-email"
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              onChangeText={setResetEmail}
              placeholder="your@email.com"
              placeholderTextColor={theme.colors.textMuted}
              style={styles.input}
              value={resetEmail}
            />

            <TouchableOpacity activeOpacity={0.9} disabled={resetLoading} onPress={handleForgotPassword} style={styles.ctaWrap}>
              <LinearGradient colors={accentGradient} style={styles.ctaButton}>
                {resetLoading ? <ActivityIndicator color={theme.colors.textInverse} /> : <Text style={styles.ctaText}>Send link</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: '#000000',
    },
    keyboardWrap: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingTop: 24,
      paddingBottom: 26,
      justifyContent: 'center',
      gap: 14,
    },
    backgroundGlowTop: {
      position: 'absolute',
      top: -90,
      right: -70,
      width: 220,
      height: 220,
      borderRadius: 110,
      backgroundColor: 'transparent',
    },
    backgroundGlowBottom: {
      position: 'absolute',
      left: -70,
      bottom: -80,
      width: 240,
      height: 240,
      borderRadius: 120,
      backgroundColor: 'transparent',
    },
    brandBlock: {
      alignItems: 'center',
      gap: 8,
    },
    logoImage: {
      width: 138,
      height: 138,
    },
    headline: {
      color: '#FFFFFF',
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '900',
      textAlign: 'center',
    },
    subheadline: {
      color: '#A1A1AA',
      fontSize: 14,
      lineHeight: 20,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: -2,
    },
    card: {
      backgroundColor: 'rgba(15, 15, 18, 0.96)',
      borderRadius: 24,
      borderWidth: 1,
      borderColor: 'rgba(0, 212, 255, 0.14)',
      padding: 16,
      gap: 14,
      ...createResponsiveShadow({
        web: '0px 16px 24px rgba(0, 0, 0, 0.22)',
        native: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 16 },
          shadowOpacity: 0.2,
          shadowRadius: 24,
          elevation: 6,
        },
      }),
    },
    segmentRow: {
      flexDirection: 'row',
      backgroundColor: 'rgba(255, 255, 255, 0.035)',
      borderRadius: 999,
      padding: 4,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.08)',
    },
    segmentButton: {
      flex: 1,
      borderRadius: 999,
      paddingVertical: 10,
      alignItems: 'center',
    },
    segmentButtonActive: {
      backgroundColor: 'rgba(0, 212, 255, 0.10)',
      ...createResponsiveShadow({
        web: theme.mode === 'light' ? '0px 0px 10px rgba(5, 10, 20, 0.06)' : '0px 0px 10px rgba(0, 0, 0, 0.08)',
        native: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: theme.mode === 'light' ? 0.06 : 0.08,
          shadowRadius: 10,
          elevation: 3,
        },
      }),
    },
    segmentText: {
      color: theme.colors.textMuted,
      fontSize: 14,
      fontWeight: '700',
    },
    segmentTextActive: {
      color: '#FFFFFF',
    },
    fieldGroup: {
      gap: 10,
    },
    label: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    inputFlex: {
      flex: 1,
    },
    eyeBtn: {
      width: 44,
      height: 44,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(255, 255, 255, 0.04)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    input: {
      backgroundColor: 'rgba(255, 255, 255, 0.045)',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.10)',
      paddingHorizontal: 16,
      paddingVertical: 14,
      color: '#FFFFFF',
      fontSize: 15,
    },
    ctaWrap: {
      marginTop: 4,
    },
    ctaButton: {
      borderRadius: 18,
      paddingVertical: 15,
      alignItems: 'center',
    },
    ctaText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '800',
    },
    switchLink: {
      alignItems: 'center',
      paddingTop: 4,
    },
    switchLinkText: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: '700',
    },
    roleSwitchLink: {
      alignItems: 'center',
      paddingTop: 2,
    },
    roleSwitchText: {
      color: '#A1A1AA',
      fontSize: 12,
      fontWeight: '800',
    },
    forgotLink: {
      alignSelf: 'flex-end',
      paddingTop: 6,
    },
    forgotText: {
      color: theme.colors.accent,
      fontSize: 12,
      fontWeight: '800',
    },
    resetBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    resetSheet: {
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
    resetHeader: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    resetTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    resetClose: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    resetBody: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    resetCopy: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    helperText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
      marginTop: -2,
    },
  });

export default Login;









