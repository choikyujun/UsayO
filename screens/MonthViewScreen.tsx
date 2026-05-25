import * as Haptics from 'expo-haptics';
import { useCallback, useMemo, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import ReAnimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import AppHeader from '../components/AppHeader';
import DayEventsSheet from '../components/DayEventsSheet';
import MonthGrid from '../components/MonthGrid';
import { useColors } from '../constants/colors';
import { useMonthEvents } from '../hooks/useMonthEvents';
import { formatMonthLabel, getMonthGrid } from '../utils/monthViewLayout';

const { width: SCREEN_W } = Dimensions.get('window');

const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function MonthViewScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const today = new Date();
  const [year,  setYear]  = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  const cells        = useMemo(() => getMonthGrid(year, month), [year, month]);
  const { eventsByDate } = useMonthEvents(year, month);

  const isCurrentMonth = year === today.getFullYear() && month === (today.getMonth() + 1);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  function handleCellPress(dateStr: string) {
    setSelectedDate(dateStr);
  }

  // ── Month swipe ─────────────────────────────────────────────────────
  const translateX = useSharedValue(0);
  const opacity    = useSharedValue(1);

  const changeMonth = useCallback((direction: number) => {
    let ny = year;
    let nm = month + direction;
    if (nm < 1)  { nm = 12; ny -= 1; }
    if (nm > 12) { nm = 1;  ny += 1; }
    setYear(ny);
    setMonth(nm);
  }, [year, month]);

  const animateAndChange = useCallback((direction: number) => {
    opacity.value = withTiming(0, { duration: 120 }, () => {
      runOnJS(changeMonth)(direction);
      translateX.value = 0;
      opacity.value = withTiming(1, { duration: 120 });
    });
  }, [changeMonth]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-25, 25])
    .failOffsetY([-20, 20])
    .onUpdate(e => { translateX.value = e.translationX; })
    .onEnd(e => {
      const threshold = SCREEN_W * 0.3;
      if (e.translationX > threshold) {
        runOnJS(animateAndChange)(-1);
      } else if (e.translationX < -threshold) {
        runOnJS(animateAndChange)(1);
      } else {
        translateX.value = withSpring(0, { damping: 24, stiffness: 300 });
      }
    });

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity:   opacity.value,
  }));

  function goToToday() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setYear(today.getFullYear());
    setMonth(today.getMonth() + 1);
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <AppHeader currentTab="month" />

      {/* Month label + 오늘로 */}
      <View style={styles.subHeader}>
        <View style={{ flex: 1 }} />
        <Text style={[styles.monthLabel, { color: colors.textPrimary }]}>
          {formatMonthLabel(year, month)}
        </Text>
        <View style={styles.todayWrap}>
          {!isCurrentMonth && (
            <Pressable onPress={goToToday} hitSlop={12} style={styles.todayBtn}>
              <Text style={[styles.todayText, { color: colors.accent }]}>오늘로</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Day-of-week header */}
      <View style={[styles.dowRow, { borderBottomColor: colors.border }]}>
        {KO_DAYS.map((d, i) => (
          <Text
            key={d}
            style={[
              styles.dowLabel,
              { color: (i === 0 || i === 6) ? colors.error : colors.textSecondary },
            ]}
          >
            {d}
          </Text>
        ))}
      </View>

      {/* Grid */}
      <GestureDetector gesture={panGesture}>
        <ReAnimated.View style={[{ flex: 1 }, animStyle]}>
          <MonthGrid
            cells={cells}
            eventsByDate={eventsByDate}
            colors={colors}
            onCellPress={handleCellPress}
          />
        </ReAnimated.View>
      </GestureDetector>

      <DayEventsSheet
        dateStr={selectedDate}
        events={selectedDate ? (eventsByDate[selectedDate] ?? []) : []}
        onClose={() => setSelectedDate(null)}
      />
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root:       { flex: 1 },
    subHeader:  {
      flexDirection:     'row',
      alignItems:        'center',
      paddingHorizontal: 16,
      paddingVertical:   10,
    },
    monthLabel: { fontSize: 24, fontWeight: '600' },
    todayWrap:  { flex: 1, alignItems: 'flex-end' },
    todayBtn:   { paddingHorizontal: 8, paddingVertical: 4 },
    todayText:  { fontSize: 13, fontWeight: '600' },
    dowRow: {
      flexDirection:     'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingVertical:   6,
    },
    dowLabel: {
      flex:       1,
      textAlign:  'center',
      fontSize:   12,
      fontWeight: '500',
    },
  });
}
