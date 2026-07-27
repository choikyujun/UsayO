import { haptic } from '../utils/haptics';
import { useUndoToast } from '../contexts/UndoToastContext';
import { supabase } from '../lib/supabase';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Mic, Settings2 } from 'lucide-react-native';
import AppHeader from '../components/AppHeader';
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
import EditNotificationModal from '../components/EditNotificationModal';
import EditTimeModal from '../components/EditTimeModal';
import EditTitleModal from '../components/EditTitleModal';
import EventActionSheet from '../components/EventActionSheet';
import InlineConfirmCard from '../components/InlineConfirmCard';
import MultiConfirmCard from '../components/MultiConfirmCard';
import RecurringBadge from '../components/RecurringBadge';
import TimeSpine from '../components/TimeSpine';
import UpcomingSection from '../components/UpcomingSection';
import VoiceHintRotator from '../components/VoiceHintRotator';
import ListeningLevelBar from '../components/ListeningLevelBar';
import { useConversationalMessage } from '../hooks/useConversationalMessage';
import { useRecurringEvents } from '../hooks/useRecurringEvents';
import { useUpcomingEvents } from '../hooks/useUpcomingEvents';
import { useAuthStore } from '../stores/useAuthStore';
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
import type { Event as CalEvent } from '../types/database';
import { addDays, toYearMonth } from '../utils/dateHelpers';
import { useCurrentDate } from '../hooks/useCurrentDate';
import { Spacing } from '../constants/spacing';
import { onVoiceTrigger } from '../utils/voiceTrigger';
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const FAB_SMALL = 64;

