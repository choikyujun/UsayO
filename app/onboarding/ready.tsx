import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Calendar, Check, Mic } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/colors';

type IconComp = React.ComponentType<{ size: number; color: string }>;

export default function ReadyScreen() {
  const checkScale = useRef(new Animated.Value(0)).current;
  const [micGranted, setMicGranted] = useState(false);
  const [calConnected, setCalConnected] = useState(false);

  useEffect(() => {
    AsyncStorage.setItem('onboarding_step', 'ready');

    (async () => {
      const mic = await AsyncStorage.getItem('onboarding_mic_granted');
      const cal = await AsyncStorage.getItem('onboarding_cal_connected');
      setMicGranted(mic === 'true');
      setCalConnected(cal === 'true');
    })();

    // Scale-in animation for check icon
    Animated.spring(checkScale, {
      toValue: 1,
      tension: 55,
      friction: 6,
      delay: 200,
      useNativeDriver: true,
    }).start();
  }, []);

  async function handleStart() {
    await AsyncStorage.setItem('onboarding_complete', 'true');
    router.replace('/(tabs)/');
  }

  return (
    <View style={styles.root}>
      {/* Subtle green ambient glow */}
      <View style={styles.glow} pointerEvents="none" />

      <View style={styles.center}>
        {/* Animated check */}
        <Animated.View style={[styles.checkCircle, { transform: [{ scale: checkScale }] }]}>
          <Check size={48} color="#fff" strokeWidth={3} />
        </Animated.View>

        <Text style={styles.title}>준비 완료!</Text>
        <Text style={styles.subtitle}>YuSay를 시작할 준비가 됐어요</Text>

        {/* Permission status card */}
        <View style={styles.statusCard}>
          <StatusRow Icon={Mic}      label="마이크 권한"  ok={micGranted}    skipLabel="설정에서 허용" />
          <View style={styles.divider} />
          <StatusRow Icon={Calendar} label="캘린더 연동"  ok={calConnected}  skipLabel="설정에서 연결" />
        </View>

        {/* Suggestion card */}
        <View style={styles.suggestionCard}>
          <Text style={styles.suggestionLabel}>이렇게 말해보세요</Text>
          <Text style={styles.suggestionSample}>"내일 오후 3시에 회의 잡아줘"</Text>
        </View>
      </View>

      <Pressable style={styles.startBtn} onPress={handleStart}>
        <Text style={styles.startBtnText}>시작하기</Text>
        <Check size={18} color="#fff" strokeWidth={2.5} />
      </Pressable>
    </View>
  );
}

function StatusRow({
  Icon, label, ok, skipLabel,
}: {
  Icon: IconComp;
  label: string;
  ok: boolean;
  skipLabel?: string;
}) {
  return (
    <View style={rowStyles.row}>
      <Icon size={18} color={ok ? Colors.success : Colors.textMuted} />
      <Text style={rowStyles.label}>{label}</Text>
      {ok ? (
        <View style={rowStyles.okBadge}>
          <Text style={rowStyles.okText}>완료</Text>
        </View>
      ) : (
        <Text style={rowStyles.skipLabel}>{skipLabel ?? '나중에'}</Text>
      )}
    </View>
  );
}

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 2,
  },
  label: {
    flex: 1,
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: '500',
  },
  okBadge: {
    backgroundColor: Colors.success + '20',
    paddingHorizontal: 9,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.success + '40',
  },
  okText: {
    fontSize: 11,
    color: Colors.success,
    fontWeight: '700',
  },
  skipLabel: {
    fontSize: 11,
    color: Colors.textMuted,
  },
});

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.darkBg,
    paddingHorizontal: 24,
    paddingBottom: 48,
    paddingTop: 56,
  },
  glow: {
    position: 'absolute',
    top: '15%',
    left: '15%',
    right: '15%',
    height: 220,
    backgroundColor: Colors.success + '07',
    borderRadius: 120,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    gap: 16,
    paddingTop: 12,
  },
  checkCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 12,
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: Colors.success,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 4,
  },
  statusCard: {
    width: '100%',
    backgroundColor: Colors.darkCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 0.5,
    borderColor: Colors.darkBorder,
    gap: 10,
  },
  divider: {
    height: 0.5,
    backgroundColor: Colors.darkBorder,
  },
  suggestionCard: {
    width: '100%',
    backgroundColor: Colors.primary + '12',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    gap: 8,
  },
  suggestionLabel: {
    fontSize: 12,
    color: Colors.accent,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  suggestionSample: {
    fontSize: 17,
    color: Colors.textPrimary,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.success,
    borderRadius: 16,
    paddingVertical: 16,
    shadowColor: Colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  startBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
});
