import { haptic } from '../utils/haptics';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
import VoiceConfirmLayer from '../components/VoiceConfirmLayer';
import MonthGrid from '../components/MonthGrid';
import VoiceInputOverlay from '../components/VoiceInputOverlay';
import { useColors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { useMonthEvents } from '../hooks/useMonthEvents';
import { useSchedules } from '../hooks/useSchedules';
import { useVoiceInput } from '../hooks/useVoiceInput';
import { localDateStr } from '../utils/timeHelpers';
import { formatMonthLabel, getMonthGrid } from '../utils/monthViewLayout';
import { useCurrentDate } from '../hooks/useCurrentDate';
import { Spacing } from '../constants/spacing';

const { width: SCREEN_W } = Dimensions.get('window');

const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function MonthViewScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { ttsEnabled } = useTheme();

  const { today } = useCurrentDate();
  const params = useLocalSearchParams<{ year?: string; month?: string }>();
  const [year,  setYear]  = useState(() => params.year  ? Number(params.year)  : new Date().getFullYear());
  const [month, setMonth] = useState(() => params.month ? Number(params.month) : new Date().getMonth() + 1);

  const cells        = useMemo(() => getMonthGrid(year, month), [year, month]);
  const { eventsByDate, reload } = useMonthEvents(year, month);
  const { applyClassifiedIntent } = useSchedules(localDateStr(today), 0);
  const voice = useVoiceInput(ttsEnabled);

  const isCurrentMonth = year === today.getFullYear() && month === (today.getMonth() + 1);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  function handleCellPress(dateStr: string) {
    setSelectedDate(dateStr);
  }

  function handleCellLongPress(dateStr: string) {
    const d     = new Date(dateStr + 'T00:00:00');
    const ttsLabel = `${d.getMonth() + 1}월 ${d.getDate()}일`;
    voice.startWithPrefill(
      { dateStr, ttsLabel },
      intent => applyClassifiedIntent(intent),
    );
  }

  // Reload events after successful voice save
  useEffect(() => {
    if (voice.phase === 'success') reload();
  }, [voice.phase]);

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
    haptic.light();
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
            onCellLongPress={handleCellLongPress}
          />
        </ReAnimated.View>
      </GestureDetector>

      <DayEventsSheet
        dateStr={selectedDate}
        events={selectedDate ? (eventsByDate[selectedDate] ?? []) : []}
        onClose={() => setSelectedDate(null)}
      />

      {/* ── Long-press voice overlay ──────────────────────────────── */}
      <VoiceInputOverlay
        visible={voice.overlayVisible}
        micStatus={voice.micStatus}
        isProcessing={voice.phase === 'processing'}
        onCancel={() => voice.cancelVoiceInput()}
        onComplete={() => voice.stopAndProcessStored()}
      />

      {/* 확인 단계 3분기(복수/단일음성/텍스트)는 공용 VoiceConfirmLayer로 통일 — 홈/`/voice`와 동일 */}
      <VoiceConfirmLayer
        voice={voice}
        onSave={async (i) => { await applyClassifiedIntent(i); }}
        onCancel={() => voice.cancelVoiceInput()}
        onRetry={() => { voice.retryVoice(); voice.startVoice('retry'); }}
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
      paddingHorizontal: Spacing.base,
      paddingVertical:   10,
    },
    monthLabel: { fontSize: 24, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
    todayWrap:  { flex: 1, alignItems: 'flex-end' },
    todayBtn:   { paddingHorizontal: Spacing.sm, paddingVertical: 4 },
    todayText:  { fontSize: 13, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
    dowRow: {
      flexDirection:     'row',
      borderBottomWidth: StyleSheet.hairlineWidth,
      paddingVertical:   6,
    },
    dowLabel: {
      flex:       1,
      textAlign:  'center',
      fontSize:   12,
      fontFamily: 'Pretendard-Medium',
      fontWeight: '500',
    },
  });
}
