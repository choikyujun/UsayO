import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { Event } from '../types/database';
import { DateGroup, formatUpcomingDate } from '../utils/dateHelpers';
import UpcomingEventRow from './UpcomingEventRow';

const PADDING_H = 20;
const SPINE_X   = PADDING_H + 38 + 14 / 2; // matches TimeSpine spine line position

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
      <View style={styles.eventsWrapper}>
        {/* Spine continuation line */}
        <View style={[styles.spineLine, { backgroundColor: colors.border }]} />

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
          />
        ))}
      </View>
    </View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    container: {
      marginTop: 8,
    },
    header: {
      flexDirection:     'row',
      alignItems:        'center',
      paddingHorizontal: PADDING_H,
      marginBottom:      4,
      gap:               8,
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
