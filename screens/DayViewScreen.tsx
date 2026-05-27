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
import InlineConfirmCard from '../components/InlineConfirmCard';
import MultiConfirmCard from '../components/MultiConfirmCard';
import LunchHint from '../components/LunchHint';
import VoiceInputOverlay from '../components/VoiceInputOverlay';
import { useColors } from '../constants/colors';
import { useDayEvents } from '../hooks/useDayEvents';
import { useSchedules } from '../hooks/useSchedules';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { supabase } from '../lib/supabase';
import { cancelEventNotification, rescheduleEventNotification } from '../services/notifications';
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
          showUndo('일정이 삭제됐어요', () => {
            supabase.from('events').update({ deleted_at: null }).eq('id', realId)
              .then(() => reload());
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
          else reload();
        });
    } else if (scope === 'future') {
      const d = new Date(instDate); d.setDate(d.getDate() - 1);
      supabase.from('events').update({ recurrence_end_date: d.toISOString().split('T')[0] }).eq('id', parentId)
        .then(({ error }) => {
          if (error) console.error('[DayView] recurrence_end_date update failed:', error.message);
          else reload();
        });
    } else {
      cancelEventNotification(parentId).catch(e => console.log('[Notifications] cancel 실패:', e));
      supabase.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', parentId)
        .then(({ error }) => {
          if (error) console.error('[DayView] delete recurring failed:', error.message);
          else reload();
        });
    }
  }

  function handleCompleteEvent(event: Event) {
    const completed_at = event.completed_at ? null : new Date().toISOString();
    supabase.from('events').update({ completed_at }).eq('id', event.id)
      .then(({ error }) => { if (error) console.error('[DayView] complete failed:', error.message); });
  }

  // ── Voice flow ──────────────────────────────────────────────────────
  const voice = useVoiceInput(ttsEnabled);

  // TTS when confirming
  const prevPhase = useRef(voice.phase);
  useEffect(() => {
    if (prevPhase.current !== 'confirming' && voice.phase === 'confirming' && voice.confirmMessage) {
      ttsService.speak(voice.confirmMessage).catch(() => {});
    }
    prevPhase.current = voice.phase;
  }, [voice.phase, voice.confirmMessage]);

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

  const handleVoiceConfirm = useCallback(async () => {
    ttsService.stop();
    if (voice.classifiedIntent?.events?.length) {
      await voice.confirmMultiAction(async intents => {
        for (const i of intents) await applyClassifiedIntent(i);
      });
    } else {
      await voice.confirmAction(async intent => { await applyClassifiedIntent(intent); });
    }
  }, [voice, applyClassifiedIntent]);

  const handleVoiceCancel = useCallback(() => {
    ttsService.stop();
    voice.cancelVoiceInput();
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

      {voice.phase === 'confirming' && voice.classifiedIntent && (
        voice.classifiedIntent.events?.length ? (
          <MultiConfirmCard
            events={voice.classifiedIntent.events}
            transcript={voice.transcript}
            onConfirm={handleVoiceConfirm}
            onCancel={handleVoiceCancel}
          />
        ) : (
          <InlineConfirmCard
            intent={voice.classifiedIntent}
            transcript={voice.transcript}
            onConfirm={handleVoiceConfirm}
            onCancel={handleVoiceCancel}
          />
        )
      )}

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
          if (editEvent) {
            supabase.from('events').select('*').eq('id', editEvent.id).single()
              .then(({ data }) => {
                if (data) rescheduleEventNotification(data as Event).catch(e =>
                  console.log('[Notifications] reschedule 실패:', e));
              });
          }
          reload();
        }}
      />
      <EditNotificationModal
        visible={editNotifVisible}
        event={editEvent}
        onClose={() => setEditNotifVisible(false)}
        onSaved={async updatedEvent => {
          const { error } = await supabase
            .from('events')
            .update({ notification_offset_minutes: updatedEvent.notification_offset_minutes, updated_at: new Date().toISOString() })
            .eq('id', updatedEvent.id);
          if (error) {
            console.error('[DayView] notification update failed:', error.message);
          } else {
            rescheduleEventNotification(updatedEvent).catch(e =>
              console.log('[Notifications] reschedule 실패:', e),
            );
            reload();
          }
          setEditNotifVisible(false);
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
