import { Calendar } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../../constants/colors';
import { Event } from '../../types/database';
import { Spacing } from '../../constants/spacing';
import {
    CATEGORY_COLORS,
  DAYS_KO,
  EventLane,
  assignLanes,
  formatTime12,
  toDateStr,
} from './calendarUtils';

const HOUR_HEIGHT = 52;
const TOTAL_HOURS = 24;
const TIME_COL_W  = 50;
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

interface Props {
  date: string;
  events: Event[];
}

export default function DailyView({ date, events }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [now, setNow] = useState<Date>(() => new Date());
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const y = now.getHours() * HOUR_HEIGHT - HOUR_HEIGHT * 2;
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: false }), 100);
  }, [date]);

  const todayStr = toDateStr(new Date());
  const isToday  = date === todayStr;
  const d = new Date(date + 'T00:00:00');

  const totalEvents  = events.length;
  const totalMinutes = events.reduce((acc, e) => {
    return acc + (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 60_000;
  }, 0);
  const busyHours    = Math.round(totalMinutes / 60);
  const freeHours    = Math.max(0, 16 - busyHours);
  const density      = totalEvents >= 6 ? '바쁨' : totalEvents >= 3 ? '보통' : '여유';

  const lanes = assignLanes(events);
  const nowY  = now.getHours() * HOUR_HEIGHT + (now.getMinutes() / 60) * HOUR_HEIGHT;
  const isEmpty = events.length === 0;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.headerDate}>
          {d.getMonth() + 1}월 {d.getDate()}일 ({DAYS_KO[d.getDay()]})
          {isToday ? '  오늘' : ''}
        </Text>
        <View style={styles.chips}>
          <Chip label={`${totalEvents}개 일정`} color={colors.textMuted} />
          <Chip label={`${freeHours}h 여유`} color={colors.success} />
          <Chip label={density} color={density === '바쁨' ? colors.warning : colors.accent} />
        </View>
      </View>

      {isEmpty && (
        <View style={styles.emptyState}>
          <Calendar size={36} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>일정 없는 날</Text>
          <Text style={styles.emptyHint}>음성으로 일정을 등록해보세요</Text>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        style={[styles.scroll, isEmpty && styles.scrollHidden]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ height: TOTAL_HOURS * HOUR_HEIGHT + 20 }}
      >
        {Array.from({ length: TOTAL_HOURS }, (_, h) => (
          <View key={h} style={[styles.hourRow, { top: h * HOUR_HEIGHT }]}>
            <Text style={[styles.hourLabel, { fontFamily: MONO }]}>{formatHour(h)}</Text>
            <View style={styles.hourLine} />
          </View>
        ))}

        {getFreeSlotBlocks(events).map((slot, i) => (
          <View
            key={i}
            style={[
              styles.freeBlock,
              {
                top: slot.startH * HOUR_HEIGHT + TIME_COL_W - 8,
                height: Math.max(24, (slot.endH - slot.startH) * HOUR_HEIGHT),
                left: TIME_COL_W + 4,
              },
            ]}
          >
            <Text style={styles.freeText}>여유 {Math.round((slot.endH - slot.startH) * 60)}분</Text>
          </View>
        ))}

        {lanes.map(({ event, lane, laneCount }: EventLane) => {
          const startD  = new Date(event.start_at);
          const top     = startD.getHours() * HOUR_HEIGHT + (startD.getMinutes() / 60) * HOUR_HEIGHT;
          const dur     = (new Date(event.end_at).getTime() - new Date(event.start_at).getTime()) / 3_600_000;
          const height  = Math.max(36, dur * HOUR_HEIGHT);
          const bg      = CATEGORY_COLORS[event.category ?? 'work'];

          return (
            <View
              key={event.id}
              style={[
                styles.eventBlock,
                {
                  top,
                  left: TIME_COL_W + 4 + (laneCount > 1 ? lane * 100 : 0),
                  right: laneCount > 1 ? (laneCount - lane - 1) * 100 : 4,
                  height,
                  backgroundColor: bg + '22',
                  borderLeftColor: bg,
                },
              ]}
            >
              <Text style={styles.eventTime} numberOfLines={1}>
                {formatTime12(startD)}
              </Text>
              <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
              {event.location ? (
                <Text style={styles.eventLoc} numberOfLines={1}>{event.location}</Text>
              ) : null}
            </View>
          );
        })}

        {isToday && (
          <View style={[styles.nowLine, { top: nowY }]}>
            <View style={styles.nowDot} />
            <View style={styles.nowBar} />
            <Text style={[styles.nowTime, { fontFamily: MONO }]}>
              {now.getHours().toString().padStart(2, '0')}:{now.getMinutes().toString().padStart(2, '0')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[chipStyles.chip, { borderColor: color + '60' }]}>
      <Text style={[chipStyles.text, { color }]}>{label}</Text>
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
  },
  text: { fontSize: 11, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
});

function formatHour(h: number): string {
  if (h === 0)  return '자정';
  if (h === 12) return '정오';
  return h < 12 ? `${h}AM` : `${h - 12}PM`;
}

function getFreeSlotBlocks(events: Event[]): Array<{ startH: number; endH: number }> {
  const MIN_FREE = 0.5;
  const sorted = [...events].sort((a, b) =>
    new Date(a.start_at).getTime() - new Date(b.start_at).getTime()
  );
  const slots: Array<{ startH: number; endH: number }> = [];
  let cursor = 8;

  for (const e of sorted) {
    const sh = new Date(e.start_at).getHours() + new Date(e.start_at).getMinutes() / 60;
    const eh = new Date(e.end_at).getHours() + new Date(e.end_at).getMinutes() / 60;
    if (sh - cursor >= MIN_FREE) slots.push({ startH: cursor, endH: sh });
    cursor = Math.max(cursor, eh);
  }
  return slots;
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    header: {
      paddingHorizontal: Spacing.base,
      paddingBottom: Spacing.md,
      borderBottomWidth: 0.5,
      borderColor: c.border,
    },
    headerDate: {
      fontSize: 17,
      fontFamily: 'Pretendard-Bold',
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: Spacing.sm,
    },
    chips: { flexDirection: 'row', gap: 6 },
    scroll: { flex: 1 },
    hourRow: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      height: HOUR_HEIGHT,
    },
    hourLabel: {
      width: TIME_COL_W,
      textAlign: 'right',
      paddingRight: Spacing.sm,
      fontSize: 10,
      color: c.textMuted,
    },
    hourLine: {
      flex: 1,
      height: 0.5,
      backgroundColor: c.border,
    },
    freeBlock: {
      position: 'absolute',
      right: 4,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.border,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0.5,
    },
    freeText: { fontSize: 10, color: c.textMuted },
    eventBlock: {
      position: 'absolute',
      borderLeftWidth: 2.5,
      borderRadius: 6,
      paddingHorizontal: Spacing.sm,
      paddingVertical: Spacing.xs,
      overflow: 'hidden',
    },
    eventTime: { fontSize: 10, color: c.textMuted, marginBottom: 1 },
    eventTitle: { fontSize: 13, fontFamily: 'Pretendard-SemiBold', fontWeight: '600', color: c.textPrimary },
    eventLoc: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    nowLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 20,
      paddingLeft: TIME_COL_W - 4,
    },
    nowDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.error,
    },
    nowBar: { flex: 1, height: 1.5, backgroundColor: c.error },
    nowTime: { fontSize: 9, color: c.error, marginLeft: 4 },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingBottom: 60,
      gap: Spacing.sm,
    },
    emptyTitle: { fontSize: 16, fontFamily: 'Pretendard-SemiBold', fontWeight: '600', color: c.textMuted },
    emptyHint:  { fontSize: 13, color: c.accent },
    scrollHidden: { display: 'none' },
  });
}
