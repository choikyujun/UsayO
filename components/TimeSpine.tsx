import * as Haptics from 'expo-haptics';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutAnimation,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { AppTheme, useColors } from '../constants/colors';
import { isKoreanHoliday } from '../hooks/useHolidays';
import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { formatTimeRow, MONO } from '../utils/timeHelpers';
import EmptyTodayState from './EmptyTodayState';
import EventActionSheet from './EventActionSheet';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

// ── Layout constants ──────────────────────────────────────────────────────────
const PADDING_H = 20;
const TIME_W    = 38;
const DOT_GAP   = 14;
// Spine line at the boundary between time col and gap (will be visually between them)
const SPINE_X   = PADDING_H + TIME_W + DOT_GAP / 2; // ≈ 64

// ── Types ─────────────────────────────────────────────────────────────────────
export type EventState = 'past' | 'current' | 'next' | 'future';

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
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TimeSpine({
  events,
  loading,
  listPaddingBottom,
  onRefresh,
  isRefreshing,
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

      // Insert NOW marker before first future event
      if (!nowInserted && startMs > nowMs) {
        items.push({ type: 'now', id: 'now-marker', nowDate: now });
        nowInserted = true;
      }

      const isCompleted = completedIds.has(event.id);
      let state: EventState;

      if (isCompleted || endMs < nowMs) {
        state = 'past';
      } else if (startMs <= nowMs && endMs > nowMs) {
        state    = 'current';
        nowInserted = true;
      } else if (nowInserted && !nextAssigned) {
        state        = 'next';
        nextAssigned = true;
      } else {
        state = 'future';
      }

      items.push({ type: 'event', id: event.id, event, state });
    }

    // All events are past → NOW at the very end
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

  // Cleanup pending delete on unmount
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
        <View style={styles.contentWrapper}>
          {/* Vertical spine line */}
          <View style={[styles.spineLine, { backgroundColor: colors.border }]} />

          {spineItems.map(item =>
            item.type === 'now' ? (
              <NowMarkerRow key={item.id} nowDate={item.nowDate} colors={colors} />
            ) : (
              <SpineEventRow
                key={item.id}
                event={item.event}
                state={item.state}
                expanded={expandedIds.has(item.event.id)}
                isHoliday={isKoreanHoliday(new Date(item.event.start_at))}
                onTap={() => toggleExpand(item.event.id)}
                onLongPress={setSheetEvent}
                onDelete={handleDelete}
                onComplete={handleComplete}
                colors={colors}
              />
            ),
          )}
        </View>
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

// ── SpineEventRow ─────────────────────────────────────────────────────────────
interface SpineEventRowProps {
  event:       Event;
  state:       EventState;
  expanded:    boolean;
  isHoliday:   boolean;
  onTap:       () => void;
  onLongPress: (e: Event) => void;
  onDelete:    (e: Event) => void;
  onComplete:  (e: Event) => void;
  colors:      AppTheme;
}

function SpineEventRow({
  event, state, expanded, isHoliday,
  onTap, onLongPress, onDelete, onComplete, colors,
}: SpineEventRowProps) {
  const swipeRef = useRef<Swipeable>(null);
  const styles   = useMemo(() => makeSpineEventStyles(colors, state), [colors, state]);

  const isPast    = state === 'past';
  const isNext    = state === 'next';
  const isCurrent = state === 'current';

  async function handleLongPress() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLongPress(event);
  }

  function handleComplete() {
    swipeRef.current?.close();
    onComplete(event);
  }

  function handleSwipeDelete() {
    swipeRef.current?.close();
    onDelete(event);
  }

  return (
    <Swipeable
      ref={swipeRef}
      renderLeftActions={() => (
        <View style={styles.actionLeft}>
          <Text style={styles.actionIcon}>✓</Text>
          <Text style={styles.actionLabel}>완료</Text>
        </View>
      )}
      renderRightActions={() => (
        <View style={styles.actionRight}>
          <Text style={styles.actionIcon}>🗑️</Text>
          <Text style={styles.actionLabel}>삭제</Text>
        </View>
      )}
      onSwipeableOpen={dir => {
        if (dir === 'left') handleComplete();
        else handleSwipeDelete();
      }}
      friction={2}
      leftThreshold={60}
      rightThreshold={60}
      overshootLeft={false}
      overshootRight={false}
    >
      <Pressable
        style={[styles.row, expanded && { backgroundColor: colors.card2 + '80' }]}
        onPress={onTap}
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
        {/* Time column */}
        <Text style={[styles.time, isHoliday && styles.timeHoliday]}>
          {formatTimeRow(new Date(event.start_at))}
        </Text>

        {/* Spine dot */}
        <View style={styles.dot} />

        {/* Title + meta */}
        <View style={styles.titleArea}>
          <Text
            style={[styles.title, isPast && styles.titleStrike]}
            numberOfLines={expanded ? undefined : 1}
          >
            {event.title}
          </Text>

          {isNext    && <Text style={styles.badge}>다음 일정</Text>}
          {isCurrent && <Text style={[styles.badge, { color: colors.primary }]}>진행 중</Text>}

          {expanded && (
            <View style={styles.expandedArea}>
              {event.location ? (
                <Text style={styles.expandedLine}>📍 {event.location}</Text>
              ) : null}
              {event.description ? (
                <Text style={styles.expandedLine}>💭 {event.description}</Text>
              ) : null}
              {!event.location && !event.description && (
                <Text style={styles.expandedEmpty}>메모나 장소가 없어요</Text>
              )}
            </View>
          )}
        </View>
      </Pressable>
    </Swipeable>
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

const nowRowStyles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingHorizontal: PADDING_H,
    marginVertical: 16,
    gap: DOT_GAP,
  },
  time: {
    width:      TIME_W,
    fontSize:   11,
    fontWeight: '500',
    textAlign:  'right',
  },
  lineWrap: {
    flex:           1,
    flexDirection:  'row',
    alignItems:     'center',
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
    fontSize:    9,
    fontWeight:  '600',
    letterSpacing: 0.8,
    marginLeft:  6,
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
      position:         'absolute',
      left:             SPINE_X,
      top:              4,
      bottom:           4,
      width:            0.5,
    },
    toast: {
      position:         'absolute',
      bottom:           20,
      left:             20,
      right:            20,
      backgroundColor:  c.card,
      borderRadius:     12,
      borderWidth:      0.5,
      borderColor:      c.border,
      flexDirection:    'row',
      alignItems:       'center',
      justifyContent:   'space-between',
      paddingHorizontal: 16,
      paddingVertical:   12,
      shadowColor:      '#000',
      shadowOffset:     { width: 0, height: 2 },
      shadowOpacity:    0.12,
      shadowRadius:     8,
      elevation:        6,
    },
    toastText: { fontSize: 14, color: c.textPrimary, flex: 1 },
    toastUndo: { fontSize: 14, color: c.accent, fontWeight: '700', marginLeft: 12 },
  });
}

