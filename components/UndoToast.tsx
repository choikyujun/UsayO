import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../constants/colors';
import { useUndoToast } from '../contexts/UndoToastContext';

export default function UndoToast() {
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const { state, dismiss } = useUndoToast();

  const translateY = useSharedValue(80);
  const opacity    = useSharedValue(0);

  useEffect(() => {
    if (state.visible) {
      translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      opacity.value    = withTiming(1, { duration: 180 });
    } else {
      translateY.value = withTiming(80, { duration: 220 });
      opacity.value    = withTiming(0, { duration: 180 });
    }
  }, [state.visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const panGesture = Gesture.Pan()
    .onUpdate(e => {
      if (e.translationY > 0) translateY.value = e.translationY;
    })
    .onEnd(e => {
      if (e.translationY > 30) {
        runOnJS(dismiss)();
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 220 });
      }
    });

  const bottom = Math.max(insets.bottom, 16) + 72; // above tab bar

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View
        style={[styles.toast, { backgroundColor: colors.card, bottom }, animStyle]}
        pointerEvents={state.visible ? 'box-none' : 'none'}
      >
        <Text style={[styles.message, { color: colors.textPrimary }]} numberOfLines={1}>
          {state.message}
        </Text>
        {state.onUndo && (
          <Pressable
            onPress={() => {
              state.onUndo?.();
              dismiss();
            }}
            hitSlop={8}
          >
            <Text style={[styles.undoBtn, { color: colors.primary }]}>되돌리기</Text>
          </Pressable>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  toast: {
    position:          'absolute',
    left:              16,
    right:             16,
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 16,
    paddingVertical:   13,
    borderRadius:      12,
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 4 },
    shadowOpacity:     0.18,
    shadowRadius:      8,
    elevation:         8,
  },
  message: {
    flex:       1,
    fontSize:   14,
    fontFamily: 'Pretendard-Medium',
    fontWeight: '500',
  },
  undoBtn: {
    fontSize:   14,
    fontFamily: 'Pretendard-Bold',
    fontWeight: '700',
    marginLeft: 16,
  },
});
