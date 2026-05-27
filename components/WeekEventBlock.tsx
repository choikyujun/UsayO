import * as Haptics from 'expo-haptics';
import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { Event } from '../types/database';
import { getEventHeight, getEventTop, TIME_LABEL_W } from '../utils/dayViewLayout';
import { formatTimeRow } from '../utils/timeHelpers';
import { COL_W } from '../utils/weekViewLayout';

const EVENT_COLORS: Record<string, string> = {
  blue:   '#4A90D9',
  green:  '#1D9E75',
  red:    '#E05555',
  yellow: '#E09A1A',
  purple: '#534AB7',
};

interface Props {
  event:       Event;
  colIndex:    number;
  colors:      AppTheme;
  onPress:     (event: Event) => void;
  onLongPress: (event: Event) => void;
}

export default function WeekEventBlock({ event, colIndex, colors, onPress, onLongPress }: Props) {
  const top    = getEventTop(event.start_at);
  const height = getEventHeight(event.start_at, event.end_at);
  const isShort = height < 28;

  const left   = TIME_LABEL_W + colIndex * COL_W + 1;
  const width  = COL_W - 2;

  const accentColor = (event.color && EVENT_COLORS[event.color])
    ? EVENT_COLORS[event.color]
    : colors.primary;

  function handleLongPress() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onLongPress(event);
  }

  const isCompleted = !!event.completed_at;

  return (
    <View style={[styles.wrap, { top, height, left, width, opacity: isCompleted ? 0.5 : 1 }]}>
      <Pressable
        style={[styles.block, { backgroundColor: accentColor + '22', borderLeftColor: accentColor }]}
        onPress={() => onPress(event)}
        onLongPress={handleLongPress}
        delayLongPress={400}
      >
        {isCompleted && (
          <View style={styles.checkBadge}>
            <Check size={7} color={accentColor} strokeWidth={3} />
          </View>
        )}
        {isShort ? (
          <Text style={[styles.titleShort, { color: accentColor }, isCompleted && styles.strikethrough]} numberOfLines={1}>
            {event.title}
          </Text>
        ) : (
          <>
            <Text style={[styles.title, { color: accentColor }, isCompleted && styles.strikethrough]} numberOfLines={2}>
              {event.title}
            </Text>
            <Text style={[styles.time, { color: accentColor + 'AA' }]} numberOfLines={1}>
              {formatTimeRow(new Date(event.start_at))}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
  },
  block: {
    flex:            1,
    borderLeftWidth: 2,
    borderRadius:    3,
    paddingLeft:     3,
    paddingTop:      2,
    paddingRight:    2,
    overflow:        'hidden',
  },
  title: {
    fontSize:   9,
    fontWeight: '600',
    lineHeight: 12,
  },
  titleShort: {
    fontSize:   9,
    fontWeight: '600',
    lineHeight: 11,
  },
  time: {
    fontSize:  8,
    marginTop: 1,
  },
  strikethrough: {
    textDecorationLine: 'line-through',
  },
  checkBadge: {
    position:    'absolute',
    top:         2,
    right:       2,
    width:       12,
    height:      12,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.6)',
    alignItems:  'center',
    justifyContent: 'center',
  },
});
