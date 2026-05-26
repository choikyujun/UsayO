import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import ReAnimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import AppHeader from '../components/AppHeader';
import YearGrid from '../components/YearGrid';
import { useColors } from '../constants/colors';
import { useCurrentDate } from '../hooks/useCurrentDate';
import { useYearEvents } from '../hooks/useYearEvents';
import { formatYearLabel } from '../utils/yearViewLayout';
import { useState } from 'react';

const { width: SCREEN_W } = Dimensions.get('window');

export default function YearViewScreen() {
  const colors   = useColors();
  const styles   = useMemo(() => makeStyles(colors), [colors]);
  const { today, todayStr } = useCurrentDate();

  const [year, setYear] = useState(() => new Date().getFullYear());
  const { eventDates }  = useYearEvents(year);

  const isCurrentYear = year === today.getFullYear();

  // ── Swipe to change year ──────────────────────────────────────────
  const translateX = useSharedValue(0);
  const opacity    = useSharedValue(1);

  const changeYear = useCallback((direction: number) => {
    setYear(y => y + direction);
    translateX.value = 0;
    opacity.value    = withTiming(1, { duration: 120 });
  }, []);

  const animateAndChange = useCallback((direction: number) => {
    opacity.value = withTiming(0, { duration: 120 }, () => {
      runOnJS(changeYear)(direction);
    });
  }, [changeYear]);

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

  function handleMonthPress(y: number, m: number) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/month', params: { year: String(y), month: String(m) } } as never);
  }

  function goToToday() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setYear(today.getFullYear());
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.bg }]}>
      <AppHeader currentTab="year" />

      {/* Year label + 오늘로 */}
      <View style={styles.subHeader}>
        <View style={{ flex: 1 }} />
        <Text style={[styles.yearLabel, { color: colors.textPrimary }]}>
          {formatYearLabel(year)}
        </Text>
        <View style={styles.todayWrap}>
          {!isCurrentYear && (
            <Pressable onPress={goToToday} hitSlop={12} style={styles.todayBtn}>
              <Text style={[styles.todayText, { color: colors.accent }]}>오늘로</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* 12-month grid */}
      <GestureDetector gesture={panGesture}>
        <ReAnimated.View style={[styles.gridWrap, animStyle]}>
          <YearGrid
            year={year}
            todayStr={todayStr}
            eventDates={eventDates}
            colors={colors}
            onMonthPress={handleMonthPress}
          />
        </ReAnimated.View>
      </GestureDetector>
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    root:      { flex: 1 },
    subHeader: {
      flexDirection:     'row',
      alignItems:        'center',
      paddingHorizontal: 16,
      paddingVertical:   10,
    },
    yearLabel: { fontSize: 24, fontWeight: '600' },
    todayWrap: { flex: 1, alignItems: 'flex-end' },
    todayBtn:  { paddingHorizontal: 8, paddingVertical: 4 },
    todayText: { fontSize: 13, fontWeight: '600' },
    gridWrap:  { flex: 1, paddingBottom: 12 },
  });
}
