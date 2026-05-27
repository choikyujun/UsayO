import { Mic } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import ReAnimated, {
  useAnimatedStyle,
  useSharedValue,
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

export default function VoiceInputOverlay({
  visible, onCancel, onComplete, micStatus, isProcessing, loadingStage,
}: Props) {
  const colors = useColors();
  const isRecording = micStatus === 'recording';
  const scale = useSharedValue(1);

  // Fade animation for the message text
  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Rotating messages per stage
  const listeningMsg  = useRotatingMessage(LISTENING_MESSAGES, isRecording && !isProcessing);
  const analyzingMsg  = useRotatingMessage(ANALYZING_MESSAGES, !!isProcessing && loadingStage !== 'saving');
  const savingMsg     = useRotatingMessage(SAVING_MESSAGES,    !!isProcessing && loadingStage === 'saving');

  // Current message
  let currentMsg: string;
  if (isProcessing) {
    currentMsg = loadingStage === 'saving' ? savingMsg : analyzingMsg;
  } else if (isRecording) {
    currentMsg = listeningMsg;
  } else {
    currentMsg = '준비 중...';
  }

  // Fade in/out when message changes
  const prevMsg = useRef(currentMsg);
  useEffect(() => {
    if (prevMsg.current === currentMsg) return;
    prevMsg.current = currentMsg;
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: FADE_MS, useNativeDriver: true }),
      Animated.timing(fadeAnim, { toValue: 1, duration: FADE_MS, useNativeDriver: true }),
    ]).start();
  }, [currentMsg]);

  useEffect(() => {
    if (visible && isRecording) {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.4, { duration: 800 }),
          withTiming(1.0, { duration: 800 }),
        ),
        -1,
        false,
      );
    } else {
      scale.value = withTiming(1.0, { duration: 200 });
    }
  }, [visible, isRecording]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity:   Math.max(0, 1.4 - scale.value) * 0.6 + 0.1,
  }));

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
          {isProcessing ? (
            <>
              <View style={[styles.micCircle, { backgroundColor: colors.primary + '22' }]}>
                <Mic size={48} color={colors.primary + '88'} strokeWidth={1.5} />
              </View>
              <Animated.Text style={[styles.listenText, { opacity: fadeAnim }]}>
                {currentMsg}
              </Animated.Text>
            </>
          ) : isRecording ? (
            <>
              <ReAnimated.View
                pointerEvents="none"
                style={[styles.pulseRing, { borderColor: colors.primary }, pulseStyle]}
              />
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
          ) : (
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
  pulseRing: {
    position:     'absolute',
    width:        80,
    height:       80,
    borderRadius: 40,
    borderWidth:  2,
  },
  micCircle: {
    width:          80,
    height:         80,
    borderRadius:   40,
    alignItems:     'center',
    justifyContent: 'center',
    marginBottom:   24,
  },
  listenText: {
    color:        '#FFFFFF',
    fontSize:     18,
    fontWeight:   '500',
    marginBottom: 8,
  },
  hintText: {
    fontSize:  12,
    textAlign: 'center',
  },
});
