import { Calendar, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppTheme, useColors } from '../../constants/colors';
import { Event } from '../../types/database';
import {
  CATEGORY_COLORS,
  DAYS_KO,
  MONTHS_KO,
  buildCells,
  formatTime12,
  groupEventsByDate,
  toDateStr,
} from './calendarUtils';

interface Props {
  year: number;
  month: number;
  events: Event[];
  selectedDate: string;
  onSelectDate: (date: string) => void;
  onSwitchToDay?: (date: string) => void;
}

export default function MonthlyView({
  year, month, events, selectedDate, onSelectDate, onSwitchToDay,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const today = toDateStr(new Date());
  const cells = buildCells(year, month);
  const byDate = groupEventsByDate(events);

  const slideAnim = useRef(new Animated.Value(320)).current;
  const backdropAnim = useRef(new Animated.Value(0)).current;
  const sheetVisible = !!selectedDate;

  useEffect(() => {
    if (sheetVisible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }),
        Animated.timing(backdropAnim, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: 320, duration: 200, useNativeDriver: true }),
        Animated.timing(backdropAnim, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [sheetVisible, selectedDate]);

  const dayEvents = byDate[selectedDate] ?? [];

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        {DAYS_KO.map((d, i) => (
          <Text
            key={d}
            style={[styles.dayLabel, i === 0 && styles.sun, i === 6 && styles.sat]}
          >
            {d}
          </Text>
        ))}
      </View>

      {cells.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((cell, di) => {
            if (!cell) return <View key={di} style={styles.cell} />;

            const ds = toDateStr(cell);
            const isToday    = ds === today;
            const isSel      = ds === selectedDate;
            const dayEvts    = byDate[ds] ?? [];
            const dots       = dayEvts.slice(0, 3);
            const hasMore    = dayEvts.length > 3;

            return (
              <Pressable key={di} style={styles.cell} onPress={() => onSelectDate(ds)}>
                <View style={[
                  styles.dateCircle,
                  isToday && !isSel && styles.todayCircle,
                  isSel && styles.selCircle,
                ]}>
                  <Text style={[
                    styles.dateText,
                    di === 0 && styles.sun,
                    di === 6 && styles.sat,
                    isToday && !isSel && styles.todayText,
                    isSel && styles.selText,
                  ]}>
                    {cell.getDate()}
                  </Text>
                </View>
                <View style={styles.dotRow}>
                  {dots.map((e, ei) => (
                    <View
                      key={ei}
                      style={[styles.dot, { backgroundColor: CATEGORY_COLORS[e.category ?? 'work'] }]}
                    />
                  ))}
                  {hasMore && <Text style={styles.dotMore}>…</Text>}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}

      {sheetVisible && (
        <Modal visible transparent animationType="none" onRequestClose={() => onSelectDate('')}>
          <Animated.View style={[styles.backdrop, { opacity: backdropAnim }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => onSelectDate('')} />
          </Animated.View>

          <Animated.View
            style={[styles.sheet, { transform: [{ translateY: slideAnim }] }]}
          >
            <View style={styles.handle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>{formatSheetTitle(selectedDate)}</Text>
              {onSwitchToDay && (
                <Pressable style={styles.sheetSwitchBtn} onPress={() => onSwitchToDay(selectedDate)}>
                  <Text style={[styles.sheetSwitch, { color: colors.primary }]}>일간 보기</Text>
                  <ChevronRight size={14} color={colors.primary} />
                </Pressable>
              )}
            </View>

            <ScrollView style={styles.sheetScroll} showsVerticalScrollIndicator={false}>
              {dayEvents.length === 0 ? (
                <View style={styles.emptyDay}>
                  <Calendar size={32} color={colors.textMuted} />
                  <Text style={styles.emptyText}>일정 없는 날</Text>
                  <Text style={styles.emptyHint}>음성으로 일정을 등록해보세요</Text>
                </View>
              ) : (
                dayEvents.map(e => (
                  <View key={e.id} style={styles.eventRow}>
                    <View
                      style={[styles.eventBar, { backgroundColor: CATEGORY_COLORS[e.category ?? 'work'] }]}
                    />
                    <View style={styles.eventBody}>
                      <Text style={styles.eventTime}>{formatTime12(new Date(e.start_at))}</Text>
                      <Text style={styles.eventTitle} numberOfLines={1}>{e.title}</Text>
                      {e.location ? (
                        <Text style={styles.eventLoc} numberOfLines={1}>{e.location}</Text>
                      ) : null}
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          </Animated.View>
        </Modal>
      )}
    </View>
  );
}

function formatSheetTitle(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${DAYS_KO[d.getDay()]})`;
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    headerRow: {
      flexDirection: 'row',
      paddingHorizontal: 4,
      paddingBottom: 6,
    },
    dayLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: c.textMuted,
    },
    weekRow: { flexDirection: 'row' },
    cell: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 2,
      minHeight: 52,
    },
    dateCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    todayCircle: {
      borderWidth: 1.5,
      borderColor: c.primary,
    },
    selCircle: {
      backgroundColor: c.primary,
    },
    dateText: {
      fontSize: 14,
      color: c.textPrimary,
      fontFamily: 'Pretendard-Regular',
      fontWeight: '400',
    },
    todayText: { color: c.accent, fontFamily: 'Pretendard-Bold', fontWeight: '700' },
    selText:   { color: '#fff', fontFamily: 'Pretendard-Bold', fontWeight: '700' },
    sun: { color: '#E05252' },
    sat: { color: '#5279E0' },
    dotRow: { flexDirection: 'row', gap: 2, marginTop: 2, height: 6, alignItems: 'center' },
    dot: { width: 5, height: 5, borderRadius: 2.5 },
    dotMore: { fontSize: 8, color: c.textMuted, lineHeight: 10 },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      backgroundColor: c.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: 20,
      paddingBottom: 40,
      paddingTop: 12,
      maxHeight: '55%',
    },
    handle: {
      width: 36,
      height: 4,
      backgroundColor: c.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 16,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    sheetTitle: {
      fontSize: 17,
      fontFamily: 'Pretendard-Bold',
      fontWeight: '700',
      color: c.textPrimary,
    },
    sheetSwitchBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    sheetSwitch: { fontSize: 13 },
    sheetScroll: { flex: 1 },
    emptyDay: { alignItems: 'center', paddingVertical: 32, gap: 8 },
    emptyText: { fontSize: 16, fontFamily: 'Pretendard-SemiBold', fontWeight: '600', color: c.textMuted },
    emptyHint: { fontSize: 13, color: c.accent },
    eventRow: {
      flexDirection: 'row',
      marginBottom: 10,
      backgroundColor: c.bg,
      borderRadius: 10,
      overflow: 'hidden',
    },
    eventBar: { width: 3 },
    eventBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
    eventTime: { fontSize: 11, color: c.textMuted, marginBottom: 2 },
    eventTitle: { fontSize: 15, fontFamily: 'Pretendard-SemiBold', fontWeight: '600', color: c.textPrimary },
    eventLoc: { fontSize: 12, color: c.textMuted, marginTop: 2 },
  });
}