// ── Per-event styles (state-dependent) ───────────────────────────────────────
function makeSpineEventStyles(c: AppTheme, state: EventState) {
  const isPast    = state === 'past';
  const isNext    = state === 'next';
  const isCurrent = state === 'current';

  const dotSize  = isNext || isCurrent ? 12 : 7;
  const dotColor = isPast    ? c.textMuted
                 : isCurrent ? c.primary
                 : isNext    ? c.accent
                 :             c.textSecondary;
  const dotBorderWidth = isNext ? 3 : 0;
  const dotBorderColor = isNext ? c.accent + '40' : 'transparent';

  return StyleSheet.create({
    row: {
      flexDirection:     'row',
      alignItems:        'flex-start',
      paddingHorizontal: PADDING_H,
      paddingVertical:   10,
      gap:               DOT_GAP,
      opacity:           isPast ? 0.42 : 1,
      backgroundColor:   'transparent',
    },
    time: {
      width:      TIME_W,
      fontSize:   11,
      color:      c.textMuted,
      textAlign:  'right',
      paddingTop: 3,
      fontFamily: MONO,
    },
    timeHoliday: {
      color: '#DC2626',
    },
    dot: {
      width:           dotSize + dotBorderWidth * 2,
      height:          dotSize + dotBorderWidth * 2,
      borderRadius:    (dotSize + dotBorderWidth * 2) / 2,
      backgroundColor: dotColor,
      borderWidth:     dotBorderWidth,
      borderColor:     dotBorderColor,
      marginTop:       isNext ? 1 : 4,
    },
    titleArea: {
      flex: 1,
      gap:  2,
    },
    title: {
      fontSize:   isNext ? 15 : 13,
      fontWeight: isNext ? '600' : '400',
      color:      c.textPrimary,
      lineHeight: 19,
    },
    titleStrike: {
      textDecorationLine: 'line-through',
      color:              c.textMuted,
    },
    badge: {
      fontSize:   10,
      color:      c.accent,
      fontWeight: '500',
    },
    expandedArea: {
      paddingTop: 6,
      gap:        3,
    },
    expandedLine:  { fontSize: 12, color: c.textSecondary, lineHeight: 17 },
    expandedEmpty: { fontSize: 12, color: c.textMuted, fontStyle: 'italic' },
    actionLeft: {
      backgroundColor:  c.success,
      alignItems:       'center',
      justifyContent:   'center',
      paddingHorizontal: 24,
      gap:              2,
    },
    actionRight: {
      backgroundColor:  c.error,
      alignItems:       'center',
      justifyContent:   'center',
      paddingHorizontal: 24,
      gap:              2,
    },
    actionIcon:  { fontSize: 16, color: '#fff' },
    actionLabel: { fontSize: 10, color: '#fff', fontWeight: '700' },
  });
}
