import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
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
import InlineConfirmCard from '../components/InlineConfirmCard';
import MultiConfirmCard from '../components/MultiConfirmCard';
import EditTimeModal from '../components/EditTimeModal';
import EditTitleModal from '../components/EditTitleModal';
import EventActionSheet, { RecurringDeleteScope } from '../components/EventActionSheet';
import EventDetailSheet from '../components/EventDetailSheet';
import VoiceInputOverlay from '../components/VoiceInputOverlay';
import WeekEventBlock from '../components/WeekEventBlock';
import WeekGrid from '../components/WeekGrid';
import WeekHeader from '../components/WeekHeader';
import { useColors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { useWeekEvents } from '../hooks/useWeekEvents';
import { useSchedules } from '../hooks/useSchedules';
import { supabase } from '../lib/supabase';
import { cancelEventNotification, rescheduleEventNotification } from '../services/notifications';
import { Event } from '../types/database';
import { GRID_TOTAL_H, getNowY, scrollTargetForHour, yToTime, TIME_LABEL_W } from '../utils/dayViewLayout';
import { localDateStr, todayDateStr } from '../utils/timeHelpers';
import { formatWeekRange, getWeekDays, COL_W } from '../utils/weekViewLayout';
import { isVirtualInstance, parseInstanceId } from '../utils/recurrenceHelpers';
import { computeOverlapLayout } from '../utils/eventOverlapLayout';
import { useCurrentDate } from '../hooks/useCurrentDate';

const { width: SCREEN_W } = Dimensions.get('window');

const KO_DAYS_FULL = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export default function WeekViewScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { ttsEnabled } = useTheme();

  const { today } = useCurrentDate();

  // weekOffset: 0 = this week (starts today), +1 = next week, -1 = last week
  const [weekOffset, setWeekOffset] = useState(0);

  const anchorDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [today, weekOffset]);

  const days = useMemo(() => getWeekDays(anchorDate), [anchorDate]);
  const { eventsByDate, loading, reload } = useWeekEvents(days);
  const { applyClassifiedIntent } = useSchedules(days[0] ?? todayDateStr(), 0);
  const voice = useVoiceInput(ttsEnabled);

  // ── Voice success → reload week grid ────────────────────────────────
  useEffect(() => {
    if (voice.phase === 'success') {
      reload();
      const t = setTimeout(() => voice.retryVoice(), 1800);
      return () => clearTimeout(t);
    }
  }, [voice.phase]);

  // ── NOW tick (minute-level) ─────────────────────────────────────────
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Scroll to current hour on mount / week change ───────────────────
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    const isCurrentWeek = weekOffset === 0;
    const target = isCurrentWeek
      ? scrollTargetForHour(new Date().getHours())
      : scrollTargetForHour(9);
    const t = setTimeout(() => scrollRef.current?.scrollTo({ y: target, animated: false }), 80);
    return () => clearTimeout(t);
  }, [weekOffset]);

  // ── Action sheet + edit modals + detail sheet ──────────────────────
  const [sheetEvent,        setSheetEvent]        = useState<Event | null>(null);
  const [editEvent,         setEditEvent]         = useState<Event | null>(null);
  const [editTitleVisible,  setEditTitleVisible]  = useState(false);
  const [editTimeVisible,   setEditTimeVisible]   = useState(false);
  const [detailEvent,       setDetailEvent]       = useState<Event | null>(null);
  const [detailVisible,     setDetailVisible]     = useState(false);

  function handleDeleteEvent(event: Event) {
    const realId = isVirtualInstance(event.id)
      ? (parseInstanceId(event.id)?.parentId ?? event.id)
      : event.id;
    cancelEventNotification(realId).catch(e => console.log('[Notifications] cancel 실패:', e));
    supabase.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', realId)
      .then(({ error }) => { if (error) console.error('[WeekView] delete failed:', error.message); });
    reload();
  }

  function handleDeleteRecurring(event: Event, scope: RecurringDeleteScope) {
    const parsed   = isVirtualInstance(event.id) ? parseInstanceId(event.id) : null;
    const parentId = parsed?.parentId ?? event.id;
    const instDate = parsed?.instanceDate ?? new Date(event.start_at).toISOString().split('T')[0];

    if (scope === 'this') {
      supabase.from('event_exceptions').insert({ parent_id: parentId, instance_date: instDate, is_deleted: true })
        .then(({ error }) => { if (error) console.error('[WeekView] exception insert failed:', error.message); });
    } else if (scope === 'future') {
      const d = new Date(instDate); d.setDate(d.getDate() - 1);
      supabase.from('events').update({ recurrence_end_date: d.toISOString().split('T')[0] }).eq('id', parentId)
        .then(({ error }) => { if (error) console.error('[WeekView] recurrence_end_date update failed:', error.message); });
    } else {
      cancelEventNotification(parentId).catch(e => console.log('[Notifications] cancel 실패:', e));
      supabase.from('events').update({ deleted_at: new Date().toISOString() }).eq('id', parentId)
        .then(({ error }) => { if (error) console.error('[WeekView] delete recurring failed:', error.message); });
    }
    reload();
  }

  // ── Week swipe gesture ──────────────────────────────────────────────
  const translateX = useSharedValue(0);
  const opacity    = useSharedValue(1);

  const changeWeek = useCallback((direction: number) => {
    setWeekOffset(prev => prev + direction);
  }, []);

  const animateAndChange = useCallback((direction: number) => {
    opacity.value = withTiming(0, { duration: 120 }, () => {
      runOnJS(changeWeek)(direction);
      translateX.value = 0;
      opacity.value = withTiming(1, { duration: 120 });
    });
  }, []);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-25, 25])
    .failOffsetY([-20, 20])
    .onUpdate(e => { translateX.value = e.translationX; })
    .onEnd(e => {
      const threshold = SCREEN_W * 0.3;
      if (e.translationX > threshold) {
        runOnJS(animateAndChange)(-1);
      } else if (e.translationX < -threshold) {
        runOnJS(animateAndChange)(1);
      } else {
        translateX.value = withSpring(0, { damping: 24, stiffness: 300 });
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity:   opacity.value,
  }));

  // ── Grid long-press → voice with date+time prefill ──────────────────
  function handleGridLongPress(x: number, y: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const colIndex  = Math.max(0, Math.min(6, Math.floor((x - TIME_LABEL_W) / COL_W)));
    const dateStr   = days[colIndex] ?? todayDateStr();

    const { hours, minutes: rawMin } = yToTime(y);
    const snappedMin = Math.round(rawMin / 30) * 30;
    const finalHour  = snappedMin === 60 ? (hours + 1) % 24 : hours;
    const finalMin   = snappedMin === 60 ? 0 : snappedMin;

    const d = new Date(dateStr + 'T00:00:00');
    const dayName = KO_DAYS_FULL[d.getDay()];
    const ampm    = finalHour < 12 ? '오전' : '오후';
    const h12     = finalHour % 12 || 12;
    const ttsLabel = `${dayName} ${ampm} ${h12}시${finalMin > 0 ? ` ${finalMin}분` : ''}`;

    voice.startWithPrefill(
      { dateStr, hour: finalHour, minute: finalMin, ttsLabel },
      async intent => {
        const id = await applyClassifiedIntent(intent);
        reload();
        return id;
      },
    );
  }

  // ── Go to today ─────────────────────────────────────────────────────
  function goToToday() {
    setWeekOffset(0);
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: scrollTargetForHour(new Date().getHours()), animated: true });
    }, 100);
  }

  const isCurrentWeek = weekOffset === 0;
  const weekRange     = formatWeekRange(days);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      {/* ── 통합 헤더 ────────────────────────────────────────────── */}
      <AppHeader currentTab="week" />

      {/* ── 주 범위 + 오늘로 행 ──────────────────────────────────── */}
      <View style={styles.subHeader}>
        <Text style={[styles.rangeLabel, { color: colors.textPrimary }]}>
          {weekRange}
        </Text>
        {!isCurrentWeek && (
          <Pressable onPress={goToToday} hitSlop={12} style={styles.todayBtn}>
            <Text style={[styles.todayText, { color: colors.accent }]}>오늘로</Text>
          </Pressable>
        )}
      </View>

      {/* ── Column headers ────────────────────────────────────────── */}
      <WeekHeader days={days} colors={colors} />

      {/* ── Grid (swipeable) ──────────────────────────────────────── */}
      <GestureDetector gesture={panGesture}>
        <ReAnimated.View style={[{ flex: 1 }, animStyle]}>
          <ScrollView
            ref={scrollRef}
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
          >
            <Pressable
              onLongPress={e => handleGridLongPress(e.nativeEvent.locationX, e.nativeEvent.locationY)}
              delayLongPress={500}
            >
              <View style={{ height: GRID_TOTAL_H }}>
                <WeekGrid days={days} colors={colors} tick={tick} />

                {/* Event blocks per column — overlap layout per day */}
                {days.map((dateStr, colIndex) => {
                  const evs = eventsByDate[dateStr] ?? [];
                  const overlapMap = computeOverlapLayout(evs);
                  return evs.map(ev => {
                    const layout = overlapMap.get(ev.id);
                    return (
                      <WeekEventBlock
                        key={ev.id}
                        event={ev}
                        colIndex={colIndex}
                        colors={colors}
                        onPress={ev => { setDetailEvent(ev); setDetailVisible(true); }}
                        onLongPress={setSheetEvent}
                        widthRatio={layout?.widthRatio}
                        xRatio={layout?.xRatio}
                      />
                    );
                  });
                })}
              </View>
            </Pressable>
          </ScrollView>
        </ReAnimated.View>
      </GestureDetector>

      {/* ── Event action sheet ────────────────────────────────────── */}
      <EventActionSheet
        event={sheetEvent}
        onClose={() => setSheetEvent(null)}
        onEditTitle={ev => { setEditEvent(ev); setSheetEvent(null); setEditTitleVisible(true); }}
        onEditTime={ev  => { setEditEvent(ev); setSheetEvent(null); setEditTimeVisible(true);  }}
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
      <EventDetailSheet
        visible={detailVisible}
        event={detailEvent}
        onClose={() => setDetailVisible(false)}
      />

      {/* ── Long-press voice overlay ──────────────────────────────── */}
      <VoiceInputOverlay
        visible={voice.overlayVisible}
        micStatus={voice.micStatus}
        isProcessing={voice.phase === 'processing'}
        loadingStage={voice.loadingStage}
        onCancel={() => voice.cancelVoiceInput()}
        onComplete={() => voice.stopAndProcessStored()}
      />

      {/* ── Inline / Multi confirm card ──────────────────────────── */}
      {voice.phase === 'confirming' && voice.classifiedIntent && (
        voice.classifiedIntent.events?.length ? (
          <MultiConfirmCard
            events={voice.classifiedIntent.events}
            transcript={voice.transcript}
            onConfirm={async () => {
              await voice.confirmMultiAction(async intents => {
                for (const i of intents) await applyClassifiedIntent(i);
              });
            }}
            onCancel={() => voice.cancelVoiceInput()}
          />
        ) : (
          <InlineConfirmCard
            intent={voice.classifiedIntent}
            transcript={voice.transcript}
            onConfirm={async () => {
              await voice.confirmAction(async intent => { await applyClassifiedIntent(intent); });
            }}
            onCancel={() => voice.cancelVoiceInput()}
          />
        )
      )}
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
      paddingHorizontal: 16,
      paddingVertical:   6,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    rangeLabel: { fontSize: 14, fontWeight: '600' },
    todayBtn:   { paddingHorizontal: 8, paddingVertical: 4 },
    todayText:  { fontSize: 13, fontWeight: '600' },
  });
}
