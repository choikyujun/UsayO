import { Mic } from 'lucide-react-native';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import ReAnimated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '../constants/colors';

interface Props {
  visible:     boolean;
  onCancel:    () => void;
  onComplete?: () => void; // 마이크 탭 → 즉시 저장
}

export default function VoiceInputOverlay({ visible, onCancel, onComplete }: Props) {
  const colors = useColors();

  const scale = useSharedValue(1);

  useEffect(() => {
    if (visible) {
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
  }, [visible]);

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
      {/* 외부 dim 영역 탭 → 취소 */}
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <View style={styles.center} pointerEvents="box-none">
          {/* Pulse ring (non-interactive) */}
          <ReAnimated.View
            style={[styles.pulseRing, { borderColor: colors.primary }, pulseStyle]}
          />

          {/* 마이크 영역 탭 → 저장 */}
          <Pressable
            onPress={onComplete ?? onCancel}
            hitSlop={20}
            style={[styles.micCircle, { backgroundColor: colors.primary + '22' }]}
          >
            <Mic size={48} color={colors.primary} strokeWidth={1.5} />
          </Pressable>

          <Text style={styles.listenText}>듣고 있어요</Text>

          {onComplete ? (
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
              마이크 탭 = 저장  ·  바깥 탭 = 취소
            </Text>
          ) : (
            <Text style={[styles.hintText, { color: colors.textSecondary }]}>
              다시 탭하면 취소
            </Text>
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
