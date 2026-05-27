import { CheckCircle, RotateCcw, Trash2 } from 'lucide-react-native';
import { useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { AppTheme } from '../constants/colors';
import { haptic } from '../utils/haptics';
import { Event } from '../types/database';
import { formatTimeRow, MONO } from '../utils/timeHelpers';
import { humanReadableRRule } from '../utils/recurrenceHelpers';
import { Spacing } from '../constants/spacing';

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
  const startTime   = formatTimeRow(new Date(event.start_at));
  const isCompleted = !!event.completed_at;

  async function handleLongPress() {
    await haptic.medium();
    onLongPress?.();
  }

  function renderDeleteAction(progress: Animated.AnimatedInterpolation<number>) {
    const opacity = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.65, 1], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.actionDelete, { opacity }]}>
        <Trash2 size={16} color="#fff" />
        <Text style={styles.actionDeleteLabel}>삭제</Text>
      </Animated.View>
    );
  }

  function renderCompleteAction(progress: Animated.AnimatedInterpolation<number>) {
    const opacity = progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.65, 1], extrapolate: 'clamp' });
    return (
      <Animated.View style={[styles.actionComplete, isCompleted && styles.actionUndo, { opacity }]}>
        {isCompleted
          ? <RotateCcw  size={16} color="#fff" />
          : <CheckCircle size={16} color="#fff" />
        }
        <Text style={styles.actionCompleteLabel}>{isCompleted ? '완료취소' : '완료'}</Text>
      </Animated.View>
    );
  }

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={onDelete   ? renderDeleteAction   : undefined}
      renderLeftActions={onComplete  ? renderCompleteAction : undefined}
      onSwipeableWillOpen={(direction) => {
        if (direction === 'right') haptic.warning();
        else                       haptic.success();
      }}
      onSwipeableOpen={(direction) => {
        pendingAction.current = direction === 'right' ? 'delete' : 'complete';
        swipeRef.current?.close();
      }}
      onSwipeableClose={() => {
        const action = pendingAction.current;
        pendingAction.current = null;
        if (action === 'delete')   onDelete?.();
        else if (action === 'complete') onComplete?.();
      }}
      friction={2}
      leftThreshold={80}
      rightThreshold={80}
      overshootLeft={false}
      overshootRight={false}
    >
      <Pressable
        onPress={onTap}
        onLongPress={onLongPress ? handleLongPress : undefined}
        delayLongPress={500}
        style={[styles.row, isCompleted && styles.rowCompleted]}
      >
        <Text style={[styles.time, isCompleted && styles.textCompleted]}>{startTime}</Text>

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
              {event.location   ? <Text style={styles.meta}>📍 {event.location}</Text>   : null}
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
      paddingVertical:   Spacing.sm,
      gap:               DOT_GAP,
      backgroundColor:   'transparent',
    },
    rowCompleted: { opacity: 0.5 },
    time: {
      width:      TIME_W,
      fontSize:   11,
      fontFamily: MONO,
      color:      c.textMuted,
      textAlign:  'right',
    },
    textCompleted:   { textDecorationLine: 'line-through' },
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
    content:  { flex: 1 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
    title: {
      fontSize:   14,
      color:      c.textSecondary,
      fontFamily: 'Pretendard-Regular',
      fontWeight: '400',
      flex:       1,
    },
    titleCompleted: { textDecorationLine: 'line-through', color: c.textMuted },
    recurIcon:   { fontSize: 10 },
    expandedArea: { marginTop: Spacing.xs, gap: 2 },
    meta: { fontSize: 12, color: c.textMuted, fontFamily: MONO },
    actionDelete: {
      backgroundColor:   c.error,
      alignItems:        'center',
      justifyContent:    'center',
      paddingHorizontal: Spacing.lg,
      gap:               2,
    },
    actionComplete: {
      backgroundColor:   c.success,
      alignItems:        'center',
      justifyContent:    'center',
      paddingHorizontal: Spacing.lg,
      gap:               2,
    },
    actionUndo:          { backgroundColor: c.primary },
    actionDeleteLabel:   { fontSize: 10, color: '#fff', fontFamily: 'Pretendard-Bold', fontWeight: '700' },
    actionCompleteLabel: { fontSize: 10, color: '#fff', fontFamily: 'Pretendard-Bold', fontWeight: '700' },
  });
}
