import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Settings2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ReAnimated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConfirmCard from '../components/ConfirmCard';
import InlineConfirmCard from '../components/InlineConfirmCard';
import TimeSpine from '../components/TimeSpine';
import { useConversationalMessage } from '../hooks/useConversationalMessage';
import VoiceHintCarousel from '../components/VoiceHintCarousel';
import HybridInputModal from '../components/HybridInputModal';
import UpgradeModal from '../components/UpgradeModal';
import UsageWarningBanner from '../components/UsageWarningBanner';
import { Colors, useColors } from '../constants/colors';
import { useEventsForDate } from '../hooks/useEventsForDate';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { useOnboarding } from '../hooks/useOnboarding';
import { useSchedules } from '../hooks/useSchedules';
import { useVoiceFlow } from '../hooks/useVoiceFlow';
import { quotaTracker } from '../services/subscription/QuotaTracker';
import { ttsService } from '../services/voice/TTSService';
import { ClassifiedIntent, HybridInputState } from '../types';
import { toYearMonth } from '../utils/dateHelpers';
import { todayDateStr } from '../utils/timeHelpers';

const TODAY = todayDateStr();
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const FAB_SMALL = 64;
const FAB_LARGE = 160;
const FAB_SCALE = FAB_LARGE / FAB_SMALL; // 2.5

const FALLBACK_HYBRID: HybridInputState = {
  prefillText: '',
  isVoiceMode: false,
  fallbackReason: 'noise',
};

