import { haptic } from '../utils/haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import ReAnimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AppHeader from '../components/AppHeader';
import DayEventBlock from '../components/DayEventBlock';
import DayNowMarker from '../components/DayNowMarker';
import DinnerHint from '../components/DinnerHint';
import EditTimeModal from '../components/EditTimeModal';
import EditNotificationModal from '../components/EditNotificationModal';
import EditTitleModal from '../components/EditTitleModal';
import EventActionSheet, { RecurringDeleteScope } from '../components/EventActionSheet';
import HourGrid from '../components/HourGrid';
import VoiceConfirmLayer from '../components/VoiceConfirmLayer';
import LunchHint from '../components/LunchHint';
import VoiceInputOverlay from '../components/VoiceInputOverlay';
import { useColors } from '../constants/colors';
import { useDayEvents } from '../hooks/useDayEvents';
import { useSchedules } from '../hooks/useSchedules';
import { refreshWidget } from '../services/widget/widgetRefresh';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { supabase } from '../lib/supabase';
import { cancelEventNotification, persistNotificationOffset, reconcileRecurringDeletion } from '../services/notifications';
import { setEventCompletion } from '../services/eventCompletion';
import { Event } from '../types/database';
import { ttsService } from '../services/voice/TTSService';
import { useTheme } from '../contexts/ThemeContext';
import { useUndoToast } from '../contexts/UndoToastContext';
import {
  GRID_TOTAL_H,
  getNowY,
  scrollTargetForHour,
  yToTime,
} from '../utils/dayViewLayout';
import { localDateStr } from '../utils/timeHelpers';
import { isVirtualInstance, parseInstanceId } from '../utils/recurrenceHelpers';
import { computeOverlapLayout } from '../utils/eventOverlapLayout';
import { formatLunarShort } from '../utils/lunarHelpers';
import { useCurrentDate } from '../hooks/useCurrentDate';
import { Spacing } from '../constants/spacing';
import { useSkeletonDelay } from '../components/Skeleton';
import SkeletonDayBlocks from '../components/SkeletonDayBlocks';

const { width: SCREEN_W } = Dimensions.get('window');

const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
function formatDayLabel(dateStr: string, showLunar: boolean): string {
  const d = new Date(dateStr + 'T00:00:00');
  const base = `${d.getMonth() + 1}월 ${d.getDate()}일 ${KO_DAYS[d.getDay()]}요일`;
  if (!showLunar) return base;
  const lunar = formatLunarShort(d);
  return lunar ? `${base} · ${lunar}` : base;
}

