import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { auth } from '../../config/firebaseConfig';
import { RootStackParamList, UserRole } from '../../types/app';
import { syncUserProfile } from '../../services/userProfile';
import { resolveDashboardRoute } from '../../navigation/routeResolver';
import { createResponsiveShadow } from '../../utils/responsiveShadow';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';

const roles: Array<{
  id: UserRole;
  title: string;
}> = [
  { id: 'user', title: 'User' },
  { id: 'artist', title: 'Artist' },
  { id: 'dealer', title: 'Dealer' },
];

const RoleSelectScreen = () => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

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

  const saveAndContinue = async () => {
    if (!selectedRole || !auth.currentUser) {
      Alert.alert('Tatzo', 'Select your role to continue.');
      return;
    }

    setIsSaving(true);

    try {
      await syncUserProfile(auth.currentUser, {
        role: selectedRole,
        setupComplete: true,
      });

      navigation.reset({
        index: 0,
        routes: [{ name: resolveDashboardRoute(selectedRole) }],
      });
    } catch (error: any) {
      console.error('TATZO: role setup failed', error);
      Alert.alert('Tatzo', `Setup failed: ${error.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <LinearGradient colors={theme.gradients.canvas} style={styles.container}>
        <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
          <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
            <View style={styles.headerBlock}>
              <Text style={styles.title}>Choose your role</Text>
            </View>

            <View style={styles.cardsContainer}>
              {roles.map((role) => {
                const active = selectedRole === role.id;

                return (
                  <TouchableOpacity
                    key={role.id}
                    activeOpacity={0.92}
                    onPress={() => setSelectedRole(role.id)}
                    style={[styles.cardShell, active && styles.cardShellActive]}
                  >
                    <View style={styles.cardTopRow}>
                      <Text style={styles.cardTitle}>{role.title}</Text>
                      <View style={[styles.selectionDot, active && styles.selectionDotActive]} />
                    </View>
                    {active ? <Text style={styles.selectedLabel}>Selected</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>

          <TouchableOpacity
            activeOpacity={0.9}
            disabled={!selectedRole || isSaving}
            onPress={saveAndContinue}
            style={[styles.ctaWrap, (!selectedRole || isSaving) && styles.ctaWrapDisabled]}
          >
            <LinearGradient colors={theme.gradients.accent} style={styles.ctaButton}>
              {isSaving ? <ActivityIndicator color={theme.colors.textInverse} /> : <Text style={styles.ctaText}>Continue</Text>}
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
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
    content: {
      flex: 1,
      paddingHorizontal: 24,
      paddingTop: 10,
      paddingBottom: 24,
    },
    scrollContent: {
      gap: 16,
      paddingBottom: 24,
    },
    headerBlock: {
      gap: 10,
      paddingTop: 12,
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 30,
      lineHeight: 36,
      fontFamily: theme.fonts.display,
    },
    cardsContainer: {
      gap: 12,
      paddingTop: 4,
    },
    cardShell: {
      backgroundColor: theme.mode === 'light' ? theme.colors.surface : 'rgba(255, 255, 255, 0.05)',
      borderRadius: 24,
      padding: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      gap: 10,
      ...createResponsiveShadow({
        web: theme.mode === 'light' ? '0px 12px 24px rgba(5, 10, 20, 0.08)' : '0px 12px 24px rgba(5, 10, 20, 0.12)',
        native: {
          shadowColor: theme.mode === 'light' ? 'rgba(5, 10, 20, 0.12)' : theme.colors.shadow,
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: theme.mode === 'light' ? 0.08 : 0.12,
          shadowRadius: 24,
          elevation: 5,
        },
      }),
    },
    cardShellActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accentSoft,
    },
    cardTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 12,
      alignItems: 'center',
    },
    cardTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 22,
      fontFamily: theme.fonts.display,
    },
    selectionDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.2)' : 'rgba(199, 204, 214, 0.32)',
      marginTop: 4,
    },
    selectionDotActive: {
      backgroundColor: theme.colors.accent,
      borderColor: theme.colors.accent,
    },
    selectedLabel: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 1.4,
      alignSelf: 'flex-start',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: theme.colors.accentSoft,
    },
    ctaWrap: {
      marginTop: 'auto',
      paddingTop: 12,
    },
    ctaWrapDisabled: {
      opacity: 0.55,
    },
    ctaButton: {
      borderRadius: 18,
      paddingVertical: 16,
      alignItems: 'center',
    },
    ctaText: {
      color: theme.mode === 'light' ? '#0B0B0F' : theme.colors.textInverse,
      fontSize: 16,
      fontWeight: '700',
    },
  });

export default RoleSelectScreen;
