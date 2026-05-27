import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { isKoreanHoliday } from '../hooks/useHolidays';
import { YearCell } from '../utils/yearViewLayout';

const KO_DAYS_SHORT = ['일', '월', '화', '수', '목', '금', '토'];

interface Props {
  year:       number;
  month:      number;
  cells:      YearCell[];
  eventDates: Set<string>;
  todayStr:   string;
  colors:     AppTheme;
  cellW:      number; // computed width of this mini-month
  onPress:    (year: number, month: number) => void;
}

export default function MiniMonth({
  year, month, cells, eventDates, todayStr, colors, cellW, onPress,
}: Props) {
  // Show only rows that have at least one cell belonging to this month
  const rows: YearCell[][] = [];
  for (let r = 0; r < 6; r++) rows.push(cells.slice(r * 7, r * 7 + 7));
  const visibleRows = rows.filter(row => row.some(c => !c.isOtherMonth));

  const dayCellW = (cellW - 8) / 7; // 8px = horizontal inner padding (4px each side)

  return (
    <Pressable
      style={[styles.container, { width: cellW, borderColor: colors.border }]}
      onPress={() => onPress(year, month)}
    >
      {/* Month name */}
      <Text style={[styles.monthName, { color: colors.textPrimary }]}>
        {month}월
      </Text>

      {/* Day-of-week header */}
      <View style={styles.dowRow}>
        {KO_DAYS_SHORT.map((d, i) => (
          <Text
            key={d}
            style={[
              styles.dowLabel,
              { width: dayCellW, color: (i === 0 || i === 6) ? colors.error : colors.textTertiary },
            ]}
          >
            {d}
          </Text>
        ))}
      </View>

      {/* Weeks */}
      {visibleRows.map((row, ri) => (
        <View key={ri} style={styles.weekRow}>
          {row.map(cell => {
            const isToday   = cell.dateStr === todayStr;
            const d         = new Date(cell.dateStr + 'T00:00:00');
            const isHoliday = !cell.isOtherMonth && isKoreanHoliday(d);
            const hasEvent  = eventDates.has(cell.dateStr);

            let numColor: string;
            if (isToday) {
              numColor = '#FFFFFF';
            } else if (cell.isOtherMonth) {
              numColor = colors.textTertiary;
            } else if (isHoliday || cell.dayOfWeek === 0 || cell.dayOfWeek === 6) {
              numColor = colors.error;
            } else {
              numColor = colors.textPrimary;
            }

            return (
              <View key={cell.dateStr} style={[styles.dayCell, { width: dayCellW }]}>
                <View style={[
                  styles.numWrap,
                  isToday && { backgroundColor: colors.primary },
                ]}>
                  <Text style={[styles.dayNum, { color: numColor }]}>
                    {cell.day}
                  </Text>
                </View>
                {hasEvent && !cell.isOtherMonth && (
                  <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                )}
              </View>
            );
          })}
        </View>
      ))}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 4,
    paddingVertical:   6,
    borderWidth:       0.5,
    borderRadius:      8,
  },
  monthName: {
    fontSize:      11,
    fontFamily: 'Pretendard-Medium',
    fontWeight:    '500',
    textAlign:     'center',
    marginBottom:  4,
  },
  dowRow: {
    flexDirection: 'row',
    marginBottom:  2,
  },
  dowLabel: {
    fontSize:   5,
    textAlign:  'center',
    fontFamily: 'Pretendard-Regular',
    fontWeight: '400',
  },
  weekRow: {
    flexDirection: 'row',
  },
  dayCell: {
    alignItems:    'center',
    paddingVertical: 0.5,
  },
  numWrap: {
    width:          11,
    height:         11,
    borderRadius:   5.5,
    alignItems:     'center',
    justifyContent: 'center',
  },
  dayNum: {
    fontSize:   6.5,
    fontFamily: 'Pretendard-Regular',
    fontWeight: '400',
    lineHeight: 8,
  },
  dot: {
    width:        3,
    height:       3,
    borderRadius: 1.5,
    marginTop:    0.5,
  },
});
