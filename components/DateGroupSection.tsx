import { useCallback, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { Event } from '../types/database';
import { DateGroup, formatUpcomingDate } from '../utils/dateHelpers';
import UpcomingEventRow from './UpcomingEventRow';
import { Spacing } from '../constants/spacing';

const PADDING_H = 20;
const SPINE_X   = PADDING_H + 60 + 9; // 초기 폴백. 실제 위치는 dot 실측(lineX)으로 자동 정렬

interface Props {
  group:        DateGroup<Event>;
  colors:       AppTheme;
  onLongPress?: (event: Event) => void;
  onDelete?:    (event: Event) => void;
  onComplete?:  (event: Event) => void;
}

export default function DateGroupSection({ group, colors, onLongPress, onDelete, onComplete }: Props) {
  const styles  = useMemo(() => makeStyles(colors), [colors]);
  const label   = formatUpcomingDate(group.date);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // 세로선 x를 dot 실측 중심으로 자동 정렬(계산 오차 제거).
  const eventsWrapperRef = useRef<View>(null);
  const [lineX, setLineX] = useState<number | null>(null);
  const handleDotMeasured = useCallback((centerX: number) => {
    setLineX(prev => (prev !== null && Math.abs(prev - centerX) < 0.5) ? prev : centerX);
  }, []);

  function toggleExpand(id: string) {
    setExpandedId(prev => (prev === id ? null : id));
  }

  return (
    <View style={styles.container}>
      {/* ── Date divider header ── */}
      <View style={styles.header}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <Text style={[styles.label, { color: colors.textMuted }]}>{label}</Text>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>

      {/* ── Events with spine line ── */}
      <View ref={eventsWrapperRef} style={styles.eventsWrapper}>
        {/* Spine continuation line — dot 실측 중심(lineX)에 정렬 */}
        <View style={[styles.spineLine, { backgroundColor: colors.border, left: lineX ?? SPINE_X }]} />

        {group.events.map(ev => (
          <UpcomingEventRow
            key={ev.id}
            event={ev}
            colors={colors}
            expanded={expandedId === ev.id}
            onTap={() => toggleExpand(ev.id)}
            onLongPress={onLongPress ? () => onLongPress(ev) : undefined}
            onDelete={onDelete ? () => onDelete(ev) : undefined}
            onComplete={onComplete ? () => onComplete(ev) : undefined}
            contentRef={eventsWrapperRef}
            onDotMeasured={handleDotMeasured}
          />
        ))}
      </View>
    </View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    container: {
      marginTop: Spacing.sm,
    },
    header: {
      flexDirection:     'row',
      alignItems:        'center',
      paddingHorizontal: PADDING_H,
      marginBottom: Spacing.xs,
      gap: Spacing.sm,
    },
    line: {
      flex:   1,
      height: 0.5,
    },
    label: {
      fontSize:      11,
      fontFamily: 'Pretendard-Medium',
      fontWeight:    '500',
      letterSpacing: 0.2,
    },
    eventsWrapper: {
      position: 'relative',
    },
    spineLine: {
      position:  'absolute',
      left:      SPINE_X,
      top:       0,
      bottom:    0,
      width:     0.5,
    },
  });
}