export default function DayViewScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { ttsEnabled, lunarEnabled } = useTheme();
  const { showUndo } = useUndoToast();

  // ── Date state ──────────────────────────────────────────────────────
  const { todayStr } = useCurrentDate();
  const [dateStr, setDateStr] = useState(() => localDateStr(new Date()));
  const isToday = dateStr === todayStr;

  // ── Data ────────────────────────────────────────────────────────────
  const { events, loading, reload } = useDayEvents(dateStr);
  const showDaySkeleton = useSkeletonDelay(loading);
  const { applyClassifiedIntent } = useSchedules(dateStr, 0);
  const overlapMapDay = useMemo(() => computeOverlapLayout(events), [events]);

  // ── NOW tick ────────────────────────────────────────────────────────
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Scroll ──────────────────────────────────────────────────────────
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    const target = isToday
      ? scrollTargetForHour(new Date().getHours())
      : scrollTargetForHour(9);
    // Small delay so the content has rendered
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y: target, animated: false }), 80);
    return () => clearTimeout(t);
  }, [dateStr]);

  // ── Action sheet + edit modals ──────────────────────────────────────
  const [sheetEvent,            setSheetEvent]            = useState<Event | null>(null);
  const [editEvent,             setEditEvent]             = useState<Event | null>(null);
  const [editTitleVisible,      setEditTitleVisible]      = useState(false);
  const [editTimeVisible,       setEditTimeVisible]       = useState(false);
  const [editNotifVisible,      setEditNotifVisible]      = useState(false);

  function handleDeleteEvent(event: Event) {
    const realId = isVirtualInstance(event.id)
      ? (parseInstanceId(event.id)?.parentId ?? event.id)
      : event.id;
    cancelEventNotification(realId).catch(e => console.log('[Notifications] cancel 실패:', e));
    supabase.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', realId)
      .then(({ error }) => {
        if (error) console.error('[DayView] delete failed:', error.message);
        else {
          reload();
          refreshWidget('dayDelete').catch(() => {});
          showUndo('일정이 삭제됐어요', () => {
            supabase.from('events').update({ deleted_at: null }).eq('id', realId)
              .then(() => { reload(); refreshWidget('dayDeleteUndo').catch(() => {}); });
          });
        }
      });
  }

  function handleDeleteRecurring(event: Event, scope: RecurringDeleteScope) {
    const parsed    = isVirtualInstance(event.id) ? parseInstanceId(event.id) : null;
    const parentId  = parsed?.parentId ?? event.id;
    const instDate  = parsed?.instanceDate ?? new Date(event.start_at).toISOString().split('T')[0];

    if (scope === 'this') {
      supabase.from('event_exceptions').insert({ parent_id: parentId, instance_date: instDate, is_deleted: true })
        .then(({ error }) => {
          if (error) console.error('[DayView] exception insert failed:', error.message);
          else {
            reconcileRecurringDeletion(event.id, 'this').catch(e => console.log('[Notifications] cancel 실패:', e));
            reload(); refreshWidget('dayDeleteRecurring:this').catch(() => {});
          }
        });
    } else if (scope === 'future') {
      const d = new Date(instDate); d.setDate(d.getDate() - 1);
      supabase.from('events').update({ recurrence_end_date: d.toISOString().split('T')[0] }).eq('id', parentId)
        .then(({ error }) => {
          if (error) console.error('[DayView] recurrence_end_date update failed:', error.message);
          else {
            reconcileRecurringDeletion(event.id, 'future').catch(e => console.log('[Notifications] cancel 실패:', e));
            reload(); refreshWidget('dayDeleteRecurring:future').catch(() => {});
          }
        });
    } else {
      cancelEventNotification(parentId).catch(e => console.log('[Notifications] cancel 실패:', e));
      supabase.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', parentId)
        .then(({ error }) => {
          if (error) console.error('[DayView] delete recurring failed:', error.message);
          else { reload(); refreshWidget('dayDeleteRecurring:all').catch(() => {}); }
        });
    }
  }

  // 종전에는 여기서 supabase를 직접 호출해 toggleEventComplete를 우회했고, 그래서 알림 취소가
  // 누락됐다. 이제 다른 완료 진입점과 같은 setEventCompletion을 거친다.
  function handleCompleteEvent(event: Event) {
    setEventCompletion({ eventId: event.id, completed: !event.completed_at, caller: 'dayView' })
      .then(res => {
        if (!res.ok) console.error('[DayView] complete failed:', res.error);
        else refreshWidget('dayComplete').catch(() => {});
      });
  }

  // ── Voice flow ──────────────────────────────────────────────────────
  const voice = useVoiceInput(ttsEnabled);

  // (확인 문구 발화는 useVoiceFlow 내부 단일 effect로 이동 — 이중 발화 제거)

  // Success → reload + reset
  useEffect(() => {
    if (voice.phase === 'success') {
      haptic.success();
      reload();
      const t = setTimeout(() => voice.retryVoice(), 1800);
      return () => clearTimeout(t);
    }
  }, [voice.phase]);

  function handleGridLongPress(y: number) {
    haptic.medium();
    const { hours, minutes: rawMin } = yToTime(y);
    const snappedMin  = Math.round(rawMin / 30) * 30;
    const finalHour   = snappedMin === 60 ? (hours + 1) % 24 : hours;
    const finalMin    = snappedMin === 60 ? 0 : snappedMin;
    const ampm        = finalHour < 12 ? '오전' : '오후';
    const h12         = finalHour % 12 || 12;
    const ttsLabel    = `${ampm} ${h12}시${finalMin > 0 ? ` ${finalMin}분` : ''}`;

    voice.startWithPrefill(
      { dateStr, hour: finalHour, minute: finalMin, ttsLabel },
      intent => applyClassifiedIntent(intent),
    );
  }

  // 저장 확정(단일/복수 분기·confirmAction 호출)은 VoiceConfirmLayer가 담당한다.
  // 여기서는 적용 함수만 넘긴다. confirmAction/confirmMultiAction이 내부에서 ttsService.stop()을 호출.
  const handleVoiceCancel = useCallback(() => {
    ttsService.stop();
    voice.cancelVoiceInput();
  }, [voice]);

  // 하이브리드(텍스트) 확인 카드의 "다시 말하기" — 홈과 동일 동작.
  const handleVoiceRetry = useCallback(() => {
    ttsService.stop();
    voice.retryVoice();
    voice.startVoice('retry');
  }, [voice]);

  // ── Date navigation ─────────────────────────────────────────────────
  const translateX = useSharedValue(0);
  const opacity    = useSharedValue(1);

  function changeDate(offset: number) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    setDateStr(localDateStr(d));
  }

  function animateAndChange(offset: number) {
    opacity.value = withTiming(0, { duration: 120 }, () => {
      runOnJS(changeDate)(offset);
      translateX.value = 0;
      opacity.value = withTiming(1, { duration: 120 });
    });
  }

  const panGesture = Gesture.Pan()
    .activeOffsetX([-25, 25])
    .failOffsetY([-20, 20])
    .onUpdate(e => {
      translateX.value = e.translationX;
    })
    .onEnd(e => {
      const threshold = SCREEN_W * 0.3;
      if (e.translationX > threshold) {
        runOnJS(animateAndChange)(-1); // swipe right → yesterday
      } else if (e.translationX < -threshold) {
        runOnJS(animateAndChange)(1);  // swipe left  → tomorrow
      } else {
        translateX.value = withSpring(0, { damping: 24, stiffness: 300 });
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity:   opacity.value,
  }));

  // ── Go to today ─────────────────────────────────────────────────────
  function goToToday() {
    setDateStr(todayStr);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: scrollTargetForHour(new Date().getHours()), animated: true });
    }, 100);
  }

  const isVoiceActive = voice.phase !== 'idle';

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* ── 통합 헤더 ────────────────────────────────────────────── */}
      <AppHeader currentTab="day" />

      {/* ── 날짜 + 오늘로 행 ─────────────────────────────────────── */}
      <View style={styles.subHeader}>
        <Text style={[styles.dateLabel, { color: colors.textPrimary }]}>
          {formatDayLabel(dateStr, lunarEnabled)}
        </Text>
        {!isToday && (
          <Pressable onPress={goToToday} hitSlop={12} style={styles.todayBtn}>
            <Text style={[styles.todayText, { color: colors.accent }]}>오늘로</Text>
          </Pressable>
        )}
      </View>

      {/* ── Grid (swipeable) ─────────────────────────────────────── */}
      <GestureDetector gesture={panGesture}>
        <ReAnimated.View style={[{ flex: 1 }, animStyle]}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          >
            {/* Long-press on empty area → voice with time prefill; event blocks absorb their own */}
            <Pressable
              onLongPress={e => handleGridLongPress(e.nativeEvent.locationY)}
              delayLongPress={500}
            >
              <View style={{ height: GRID_TOTAL_H }}>
                <LunchHint  colors={colors} />
                <DinnerHint colors={colors} />
                <HourGrid   colors={colors} />

                {showDaySkeleton && events.length === 0 && <SkeletonDayBlocks />}
                {events.map(ev => {
                  const layout = overlapMapDay.get(ev.id);
                  return (
                    <DayEventBlock
                      key={ev.id}
                      event={ev}
                      colors={colors}
                      onLongPress={e => setSheetEvent(e)}
                      onDelete={handleDeleteEvent}
                      onComplete={handleCompleteEvent}
                      widthRatio={layout?.widthRatio}
                      xRatio={layout?.xRatio}
                    />
                  );
                })}

                {isToday && <DayNowMarker tick={tick} />}
              </View>
            </Pressable>
          </ScrollView>
        </ReAnimated.View>
      </GestureDetector>

      {/* ── Long-press voice overlay ─────────────────────────────── */}
      <VoiceInputOverlay
        visible={voice.overlayVisible}
        micStatus={voice.micStatus}
        isProcessing={voice.phase === 'processing'}
        loadingStage={voice.loadingStage}
        onCancel={handleVoiceCancel}
        onComplete={() => voice.stopAndProcessStored()}
      />

      {/* ── Voice overlays ───────────────────────────────────────── */}
      {voice.phase === 'listening' && !voice.overlayVisible && (
        <View style={styles.listenOverlay} pointerEvents="box-none">
          <Text style={[styles.listenLabel, { color: colors.textPrimary }]}>듣고 있어요...</Text>
          <Pressable onPress={handleVoiceCancel} style={[styles.cancelBtn, { borderColor: colors.border }]}>
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>취소</Text>
          </Pressable>
        </View>
      )}

      {voice.phase === 'processing' && (
        <View style={styles.processOverlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.processText, { color: colors.textMuted }]}>분석 중...</Text>
        </View>
      )}

      {/* 확인 단계 3분기(복수/단일음성/텍스트)는 공용 VoiceConfirmLayer로 통일 — 홈/`/voice`와 동일 */}
      <VoiceConfirmLayer
        voice={voice}
        onSave={async (i) => { await applyClassifiedIntent(i); }}
        onCancel={handleVoiceCancel}
        onRetry={handleVoiceRetry}
      />

      {/* ── Event action sheet ───────────────────────────────────── */}
      <EventActionSheet
        event={sheetEvent}
        onClose={() => setSheetEvent(null)}
        onEditTitle={ev => {
          console.log('[DayView] onEditTitle 호출, eventId:', ev?.id);
          setEditEvent(ev);
          setSheetEvent(null);
          setEditTitleVisible(true);
          console.log('[DayView] setEditTitleVisible(true) 완료');
        }}
        onEditTime={ev => {
          console.log('[DayView] onEditTime 호출, eventId:', ev?.id);
          setEditEvent(ev);
          setSheetEvent(null);
          setEditTimeVisible(true);
          console.log('[DayView] setEditTimeVisible(true) 완료');
        }}
        onEditNotification={ev => {
          setEditEvent(ev);
          setSheetEvent(null);
          setEditNotifVisible(true);
        }}
        onDeleted={reload}
      />
      <EditTitleModal
        visible={editTitleVisible}
        event={editEvent}
        onClose={() => setEditTitleVisible(false)}
        onSaved={() => { setEditTitleVisible(false); reload(); }}
      />
      <EditTimeModal
        visible={editTimeVisible}
        event={editEvent}
        onClose={() => setEditTimeVisible(false)}
        onSaved={() => {
          setEditTimeVisible(false);
          // 재예약은 EditTimeModal.save()가 공통 경로(reconcileNotifAfterEdit)로 처리한다.
          // 화면마다 가상 인스턴스 id로 행을 다시 찾던 코드는 반복 일정에서 조회가 비어
          // 재예약이 누락됐다 — 그 중복을 걷어내고 저장 지점 한 곳으로 모았다.
          reload();
        }}
      />
      <EditNotificationModal
        visible={editNotifVisible}
        event={editEvent}
        onClose={() => setEditNotifVisible(false)}
        onSaved={async updatedEvent => {
          const ok = await persistNotificationOffset(updatedEvent);
          setEditNotifVisible(false);
          if (ok) reload();
        }}
      />
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root: { flex: 1 },
    subHeader: {
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    dateLabel: { fontSize: 15, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
    todayBtn:  { paddingHorizontal: Spacing.sm, paddingVertical: 4 },
    todayText: { fontSize: 13, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },

    // Voice overlays
    listenOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems:      'center',
      justifyContent:  'center',
      gap:             20,
      backgroundColor: 'rgba(0,0,0,0.3)',
    },
    listenLabel: { fontSize: 22, fontFamily: 'Pretendard-Bold', fontWeight: '700' },
    cancelBtn: {
      paddingHorizontal: Spacing.lg,
      paddingVertical:   10,
      borderRadius:      12,
      borderWidth:       1,
      backgroundColor:   c.card,
    },
    cancelText: { fontSize: 15, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },

    processOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems:     'center',
      justifyContent: 'center',
      gap: Spacing.md,
    },
    processText: { fontSize: 15 },

  });
}
