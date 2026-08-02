import { CheckCircle, FileText, MapPin, Repeat, RotateCcw, Trash2, Users } from 'lucide-react-native';
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
const TIME_W    = 44;  // 24시간제 숫자만("15:00") 기준
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
  const startTime   = formatTimeRow(new Date(event.start_at)); // 좌측 컬럼 24시간제 숫자
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
        accessibilityRole="button"
        accessibilityLabel={`${event.title}, ${startTime}${isCompleted ? ', 완료됨' : ''}`}
        accessibilityHint="길게 누르면 옵션"
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
            <View style={styles.titleCluster}>
              {/* 오전/오후 — 제목 앞 보조 라벨(좌측 24h와 중복이나 즉시 스캔용, 톤 낮춤) */}
              <Text style={styles.ampm}>
                {new Date(event.start_at).getHours() < 12 ? '오전' : '오후'}
              </Text>
              <Text
                style={[styles.title, isCompleted && styles.titleCompleted]}
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
            {event.is_recurring && !isCompleted && (
              <Repeat size={11} color={colors.accent} />
            )}
            {/* 우측 시각 제거 — 좌측 시각 컬럼으로 통합 */}
          </View>
          {expanded && (
            <View style={styles.expandedArea}>
              {event.is_recurring && event.recurrence_rule ? (
                <View style={styles.metaRow}>
                  <Repeat size={12} color={colors.textMuted} style={styles.metaIcon} />
                  <Text style={[styles.meta, styles.metaFlex]}>{humanReadableRRule(event.recurrence_rule)}</Text>
                </View>
              ) : null}
              {event.end_at && (
                <Text style={styles.meta}>
                  {formatTimeRow(new Date(event.start_at))} – {formatTimeRow(new Date(event.end_at))}
                </Text>
              )}
              {event.location ? (
                <View style={styles.metaRow}>
                  <MapPin size={12} color={colors.textMuted} style={styles.metaIcon} />
                  <Text style={[styles.meta, styles.metaFlex]}>{event.location}</Text>
                </View>
              ) : null}
              {event.description ? (
                <View style={styles.metaRow}>
                  <FileText size={12} color={colors.textMuted} style={styles.metaIcon} />
                  <Text style={[styles.meta, styles.metaFlex]}>{event.description}</Text>
                </View>
              ) : null}
              {event.attendees?.length ? (
                <View style={styles.metaRow}>
                  <Users size={12} color={colors.textMuted} style={styles.metaIcon} />
                  <Text style={[styles.meta, styles.metaFlex]}>{event.attendees.join(', ')}</Text>
                </View>
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
      width:       TIME_W,
      marginRight: 5,    // SpineEvent와 동일한 시각 뒤 여백(카드 일관성)
      fontSize:    12.5,
      fontWeight:  '500',
      fontFamily:  'Pretendard-Medium',
      color:       c.textSecondary,
      textAlign:   'right',
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
    // 제목+장소 좌측 클러스터. 시각은 밖(우측 고정). 공간 부족 시 장소가 먼저 줄어듦.
    titleCluster: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    ampm:    { flexShrink: 0, marginRight: 5, fontSize: 11, fontWeight: '500', color: c.textMuted, fontFamily: 'Pretendard-Medium' },
    title: {
      fontSize:   14,
      color:      c.textSecondary,
      fontFamily: 'Pretendard-Regular',
      fontWeight: '400',
      flexShrink: 1,
    },
    titleCompleted: { textDecorationLine: 'line-through', color: c.textMuted },
    locSep:  { flexShrink: 0, marginHorizontal: 5, fontSize: 12, color: c.textMuted },
    locText: { flexShrink: 1, fontSize: 12, color: c.textMuted },
    expandedArea: { marginTop: Spacing.xs, gap: 2 },
    metaRow:  { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    metaIcon: { marginTop: 1 },
    metaFlex: { flex: 1 },
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
