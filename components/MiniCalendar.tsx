import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { isKoreanHoliday } from '../hooks/useHolidays';
import {
  addMonths, addWeeks, getMonthWeeks, getWeekDays,
  isSameDay, isSameMonth, toYearMonth,
} from '../utils/dateHelpers';
import { localDateStr, todayDateStr } from '../utils/timeHelpers';
import CalendarDayCell from './CalendarDayCell';
import { Spacing } from '../constants/spacing';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
const SAT_COLOR = '#2563EB';

const HEADER_H   = 32;
const LABELS_H   = 18;
const WEEK_ROW_H = 40; // collapsed
const MONTH_ROW_H = 34; // expanded (× 6)

const COLLAPSED_H = HEADER_H + LABELS_H + WEEK_ROW_H;         // 90
const EXPANDED_H  = HEADER_H + LABELS_H + MONTH_ROW_H * 6;    // 254
const ANIM_MS = 240;

interface Props {
  selectedDate:  string;
  onSelectDate:  (date: string) => void;
  onMonthChange: (yearMonth: string) => void;
  monthCounts:   Record<string, number>;
  paddingTop:    number;
}

export default function MiniCalendar({
  selectedDate, onSelectDate, onMonthChange, monthCounts, paddingTop,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const today = useMemo(() => new Date(), []);

  const [isExpanded, setIsExpanded] = useState(false);
  const isExpandedRef = useRef(false);

  const [anchorDate, setAnchorDate] = useState(
    () => new Date(selectedDate + 'T00:00:00'),
  );

  // Animated height (includes safe-area paddingTop)
  const heightAnim = useRef(new Animated.Value(paddingTop + COLLAPSED_H)).current;

  const animateTo = useCallback((expand: boolean) => {
    Animated.timing(heightAnim, {
      toValue: paddingTop + (expand ? EXPANDED_H : COLLAPSED_H),
      duration: ANIM_MS,
      useNativeDriver: false,
    }).start();
  }, [heightAnim, paddingTop]);

  const expand = useCallback(() => {
    isExpandedRef.current = true;
    setIsExpanded(true);
    animateTo(true);
  }, [animateTo]);

  const collapse = useCallback(() => {
    isExpandedRef.current = false;
    setIsExpanded(false);
    animateTo(false);
  }, [animateTo]);

  // Notify parent when visible month changes
  useEffect(() => {
    onMonthChange(toYearMonth(anchorDate));
  }, [anchorDate, onMonthChange]);

  // Sync anchor when selected date changes externally
  useEffect(() => {
    setAnchorDate(new Date(selectedDate + 'T00:00:00'));
  }, [selectedDate]);

  // ── Navigation ────────────────────────────────────────────────────────
  const goBack = useCallback(() => {
    setAnchorDate(prev => isExpandedRef.current ? addMonths(prev, -1) : addWeeks(prev, -1));
  }, []);

  const goForward = useCallback(() => {
    setAnchorDate(prev => isExpandedRef.current ? addMonths(prev, 1) : addWeeks(prev, 1));
  }, []);

  const jumpToToday = useCallback(() => {
    const now = new Date();
    setAnchorDate(now);
    onSelectDate(todayDateStr());
    collapse();
  }, [onSelectDate, collapse]);

  // ── Date selection ────────────────────────────────────────────────────
  const handleDayPress = useCallback((date: Date) => {
    const str = localDateStr(date);
    onSelectDate(str);
    setAnchorDate(date);
    if (isExpandedRef.current) collapse();
  }, [onSelectDate, collapse]);

  // ── Calendar data ─────────────────────────────────────────────────────
  const weekDays = useMemo(() => getWeekDays(anchorDate), [anchorDate]);
  const monthWeeks = useMemo(
    () => getMonthWeeks(anchorDate.getFullYear(), anchorDate.getMonth()),
    [anchorDate],
  );

  const monthLabel = `${anchorDate.getFullYear()}년 ${anchorDate.getMonth() + 1}월`;

  // ── Cell renderer ─────────────────────────────────────────────────────
  function renderCell(date: Date) {
    const str = localDateStr(date);
    const dow = date.getDay();
    return (
      <CalendarDayCell
        key={str}
        dayNum={date.getDate()}
        isToday={isSameDay(date, today)}
        isSelected={str === selectedDate}
        isCurrentMonth={isSameMonth(date, anchorDate)}
        isHoliday={isKoreanHoliday(date)}
        isSunday={dow === 0}
        isSaturday={dow === 6}
        eventCount={monthCounts[str] ?? 0}
        onPress={() => handleDayPress(date)}
        colors={colors}
      />
    );
  }

  return (
    <Animated.View style={[styles.container, { height: heightAnim }]}>
      {/* ── Safe-area padding ─────────────────────────────────────── */}
      <View style={{ paddingTop }}>

        {/* ── Month / year header ──────────────────────────────────── */}
        <View style={styles.header}>
          <Pressable onPress={goBack} hitSlop={12} style={styles.arrowBtn}>
            <Text style={styles.arrow}>‹</Text>
          </Pressable>

          <Pressable onPress={jumpToToday} style={styles.monthBtn}>
            <Text style={styles.monthLabel}>{monthLabel}</Text>
          </Pressable>

          <Pressable onPress={goForward} hitSlop={12} style={styles.arrowBtn}>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        </View>

        {/* ── Day-of-week labels ────────────────────────────────────── */}
        <View style={styles.dayLabels}>
          {DAY_LABELS.map((label, i) => (
            <Text
              key={label}
              style={[
                styles.dayLabel,
                i === 0 && { color: colors.error },
                i === 6 && { color: SAT_COLOR },
              ]}
            >
              {label}
            </Text>
          ))}
        </View>

        {/* ── Week strip — collapsed ────────────────────────────────── */}
        {!isExpanded && (
          <Pressable style={[styles.weekRow, { height: WEEK_ROW_H }]} onPress={expand}>
            {weekDays.map(renderCell)}
          </Pressable>
        )}

        {/* ── Month grid — expanded ─────────────────────────────────── */}
        {isExpanded && (
          <View>
            {monthWeeks.map((week, wi) => (
              <View key={wi} style={[styles.weekRow, { height: MONTH_ROW_H }]}>
                {week.map(renderCell)}
              </View>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    container: {
      overflow: 'hidden',
      backgroundColor: c.bg,
    },
    header: {
      height: HEADER_H,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.sm,
    },
    arrowBtn: {
      paddingHorizontal: Spacing.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    arrow: {
      fontSize: 22,
      color: c.textSecondary,
      lineHeight: 26,
    },
    monthBtn: {
      flex: 1,
      alignItems: 'center',
    },
    monthLabel: {
      fontSize: 15,
      fontFamily: 'Pretendard-Bold',
      fontWeight: '700',
      color: c.textPrimary,
      letterSpacing: 0.2,
    },
    dayLabels: {
      height: LABELS_H,
      flexDirection: 'row',
      paddingHorizontal: Spacing.xs,
    },
    dayLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 11,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: c.textMuted,
      lineHeight: LABELS_H,
    },
    weekRow: {
      flexDirection: 'row',
      paddingHorizontal: Spacing.xs,
    },
  });
}
