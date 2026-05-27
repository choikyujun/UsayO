import { haptic } from '../utils/haptics';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { isKoreanHoliday } from '../hooks/useHolidays';
import { formatLunarShort } from '../utils/lunarHelpers';
import { isToday } from '../utils/monthViewLayout';

interface Props {
  dateStr:        string;
  isOtherMonth:   boolean;
  eventCount:     number;
  completedCount?: number;
  colors:         AppTheme;
  onPress:        (dateStr: string) => void;
  onLongPress?:   (dateStr: string) => void;
}

export default function MonthCell({ dateStr, isOtherMonth, eventCount, completedCount = 0, colors, onPress, onLongPress }: Props) {
  const today      = isToday(dateStr);
  const d          = new Date(dateStr + 'T00:00:00');
  const dayOfWeek  = d.getDay();
  const isHoliday  = !isOtherMonth && isKoreanHoliday(d);
  const { lunarEnabled } = useTheme();
  const lunarStr   = (!isOtherMonth && lunarEnabled) ? formatLunarShort(d) : '';

  let numColor: string;
  if (isOtherMonth) {
    numColor = colors.textTertiary;
  } else if (today) {
    numColor = '#FFFFFF';
  } else if (isHoliday) {
    numColor = colors.error;
  } else {
    numColor = colors.textPrimary;
  }

  const dots    = Math.min(eventCount, 3);
  const dimDots = Math.min(completedCount, dots);

  return (
    <Pressable
      style={styles.cell}
      onPress={() => {
        haptic.light();
        onPress(dateStr);
      }}
      onLongPress={onLongPress ? () => {
        haptic.medium();
        onLongPress(dateStr);
      } : undefined}
      delayLongPress={500}
    >
      <View style={[styles.numWrap, today && { backgroundColor: colors.primary }]}>
        <Text style={[styles.num, { color: numColor }]}>
          {d.getDate()}
        </Text>
      </View>

      {lunarStr ? (
        <Text style={[styles.lunar, { color: colors.textTertiary }]} numberOfLines={1}>
          {lunarStr}
        </Text>
      ) : null}

      {dots > 0 && (
        <View style={styles.dotsRow}>
          {Array.from({ length: dots }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, { backgroundColor: colors.primary, opacity: i < dimDots ? 0.35 : 1 }]}
            />
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex:       1,
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 6,
  },
  numWrap: {
    width:            28,
    height:           28,
    borderRadius:     14,
    alignItems:       'center',
    justifyContent:   'center',
  },
  num: {
    fontSize:   13,
    fontFamily: 'Pretendard-Regular',
    fontWeight: '400',
  },
  lunar: {
    fontSize:   8,
    fontFamily: 'Pretendard-Regular',
    fontWeight: '400',
    marginTop:  1,
    textAlign:  'center',
    letterSpacing: -0.2,
  },
  dotsRow: {
    flexDirection: 'row',
    gap:           2.5,
    marginTop:     2,
  },
  dot: {
    width:        3,
    height:       3,
    borderRadius: 1.5,
  },
});
