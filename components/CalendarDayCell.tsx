import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../constants/colors';

interface Props {
  dayNum: number;
  isToday: boolean;
  isSelected: boolean;
  isCurrentMonth: boolean;
  isHoliday: boolean;
  isSunday: boolean;
  isSaturday: boolean;
  eventCount: number;
  onPress: () => void;
  colors: AppTheme;
}

const CELL_SIZE = 28;
const SAT_COLOR = '#2563EB';

export default function CalendarDayCell({
  dayNum, isToday, isSelected, isCurrentMonth,
  isHoliday, isSunday, isSaturday, eventCount, onPress, colors,
}: Props) {
  let numColor = colors.textPrimary;
  if (!isCurrentMonth)        numColor = colors.textMuted;
  else if (isHoliday || isSunday) numColor = colors.error;
  else if (isSaturday)        numColor = SAT_COLOR;
  if (isSelected)             numColor = '#fff';

  return (
    <Pressable style={styles.cell} onPress={onPress} hitSlop={2}>
      <View style={[
        styles.circle,
        isToday && !isSelected && { borderColor: colors.primary, borderWidth: 1.5 },
        isSelected && { backgroundColor: colors.primary },
      ]}>
        <Text style={[styles.num, { color: numColor }]}>{dayNum}</Text>
      </View>

      {/* Event dot(s) */}
      <View style={styles.dotsRow}>
        {eventCount === 1 && <View style={[styles.dot, { backgroundColor: colors.accent }]} />}
        {eventCount === 2 && (
          <>
            <View style={[styles.dot, { backgroundColor: colors.accent }]} />
            <View style={[styles.dot, { backgroundColor: colors.accent }]} />
          </>
        )}
        {eventCount >= 3 && <View style={[styles.dotWide, { backgroundColor: colors.primary }]} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 3,
    gap: 2,
  },
  circle: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderRadius: CELL_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  num: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 18,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 2,
    height: 4,
    alignItems: 'center',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  dotWide: {
    width: 8,
    height: 4,
    borderRadius: 2,
  },
});
