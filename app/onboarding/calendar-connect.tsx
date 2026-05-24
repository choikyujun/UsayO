import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Calendar } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/colors';

const PROVIDERS = [
  {
    id: 'google',
    name: 'Google 캘린더',
    desc: 'Google 계정으로 일정을 동기화해요',
  },
  {
    id: 'apple',
    name: 'Apple 캘린더',
    desc: 'iCloud 캘린더를 바로 가져와요',
  },
];

export default function CalendarConnectScreen() {
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    AsyncStorage.setItem('onboarding_step', 'calendar-connect');
  }, []);

  function proceed(connected: boolean) {
    AsyncStorage.setItem('onboarding_cal_connected', connected ? 'true' : 'false');
    AsyncStorage.setItem('onboarding_step', 'ready');
    router.replace('/onboarding/ready');
  }

  function handleConnect() {
    // OAuth placeholder — 설정 → 캘린더 연동에서 실제 연결 가능
    Alert.alert(
      '연동 준비 중',
      '현재 설정 → 캘린더 연동에서 연결할 수 있어요.',
      [{ text: '확인', onPress: () => proceed(false) }]
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={styles.iconCircle}>
          <Calendar size={42} color="#fff" />
        </View>
        <Text style={styles.title}>캘린더를 연결해볼까요?</Text>
        <Text style={styles.subtitle}>기존 일정을 바로 가져올 수 있어요</Text>
      </View>

      <View style={styles.providers}>
        {PROVIDERS.map(p => (
          <Pressable
            key={p.id}
            style={[
              styles.providerCard,
              selected === p.id && styles.providerCardSelected,
            ]}
            onPress={() => setSelected(p.id)}
          >
            <View style={[styles.radio, selected === p.id && styles.radioSelected]}>
              {selected === p.id && <View style={styles.radioDot} />}
            </View>
            <View style={styles.providerInfo}>
              <Text style={styles.providerName}>{p.name}</Text>
              <Text style={styles.providerDesc}>{p.desc}</Text>
            </View>
          </Pressable>
        ))}
      </View>

      <Text style={styles.hint}>캘린더 연동은 설정에서 언제든 변경할 수 있어요.</Text>

      <View style={styles.footer}>
        {selected && (
          <Pressable style={styles.connectBtn} onPress={handleConnect}>
            <Text style={styles.connectBtnText}>연결하기</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.skipBtn, !selected && styles.skipBtnPrimary]}
          onPress={() => proceed(false)}
        >
          <Text style={[styles.skipBtnText, !selected && styles.skipBtnTextPrimary]}>
            {selected ? '건너뛰기' : '나중에 연결할게요'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.darkBg,
    paddingHorizontal: 24,
    paddingTop: 64,
    paddingBottom: 48,
  },
  top: {
    alignItems: 'center',
    gap: 12,
    marginBottom: 32,
  },
  iconCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 18,
    elevation: 10,
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  providers: {
    gap: 12,
    marginBottom: 16,
  },
  providerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.darkCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1.5,
    borderColor: Colors.darkBorder,
  },
  providerCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '0E',
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.darkBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: Colors.primary,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
  providerInfo: { flex: 1 },
  providerName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 2,
  },
  providerDesc: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  hint: {
    fontSize: 12,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 24,
  },
  footer: {
    marginTop: 'auto',
    gap: 8,
    alignItems: 'center',
  },
  connectBtn: {
    width: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
  },
  connectBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  skipBtn: {
    width: '100%',
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.darkBorder,
  },
  skipBtnPrimary: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  skipBtnText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
  skipBtnTextPrimary: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 16,
  },
});
