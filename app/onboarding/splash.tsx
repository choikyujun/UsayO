import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';

const BAR_COUNT = 5;
const BAR_STEP_MS = 130;
const LOAD_MS = 1500;

export default function SplashScreen() {
  const bars = useRef(
    Array.from({ length: BAR_COUNT }, () => new Animated.Value(0.25))
  ).current;
  const loadWidth = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    AsyncStorage.setItem('onboarding_step', 'splash');

    // Staggered waveform loop
    const waveAnims = bars.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * BAR_STEP_MS),
          Animated.timing(v, { toValue: 1,    duration: 380, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0.25, duration: 380, useNativeDriver: true }),
          Animated.delay((BAR_COUNT - 1 - i) * BAR_STEP_MS),
        ])
      )
    );
    waveAnims.forEach(a => a.start());

    // Loading bar → auto-advance
    Animated.timing(loadWidth, {
      toValue: 1,
      duration: LOAD_MS,
      useNativeDriver: false,
    }).start(() => {
      router.replace('/onboarding/slides');
    });

    return () => waveAnims.forEach(a => a.stop());
  }, []);

  return (
    <View style={styles.root}>
      <View style={styles.center}>
        {/* Logo circle with waveform */}
        <View style={styles.logoCircle}>
          <View style={styles.wave}>
            {bars.map((anim, i) => (
              <Animated.View
                key={i}
                style={[styles.bar, { transform: [{ scaleY: anim }] }]}
              />
            ))}
          </View>
        </View>

        <Text style={styles.title}>UsayO</Text>
        <Text style={styles.tagline}>Yu say. It's done.</Text>
      </View>

      {/* Loading bar */}
      <View style={styles.loadTrack}>
        <Animated.View
          style={[
            styles.loadFill,
            {
              width: loadWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.darkBg,
    alignItems: 'center',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  logoCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 14,
  },
  wave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    height: 40,
  },
  bar: {
    width: 5,
    height: 32,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -1,
    fontFamily: 'monospace',
  },
  tagline: {
    fontSize: 12,
    color: '#4a4670',
    letterSpacing: 0.5,
  },
  loadTrack: {
    width: '52%',
    height: 3,
    backgroundColor: Colors.darkCard,
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 64,
  },
  loadFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 2,
  },
});
