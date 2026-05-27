import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../../constants/colors';
import { Event } from '../../types/database';
import { Spacing } from '../../constants/spacing';
import {
    CATEGORY_COLORS,
  DAYS_KO,
  EventLane,
  assignLanes,
  getFreeSlots,
  groupEventsByDate,
  toDateStr,
} from './calendarUtils';

const SCREEN_W      = Dimensions.get('window').width;
const TIME_COL_W    = 44;
const TIMELINE_W    = SCREEN_W - TIME_COL_W;
const COL_W         = TIMELINE_W / 7;
const HOUR_HEIGHT   = 56;
const TIMELINE_START = 9;
const TIMELINE_END   = 21;
const TOTAL_H        = (TIMELINE_END - TIMELINE_START) * HOUR_HEIGHT;
const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

interface Props {
  weekStart: Date;
  events: Event[];
}

function minutesToY(h: number, m: number): number {
  return Math.max(0, (h + m / 60 - TIMELINE_START)) * HOUR_HEIGHT;
}

function durationToH(startAt: string, endAt: string): number {
  return (new Date(endAt).getTime() - new Date(startAt).getTime()) / 3_600_000;
}

export default function WeeklyView({ weekStart, events }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [now, setNow] = useState<Date>(() => new Date());
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const y = minutesToY(now.getHours(), now.getMinutes()) - HOUR_HEIGHT * 2;
    setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y), animated: false }), 100);
  }, []);

  const todayStr = toDateStr(new Date());
  const byDate = groupEventsByDate(events);

  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  const nowY = minutesToY(now.getHours(), now.getMinutes());

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.scroll}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ minHeight: TOTAL_H + 32 }}
    >
      <View style={styles.headerRow}>
        <View style={{ width: TIME_COL_W }} />
        {days.map((d, i) => {
          const ds = toDateStr(d);
          const isToday = ds === todayStr;
          return (
            <View key={i} style={[styles.dayHeader, isToday && styles.dayHeaderToday]}>
              <Text style={[styles.dayName, isToday && styles.dayNameToday]}>
                {DAYS_KO[d.getDay()]}
              </Text>
              <View style={[styles.dayNumCircle, isToday && styles.dayNumToday]}>
                <Text style={[styles.dayNum, isToday && styles.dayNumTextToday]}>
                  {d.getDate()}
                </Text>
              </View>
            </View>
          );
        })}
      </View>

      <View style={styles.body}>
        <View style={styles.timeCol}>
          {Array.from({ length: TIMELINE_END - TIMELINE_START }, (_, i) => (
            <View key={i} style={{ height: HOUR_HEIGHT, justifyContent: 'flex-start' }}>
              <Text style={[styles.timeLabel, { fontFamily: MONO }]}>
                {formatHour(TIMELINE_START + i)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.daysContainer}>
          {Array.from({ length: TIMELINE_END - TIMELINE_START }, (_, i) => (
            <View key={i} style={[styles.gridLine, { top: i * HOUR_HEIGHT }]} />
          ))}

          {days.map((d, colIdx) => {
            const ds = toDateStr(d);
            const isToday = ds === todayStr;
            const dayEvts = byDate[ds] ?? [];
            const lanes   = assignLanes(dayEvts);
            const freeSlots = getFreeSlots(dayEvts, TIMELINE_START, TIMELINE_END);

            return (
              <View
                key={colIdx}
                style={[
                  styles.dayCol,
                  isToday && styles.dayColToday,
                  { width: COL_W },
                ]}
              >
                {freeSlots.map((slot, si) => {
                  const slotH = (slot.endH - slot.startH) * HOUR_HEIGHT;
                  const slotTop = (slot.startH - TIMELINE_START) * HOUR_HEIGHT;
                  const hrs = Math.round(slot.endH - slot.startH);
                  return (
                    <View
                      key={si}
                      style={[styles.freeSlot, { top: slotTop, height: slotH }]}
                    >
                      <Text style={styles.freeSlotText}>여유 {hrs}h</Text>
                    </View>
                  );
                })}

                {lanes.map(({ event, lane, laneCount }: EventLane) => {
                  const startD = new Date(event.start_at);
                  const top    = minutesToY(startD.getHours(), startD.getMinutes());
                  const dur    = Math.max(0.4, durationToH(event.start_at, event.end_at));
                  const height = Math.max(22, dur * HOUR_HEIGHT);
                  const colW   = laneCount > 1 ? (COL_W - 2) / laneCount : COL_W - 3;
                  const left   = lane * colW;
                  const bg     = CATEGORY_COLORS[event.category ?? 'work'];

                  return (
                    <View
                      key={event.id}
                      style={[
                        styles.eventBlock,
                        {
                          top,
                          height,
                          left,
                          width: colW,
                          backgroundColor: bg + '33',
                          borderLeftColor: bg,
                        },
                      ]}
                    >
                      <Text style={styles.eventTitle} numberOfLines={2}>{event.title}</Text>
                    </View>
                  );
                })}

                {isToday && nowY >= 0 && nowY <= TOTAL_H && (
                  <View style={[styles.nowLine, { top: nowY }]}>
                    <View style={styles.nowDot} />
                    <View style={styles.nowBar} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      </View>
    </ScrollView>
  );
}

function formatHour(h: number): string {
  if (h === 12) return '정오';
  return h < 12 ? `오전 ${h}` : `오후 ${h - 12}`;
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    scroll: { flex: 1 },
    headerRow: {
      flexDirection: 'row',
      paddingBottom: 6,
      borderBottomWidth: 0.5,
      borderColor: c.border,
    },
    dayHeader: {
      width: COL_W,
      alignItems: 'center',
      paddingVertical: Spacing.xs,
    },
    dayHeaderToday: {},
    dayName: { fontSize: 11, color: c.textMuted, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
    dayNameToday: { color: c.accent },
    dayNumCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    dayNumToday: { backgroundColor: c.primary },
    dayNum: { fontSize: 14, color: c.textMuted },
    dayNumTextToday: { color: '#fff', fontFamily: 'Pretendard-Bold', fontWeight: '700' },
    body: { flexDirection: 'row', flex: 1 },
    timeCol: { width: TIME_COL_W, alignItems: 'flex-end', paddingRight: 6 },
    timeLabel: { fontSize: 10, color: c.textMuted, marginTop: -6 },
    daysContainer: {
      flex: 1,
      flexDirection: 'row',
      height: TOTAL_H,
      position: 'relative',
    },
    gridLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 0.5,
      backgroundColor: c.border,
      zIndex: 0,
    },
    dayCol: {
      width: COL_W,
      height: TOTAL_H,
      borderLeftWidth: 0.5,
      borderColor: c.border,
      position: 'relative',
      overflow: 'hidden',
    },
    dayColToday: { backgroundColor: c.primary + '08' },
    freeSlot: {
      position: 'absolute',
      left: 2,
      right: 2,
      borderWidth: 1,
      borderColor: c.border,
      borderStyle: 'dashed',
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
      opacity: 0.6,
    },
    freeSlotText: { fontSize: 9, color: c.textMuted },
    eventBlock: {
      position: 'absolute',
      borderLeftWidth: 2.5,
      borderRadius: 3,
      paddingHorizontal: 3,
      paddingTop: 2,
      overflow: 'hidden',
    },
    eventTitle: { fontSize: 9, color: c.textPrimary, fontFamily: 'Pretendard-SemiBold', fontWeight: '600', lineHeight: 12 },
    nowLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      flexDirection: 'row',
      alignItems: 'center',
      zIndex: 10,
    },
    nowDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: c.error,
      marginLeft: -4,
    },
    nowBar: { flex: 1, height: 1.5, backgroundColor: c.error },
  });
}
