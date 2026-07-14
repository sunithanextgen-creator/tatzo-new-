import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '../../theme/useAppTheme';
import type { AppTheme } from '../../theme/theme';
import type { DummyArtist } from '../../data/dummyArtists';
import { evaluateSkinChecker, skinCheckerQuestions, type SkinCheckerFlag } from '../../data/skinChecker';
import { createBooking, listLockedSlotsForArtistDate } from '../../services/bookings';
import { pickSingleImageFromDevice, pickSingleVideoFromDevice, uploadPickedImage, uploadPickedVideo, type UploadedMedia } from '../../services/mediaUpload';
import { auth } from '../../config/firebaseConfig';
import type { TimeSlotId } from '../../types/app';
import GradientButton from '../ui/GradientButton';
import CalendarPickerModal from './CalendarPickerModal';
import { ANALYTICS_EVENTS, trackAnalyticsEventOnce } from '../../services/analytics/analytics';
import { logCrashlyticsError } from '../../services/crashlytics';

type BookingFlowModalProps = {
  visible: boolean;
  artist: DummyArtist | null;
  onClose: () => void;
};

type Step = 'gate' | 'skin' | 'result' | 'slot' | 'done';
type SubmitStage = 'idle' | 'checking' | 'uploading' | 'submitting';

const pad2 = (n: number) => `${n}`.padStart(2, '0');
const toISODate = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const WEEKDAY_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const WEEKDAY_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MAX_TATTOO_DETAILS = 500;
const MB = 1024 * 1024;

const DEFAULT_SLOT_OPTIONS: Array<{ id: TimeSlotId; label: string; helper: string }> = [
  { id: 'morning', label: '10:00 AM', helper: 'Morning' },
  { id: 'afternoon', label: '01:00 PM', helper: 'Afternoon' },
  { id: 'evening', label: '05:00 PM', helper: 'Evening' },
];

const parseTimeToMinutes = (value?: string) => {
  const raw = String(value ?? '').trim();
  const match = /^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i.exec(raw);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2] ?? 0);
  const meridiem = match[3].toUpperCase();
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) return null;
  if (meridiem === 'PM' && hours !== 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

const formatMinutesAsTime = (minutes: number) => {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hours24 = Math.floor(normalized / 60);
  const mins = normalized % 60;
  const meridiem = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;
  return `${pad2(hours12)}:${pad2(mins)} ${meridiem}`;
};

const helperForMinutes = (minutes: number) => {
  const hour = Math.floor(minutes / 60);
  if (hour < 12) return 'Morning';
  if (hour < 17) return 'Afternoon';
  return 'Evening';
};

const getGeneratedSlotOptions = (startTime?: string, endTime?: string): Array<{ id: TimeSlotId; label: string; helper: string }> => {
  const start = parseTimeToMinutes(startTime);
  const end = parseTimeToMinutes(endTime);
  if (start == null || end == null || end <= start) return DEFAULT_SLOT_OPTIONS;
  const slots: Array<{ id: TimeSlotId; label: string; helper: string }> = [];
  for (let minutes = start; minutes < end; minutes += 180) {
    const label = formatMinutesAsTime(minutes);
    slots.push({
      id: `time_${pad2(Math.floor(minutes / 60))}${pad2(minutes % 60)}`,
      label,
      helper: helperForMinutes(minutes),
    });
  }
  return slots.length ? slots : DEFAULT_SLOT_OPTIONS;
};

const getDateOptions = () =>
  Array.from({ length: 7 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index + 1);
    return {
      iso: toISODate(date),
      day: WEEKDAY_SHORT[date.getDay()],
      dayName: WEEKDAY_LONG[date.getDay()],
      date: date.getDate(),
      full: date.toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'short', year: 'numeric' }),
    };
  });

const formatFileSize = (size?: number) => {
  if (!size || size <= 0) return '';
  return `${(size / MB).toFixed(size >= MB ? 1 : 2)} MB`;
};

