import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList, UserRole } from '../../types/app';
import { createResponsiveShadow } from '../../utils/responsiveShadow';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

const TATZO_ROLE_LOGO = require('../../../assets/tatzo-role-logo.png');


const roles: Array<{
  id: UserRole;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: 'purple' | 'cyan';
  bullets: string[];
}> = [
  {
    id: 'user',
    title: 'User',
    icon: 'person-outline',
    accent: 'purple',
    bullets: ['Discover artists', 'Explore tattoo designs', 'Book your tattoo'],
  },
  {
    id: 'artist',
    title: 'Artist',
    icon: 'color-wand-outline',
    accent: 'cyan',
    bullets: ['Showcase your work', 'Receive booking requests', 'Grow your audience'],
  },
];

const RoleSelectScreen = () => {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const isWide = width >= 700;
  const styles = useMemo(() => createStyles(theme, isWide, insets.bottom), [theme, isWide, insets.bottom]);

  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 650,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }, [fadeAnim]);

  const continueWithRole = async (role: UserRole) => {
    setSelectedRole(role);
    setIsSaving(true);

    try {
      navigation.reset({
        index: 0,
        routes: [{ name: 'Login', params: { role } }],
      });
    } catch (error: any) {
      console.error('TATZO: role setup failed', error);
      Alert.alert('Tatzo', `Setup failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleLogin = () => {
    if (!selectedRole) {
      Alert.alert('Tatzo', 'Select User or Artist first, then login.');
      return;
    }
    continueWithRole(selectedRole);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.subtlePurpleGlow} pointerEvents="none" />
        <View style={styles.subtleCyanGlow} pointerEvents="none" />

        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <View style={styles.logoBlock}>
            <Image source={TATZO_ROLE_LOGO} style={styles.logo} resizeMode="contain" />
          </View>

          <View style={styles.headerBlock}>
            <Text style={styles.title}>Choose Your Role</Text>
            <Text style={styles.subtitle}>Select how you want to continue with Tatzo.</Text>
          </View>

          <View style={styles.cardsContainer}>
            {roles.map((role) => {
              const active = selectedRole === role.id;
              const accentColor = role.accent === 'purple' ? '#A855F7' : '#00C8FF';
              const gradientColors: [string, string] =
                role.accent === 'purple'
                  ? ['rgba(168,85,247,0.08)', 'rgba(255,255,255,0.025)']
                  : ['rgba(0,200,255,0.07)', 'rgba(255,255,255,0.025)'];

              return (
                <TouchableOpacity
                  key={role.id}
                  activeOpacity={0.92}
                  onPress={() => setSelectedRole(role.id)}
                  style={[styles.cardShell, active && { borderColor: accentColor }]}
                >
                  <LinearGradient colors={gradientColors} style={styles.cardGlow}>
                    <View style={[styles.iconRing, { borderColor: accentColor }]}>
                      <Ionicons name={role.icon} size={isWide ? 40 : 30} color={accentColor} />
                    </View>

                    <Text style={styles.cardTitle}>{role.title}</Text>
                    <View style={[styles.cardDivider, { backgroundColor: accentColor }]} />

                    <View style={styles.bulletList}>
                      {role.bullets.map((item) => (
                        <View key={item} style={styles.bulletRow}>
                          <Ionicons name="checkmark-circle-outline" size={isWide ? 17 : 14} color={accentColor} />
                          <Text style={styles.bulletText}>{item}</Text>
                        </View>
                      ))}
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.9}
                      disabled={isSaving}
                      onPress={() => continueWithRole(role.id)}
                      style={styles.roleButtonWrap}
                    >
                      <LinearGradient colors={role.accent === 'purple' ? ['#A855F7', '#7C3AED'] : ['#00C8FF', '#0066FF']} style={styles.roleButton}>
                        {isSaving && selectedRole === role.id ? (
                          <ActivityIndicator color="#FFFFFF" />
                        ) : (
                          <Text style={styles.roleButtonText}>Continue as {role.title}</Text>
                        )}
                      </LinearGradient>
                    </TouchableOpacity>
                  </LinearGradient>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.loginBlock}>
            <Text style={styles.loginHint}>Already have an account?</Text>
            <TouchableOpacity activeOpacity={0.88} onPress={handleLogin} style={styles.loginButton}>
              <Text style={styles.loginText}>Login</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </SafeAreaView>
  );
};

const createStyles = (theme: AppTheme, isWide: boolean, bottomInset: number) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: '#000000',
    },
    container: {
      flex: 1,
      backgroundColor: '#000000',
      overflow: 'hidden',
    },
    subtlePurpleGlow: {
      position: 'absolute',
      left: -42,
      top: 90,
      width: 120,
      height: 220,
      borderRadius: 80,
      backgroundColor: 'rgba(168,85,247,0.10)',
      opacity: 0.7,
    },
    subtleCyanGlow: {
      position: 'absolute',
      right: -50,
      bottom: 120,
      width: 130,
      height: 240,
      borderRadius: 90,
      backgroundColor: 'rgba(0,200,255,0.08)',
      opacity: 0.7,
    },
    content: {
      flex: 1,
      paddingHorizontal: isWide ? 54 : 18,
      paddingTop: isWide ? 8 : 4,
      paddingBottom: Math.max(12, bottomInset + 6),
      justifyContent: 'center',
      gap: isWide ? 18 : 10,
    },
    logoBlock: {
      alignItems: 'center',
    },
    logo: {
      width: isWide ? 260 : 138,
      height: isWide ? 260 : 138,
    },
    headerBlock: {
      alignItems: 'center',
      gap: 6,
    },
    title: {
      color: theme.mode === 'light' ? '#7C3AED' : '#00D4FF',
      fontSize: isWide ? 38 : 25,
      lineHeight: isWide ? 44 : 30,
      fontWeight: '900',
      textAlign: 'center',
      letterSpacing: -0.8,
    },
    subtitle: {
      color: theme.mode === 'light' ? '#4B5563' : 'rgba(255,255,255,0.78)',
      fontSize: isWide ? 16 : 12,
      lineHeight: 16,
      textAlign: 'center',
      fontWeight: '700',
    },
    cardsContainer: {
      flexDirection: 'row',
      gap: isWide ? 16 : 10,
      width: '100%',
      alignSelf: 'center',
      maxWidth: 820,
    },
    cardShell: {
      flex: 1,
      minHeight: isWide ? 330 : 226,
      borderRadius: isWide ? 28 : 22,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.12)',
      overflow: 'hidden',
      backgroundColor: 'rgba(255,255,255,0.035)',
      ...createResponsiveShadow({
        web: '0px 14px 24px rgba(0, 0, 0, 0.26)',
        native: {
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 10 },
          shadowOpacity: 0.22,
          shadowRadius: 18,
          elevation: 4,
        },
      }),
    },
    cardGlow: {
      flex: 1,
      alignItems: 'center',
      paddingHorizontal: isWide ? 20 : 9,
      paddingVertical: isWide ? 24 : 12,
      gap: isWide ? 13 : 8,
    },
    iconRing: {
      width: isWide ? 104 : 56,
      height: isWide ? 104 : 56,
      borderRadius: isWide ? 52 : 28,
      borderWidth: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.22)',
    },
    cardTitle: {
      color: '#FFFFFF',
      fontSize: isWide ? 28 : 19,
      fontWeight: '900',
      textAlign: 'center',
    },
    cardDivider: {
      width: isWide ? 96 : 58,
      height: 2,
      borderRadius: 999,
      opacity: 0.72,
    },
    bulletList: {
      width: '100%',
      gap: isWide ? 10 : 5,
      marginTop: 2,
    },
    bulletRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: isWide ? 10 : 5,
    },
    bulletText: {
      flex: 1,
      color: 'rgba(255,255,255,0.78)',
      fontSize: isWide ? 14 : 9.8,
      fontWeight: '800',
      lineHeight: isWide ? 20 : 13,
    },
    roleButtonWrap: {
      width: '100%',
      marginTop: 'auto',
      minHeight: isWide ? 50 : 38,
    },
    roleButton: {
      minHeight: isWide ? 50 : 38,
      borderRadius: isWide ? 17 : 13,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
    },
    roleButtonText: {
      color: '#FFFFFF',
      fontSize: isWide ? 16 : 10.8,
      fontWeight: '900',
    },
    loginBlock: {
      alignItems: 'center',
      gap: 4,
      marginTop: 0,
    },
    loginHint: {
      color: 'rgba(255,255,255,0.66)',
      fontSize: isWide ? 15 : 12,
      fontWeight: '700',
    },
    loginButton: {
      minHeight: isWide ? 44 : 36,
      minWidth: 88,
      alignItems: 'center',
      justifyContent: 'center',
      borderBottomWidth: 1,
      borderBottomColor: '#A855F7',
    },
    loginText: {
      color: '#A855F7',
      fontSize: isWide ? 22 : 18,
      fontWeight: '900',
    },
  });

export default RoleSelectScreen;
