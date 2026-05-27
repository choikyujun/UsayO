import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { AppTheme } from '../constants/colors';
import { Event } from '../types/database';
import { formatTimeRow } from '../utils/timeHelpers';
import { getEventTop, getEventHeight, TIME_LABEL_W } from '../utils/dayViewLayout';
import { humanReadableRRule } from '../utils/recurrenceHelpers';
import { Spacing } from '../constants/spacing';

const SCREEN_W   = Dimensions.get('window').width;
const LEFT_PAD   = 4;
const RIGHT_PAD  = 6;
const COL_GAP    = 2;  // gap between adjacent columns
const USABLE_W   = SCREEN_W - TIME_LABEL_W - LEFT_PAD - RIGHT_PAD;

interface Props {
  event:        Event;
  colors:       AppTheme;
  onLongPress:  (event: Event) => void;
  onDelete:     (event: Event) => void;
  onComplete:   (event: Event) => void;
  widthRatio?:  number;  // default 1.0 — fraction of usable width
  xRatio?:      number;  // default 0.0 — left offset fraction
}

function timeRange(startAt: string, endAt: string | null | undefined): string {
  const s = formatTimeRow(new Date(startAt));
  if (!endAt) return s;
  return `${s} — ${formatTimeRow(new Date(endAt))}`;
}

export default function DayEventBlock({ event, colors, onLongPress, onDelete, onComplete, widthRatio = 1, xRatio = 0 }: Props) {
  const swipeRef  = useRef<Swipeable>(null);
  const styles    = useMemo(() => makeStyles(colors), [colors]);
  const [expanded,   setExpanded]   = useState(false);
  const [isCompleted, setIsCompleted] = useState(!!event.completed_at);

  const top    = getEventTop(event.start_at);
  const height = getEventHeight(event.start_at, event.end_at);
  const isShort = height < 30;

  // Pixel-based left/width from layout ratios
  const blockWidth = Math.max(widthRatio * USABLE_W - COL_GAP, 20);
  const blockLeft  = TIME_LABEL_W + LEFT_PAD + xRatio * USABLE_W;

  // Text adaptation based on column width
  const isNarrow   = widthRatio < 0.3;
  const isVeryNarrow = widthRatio < 0.2;

  function handleSwipeComplete() {
    swipeRef.current?.close();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsCompleted(c => !c);
    onComplete(event);
  }

  function handleSwipeDelete() {
    swipeRef.current?.close();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onDelete(event);
  }

  return (
    <View style={[styles.absoluteWrap, { top, height, left: blockLeft, width: blockWidth, opacity: isCompleted ? 0.45 : 1 }]}>
      <Swipeable
        ref={swipeRef}
        containerStyle={{ flex: 1 }}
        friction={2}
        leftThreshold={60}
        rightThreshold={60}
        overshootLeft={false}
        overshootRight={false}
        renderLeftActions={() => (
          <View style={styles.actionLeft}>
            <Text style={styles.actionIcon}>✓</Text>
            {!isShort && <Text style={styles.actionLabel}>완료</Text>}
          </View>
        )}
        renderRightActions={() => (
          <View style={styles.actionRight}>
            <Text style={styles.actionIcon}>🗑️</Text>
            {!isShort && <Text style={styles.actionLabel}>삭제</Text>}
          </View>
        )}
        onSwipeableOpen={dir => {
          if (dir === 'left') handleSwipeComplete();
          else handleSwipeDelete();
        }}
      >
        <Pressable
          style={[styles.block, { height }]}
          onPress={() => setExpanded(e => !e)}
          onLongPress={() => onLongPress(event)}
          delayLongPress={500}
        >
          {isCompleted && (
            <View style={styles.checkBadge}>
              <Check size={10} color="#fff" strokeWidth={3} />
            </View>
          )}
          {isVeryNarrow ? null : isShort ? (
            <Text style={[styles.compactTitle, isCompleted && styles.strikethrough]} numberOfLines={1}>
              {isNarrow ? event.title : `${event.title} · ${timeRange(event.start_at, event.end_at)}`}
            </Text>
          ) : (
            <>
              <Text style={[styles.blockTitle, isCompleted && styles.strikethrough]} numberOfLines={expanded ? undefined : 2}>
                {event.title}
              </Text>
              {!isNarrow && (
                <Text style={styles.blockTime}>
                  {timeRange(event.start_at, event.end_at)}
                </Text>
              )}

              {expanded && (
                <View style={styles.expandedArea}>
                  {event.is_recurring && event.recurrence_rule ? (
                    <Text style={styles.meta}>🔁 {humanReadableRRule(event.recurrence_rule)}</Text>
                  ) : null}
                  {event.location ? (
                    <Text style={styles.meta}>📍 {event.location}</Text>
                  ) : null}
                  {event.description ? (
                    <Text style={styles.meta}>💭 {event.description}</Text>
                  ) : null}
                  {event.attendees?.length ? (
                    <Text style={styles.meta}>👥 {event.attendees.join(', ')}</Text>
                  ) : null}
                </View>
              )}
            </>
          )}
        </Pressable>
      </Swipeable>
    </View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    absoluteWrap: {
      position:     'absolute',
      overflow:     'hidden',
      borderRadius: 6,
    },
    block: {
      backgroundColor:  c.primary,
      borderRadius:     6,
      paddingHorizontal: Spacing.sm,
      paddingVertical:   6,
      overflow:         'hidden',
      position:         'relative',
    },
    checkBadge: {
      position:         'absolute',
      top:              4,
      right:            4,
      width:            16,
      height:           16,
      borderRadius:     8,
      backgroundColor:  c.success,
      alignItems:       'center',
      justifyContent:   'center',
    },
    blockTitle: {
      fontSize:   13,
      color:      '#fff',
      fontFamily: 'Pretendard-Medium',
      fontWeight: '500',
      lineHeight: 18,
    },
    blockTime: {
      fontSize:   11,
      color:      'rgba(255,255,255,0.75)',
      fontFamily: 'Pretendard-Regular',
      fontWeight: '400',
      marginTop:  2,
    },
    strikethrough: {
      textDecorationLine: 'line-through',
      textDecorationColor: 'rgba(255,255,255,0.6)',
    },
    compactTitle: {
      fontSize:   11,
      color:      '#fff',
      fontFamily: 'Pretendard-Medium',
      fontWeight: '500',
    },
    expandedArea: {
      marginTop: Spacing.xs,
      gap:       2,
    },
    meta: {
      fontSize:   11,
      color:      'rgba(255,255,255,0.80)',
    },
    actionLeft: {
      backgroundColor: c.success,
      justifyContent:  'center',
      alignItems:      'center',
      paddingHorizontal: Spacing.base,
      borderRadius:    6,
      gap:             2,
    },
    actionRight: {
      backgroundColor: c.error,
      justifyContent:  'center',
      alignItems:      'center',
      paddingHorizontal: Spacing.base,
      borderRadius:    6,
      gap:             2,
    },
    actionIcon:  { fontSize: 18, color: '#fff' },
    actionLabel: { fontSize: 11, color: '#fff', fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
  });
}
