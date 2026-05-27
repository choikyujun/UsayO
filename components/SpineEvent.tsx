import * as Haptics from 'expo-haptics';
import { CheckCircle, RotateCcw, Trash2 } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AppTheme } from '../constants/colors';
import { Event } from '../types/database';
import { formatTimeRow, MONO } from '../utils/timeHelpers';
import { humanReadableRRule } from '../utils/recurrenceHelpers';

const PADDING_H = 20;
const TIME_W    = 38;
const DOT_GAP   = 14;

export type EventState = 'past' | 'current' | 'next' | 'future';

interface SpineEventProps {
  event:       Event;
  state:       EventState;
  expanded:    boolean;
  isHoliday:   boolean;
  isLunch:     boolean;
  isCompleted: boolean;
  onTap:       () => void;
  onLongPress: (e: Event) => void;
  onDelete:    (e: Event) => void;
  onComplete:  (e: Event) => void;
  colors:      AppTheme;
  // Drag props (wired up in Step 3+)
  onLayout?:     (id: string, top: number, bottom: number) => void;
  getDropTime?:  (absoluteY: number) => Promise<Date>;
  onReschedule?: (eventId: string, newTime: Date) => void;
}

export default function SpineEvent({
  event, state, expanded, isHoliday, isLunch, isCompleted,
  onTap, onLongPress, onDelete, onComplete, colors,
  onLayout, getDropTime, onReschedule,
}: SpineEventProps) {
  const swipeRef      = useRef<Swipeable>(null);
  const pendingAction = useRef<'complete' | 'delete' | null>(null);
  const styles        = useMemo(() => makeStyles(colors, state), [colors, state]);
  const isPast    = state === 'past';
  const isNext    = state === 'next';
  const isCurrent = state === 'current';

  const dragY      = useSharedValue(0);
  const isDragging = useSharedValue(false);
  const [previewTime, setPreviewTime] = useState<string | null>(null);
  const lastPreviewMs = useRef(0);

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: dragY.value },
      { scale: withTiming(isDragging.value ? 1.015 : 1, { duration: 150 }) },
    ],
    opacity:   withTiming(isDragging.value ? 0.88 : 1, { duration: 150 }),
    elevation: isDragging.value ? 10 : 0,
    zIndex:    isDragging.value ? 100 : 0,
  }));

  function triggerHaptic() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function clearPreview() {
    setPreviewTime(null);
  }

  function handleDropJS(absoluteY: number) {
    if (!getDropTime || !onReschedule) return;
    getDropTime(absoluteY).then(newTime => {
      onReschedule(event.id, newTime);
      setPreviewTime(null);
    });
  }

  function refreshPreview(absoluteY: number) {
    const now = Date.now();
    if (now - lastPreviewMs.current < 200) return;
    lastPreviewMs.current = now;
    if (!getDropTime) return;
    getDropTime(absoluteY).then(newTime => {
      const h = String(newTime.getHours());
      const m = String(newTime.getMinutes()).padStart(2, '0');
      setPreviewTime(`${h}:${m}`);
    });
  }

  const panGesture = Gesture.Pan()
    .activateAfterLongPress(300)
    .enabled(isPast)
    .onStart(() => {
      isDragging.value = true;
      dragY.value = 0;
      runOnJS(triggerHaptic)();
    })
    .onUpdate(e => {
      dragY.value = e.translationY;
      if (e.translationY > 0) {
        runOnJS(refreshPreview)(e.absoluteY);
      }
    })
    .onEnd(e => {
      isDragging.value = false;
      dragY.value = withSpring(0, { damping: 20, stiffness: 300 });
      if (e.translationY > 40) {
        runOnJS(handleDropJS)(e.absoluteY);
      } else {
        runOnJS(clearPreview)();
      }
    })
    .onFinalize(() => {
      // Safety net: always reset if gesture is cancelled/interrupted
      isDragging.value = false;
      dragY.value = withSpring(0, { damping: 20, stiffness: 300 });
    });

  function handleComplete() {
    onComplete(event);
  }

  function handleSwipeDelete() {
    onDelete(event);
  }

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={animStyle}
        onLayout={e => {
          const { y, height } = e.nativeEvent.layout;
          onLayout?.(event.id, y, y + height);
        }}
      >
        <Swipeable
          ref={swipeRef}
          renderLeftActions={() => (
            <View style={[styles.actionLeft, isCompleted && styles.actionUndo]}>
              {isCompleted
                ? <RotateCcw  size={18} color="#fff" />
                : <CheckCircle size={18} color="#fff" />
              }
              <Text style={styles.actionLabel}>{isCompleted ? '완료취소' : '완료'}</Text>
            </View>
          )}
          renderRightActions={() => (
            <View style={styles.actionRight}>
              <Trash2 size={18} color="#fff" />
              <Text style={styles.actionLabel}>삭제</Text>
            </View>
          )}
          onSwipeableOpen={dir => {
            pendingAction.current = dir === 'left' ? 'complete' : 'delete';
            Haptics.impactAsync(
              dir === 'left' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Heavy,
            ).catch(() => {});
            swipeRef.current?.close();
          }}
          onSwipeableClose={() => {
            const action = pendingAction.current;
            pendingAction.current = null;
            if (action === 'complete') handleComplete();
            else if (action === 'delete') handleSwipeDelete();
          }}
          friction={2}
          leftThreshold={60}
          rightThreshold={60}
          overshootLeft={false}
          overshootRight={false}
        >
          <Pressable
            style={[
              styles.row,
              isLunch  && { backgroundColor: colors.primary + '08' },
              expanded && { backgroundColor: colors.card2 + '80' },
            ]}
            onPress={onTap}
            onLongPress={isPast ? undefined : () => onLongPress(event)}
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
              <View style={styles.titleRow}>
                <Text
                  style={[styles.title, isPast && styles.titleStrike]}
                  numberOfLines={expanded ? undefined : 1}
                >
                  {event.title}
                </Text>
                {event.is_recurring && (
                  <Text style={[styles.recurIcon, { color: colors.accent }]}>🔁</Text>
                )}
              </View>

              {isNext    && <Text style={styles.badge}>다음 일정</Text>}
              {isCurrent && <Text style={[styles.badge, { color: colors.primary }]}>진행 중</Text>}
              {previewTime && (
                <Text style={[styles.badge, { color: colors.accent }]}>
                  → {previewTime}로 이동
                </Text>
              )}

              {expanded && (
                <View style={styles.expandedArea}>
                  {event.is_recurring && event.recurrence_rule ? (
                    <Text style={styles.expandedLine}>
                      🔁 {humanReadableRRule(event.recurrence_rule)}
                    </Text>
                  ) : null}
                  {event.location ? (
                    <Text style={styles.expandedLine}>📍 {event.location}</Text>
                  ) : null}
                  {event.description ? (
                    <Text style={styles.expandedLine}>💭 {event.description}</Text>
                  ) : null}
                  {event.attendees?.length ? (
                    <Text style={styles.expandedLine}>👥 {event.attendees.join(', ')}</Text>
                  ) : null}
                  {!event.is_recurring && !event.location && !event.description && !event.attendees?.length && (
                    <Text style={styles.expandedEmpty}>메모나 장소가 없어요</Text>
                  )}
                </View>
              )}
            </View>
          </Pressable>
        </Swipeable>
      </Animated.View>
    </GestureDetector>
  );
}

