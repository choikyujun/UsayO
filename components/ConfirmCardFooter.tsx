import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import type { ConfirmStatus } from '../hooks/useConfirmVoiceLoop';
import MiniWaveform from './MiniWaveform';

// 확인 카드(단일/복수) 하단 상태 표시. 사용자가 화면만 보고 "내 발화가 인식됐는지"를 알 수 있어야
// 한다: 말하기 시작하면 카운트다운 숫자가 멈추고 '듣는 중'으로 바뀐다.
//   N초 후 저장 → 듣는 중 → 확인 중
// 두 카드가 같은 컴포넌트를 쓰므로 표시 규칙이 한쪽만 바뀔 수 없다.
interface Props {
  status: ConfirmStatus;
  countdown: number | null;
  micActive: boolean;
}

export default function ConfirmCardFooter({ status, countdown, micActive }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (status === 'mic-unavailable') {
    return (
      <View style={styles.footer}>
        <Text style={styles.hint}>마이크를 사용할 수 없어요. 버튼을 눌러주세요.</Text>
      </View>
    );
  }

  if (status === 'listening') {
    return (
      <View style={styles.footer}>
        <MiniWaveform active color={colors.primary} />
        <Text style={styles.active}>듣는 중</Text>
      </View>
    );
  }

  if (status === 'checking') {
    return (
      <View style={styles.footer}>
        <Text style={styles.active}>확인 중</Text>
      </View>
    );
  }

  if (status === 'waiting') {
    return (
      <View style={styles.footer}>
        <Text style={styles.hint}>저장 또는 취소를 선택하세요</Text>
      </View>
    );
  }

  // countdown
  return (
    <View style={styles.footer}>
      {micActive && <MiniWaveform active={micActive} color={colors.primary} />}
      {countdown != null
        ? <Text style={styles.active}>{countdown}초 후 저장</Text>
        : <Text style={styles.hint}>저장 또는 취소</Text>}
    </View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      minHeight: 24,
    },
    hint: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
    },
    active: {
      fontSize: 13,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: c.primary,
      textAlign: 'center',
    },
  });
}
