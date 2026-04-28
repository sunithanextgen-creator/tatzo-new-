import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { updateProfile } from 'firebase/auth';
import { auth } from '../../config/firebaseConfig';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { RequestedRole, UserProfile, UserRole, VerificationStatus } from '../../types/app';
import { getUserProfile } from '../../services/profile';
import { syncUserProfile } from '../../services/userProfile';
import { submitVerificationApplication } from '../../services/verification';
import SettingsModal from './SettingsModal';
import ArtistProSection from './ArtistProSection';
import StatusBanner from '../verification/StatusBanner';

type ProfileModalProps = {
  visible: boolean;
  onClose: () => void;
  onSignOut: () => Promise<void>;
};

type ApplyDraft = {
  shopName: string;
  businessEmail: string;
  idProof: string;
  portfolioLink: string;
  upiId: string;
  bankDetails: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


const ProfileModal = ({ visible, onClose, onSignOut }: ProfileModalProps) => {
  const { theme, mode, toggleMode } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const uid = auth.currentUser?.uid ?? null;
  const email = auth.currentUser?.email ?? '';

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [locationCity, setLocationCity] = useState('');
  const [locationArea, setLocationArea] = useState('');
  const [bio, setBio] = useState('');
  const [phone, setPhone] = useState('');

  const [locationEditorOpen, setLocationEditorOpen] = useState(false);
  const [pendingApplyRole, setPendingApplyRole] = useState<RequestedRole | null>(null);

  const [applyOpen, setApplyOpen] = useState(false);
  const [applyRole, setApplyRole] = useState<RequestedRole>('artist');
  const [applySubmitting, setApplySubmitting] = useState(false);  const [applyDraft, setApplyDraft] = useState<ApplyDraft>({
    shopName: '',
    businessEmail: '',
    idProof: '',
    portfolioLink: '',
    upiId: '',
    bankDetails: '',
  });

  const role: UserRole = (profile?.role ?? 'user') as UserRole;
  const verificationStatus: VerificationStatus = (profile?.verificationStatus ?? 'unsubmitted') as VerificationStatus;
  const requestedRole = profile?.requestedRole ?? null;
  const locationMissing = !locationCity.trim() || !locationArea.trim();
  const locationLocked = verificationStatus === 'pending';

  useEffect(() => {
    if (!visible) return;

    // Reset UI state each open.
    setSettingsOpen(false);
    setApplyOpen(false);
    setLocationEditorOpen(false);
    setPendingApplyRole(null);

    if (!uid) {
      setProfile(null);
      setDisplayName(auth.currentUser?.displayName ?? '');
      setLocationCity('');
      setLocationArea('');
      setBio('');
      setPhone('');
      return;
    }

    let active = true;
    setLoading(true);

    (async () => {
      try {
        const data = await getUserProfile(uid);
        if (!active) return;
        setProfile(data);

        setDisplayName(data?.displayName ?? auth.currentUser?.displayName ?? '');
        setLocationCity(data?.locationCity ?? '');
        setLocationArea(data?.locationArea ?? '');

        // Legacy fallback: location="City, Area"
        if ((!data?.locationCity || !data?.locationArea) && data?.location) {
          const parts = String(data.location)
            .split(',')
            .map((p) => p.trim());
          if (parts[0] && !data?.locationCity) setLocationCity(parts[0]);
          if (parts[1] && !data?.locationArea) setLocationArea(parts[1]);
        }

        setBio(data?.bio ?? '');
        setPhone(data?.phone ?? '');

        // Draft defaults
        setApplyDraft((prev) => ({
          ...prev,
          businessEmail: prev.businessEmail || (data?.email ?? auth.currentUser?.email ?? ''),
        }));
      } catch (e: any) {
        if (!active) return;
        Alert.alert('Tatzo', e?.message ?? 'Could not load profile.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [uid, visible]);

  const close = () => {
    setApplyOpen(false);
    setLocationEditorOpen(false);
    setPendingApplyRole(null);
    onClose();
  };

  const patchLocalProfile = (patch: Partial<UserProfile>) => {
    setProfile((prev) => ({ ...(prev ?? {}), ...patch }));
  };

  const handleSaveProfile = async () => {
    if (!uid || !auth.currentUser) return;

    const name = displayName.trim();
    if (!name) {
      Alert.alert('Tatzo', 'Enter your name.');
      return;
    }
    if (bio.length > 140) {
      Alert.alert('Tatzo', 'Bio is too long.');
      return;
    }

    if (locationLocked && locationEditorOpen) {
      Alert.alert('Tatzo', 'Location is locked while verification is pending.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile(auth.currentUser, { displayName: name });

      const city = locationCity.trim();
      const area = locationArea.trim();

      await syncUserProfile(auth.currentUser, {
        displayName: name,
        phone: phone.trim(),
        bio: bio.trim(),
        locationCity: city,
        locationArea: area,
        location: city && area ? `${city}, ${area}` : '',
      });

      patchLocalProfile({
        displayName: name,
        phone: phone.trim(),
        bio: bio.trim(),
        locationCity: city,
        locationArea: area,
        location: city && area ? `${city}, ${area}` : '',
      });

      // If user tapped Apply earlier, continue automatically once location is saved.
      if (pendingApplyRole && city && area) {
        setApplyRole(pendingApplyRole);
        setPendingApplyRole(null);
        setApplyOpen(true);
      } else {
        Alert.alert('Tatzo', 'Profile updated.');
      }
    } catch (e: any) {
      Alert.alert('Tatzo', e?.code ? `${e.code}: ${e?.message ?? ''}` : (e?.message ?? 'Could not save profile.'));
    } finally {
      setSaving(false);
    }
  };

const openApply = (nextRole: RequestedRole) => {
    if (verificationStatus === 'pending') return;

    if (locationMissing) {
      setPendingApplyRole(nextRole);
      Alert.alert('Tatzo', 'Set your location first to continue.');
      setLocationEditorOpen(true);
      return;
    }

    setApplyRole(nextRole);
    setApplyOpen(true);
  };

  const handleSubmitApplication = async () => {
    if (!uid) return;

    const shopName = applyDraft.shopName.trim();
    const businessEmail = applyDraft.businessEmail.trim();
    const idProof = applyDraft.idProof.trim();

    if (!shopName) {
      Alert.alert('Tatzo', 'Enter your shop / studio name.');
      return;
    }
    if (!businessEmail || !emailPattern.test(businessEmail)) {
      Alert.alert('Tatzo', 'Enter a valid email.');
      return;
    }
    if (!idProof) {
      Alert.alert('Tatzo', 'Aadhar / PAN is required.');
      return;
    }
    const city = locationCity.trim();
    const area = locationArea.trim();
    if (!city || !area) {
      Alert.alert('Tatzo', 'Set your location first.');
      setLocationEditorOpen(true);
      return;
    }

    setApplySubmitting(true);
    try {
      await submitVerificationApplication({
        uid,
        requestedRole: applyRole,
        locationCity: city,
        locationArea: area,
        shopName,
        businessEmail,
        idProof,
        portfolioLink: applyDraft.portfolioLink.trim(),
        certStoragePaths: [],
        upiId: applyDraft.upiId.trim(),
        bankDetails: applyDraft.bankDetails.trim(),
      });

      patchLocalProfile({
        role: applyRole,
        requestedRole: null,
        verificationStatus: 'approved',
        verificationRejectReason: '',
        verifiedPro: applyRole === 'artist',
        authorizedSeller: applyRole === 'dealer',
        isProfileComplete: true,
      });

      setApplyOpen(false);
      Alert.alert('Tatzo', `${applyRole === 'artist' ? 'Artist' : 'Dealer'} suite activated successfully.`);
    } catch (e: any) {
      Alert.alert('Tatzo', e?.code ? `${e.code}: ${e?.message ?? ''}` : (e?.message ?? 'Could not submit application.'));
    } finally {
      setApplySubmitting(false);
    }
  };

  const handleSignOut = () => {
    Alert.alert('Tatzo', 'Sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => void onSignOut() },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheet}>
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <Pressable onPress={close} style={styles.iconBtn} accessibilityRole="button">
            <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={theme.colors.accentStrong} />
            <Text style={styles.loadingText}>Loading profile</Text>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <StatusBanner
              status={verificationStatus}
              requestedRole={requestedRole}
              rejectReason={profile?.verificationRejectReason}
              onPressAction={verificationStatus === 'rejected' ? () => openApply((requestedRole as any) || 'artist') : undefined}
            />

            {locationMissing ? (
              <Pressable onPress={() => setLocationEditorOpen(true)} style={styles.banner} accessibilityRole="button">
                <View style={styles.bannerLeft}>
                  <Ionicons name="location-outline" size={18} color={theme.colors.textInverse} />
                  <View style={styles.bannerCopy}>
                    <Text style={styles.bannerTitle}>Complete your profile</Text>
                    <Text style={styles.bannerSub} numberOfLines={2}>
                      Set your location to unlock full features.
                    </Text>
                  </View>
                </View>
                <Text style={styles.bannerCta}>Set Location</Text>
              </Pressable>
            ) : null}

            <View style={styles.row}>
              <Text style={styles.label}>Name</Text>
              <TextInput value={displayName} onChangeText={setDisplayName} style={styles.input} nativeID="profileName" />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Email</Text>
              <Text style={styles.value}>{email}</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Role</Text>
              <Text style={styles.value}>{String(role).toUpperCase()}</Text>
            </View>

            {locationEditorOpen ? (
              <View style={styles.row}>
                <Text style={styles.label}>Location (City)</Text>
                <TextInput
                  value={locationCity}
                  onChangeText={setLocationCity}
                  style={[styles.input, locationLocked && styles.inputDisabled]}
                  editable={!locationLocked}
                  nativeID="profileLocationCity"
                />
                <Text style={[styles.label, styles.labelAlt]}>Location (Area)</Text>
                <TextInput
                  value={locationArea}
                  onChangeText={setLocationArea}
                  style={[styles.input, locationLocked && styles.inputDisabled]}
                  editable={!locationLocked}
                  nativeID="profileLocationArea"
                />
                {locationLocked ? <Text style={styles.helper}>Location is locked while verification is pending.</Text> : null}
              </View>
            ) : null}

            <View style={styles.row}>
              <Text style={styles.label}>Phone</Text>
              <TextInput value={phone} onChangeText={setPhone} style={styles.input} nativeID="profilePhone" />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Bio</Text>
              <TextInput value={bio} onChangeText={setBio} style={[styles.input, styles.bio]} multiline nativeID="profileBio" />
              <Text style={styles.helper}>{bio.length}/140</Text>
            </View>

            {role === 'user' ? (
              <View style={styles.actionsBlock}>
                <Text style={styles.sectionTitle}>Upgrade</Text>

                <Pressable
                  disabled={verificationStatus === 'pending'}
                  onPress={() => openApply('artist')}
                  style={[styles.upgradeCard, verificationStatus === 'pending' && styles.upgradeCardDisabled]}
                >
                  <View style={styles.upgradeLeft}>
                    <Ionicons name="sparkles-outline" size={18} color={theme.colors.textInverse} />
                    <View style={styles.upgradeTextBlock}>
                      <Text style={styles.upgradeTitle}>Become an Artist</Text>
                      <Text style={styles.upgradeSub} numberOfLines={2}>
                        Submit verification documents to unlock Artist Suite.
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textInverse} />
                </Pressable>

                <Pressable
                  disabled={verificationStatus === 'pending'}
                  onPress={() => openApply('dealer')}
                  style={[styles.upgradeCard, verificationStatus === 'pending' && styles.upgradeCardDisabled]}
                >
                  <View style={styles.upgradeLeft}>
                    <Ionicons name="cart-outline" size={18} color={theme.colors.textInverse} />
                    <View style={styles.upgradeTextBlock}>
                      <Text style={styles.upgradeTitle}>Become a Dealer</Text>
                      <Text style={styles.upgradeSub} numberOfLines={2}>
                        Apply as an authorized seller for B2B shop access.
                      </Text>
                    </View>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textInverse} />
                </Pressable>

                {verificationStatus === 'pending' ? (
                  <Text style={styles.pendingNote}>Verification is in progress.</Text>
                ) : null}
              </View>
            ) : (
              <ArtistProSection uid={uid} role={role} profile={profile} onPatchProfile={patchLocalProfile} />
            )}

            <View style={styles.actions}>
              <Pressable onPress={toggleMode} style={styles.actionBtn} accessibilityRole="button">
                <Ionicons name={mode === 'dark' ? 'sunny-outline' : 'moon-outline'} size={18} color={theme.colors.accent} />
                <Text style={styles.actionText}>{mode === 'dark' ? 'Light theme' : 'Dark theme'}</Text>
              </Pressable>

              <Pressable onPress={() => setSettingsOpen(true)} style={styles.actionBtn} accessibilityRole="button">
                <Ionicons name="settings-outline" size={18} color={theme.colors.accent} />
                <Text style={styles.actionText}>Settings</Text>
              </Pressable>

              <Pressable onPress={handleSignOut} style={[styles.actionBtn, styles.dangerBtn]} accessibilityRole="button">
                <Ionicons name="log-out-outline" size={18} color={theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf'} />
                <Text style={[styles.actionText, styles.dangerText]}>Sign out</Text>
              </Pressable>
            </View>

            <Pressable disabled={saving} onPress={handleSaveProfile} style={[styles.saveBtn, saving && styles.saveBtnDisabled]} accessibilityRole="button">
              <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save'}</Text>
            </Pressable>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <SettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <Modal visible={applyOpen} transparent animationType="fade" onRequestClose={() => setApplyOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setApplyOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.applySheet}>
          <View style={styles.header}>
            <Text style={styles.title}>Apply: {applyRole.toUpperCase()}</Text>
            <Pressable onPress={() => setApplyOpen(false)} style={styles.iconBtn} accessibilityRole="button">
              <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.note}>Submit your professional details to activate your suite instantly.</Text>

            <View style={styles.row}>
              <Text style={styles.label}>Shop / Studio Name</Text>
              <TextInput
                value={applyDraft.shopName}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, shopName: t }))}
                style={styles.input}
                nativeID="applyShopName"
              />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Business Email</Text>
              <TextInput
                value={applyDraft.businessEmail}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, businessEmail: t }))}
                style={styles.input}
                autoCapitalize="none"
                keyboardType="email-address"
                nativeID="applyBusinessEmail"
              />
              <Text style={styles.helper}>Any valid email is allowed (Gmail/Yahoo/etc).</Text>
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Aadhar / PAN</Text>
              <TextInput
                value={applyDraft.idProof}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, idProof: t }))}
                style={styles.input}
                nativeID="applyIdProof"
              />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Portfolio Link (Optional)</Text>
              <TextInput
                value={applyDraft.portfolioLink}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, portfolioLink: t }))}
                style={styles.input}
                autoCapitalize="none"
                nativeID="applyPortfolio"
              />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>UPI ID (Optional)</Text>
              <TextInput
                value={applyDraft.upiId}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, upiId: t }))}
                style={styles.input}
                nativeID="applyUpi"
              />
            </View>

            <View style={styles.row}>
              <Text style={styles.label}>Bank Details (Optional)</Text>
              <TextInput
                value={applyDraft.bankDetails}
                onChangeText={(t) => setApplyDraft((d) => ({ ...d, bankDetails: t }))}
                style={[styles.input, styles.multiline]}
                multiline
                nativeID="applyBank"
              />
            </View>

            <Pressable
              disabled={applySubmitting}
              onPress={handleSubmitApplication}
              style={[styles.saveBtn, applySubmitting && styles.saveBtnDisabled]}
              accessibilityRole="button"
            >
              <Text style={styles.saveText}>{applySubmitting ? 'Submitting...' : 'Activate Suite'}</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) =>
  StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.6)',
    },
    sheet: {
      position: 'absolute',
      left: 14,
      right: 14,
      top: 78,
      bottom: 14,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
      overflow: 'hidden',
      maxWidth: 520,
      alignSelf: 'center',
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
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    iconBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    loading: {
      paddingHorizontal: 14,
      paddingVertical: 18,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    loadingText: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    scroll: {
      flex: 1,
    },
    body: {
      paddingHorizontal: 18,
      paddingTop: 12,
      paddingBottom: 18,
      gap: 14,
    },
    banner: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.18)' : 'rgba(122, 92, 255, 0.14)',
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    bannerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    bannerCopy: {
      flex: 1,
      gap: 2,
    },
    bannerTitle: {
      color: theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    bannerSub: {
      color: 'rgba(245, 247, 250, 0.78)',
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    bannerCta: {
      color: theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    row: {
      gap: 10,
    },
    label: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    labelAlt: {
      marginTop: 6,
    },
    value: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
    },
    input: {
      borderRadius: 18,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(255, 255, 255, 0.06)',
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 14,
      paddingVertical: 14,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
    },
    inputDisabled: {
      opacity: 0.6,
    },
    bio: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    helper: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
      paddingHorizontal: 2,
    },
    sectionTitle: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      paddingHorizontal: 2,
    },
    actionsBlock: {
      gap: 10,
    },
    upgradeCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.12)',
      overflow: 'hidden',
      paddingHorizontal: 14,
      paddingVertical: 14,
      backgroundColor: theme.mode === 'light' ? 'rgba(0, 229, 255, 0.10)' : 'rgba(0, 229, 255, 0.08)',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    upgradeCardDisabled: {
      opacity: 0.55,
    },
    upgradeLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      flex: 1,
    },
    upgradeTextBlock: {
      flex: 1,
      gap: 2,
    },
    upgradeTitle: {
      color: theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.3,
    },
    upgradeSub: {
      color: 'rgba(245, 247, 250, 0.82)',
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    pendingNote: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
      paddingHorizontal: 2,
    },
    actions: {
      gap: 10,
      marginTop: 2,
    },
    actionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    actionText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    dangerBtn: {
      backgroundColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.12)' : 'rgba(142, 75, 69, 0.18)',
      borderColor: theme.mode === 'light' ? 'rgba(142, 75, 69, 0.34)' : 'rgba(255, 211, 207, 0.22)',
    },
    dangerText: {
      color: theme.mode === 'light' ? '#6E2F2A' : '#ffd3cf',
    },
    saveBtn: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.14)',
      overflow: 'hidden',
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentStrong,
      marginTop: 6,
    },
    saveBtnDisabled: {
      opacity: 0.65,
    },
    saveText: {
      color: theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    note: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
      paddingHorizontal: 2,
    },
    multiline: {
      minHeight: 88,
      textAlignVertical: 'top',
    },
    uploadBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingVertical: 12,
      paddingHorizontal: 12,
    },
    uploadBtnText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    fileList: {
      marginTop: 10,
      gap: 8,
    },
    fileRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
    },
    fileName: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '700',
    },
    fileRemove: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.06)' : 'rgba(255, 255, 255, 0.08)',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    applySheet: {
      position: 'absolute',
      left: 14,
      right: 14,
      top: 92,
      bottom: 14,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
      overflow: 'hidden',
      maxWidth: 520,
      alignSelf: 'center',
    },
  });

export default ProfileModal;







