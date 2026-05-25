import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { Event } from '../types/database';
import { formatTimeRow, MONO } from '../utils/timeHelpers';
import { humanReadableRRule } from '../utils/recurrenceHelpers';

const PADDING_H = 20;
const TIME_W    = 38;
const DOT_GAP   = 14;
const DOT_SIZE  = 5;

interface Props {
  event:    Event;
  colors:   AppTheme;
  expanded: boolean;
  onTap:    () => void;
}

export default function UpcomingEventRow({ event, colors, expanded, onTap }: Props) {
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const startTime = formatTimeRow(new Date(event.start_at));

  return (
    <Pressable onPress={onTap} style={styles.row}>
      {/* Time */}
      <Text style={styles.time}>{startTime}</Text>

      {/* Dot + content */}
      <View style={styles.dotCol}>
        <View style={styles.dot} />
      </View>

      <View style={styles.content}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={expanded ? undefined : 1}>
            {event.title}
          </Text>
          {event.is_recurring && (
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
    },
    time: {
      width:      TIME_W,
      fontSize:   11,
      fontFamily: MONO,
      color:      c.textMuted,
      textAlign:  'right',
    },
    dotCol: {
      width:          DOT_SIZE,
      alignItems:     'center',
      justifyContent: 'center',
    },
    dot: {
      width:        DOT_SIZE,
      height:       DOT_SIZE,
      borderRadius: DOT_SIZE / 2,
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
      fontWeight: '400',
      flex:       1,
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
  });
}
