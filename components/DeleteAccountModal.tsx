import { useRouter } from 'expo-router';
import { AlertTriangle } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { LINKS } from '../constants/links';
import { Spacing } from '../constants/spacing';
import { deleteAccount } from '../services/auth/accountDeletion';

type Step = 'intro' | 'confirm' | 'deleting';

export default function DeleteAccountModal({
  visible,
  onClose,
  isSubscribed,
}: {
  visible: boolean;
  onClose: () => void;
  isSubscribed: boolean;
}) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const [step, setStep] = useState<Step>('intro');
  const [error, setError] = useState<string | null>(null);

  // 진행 중에는 닫기 차단(중복 호출·다른 조작 방지)
  const locked = step === 'deleting';

  function reset() {
    setStep('intro');
    setError(null);
  }

  function handleClose() {
    if (locked) return;
    reset();
    onClose();
  }

  async function runDelete() {
    setError(null);
    setStep('deleting');
    try {
      await deleteAccount();
      // 성공 — 세션 종료됨. 온보딩으로 이동(새 계정 자동 생성 안 함).
      router.replace('/onboarding/splash' as never);
    } catch (e) {
      // 서버가 계정을 삭제하지 않았음(원자적 실패) — 재시도 가능.
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
      setStep('confirm');
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.iconWrap}>
            <AlertTriangle size={28} color={colors.error} />
          </View>

          {step === 'intro' && (
            <>
              <Text style={styles.title}>계정 삭제</Text>
              <Text style={styles.body}>
                계정과 아래 데이터가 <Text style={styles.bold}>영구적으로 삭제</Text>되며
                되돌릴 수 없습니다.
              </Text>
              <View style={styles.list}>
                <Text style={styles.listItem}>· 모든 일정과 반복 일정</Text>
                <Text style={styles.listItem}>· 음성 인식 기록</Text>
                <Text style={styles.listItem}>· 캘린더 연동·사용량 정보</Text>
                <Text style={styles.listItem}>· 계정 자체(기기 연결 포함)</Text>
              </View>

              {isSubscribed && (
                <View style={styles.warnBox}>
                  <Text style={styles.warnText}>
                    유료 구독 중입니다. 계정을 삭제해도 구독은 자동 해지되지 않아요.
                    {Platform.OS === 'android' ? ' Play 스토어에서' : ' 스토어에서'} 별도로
                    해지해야 요금이 청구되지 않습니다.
                  </Text>
                  {Platform.OS === 'android' && (
                    <Pressable onPress={() => Linking.openURL(LINKS.manageSubscription).catch(() => {})}>
                      <Text style={styles.link}>Play 구독 관리 열기</Text>
                    </Pressable>
                  )}
                </View>
              )}

              <View style={styles.actions}>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={handleClose}>
                  <Text style={styles.btnGhostText}>취소</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnDangerOutline]} onPress={() => setStep('confirm')}>
                  <Text style={styles.btnDangerOutlineText}>계정 삭제</Text>
                </Pressable>
              </View>
            </>
          )}

          {step === 'confirm' && (
            <>
              <Text style={styles.title}>정말 삭제할까요?</Text>
              <Text style={styles.body}>
                이 작업은 되돌릴 수 없습니다. 같은 기기에서 앱을 다시 열면 빈 새 계정으로
                시작됩니다.
              </Text>

              {error && (
                <View style={styles.errorBox}>
                  <Text style={styles.errorText}>
                    삭제에 실패했어요. 계정은 그대로 유지됩니다. 다시 시도해 주세요.
                  </Text>
                </View>
              )}

              <View style={styles.actions}>
                <Pressable style={[styles.btn, styles.btnGhost]} onPress={handleClose}>
                  <Text style={styles.btnGhostText}>취소</Text>
                </Pressable>
                <Pressable style={[styles.btn, styles.btnDangerSolid]} onPress={runDelete}>
                  <Text style={styles.btnDangerSolidText}>
                    {error ? '다시 시도' : '영구 삭제'}
                  </Text>
                </Pressable>
              </View>
            </>
          )}

          {step === 'deleting' && (
            <>
              <Text style={styles.title}>삭제 중…</Text>
              <ActivityIndicator size="large" color={colors.error} style={{ marginVertical: Spacing.lg }} />
              <Text style={styles.body}>잠시만 기다려 주세요. 앱을 닫지 마세요.</Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'center',
      paddingHorizontal: Spacing.lg,
    },
    sheet: {
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 0.5,
      borderColor: c.border,
      padding: Spacing.lg,
      gap: Spacing.sm,
    },
    iconWrap: { alignItems: 'center', marginBottom: 4 },
    title: {
      fontSize: 18,
      color: c.textPrimary,
      fontFamily: 'Pretendard-Bold',
      fontWeight: '800',
      textAlign: 'center',
    },
    body: { fontSize: 13, color: c.textMuted, lineHeight: 19, textAlign: 'center' },
    bold: { color: c.error, fontFamily: 'Pretendard-Bold', fontWeight: '700' },
    list: {
      alignSelf: 'stretch',
      gap: 4,
      backgroundColor: c.bg,
      borderRadius: 10,
      padding: Spacing.md,
      marginTop: 4,
    },
    listItem: { fontSize: 13, color: c.textPrimary, lineHeight: 19 },
    warnBox: {
      alignSelf: 'stretch',
      backgroundColor: c.warning + '18',
      borderWidth: 1,
      borderColor: c.warning + '50',
      borderRadius: 10,
      padding: Spacing.md,
      gap: 6,
      marginTop: 4,
    },
    warnText: { fontSize: 12, color: c.warning, lineHeight: 18, fontFamily: 'Pretendard-Medium', fontWeight: '500' },
    link: { fontSize: 13, color: c.warning, fontFamily: 'Pretendard-Bold', fontWeight: '700', textDecorationLine: 'underline' },
    errorBox: {
      alignSelf: 'stretch',
      backgroundColor: c.error + '15',
      borderWidth: 1,
      borderColor: c.error + '40',
      borderRadius: 10,
      padding: Spacing.md,
      marginTop: 4,
    },
    errorText: { fontSize: 12, color: c.error, lineHeight: 18 },
    actions: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
    btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
    btnGhost: { backgroundColor: c.bg, borderWidth: 0.5, borderColor: c.border },
    btnGhostText: { fontSize: 15, color: c.textPrimary, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
    btnDangerOutline: { backgroundColor: c.error + '15', borderWidth: 1, borderColor: c.error + '50' },
    btnDangerOutlineText: { fontSize: 15, color: c.error, fontFamily: 'Pretendard-Bold', fontWeight: '700' },
    btnDangerSolid: { backgroundColor: c.error },
    btnDangerSolidText: { fontSize: 15, color: '#fff', fontFamily: 'Pretendard-Bold', fontWeight: '700' },
  });
}
