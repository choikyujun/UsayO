import * as Haptics from 'expo-haptics';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { isKoreanHoliday } from '../hooks/useHolidays';
import { isLunchHour } from '../utils/timeHelpers';
import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { formatTimeRow, MONO } from '../utils/timeHelpers';
import { calculateNewTime, EventPosition } from '../utils/rescheduleHelpers';
import SpineEvent from './SpineEvent';
import type { EventState } from './SpineEvent';
import EmptyTodayState from './EmptyTodayState';
import EventActionSheet from './EventActionSheet';

export type { EventState };

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ── Layout constants ──────────────────────────────────────────────────────────
const PADDING_H = 20;
const SPINE_X   = PADDING_H + 38 + 14 / 2; // ≈ 64

// ── Types ─────────────────────────────────────────────────────────────────────
interface SpineEventItem { type: 'event'; id: string; event: Event; state: EventState }
interface SpineNowItem   { type: 'now';   id: string; nowDate: Date }
type SpineItem = SpineEventItem | SpineNowItem;

interface DeletedItem {
  event:     Event;
  timeoutId: ReturnType<typeof setTimeout>;
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  events:             Event[];
  loading?:           boolean;
  listPaddingBottom?: number;
  onRefresh?:         () => void;
  isRefreshing?:      boolean;
  onReschedule?:      (eventId: string, newTime: Date) => void;
  footerContent?:     React.ReactNode;
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TimeSpine({
  events,
  loading,
  listPaddingBottom,
  onRefresh,
  isRefreshing,
  onReschedule,
  footerContent,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeContainerStyles(colors), [colors]);

  // ── State ──────────────────────────────────────────────────────────────────
  const [hiddenIds,    setHiddenIds]    = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [expandedIds,  setExpandedIds]  = useState<Set<string>>(new Set());
  const [deletedItem,  setDeletedItem]  = useState<DeletedItem | null>(null);
  const [sheetEvent,   setSheetEvent]   = useState<Event | null>(null);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // Clock tick — spineItems recalculate every minute
  const nowRef = useRef(new Date());
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => { nowRef.current = new Date(); setTick(t => t + 1); }, 60_000);
    return () => clearInterval(id);
  }, []);

  // ── Coordinate tracking (for drag-to-reschedule) ──────────────────────────
  const contentWrapperRef = useRef<View>(null);
  const scrollOffsetY     = useRef(0);
  const eventLayoutMap    = useRef<Map<string, { top: number; bottom: number }>>(new Map());

  function handleEventLayout(id: string, top: number, bottom: number) {
    eventLayoutMap.current.set(id, { top, bottom });
  }

  function makeGetDropTime(excludeId: string, durationMs: number) {
    return (absoluteY: number): Promise<Date> =>
      new Promise(resolve => {
        contentWrapperRef.current?.measure((_, __, ___, ____, _____, pageY) => {
          const contentY = absoluteY - pageY + scrollOffsetY.current;
          const positions: EventPosition[] = [];
          eventLayoutMap.current.forEach(({ top, bottom }, id) => {
            const ev = events.find(e => e.id === id);
            if (ev) positions.push({ id, top, bottom, endAt: ev.end_at });
          });
          resolve(calculateNewTime(contentY, positions, events, excludeId, durationMs));
        });
      });
  }

  function handleScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    scrollOffsetY.current = e.nativeEvent.contentOffset.y;
  }

  // ── Filtered + sorted events ───────────────────────────────────────────────
  const visibleEvents = useMemo(
    () =>
      events
        .filter(e => !hiddenIds.has(e.id))
        .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [events, hiddenIds],
  );

  // ── Build spine items (events + NOW marker) ────────────────────────────────
  const spineItems = useMemo<SpineItem[]>(() => {
    const now   = nowRef.current;
    const nowMs = now.getTime();
    const items: SpineItem[] = [];
    let nowInserted  = false;
    let nextAssigned = false;

    for (const event of visibleEvents) {
      const startMs = new Date(event.start_at).getTime();
      const endMs   = new Date(event.end_at).getTime();

      if (!nowInserted && startMs > nowMs) {
        items.push({ type: 'now', id: 'now-marker', nowDate: now });
        nowInserted = true;
      }

      const isCompleted = completedIds.has(event.id);
      let state: EventState;

      if (isCompleted || endMs < nowMs) {
        state = 'past';
      } else if (startMs <= nowMs && endMs > nowMs) {
        // Current event: do NOT set nowInserted — NOW marker must appear after this event
        state = 'current';
      } else if (nowInserted && !nextAssigned) {
        state        = 'next';
        nextAssigned = true;
      } else {
        state = 'future';
      }

      items.push({ type: 'event', id: event.id, event, state });
    }

    if (!nowInserted) {
      items.push({ type: 'now', id: 'now-marker', nowDate: now });
    }

    return items;
  }, [visibleEvents, completedIds, tick]);

  // ── Delete with undo toast ─────────────────────────────────────────────────
  function handleDelete(event: Event) {
    setHiddenIds(prev => new Set([...prev, event.id]));

    if (deletedItem) {
      clearTimeout(deletedItem.timeoutId);
      commitDelete(deletedItem.event);
    }

    Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();

    const timeoutId = setTimeout(() => {
      commitDelete(event);
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true })
        .start(() => setDeletedItem(null));
    }, 5000);

    setDeletedItem({ event, timeoutId });
  }

  function handleUndoDelete() {
    if (!deletedItem) return;
    clearTimeout(deletedItem.timeoutId);
    setHiddenIds(prev => {
      const next = new Set(prev);
      next.delete(deletedItem.event.id);
      return next;
    });
    setDeletedItem(null);
    Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }

  function commitDelete(event: Event) {
    supabase
      .from('events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', event.id)
      .then(() => {});
  }

  function handleComplete(event: Event) {
    setCompletedIds(prev => new Set([...prev, event.id]));
  }

  function toggleExpand(id: string) {
    LayoutAnimation.configureNext({
      duration: 200,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  useEffect(() => {
    return () => {
      if (deletedItem) {
        clearTimeout(deletedItem.timeoutId);
        commitDelete(deletedItem.event);
      }
    };
  }, [deletedItem]);

  // ── Loading / empty states ─────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>불러오는 중...</Text>
      </View>
    );
  }

  if (visibleEvents.length === 0) {
    return <EmptyTodayState isToday />;
  }

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: listPaddingBottom ?? 120 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={isRefreshing ?? false}
              onRefresh={onRefresh}
              tintColor={colors.primary}
            />
          ) : undefined
        }
      >
        <View ref={contentWrapperRef} style={styles.contentWrapper}>
          {/* Vertical spine line */}
          <View style={[styles.spineLine, { backgroundColor: colors.border }]} />

          {spineItems.map(item =>
            item.type === 'now' ? (
              <NowMarkerRow key={item.id} nowDate={item.nowDate} colors={colors} />
            ) : (
              <SpineEvent
                key={item.id}
                event={item.event}
                state={item.state}
                expanded={expandedIds.has(item.event.id)}
                isHoliday={isKoreanHoliday(new Date(item.event.start_at))}
                isLunch={isLunchHour(new Date(item.event.start_at))}
                onTap={() => toggleExpand(item.event.id)}
                onLongPress={setSheetEvent}
                onDelete={handleDelete}
                onComplete={handleComplete}
                colors={colors}
                onLayout={handleEventLayout}
                getDropTime={
                  item.state === 'past'
                    ? makeGetDropTime(
                        item.event.id,
                        new Date(item.event.end_at).getTime() -
                          new Date(item.event.start_at).getTime(),
                      )
                    : undefined
                }
                onReschedule={onReschedule}
              />
            ),
          )}
        </View>

        {footerContent}
      </ScrollView>

      {/* ── Delete undo toast ──────────────────────────────────────────── */}
      <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="box-none">
        <Text style={styles.toastText}>
          {deletedItem ? `"${deletedItem.event.title}" 삭제됨` : ''}
        </Text>
        <Pressable onPress={handleUndoDelete} hitSlop={12}>
          <Text style={styles.toastUndo}>되돌리기</Text>
        </Pressable>
      </Animated.View>

      {/* ── Long-press action sheet ────────────────────────────────────── */}
      <EventActionSheet
        event={sheetEvent}
        onClose={() => setSheetEvent(null)}
        onDelete={handleDelete}
      />
    </View>
  );
}

