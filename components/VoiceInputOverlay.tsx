import { Check, Mic } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import ReAnimated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '../constants/colors';
import {
  ANALYZING_MESSAGES,
  LISTENING_MESSAGES,
  SAVING_MESSAGES,
} from '../constants/voiceLoadingMessages';
import type { MicStatus } from '../types';
import { Spacing } from '../constants/spacing';

export type VoiceLoadingStage = 'analyzing' | 'saving' | null;

interface Props {
  visible:       boolean;
  onCancel:      () => void;
  onComplete?:   () => void;
  micStatus?:    MicStatus;
  isProcessing?: boolean;
  loadingStage?: VoiceLoadingStage;
}

const ROTATE_MS = 1500;
const FADE_MS   = 200;
const RING_PERIOD = 1400;

function useRotatingMessage(messages: string[], active: boolean): string {
  const [idx, setIdx]   = useState(0);
  const [text, setText] = useState(messages[0] ?? '');

  useEffect(() => {
    if (!active) return;
    setIdx(0);
    setText(messages[0] ?? '');
    const id = setInterval(() => {
      setIdx(i => {
        const next = (i + 1) % messages.length;
        setText(messages[next]);
        return next;
      });
    }, ROTATE_MS);
    return () => clearInterval(id);
  }, [active, messages]);

  return text;
}

// Single concentric pulse ring
function PulseRing({ color, delayMs, active }: { color: string; delayMs: number; active: boolean }) {
  const scale   = useSharedValue(0.6);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (active) {
      scale.value = withDelay(
        delayMs,
        withRepeat(
          withSequence(
            withTiming(0.6, { duration: 0 }),
            withTiming(2.2, { duration: RING_PERIOD }),
          ),
          -1,
          false,
        ),
      );
      opacity.value = withDelay(
        delayMs,
        withRepeat(
          withSequence(
            withTiming(0.55, { duration: 0 }),
            withTiming(0, { duration: RING_PERIOD }),
          ),
          -1,
          false,
        ),
      );
    } else {
      scale.value   = withTiming(0.6, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 });
    }
  }, [active]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  return (
    <ReAnimated.View
      pointerEvents="none"
      style={[styles.ring, { borderColor: color }, style]}
    />
  );
}

// Dot indicator for analyzing state
function AnalyzingDots({ color }: { color: string }) {
  const dots = [0, 1, 2];
  return (
    <View style={styles.dotsRow}>
      {dots.map(i => (
        <_Dot key={i} color={color} delay={i * 180} />
      ))}
    </View>
  );
}

function _Dot({ color, delay }: { color: string; delay: number }) {
  const scale = useSharedValue(0.5);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1.3, { duration: 360 }),
          withTiming(0.5, { duration: 360 }),
        ),
        -1,
        false,
      ),
    );
    return () => { scale.value = 0.5; };
  }, []);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <ReAnimated.View
      style={[styles.dot, { backgroundColor: color }, style]}
    />
  );
}

// Check icon with scale + fade for saving state
function SaveCheckMark({ color, active }: { color: string; active: boolean }) {
  const scale   = useSharedValue(0.4);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (active) {
      scale.value   = withTiming(1, { duration: 220 });
      opacity.value = withTiming(1, { duration: 220 });
    } else {
      scale.value   = withTiming(0.4, { duration: 150 });
      opacity.value = withTiming(0, { duration: 150 });
    }
  }, [active]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   opacity.value,
  }));

  return (
    <ReAnimated.View style={[styles.saveCheck, style]}>
      <Check size={36} color={color} strokeWidth={2.5} />
    </ReAnimated.View>
  );
}