const BookingFlowModal = ({ visible, artist, onClose }: BookingFlowModalProps) => {
  const { theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme, insets.bottom), [theme, insets.bottom]);

  const [step, setStep] = useState<Step>('gate');
  const [qIndex, setQIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flag, setFlag] = useState<SkinCheckerFlag>('GREEN');
  const [score, setScore] = useState(0);
  const [riskStatus, setRiskStatus] = useState<'safe' | 'warning' | 'unsafe'>('safe');
  const [riskNotes, setRiskNotes] = useState('');

  const [dateISO, setDateISO] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return toISODate(d);
  });
  const [slotId, setSlotId] = useState<TimeSlotId>('morning');
  const [submitStage, setSubmitStage] = useState<SubmitStage>('idle');
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [timePickerOpen, setTimePickerOpen] = useState(false);
  const [referenceImage, setReferenceImage] = useState<UploadedMedia | null>(null);
  const [lockedSlotIds, setLockedSlotIds] = useState<TimeSlotId[]>([]);
  const [pendingReference, setPendingReference] = useState<{
    uri: string;
    name: string;
    mimeType: string;
    blob?: Blob;
  } | null>(null);
  const [budgetRange, setBudgetRange] = useState('');
  const [tattooDetails, setTattooDetails] = useState('');
  const dateOptions = useMemo(() => getDateOptions(), []);
  const slotOptions = useMemo(() => getGeneratedSlotOptions(artist?.startTime, artist?.endTime), [artist?.startTime, artist?.endTime]);

  useEffect(() => {
    if (!slotOptions.some((slot) => slot.id === slotId)) {
      setSlotId(slotOptions[0]?.id ?? 'morning');
    }
  }, [slotId, slotOptions]);

  useEffect(() => {
    if (lockedSlotIds.includes(slotId)) {
      setSlotId(slotOptions.find((slot) => !lockedSlotIds.includes(slot.id))?.id ?? '');
    }
  }, [lockedSlotIds, slotId, slotOptions]);

  useEffect(() => {
    let active = true;
    if (!artist?.id || !dateISO) {
      setLockedSlotIds([]);
      return () => {
        active = false;
      };
    }
    listLockedSlotsForArtistDate({ artistUid: artist.id, dateISO })
      .then((slots) => {
        if (active) setLockedSlotIds(slots);
      })
      .catch(() => {
        if (active) setLockedSlotIds([]);
      });
    return () => {
      active = false;
    };
  }, [artist?.id, dateISO]);

  const reset = () => {
    setStep('gate');
    setQIndex(0);
    setAnswers({});
    setFlag('GREEN');
    setScore(0);
    setRiskStatus('safe');
    setRiskNotes('');
    const d = new Date();
    d.setDate(d.getDate() + 2);
    setDateISO(toISODate(d));
    setSlotId('morning');
    setSubmitStage('idle');
    setCalendarOpen(false);
    setTimePickerOpen(false);
    setReferenceImage(null);
    setPendingReference(null);
    setBudgetRange('');
    setTattooDetails('');
  };

  const close = () => {
    reset();
    onClose();
  };

  if (!artist) return null;

  const isBusy = submitStage !== 'idle';
  const stepProgress =
    step === 'gate'
      ? { current: 1, total: 4, label: 'Tattoo Readiness Check' }
      : step === 'skin'
        ? { current: 1, total: 4, label: 'Tattoo Readiness Check' }
        : step === 'result'
          ? { current: 2, total: 4, label: 'Risk Review' }
          : step === 'slot'
            ? { current: 3, total: 4, label: 'Booking Details' }
            : { current: 4, total: 4, label: 'Submitted' };

  const q = skinCheckerQuestions[qIndex];
  const isLast = qIndex === skinCheckerQuestions.length - 1;
  const selectedDate = dateOptions.find((item) => item.iso === dateISO);
  const selectedSlot = slotOptions.find((slot) => slot.id === slotId) ?? slotOptions[0];
  const referenceIsVideo = (pendingReference?.mimeType || referenceImage?.mimeType) === 'video/mp4';
  const allowedDays = artist.availableDays?.length ? artist.availableDays : WEEKDAY_LONG.slice(1, 7);
  const isUnavailableArtist = artist.availabilityStatus === 'unavailable' || artist.bookingEnabled === false;
  const isOnVacation = Boolean(artist.vacationReturnDate && artist.status?.toLowerCase().includes('vacation'));
  const selectedDateUnavailable =
    isUnavailableArtist || isOnVacation || (selectedDate ? !allowedDays.includes(selectedDate.dayName) : false);
  const selectedSlotUnavailable = selectedDateUnavailable || lockedSlotIds.includes(slotId);
  const bookingDisabledMessage = isOnVacation
    ? artist.vacationReturnDate
      ? `On Vacation · Available again on ${artist.vacationReturnDate}`
      : 'On Vacation'
    : isUnavailableArtist
      ? artist.bookingDisabledMessage || 'Currently unavailable'
      : 'Available this week';
  const detailsValid = tattooDetails.trim().length <= MAX_TATTOO_DETAILS;
  const canSubmitRequest = !isBusy && Boolean(dateISO) && Boolean(slotId) && !selectedDateUnavailable && !selectedSlotUnavailable && detailsValid;

  const pickReferenceMedia = async (type: 'image' | 'video') => {
    try {
      const picked = type === 'video' ? await pickSingleVideoFromDevice() : await pickSingleImageFromDevice();
      if (!picked) return;
      setPendingReference(picked);
      setReferenceImage(null);
    } catch (error: any) {
      Alert.alert('Tatzo', error?.message ?? 'Could not select reference. Please try again.');
    }
  };

  const openReferencePicker = () => {
    Alert.alert('Upload reference', 'Choose an image or MP4 video reference.', [
      { text: 'Image', onPress: () => void pickReferenceMedia('image') },
      { text: 'Video', onPress: () => void pickReferenceMedia('video') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removeReferenceImage = () => {
    setPendingReference(null);
    setReferenceImage(null);
  };

  const continueAfterRisk = () => {
    if (riskStatus === 'safe') {
      setStep('slot');
      return;
    }

    const title = riskStatus === 'unsafe' ? 'High Risk Warning' : 'Skin Warning';
    const message =
      riskStatus === 'unsafe'
        ? 'Tattoo Readiness Check flagged an unsafe skin condition. Proceed only if you understand the risk and will consult the artist carefully.'
        : 'Tattoo Readiness Check flagged moderate risk. Proceed only if you understand the precautions.';

    Alert.alert('Tatzo', `${title}\n\n${message}`, [
      { text: 'Go Back', style: 'cancel' },
      { text: 'I Understand, Continue', onPress: () => setStep('slot') },
    ]);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 24 : 0}
        style={styles.keyboardWrap}
      >
        <View style={styles.sheet}>
          <View style={[styles.header, step === 'slot' && styles.headerBooking]}>
          {step === 'slot' ? (
            <Pressable onPress={() => setStep('result')} style={styles.iconBtn}>
              <Ionicons name="arrow-back" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
            </Pressable>
          ) : null}
          <View style={styles.headerCopy}>
            <Text style={styles.title}>{step === 'slot' ? 'Booking Details' : 'Book Artist'}</Text>
            <Text style={styles.stepMeta}>
              {step === 'slot'
                ? `Step ${stepProgress.current} of ${stepProgress.total} - Select date, time and reference.`
                : `Step ${stepProgress.current} of ${stepProgress.total} - ${stepProgress.label}`}
            </Text>
          </View>
          <Pressable onPress={close} style={styles.iconBtn}>
            <Ionicons name="close" size={18} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
          </Pressable>
        </View>

        <View style={styles.stepTrack}>
          {Array.from({ length: stepProgress.total }).map((_, index) => {
            const active = index + 1 <= stepProgress.current;
            return <View key={`step-${index}`} style={[styles.stepDot, active && styles.stepDotActive]} />;
          })}
        </View>
        <View style={styles.progressLabelRow}>
          <Text style={styles.progressLabel}>Readiness</Text>
          <Text style={styles.progressLabel}>Review</Text>
          <Text style={styles.progressLabel}>Details</Text>
          <Text style={styles.progressLabel}>Request</Text>
        </View>

        <ScrollView style={styles.sheetBody} contentContainerStyle={styles.sheetBodyContent} showsVerticalScrollIndicator={false}>
        {step === 'gate' ? (
          <View style={styles.body}>
            <Text style={styles.h1}>Before booking</Text>
            <Text style={styles.p}>
              Please complete Tattoo Readiness Check first. It helps the artist review your skin condition safely before approval.
            </Text>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{artist.name}</Text>
              <Text style={styles.cardSub}>
                {artist.location} | Starting from Rs. {artist.startingFrom ?? 0}+
              </Text>
            </View>
            <GradientButton title="Start Tattoo Readiness Check" onPress={() => setStep('skin')} />
          </View>
        ) : null}

        {step === 'skin' ? (
          <View style={styles.body}>
            <View style={styles.progressRow}>
              <Text style={styles.progressText}>
                Question {qIndex + 1}/{skinCheckerQuestions.length}
              </Text>
              <Text style={styles.progressText}>Tattoo Readiness Check</Text>
            </View>
            <Text style={styles.h1}>{q.title}</Text>
            {q.help ? <Text style={styles.p}>{q.help}</Text> : null}

            <View style={styles.options}>
              {q.options.map((opt) => {
                const active = answers[q.id] === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    activeOpacity={0.9}
                    onPress={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                    style={[styles.option, active && styles.optionActive]}
                  >
                    <Text style={[styles.optionText, active && styles.optionTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={styles.navRow}>
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={qIndex === 0}
                onPress={() => setQIndex((i) => Math.max(0, i - 1))}
                style={[styles.secondaryBtn, qIndex === 0 && styles.btnDisabled]}
              >
                <Ionicons name="chevron-back" size={18} color={theme.colors.accent} />
                <Text style={styles.secondaryText}>Back</Text>
              </TouchableOpacity>
              <View style={styles.navGrow}>
                <GradientButton
                  title={isLast ? 'Get Result' : 'Next'}
                  disabled={!answers[q.id]}
                  onPress={() => {
                    if (!answers[q.id]) return;
                    if (!isLast) {
                      setQIndex((i) => i + 1);
                      return;
                    }

                    const evald = evaluateSkinChecker(answers);
                    setFlag(evald.flag);
                    setScore(evald.score);
                    setRiskStatus(evald.status);
                    setRiskNotes(evald.notes);
                    setStep('result');
                  }}
                  size="md"
                />
              </View>
            </View>
          </View>
        ) : null}

        {step === 'result' ? (
          <View style={styles.body}>
            <Text style={styles.h1}>Tattoo Readiness Result</Text>
            <View
              style={[
                styles.flagCard,
                riskStatus === 'safe' ? styles.flagGreen : riskStatus === 'warning' ? styles.flagWarn : styles.flagRed,
              ]}
            >
              <Text style={styles.flagText}>{flag}</Text>
              <Text style={styles.flagSub}>Risk Score: {score}</Text>
            </View>

            <Text style={styles.p}>{riskNotes}</Text>

            {riskStatus === 'unsafe' ? (
              <Text style={styles.warnText}>Strong warning: consider dermatologist review before tattoo booking.</Text>
            ) : null}

            <View style={styles.navRow}>
              <TouchableOpacity activeOpacity={0.9} onPress={() => setStep('skin')} style={styles.secondaryBtn}>
                <Ionicons name="create-outline" size={18} color={theme.colors.accent} />
                <Text style={styles.secondaryText}>Review Answers</Text>
              </TouchableOpacity>
              <View style={styles.navGrow}>
                <GradientButton
                  title={riskStatus === 'safe' ? 'Continue to Slot' : 'Continue with Warning'}
                  onPress={continueAfterRisk}
                  size="md"
                />
              </View>
            </View>
          </View>
        ) : null}

        {step === 'slot' ? (
          <View style={styles.bookingBody}>
            <View style={styles.artistSummaryCard}>
              <Image
                source={{ uri: artist.profileImageUrl || `https://api.dicebear.com/8.x/initials/png?seed=${encodeURIComponent(artist.name)}` }}
                style={styles.artistAvatar}
              />
              <View style={styles.artistSummaryCopy}>
                <View style={styles.artistNameRow}>
                  <Text style={styles.artistName}>{artist.name}</Text>
                  {artist.verified ? <Ionicons name="checkmark-circle" size={17} color="#38BDF8" /> : null}
                </View>
                <Text style={styles.artistMeta}>{artist.studioName || artist.specialty || 'Tatzo Artist'}</Text>
                <Text style={styles.artistMeta}>{artist.location}</Text>
                <View style={[styles.availabilityPill, (isUnavailableArtist || isOnVacation) && styles.availabilityPillWarn]}>
                  <View style={[styles.availabilityDot, (isUnavailableArtist || isOnVacation) && styles.availabilityDotWarn]} />
                  <Text style={[styles.availabilityText, (isUnavailableArtist || isOnVacation) && styles.availabilityTextWarn]}>
                    {bookingDisabledMessage}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.bookingSection}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="calendar-outline" size={20} color={theme.colors.accent} />
                <Text style={styles.sectionTitle}>1. Select Date</Text>
              </View>
              <TouchableOpacity activeOpacity={0.9} onPress={() => setCalendarOpen(true)} style={styles.pickerField}>
                <View style={styles.pickerIcon}>
                  <Ionicons name="calendar-clear-outline" size={18} color={theme.colors.accent} />
                </View>
                <View style={styles.pickerCopy}>
                  <Text style={styles.pickerLabel}>Preferred date</Text>
                  <Text style={styles.pickerValue}>{selectedDate?.full ?? dateISO}</Text>
                </View>
                <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
              {selectedDateUnavailable ? (
                <View style={styles.errorCard}>
                  <Ionicons name="alert-circle-outline" size={20} color="#FB7185" />
                  <Text style={styles.errorText}>This date is unavailable. Please choose another date.</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.bookingSection}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="time-outline" size={21} color={theme.colors.accent} />
                <Text style={styles.sectionTitle}>2. Select Time</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.9}
                disabled={selectedDateUnavailable}
                onPress={() => setTimePickerOpen(true)}
                style={[styles.pickerField, selectedDateUnavailable && styles.pickerFieldDisabled]}
              >
                <View style={styles.pickerIcon}>
                  <Ionicons name="time-outline" size={18} color={theme.colors.accent} />
                </View>
                <View style={styles.pickerCopy}>
                  <Text style={styles.pickerLabel}>Preferred time</Text>
                  <Text style={styles.pickerValue}>{selectedSlot?.label ?? 'Choose time'}</Text>
                </View>
                <Ionicons name="chevron-down" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
              <View style={styles.selectedDateRow}>
                <Ionicons name="time-outline" size={16} color={theme.colors.textMuted} />
                <Text style={styles.selectedDateText}>Working Hours: {artist.startTime || '10:00 AM'} - {artist.endTime || '8:00 PM'}</Text>
              </View>
              {selectedSlotUnavailable ? (
                <View style={styles.errorCard}>
                  <Ionicons name="alert-circle-outline" size={20} color="#FB7185" />
                  <Text style={styles.errorText}>This slot is unavailable. Please choose another time.</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.bookingSection}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="cloud-upload-outline" size={21} color={theme.colors.accent} />
                <Text style={styles.sectionTitle}>3. Upload Reference</Text>
              </View>
              {pendingReference || referenceImage ? (
                <View style={styles.referencePreviewRow}>
                  {referenceIsVideo ? (
                    <View style={[styles.referenceThumb, styles.referenceVideoThumb]}>
                      <Ionicons name="play" size={18} color={theme.colors.accent} />
                    </View>
                  ) : (
                    <Image source={{ uri: pendingReference?.uri || referenceImage?.downloadUrl }} style={styles.referenceThumb} />
                  )}
                  <View style={styles.referenceCopy}>
                    <Text style={styles.referenceTitle} numberOfLines={1}>{pendingReference?.name || referenceImage?.fileName || 'Reference media'}</Text>
                    <Text style={styles.referenceSub}>{formatFileSize(referenceImage?.size)} {referenceImage ? 'uploaded' : 'ready to upload'}</Text>
                  </View>
                  <TouchableOpacity activeOpacity={0.9} onPress={removeReferenceImage} style={styles.removeImageBtn}>
                    <Ionicons name="close" size={16} color={theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity activeOpacity={0.9} onPress={openReferencePicker} style={styles.uploadCard}>
                  <Ionicons name="cloud-upload-outline" size={26} color={theme.colors.textMuted} />
                  <View>
                    <Text style={styles.uploadTitle}>Upload tattoo reference</Text>
                    <Text style={styles.uploadSub}>Optional image or MP4 video reference</Text>
                  </View>
                </TouchableOpacity>
              )}
              {(pendingReference || referenceImage) ? (
                <TouchableOpacity activeOpacity={0.9} onPress={openReferencePicker} style={styles.replaceImageBtn}>
                  <Ionicons name="sync-outline" size={18} color={theme.colors.accent} />
                  <Text style={styles.replaceImageText}>Replace Reference</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.bookingSection}>
              <View style={styles.sectionTitleRow}>
                <Ionicons name="clipboard-outline" size={21} color={theme.colors.accent} />
                <Text style={styles.sectionTitle}>4. Tattoo Details</Text>
              </View>
              <Text style={styles.inputLabel}>Budget Range</Text>
              <TextInput
                value={budgetRange}
                onChangeText={(value) => setBudgetRange(value.slice(0, 40))}
                placeholder="Budget range e.g. ₹2000 - ₹5000"
                placeholderTextColor={theme.colors.textMuted}
                style={styles.budgetInput}
              />
              <Text style={styles.inputLabel}>Tattoo Details</Text>
              <TextInput
                value={tattooDetails}
                onChangeText={(value) => setTattooDetails(value.slice(0, MAX_TATTOO_DETAILS))}
                placeholder="Minimal rose tattoo on forearm, 4 inches, black & grey style."
                placeholderTextColor={theme.colors.textMuted}
                multiline
                style={styles.detailsInput}
                textAlignVertical="top"
              />
              <Text style={styles.counterText}>{tattooDetails.length}/{MAX_TATTOO_DETAILS}</Text>
            </View>

            <View style={styles.stickyCta}>
              <GradientButton
                title={
                  submitStage === 'checking'
                    ? 'Checking availability...'
                    : submitStage === 'uploading'
                      ? 'Uploading reference...'
                      : submitStage === 'submitting'
                        ? 'Requesting Quote...'
                      : 'Request Quote'
                }
                disabled={!canSubmitRequest}
                loading={isBusy}
                onPress={async () => {
                  if (!canSubmitRequest) return;
                  setSubmitStage('checking');
                  try {
                    let uploaded = referenceImage;
                    if (pendingReference) {
                      setSubmitStage('uploading');
                      const uid = auth.currentUser?.uid;
                      if (!uid) throw new Error('Please sign in again before uploading a reference.');
                      const uploadReference = pendingReference.mimeType === 'video/mp4' ? uploadPickedVideo : uploadPickedImage;
                      uploaded = await uploadReference({
                        uri: pendingReference.uri,
                        fileName: pendingReference.name,
                        mimeType: pendingReference.mimeType,
                        blob: pendingReference.blob,
                        folderPath: `booking-references/${uid}`,
                      });
                      setReferenceImage(uploaded);
                      setPendingReference(null);
                    }
                    setSubmitStage('submitting');
                    const bookingResult = await createBooking({
                      artistId: artist.id,
                      artistUid: artist.id,
                      artistName: artist.name,
                      artistHandle: artist.handle,
                      location: artist.location,
                      dateISO,
                      slotId,
                      slotTimeLabel: selectedSlot?.label,
                      startingFrom: artist.startingFrom ?? 0,
                      depositAmount: 249,
                      designImageUrl: uploaded?.downloadUrl ?? null,
                      designImageMeta: uploaded
                        ? {
                            fileName: uploaded.fileName,
                            mimeType: uploaded.mimeType,
                            size: uploaded.size,
                            storagePath: uploaded.storagePath,
                          }
                        : null,
                      aiSkinCheckStatus: riskStatus,
                      aiRiskScore: score,
                      aiSkinCheckNotes: [
                        riskNotes,
                        budgetRange.trim() ? `Budget: ${budgetRange.trim()}` : '',
                        tattooDetails.trim() ? `Tattoo Details: ${tattooDetails.trim()}` : '',
                      ].filter(Boolean).join('\n\n'),
                      aiFlagForArtist: riskStatus !== 'safe',
                      skinAnswers: answers,
                    });
                    await trackAnalyticsEventOnce(
                      `booking_request_submitted_${bookingResult.id}`,
                      ANALYTICS_EVENTS.BOOKING_REQUEST_SUBMITTED,
                      {
                        booking_id: bookingResult.id,
                        artist_id: bookingResult.artistUid,
                        has_reference_media: Boolean(uploaded?.downloadUrl),
                      },
                    );
                    setStep('done');
                  } catch (e: any) {
                    void logCrashlyticsError(e, { source: 'booking_request_quote', artistUid: artist?.id ?? null, hasReferenceMedia: Boolean(referenceImage?.downloadUrl || pendingReference) });
                    console.error('TATZO booking quote request failed', e);
                    Alert.alert('Tatzo', e?.message ?? 'Could not request quote. Please try again.');
                  } finally {
                    setSubmitStage('idle');
                  }
                }}
              />
              <Text style={styles.secureText}>
                <Ionicons name="lock-closed-outline" size={12} color={theme.colors.textMuted} /> Your details are safe and secure
              </Text>
            </View>

            <CalendarPickerModal
              visible={calendarOpen}
              initialDateISO={dateISO}
              allowedWeekdays={allowedDays.map((day) => WEEKDAY_LONG.indexOf(day)).filter((index) => index >= 0)}
              onSelect={(next) => setDateISO(next)}
              onClose={() => setCalendarOpen(false)}
            />
            <Modal visible={timePickerOpen} transparent animationType="fade" onRequestClose={() => setTimePickerOpen(false)}>
              <Pressable style={styles.timePickerBackdrop} onPress={() => setTimePickerOpen(false)} />
              <View style={styles.timePickerSheet}>
                <View style={styles.timePickerHandle} />
                <Text style={styles.timePickerTitle}>Select Time</Text>
                <Text style={styles.timePickerSubtitle}>Available slots for {selectedDate?.full ?? dateISO}</Text>
                <View style={styles.timePickerOptions}>
                  {slotOptions.filter((slot) => !lockedSlotIds.includes(slot.id)).map((slot) => {
                    const active = slot.id === slotId;
                    return (
                      <TouchableOpacity
                        key={slot.id}
                        activeOpacity={0.9}
                        onPress={() => {
                          setSlotId(slot.id);
                          setTimePickerOpen(false);
                        }}
                        style={[styles.timePickerOption, active && styles.timePickerOptionActive]}
                      >
                        <View>
                          <Text style={[styles.timePickerOptionText, active && styles.timePickerOptionTextActive]}>{slot.label}</Text>
                          <Text style={styles.timePickerOptionMeta}>{slot.helper}</Text>
                        </View>
                        {active ? <Ionicons name="checkmark-circle" size={22} color={theme.colors.accent} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </Modal>
          </View>
        ) : null}

        {step === 'done' ? (
          <View style={styles.body}>
            <Text style={styles.h1}>Request Submitted</Text>
            <Text style={styles.p}>
              Booking request submitted successfully. Artist approval is required before payment becomes available.
            </Text>
            <GradientButton title="Done" onPress={close} />
          </View>
        ) : null}
        </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const createStyles = (theme: AppTheme, bottomInset: number) =>
  StyleSheet.create({
    keyboardWrap: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.64)',
    },
    sheet: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      borderTopLeftRadius: 26,
      borderTopRightRadius: 26,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
      overflow: 'hidden',
      maxWidth: 520,
      width: '100%',
      alignSelf: 'center',
      maxHeight: '92%',
      paddingBottom: Math.max(0, bottomInset),
    },
    header: {
      paddingHorizontal: 14,
      paddingVertical: 7,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    headerBooking: {
      gap: 10,
      alignItems: 'flex-start',
    },
    headerCopy: {
      flex: 1,
      gap: 4,
    },
    title: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '800',
      letterSpacing: 1.6,
      textTransform: 'uppercase',
    },
    stepMeta: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    stepTrack: {
      flexDirection: 'row',
      gap: 6,
      paddingHorizontal: 14,
      paddingTop: 6,
      paddingBottom: 2,
      backgroundColor: theme.colors.surface,
    },
    progressLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingBottom: 6,
      backgroundColor: theme.colors.surface,
    },
    progressLabel: {
      flex: 1,
      textAlign: 'center',
      color: theme.colors.textMuted,
      fontSize: 9,
      fontWeight: '900',
      textTransform: 'uppercase',
    },
    stepDot: {
      flex: 1,
      height: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.border,
    },
    stepDotActive: {
      backgroundColor: theme.colors.accent,
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
    sheetBody: {
      flex: 1,
      minHeight: 0,
    },
    sheetBodyContent: {
      paddingBottom: 26 + Math.max(0, bottomInset),
    },
    body: {
      paddingHorizontal: 14,
      paddingVertical: 14,
      gap: 12,
    },
    bookingBody: {
      paddingHorizontal: 14,
      paddingTop: 6,
      paddingBottom: 12,
      gap: 7,
    },
    h1: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 20,
      fontFamily: theme.fonts.display,
    },
    p: {
      color: theme.colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
    },
    warnText: {
      color: theme.mode === 'light' ? '#8b2d2d' : '#ffd3cf',
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 18,
    },
    card: {
      borderRadius: 18,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.035)',
      padding: 12,
      gap: 6,
    },
    cardTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    cardSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    artistSummaryCard: {
      flexDirection: 'row',
      gap: 8,
      borderRadius: 15,
      padding: 6,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.035)',
      shadowColor: theme.colors.accent,
      shadowOpacity: 0,
      shadowRadius: 0,
      shadowOffset: { width: 0, height: 5 },
      elevation: 0,
    },
    artistAvatar: {
      width: 40,
      height: 40,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.surface,
    },
    artistSummaryCopy: {
      flex: 1,
      gap: 2,
      justifyContent: 'center',
    },
    artistNameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    artistName: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 15,
      fontWeight: '900',
    },
    artistMeta: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    availabilityPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginTop: 2,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: 'rgba(34, 197, 94, 0.13)',
    },
    availabilityPillWarn: {
      backgroundColor: 'rgba(251, 113, 133, 0.13)',
    },
    availabilityDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#22C55E',
    },
    availabilityDotWarn: {
      backgroundColor: '#FB7185',
    },
    availabilityText: {
      color: '#34D399',
      fontSize: 11,
      fontWeight: '900',
    },
    availabilityTextWarn: {
      color: '#FB7185',
    },
    bookingSection: {
      borderRadius: 15,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? '#F7F7FA' : 'rgba(255,255,255,0.035)',
      padding: 8,
      gap: 6,
    },
    sectionTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    dateChipRow: {
      gap: 8,
      paddingRight: 16,
    },
    dateChip: {
      width: 50,
      height: 56,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderWidth: 0,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.03)' : 'rgba(255,255,255,0.035)',
    },
    dateChipActive: {
      borderWidth: 1,
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accent,
      shadowColor: theme.colors.accent,
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 2,
    },
    dateChipUnavailable: {
      opacity: 0.42,
    },
    dateDay: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '900',
    },
    dateDayActive: {
      color: theme.colors.textInverse,
    },
    dateNumber: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 16,
      fontWeight: '900',
    },
    dateNumberActive: {
      color: theme.colors.textInverse,
    },
    unavailableText: {
      color: theme.colors.textMuted,
    },
    selectedDateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    selectedDateText: {
      color: theme.colors.textMuted,
      fontSize: 13,
      fontWeight: '700',
      flex: 1,
    },
    pickerField: {
      minHeight: 50,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.03)' : 'rgba(255,255,255,0.035)',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    pickerFieldDisabled: {
      opacity: 0.48,
    },
    pickerIcon: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.08)' : 'rgba(0, 212, 255, 0.08)',
    },
    pickerCopy: {
      flex: 1,
      gap: 2,
    },
    pickerLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '900',
      letterSpacing: 0.7,
      textTransform: 'uppercase',
    },
    pickerValue: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    errorCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: 'rgba(251, 113, 133, 0.42)',
      backgroundColor: 'rgba(127, 29, 29, 0.18)',
      paddingHorizontal: 11,
      paddingVertical: 10,
    },
    errorText: {
      flex: 1,
      color: theme.mode === 'light' ? '#9F1239' : '#FECACA',
      fontSize: 12,
      fontWeight: '800',
      lineHeight: 17,
    },
    slotGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    timeSlot: {
      width: '31.8%',
      minHeight: 39,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.03)' : 'rgba(255,255,255,0.035)',
    },
    timeSlotActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.colors.accent,
    },
    timeSlotUnavailable: {
      opacity: 0.42,
    },
    timeSlotText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    timeSlotTextActive: {
      color: theme.colors.textInverse,
    },
    uploadCard: {
      minHeight: 52,
      borderRadius: 15,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.025)' : 'rgba(255,255,255,0.025)',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    },
    uploadTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    uploadSub: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 2,
    },
    referencePreviewRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 15,
      padding: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.025)' : 'rgba(255,255,255,0.035)',
    },
    referenceThumb: {
      width: 72,
      height: 58,
      borderRadius: 10,
      backgroundColor: theme.colors.surface,
    },
    referenceVideoThumb: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.08)' : 'rgba(0, 212, 255, 0.08)',
    },
    referenceCopy: {
      flex: 1,
      gap: 3,
    },
    referenceTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
    },
    referenceSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    removeImageBtn: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.04)' : 'rgba(255,255,255,0.06)',
    },
    replaceImageBtn: {
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 8,
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.06)' : 'rgba(122, 92, 255, 0.08)',
    },
    replaceImageText: {
      color: theme.colors.accent,
      fontSize: 13,
      fontWeight: '900',
    },
    timePickerBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0, 0, 0, 0.52)',
    },
    timePickerSheet: {
      position: 'absolute',
      left: 12,
      right: 12,
      bottom: Math.max(12, bottomInset + 8),
      maxWidth: 520,
      alignSelf: 'center',
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surfaceStrong,
      paddingHorizontal: 14,
      paddingTop: 10,
      paddingBottom: 14,
      gap: 10,
    },
    timePickerHandle: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      borderRadius: 999,
      backgroundColor: theme.colors.border,
      marginBottom: 2,
    },
    timePickerTitle: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 16,
      fontWeight: '900',
      textAlign: 'center',
    },
    timePickerSubtitle: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
      marginTop: -5,
    },
    timePickerOptions: {
      gap: 8,
    },
    timePickerOption: {
      minHeight: 54,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.03)' : 'rgba(255,255,255,0.035)',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 13,
    },
    timePickerOptionActive: {
      borderColor: theme.colors.accent,
      backgroundColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.08)' : 'rgba(0, 212, 255, 0.08)',
    },
    timePickerOptionText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '900',
    },
    timePickerOptionTextActive: {
      color: theme.colors.accent,
    },
    timePickerOptionMeta: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      marginTop: 2,
    },
    inputLabel: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '900',
      textTransform: 'uppercase',
      letterSpacing: 0.7,
      marginBottom: -4,
    },
    detailsInput: {
      minHeight: 72,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.03)' : 'rgba(255,255,255,0.035)',
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      lineHeight: 20,
      paddingHorizontal: 12,
      paddingVertical: 11,
    },
    budgetInput: {
      minHeight: 44,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.mode === 'light' ? 'rgba(11, 11, 15, 0.03)' : 'rgba(255,255,255,0.035)',
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 14,
      fontWeight: '800',
      paddingHorizontal: 12,
    },
    counterText: {
      alignSelf: 'flex-end',
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
      marginTop: -5,
    },
    stickyCta: {
      gap: 9,
      paddingBottom: 2,
    },
    secureText: {
      textAlign: 'center',
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '700',
    },
    secondaryBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: 18,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    secondaryText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    btnDisabled: {
      opacity: 0.6,
    },
    progressRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    progressText: {
      color: theme.colors.textMuted,
      fontSize: 11,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    options: {
      gap: 10,
    },
    option: {
      borderRadius: 18,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    optionActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: 'rgba(122, 92, 255, 0.3)',
    },
    optionText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '800',
    },
    optionTextActive: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
    },
    navRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 2,
    },
    navGrow: {
      flex: 1,
    },
    flagCard: {
      borderRadius: 18,
      paddingVertical: 16,
      paddingHorizontal: 12,
      alignItems: 'center',
      gap: 6,
      borderWidth: 1,
    },
    flagGreen: {
      borderColor: 'rgba(46, 160, 67, 0.35)',
      backgroundColor: 'rgba(46, 160, 67, 0.12)',
    },
    flagWarn: {
      borderColor: 'rgba(223, 170, 33, 0.4)',
      backgroundColor: 'rgba(223, 170, 33, 0.14)',
    },
    flagRed: {
      borderColor: 'rgba(232, 71, 63, 0.35)',
      backgroundColor: 'rgba(232, 71, 63, 0.12)',
    },
    flagText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 18,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
    flagSub: {
      color: theme.colors.textMuted,
      fontSize: 12,
      fontWeight: '800',
    },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    dateBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    datePill: {
      flex: 1,
      borderRadius: 18,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    dateText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    calendarBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 18,
      paddingVertical: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
    },
    calendarText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 13,
      fontWeight: '900',
      letterSpacing: 0.4,
    },
    slotRow: {
      flexDirection: 'row',
      gap: 8,
    },
    slotBtn: {
      flex: 1,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.border,
      backgroundColor: theme.colors.surface,
      paddingVertical: 10,
      alignItems: 'center',
    },
    slotBtnActive: {
      backgroundColor: theme.colors.accentSoft,
      borderColor: theme.mode === 'light' ? 'rgba(122, 92, 255, 0.34)' : 'rgba(122, 92, 255, 0.44)',
    },
    slotText: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
      fontSize: 12,
      fontWeight: '800',
    },
    slotTextActive: {
      color: theme.mode === 'light' ? theme.colors.text : theme.colors.textInverse,
    },
  });

export default BookingFlowModal;

