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

export default function DayEventBlock({ event, colors, onLongPress, onDelete, onComplete }: Props) {
  const swipeRef = useRef<Swipeable>(null);
  const styles   = useMemo(() => makeStyles(colors), [colors]);
  const [expanded, setExpanded] = useState(false);

  const top    = getEventTop(event.start_at);
  const height = getEventHeight(event.start_at, event.end_at);
  const isShort = height < 36; // compact display for <36dp events

  function handleSwipeComplete() {
    swipeRef.current?.close();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete(event);
  }

  function handleSwipeDelete() {
    swipeRef.current?.close();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onDelete(event);
  }

  return (
    <View style={[styles.absoluteWrap, { top, height }]}>
      <Swipeable
        ref={swipeRef}
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
          style={styles.block}
          onPress={() => setExpanded(e => !e)}
          onLongPress={() => onLongPress(event)}
          delayLongPress={500}
        >
          {isShort ? (
            // Compact: title + time on one line
            <Text style={styles.compactTitle} numberOfLines={1}>
              {formatTimeRow(new Date(event.start_at))} {event.title}
            </Text>
          ) : (
            <>
              <Text style={styles.blockTime}>{formatTimeRow(new Date(event.start_at))}</Text>
              <Text style={styles.blockTitle} numberOfLines={expanded ? undefined : 2}>
                {event.title}
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
      flex:             1,
      backgroundColor:  EVENT_COLOR,
      borderRadius:     6,
      padding:          6,
      overflow:         'hidden',
    },
    blockTime: {
      fontSize:   10,
      color:      'rgba(255,255,255,0.75)',
      fontWeight: '500',
      marginBottom: 1,
    },
    blockTitle: {
      fontSize:   13,
      color:      '#fff',
      fontWeight: '600',
      lineHeight: 17,
    },
    compactTitle: {
      fontSize:   11,
      color:      '#fff',
      fontWeight: '600',
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