function errorMessage(error: unknown): string {
  if (!error) return '처리에 실패했어요';
  if (typeof error === 'object' && 'message' in error)
    return (error as { message: string }).message;
  return '처리에 실패했어요';
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const voice = useVoiceFlow();

  // ── Selected date ─────────────────────────────────────────────
  const [selectedDate] = useState(TODAY);
  const anchorMonth = useMemo(() => toYearMonth(new Date(selectedDate + 'T00:00:00')), [selectedDate]);

  // ── Clock ──────────────────────────────────────────────────────
  const DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const fmtTime = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const fmtDate = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일 ${DAYS[d.getDay()]}`;
  const [currentTime, setCurrentTime] = useState(() => fmtTime(new Date()));
  const [dateLabel,   setDateLabel]   = useState(() => fmtDate(new Date()));
  const dateTimeChrome = `${dateLabel} · ${currentTime}`;

  useEffect(() => {
    const id = setInterval(() => {
      const now = new Date();
      setCurrentTime(fmtTime(now));
      setDateLabel(fmtDate(now));
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  // Events for the selected date
  const {
    events, loading, reload: reloadForDate,
  } = useEventsForDate(selectedDate, anchorMonth);

  // Conversational header message (재계산: 이벤트 or 매 분)
  const message = useConversationalMessage(events, currentTime);

  // CRUD-only: voice commands, undo, lastCreatedId
  const {
    lastCreatedId, applyClassifiedIntent, undoSave, reload: reloadSchedules,
  } = useSchedules(TODAY, 7);

  const { isFirstLaunch, markOnboarded } = useOnboarding();
  const gate = useFeatureGate('voice_create');
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Reanimated shared values ──────────────────────────────────
  const fabScaleV = useSharedValue(1);
  const fabTranslateYV = useSharedValue(0);
  const contentOpacityV = useSharedValue(1);
  const pulseAnimV = useSharedValue(0);
  const onboardPulseV = useSharedValue(1);

  // How far FAB needs to travel upward to reach 40% from screen top
  // FAB center (from top) at rest = SCREEN_H - insets.bottom - 28 - FAB_SMALL/2
  // Target = SCREEN_H * 0.42
  const fabRestY = SCREEN_H - insets.bottom - 28 - FAB_SMALL / 2;
  const fabTargetY = SCREEN_H * 0.42;
  const translateYTarget = fabTargetY - fabRestY; // negative = upward

  // ── Animated styles (Reanimated) ─────────────────────────────
  const fabAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: fabScaleV.value },
      { translateY: fabTranslateYV.value },
    ],
  }));

  const contentAnimStyle = useAnimatedStyle(() => ({
    opacity: contentOpacityV.value,
  }));

  const pulse1Style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulseAnimV.value, [0, 1], [1, 1.9]) }],
    opacity: interpolate(pulseAnimV.value, [0, 0.4, 1], [0.5, 0.25, 0]),
  }));

  const pulse2Style = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(pulseAnimV.value, [0, 1], [1, 2.6]) }],
    opacity: interpolate(pulseAnimV.value, [0, 0.7, 1], [0.25, 0.08, 0]),
  }));

  const onboardRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: onboardPulseV.value }],
    opacity: interpolate(onboardPulseV.value, [1, 1.4], [0.5, 0]),
  }));

  // ── Audio level bar (RN Animated — width % can't use native driver) ──
  const levelAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(levelAnim, {
      toValue: voice.audioLevel,
      duration: 80,
      useNativeDriver: false,
    }).start();
  }, [voice.audioLevel]);

  // ── Phase-driven animations ───────────────────────────────────
  useEffect(() => {
    const phase = voice.phase;

    if (phase === 'listening') {
      fabScaleV.value = withSpring(FAB_SCALE, { damping: 18, stiffness: 120 });
      fabTranslateYV.value = withSpring(translateYTarget, { damping: 18, stiffness: 120 });
      contentOpacityV.value = withTiming(0.3, { duration: 300 });
      pulseAnimV.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      );
    } else {
      fabScaleV.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.quad) });
      fabTranslateYV.value = withTiming(0, { duration: 260, easing: Easing.out(Easing.quad) });
      cancelAnimation(pulseAnimV);
      pulseAnimV.value = withTiming(0, { duration: 150 });

      if (phase === 'processing') {
        contentOpacityV.value = withTiming(0.3, { duration: 200 });
      } else if (phase === 'confirming') {
        contentOpacityV.value = withTiming(0.4, { duration: 200 });
      } else {
        contentOpacityV.value = withTiming(1, { duration: 300 });
      }
    }
  }, [voice.phase]);

  // ── Auto-stop: recording → idle transition ───────────────────
  const prevMicStatus = useRef(voice.micStatus);
  useEffect(() => {
    const prev = prevMicStatus.current;
    prevMicStatus.current = voice.micStatus;
    if (prev === 'recording' && voice.micStatus === 'idle' && voice.phase === 'listening') {
      voice.stopAndProcess(
        async (intent) => applyClassifiedIntent(intent),
        async (eventId) => undoSave(eventId),
      );
    }
  }, [voice.micStatus, voice.phase]);

  // ── TTS on confirming ─────────────────────────────────────────
  const prevPhase = useRef(voice.phase);
  useEffect(() => {
    if (prevPhase.current !== 'confirming' && voice.phase === 'confirming' && voice.confirmMessage) {
      ttsService.speak(voice.confirmMessage).catch(() => {});
    }
    prevPhase.current = voice.phase;
  }, [voice.phase, voice.confirmMessage]);

  // ── NAVIGATION intent: skip confirm, go directly ─────────────
  useEffect(() => {
    if (voice.phase !== 'confirming') return;
    const intent = voice.classifiedIntent;
    if (intent?.intent !== 'NAVIGATION') return;
    voice.cancelVoice();
    const target = intent.navigationTarget;
    if (target === 'calendar') router.push('/calendar');
    else if (target === 'upcoming') router.push('/upcoming');
    else if (target === 'settings') router.push('/settings');
    // 'today' → already here, do nothing
  }, [voice.phase, voice.classifiedIntent]);

  // ── Success: reload events, auto-reset ───────────────────────
  useEffect(() => {
    if (voice.phase === 'success') {
      reloadForDate().catch(() => {});
      reloadSchedules().catch(() => {});
      const t = setTimeout(() => voice.retryVoice(), 1800);
      return () => clearTimeout(t);
    }
  }, [voice.phase]);

  // ── Onboarding TTS + pulse ────────────────────────────────────
  useEffect(() => {
    if (!isFirstLaunch) return;
    onboardPulseV.value = withRepeat(
      withTiming(1.4, { duration: 1100, easing: Easing.inOut(Easing.quad) }),
      6,
      true,
    );
    const t = setTimeout(() => {
      ttsService
        .speak('안녕하세요, YuSay예요. 마이크를 누르고 말해보세요. 일정은 제가 정리할게요.')
        .catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [isFirstLaunch]);

  // ── Handlers ─────────────────────────────────────────────────
  const handleFabPress = useCallback(async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!gate.isAllowed) { setUpgradeVisible(true); return; }
    const ok = await quotaTracker.checkQuota('create');
    if (!ok) { setUpgradeVisible(true); return; }
    if (isFirstLaunch) markOnboarded();
    voice.startVoice(
      async (intent) => applyClassifiedIntent(intent),
      async (eventId) => undoSave(eventId),
    );
  }, [gate, isFirstLaunch, markOnboarded, voice, applyClassifiedIntent, undoSave]);

  const handleCancelVoice = useCallback(() => {
    ttsService.stop();
    voice.cancelVoice();
  }, [voice]);

  const handleConfirm = useCallback(async () => {
    ttsService.stop();
    await voice.confirmAction(async (intent: ClassifiedIntent) => {
      await applyClassifiedIntent(intent);
    });
  }, [voice, applyClassifiedIntent]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try { await reloadForDate(); } finally { setIsRefreshing(false); }
  }, [reloadForDate]);

  const handleRetry = useCallback(() => {
    ttsService.stop();
    voice.retryVoice();
    voice.startVoice();
  }, [voice]);

  const isVoiceActive = voice.phase !== 'idle';
  const hybridState = voice.hybridInputState ?? FALLBACK_HYBRID;

  return (
    <View style={styles.root}>
      <StatusBar style={colors.statusBar} />

      {/* ── 컨텐츠 레이어 (음성 활성 시 페이드) ─────────────────── */}
      <ReAnimated.View style={[{ flex: 1 }, contentAnimStyle]}>

        {/* ── 설정 아바타 (캘린더 우측 상단 절대 위치) ───────────── */}
        <View style={[styles.avatarRow, { top: insets.top + 6 }]}>
          <Pressable
            onPress={() => router.push('/settings')}
            style={styles.avatarBtn}
            hitSlop={12}
          >
            <Settings2 size={20} color={Colors.textTertiary} />
          </Pressable>
        </View>

        {/* ── 헤더: 날짜 chrome(탭) + 컨버세이셔널 메시지 ───────────── */}
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <Pressable
            onPress={() => router.push('/calendar')}
            hitSlop={12}
            style={styles.dateChrome}
          >
            <Text style={styles.dateChromeText}>{dateTimeChrome}</Text>
          </Pressable>
          <Text style={styles.conversational}>
            <Text>{message.primary}</Text>
            {'\n'}
            <Text style={styles.conversationalSecondary}>{message.secondary}</Text>
          </Text>
        </View>

        <UsageWarningBanner feature="voice_create" />
        <VoiceHintCarousel isVoiceActive={isVoiceActive} />

        <View style={styles.divider} />

        <TimeSpine
          events={events}
          loading={loading}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          listPaddingBottom={insets.bottom + 120}
        />
      </ReAnimated.View>

      {/* ── 청취 중: 화면 탭 → 취소 ─────────────────────────────── */}
      {voice.phase === 'listening' && (
        <Pressable style={StyleSheet.absoluteFill} onPress={handleCancelVoice} />
      )}

      {/* ── 청취 중 UI (FAB 위) ──────────────────────────────────── */}
      {voice.phase === 'listening' && (
        <View style={styles.listeningInfo} pointerEvents="none">
          <Text style={styles.listeningLabel}>듣고 있어요...</Text>
          <View style={styles.levelTrack}>
            <Animated.View
              style={[
                styles.levelFill,
                {
                  width: levelAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* ── 분석 중 ──────────────────────────────────────────────── */}
      {voice.phase === 'processing' && (
        <View style={styles.processingLayer} pointerEvents="none">
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.processingText}>분석 중...</Text>
        </View>
      )}

      {/* ── 확인 카드 (Modal 없이 absolute overlay) ──────────────── */}
      {voice.phase === 'confirming' && voice.classifiedIntent && (
        voice.confirmSource === 'voice' ? (
          // 음성 입력: InlineConfirmCard (버튼 없음, 자동 마이크 재활성)
          <InlineConfirmCard
            intent={voice.classifiedIntent}
            transcript={voice.transcript}
            onConfirm={handleConfirm}
            onCancel={handleCancelVoice}
          />
        ) : (
          // 하이브리드(텍스트) 입력: 기존 버튼 카드
          <View style={styles.confirmLayer} pointerEvents="box-none">
            <ConfirmCard
              intent={voice.classifiedIntent}
              transcript={voice.transcript}
              onConfirm={handleConfirm}
              onRetry={handleRetry}
            />
          </View>
        )
      )}

      {/* ── 성공 ─────────────────────────────────────────────────── */}
      {voice.phase === 'success' && (
        <View style={styles.successLayer} pointerEvents="none">
          <Text style={styles.successIcon}>✅</Text>
          <Text style={styles.successText}>완료!</Text>
          <Text style={styles.successSub}>일정이 저장되었어요</Text>
        </View>
      )}

      {/* ── 실패 ─────────────────────────────────────────────────── */}
      {voice.phase === 'fail' && (
        <View style={styles.failLayer}>
          <Text style={styles.failIcon}>❌</Text>
          <Text style={styles.failText}>{errorMessage(voice.error)}</Text>
          <View style={styles.failRow}>
            <Pressable style={styles.retryBtn} onPress={handleRetry}>
              <Text style={styles.retryText}>다시 시도</Text>
            </Pressable>
            <Pressable style={styles.closeBtnStyle} onPress={handleCancelVoice}>
              <Text style={styles.closeBtnText}>취소</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── FAB (absolute 하단 중앙, transform으로 중앙 이동) ─────── */}
      <View
        style={[styles.fabAnchor, { bottom: insets.bottom + 28 }]}
        pointerEvents="box-none"
      >
        <ReAnimated.View style={[styles.fabOuter, fabAnimStyle]}>
          {/* 온보딩 펄스 링 */}
          {isFirstLaunch === true && !isVoiceActive && (
            <ReAnimated.View style={[styles.onboardRing, onboardRingStyle]} pointerEvents="none" />
          )}

          {/* 청취 중 펄스 링 */}
          {voice.phase === 'listening' && (
            <>
              <ReAnimated.View style={[styles.pulseRing1, pulse1Style]} pointerEvents="none" />
              <ReAnimated.View style={[styles.pulseRing2, pulse2Style]} pointerEvents="none" />
            </>
          )}

          <Pressable
            style={[styles.fab, voice.phase === 'listening' && styles.fabActive]}
            onPress={isVoiceActive ? undefined : handleFabPress}
            disabled={isVoiceActive}
            hitSlop={isVoiceActive ? undefined : 8}
          >
            <Text style={[styles.micIcon, voice.phase === 'listening' && styles.micIconLarge]}>
              🎙
            </Text>
          </Pressable>
        </ReAnimated.View>

        {!isVoiceActive && (
          <Text style={styles.fabLabel}>말하려면 탭하세요</Text>
        )}
      </View>

      {/* ── 하이브리드 입력 (텍스트 폴백, Modal 유지) ─────────────── */}
      <HybridInputModal
        visible={!!voice.hybridInputState}
        hybridState={hybridState}
        onConfirm={voice.confirmHybridInput}
        onRetryVoice={handleRetry}
        onDismiss={voice.dismissHybrid}
      />

      {/* ── 업그레이드 모달 ───────────────────────────────────────── */}
      <UpgradeModal
        visible={upgradeVisible}
        gateType={gate.gateType}
        upgradeTarget={gate.upgradeTarget}
        usageInfo={gate.usageInfo}
        onDismiss={() => setUpgradeVisible(false)}
      />
    </View>
  );
}

// ── Styles (theme-aware factory) ──────────────────────────────────────

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: c.bg,
    },
    avatarRow: {
      position: 'absolute',
      right: 16,
      zIndex: 10,
    },
    avatarBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: c.card2,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    header: {
      paddingHorizontal: 20,
      paddingBottom: 8,
      alignItems: 'flex-start',
    },
    dateChrome: {
      marginBottom: 16,
    },
    dateChromeText: {
      fontSize: 12,
      color: c.textMuted,
      letterSpacing: 0.2,
    },
    conversational: {
      fontSize: 18,
      lineHeight: 28,
      color: c.textPrimary,
      fontWeight: '400',
    },
    conversationalSecondary: {
      color: c.accent,
      fontWeight: '500',
    },
    divider: {
      height: 0.5,
      backgroundColor: c.border,
      marginHorizontal: 16,
      marginTop: 4,
      marginBottom: 2,
    },
    // ── Listening UI ─────────────────────────────────────────────
    listeningInfo: {
      position: 'absolute',
      left: 24,
      right: 24,
      top: SCREEN_H * 0.18,
      alignItems: 'center',
      gap: 14,
    },
    listeningLabel: {
      fontSize: 22,
      fontWeight: '700',
      color: c.textPrimary,
      letterSpacing: 0.3,
    },
    levelTrack: {
      width: '80%',
      height: 5,
      backgroundColor: c.card2,
      borderRadius: 3,
      overflow: 'hidden',
    },
    levelFill: {
      height: '100%',
      backgroundColor: c.primary,
      borderRadius: 3,
    },

    // ── Processing ───────────────────────────────────────────────
    processingLayer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
    },
    processingText: {
      fontSize: 16,
      color: c.textTertiary,
    },

    // ── Confirm overlay ──────────────────────────────────────────
    confirmLayer: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
    },

    // ── Success ──────────────────────────────────────────────────
    successLayer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    successIcon: { fontSize: 52 },
    successText: {
      fontSize: 30,
      fontWeight: '800',
      color: c.success,
    },
    successSub: {
      fontSize: 15,
      color: c.textTertiary,
    },

    // ── Fail ─────────────────────────────────────────────────────
    failLayer: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 14,
      paddingHorizontal: 32,
    },
    failIcon: { fontSize: 44 },
    failText: {
      fontSize: 15,
      color: c.error,
      textAlign: 'center',
      fontWeight: '600',
    },
    failRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 8,
      width: '100%',
    },
    retryBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: c.primary,
      alignItems: 'center',
    },
    retryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    closeBtnStyle: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: c.border,
      alignItems: 'center',
    },
    closeBtnText: { color: c.textSecondary, fontWeight: '600', fontSize: 15 },

    // ── FAB ──────────────────────────────────────────────────────
    fabAnchor: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: 8,
    },
    fabOuter: {
      width: FAB_SMALL,
      height: FAB_SMALL,
      alignItems: 'center',
      justifyContent: 'center',
    },
    onboardRing: {
      position: 'absolute',
      width: FAB_SMALL * 1.6,
      height: FAB_SMALL * 1.6,
      borderRadius: FAB_SMALL * 0.8,
      backgroundColor: c.primary + '40',
      top: -(FAB_SMALL * 0.3),
      left: -(FAB_SMALL * 0.3),
    },
    pulseRing1: {
      position: 'absolute',
      width: FAB_SMALL * 1.5,
      height: FAB_SMALL * 1.5,
      borderRadius: FAB_SMALL * 0.75,
      backgroundColor: c.primary + '45',
      top: -(FAB_SMALL * 0.25),
      left: -(FAB_SMALL * 0.25),
    },
    pulseRing2: {
      position: 'absolute',
      width: FAB_SMALL * 2.0,
      height: FAB_SMALL * 2.0,
      borderRadius: FAB_SMALL,
      backgroundColor: c.primary + '20',
      top: -(FAB_SMALL * 0.5),
      left: -(FAB_SMALL * 0.5),
    },
    fab: {
      width: FAB_SMALL,
      height: FAB_SMALL,
      borderRadius: FAB_SMALL / 2,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.primary,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.5,
      shadowRadius: 14,
      elevation: 10,
    },
    fabActive: {
      backgroundColor: '#C0392B',
      shadowColor: '#C0392B',
    },
    micIcon: { fontSize: 26 },
    micIconLarge: { fontSize: 36 },
    fabLabel: {
      fontSize: 12,
      color: c.accent,
      letterSpacing: 0.3,
    },
  });
}
