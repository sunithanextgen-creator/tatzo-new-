import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db } from '../../config/firebaseConfig';
import {
  pickSingleCertificateFromDevice,
  pickSingleImageFromDevice,
  pickSingleVideoFromDevice,
  uploadPickedCertificate,
  uploadPickedImage,
  uploadPickedVideo,
  uploadProfileImage,
  type UploadedMedia,
} from '../../services/mediaUpload';
import { submitVerificationApplication } from '../../services/verification';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import { ANALYTICS_EVENTS, trackAnalyticsEventOnce } from '../../services/analytics/analytics';
import { logCrashlyticsError } from '../../services/crashlytics';

type ArtistVerificationModalProps = {
  visible: boolean;
  onClose: () => void;
  onStartPosting?: () => void;
};

type VerificationStatus = 'unsubmitted' | 'pending' | 'pending_verification' | 'needs_more_samples' | 'approved' | 'rejected';
type VerificationStep = 1 | 2 | 3 | 4;

const STEPS: Array<{ step: VerificationStep; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { step: 1, label: 'Business', icon: 'business-outline' },
  { step: 2, label: 'Portfolio', icon: 'images-outline' },
  { step: 3, label: 'Founder Code', icon: 'ticket-outline' },
  { step: 4, label: 'Review', icon: 'checkmark-done-outline' },
];

const cleanUploads = (value: unknown): UploadedMedia[] =>
  Array.isArray(value)
    ? value
        .map((item: any) => ({
          downloadUrl: String(item?.downloadUrl ?? '').trim(),
          storagePath: String(item?.storagePath ?? '').trim(),
          fileName: String(item?.fileName ?? '').trim(),
          mimeType: String(item?.mimeType ?? '').trim(),
          size: Number(item?.size ?? 0),
        }))
        .filter((item) => item.downloadUrl && item.storagePath)
    : [];

