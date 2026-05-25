import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
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
import DayEventBlock from '../components/DayEventBlock';
import DayNowMarker from '../components/DayNowMarker';
import DinnerHint from '../components/DinnerHint';
import EditTimeModal from '../components/EditTimeModal';
import EditTitleModal from '../components/EditTitleModal';
import EventActionSheet, { RecurringDeleteScope } from '../components/EventActionSheet';
import HourGrid from '../components/HourGrid';
import InlineConfirmCard from '../components/InlineConfirmCard';
import LunchHint from '../components/LunchHint';
import ViewTabBar from '../components/ViewTabBar';
import { useColors } from '../constants/colors';
import { useDayEvents } from '../hooks/useDayEvents';
import { useSchedules } from '../hooks/useSchedules';
import { useVoiceFlow } from '../hooks/useVoiceFlow';
import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { ttsService } from '../services/voice/TTSService';
import {
  GRID_TOTAL_H,
  getNowY,
  scrollTargetForHour,
} from '../utils/dayViewLayout';
import { localDateStr } from '../utils/timeHelpers';
import { isVirtualInstance, parseInstanceId } from '../utils/recurrenceHelpers';

const { width: SCREEN_W } = Dimensions.get('window');
const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDayLabel(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${KO_DAYS[d.getDay()]}요일`;
}

export default function DayViewScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // ── Date state ──────────────────────────────────────────────────────
  const todayStr = localDateStr(new Date());
  const [dateStr, setDateStr] = useState(todayStr);
  const isToday = dateStr === todayStr;

  // ── Data ────────────────────────────────────────────────────────────
  const { events, loading, reload } = useDayEvents(dateStr);
  const { applyClassifiedIntent, undoSave } = useSchedules(dateStr, 0);

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
  const [sheetEvent,       setSheetEvent]       = useState<Event | null>(null);
  const [editEvent,        setEditEvent]        = useState<Event | null>(null);
  const [editTitleVisible, setEditTitleVisible] = useState(false);
  const [editTimeVisible,  setEditTimeVisible]  = useState(false);

  function handleDeleteEvent(event: Event) {
    const realId = isVirtualInstance(event.id)
      ? (parseInstanceId(event.id)?.parentId ?? event.id)
      : event.id;
    supabase.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', realId).then(() => {});
    reload();
  }

  function handleDeleteRecurring(event: Event, scope: RecurringDeleteScope) {
    const parsed    = isVirtualInstance(event.id) ? parseInstanceId(event.id) : null;
    const parentId  = parsed?.parentId ?? event.id;
    const instDate  = parsed?.instanceDate ?? new Date(event.start_at).toISOString().split('T')[0];

    if (scope === 'this') {
      supabase.from('event_exceptions').insert({ parent_id: parentId, instance_date: instDate, is_deleted: true }).then(() => {});
    } else if (scope === 'future') {
      const d = new Date(instDate); d.setDate(d.getDate() - 1);
      supabase.from('events').update({ recurrence_end_date: d.toISOString().split('T')[0] }).eq('id', parentId).then(() => {});
    } else {
      supabase.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', parentId).then(() => {});
    }
    reload();
  }

  function handleCompleteEvent(_event: Event) {
    // Visual completion state is handled locally inside DayEventBlock.
    // DB write deferred until completed_at column is added.
  }

  // ── Voice flow ──────────────────────────────────────────────────────
  const voice = useVoiceFlow();

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
      reload();
      const t = setTimeout(() => voice.retryVoice(), 1800);
      return () => clearTimeout(t);
    }
  }, [voice.phase]);

  function handleGridLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    voice.startVoice(
      intent => applyClassifiedIntent(intent),
      async eventId => undoSave(eventId),
    );
  }

  const handleVoiceConfirm = useCallback(async () => {
    ttsService.stop();
    await voice.confirmAction(async intent => { await applyClassifiedIntent(intent); });
  }, [voice, applyClassifiedIntent]);

  const handleVoiceCancel = useCallback(() => {
    ttsService.stop();
    voice.cancelVoice();
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
      {/* ── Header ───────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </Pressable>

        <Text style={[styles.dateLabel, { color: colors.textPrimary }]}>
          {formatDayLabel(dateStr)}
        </Text>

        {!isToday ? (
          <Pressable onPress={goToToday} hitSlop={12} style={styles.todayBtn}>
            <Text style={[styles.todayText, { color: colors.accent }]}>오늘로</Text>
          </Pressable>
        ) : (
          <View style={styles.todayBtn} />
        )}
      </View>

      {/* ── View tab bar ─────────────────────────────────────────── */}
      <ViewTabBar currentView="day" onSelect={view => { if (view === 'week') router.push('/week'); }} />

      {/* ── Grid (swipeable) ─────────────────────────────────────── */}
      <GestureDetector gesture={panGesture}>
        <ReAnimated.View style={[{ flex: 1 }, animStyle]}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          >
            {/* Long-press on empty area → voice; event blocks absorb their own long-press */}
            <Pressable onLongPress={handleGridLongPress} delayLongPress={500}>
              <View style={{ height: GRID_TOTAL_H }}>
                <LunchHint  colors={colors} />
                <DinnerHint colors={colors} />
                <HourGrid   colors={colors} />

                {events.map(ev => (
                  <DayEventBlock
                    key={ev.id}
                    event={ev}
                    colors={colors}
                    onLongPress={e => setSheetEvent(e)}
                    onDelete={handleDeleteEvent}
                    onComplete={handleCompleteEvent}
                  />
                ))}

                {isToday && <DayNowMarker tick={tick} />}
              </View>
            </Pressable>
          </ScrollView>
        </ReAnimated.View>
      </GestureDetector>

      {/* ── Voice overlays ───────────────────────────────────────── */}
      {voice.phase === 'listening' && (
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
        <InlineConfirmCard
          intent={voice.classifiedIntent}
          transcript={voice.transcript}
          onConfirm={handleVoiceConfirm}
          onCancel={handleVoiceCancel}
        />
      )}

      {voice.phase === 'success' && (
        <View style={styles.successOverlay} pointerEvents="none">
          <Text style={styles.successIcon}>✅</Text>
          <Text style={[styles.successText, { color: colors.success }]}>완료!</Text>
        </View>
      )}

      {voice.phase === 'fail' && (
        <View style={styles.failOverlay}>
          <Text style={styles.failIcon}>❌</Text>
          <Text style={[styles.failText, { color: colors.error }]}>다시 시도해 주세요</Text>
          <Pressable onPress={handleVoiceCancel} style={[styles.cancelBtn, { borderColor: colors.border }]}>
            <Text style={[styles.cancelText, { color: colors.textMuted }]}>닫기</Text>
          </Pressable>
        </View>
      )}

      {/* ── Event action sheet ───────────────────────────────────── */}
      <EventActionSheet
        event={sheetEvent}
        onClose={() => setSheetEvent(null)}
        onDelete={handleDeleteEvent}
        onDeleteRecurring={handleDeleteRecurring}
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
        onSaved={() => { setEditTimeVisible(false); reload(); }}
      />
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root:   { flex: 1 },
    header: {
      flexDirection:     'row',
      alignItems:        'center',
      paddingHorizontal: 8,
      paddingBottom:     10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    backBtn:   { padding: 6, width: 40, alignItems: 'center' },
    dateLabel: { flex: 1, textAlign: 'center', fontSize: 15, fontWeight: '600' },
    todayBtn:  { padding: 6, width: 48, alignItems: 'center' },
    todayText: { fontSize: 13, fontWeight: '600' },

    // Voice overlays
    listenOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems:      'center',
      justifyContent:  'center',
      gap:             20,
      backgroundColor: 'rgba(0,0,0,0.3)',
    },
    listenLabel: { fontSize: 22, fontWeight: '700' },
    cancelBtn: {
      paddingHorizontal: 24,
      paddingVertical:   10,
      borderRadius:      12,
      borderWidth:       1,
      backgroundColor:   c.card,
    },
    cancelText: { fontSize: 15, fontWeight: '600' },

    processOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems:     'center',
      justifyContent: 'center',
      gap:            12,
    },
    processText: { fontSize: 15 },

    successOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems:     'center',
      justifyContent: 'center',
      gap:            10,
    },
    successIcon: { fontSize: 48 },
    successText: { fontSize: 28, fontWeight: '800' },

    failOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems:     'center',
      justifyContent: 'center',
      gap:            14,
      paddingHorizontal: 32,
    },
    failIcon: { fontSize: 40 },
    failText: { fontSize: 15, fontWeight: '600', textAlign: 'center' },
  });
}
