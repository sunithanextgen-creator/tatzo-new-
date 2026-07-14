import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, ImageBackground, RefreshControl, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../../../config/firebaseConfig';
import { useAppTheme } from '../../../theme/useAppTheme';
import type { AppTheme } from '../../../theme/theme';
import { createArtistPost, listArtistPostsPage, syncArtistPostVisibilityForUid, type ArtistPostRow } from '../../../services/posts';
import GradientButton from '../../../components/ui/GradientButton';
import { pickSingleImageFromDevice, pickSingleVideoFromDevice, uploadPickedImage, uploadPickedVideo } from '../../../services/mediaUpload';
import { logCrashlyticsError } from '../../../services/crashlytics';

type ArtistPostPanelProps = {
  header?: React.ReactNode;
  onOpenVerification?: () => void;
};

const validHttpUrl = (value: string) => /^https?:\/\//i.test(value.trim());

const toHandle = (name: string) =>
  `@${name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'tatzo_artist'}`;

const PostVideoPreview = ({ uri, style }: { uri: string; style: any }) => {
  const player = useVideoPlayer({ uri }, (videoPlayer) => {
    videoPlayer.loop = true;
    videoPlayer.muted = false;
    videoPlayer.volume = 1;
    videoPlayer.play();
  });

  return <VideoView player={player} style={style} nativeControls={false} contentFit="cover" fullscreenOptions={{ enable: false }} />;
};

const POST_HERO_IMAGE_LIGHT = require('../../../assets/post-create-bg.png');
const POST_HERO_IMAGE_DARK = require('../../../assets/post-create-bg-dark.png');

type ArtistPostGateState = {
  verificationStatus: string;
  postingEnabled?: boolean;
  artistVisible?: boolean;
  bookingVisible?: boolean;
};

