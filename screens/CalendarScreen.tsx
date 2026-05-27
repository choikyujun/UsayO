import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import DailyView from '../components/calendar/DailyView';
import MonthlyView from '../components/calendar/MonthlyView';
import WeeklyView from '../components/calendar/WeeklyView';
import YearlyView from '../components/calendar/YearlyView';
import {
  MONTHS_KO,
  addDays,
  getWeekStart,
  toDateStr,
} from '../components/calendar/calendarUtils';
import { AppTheme, useColors } from '../constants/colors';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { useCurrentDate } from '../hooks/useCurrentDate';

type ViewType = 'day' | 'week' | 'month' | 'year';

const TAB_LABELS: Record<ViewType, string> = {
  day: '일', week: '주', month: '월', year: '연',
};
const TAB_ORDER: ViewType[] = ['day', 'week', 'month', 'year'];
const SCREEN_W = Dimensions.get('window').width;

export default function CalendarScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const { today }  = useCurrentDate();
  const todayStr   = toDateStr(today);

  const [view, setView]           = useState<ViewType>('month');
  const [year, setYear]           = useState(() => new Date().getFullYear());
  const [month, setMonth]         = useState(() => new Date().getMonth());
  const [selectedDate, setSelectedDate] = useState(() => toDateStr(new Date()));
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));

  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const { startDate, endDate } = getDateRange(view, year, month, selectedDate, weekStart);
  const { events, loading } = useCalendarEvents(startDate, endDate);

  function switchView(newView: ViewType) {
    if (newView === view) return;
    Animated.timing(fadeAnim, { toValue: 0, duration: 80, useNativeDriver: true }).start(() => {
      setView(newView);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }

  function navigateWith(direction: 1 | -1, updater: () => void) {
    const toX = -direction * SCREEN_W * 0.3;
    Animated.timing(slideAnim, { toValue: toX, duration: 130, useNativeDriver: true }).start(() => {
      updater();
      slideAnim.setValue(-toX);
      Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    });
  }

  function prev() {
    navigateWith(-1, () => {
      if (view === 'month' || view === 'year') {
        if (view === 'year') { setYear(y => y - 1); return; }
        if (month === 0) { setYear(y => y - 1); setMonth(11); }
        else setMonth(m => m - 1);
      } else if (view === 'week') {
        setWeekStart(ws => addDays(ws, -7));
      } else {
        const d = new Date(selectedDate + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        setSelectedDate(toDateStr(d));
      }
    });
  }

  function next() {
    navigateWith(1, () => {
      if (view === 'year') { setYear(y => y + 1); return; }
      if (view === 'month') {
        if (month === 11) { setYear(y => y + 1); setMonth(0); }
        else setMonth(m => m + 1);
      } else if (view === 'week') {
        setWeekStart(ws => addDays(ws, 7));
      } else {
        const d = new Date(selectedDate + 'T00:00:00');
        d.setDate(d.getDate() + 1);
        setSelectedDate(toDateStr(d));
      }
    });
  }

  const headerTitle = buildHeader(view, year, month, selectedDate, weekStart);

  function handleMonthlySelectDate(date: string) {
    setSelectedDate(date);
  }

  function handleSwitchToDay(date: string) {
    setSelectedDate(date);
    switchView('day');
  }

  function handleYearSelectMonth(m: number) {
    setMonth(m);
    switchView('month');
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Pressable style={styles.arrow} onPress={prev}>
          <ChevronLeft size={22} color={colors.accent} />
        </Pressable>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <Pressable style={styles.arrow} onPress={next}>
          <ChevronRight size={22} color={colors.accent} />
        </Pressable>
      </View>

      <View style={styles.tabs}>
        {TAB_ORDER.map(v => {
          const active = v === view;
          return (
            <Pressable
              key={v}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => switchView(v)}
            >
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {TAB_LABELS[v]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Animated.View
        style={[
          styles.content,
          { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
        ]}
      >
        {loading && (
          <View style={styles.skeleton}>
            {[1, 2, 3, 4].map(i => (
              <View key={i} style={styles.skeletonRow} />
            ))}
          </View>
        )}

        {!loading && view === 'month' && (
          <MonthlyView
            year={year}
            month={month}
            events={events}
            selectedDate={selectedDate}
            onSelectDate={handleMonthlySelectDate}
            onSwitchToDay={handleSwitchToDay}
          />
        )}
        {!loading && view === 'week' && (
          <WeeklyView weekStart={weekStart} events={events} />
        )}
        {!loading && view === 'day' && (
          <DailyView date={selectedDate} events={events} />
        )}
        {!loading && view === 'year' && (
          <YearlyView year={year} events={events} onSelectMonth={handleYearSelectMonth} />
        )}
      </Animated.View>
    </View>
  );
}

// ── helpers ───────────────────────────────────────────────

function getDateRange(
  view: ViewType,
  year: number,
  month: number,
  selectedDate: string,
  weekStart: Date,
): { startDate: string; endDate: string } {
  if (view === 'month') {
    return {
      startDate: `${year}-${String(month + 1).padStart(2, '0')}-01`,
      endDate: toDateStr(new Date(year, month + 1, 0)),
    };
  }
  if (view === 'week') {
    return {
      startDate: toDateStr(weekStart),
      endDate: toDateStr(addDays(weekStart, 6)),
    };
  }
  if (view === 'day') {
    return { startDate: selectedDate, endDate: selectedDate };
  }
  return {
    startDate: `${year}-01-01`,
    endDate: `${year}-12-31`,
  };
}

function buildHeader(
  view: ViewType,
  year: number,
  month: number,
  selectedDate: string,
  weekStart: Date,
): string {
  if (view === 'year') return `${year}년`;
  if (view === 'month') return `${year}년 ${MONTHS_KO[month]}`;
  if (view === 'day') {
    const d = new Date(selectedDate + 'T00:00:00');
    return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  }
  const ws = weekStart;
  const we = addDays(weekStart, 6);
  if (ws.getMonth() === we.getMonth()) {
    return `${ws.getMonth() + 1}월 ${ws.getDate()}일 – ${we.getDate()}일`;
  }
  return `${ws.getMonth() + 1}/${ws.getDate()} – ${we.getMonth() + 1}/${we.getDate()}`;
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
      paddingVertical: 8,
      borderBottomWidth: 0.5,
      borderColor: c.border,
    },
    arrow: { padding: 10 },
    headerTitle: {
      fontSize: 17,
      fontFamily: 'Pretendard-Bold',
      fontWeight: '700',
      color: c.textPrimary,
      flex: 1,
      textAlign: 'center',
    },
    tabs: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 6,
      borderBottomWidth: 0.5,
      borderColor: c.border,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    tabActive: {
      backgroundColor: c.primary,
      borderColor: c.primary,
    },
    tabText: { fontSize: 14, color: c.textMuted, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
    tabTextActive: { color: '#fff' },
    content: { flex: 1, paddingHorizontal: 8, paddingTop: 8 },
    skeleton: { gap: 10, paddingHorizontal: 8, paddingTop: 12 },
    skeletonRow: {
      height: 48,
      backgroundColor: c.card,
      borderRadius: 8,
      opacity: 0.4,
    },
  });
}
