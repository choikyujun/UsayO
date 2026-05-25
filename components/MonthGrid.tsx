import { StyleSheet, View } from 'react-native';
import { AppTheme } from '../constants/colors';
import { Event } from '../types/database';
import { MonthCell as MonthCellType } from '../utils/monthViewLayout';
import MonthCell from './MonthCell';

interface Props {
  cells:            MonthCellType[];
  eventsByDate:     Record<string, Event[]>;
  colors:           AppTheme;
  onCellPress:      (dateStr: string) => void;
  onCellLongPress?: (dateStr: string) => void;
}

export default function MonthGrid({ cells, eventsByDate, colors, onCellPress, onCellLongPress }: Props) {
  const rows: MonthCellType[][] = [];
  for (let i = 0; i < 6; i++) rows.push(cells.slice(i * 7, i * 7 + 7));

  return (
    <View style={{ flex: 1 }}>
      {rows.map((row, rowIdx) => (
        <View
          key={rowIdx}
          style={[styles.row, { borderBottomColor: colors.border }]}
        >
          {row.map(cell => (
            <MonthCell
              key={cell.dateStr}
              dateStr={cell.dateStr}
              isOtherMonth={cell.isOtherMonth}
              eventCount={(eventsByDate[cell.dateStr] ?? []).length}
              colors={colors}
              onPress={onCellPress}
              onLongPress={onCellLongPress}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flex:              1,
    flexDirection:     'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