const ArtistPostPanel = ({ header, onOpenVerification }: ArtistPostPanelProps) => {
  const { theme } = useAppTheme();
  const { height } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme, height), [theme, height]);
  const postHeroImage = theme.mode === 'dark' ? POST_HERO_IMAGE_DARK : POST_HERO_IMAGE_LIGHT;
  const uid = auth.currentUser?.uid ?? '';

  const [caption, setCaption] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageStoragePath, setImageStoragePath] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [videoStoragePath, setVideoStoragePath] = useState('');
  const [musicText, setMusicText] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [composerMode, setComposerMode] = useState<'chooser' | 'image' | 'reel'>('chooser');
  const [submitting, setSubmitting] = useState(false);

  const [rows, setRows] = useState<ArtistPostRow[]>([]);
  const [cursor, setCursor] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);

  const [artistName, setArtistName] = useState(auth.currentUser?.displayName ?? 'Artist');
  const [artistHandle, setArtistHandle] = useState(toHandle(auth.currentUser?.displayName ?? 'artist'));
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [artistLocation, setArtistLocation] = useState('Location updating');
  const [artistExperience, setArtistExperience] = useState('Experience updating');
  const [userGate, setUserGate] = useState<ArtistPostGateState>({ verificationStatus: 'unsubmitted' });
  const [artistGate, setArtistGate] = useState<ArtistPostGateState>({ verificationStatus: 'unsubmitted' });
  const loadFirstPage = useCallback(async () => {
    if (!uid) return;
    setLoading(true);
    setLoadError(null);
    try {
      const page = await listArtistPostsPage(uid, 10, null);
      setRows(page.rows);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (e: any) {
      const fallback = 'Something went wrong. Try again.';
      setLoadError(fallback);
      Alert.alert('Tatzo', e?.message ?? fallback);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  const loadMore = useCallback(async () => {
    if (!uid || !hasMore || !cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listArtistPostsPage(uid, 10, cursor);
      setRows((prev) => [...prev, ...page.rows]);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch {
      // Ignore pagination failures; first page remains visible.
    } finally {
      setLoadingMore(false);
    }
  }, [uid, hasMore, cursor, loadingMore]);

  const onRefresh = useCallback(async () => {
    if (!uid) return;
    setRefreshing(true);
    setLoadError(null);
    try {
      const page = await listArtistPostsPage(uid, 10, null);
      setRows(page.rows);
      setCursor(page.cursor);
      setHasMore(page.hasMore);
    } catch (e: any) {
      const fallback = 'Something went wrong. Try again.';
      setLoadError(fallback);
      Alert.alert('Tatzo', e?.message ?? fallback);
    } finally {
      setRefreshing(false);
    }
  }, [uid]);

  useEffect(() => {
    if (!uid) return;

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        const profile = snap.data() as any;
        const name = String(profile?.artistName ?? profile?.displayName ?? auth.currentUser?.displayName ?? 'Artist').trim() || 'Artist';
        setArtistName(name);
        setArtistHandle(toHandle(name));
        setProfileImageUrl(String(profile?.profileImageUrl ?? '').trim());
        setArtistLocation(String(profile?.location ?? ([profile?.locationArea, profile?.locationCity].filter(Boolean).join(', ') || 'Location updating')).trim());
        setArtistExperience(String(profile?.experience ?? 'Experience updating').trim() || 'Experience updating');
        setUserGate({
          verificationStatus: String(profile?.verificationStatus ?? 'unsubmitted'),
          postingEnabled: profile?.postingEnabled,
          artistVisible: profile?.artistVisible,
          bookingVisible: profile?.bookingVisible,
        });
      },
      () => {
        const name = String(auth.currentUser?.displayName ?? 'Artist').trim() || 'Artist';
        setArtistName(name);
        setArtistHandle(toHandle(name));
        setProfileImageUrl('');
        setArtistLocation('Location updating');
        setArtistExperience('Experience updating');
        setUserGate({ verificationStatus: 'unsubmitted' });
      },
    );

    const unsubArtist = onSnapshot(
      doc(db, 'artists', uid),
      (snap) => {
        const artist = snap.data() as any;
        if (!artist) {
          setArtistGate({ verificationStatus: 'unsubmitted' });
          return;
        }
        setArtistGate({
          verificationStatus: String(artist?.verificationStatus ?? 'unsubmitted'),
          postingEnabled: artist?.postingEnabled,
          artistVisible: artist?.artistVisible,
          bookingVisible: artist?.bookingVisible,
        });
      },
      () => setArtistGate({ verificationStatus: 'unsubmitted' }),
    );

    void syncArtistPostVisibilityForUid(uid).catch(() => {});
    void loadFirstPage();

    return () => {
      unsubUser();
      unsubArtist();
    };
  }, [uid, loadFirstPage]);

  const imagePostCount = useMemo(() => rows.filter((row) => Boolean(row.imageUrl?.trim())).length, [rows]);
  const reelPostCount = useMemo(() => rows.filter((row) => Boolean(row.videoUrl?.trim())).length, [rows]);
  const totalPortfolioCount = rows.length;
  const artistInitial = (artistName.trim() || 'A').slice(0, 1).toUpperCase();
  const approvalStatus = artistGate.verificationStatus === 'approved' ? artistGate.verificationStatus : userGate.verificationStatus;
  const isApprovedArtist = userGate.verificationStatus === 'approved' || artistGate.verificationStatus === 'approved';
  const postingBlocked =
    !isApprovedArtist ||
    userGate.postingEnabled === false ||
    artistGate.postingEnabled === false ||
    artistGate.artistVisible === false ||
    artistGate.bookingVisible === false;
  const gateTitle = approvalStatus === 'pending_verification' || approvalStatus === 'pending'
    ? 'Verification Pending'
    : approvalStatus === 'needs_more_samples'
      ? 'More Samples Required'
      : approvalStatus === 'rejected'
        ? 'Verification Needs Attention'
        : 'Complete Artist Verification';
  const gateText = approvalStatus === 'pending_verification' || approvalStatus === 'pending'
    ? 'Your artist profile is under admin review. You can start posting once Tatzo approves your portfolio.'
    : 'To start posting on Tatzo, complete your artist profile and submit your portfolio for verification.';
  const verificationRequirements = [
    'Artist name',
    'Studio name',
    'Location',
    'Experience',
    'Styles',
    'Bio',
    'Profile image',
    '3 tattoo images',
    '1 tattoo video',
    'Referral code if Founder/Founding batch',
  ];

  const onCreatePost = async () => {
    if (!uid) return;
    if (uploadingImage || uploadingVideo) {
      Alert.alert('Tatzo', 'Please wait. Media upload is still in progress.');
      return;
    }

    const cleanCaption = caption.trim();
    const cleanImage = imageUrl.trim();
    const cleanVideo = videoUrl.trim();
    if (!cleanCaption && !cleanImage && !cleanVideo) {
      Alert.alert('Tatzo', 'Add a caption, image, or video.');
      return;
    }
    if (cleanImage && !validHttpUrl(cleanImage)) {
      Alert.alert('Tatzo', 'Uploaded image URL is invalid. Please upload again.');
      return;
    }
    if (cleanVideo && !validHttpUrl(cleanVideo)) {
      Alert.alert('Tatzo', 'Uploaded video URL is invalid. Please upload again.');
      return;
    }

    const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean);

    setSubmitting(true);
    try {
      await createArtistPost({
        artistUid: uid,
        artistName,
        artistHandle,
        caption: cleanCaption,
        imageUrl: cleanImage,
        imageStoragePath: imageStoragePath.trim() || undefined,
        videoUrl: cleanVideo,
        videoStoragePath: videoStoragePath.trim() || undefined,
        mediaType: cleanVideo ? 'video' : cleanImage ? 'image' : null,
        tags,
      });

      setCaption('');
      setImageUrl('');
      setImageStoragePath('');
      setVideoUrl('');
      setVideoStoragePath('');
      setTagsText('');
      setLoadError(null);
      await onRefresh();
      Alert.alert('Tatzo', 'Post published.');
    } catch (e: any) {
      void logCrashlyticsError(e, { source: 'artist_post_publish', composerMode, hasImage: Boolean(imageUrl.trim()), hasVideo: Boolean(videoUrl.trim()) });
      Alert.alert('Tatzo', e?.message ?? 'Could not publish post.');
    } finally {
      setSubmitting(false);
    }
  };

  const onPickAndUploadImage = async () => {
    if (!uid || uploadingImage || uploadingVideo || submitting) return;

    try {
      setUploadingImage(true);
      const picked = await pickSingleImageFromDevice();
      if (!picked) return;

      const uploaded = await uploadPickedImage({
        uri: picked.uri,
        fileName: picked.name,
        mimeType: picked.mimeType,
        blob: picked.blob,
        folderPath: `posts/${uid}/images`,
      });

      setImageUrl(uploaded.downloadUrl);
      setImageStoragePath(uploaded.storagePath);
      setVideoUrl('');
      setVideoStoragePath('');
    } catch (e: any) {
      void logCrashlyticsError(e, { source: 'artist_post_image_upload', uid });
      Alert.alert('Tatzo', e?.message ?? 'Could not upload post image.');
    } finally {
      setUploadingImage(false);
    }
  };

  const onPickAndUploadVideo = async () => {
    if (!uid || uploadingVideo || uploadingImage || submitting) return;

    try {
      setUploadingVideo(true);
      const picked = await pickSingleVideoFromDevice();
      if (!picked) return;

      const uploaded = await uploadPickedVideo({
        uri: picked.uri,
        fileName: picked.name,
        mimeType: picked.mimeType,
        blob: picked.blob,
        folderPath: `posts/${uid}/videos`,
      });

      setVideoUrl(uploaded.downloadUrl);
      setVideoStoragePath(uploaded.storagePath);
      setImageUrl('');
      setImageStoragePath('');
    } catch (e: any) {
      void logCrashlyticsError(e, { source: 'artist_post_video_upload', uid });
      Alert.alert('Tatzo', e?.message ?? 'Could not upload reel/video.');
    } finally {
      setUploadingVideo(false);
    }
  };

  const renderMediaPreview = () => {
    if (videoUrl.trim()) return <PostVideoPreview uri={videoUrl.trim()} style={styles.previewImage} />;
    if (imageUrl.trim()) return <Image source={{ uri: imageUrl.trim() }} style={styles.previewImage} resizeMode="cover" />;
    return null;
  };

  const renderPostMedia = (item: ArtistPostRow) => {
    if (item.videoUrl?.trim()) return <PostVideoPreview uri={item.videoUrl.trim()} style={styles.recentImage} />;
    if (item.imageUrl?.trim()) return <Image source={{ uri: item.imageUrl.trim() }} style={styles.recentImage} resizeMode="cover" />;
    return <Text style={styles.url} numberOfLines={1}>No media uploaded yet.</Text>;
  };

  return (
    <FlatList
      data={[]}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      onEndReachedThreshold={0.55}
      onEndReached={loadMore}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.accentStrong} />}
      renderItem={() => null}
      ListHeaderComponent={
        <View style={styles.headWrap}>
          {header ? <View style={styles.externalHeader}>{header}</View> : null}
          <View style={styles.composerShell}>
            <View style={styles.composerTop}>
              {composerMode !== 'chooser' ? (
                <TouchableOpacity activeOpacity={0.9} onPress={() => setComposerMode('chooser')} style={styles.backBtn}>
                  <Ionicons name="arrow-back" size={16} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
                </TouchableOpacity>
              ) : null}
              <Text style={styles.composerTitle}>{composerMode === 'reel' ? 'Create Reel' : 'Create Post'}</Text>
            </View>

            {composerMode === 'chooser' ? (
              postingBlocked ? (
                <View style={styles.lockedCard}>
                  <View style={styles.lockIcon}>
                    <Ionicons name={approvalStatus === 'pending_verification' || approvalStatus === 'pending' ? 'hourglass-outline' : 'lock-closed-outline'} size={26} color={theme.colors.accentStrong} />
                  </View>
                  <Text style={styles.lockTitle}>{gateTitle}</Text>
                  <Text style={styles.lockText}>{gateText}</Text>
                  <View style={styles.requirementsCard}>
                    {verificationRequirements.map((item) => (
                      <View key={item} style={styles.requirementRow}>
                        <Ionicons name="checkmark-circle-outline" size={15} color={theme.colors.accentStrong} />
                        <Text style={styles.requirementText}>{item}</Text>
                      </View>
                    ))}
                  </View>
                  <TouchableOpacity activeOpacity={0.9} style={styles.verifyButton} onPress={onOpenVerification}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.textInverse} />
                    <Text style={styles.verifyButtonText}>{approvalStatus === 'pending_verification' || approvalStatus === 'pending' ? 'View Verification' : 'Submit Verification'}</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <ImageBackground source={postHeroImage} style={styles.heroBackground} imageStyle={styles.heroBackgroundImage} resizeMode={theme.mode === 'dark' ? 'contain' : 'cover'}>
                  <View style={styles.heroOverlay} />
                  <View style={styles.heroCopy}>
                    <Text style={styles.heroTitle}>Share your work</Text>
                    <Text style={styles.heroSub}>Show your tattoo art beautifully.</Text>
                  </View>

                  <View style={styles.heroChoiceStack}>
                    <TouchableOpacity activeOpacity={0.92} onPress={() => setComposerMode('image')} style={styles.choiceCard}>
                      <View style={styles.choiceIcon}>
                        <Ionicons name="image-outline" size={18} color={theme.colors.accentStrong} />
                      </View>
                      <View style={styles.choiceCopy}>
                        <Text style={styles.choiceTitle}>Creative image</Text>
                        <Text style={styles.choiceSub}>Post a still tattoo piece</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                    </TouchableOpacity>

                    <TouchableOpacity activeOpacity={0.92} onPress={() => setComposerMode('reel')} style={styles.choiceCard}>
                      <View style={styles.choiceIcon}>
                        <Ionicons name="videocam-outline" size={18} color={theme.colors.accentStrong} />
                      </View>
                      <View style={styles.choiceCopy}>
                        <Text style={styles.choiceTitle}>Creative film</Text>
                        <Text style={styles.choiceSub}>Post a reel or motion clip</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                    </TouchableOpacity>
                  </View>
                </ImageBackground>
              )
            ) : (
              <View style={styles.formCard}>
                <TouchableOpacity
                  activeOpacity={0.92}
                  style={[styles.previewShell, !(imageUrl.trim() || videoUrl.trim()) && styles.previewShellEmpty]}
                  onPress={composerMode === 'reel' ? onPickAndUploadVideo : onPickAndUploadImage}
                  disabled={uploadingImage || uploadingVideo || submitting}
                >
                  {renderMediaPreview() ? (
                    <>
                      {renderMediaPreview()}
                      <TouchableOpacity
                        activeOpacity={0.9}
                        style={styles.previewClose}
                        onPress={() => {
                          setImageUrl('');
                          setImageStoragePath('');
                          setVideoUrl('');
                          setVideoStoragePath('');
                        }}
                      >
                        <Ionicons name="close" size={14} color="#fff" />
                      </TouchableOpacity>
                      {videoUrl.trim() ? (
                        <View style={styles.videoDurationPill}>
                          <Text style={styles.videoDurationText}>0:15</Text>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <View style={styles.previewPlaceholder}>
                      <Ionicons name={composerMode === 'reel' ? 'videocam-outline' : 'image-outline'} size={28} color={theme.colors.textMuted} />
                      <Text style={styles.mediaHint}>{composerMode === 'reel' ? 'Upload reel / video' : 'Upload image post'}</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <Text style={styles.captionLabel}>Caption</Text>
                <TextInput
                  value={caption}
                  onChangeText={setCaption}
                  style={[styles.input, styles.captionInput]}
                  multiline
                  placeholder="Tell people about this tattoo..."
                  placeholderTextColor={theme.colors.textMuted}
                  maxLength={220}
                />
                <Text style={styles.captionCount}>{caption.length}/220</Text>

                <Text style={styles.audioNote}>
                  <Text style={styles.audioNoteStrong}>🎵 Currently, Tatzo supports original audio uploads only.</Text>{' '}
                  <Text style={styles.audioNoteUnderline}>Music library integration</Text> will be introduced in future updates.
                </Text>

                <>
                  <Text style={styles.captionLabel}>Tag your creative art</Text>
                  <TextInput
                    value={tagsText}
                    onChangeText={setTagsText}
                    style={styles.input}
                    placeholder="Type your art tags, separated by commas"
                    placeholderTextColor={theme.colors.textMuted}
                  />
                </>

                <GradientButton title={submitting ? (composerMode === 'reel' ? 'Posting Reel...' : 'Posting Image...') : composerMode === 'reel' ? 'Post Reel' : 'Post Image'} loading={submitting} onPress={onCreatePost} />
              </View>
            )}
          </View>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>Published posts are hidden from this compose screen.</Text>}
    />
  );
};

const createStyles = (theme: AppTheme, screenHeight: number) =>
  StyleSheet.create({
    content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 120, gap: 12 },
    headWrap: { gap: 12, marginBottom: 2 },
    externalHeader: { gap: 12 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sectionTitle: { color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse, fontSize: theme.typography.title, fontFamily: theme.fonts.display },
    sectionBadge: { color: theme.colors.accent, backgroundColor: theme.colors.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, fontSize: theme.typography.caption, fontWeight: '700', borderWidth: 1, borderColor: theme.colors.accent },
    quoteCard: { borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.045)', padding: 14, gap: 4 },
    quoteTitle: { color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse, fontSize: 16, fontWeight: '900' },
    quoteSub: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700', lineHeight: 17 },
    composerShell: {
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? '#FFFFFF' : theme.colors.surface,
      padding: 12,
      gap: 12,
      overflow: 'hidden',
      position: 'relative',
    },
    composerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 24,
    },
    backBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.05)' : 'rgba(255,255,255,0.05)',
    },
    composerTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '800',
    },
    heroBackground: {
      width: '100%',
      minHeight: Math.max(400, screenHeight - 340),
      borderRadius: 20,
      overflow: 'hidden',
      justifyContent: 'space-between',
      backgroundColor: '#000000',
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    heroBackgroundImage: {
      borderRadius: 20,
      opacity: theme.mode === 'light' ? 0.88 : 0.78,
    },
    heroOverlay: {
      ...StyleSheet.absoluteFillObject,
      borderRadius: 20,
      backgroundColor: theme.mode === 'light' ? 'rgba(255, 255, 255, 0.02)' : 'rgba(0, 0, 0, 0.08)',
    },
    heroCopy: {
      paddingTop: 8,
      gap: 4,
    },
    heroTitle: {
      color: '#ffffff',
      fontSize: theme.typography.display - 2,
      fontWeight: '900',
      lineHeight: theme.typography.display + 3,
      maxWidth: 200,
    },
    heroSub: {
      color: 'rgba(255,255,255,0.8)',
      fontSize: theme.typography.body - 1,
      fontWeight: '700',
    },
    heroChoiceStack: {
      gap: 10,
      marginTop: 14,
    },
    choiceCard: {
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.08)',
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.9)' : 'rgba(20,20,20,0.9)',
      minHeight: 66,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    choiceIcon: {
      width: 36,
      height: 36,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    choiceCopy: {
      flex: 1,
      gap: 3,
    },
    choiceTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: theme.typography.bodyLg - 1,
      fontWeight: '900',
    },
    choiceSub: {
      color: theme.colors.textMuted,
      fontSize: Math.max(10, theme.typography.caption - 1),
      fontWeight: '700',
    },
    lockedCard: {
      borderRadius: 22,
      borderWidth: 1,
      borderColor: theme.mode === 'light' ? 'rgba(168,85,247,0.22)' : 'rgba(0,212,255,0.18)',
      backgroundColor: theme.mode === 'light' ? 'rgba(255,255,255,0.96)' : 'rgba(255,255,255,0.045)',
      padding: 16,
      gap: 12,
      alignItems: 'center',
    },
    lockIcon: {
      width: 54,
      height: 54,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.accentSoft,
      borderWidth: 1,
      borderColor: theme.colors.accent,
    },
    lockTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 19,
      fontWeight: '900',
      textAlign: 'center',
    },
    lockText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
      lineHeight: 19,
      textAlign: 'center',
    },
    requirementsCard: {
      alignSelf: 'stretch',
      borderRadius: 18,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.035)' : 'rgba(0,0,0,0.18)',
      padding: 12,
      gap: 8,
    },
    requirementRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    requirementText: {
      flex: 1,
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
    },
    verifyButton: {
      alignSelf: 'stretch',
      minHeight: 48,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      backgroundColor: theme.colors.accent,
    },
    verifyButtonText: {
      color: theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    profileCard: { borderRadius: 24, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.045)', padding: 12, gap: 10 },
    profileTopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    profileAvatar: { width: 72, height: 72, borderRadius: 36, borderWidth: 2, borderColor: theme.colors.accentStrong, backgroundColor: theme.colors.backgroundAlt },
    profileAvatarFallback: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.colors.accentSoft, borderWidth: 1, borderColor: theme.colors.border },
    profileAvatarText: { color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse, fontSize: 26, fontWeight: '900' },
    profileCopy: { flex: 1, minWidth: 0, gap: 4 },
    profileName: { color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse, fontSize: 20, fontWeight: '900' },
    profileHandle: { color: theme.colors.accentStrong, fontSize: 12, fontWeight: '900', letterSpacing: 0.4 },
    profileMeta: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
    profileStatsRow: { flexDirection: 'row', gap: 6 },
    profileStat: { flex: 1, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.03)' : 'rgba(255,255,255,0.04)', alignItems: 'center', paddingVertical: 9 },
    profileStatValue: { color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse, fontSize: 15, fontWeight: '900' },
    profileStatLabel: { color: theme.colors.textMuted, fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.6 },
    profileHint: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700', lineHeight: 17 },
    formCard: { borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.mode === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.03)', padding: 10, gap: 8 },
    label: { color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' },
    input: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(255, 255, 255, 0.06)', color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse, paddingHorizontal: 11, paddingVertical: 9, fontSize: 12 },
    multiline: { minHeight: 78, textAlignVertical: 'top' },
    mediaHint: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: -2 },
    previewShell: {
      width: '100%',
      aspectRatio: 4 / 5,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.04)' : '#111218',
      overflow: 'hidden',
      position: 'relative',
    },
    previewShellEmpty: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
    },
    previewPlaceholder: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    previewImage: { width: '100%', height: '100%' },
    previewClose: {
      position: 'absolute',
      right: 10,
      top: 10,
      width: 24,
      height: 24,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(0,0,0,0.55)',
      zIndex: 2,
    },
    videoDurationPill: {
      position: 'absolute',
      right: 10,
      bottom: 10,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    videoDurationText: {
      color: '#fff',
      fontSize: 10,
      fontWeight: '800',
    },
    recentImage: { width: '100%', aspectRatio: 4 / 5, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.backgroundAlt, overflow: 'hidden' },
    uploadBtn: { borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, minHeight: 42, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    uploadBtnDisabled: { opacity: 0.65 },
    uploadBtnText: { color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse, fontSize: 12, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
    card: { borderRadius: 20, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, padding: 12, gap: 8 },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
    caption: { flex: 1, color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse, fontSize: 13, fontWeight: '800', lineHeight: 18 },
    meta: { color: theme.colors.accent, fontSize: 11, fontWeight: '900', letterSpacing: 0.9, textTransform: 'uppercase' },
    url: { color: theme.colors.textMuted, fontSize: 12, fontWeight: '700' },
    tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
    tagPill: { borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.mode === 'light' ? 'rgba(11,11,15,0.04)' : 'rgba(255,255,255,0.05)', paddingHorizontal: 10, paddingVertical: 7 },
    tagPillActive: { borderColor: theme.colors.accent, backgroundColor: theme.colors.accentSoft },
    tagText: { color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse, fontSize: 11, fontWeight: '700' },
    tagTextActive: { color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse },
    tagAdd: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
    },
    captionLabel: { color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse, fontSize: theme.typography.body, fontWeight: '800' },
    captionInput: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    captionCount: {
      alignSelf: 'flex-end',
      color: theme.colors.textMuted,
      fontSize: 10,
      fontWeight: '700',
      marginTop: -4,
    },
    audioNote: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 18,
      marginTop: -2,
    },
    audioNoteStrong: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '900',
    },
    audioNoteUnderline: {
      color: theme.colors.accentStrong,
      fontSize: 12,
      fontWeight: '900',
      textDecorationLine: 'underline',
    },
    empty: { color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 16 },
    loadMoreBtn: { marginTop: 6, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 16, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingHorizontal: 12, paddingVertical: 8 },
    loadMoreText: { color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse, fontSize: 12, fontWeight: '800' },
    footer: { color: theme.colors.textMuted, textAlign: 'center', fontSize: 12, paddingVertical: 12 },
  });

export default ArtistPostPanel;
