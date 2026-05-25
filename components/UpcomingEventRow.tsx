import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { Event } from '../types/database';
import { formatTimeRow, MONO } from '../utils/timeHelpers';

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
        <Text style={styles.title} numberOfLines={expanded ? undefined : 1}>
          {event.title}
        </Text>
        {expanded && event.end_at && (
          <Text style={styles.duration}>
            {formatTimeRow(new Date(event.start_at))} – {formatTimeRow(new Date(event.end_at))}
          </Text>
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
    title: {
      fontSize:   14,
      color:      c.textSecondary,
      fontWeight: '400',
    },
    duration: {
      fontSize:   12,
      color:      c.textMuted,
      marginTop:  2,
      fontFamily: MONO,
    },
  });
}
