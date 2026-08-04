import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import { Check, Mic } from 'lucide-react-native';
import { useEffect } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/colors';
import { Spacing } from '../../constants/spacing';
import { audioSessionService } from '../../services/voice/AudioSessionService';

const BENEFITS = [
  '말하는 순간에만 사용해요',
  '녹음은 저장되지 않아요',
  '언제든 권한 해제 가능',
];

export default function PermissionMicScreen() {
  useEffect(() => {
    AsyncStorage.setItem('onboarding_step', 'permission-mic');
  }, []);

  async function handleAllow() {
    // 게이트 경유 — 미허용이면 게이트가 실제 요청(다이얼로그)을 띄운다(온보딩은 명시적 부여 자리).
    const granted = await audioSessionService.ensureMicPermission('onboarding');
    await AsyncStorage.setItem('onboarding_mic_granted', granted ? 'true' : 'false');

    if (!granted) {
      Alert.alert(
        '마이크 권한 필요',
        '설정 앱에서 UsayO의 마이크 권한을 허용하면\n음성 기능을 사용할 수 있어요.',
        [{ text: '확인', onPress: proceed }]
      );
      return;
    }
    proceed();
  }

  function proceed() {
    AsyncStorage.setItem('onboarding_step', 'calendar-connect');
    router.replace('/onboarding/calendar-connect');
  }

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <View style={styles.iconCircle}>
          <Mic size={42} color="#fff" />
        </View>
        <Text style={styles.title}>마이크를 허용해주세요</Text>
        <Text style={styles.subtitle}>
          음성으로 일정을 관리하려면{'\n'}마이크 접근 권한이 필요해요
        </Text>
      </View>

      <View style={styles.benefitCard}>
        {BENEFITS.map(b => (
          <View key={b} style={styles.benefitRow}>
            <View style={styles.checkCircle}>
              <Check size={14} color={Colors.success} />
            </View>
            <Text style={styles.benefitText}>{b}</Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Pressable style={styles.allowBtn} onPress={handleAllow}>
          <Text style={styles.allowBtnText}>마이크 허용하기</Text>
        </Pressable>
        <Pressable style={styles.laterBtn} onPress={proceed}>
          <Text style={styles.laterText}>나중에</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.darkBg,
    paddingHorizontal: Spacing.lg,
    paddingTop: 72,
    paddingBottom: Spacing['2xl'],
  },
  top: {
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: 40,
  },
  iconCircle: {
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
    shadowRadius: 20,
    elevation: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.textPrimary,
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
    lineHeight: 21,
  },
  benefitCard: {
    backgroundColor: Colors.darkCard,
    borderRadius: 16,
    padding: 20,
    borderWidth: 0.5,
    borderColor: Colors.darkBorder,
    gap: Spacing.base,
    marginBottom: 40,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  checkCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.success + '18',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.success + '40',
  },
  benefitText: {
    fontSize: 15,
    color: Colors.textPrimary,
    fontFamily: 'Pretendard-Medium',
    fontWeight: '500',
  },
  footer: {
    marginTop: 'auto',
    gap: Spacing.sm,
  },
  allowBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  allowBtnText: {
    fontSize: 16,
    fontFamily: 'Pretendard-Bold',
    fontWeight: '700',
    color: '#fff',
  },
  laterBtn: {
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  laterText: {
    fontSize: 14,
    color: Colors.textMuted,
  },
});