function makeStyles(c: AppTheme, state: EventState) {
  const isPast    = state === 'past';
  const isNext    = state === 'next';
  const isCurrent = state === 'current';

  const dotSize        = isNext || isCurrent ? 12 : 7;
  const dotColor       = isPast    ? c.textMuted
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
    timeHoliday: { color: '#DC2626' },
    dot: {
      width:           dotSize + dotBorderWidth * 2,
      height:          dotSize + dotBorderWidth * 2,
      borderRadius:    (dotSize + dotBorderWidth * 2) / 2,
      backgroundColor: dotColor,
      borderWidth:     dotBorderWidth,
      borderColor:     dotBorderColor,
      marginTop:       isNext ? 1 : 4,
    },
    titleArea:    { flex: 1, gap: 2 },
    titleRow:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
    recurIcon:    { fontSize: 10 },
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
    badge:         { fontSize: 10, color: c.accent, fontWeight: '500' },
    expandedArea:  { paddingTop: 6, gap: 3 },
    expandedLine:  { fontSize: 12, color: c.textSecondary, lineHeight: 17 },
    expandedEmpty: { fontSize: 12, color: c.textMuted, fontStyle: 'italic' },
    actionLeft: {
      backgroundColor:   c.success,
      alignItems:        'center',
      justifyContent:    'center',
      paddingHorizontal: 24,
      gap:               2,
    },
    actionRight: {
      backgroundColor:   c.error,
      alignItems:        'center',
      justifyContent:    'center',
      paddingHorizontal: 24,
      gap:               2,
    },
    actionUndo:  { backgroundColor: c.primary },
    actionLabel: { fontSize: 10, color: '#fff', fontWeight: '700' },
  });
}
