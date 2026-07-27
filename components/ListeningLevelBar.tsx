import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { useColors } from '../constants/colors';
import { useRecorderTelemetryStore } from '../stores/useRecorderTelemetryStore';

// 녹음 레벨바 — 고빈도(100ms) audioLevel을 selector로 "여기서만" 구독.
// 이 리프만 100ms 리렌더되고 화면 트리 상위(HomeScreen 등)는 리렌더되지 않는다.
export default function ListeningLevelBar() {
  const colors = useColors();
  const level = useRecorderTelemetryStore((s) => s.audioLevel);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: level, duration: 80, useNativeDriver: false }).start();
  }, [level, anim]);

  return (
    <View style={[styles.track, { backgroundColor: colors.card2 }]}>
      <Animated.View
        style={[
          styles.fill,
          {
            backgroundColor: colors.primary,
            width: anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { width: '80%', height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
});
