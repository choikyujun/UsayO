import * as Haptics from 'expo-haptics';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { AppTheme } from '../constants/colors';
import { Event } from '../types/database';
import { formatTimeRow } from '../utils/timeHelpers';
import { getEventTop, getEventHeight, TIME_LABEL_W } from '../utils/dayViewLayout';
import { humanReadableRRule } from '../utils/recurrenceHelpers';

const EVENT_COLOR = '#534AB7'; // Voice Purple — unified for all categories

interface Props {
  event:       Event;
  colors:      AppTheme;
  onLongPress: (event: Event) => void;
  onDelete:    (event: Event) => void;
  onComplete:  (event: Event) => void;
}

function timeRange(startAt: string, endAt: string | null | undefined): string {
  const s = formatTimeRow(new Date(startAt));
  if (!endAt) return s;
  return `${s} — ${formatTimeRow(new Date(endAt))}`;
}

export default function DayEventBlock({ event, colors, onLongPress, onDelete, onComplete }: Props) {
  const swipeRef  = useRef<Swipeable>(null);
  const styles    = useMemo(() => makeStyles(colors), [colors]);
  const [expanded,  setExpanded]  = useState(false);
  const [completed, setCompleted] = useState(false);

  const top    = getEventTop(event.start_at);
  const height = getEventHeight(event.start_at, event.end_at);
  const isShort = height < 30; // < 30dp = under ~30min: single-line compact

  function handleSwipeComplete() {
    swipeRef.current?.close();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCompleted(true);
    onComplete(event); // parent is currently a no-op; wired for future completed_at column
  }

  function handleSwipeDelete() {
    swipeRef.current?.close();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onDelete(event);
  }

  return (
    <View style={[styles.absoluteWrap, { top, height, opacity: completed ? 0.45 : 1 }]}>
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
          {isShort ? (
            <Text style={[styles.compactTitle, completed && styles.strikethrough]} numberOfLines={1}>
              {event.title} · {timeRange(event.start_at, event.end_at)}
            </Text>
          ) : (
            <>
              <Text style={[styles.blockTitle, completed && styles.strikethrough]} numberOfLines={expanded ? undefined : 2}>
                {event.title}
              </Text>
              <Text style={styles.blockTime}>
                {timeRange(event.start_at, event.end_at)}
              </Text>

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
      left:         TIME_LABEL_W + 4,
      right:        6,
      overflow:     'hidden',
      borderRadius: 6,
    },
    block: {
      backgroundColor:  EVENT_COLOR,
      borderRadius:     6,
      paddingHorizontal: 8,
      paddingVertical:   6,
      overflow:         'hidden',
    },
    blockTitle: {
      fontSize:   13,
      color:      '#fff',
      fontWeight: '500',
      lineHeight: 18,
    },
    blockTime: {
      fontSize:   11,
      color:      '#DFDCFE',
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
      fontWeight: '500',
    },
    expandedArea: {
      marginTop: 4,
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
      paddingHorizontal: 16,
      borderRadius:    6,
      gap:             2,
    },
    actionRight: {
      backgroundColor: c.error,
      justifyContent:  'center',
      alignItems:      'center',
      paddingHorizontal: 16,
      borderRadius:    6,
      gap:             2,
    },
    actionIcon:  { fontSize: 18, color: '#fff' },
    actionLabel: { fontSize: 11, color: '#fff', fontWeight: '600' },
  });
}
