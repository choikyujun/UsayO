import { X, Lightbulb } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ReAnimated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '../constants/colors';
import { useTheme } from '../contexts/ThemeContext';
import { VOICE_HINTS } from '../constants/voiceHints';

const ROTATE_MS  = 8_000;
const FADE_MS    = 200;

// 세션 레벨 dismiss — 앱 재시작 시 초기화
let sessionDismissed = false;

function pickNext(pool: readonly string[], current: string): string {
  const others = pool.filter(h => h !== current);
  return others[Math.floor(Math.random() * others.length)];
}

export default function VoiceHintRotator() {
  const colors      = useColors();
  const { hintEnabled } = useTheme();
  const [dismissed, setDismissed] = useState(sessionDismissed);

  const hintRef = useRef(VOICE_HINTS[Math.floor(Math.random() * VOICE_HINTS.length)]);
  const [displayHint, setDisplayHint] = useState(hintRef.current);

  const opacity = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const swapHint = useCallback(() => {
    const next = pickNext(VOICE_HINTS, hintRef.current);
    hintRef.current = next;
    setDisplayHint(next);
    opacity.value = withTiming(1, { duration: FADE_MS });
  }, [opacity]);

  const advance = useCallback(() => {
    opacity.value = withTiming(0, { duration: FADE_MS }, done => {
      'worklet';
      if (done) runOnJS(swapHint)();
    });
  }, [opacity, swapHint]);

  useEffect(() => {
    if (dismissed || !hintEnabled) return;
    const id = setInterval(advance, ROTATE_MS);
    return () => clearInterval(id);
  }, [advance, dismissed, hintEnabled]);

  function handleDismiss() {
    sessionDismissed = true;
    setDismissed(true);
  }

  if (!hintEnabled || dismissed) return null;

  return (
    <View style={[styles.row, { paddingHorizontal: 24 }]}>
      <Lightbulb
        size={12}
        color={colors.primary}
        style={{ opacity: 0.4, marginRight: 6 }}
      />
      <ReAnimated.View style={[styles.textWrap, animStyle]}>
        <Text
          style={[styles.hint, { color: colors.textSecondary }]}
          numberOfLines={1}
        >
          {displayHint}
        </Text>
      </ReAnimated.View>
      <Pressable onPress={handleDismiss} hitSlop={8} style={styles.close}>
        <X size={14} color={colors.textTertiary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection:  'row',
    alignItems:     'center',
    paddingVertical: 8,
  },
  textWrap: {
    flex: 1,
  },
  hint: {
    fontSize:   12,
    fontWeight: '400',
  },
  close: {
    marginLeft: 8,
  },
});
