import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/colors';

type Props = {
  year: number;
  month: number; // 0-indexed
  markedDates?: string[]; // 'YYYY-MM-DD'
  selectedDate: string;   // 'YYYY-MM-DD'
  onSelectDate: (date: string) => void;
  onPrevMonth: () => void;
  onNextMonth: () => void;
};

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

export default function MonthCalendar({
  year, month, markedDates = [], selectedDate,
  onSelectDate, onPrevMonth, onNextMonth,
}: Props) {
  const today = toDateStr(new Date());
  const cells = buildCells(year, month);

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Pressable onPress={onPrevMonth} style={styles.arrow}>
          <ChevronLeft size={22} color={Colors.primary} />
        </Pressable>
        <Text style={styles.title}>{year}년 {MONTHS[month]}</Text>
        <Pressable onPress={onNextMonth} style={styles.arrow}>
          <ChevronRight size={22} color={Colors.primary} />
        </Pressable>
      </View>

      {/* 요일 헤더 */}
      <View style={styles.row}>
        {DAYS.map((d, i) => (
          <Text
            key={d}
            style={[styles.dayLabel, i === 0 && styles.sun, i === 6 && styles.sat]}
          >
            {d}
          </Text>
        ))}
      </View>

      {/* 날짜 그리드 */}
      {cells.map((week, wi) => (
        <View key={wi} style={styles.row}>
          {week.map((cell, di) => {
            if (!cell) return <View key={di} style={styles.cell} />;

            const dateStr = toDateStr(cell);
            const isToday = dateStr === today;
            const isSelected = dateStr === selectedDate;
            const hasEvent = markedDates.includes(dateStr);
            const isSun = di === 0;
            const isSat = di === 6;

            return (
              <Pressable
                key={di}
                style={styles.cell}
                onPress={() => onSelectDate(dateStr)}
              >
                <View style={[
                  styles.dateCircle,
                  isSelected && styles.selectedCircle,
                  isToday && !isSelected && styles.todayCircle,
                ]}>
                  <Text style={[
                    styles.dateText,
                    isSun && styles.sun,
                    isSat && styles.sat,
                    isSelected && styles.selectedText,
                    isToday && !isSelected && styles.todayText,
                  ]}>
                    {cell.getDate()}
                  </Text>
                </View>
                {hasEvent && !isSelected && (
                  <View style={styles.dot} />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildCells(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const cells: (Date | null)[][] = [];
  let week: (Date | null)[] = Array(first.getDay()).fill(null);

  for (let d = 1; d <= last.getDate(); d++) {
    week.push(new Date(year, month, d));
    if (week.length === 7) { cells.push(week); week = []; }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    cells.push(week);
  }
  return cells;
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    marginHorizontal: 16,
    shadowColor: Colors.deep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  arrow: { padding: 8 },
  title: { fontSize: 17, fontWeight: '700', color: Colors.text },
  row: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  dayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textMuted,
    paddingVertical: 4,
  },
  cell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  dateCircle: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedCircle: {
    backgroundColor: Colors.primary,
  },
  todayCircle: {
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  dateText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '400',
  },
  selectedText: {
    color: '#fff',
    fontWeight: '700',
  },
  todayText: {
    color: Colors.primary,
    fontWeight: '700',
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.primary,
    marginTop: 2,
  },
  sun: { color: '#E53935' },
  sat: { color: '#1565C0' },
});
