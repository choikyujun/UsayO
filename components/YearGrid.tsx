import { Dimensions, StyleSheet, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { getMonthCells } from '../utils/yearViewLayout';
import MiniMonth from './MiniMonth';

const { width: SCREEN_W } = Dimensions.get('window');

const H_PAD  = 12; // horizontal screen padding each side
const GAP    = 8;  // gap between columns
const COLS   = 3;

const CELL_W = Math.floor((SCREEN_W - H_PAD * 2 - GAP * (COLS - 1)) / COLS);

interface Props {
  year:       number;
  todayStr:   string;
  eventDates: Set<string>;
  colors:     AppTheme;
  onMonthPress: (year: number, month: number) => void;
}

export default function YearGrid({ year, todayStr, eventDates, colors, onMonthPress }: Props) {
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  const rows: number[][] = [];
  for (let r = 0; r < 4; r++) rows.push(months.slice(r * 3, r * 3 + 3));

  return (
    <View style={[styles.grid, { paddingHorizontal: H_PAD }]}>
      {rows.map((row, ri) => (
        <View key={ri} style={[styles.row, { gap: GAP }]}>
          {row.map(month => (
            <MiniMonth
              key={month}
              year={year}
              month={month}
              cells={getMonthCells(year, month)}
              eventDates={eventDates}
              todayStr={todayStr}
              colors={colors}
              cellW={CELL_W}
              onPress={onMonthPress}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flex: 1,
    gap:  GAP,
  },
  row: {
    flex:          1,
    flexDirection: 'row',
  },
});
