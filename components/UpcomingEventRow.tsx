import * as Haptics from 'expo-haptics';
import { CheckCircle, RotateCcw } from 'lucide-react-native';
import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { AppTheme } from '../constants/colors';
import { Event } from '../types/database';
import { formatTimeRow, MONO } from '../utils/timeHelpers';
import { humanReadableRRule } from '../utils/recurrenceHelpers';

const PADDING_H = 20;
const TIME_W    = 38;
const DOT_GAP   = 14;
const DOT_SIZE  = 5;

interface Props {
  event:        Event;
  colors:       AppTheme;
  expanded:     boolean;
  onTap:        () => void;
  onLongPress?: () => void;
  onDelete?:    () => void;
  onComplete?:  () => void;
}

export default function UpcomingEventRow({
  event, colors, expanded, onTap, onLongPress, onDelete, onComplete,
}: Props) {
  const styles        = useMemo(() => makeStyles(colors), [colors]);
  const swipeRef      = useRef<Swipeable>(null);
  const pendingAction = useRef<'complete' | 'delete' | null>(null);
  const startTime = formatTimeRow(new Date(event.start_at));
  const isCompleted = !!event.completed_at;

  async function handleLongPress() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onLongPress?.();
  }

  function handleSwipeDelete() {
    onDelete?.();
  }

  function handleSwipeComplete() {
    onComplete?.();
  }

  // renderRightActions: right panel revealed when row slides LEFT (left swipe) → delete
  function renderDeleteAction() {
    return (
      <View style={styles.actionDelete}>
        <Text style={styles.actionIcon}>🗑️</Text>
        <Text style={styles.actionDeleteLabel}>삭제</Text>
      </View>
    );
  }

  // renderLeftActions: left panel revealed when row slides RIGHT (right swipe) → complete / undo
  function renderCompleteAction() {
    return (
      <View style={[styles.actionComplete, isCompleted && styles.actionUndo]}>
        {isCompleted
          ? <RotateCcw size={16} color="#fff" />
          : <CheckCircle size={16} color="#fff" />
        }
        <Text style={styles.actionCompleteLabel}>{isCompleted ? '완료취소' : '완료'}</Text>
      </View>
    );
  }

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={onDelete ? renderDeleteAction : undefined}
      renderLeftActions={onComplete ? renderCompleteAction : undefined}
      onSwipeableOpen={(direction) => {
        pendingAction.current = direction === 'right' ? 'delete' : 'complete';
        Haptics.notificationAsync(
          direction === 'right'
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
        swipeRef.current?.close();
      }}
      onSwipeableClose={() => {
        const action = pendingAction.current;
        pendingAction.current = null;
        if (action === 'delete') handleSwipeDelete();
        else if (action === 'complete') handleSwipeComplete();
      }}
      friction={2}
      leftThreshold={60}
      rightThreshold={60}
      overshootLeft={false}
      overshootRight={false}
    >
      <Pressable
        onPress={onTap}
        onLongPress={onLongPress ? handleLongPress : undefined}
        delayLongPress={500}
        style={[styles.row, isCompleted && styles.rowCompleted]}
      >
        {/* Time */}
        <Text style={[styles.time, isCompleted && styles.textCompleted]}>{startTime}</Text>

        {/* Dot + content */}
        <View style={styles.dotCol}>
          {isCompleted
            ? <CheckCircle size={DOT_SIZE + 4} color={colors.success} />
            : <View style={styles.dot} />
          }
        </View>

        <View style={styles.content}>
          <View style={styles.titleRow}>
            <Text
              style={[styles.title, isCompleted && styles.titleCompleted]}
              numberOfLines={expanded ? undefined : 1}
            >
              {event.title}
            </Text>
            {event.is_recurring && !isCompleted && (
              <Text style={[styles.recurIcon, { color: colors.accent }]}>🔁</Text>
            )}
          </View>
          {expanded && (
            <View style={styles.expandedArea}>
              {event.is_recurring && event.recurrence_rule ? (
                <Text style={styles.meta}>🔁 {humanReadableRRule(event.recurrence_rule)}</Text>
              ) : null}
              {event.end_at && (
                <Text style={styles.meta}>
                  {formatTimeRow(new Date(event.start_at))} – {formatTimeRow(new Date(event.end_at))}
                </Text>
              )}
              {event.location ? <Text style={styles.meta}>📍 {event.location}</Text> : null}
              {event.description ? <Text style={styles.meta}>💭 {event.description}</Text> : null}
              {event.attendees?.length ? (
                <Text style={styles.meta}>👥 {event.attendees.join(', ')}</Text>
              ) : null}
            </View>
          )}
        </View>
      </Pressable>
    </Swipeable>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    row: {
      flexDirection:     'row',
      alignItems:        'center',
      paddingHorizontal: PADDING_H,
      paddingVertical:   8,
      gap:               DOT_GAP,
      backgroundColor:   'transparent',
    },
    rowCompleted: {
      opacity: 0.5,
    },
    time: {
      width:      TIME_W,
      fontSize:   11,
      fontFamily: MONO,
      color:      c.textMuted,
      textAlign:  'right',
    },
    textCompleted: {
      textDecorationLine: 'line-through',
    },
    dotCol: {
      width:          DOT_SIZE + 4,
      alignItems:     'center',
      justifyContent: 'center',
    },
    dot: {
      width:           DOT_SIZE,
      height:          DOT_SIZE,
      borderRadius:    DOT_SIZE / 2,
      backgroundColor: c.border,
    },
    content: {
      flex: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems:    'center',
      gap:           4,
    },
    title: {
      fontSize:   14,
      color:      c.textSecondary,
      fontFamily: 'Pretendard-Regular',
      fontWeight: '400',
      flex:       1,
    },
    titleCompleted: {
      textDecorationLine: 'line-through',
      color:              c.textMuted,
    },
    recurIcon: { fontSize: 10 },
    expandedArea: {
      marginTop: 4,
      gap: 2,
    },
    meta: {
      fontSize:   12,
      color:      c.textMuted,
      fontFamily: MONO,
    },
    actionDelete: {
      backgroundColor:   c.error,
      alignItems:        'center',
      justifyContent:    'center',
      paddingHorizontal: 24,
      gap:               2,
    },
    actionComplete: {
      backgroundColor:   c.success,
      alignItems:        'center',
      justifyContent:    'center',
      paddingHorizontal: 24,
      gap:               2,
    },
    actionUndo: {
      backgroundColor: c.primary,
    },
    actionIcon:          { fontSize: 16 },
    actionDeleteLabel:   { fontSize: 10, color: '#fff', fontFamily: 'Pretendard-Bold', fontWeight: '700' },
    actionCompleteLabel: { fontSize: 10, color: '#fff', fontFamily: 'Pretendard-Bold', fontWeight: '700' },
  });
}