// 강등된 날짜·요일 표기 (기존 AppHeader와 동일 포맷 — 위계만 보조 톤으로 낮춤)
const KO_DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
function formatDateLabel(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${KO_DAYS[d.getDay()]}`;
}

const SUCCESS_AUTO_RESET_MS   = 1800;  // 음성 성공 후 idle 복귀 딜레이
const RESCHEDULE_TOAST_MS     = 10_000; // 일정 이동 토스트 자동 닫힘


const FALLBACK_HYBRID: HybridInputState = {
  prefillText: '',
  isVoiceMode: false,
  fallbackReason: 'noise',
};

import type { VoiceFlowError } from '../services/voice/VoiceFlowOrchestrator';

function friendlyErrorMessage(error: VoiceFlowError | null): string {
  if (!error) return '처리에 실패했어요';
  switch (error.type) {
    case 'noSpeech':  return '잘 못 들었어요';
    case 'network':   return '인터넷이 불안정해요';
    case 'lowConfidence': return '이해하지 못했어요';
    case 'quotaExceeded': return '이번 달 음성 사용 횟수를 모두 사용했어요';
    default:          return '처리에 실패했어요';
  }
}

function friendlyErrorSubtitle(error: VoiceFlowError | null): string {
  if (!error) return '다시 시도해주세요';
  switch (error.type) {
    case 'noSpeech':      return '조용한 곳에서 다시 말씀해주세요';
    case 'network':       return '연결을 확인 후 다시 시도해주세요';
    case 'lowConfidence': return '조금 다르게 말씀해주실래요?';
    case 'quotaExceeded': return 'Pro로 업그레이드하면 무제한으로 사용할 수 있어요';
    default:              return '다시 시도해주세요';
  }
}

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { showUndo } = useUndoToast();
  const voice = useVoiceFlow();

  // ── Selected date ─────────────────────────────────────────────
  const { todayStr: selectedDate, today } = useCurrentDate();
  const anchorMonth = useMemo(() => toYearMonth(new Date(selectedDate + 'T00:00:00')), [selectedDate]);

  // ── Clock ──────────────────────────────────────────────────────
  const fmtTime = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  const [currentTime, setCurrentTime] = useState(() => fmtTime(new Date()));

  useEffect(() => {
    const id = setInterval(() => setCurrentTime(fmtTime(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);

  // Events for the selected date
  const {
    events, loading, reload: reloadForDate, patchEvent,
  } = useEventsForDate(selectedDate, anchorMonth);

  // CRUD-only: voice commands, undo, lastCreatedId; events includes D+0~D+7 for upcoming section
  const {
    events: allEvents,
    recurringParents,
    lastCreatedId, applyClassifiedIntent,
    deleteEventById,
    toggleEventComplete,
    rescheduleEvent, undoRescheduleEvent,
    reload: reloadSchedules,
    loading: schedulesLoading,
  } = useSchedules(selectedDate, 7);

  const recurringEvents = useRecurringEvents(recurringParents);

  // 다가올 일정(footer) 유무 — 오늘 0건일 때 State 2(이후 일정 있음) / State 3(전무) 구분용
  const upcomingGroups = useUpcomingEvents(allEvents);
  const hasUpcoming = upcomingGroups.length > 0;

  // 인증 상태(단일 소스). focus 시점에 인증 전이면 조회를 건너뛴다(인증 전 0행 쿼리 제거).
  const authStatus = useAuthStore(s => s.status);
  const authStatusRef = useRef(authStatus);
  authStatusRef.current = authStatus;

  // 다른 화면에서 돌아올 때(DayView 삭제/수정 등) 즉시 반영.
  // 초기 인증 전(pending)에는 스킵 → 인증 후 최초 조회는 각 훅의 authed 게이트가 담당.
  // 이미 authed인 상태의 탭 복귀에서는 정상 재조회(데이터 신선도 유지).
  useFocusEffect(useCallback(() => {
    if (authStatusRef.current !== 'authed') return;
    reloadForDate();
    reloadSchedules();
  }, [reloadForDate, reloadSchedules]));

  // First upcoming event for conversational header (오늘이 빈 날 케이스)
  const firstUpcoming = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const d1 = addDays(todayStart, 1);
    const d6 = addDays(todayStart, 6);
    return allEvents
      .filter(ev => {
        const s = new Date(ev.start_at);
        return s >= d1 && s < d6 && !ev.completed_at;
      })
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())[0];
  }, [allEvents]);

  // Conversational header message (재계산: 이벤트 or 매 분)
  const message = useConversationalMessage(events, currentTime, firstUpcoming);

  // ── Reschedule undo state ─────────────────────────────────────
  interface RescheduledItem {
    eventId:       string;
    title:         string;
    originalStart: string;
    originalEnd:   string;
    timeoutId:     ReturnType<typeof setTimeout>;
  }
  const [lastRescheduled, setLastRescheduled] = useState<RescheduledItem | null>(null);
  const rescheduleToastOpacity = useRef(new Animated.Value(0)).current;

  const { isFirstLaunch, markOnboarded } = useOnboarding();
  const gate = useFeatureGate('voice_create');
  const [upgradeVisible, setUpgradeVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Upcoming long-press → EventActionSheet ────────────────────
  const [sheetEvent,       setSheetEvent]       = useState<CalEvent | null>(null);
  const [editEvent,        setEditEvent]        = useState<CalEvent | null>(null);
  const [editTitleVisible, setEditTitleVisible] = useState(false);
  const [editTimeVisible,  setEditTimeVisible]  = useState(false);
  const [editNotifVisible, setEditNotifVisible] = useState(false);

  // ── Reanimated shared values ──────────────────────────────────
  const fabScaleV = useSharedValue(1);
  const fabTranslateYV = useSharedValue(0);
  const contentOpacityV = useSharedValue(1);
  const pulseAnimV = useSharedValue(0);
  const onboardPulseV = useSharedValue(1);


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

  // 오디오 레벨바는 ListeningLevelBar 리프가 텔레메트리 스토어를 직접 구독 → 여기선 audioLevel 미참조.

  // ── Phase-driven animations ───────────────────────────────────
  useEffect(() => {
    const phase = voice.phase;

    if (phase === 'listening') {
      fabScaleV.value = withSpring(1, { damping: 18, stiffness: 120 });
      fabTranslateYV.value = withSpring(0, { damping: 18, stiffness: 120 });
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
      voice.stopAndProcess(handleApplyIntent);
    }
  }, [voice.micStatus, voice.phase]);

  // (확인 문구 발화는 useVoiceFlow 내부 단일 effect로 이동 — 이중 발화/ dedup skip 제거)

  // ── RESCHEDULE_UNDO intent: execute immediately ───────────────
  useEffect(() => {
    if (voice.phase !== 'confirming') return;
    const intent = voice.classifiedIntent;
    if (intent?.intent !== 'RESCHEDULE_UNDO') return;
    voice.cancelVoice();
    setLastRescheduled(current => {
      if (current) {
        clearTimeout(current.timeoutId);
        patchEvent(current.eventId, { start_at: current.originalStart, end_at: current.originalEnd });
        undoRescheduleEvent(current.eventId, current.originalStart, current.originalEnd).catch(() => {});
        Animated.timing(rescheduleToastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
        return null;
      }
      ttsService.speak('최근 1분 이내에 이동한 일정이 없어요.').catch(() => {});
      return current;
    });
  }, [voice.phase, voice.classifiedIntent]);

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
      haptic.success();
      reloadForDate().catch(() => {});
      reloadSchedules().catch(() => {});
      const t = setTimeout(() => voice.retryVoice(), SUCCESS_AUTO_RESET_MS);
      return () => clearTimeout(t);
    }
  }, [voice.phase]);

  // ── Fail: TTS 친절 피드백 + auto-reset ─────────────────────
  useEffect(() => {
    if (voice.phase === 'fail') {
      const ttsMsg = friendlyErrorMessage(voice.error ?? null);
      ttsService.speak(ttsMsg).catch(() => {});
      // 쿼터 초과: 조용히 실패하지 않도록 업그레이드 모달까지 표시 (TTS는 위에서 안내됨).
      if (voice.error?.type === 'quotaExceeded') setUpgradeVisible(true);
      const t = setTimeout(() => voice.retryVoice(), 2500);
      return () => clearTimeout(t);
    }
  }, [voice.phase]);

  // ── Onboarding TTS + pulse ────────────────────────────────────
  useEffect(() => {
    if (!isFirstLaunch) return;
    // 홈 화면 진입 즉시 완료 처리 — FAB 탭 전에 재마운트되어도 반복 재생되지 않도록
    markOnboarded();
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
    haptic.medium();
    if (!gate.isAllowed) { setUpgradeVisible(true); return; }
    const ok = await quotaTracker.checkQuota('create');
    if (!ok) { setUpgradeVisible(true); return; }

    // ±7일 이벤트를 LLM 컨텍스트로 전달 (UPDATE/DELETE/COMPLETE 매칭 정확도 향상)
    const nearbyCtx = allEvents.length > 0
      ? allEvents.slice(0, 30).map(e => {
          const d = new Date(e.start_at);
          const m = d.getMonth() + 1;
          const day = d.getDate();
          const h = d.getHours();
          const min = d.getMinutes();
          const minStr = min > 0 ? `:${String(min).padStart(2, '0')}` : '';
          const ampm = h < 12 ? '오전' : '오후';
          const h12 = h % 12 || 12;
          return `id: ${e.id}, time: ${m}월 ${day}일 ${ampm} ${h12}${minStr}시, title: ${e.title}`;
        }).join('\n')
      : undefined;

    voice.startVoice(handleApplyIntent, undefined, nearbyCtx);
  }, [gate, voice, applyClassifiedIntent, allEvents]);

  // Deeplink 'yusay://voice/start' 수신 시 자동 마이크 활성
  useEffect(() => {
    return onVoiceTrigger(() => handleFabPress());
  }, [handleFabPress]);

  // DB 반영 즉시 화면 갱신: useSchedules(CRUD)와 useEventsForDate(display)가 분리돼 있어
  // applyClassifiedIntent 완료 후 바로 reloadForDate + reloadSchedules를 호출해야
  // 오늘 일정(TimeSpine)과 다가올 일정(UpcomingSection) 모두 즉시 표시됨
  const handleApplyIntent = useCallback(async (intent: ClassifiedIntent) => {
    const id = await applyClassifiedIntent(intent);
    reloadForDate().catch(() => {});
    reloadSchedules().catch(() => {});
    return id;
  }, [applyClassifiedIntent, reloadForDate, reloadSchedules]);

  const handleCancelVoice = useCallback(() => {
    ttsService.stop();
    voice.cancelVoice();
  }, [voice]);

  const handleLongPressUpcoming = useCallback((event: CalEvent) => {
    setSheetEvent(event);
  }, []);

  const handleDeleteUpcoming = useCallback((event: CalEvent) => {
    const eventId = event.id;
    deleteEventById(eventId).catch(() => {});
    showUndo('일정이 삭제됐어요', () => {
      supabase.from('events').update({ deleted_at: null }).eq('id', eventId)
        .then(() => reloadSchedules().catch(() => {}));
    });
  }, [deleteEventById, showUndo, reloadSchedules]);

  const handleCompleteUpcoming = useCallback((event: CalEvent) => {
    toggleEventComplete(event.id, !!event.completed_at).catch(() => {});
  }, [toggleEventComplete]);

  const handleCompleteToday = useCallback((event: CalEvent) => {
    const willComplete = !event.completed_at;
    patchEvent(event.id, { completed_at: willComplete ? new Date().toISOString() : null });
    toggleEventComplete(event.id, !!event.completed_at).catch(() => {});
  }, [toggleEventComplete, patchEvent]);

  const handleConfirm = useCallback(async () => {
    ttsService.stop();
    if (voice.classifiedIntent?.events?.length) {
      await voice.confirmMultiAction(async (intents: ClassifiedIntent[]) => {
        for (const i of intents) await handleApplyIntent(i);
      });
    } else {
      await voice.confirmAction(async (intent: ClassifiedIntent) => {
        await handleApplyIntent(intent);
      });
    }
  }, [voice, handleApplyIntent]);

  const handleReschedule = useCallback((eventId: string, newTime: Date) => {
    const event = events.find(e => e.id === eventId);
    if (!event) return;

    const durationMs    = new Date(event.end_at).getTime() - new Date(event.start_at).getTime();
    const newEnd        = new Date(newTime.getTime() + durationMs);
    const originalStart = event.start_at;
    const originalEnd   = event.end_at;
    const title         = event.title;

    // Optimistic UI update (prevents snap-back flicker)
    patchEvent(eventId, {
      start_at: newTime.toISOString(),
      end_at:   newEnd.toISOString(),
    });
    // Persist to DB
    rescheduleEvent(eventId, newTime, newEnd).catch(() => {});

    setLastRescheduled(prev => {
      if (prev) clearTimeout(prev.timeoutId);
      return null;
    });

    Animated.timing(rescheduleToastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    const timeoutId = setTimeout(() => {
      Animated.timing(rescheduleToastOpacity, { toValue: 0, duration: 250, useNativeDriver: true })
        .start(() => setLastRescheduled(null));
    }, RESCHEDULE_TOAST_MS);

    setLastRescheduled({ eventId, title, originalStart, originalEnd, timeoutId });
  }, [events, patchEvent, rescheduleEvent, rescheduleToastOpacity]);

  const handleUndoReschedule = useCallback(() => {
    setLastRescheduled(prev => {
      if (!prev) return null;
      clearTimeout(prev.timeoutId);
      // Optimistic UI revert
      patchEvent(prev.eventId, {
        start_at: prev.originalStart,
        end_at:   prev.originalEnd,
      });
      undoRescheduleEvent(prev.eventId, prev.originalStart, prev.originalEnd).catch(() => {});
      Animated.timing(rescheduleToastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
      return null;
    });
  }, [patchEvent, undoRescheduleEvent, rescheduleToastOpacity]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try { await reloadForDate(); } finally { setIsRefreshing(false); }
  }, [reloadForDate]);

  const handleRetry = useCallback(() => {
    ttsService.stop();
    voice.retryVoice();
    voice.startVoice();
  }, [voice]);

  // 모달 콜백 안정화 → React.memo가 visible=false에서 bail-out하도록.
  const closeEditTitle = useCallback(() => { setEditTitleVisible(false); setEditEvent(null); }, []);
  const savedEditTitle = useCallback(() => { setEditTitleVisible(false); setEditEvent(null); reloadForDate().catch(() => {}); reloadSchedules().catch(() => {}); }, [reloadForDate, reloadSchedules]);
  const closeEditTime = useCallback(() => { setEditTimeVisible(false); setEditEvent(null); }, []);
  const savedEditTime = useCallback(() => { setEditTimeVisible(false); setEditEvent(null); reloadForDate().catch(() => {}); reloadSchedules().catch(() => {}); }, [reloadForDate, reloadSchedules]);

  const isVoiceActive = voice.phase !== 'idle';
  const hybridState = voice.hybridInputState ?? FALLBACK_HYBRID;

  return (
    <View style={styles.root}>
      <StatusBar style={colors.statusBar} />

      {/* ── 컨텐츠 레이어 (음성 활성 시 페이드) ─────────────────── */}
      <ReAnimated.View style={[{ flex: 1 }, contentAnimStyle]}>

        {/* ── 통합 헤더 (홈: 5탭만 — 날짜·시각·힌트는 아래로 강등) ──── */}
        <AppHeader currentTab="home" tabsOnly />

        {/* ── 설정 아이콘 (우상단 절대 위치) ──────────────────────── */}
        <View style={[styles.avatarRow, { top: insets.top + 6 }]}>
          <Pressable
            onPress={() => router.push('/settings')}
            style={styles.avatarBtn}
            hitSlop={12}
          >
            <Settings2 size={20} color={Colors.textTertiary} />
          </Pressable>
        </View>

        {/* ── 1. 대화형 메시지 (화면의 주인공, 헤더급 타이포) ───────── */}
        <View style={styles.header}>
          <Text style={styles.msgPrimary}>{message.primary}</Text>
          {/* "다음은 N시간 후, ~이에요"가 핵심 정보 → 첫 줄과 같거나 높은 강조(accent+SemiBold) */}
          <Text style={styles.msgSecondary}>{message.secondary}</Text>
        </View>

        {/* ── 2. 힌트 배너 (메시지 아래) ──────────────────────────── */}
        <VoiceHintRotator />

        {/* ── 3. 날짜·요일·시각 (배너 아래, 타임라인 위) ───────────── */}
        <View style={styles.dateRow}>
          <Text style={styles.dateText}>{formatDateLabel(today)}</Text>
          <Text style={styles.dateSep}>  ·  </Text>
          <Text style={styles.dateTime}>{currentTime}</Text>
        </View>

        <UsageWarningBanner feature="voice_create" />
        <RecurringBadge events={recurringEvents} onDeleted={() => reloadSchedules()} />

        <View style={styles.divider} />

        <TimeSpine
          events={events}
          loading={loading}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          listPaddingBottom={insets.bottom + 120}
          onReschedule={handleReschedule}
          onToggleComplete={handleCompleteToday}
          footerContent={<UpcomingSection allEvents={allEvents} onLongPress={handleLongPressUpcoming} onDelete={handleDeleteUpcoming} onComplete={handleCompleteUpcoming} />}
          footerHasContent={hasUpcoming}
          footerLoading={schedulesLoading}
          emptyExample="내일 오후 3시에 팀 회의 잡아줘"
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
          <ListeningLevelBar />
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
        voice.classifiedIntent.events?.length ? (
          // 복수 일정: MultiConfirmCard
          <MultiConfirmCard
            events={voice.classifiedIntent.events}
            transcript={voice.transcript}
            onConfirm={handleConfirm}
            onCancel={handleCancelVoice}
          />
        ) : voice.confirmSource === 'voice' ? (
          // 단일 음성 입력: InlineConfirmCard (자동 마이크 재활성)
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

      {/* ── 재스케줄 취소 토스트 (10초) ─────────────────────────── */}
      <Animated.View
        style={[styles.rescheduleToast, { opacity: rescheduleToastOpacity }]}
        pointerEvents={lastRescheduled ? 'box-none' : 'none'}
      >
        <Text style={styles.toastText} numberOfLines={1}>
          {lastRescheduled ? `"${lastRescheduled.title}" 이동했어요` : ''}
        </Text>
        <Pressable onPress={handleUndoReschedule} hitSlop={12}>
          <Text style={styles.toastUndo}>되돌리기</Text>
        </Pressable>
      </Animated.View>

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
            <Mic
              size={voice.phase === 'listening' ? 34 : 28}
              color="#fff"
              strokeWidth={1.75}
            />
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

      {/* ── 다가올 일정 long-press → EventActionSheet ────────────── */}
      <EventActionSheet
        event={sheetEvent}
        onClose={() => setSheetEvent(null)}
        onEditTitle={ev => {
          setEditEvent(ev);
          setSheetEvent(null);
          setEditTitleVisible(true);
        }}
        onEditTime={ev => {
          setEditEvent(ev);
          setSheetEvent(null);
          setEditTimeVisible(true);
        }}
        onEditNotification={ev => {
          setEditEvent(ev);
          setSheetEvent(null);
          setEditNotifVisible(true);
        }}
        onDeleted={() => { reloadForDate().catch(() => {}); reloadSchedules().catch(() => {}); }}
      />
      <EditTitleModal
        visible={editTitleVisible}
        event={editEvent}
        onClose={closeEditTitle}
        onSaved={savedEditTitle}
      />
      <EditTimeModal
        visible={editTimeVisible}
        event={editEvent}
        onClose={closeEditTime}
        onSaved={savedEditTime}
      />
      <EditNotificationModal
        visible={editNotifVisible}
        event={editEvent}
        onClose={() => { setEditNotifVisible(false); setEditEvent(null); }}
        onSaved={_updated => { setEditNotifVisible(false); setEditEvent(null); }}
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
      paddingTop: Spacing.base,
      paddingBottom: Spacing.sm,
      alignItems:        'flex-start',
    },
    // 대화형 메시지 — 화면의 주인공. 날짜 헤더(20)급으로 승격.
    msgPrimary: {
      fontSize: 21,
      lineHeight: 29,
      color: c.textPrimary,
      fontFamily: 'Pretendard-Medium',
      fontWeight: '500',
    },
    // 둘째 줄("다음은 ~이에요")이 핵심 → 첫 줄과 같은 크기에 accent+SemiBold로 강조 우위.
    msgSecondary: {
      fontSize: 21,
      lineHeight: 29,
      marginTop: 2,
      color: c.accent,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
    },
    // 날짜·요일·시각 — 타이포 강화(14 → 21, 1.5배 + Bold). 색상 토큰은 기존 유지.
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.xs,
    },
    dateText: {
      fontSize: 21,
      color: c.textSecondary,
      fontFamily: 'Pretendard-Bold',
      fontWeight: '700',
    },
    dateSep: {
      fontSize: 21,
      color: c.textTertiary,
      fontFamily: 'Pretendard-Bold',
      fontWeight: '700',
    },
    dateTime: {
      fontSize: 21,
      color: c.textSecondary,
      fontFamily: 'Pretendard-Bold',
      fontWeight: '700',
    },
    divider: {
      height: 0.5,
      backgroundColor: c.border,
      marginHorizontal: Spacing.base,
      marginTop: Spacing.xs,
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
      fontFamily: 'Pretendard-Bold',
      fontWeight: '700',
      color: c.textPrimary,
      letterSpacing: 0.3,
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

    // ── FAB ──────────────────────────────────────────────────────
    fabAnchor: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      gap: Spacing.sm,
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
      backgroundColor: Colors.fabActive,
      shadowColor: Colors.fabActive,
    },
    fabLabel: {
      fontSize: 12,
      color: c.accent,
      letterSpacing: 0.3,
    },

    // ── Reschedule undo toast ─────────────────────────────────────
    rescheduleToast: {
      position:          'absolute',
      bottom:            96,
      left:              20,
      right:             20,
      backgroundColor:   c.card,
      borderRadius:      12,
      borderWidth:       0.5,
      borderColor:       c.border,
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      shadowColor:       '#000',
      shadowOffset:      { width: 0, height: 2 },
      shadowOpacity:     0.12,
      shadowRadius:      8,
      elevation:         6,
    },
    toastText: {
      fontSize: 14,
      color:    c.textPrimary,
      flex:     1,
    },
    toastUndo: {
      fontSize:   14,
      color:      c.accent,
      fontFamily: 'Pretendard-Bold',
      fontWeight: '700',
      marginLeft: Spacing.md,
    },
  });
}