// ── NowMarkerRow ──────────────────────────────────────────────────────────────
function NowMarkerRow({ nowDate, colors }: { nowDate: Date; colors: AppTheme }) {
  const h = nowDate.getHours();
  const m = String(nowDate.getMinutes()).padStart(2, '0');
  const timeStr = `${h}:${m}`;

  return (
    <View style={nowRowStyles.row}>
      <Text style={[nowRowStyles.time, { color: colors.accent }]}>{timeStr}</Text>
      <View style={nowRowStyles.lineWrap}>
        <View style={[nowRowStyles.dot,  { backgroundColor: colors.accent }]} />
        <View style={[nowRowStyles.line, { backgroundColor: colors.accent }]} />
        <Text style={[nowRowStyles.label, { color: colors.accent }]}>NOW</Text>
      </View>
    </View>
  );
}

const TIME_W  = 38;
const DOT_GAP = 14;

const nowRowStyles = StyleSheet.create({
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: PADDING_H,
    marginVertical:    16,
    gap:               DOT_GAP,
  },
  time: {
    width:      TIME_W,
    fontSize:   11,
    fontWeight: '500',
    textAlign:  'right',
  },
  lineWrap: {
    flex:          1,
    flexDirection: 'row',
    alignItems:    'center',
  },
  dot: {
    width:        7,
    height:       7,
    borderRadius: 3.5,
    marginRight:  6,
  },
  line: {
    flex:   1,
    height: 1,
  },
  label: {
    fontSize:      9,
    fontWeight:    '600',
    letterSpacing: 0.8,
    marginLeft:    6,
  },
});

// ── Container styles ──────────────────────────────────────────────────────────
function makeContainerStyles(c: AppTheme) {
  return StyleSheet.create({
    root:           { flex: 1 },
    contentWrapper: { position: 'relative', paddingTop: 8 },
    center:         { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    loadingText:    { fontSize: 14, color: c.textMuted },
    spineLine: {
      position: 'absolute',
      left:     SPINE_X,
      top:      4,
      bottom:   4,
      width:    0.5,
    },
    toast: {
      position:          'absolute',
      bottom:            20,
      left:              20,
      right:             20,
      backgroundColor:   c.card,
      borderRadius:      12,
      borderWidth:       0.5,
      borderColor:       c.border,
      flexDirection:     'row',
      alignItems:        'center',
      justifyContent:    'space-between',
      paddingHorizontal: 16,
      paddingVertical:   12,
      shadowColor:       '#000',
      shadowOffset:      { width: 0, height: 2 },
      shadowOpacity:     0.12,
      shadowRadius:      8,
      elevation:         6,
    },
    toastText: { fontSize: 14, color: c.textPrimary, flex: 1 },
    toastUndo: { fontSize: 14, color: c.accent, fontWeight: '700', marginLeft: 12 },
  });
}
