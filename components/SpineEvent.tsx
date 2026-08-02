import { CheckCircle, FileText, MapPin, Repeat, RotateCcw, Trash2, Users } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Animated as RNAnimated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { haptic } from '../utils/haptics';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AppTheme } from '../constants/colors';
import { Event } from '../types/database';
import { formatTimeRow } from '../utils/timeHelpers';
import { humanReadableRRule } from '../utils/recurrenceHelpers';
import { Spacing } from '../constants/spacing';

const PADDING_H = 20;
const TIME_W    = 44;  // 24시간제 숫자만("15:00") 기준. 스파인 SPINE_X와 동기화 유지.
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
    haptic.medium();
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
          renderLeftActions={(progress) => (
            <RNAnimated.View style={[
              styles.actionLeft,
              isCompleted && styles.actionUndo,
              { opacity: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.65, 1], extrapolate: 'clamp' }) },
            ]}>
              {isCompleted
                ? <RotateCcw  size={18} color="#fff" />
                : <CheckCircle size={18} color="#fff" />
              }
              <Text style={styles.actionLabel}>{isCompleted ? '완료취소' : '완료'}</Text>
            </RNAnimated.View>
          )}
          renderRightActions={(progress) => (
            <RNAnimated.View style={[
              styles.actionRight,
              { opacity: progress.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.35, 0.65, 1], extrapolate: 'clamp' }) },
            ]}>
              <Trash2 size={18} color="#fff" />
              <Text style={styles.actionLabel}>삭제</Text>
            </RNAnimated.View>
          )}
          onSwipeableWillOpen={(dir) => {
            if (dir === 'right') haptic.warning();
            else                 haptic.success();
          }}
          onSwipeableOpen={dir => {
            pendingAction.current = dir === 'left' ? 'complete' : 'delete';
            swipeRef.current?.close();
          }}
          onSwipeableClose={() => {
            const action = pendingAction.current;
            pendingAction.current = null;
            if (action === 'complete') handleComplete();
            else if (action === 'delete') handleSwipeDelete();
          }}
          friction={2}
          leftThreshold={80}
          rightThreshold={80}
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
            accessibilityRole="button"
            accessibilityLabel={`${event.title}, ${formatTimeRow(new Date(event.start_at))}${isCompleted ? ', 완료됨' : isCurrent ? ', 진행 중' : isNext ? ', 다음 일정' : ''}`}
            accessibilityHint={isPast ? undefined : '길게 누르면 옵션, 좌로 밀면 완료, 우로 밀면 삭제'}
          >
            {/* Time column (좌측 시각축 — 24시간제 숫자만) */}
            <Text style={[styles.time, isHoliday && styles.timeHoliday]} numberOfLines={1}>
              {formatTimeRow(new Date(event.start_at))}
            </Text>

            {/* Spine dot */}
            <View style={styles.dot} />

            {/* Title + meta */}
            <View style={styles.titleArea}>
              <View style={styles.titleRow}>
                <View style={styles.titleCluster}>
                  {/* 오전/오후 — 제목 앞 보조 라벨(좌측 24h와 중복이나 즉시 스캔용, 톤 낮춤) */}
                  <Text style={styles.ampm}>
                    {new Date(event.start_at).getHours() < 12 ? '오전' : '오후'}
                  </Text>
                  <Text
                    style={[styles.title, isPast && styles.titleStrike]}
                    numberOfLines={expanded ? undefined : 1}
                  >
                    {event.title}
                  </Text>
                  {/* 접힌 카드에서만 제목 옆 장소 표시(펼치면 아래 MapPin 줄과 중복이라 숨김). location 없으면 미표시. */}
                  {!expanded && event.location ? (
                    <>
                      <Text style={styles.locSep} numberOfLines={1}>·</Text>
                      <Text style={styles.locText} numberOfLines={1}>{event.location}</Text>
                    </>
                  ) : null}
                </View>
                {event.is_recurring && (
                  <Repeat size={11} color={colors.accent} />
                )}
                {/* 우측 시각 제거(좌측 컬럼으로 통합). "진행 중"만 행 끝에 유지. */}
                {isCurrent && <Text style={styles.currentTag}>진행 중</Text>}
              </View>

              {previewTime && (
                <Text style={[styles.badge, { color: colors.accent }]}>
                  → {previewTime}로 이동
                </Text>
              )}

              {expanded && (
                <View style={styles.expandedArea}>
                  {event.is_recurring && event.recurrence_rule ? (
                    <View style={styles.expandedRow}>
                      <Repeat size={12} color={colors.textSecondary} style={styles.expandedIcon} />
                      <Text style={styles.expandedLine}>{humanReadableRRule(event.recurrence_rule)}</Text>
                    </View>
                  ) : null}
                  {event.location ? (
                    <View style={styles.expandedRow}>
                      <MapPin size={12} color={colors.textSecondary} style={styles.expandedIcon} />
                      <Text style={styles.expandedLine}>{event.location}</Text>
                    </View>
                  ) : null}
                  {event.description ? (
                    <View style={styles.expandedRow}>
                      <FileText size={12} color={colors.textSecondary} style={styles.expandedIcon} />
                      <Text style={styles.expandedLine}>{event.description}</Text>
                    </View>
                  ) : null}
                  {event.attendees?.length ? (
                    <View style={styles.expandedRow}>
                      <Users size={12} color={colors.textSecondary} style={styles.expandedIcon} />
                      <Text style={styles.expandedLine}>{event.attendees.join(', ')}</Text>
                    </View>
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
      width:       TIME_W,
      marginRight: 5,    // 점을 시각 쪽으로 당김. 세로선은 점 중앙에 배치(SPINE_X) → 시각 뒤 여백 ≈ 22
      fontSize:    12.5,
      fontWeight:  '500',
      color:       c.textSecondary,
      textAlign:   'right',
      paddingTop:  2,
      fontFamily:  'Pretendard-Medium',
    },
    timeHoliday: { color: c.error },
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
    // 제목+장소 좌측 클러스터. 시각은 이 밖(우측 고정). 공간 부족 시 크기 비례로 장소가 먼저 줄어듦.
    titleCluster: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    ampm:    { flexShrink: 0, marginRight: 5, fontSize: 11, fontWeight: '500', color: c.textMuted, fontFamily: 'Pretendard-Medium' },
    title: {
      flexShrink: 1,
      fontSize:   isNext ? 15 : 13,
      fontWeight: isNext ? '600' : '400',
      color:      c.textPrimary,
      lineHeight: 19,
    },
    locSep:  { flexShrink: 0, marginHorizontal: 5, fontSize: 12, color: c.textMuted },
    locText: { flexShrink: 1, fontSize: 12, color: c.textMuted },
    titleStrike: {
      textDecorationLine: 'line-through',
      color:              c.textMuted,
    },
    badge:         { fontSize: 10, color: c.accent, fontFamily: 'Pretendard-Medium', fontWeight: '500' },
    // 제목 오른쪽 시각 슬롯 — 우측 정렬 + 고정폭으로 여러 행의 시각이 세로 정렬되도록.
    currentTag:    { fontSize: 11, color: c.primary, fontFamily: 'Pretendard-Medium', fontWeight: '500', marginLeft: Spacing.xs },
    expandedArea:  { paddingTop: 6, gap: 3 },
    expandedRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    expandedIcon:  { marginTop: 2 },
    expandedLine:  { flex: 1, fontSize: 12, color: c.textSecondary, lineHeight: 17 },
    expandedEmpty: { fontSize: 12, color: c.textMuted, fontStyle: 'italic' },
    actionLeft: {
      backgroundColor:   c.success,
      alignItems:        'center',
      justifyContent:    'center',
      paddingHorizontal: Spacing.lg,
      gap:               2,
    },
    actionRight: {
      backgroundColor:   c.error,
      alignItems:        'center',
      justifyContent:    'center',
      paddingHorizontal: Spacing.lg,
      gap:               2,
    },
    actionUndo:  { backgroundColor: c.primary },
    actionLabel: { fontSize: 10, color: '#fff', fontFamily: 'Pretendard-Bold', fontWeight: '700' },
  });
}