export default function VoiceInputOverlay({
  visible, onCancel, onComplete, micStatus, isProcessing, loadingStage,
}: Props) {
  const colors      = useColors();
  const isRecording = micStatus === 'recording';
  const isSaving    = !!isProcessing && loadingStage === 'saving';
  const isAnalyzing = !!isProcessing && !isSaving;

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const listeningMsg  = useRotatingMessage(LISTENING_MESSAGES,  isRecording && !isProcessing);
  const analyzingMsg  = useRotatingMessage(ANALYZING_MESSAGES,  isAnalyzing);
  const savingMsg     = useRotatingMessage(SAVING_MESSAGES,      isSaving);

  let currentMsg: string;
  if (isProcessing) {
    currentMsg = isSaving ? savingMsg : analyzingMsg;
  } else if (isRecording) {
    currentMsg = listeningMsg;
  } else {
    currentMsg = '준비 중...';
  }

  const prevMsg = useRef(currentMsg);
  useEffect(() => {
    if (prevMsg.current === currentMsg) return;
    prevMsg.current = currentMsg;
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
    ]).start();
  }, [currentMsg]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      statusBarTranslucent
    >
      <Pressable
        style={styles.backdrop}
        onPress={isProcessing ? undefined : onCancel}
      >
        <View style={styles.center} pointerEvents="box-none">
          {isRecording && !isProcessing && (
            <>
              {/* Concentric pulse rings */}
              <PulseRing color={colors.primary} delayMs={0}    active={isRecording} />
              <PulseRing color={colors.primary} delayMs={460}  active={isRecording} />
              <PulseRing color={colors.primary} delayMs={920}  active={isRecording} />

              <Pressable
                onPress={onComplete ?? onCancel}
                hitSlop={20}
                style={[styles.micCircle, { backgroundColor: colors.primary + '22' }]}
              >
                <Mic size={48} color={colors.primary} strokeWidth={1.5} />
              </Pressable>
              <Animated.Text style={[styles.listenText, { opacity: fadeAnim }]}>
                {currentMsg}
              </Animated.Text>
              {onComplete && (
                <Text style={[styles.hintText, { color: 'rgba(255,255,255,0.6)' }]}>
                  마이크 탭 = 완료  ·  바깥 탭 = 취소
                </Text>
              )}
            </>
          )}

          {isAnalyzing && (
            <>
              <View style={[styles.micCircle, { backgroundColor: colors.primary + '22' }]}>
                <Mic size={48} color={colors.primary + '88'} strokeWidth={1.5} />
              </View>
              <AnalyzingDots color={colors.primary} />
              <Animated.Text style={[styles.listenText, { opacity: fadeAnim }]}>
                {currentMsg}
              </Animated.Text>
            </>
          )}

          {isSaving && (
            <>
              <View style={[styles.micCircle, { backgroundColor: colors.primary + '22' }]}>
                <SaveCheckMark color={colors.primary} active={isSaving} />
              </View>
              <Animated.Text style={[styles.listenText, { opacity: fadeAnim }]}>
                {currentMsg}
              </Animated.Text>
            </>
          )}

          {!isRecording && !isProcessing && (
            <>
              <View style={[styles.micCircle, { backgroundColor: colors.primary + '11' }]}>
                <Mic size={48} color={colors.primary + '66'} strokeWidth={1.5} />
              </View>
              <Text style={[styles.listenText, { opacity: 0.7 }]}>준비 중...</Text>
            </>
          )}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems:      'center',
    justifyContent:  'center',
  },
  center: {
    alignItems: 'center',
  },
  ring: {
    position:     'absolute',
    width:        80,
    height:       80,
    borderRadius: 40,
    borderWidth:  1.5,
  },
  micCircle: {
    width:          80,
    height:         80,
    borderRadius:   40,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   Spacing.lg,
  },
  listenText: {
    color:        '#FFFFFF',
    fontSize:     18,
    fontFamily:   'Pretendard-Medium',
    fontWeight:   '500',
    marginBottom: Spacing.sm,
  },
  hintText: {
    fontSize:  12,
    textAlign: 'center',
  },
  dotsRow: {
    flexDirection: 'row',
    gap:           10,
    marginBottom:  Spacing.lg,
  },
  dot: {
    width:        8,
    height:       8,
    borderRadius: 4,
  },
  saveCheck: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