const formatDate = (value: any) => {
  const date = value?.toDate?.() instanceof Date ? value.toDate() : value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Approval date updating';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const ArtistVerificationModal = ({ visible, onClose, onStartPosting }: ArtistVerificationModalProps) => {
  const { theme } = useAppTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const uid = auth.currentUser?.uid ?? '';

  const [step, setStep] = useState<VerificationStep>(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [status, setStatus] = useState<VerificationStatus>('unsubmitted');
  const [feedback, setFeedback] = useState('');
  const [approvedAt, setApprovedAt] = useState<unknown>(null);
  const [membershipLabel, setMembershipLabel] = useState('Verified Artist');
  const [viewSubmission, setViewSubmission] = useState(false);
  const [artistName, setArtistName] = useState('');
  const [studioName, setStudioName] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [experience, setExperience] = useState('');
  const [stylesText, setStylesText] = useState('');
  const [bio, setBio] = useState('');
  const [instagramLink, setInstagramLink] = useState('');
  const [websiteLink, setWebsiteLink] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [profileImage, setProfileImage] = useState<UploadedMedia | null>(null);
  const [portfolioImages, setPortfolioImages] = useState<UploadedMedia[]>([]);
  const [portfolioVideos, setPortfolioVideos] = useState<UploadedMedia[]>([]);
  const [certificate, setCertificate] = useState<UploadedMedia | null>(null);

  useEffect(() => {
    if (!visible || !uid) return;
    let active = true;
    setLoading(true);
    setStep(1);
    setViewSubmission(false);
    (async () => {
      try {
        const [userSnap, verificationSnap] = await Promise.all([
          getDoc(doc(db, 'users', uid)),
          getDoc(doc(db, 'verifications', uid)),
        ]);
        if (!active) return;
        const user = userSnap.exists() ? (userSnap.data() as any) : {};
        const verification = verificationSnap.exists() ? (verificationSnap.data() as any) : {};
        const nextStatus = String(user.verificationStatus ?? verification.status ?? 'unsubmitted') as VerificationStatus;
        setStatus(nextStatus);
        setFeedback(String(user.verificationFeedback ?? user.verificationRejectReason ?? verification.adminFeedback ?? verification.rejectReason ?? ''));
        setApprovedAt(verification.reviewedAt ?? user.verificationApprovedAt ?? null);
        setMembershipLabel(String(user.membershipPlan ?? user.plan ?? user.foundingBadge ?? (user.foundingReferralCode ? 'Founder Artist' : 'Verified Artist')));
        setArtistName(String(verification.artistName ?? user.artistName ?? user.displayName ?? auth.currentUser?.displayName ?? ''));
        setStudioName(String(verification.shopName ?? user.studioName ?? ''));
        setCity(String(verification.locationCity ?? user.locationCity ?? ''));
        setArea(String(verification.locationArea ?? user.locationArea ?? ''));
        setExperience(String(verification.experience ?? user.experience ?? ''));
        setStylesText((verification.styles ?? user.styles ?? []).join(', '));
        setBio(String(verification.bio ?? user.bio ?? ''));
        setInstagramLink(String(verification.portfolioLink ?? user.portfolioLink ?? ''));
        setWebsiteLink(String(verification.website ?? user.website ?? ''));
        setReferralCode(String(verification.referralCode ?? user.foundingReferralCode ?? ''));
        const savedProfileUrl = String(verification.profileImageUrl ?? user.profileImageUrl ?? '').trim();
        setProfileImage(savedProfileUrl ? {
          downloadUrl: savedProfileUrl,
          storagePath: String(user.profileImageMeta?.storagePath ?? `artists/${uid}/profile/profile-image.jpg`),
          fileName: String(user.profileImageMeta?.fileName ?? 'profile-image.jpg'),
          mimeType: String(user.profileImageMeta?.mimeType ?? 'image/jpeg'),
          size: Number(user.profileImageMeta?.size ?? 0),
        } : null);
        setPortfolioImages(cleanUploads(verification.portfolioImages));
        setPortfolioVideos(cleanUploads(verification.portfolioVideos));
        setCertificate(cleanUploads(verification.certificates)[0] ?? null);
        if (nextStatus === 'needs_more_samples' || nextStatus === 'rejected') setStep(2);
      } catch (error: any) {
        Alert.alert('Tatzo', error?.message ?? 'Could not load verification form.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [uid, visible]);

  const stylesList = useMemo(() => stylesText.split(',').map((item) => item.trim()).filter(Boolean), [stylesText]);
  const pending = status === 'pending' || status === 'pending_verification';
  const businessComplete = Boolean(artistName.trim() && studioName.trim() && city.trim() && area.trim() && experience.trim() && stylesList.length && bio.trim());
  const portfolioComplete = Boolean(profileImage?.downloadUrl && instagramLink.trim() && portfolioImages.length >= 3 && portfolioVideos.length >= 1);
  const requirementsComplete = businessComplete && portfolioComplete;
  const founderCode = referralCode.trim().toUpperCase();
  const founderCodeHint = founderCode.startsWith('FOUNDER10-')
    ? 'Founder10 batch code detected.'
    : founderCode.startsWith('FOUNDING15-')
      ? 'Founding Artist batch code detected.'
      : founderCode
        ? 'Admin will validate this code during review.'
        : 'No code? You can continue without one.';

  const uploadProfile = async () => {
    if (!uid || uploading) return;
    try {
      setUploading('profile');
      const picked = await pickSingleImageFromDevice();
      if (!picked) return;
      setProfileImage(await uploadProfileImage({ picked, storagePath: `artists/${uid}/profile/profile-image.jpg` }));
    } catch (error: any) {
      Alert.alert('Tatzo', error?.message ?? 'Could not upload profile image.');
    } finally {
      setUploading(null);
    }
  };

  const uploadPortfolioImage = async () => {
    if (!uid || uploading || portfolioImages.length >= 6) return;
    try {
      setUploading('image');
      const picked = await pickSingleImageFromDevice();
      if (!picked) return;
      const uploaded = await uploadPickedImage({ ...picked, fileName: picked.name, folderPath: `verifications/${uid}/portfolio-images` });
      setPortfolioImages((current) => [...current, uploaded]);
    } catch (error: any) {
      Alert.alert('Tatzo', error?.message ?? 'Could not upload portfolio image.');
    } finally {
      setUploading(null);
    }
  };

  const uploadPortfolioVideo = async () => {
    if (!uid || uploading || portfolioVideos.length >= 3) return;
    try {
      setUploading('video');
      const picked = await pickSingleVideoFromDevice();
      if (!picked) return;
      const uploaded = await uploadPickedVideo({ ...picked, fileName: picked.name, folderPath: `verifications/${uid}/portfolio-videos` });
      setPortfolioVideos((current) => [...current, uploaded]);
    } catch (error: any) {
      Alert.alert('Tatzo', error?.message ?? 'Could not upload portfolio video.');
    } finally {
      setUploading(null);
    }
  };

  const uploadCertificate = async () => {
    if (!uid || uploading) return;
    try {
      setUploading('certificate');
      const picked = await pickSingleCertificateFromDevice();
      if (!picked) return;
      setCertificate(await uploadPickedCertificate({ ...picked, fileName: picked.name, folderPath: `verifications/${uid}/certificates` }));
    } catch (error: any) {
      Alert.alert('Tatzo', error?.message ?? 'Could not upload certificate.');
    } finally {
      setUploading(null);
    }
  };

  const submit = async () => {
    const user = auth.currentUser;
    if (!user || !requirementsComplete || submitting || uploading) return;
    setSubmitting(true);
    try {
      await setDoc(doc(db, 'users', uid), {
        uid,
        role: 'artist',
        artistName: artistName.trim(),
        displayName: artistName.trim(),
        studioName: studioName.trim(),
        locationCity: city.trim(),
        locationArea: area.trim(),
        location: [area.trim(), city.trim()].filter(Boolean).join(', '),
        experience: experience.trim(),
        styles: stylesList,
        bio: bio.trim(),
        profileImageUrl: profileImage?.downloadUrl ?? '',
        profileImageMeta: profileImage,
        portfolioLink: instagramLink.trim(),
        website: websiteLink.trim(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
      await submitVerificationApplication({
        uid,
        requestedRole: 'artist',
        locationCity: city.trim(),
        locationArea: area.trim(),
        artistName: artistName.trim(),
        shopName: studioName.trim(),
        businessEmail: user.email ?? '',
        experience: experience.trim(),
        styles: stylesList,
        bio: bio.trim(),
        profileImageUrl: profileImage?.downloadUrl ?? '',
        portfolioLink: instagramLink.trim(),
        website: websiteLink.trim(),
        portfolioImageCount: portfolioImages.length,
        portfolioReelCount: portfolioVideos.length,
        portfolioImages,
        portfolioVideos,
        referralCode: founderCode,
        certificates: certificate ? [certificate] : [],
        waitlistName: artistName.trim(),
        waitlistEmail: user.email ?? '',
        waitlistStudio: studioName.trim(),
        waitlistStyles: stylesList,
        waitlistExperience: experience.trim(),
      });
      await trackAnalyticsEventOnce(
        `artist_verification_submitted_${uid}_${portfolioImages.length}_${portfolioVideos.length}`,
        ANALYTICS_EVENTS.ARTIST_VERIFICATION_SUBMITTED,
        {
          artist_id: uid,
          portfolio_image_count: portfolioImages.length,
          portfolio_video_count: portfolioVideos.length,
          has_referral_code: Boolean(founderCode.trim()),
        },
      );
      setStatus('pending_verification');
      setViewSubmission(false);
    } catch (error: any) {
      void logCrashlyticsError(error, { source: 'artist_verification_submit', uid, portfolioImages: portfolioImages.length, portfolioVideos: portfolioVideos.length });
      Alert.alert('Tatzo', error?.message ?? 'Could not submit verification.');
    } finally {
      setSubmitting(false);
    }
  };

  const field = (label: string, value: string, onChangeText: (value: string) => void, options?: { multiline?: boolean; placeholder?: string; optional?: boolean }) => (
    <View style={styles.field}>
      <Text style={styles.label}>{label}{options?.optional ? <Text style={styles.optional}>  Optional</Text> : null}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={[styles.input, options?.multiline && styles.multiline]}
        placeholder={options?.placeholder}
        placeholderTextColor={theme.colors.textMuted}
        multiline={options?.multiline}
      />
    </View>
  );

  const reviewRow = (label: string, value: string, icon: keyof typeof Ionicons.glyphMap) => (
    <View style={styles.reviewRow}>
      <Ionicons name={icon} size={18} color={theme.colors.accentStrong} />
      <View style={styles.reviewCopy}><Text style={styles.reviewLabel}>{label}</Text><Text style={styles.reviewValue}>{value || 'Not added'}</Text></View>
    </View>
  );

  const renderStep = () => {
    if (step === 1) {
      return (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Business Information</Text>
          <Text style={styles.stepSubtitle}>Tell users and the Tatzo review team about your professional tattoo work.</Text>
          {field('Artist Name', artistName, setArtistName)}
          {field('Studio Name', studioName, setStudioName)}
          <View style={styles.row}><View style={styles.flex}>{field('City', city, setCity)}</View><View style={styles.flex}>{field('Area', area, setArea)}</View></View>
          {field('Experience', experience, setExperience, { placeholder: 'Example: 5 years' })}
          {field('Styles', stylesText, setStylesText, { placeholder: 'Blackwork, Minimal, Realism' })}
          {field('Bio', bio, setBio, { multiline: true, placeholder: 'Describe your tattoo practice and specialties.' })}
          <TouchableOpacity style={[styles.primaryButton, !businessComplete && styles.disabled]} disabled={!businessComplete} onPress={() => setStep(2)}>
            <Text style={styles.primaryText}>Continue</Text><Ionicons name="arrow-forward" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      );
    }

    if (step === 2) {
      return (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Portfolio</Text>
          <Text style={styles.stepSubtitle}>Upload only your strongest, original tattoo work.</Text>
          {feedback ? <View style={styles.feedback}><Ionicons name="information-circle-outline" size={18} color={theme.colors.accentStrong} /><Text style={styles.feedbackText}>{feedback}</Text></View> : null}
          <View style={styles.uploadSection}>
            <View style={styles.uploadHeading}><Text style={styles.sectionTitle}>Profile Photo</Text><Text style={styles.required}>Required</Text></View>
            <TouchableOpacity style={styles.uploadButton} onPress={uploadProfile} disabled={Boolean(uploading)}>
              {profileImage?.downloadUrl ? <Image source={{ uri: profileImage.downloadUrl }} style={styles.avatar} /> : <Ionicons name="person-circle-outline" size={38} color={theme.colors.accent} />}
              <View style={styles.uploadCopy}><Text style={styles.uploadText}>{uploading === 'profile' ? 'Uploading...' : profileImage ? 'Replace profile photo' : 'Upload profile photo'}</Text><Text style={styles.uploadHint}>Clear face or professional studio portrait</Text></View>
            </TouchableOpacity>
          </View>
          <View style={styles.uploadSection}>
            <View style={styles.uploadHeading}><Text style={styles.sectionTitle}>3 Best Tattoo Images</Text><Text style={styles.required}>{portfolioImages.length}/3</Text></View>
            <View style={styles.mediaGrid}>{portfolioImages.map((item, index) => <Image key={item.storagePath} source={{ uri: item.downloadUrl }} style={styles.mediaTile} accessibilityLabel={`Portfolio image ${index + 1}`} />)}</View>
            <TouchableOpacity style={styles.uploadButton} onPress={uploadPortfolioImage} disabled={Boolean(uploading) || portfolioImages.length >= 6}>
              <Ionicons name="images-outline" size={22} color={theme.colors.accent} /><View style={styles.uploadCopy}><Text style={styles.uploadText}>{uploading === 'image' ? 'Uploading...' : 'Add tattoo image'}</Text><Text style={styles.uploadHint}>Minimum 3, maximum 6 images</Text></View>
            </TouchableOpacity>
          </View>
          <View style={styles.uploadSection}>
            <View style={styles.uploadHeading}><Text style={styles.sectionTitle}>1 Tattoo Reel</Text><Text style={styles.required}>{portfolioVideos.length}/1</Text></View>
            {portfolioVideos.map((item) => <View key={item.storagePath} style={styles.fileRow}><Ionicons name="videocam-outline" size={18} color={theme.colors.accentStrong} /><Text style={styles.fileText} numberOfLines={1}>{item.fileName}</Text></View>)}
            <TouchableOpacity style={styles.uploadButton} onPress={uploadPortfolioVideo} disabled={Boolean(uploading) || portfolioVideos.length >= 3}>
              <Ionicons name="videocam-outline" size={22} color={theme.colors.accent} /><View style={styles.uploadCopy}><Text style={styles.uploadText}>{uploading === 'video' ? 'Uploading...' : 'Add tattoo reel'}</Text><Text style={styles.uploadHint}>One clear reel is mandatory</Text></View>
            </TouchableOpacity>
          </View>
          {field('Instagram / Portfolio', instagramLink, setInstagramLink, { placeholder: 'https://instagram.com/yourstudio' })}
          {field('Website', websiteLink, setWebsiteLink, { optional: true, placeholder: 'https://yourstudio.com' })}
          <View style={styles.uploadSection}>
            <View style={styles.uploadHeading}><Text style={styles.sectionTitle}>Certificate</Text><Text style={styles.optional}>Optional</Text></View>
            {certificate ? <View style={styles.fileRow}><Ionicons name="document-attach-outline" size={18} color={theme.colors.accentStrong} /><Text style={styles.fileText} numberOfLines={1}>{certificate.fileName}</Text></View> : null}
            <TouchableOpacity style={styles.uploadButton} onPress={uploadCertificate} disabled={Boolean(uploading)}><Ionicons name="document-attach-outline" size={22} color={theme.colors.accent} /><Text style={styles.uploadText}>{uploading === 'certificate' ? 'Uploading...' : certificate ? 'Replace certificate' : 'Upload certificate'}</Text></TouchableOpacity>
          </View>
          <View style={styles.buttonRow}><TouchableOpacity style={styles.secondaryButton} onPress={() => setStep(1)}><Text style={styles.secondaryText}>Back</Text></TouchableOpacity><TouchableOpacity style={[styles.primaryButton, styles.flexButton, !portfolioComplete && styles.disabled]} disabled={!portfolioComplete} onPress={() => setStep(3)}><Text style={styles.primaryText}>Continue</Text></TouchableOpacity></View>
        </View>
      );
    }

    if (step === 3) {
      return (
        <View style={styles.stepContent}>
          <View style={styles.founderIcon}><Ionicons name="diamond-outline" size={34} color={theme.colors.accentStrong} /></View>
          <Text style={styles.stepTitle}>Founder Code</Text>
          <Text style={styles.stepSubtitle}>Enter your early-access referral code. Admin will validate unused codes before approval.</Text>
          {field('Referral Code', referralCode, (value) => setReferralCode(value.toUpperCase()), { optional: true, placeholder: 'FOUNDER10-001' })}
          <Text style={styles.codeHint}>{founderCodeHint}</Text>
          <View style={styles.codeExamples}><Text style={styles.codeExample}>FOUNDER10-001</Text><Text style={styles.codeExample}>FOUNDING15-004</Text></View>
          <TouchableOpacity style={styles.primaryButton} onPress={() => setStep(4)}><Text style={styles.primaryText}>Continue</Text><Ionicons name="arrow-forward" size={18} color="#fff" /></TouchableOpacity>
          <TouchableOpacity style={styles.skipButton} onPress={() => { setReferralCode(''); setStep(4); }}><Text style={styles.skipText}>Don't have a code? Skip</Text></TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Review Submission</Text>
        <Text style={styles.stepSubtitle}>Confirm your business details and portfolio before sending it to Tatzo.</Text>
        <View style={styles.reviewSection}>
          {reviewRow('Artist', artistName, 'person-outline')}
          {reviewRow('Studio', studioName, 'business-outline')}
          {reviewRow('Location', [area, city].filter(Boolean).join(', '), 'location-outline')}
          {reviewRow('Experience', experience, 'time-outline')}
          {reviewRow('Styles', stylesList.join(', '), 'color-palette-outline')}
          {reviewRow('Portfolio', `${portfolioImages.length} images · ${portfolioVideos.length} reel`, 'images-outline')}
          {reviewRow('Founder Code', founderCode || 'Skipped', 'ticket-outline')}
        </View>
        {pending && viewSubmission ? <View style={styles.pendingInline}><Ionicons name="hourglass-outline" size={18} color="#F59E0B" /><Text style={styles.pendingInlineText}>This submission is already under review.</Text></View> : null}
        {!pending ? <TouchableOpacity style={[styles.primaryButton, (!requirementsComplete || submitting || Boolean(uploading)) && styles.disabled]} disabled={!requirementsComplete || submitting || Boolean(uploading)} onPress={submit}>{submitting ? <ActivityIndicator color="#fff" /> : <><Text style={styles.primaryText}>Submit Verification</Text><Ionicons name="shield-checkmark-outline" size={18} color="#fff" /></>}</TouchableOpacity> : null}
        <TouchableOpacity style={styles.secondaryButton} onPress={() => pending ? setViewSubmission(false) : setStep(3)}><Text style={styles.secondaryText}>{pending ? 'Back to Status' : 'Back'}</Text></TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerButton} onPress={onClose}><Ionicons name="arrow-back" size={20} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} /></TouchableOpacity>
            <View style={styles.headerCopy}><Text style={styles.title}>Verification</Text><Text style={styles.subtitle}>One-time artist business onboarding</Text></View>
            <TouchableOpacity style={styles.headerButton} onPress={onClose}><Ionicons name="close" size={20} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} /></TouchableOpacity>
          </View>
          {loading ? (
            <View style={styles.loading}><ActivityIndicator color={theme.colors.accent} /></View>
          ) : status === 'approved' ? (
            <View style={styles.stateScreen}>
              <View style={styles.approvedIcon}><Ionicons name="checkmark" size={38} color="#fff" /></View>
              <Text style={styles.stateEyebrow}>VERIFIED</Text>
              <Text style={styles.stateTitle}>{membershipLabel}</Text>
              <Text style={styles.stateText}>Approved on {formatDate(approvedAt)}</Text>
              <View style={styles.benefitList}>{['Upload Posts', 'Upload Reels', 'Receive Bookings'].map((item) => <View key={item} style={styles.benefitRow}><Ionicons name="checkmark-circle" size={19} color="#22C55E" /><Text style={styles.benefitText}>{item}</Text></View>)}</View>
              {onStartPosting ? <TouchableOpacity style={styles.primaryButton} onPress={() => { onClose(); onStartPosting(); }}><Text style={styles.primaryText}>Start Posting</Text><Ionicons name="arrow-forward" size={18} color="#fff" /></TouchableOpacity> : null}
              <TouchableOpacity style={styles.secondaryButton} onPress={onClose}><Text style={styles.secondaryText}>Manage Membership</Text></TouchableOpacity>
            </View>
          ) : pending && !viewSubmission ? (
            <View style={styles.stateScreen}>
              <View style={styles.pendingIcon}><Ionicons name="hourglass-outline" size={34} color="#F59E0B" /></View>
              <Text style={styles.stateEyebrow}>VERIFICATION PENDING</Text>
              <Text style={styles.stateTitle}>We are reviewing your profile.</Text>
              <Text style={styles.stateText}>Estimated review: 24–48 hours</Text>
              <TouchableOpacity style={styles.primaryButton} onPress={() => { setStep(4); setViewSubmission(true); }}><Text style={styles.primaryText}>View Submission</Text></TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.hero}><View style={styles.shieldIcon}><Ionicons name="shield-checkmark-outline" size={26} color={theme.colors.accentStrong} /></View><View style={styles.heroCopy}><Text style={styles.heroTitle}>Become a Verified Artist</Text><Text style={styles.heroText}>Complete your profile to start receiving booking requests.</Text></View></View>
              <View style={styles.progressRow}>{STEPS.map((item, index) => { const active = item.step <= step; return <React.Fragment key={item.step}><View style={styles.progressItem}><View style={[styles.progressCircle, active && styles.progressCircleActive]}><Ionicons name={item.icon} size={15} color={active ? '#fff' : theme.colors.textMuted} /></View><Text style={[styles.progressLabel, active && styles.progressLabelActive]}>{item.label}</Text></View>{index < STEPS.length - 1 ? <View style={[styles.progressLine, item.step < step && styles.progressLineActive]} /> : null}</React.Fragment>; })}</View>
              <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>{renderStep()}</ScrollView>
            </>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
};

const createStyles = (theme: AppTheme) => {
  const text = theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse;
  const divider = theme.mode === 'light' ? 'rgba(20,20,25,0.08)' : 'rgba(255,255,255,0.07)';
  const surface = theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.04)';
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: theme.colors.background },
    flex: { flex: 1 },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: divider },
    headerButton: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: surface },
    headerCopy: { flex: 1, alignItems: 'center', gap: 2 },
    title: { color: text, fontSize: 18, fontWeight: '900' },
    subtitle: { color: theme.colors.textMuted, fontSize: 11, fontWeight: '700' },
    loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    hero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12 },
    shieldIcon: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accentSoft },
    heroCopy: { flex: 1, gap: 3 },
    heroTitle: { color: text, fontSize: 19, fontWeight: '900' },
    heroText: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 17, fontWeight: '700' },
    progressRow: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 18, paddingBottom: 14 },
    progressItem: { width: 64, alignItems: 'center', gap: 5 },
    progressCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: surface },
    progressCircleActive: { backgroundColor: theme.colors.accent },
    progressLabel: { color: theme.colors.textMuted, fontSize: 9, fontWeight: '800', textAlign: 'center' },
    progressLabelActive: { color: theme.colors.accentStrong },
    progressLine: { flex: 1, height: 2, marginTop: 14, backgroundColor: divider },
    progressLineActive: { backgroundColor: theme.colors.accent },
    content: { paddingHorizontal: 18, paddingBottom: 42 },
    stepContent: { gap: 14 },
    stepTitle: { color: text, fontSize: 22, fontWeight: '900' },
    stepSubtitle: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19, fontWeight: '700', marginTop: -7 },
    field: { gap: 6 },
    label: { color: text, fontSize: 12, fontWeight: '900' },
    optional: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '700' },
    required: { color: theme.colors.accentStrong, fontSize: 10, fontWeight: '900' },
    input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: divider, backgroundColor: surface, color: text, paddingHorizontal: 13, paddingVertical: 10, fontWeight: '700' },
    multiline: { minHeight: 92, textAlignVertical: 'top' },
    row: { flexDirection: 'row', gap: 10 },
    uploadSection: { gap: 9, paddingVertical: 4 },
    uploadHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { color: text, fontSize: 14, fontWeight: '900' },
    uploadButton: { minHeight: 58, borderRadius: 16, backgroundColor: surface, flexDirection: 'row', alignItems: 'center', gap: 11, paddingHorizontal: 13, paddingVertical: 9 },
    uploadCopy: { flex: 1, gap: 2 },
    uploadText: { color: text, fontSize: 13, fontWeight: '900' },
    uploadHint: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '700' },
    avatar: { width: 44, height: 44, borderRadius: 22 },
    mediaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    mediaTile: { width: 76, height: 88, borderRadius: 13 },
    fileRow: { minHeight: 44, borderRadius: 13, backgroundColor: surface, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
    fileText: { flex: 1, color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
    feedback: { flexDirection: 'row', gap: 8, borderRadius: 14, padding: 12, backgroundColor: theme.colors.accentSoft },
    feedbackText: { flex: 1, color: text, fontSize: 12, lineHeight: 18, fontWeight: '700' },
    primaryButton: { minHeight: 50, borderRadius: 15, backgroundColor: theme.colors.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 18 },
    primaryText: { color: '#fff', fontSize: 14, fontWeight: '900' },
    secondaryButton: { minHeight: 48, borderRadius: 15, backgroundColor: surface, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
    secondaryText: { color: text, fontSize: 13, fontWeight: '900' },
    buttonRow: { flexDirection: 'row', gap: 10 },
    flexButton: { flex: 1 },
    disabled: { opacity: 0.42 },
    founderIcon: { width: 68, height: 68, borderRadius: 34, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accentSoft, marginTop: 10 },
    codeHint: { color: theme.colors.textMuted, fontSize: 12, textAlign: 'center', fontWeight: '700' },
    codeExamples: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8 },
    codeExample: { color: theme.colors.accentStrong, fontSize: 11, fontWeight: '900', backgroundColor: theme.colors.accentSoft, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
    skipButton: { minHeight: 42, alignItems: 'center', justifyContent: 'center' },
    skipText: { color: theme.colors.accentStrong, fontSize: 12, fontWeight: '900' },
    reviewSection: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: divider },
    reviewRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: divider, paddingVertical: 9 },
    reviewCopy: { flex: 1, gap: 2 },
    reviewLabel: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
    reviewValue: { color: text, fontSize: 13, fontWeight: '800' },
    pendingInline: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, padding: 12, backgroundColor: 'rgba(245,158,11,0.10)' },
    pendingInlineText: { color: text, fontSize: 12, fontWeight: '800' },
    stateScreen: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, gap: 12 },
    approvedIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: '#22C55E', marginBottom: 6 },
    pendingIcon: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,158,11,0.12)', marginBottom: 6 },
    stateEyebrow: { color: theme.colors.accentStrong, fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
    stateTitle: { color: text, fontSize: 23, fontWeight: '900', textAlign: 'center' },
    stateText: { color: theme.colors.textMuted, fontSize: 13, lineHeight: 19, textAlign: 'center', fontWeight: '700' },
    benefitList: { width: '100%', gap: 10, marginVertical: 12 },
    benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingVertical: 3 },
    benefitText: { color: text, fontSize: 14, fontWeight: '800' },
  });
};

export default ArtistVerificationModal;
