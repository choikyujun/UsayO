import { StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { TIME_LABEL_W } from '../utils/dayViewLayout';
import { COL_W, formatColumnHeader } from '../utils/weekViewLayout';
import { todayDateStr } from '../utils/timeHelpers';

interface Props {
  days:   string[];
  colors: AppTheme;
}

export default function WeekHeader({ days, colors }: Props) {
  const today = todayDateStr();

  return (
    <View style={[styles.row, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
      {/* Time label spacer */}
      <View style={{ width: TIME_LABEL_W }} />

      {days.map(dateStr => {
        const { day, num } = formatColumnHeader(dateStr);
        const isToday = dateStr === today;
        return (
          <View key={dateStr} style={[styles.col, { width: COL_W }]}>
            <Text style={[styles.dayText, { color: isToday ? colors.primary : colors.textMuted }]}>
              {day}
            </Text>
            <View style={[
              styles.numWrap,
              isToday && { backgroundColor: colors.primary, borderRadius: 14 },
            ]}>
              <Text style={[
                styles.numText,
                { color: isToday ? '#fff' : colors.textPrimary },
                isToday && { fontFamily: 'Pretendard-Bold', fontWeight: '700' },
              ]}>
                {num}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:     'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical:   6,
  },
  col: {
    alignItems: 'center',
    gap:        2,
  },
  dayText: {
    fontSize:   11,
    fontFamily: 'Pretendard-Medium',
    fontWeight: '500',
  },
  numWrap: {
    width:          28,
    height:         28,
    alignItems:     'center',
    justifyContent: 'center',
  },
  numText: {
    fontSize:   14,
    fontFamily: 'Pretendard-Regular',
    fontWeight: '400',
  },
});
