import { Mic } from 'lucide-react-native';
import { useEffect } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import ReAnimated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '../constants/colors';
import type { MicStatus } from '../types';

interface Props {
  visible:      boolean;
  onCancel:     () => void;
  onComplete?:  () => void;
  micStatus?:   MicStatus;
  isProcessing?: boolean;
}

export default function VoiceInputOverlay({ visible, onCancel, onComplete, micStatus, isProcessing }: Props) {
  const colors = useColors();
  const isRecording = micStatus === 'recording';
  const scale = useSharedValue(1);

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
      {/*
        Outer Pressable = full-screen backdrop.
        onPress fires when the user taps anywhere the inner View doesn't claim.
        Disabled during processing so the spinner can't be accidentally dismissed.
      */}
      <Pressable
        style={styles.backdrop}
        onPress={isProcessing ? undefined : onCancel}
      >
        {/* box-none: inner View itself doesn't receive touches → unclaimed touches bubble to backdrop */}
        <View style={styles.center} pointerEvents="box-none">
          {isProcessing ? (
            <>
              <View style={[styles.micCircle, { backgroundColor: colors.primary + '22' }]}>
                <ActivityIndicator size="large" color={colors.primary} />
              </View>
              <Text style={styles.listenText}>분석 중...</Text>
            </>
          ) : isRecording ? (
            <>
              {/* pointerEvents="none" prevents pulseRing from swallowing taps */}
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
              <Text style={styles.listenText}>지금 말씀하세요!</Text>
              {onComplete && (
                <Text style={[styles.hintText, { color: 'rgba(255,255,255,0.6)' }]}>
                  마이크 탭 = 완료  ·  바깥 탭 = 취소
                </Text>
              )}
            </>
          ) : (
            /* Preparing: TTS playing or audio session setup — show static dimmed mic */
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
