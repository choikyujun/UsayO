import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../../constants/colors';
import { Event } from '../../types/database';
import { Spacing } from '../../constants/spacing';
import {
    DAYS_KO,
  HEATMAP_COLORS,
  MONTHS_KO,
  buildCells,
  groupEventsByDate,
  toDateStr,
} from './calendarUtils';

interface Props {
  year: number;
  events: Event[];
  onSelectMonth?: (month: number) => void;
}

export default function YearlyView({ year, events, onSelectMonth }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const today = toDateStr(new Date());
  const byDate = groupEventsByDate(events);

  const countByDate: Record<string, number> = {};
  for (const [d, evts] of Object.entries(byDate)) {
    countByDate[d] = evts.length;
  }

  const monthTotals: number[] = Array(12).fill(0);
  for (const [dateStr, count] of Object.entries(countByDate)) {
    const m = parseInt(dateStr.split('-')[1]) - 1;
    if (!isNaN(m) && m >= 0 && m < 12) monthTotals[m] += count;
  }
  const maxMonthTotal = Math.max(...monthTotals);
  const busiestMonth  = maxMonthTotal > 0 ? monthTotals.indexOf(maxMonthTotal) : -1;

  function heatColor(dateStr: string): string {
    const n = countByDate[dateStr] ?? 0;
    return HEATMAP_COLORS[Math.min(4, n)];
  }

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.grid}
      showsVerticalScrollIndicator={false}
    >
      {[0, 1, 2, 3].map(row => (
        <View key={row} style={styles.gridRow}>
          {[0, 1, 2].map(col => {
            const m = row * 3 + col;
            const isCurrent = m === new Date().getMonth() && year === new Date().getFullYear();
            const isBusiest = m === busiestMonth;
            const cells = buildCells(year, m);

            return (
              <Pressable
                key={m}
                style={[styles.monthCard, isCurrent && styles.monthCardCurrent]}
                onPress={() => onSelectMonth?.(m)}
              >
                <View style={styles.monthHeader}>
                  <Text style={[styles.monthName, isCurrent && styles.monthNameCurrent]}>
                    {MONTHS_KO[m]}
                  </Text>
                  {isBusiest && <Text style={styles.fireBadge}>🔥 {monthTotals[m]}개</Text>}
                </View>

                <View style={styles.miniDowRow}>
                  {DAYS_KO.map(d => (
                    <Text key={d} style={styles.miniDow}>{d}</Text>
                  ))}
                </View>

                {cells.map((week, wi) => (
                  <View key={wi} style={styles.miniWeekRow}>
                    {week.map((cell, di) => {
                      if (!cell) return <View key={di} style={styles.miniCell} />;
                      const ds = toDateStr(cell);
                      const isToday = ds === today;
                      const bg = isToday ? colors.primary : heatColor(ds);

                      return (
                        <View
                          key={di}
                          style={[
                            styles.miniCell,
                            styles.miniDot,
                            { backgroundColor: bg },
                            isToday && styles.miniDotToday,
                          ]}
                        />
                      );
                    })}
                  </View>
                ))}
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={styles.legend}>
        <Text style={styles.legendLabel}>적음</Text>
        {HEATMAP_COLORS.map((hc, i) => (
          <View key={i} style={[styles.legendDot, { backgroundColor: hc }]} />
        ))}
        <Text style={styles.legendLabel}>많음</Text>
      </View>
    </ScrollView>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    grid: {
      paddingHorizontal: Spacing.sm,
      paddingTop: Spacing.xs,
      paddingBottom: Spacing.lg,
      gap: Spacing.sm,
    },
    gridRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
    },
    monthCard: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 10,
      padding: Spacing.sm,
      borderWidth: 0.5,
      borderColor: c.border,
    },
    monthCardCurrent: {
      borderColor: c.primary,
      borderWidth: 1,
      backgroundColor: c.primary + '10',
    },
    monthHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: Spacing.xs,
    },
    monthName: {
      fontSize: 11,
      fontFamily: 'Pretendard-Bold',
      fontWeight: '700',
      color: c.textMuted,
    },
    monthNameCurrent: { color: c.accent },
    fireBadge: { fontSize: 9, color: c.warning },
    miniDowRow: { flexDirection: 'row', marginBottom: 2 },
    miniDow: {
      flex: 1,
      textAlign: 'center',
      fontSize: 6,
      color: c.textMuted,
      opacity: 0.6,
    },
    miniWeekRow: { flexDirection: 'row', marginBottom: 1 },
    miniCell: { flex: 1, aspectRatio: 1 },
    miniDot: {
      borderRadius: 1.5,
      margin: 0.5,
    },
    miniDotToday: {
      borderRadius: 4,
    },
    legend: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      marginTop: Spacing.sm,
    },
    legendLabel: { fontSize: 10, color: c.textMuted },
    legendDot: {
      width: 12,
      height: 12,
      borderRadius: 2,
      borderWidth: 0.5,
      borderColor: c.border,
    },
  });
}
