import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  AppStateStatus,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import ReAnimated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../contexts/ThemeContext';

const HINTS = [
  '"내일 3시 회의 잡아줘"',
  '"오늘 저녁 7시 운동"',
  '"다음 주 월요일 점심"',
  '"다가올 일정 보여줘"',
  '"오늘 일정 뭐 있어"',
  '"캘린더 보여줘"',
  '"내일 회의 4시로 바꿔줘"',
  '"이번 주 빈 시간 찾아줘"',
  '"방금 옮긴 거 취소"',
];

const ROW_H     = 28;   // strip height — must match for overflow clipping
const ROTATE_MS = 5000; // 5s per hint
const SLIDE_PX  = 18;   // slide distance for enter/exit

function pickNext(pool: string[], lastShown: string): string {
  const candidates = pool.filter(x => x !== lastShown);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

interface Props {
  isVoiceActive?: boolean;
}

export default function VoiceHintCarousel({ isVoiceActive }: Props) {
  const isDark = useColorScheme() === 'dark';
  const { hintEnabled } = useTheme();

  // Use a ref to track current hint without closure staleness
  const hintRef = useRef(HINTS[Math.floor(Math.random() * HINTS.length)]);
  const [displayHint, setDisplayHint] = useState(hintRef.current);

  const opacity    = useSharedValue(1);
  const translateY = useSharedValue(0);

  const animStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  // Called after slide-out completes: swap text, slide in from below
  const showNext = useCallback(() => {
    const next = pickNext(HINTS, hintRef.current);
    hintRef.current = next;
    setDisplayHint(next);
    // Instantly position below, then animate up + fade in
    translateY.value = SLIDE_PX;
    opacity.value    = 0;
    opacity.value    = withTiming(1, { duration: 350 });
    translateY.value = withTiming(0, { duration: 400, easing: Easing.out(Easing.quad) });
  }, [opacity, translateY]);

  // Slide current hint up + fade out, then trigger swap
  const advance = useCallback(() => {
    opacity.value = withTiming(0, { duration: 250 });
    translateY.value = withTiming(-SLIDE_PX, {
      duration: 250,
      easing: Easing.in(Easing.quad),
    }, (done) => {
      'worklet';
      if (done) runOnJS(showNext)();
    });
  }, [opacity, translateY, showNext]);

  // Infinite loop: every ROTATE_MS, roll to next hint
  useEffect(() => {
    const id = setInterval(advance, ROTATE_MS);
    return () => clearInterval(id);
  }, [advance]);

  // Pause animations when app is backgrounded
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      if (state !== 'active') {
        cancelAnimation(opacity);
        cancelAnimation(translateY);
      } else {
        opacity.value    = withTiming(1, { duration: 200 });
        translateY.value = withTiming(0, { duration: 200 });
      }
    });
    return () => sub.remove();
  }, [opacity, translateY]);

  if (!hintEnabled || isVoiceActive) return null;

  const textColor = isDark ? '#E5E7EB' : '#1F2937';

  return (
    <View style={styles.strip} pointerEvents="none">
      <ReAnimated.View style={animStyle}>
        <Text style={[styles.hintText, { color: textColor }]}>
          💬 {displayHint}
        </Text>
      </ReAnimated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    height: ROW_H,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    fontSize: 14,
    fontFamily: 'Pretendard-Medium',
    fontWeight: '500',
    letterSpacing: 0.1,
  },
});
