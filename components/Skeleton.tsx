import { useEffect, useState } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useColors } from '../constants/colors';

interface Props {
  width?:        number | string;
  height?:       number | string;
  borderRadius?: number;
  style?:        StyleProp<ViewStyle>;
}

export default function Skeleton({ width = '100%', height = 16, borderRadius = 6, style }: Props) {
  const colors  = useColors();
  const opacity = useSharedValue(0.35);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 700 }),
        withTiming(0.35, { duration: 700 }),
      ),
      -1,
      false,
    );
  }, []);

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  // Use a View for the layout so Reanimated doesn't complain about width/height types
  return (
    <View style={[{ width: width as any, height: height as any, borderRadius, backgroundColor: colors.textTertiary, overflow: 'hidden' }, style]}>
      <Animated.View style={[StyleSheet.absoluteFill, animStyle, { backgroundColor: colors.textTertiary }]} />
    </View>
  );
}

export function SkeletonRow({
  children,
  gap = 8,
  style,
}: {
  children: React.ReactNode;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.row, { gap }, style]}>{children}</View>;
}

/** Returns true only after `delayMs` ms of loading — prevents flash for fast fetches */
export function useSkeletonDelay(isLoading: boolean, delayMs = 200): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!isLoading) { setShow(false); return; }
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [isLoading, delayMs]);
  return show;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
