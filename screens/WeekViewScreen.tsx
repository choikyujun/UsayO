import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
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
import EditTimeModal from '../components/EditTimeModal';
import EditTitleModal from '../components/EditTitleModal';
import EventActionSheet, { RecurringDeleteScope } from '../components/EventActionSheet';
import ViewTabBar from '../components/ViewTabBar';
import WeekEventBlock from '../components/WeekEventBlock';
import WeekGrid from '../components/WeekGrid';
import WeekHeader from '../components/WeekHeader';
import { useColors } from '../constants/colors';
import { useWeekEvents } from '../hooks/useWeekEvents';
import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { GRID_TOTAL_H, getNowY, scrollTargetForHour } from '../utils/dayViewLayout';
import { localDateStr, todayDateStr } from '../utils/timeHelpers';
import { formatWeekRange, getWeekDays } from '../utils/weekViewLayout';
import { isVirtualInstance, parseInstanceId } from '../utils/recurrenceHelpers';

const { width: SCREEN_W } = Dimensions.get('window');

export default function WeekViewScreen() {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  // weekOffset: 0 = this week (starts today), +1 = next week, -1 = last week
  const [weekOffset, setWeekOffset] = useState(0);

  const anchorDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + weekOffset * 7);
    return d;
  }, [weekOffset]);

  const days = useMemo(() => getWeekDays(anchorDate), [anchorDate]);
  const { eventsByDate, loading, reload } = useWeekEvents(days);

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
    const parsed   = isVirtualInstance(event.id) ? parseInstanceId(event.id) : null;
    const parentId = parsed?.parentId ?? event.id;
    const instDate = parsed?.instanceDate ?? new Date(event.start_at).toISOString().split('T')[0];

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
      {/* ── Header ────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.textPrimary} />
        </Pressable>

        <Text style={[styles.rangeLabel, { color: colors.textPrimary }]}>
          {weekRange}
        </Text>

        {!isCurrentWeek ? (
          <Pressable onPress={goToToday} hitSlop={12} style={styles.todayBtn}>
            <Text style={[styles.todayText, { color: colors.accent }]}>오늘로</Text>
          </Pressable>
        ) : (
          <View style={styles.todayBtn} />
        )}
      </View>

      {/* ── View tab bar ──────────────────────────────────────────── */}
      <ViewTabBar
        currentView="week"
        onSelect={view => {
          if (view === 'day') router.back();
        }}
      />

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
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              }}
              delayLongPress={500}
            >
              <View style={{ height: GRID_TOTAL_H }}>
                <WeekGrid days={days} colors={colors} tick={tick} />

                {/* Event blocks per column */}
                {days.map((dateStr, colIndex) => {
                  const evs = eventsByDate[dateStr] ?? [];
                  return evs.map(ev => (
                    <WeekEventBlock
                      key={ev.id}
                      event={ev}
                      colIndex={colIndex}
                      colors={colors}
                      onLongPress={setSheetEvent}
                    />
                  ));
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
        onDelete={handleDeleteEvent}
        onDeleteRecurring={handleDeleteRecurring}
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
    backBtn:    { padding: 6, width: 40, alignItems: 'center' },
    rangeLabel: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '600' },
    todayBtn:   { padding: 6, width: 48, alignItems: 'center' },
    todayText:  { fontSize: 13, fontWeight: '600' },
  });
}
