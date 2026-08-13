import { useCallback } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { StyleSheet, View } from 'react-native';
import { ClassifiedIntent } from '../types';
import type { useVoiceFlow } from '../hooks/useVoiceFlow';
import ConfirmCard from './ConfirmCard';
import InlineConfirmCard from './InlineConfirmCard';
import MultiConfirmCard from './MultiConfirmCard';

type VoiceFlow = ReturnType<typeof useVoiceFlow>;

interface Props {
  voice: VoiceFlow;
  // 저장 콜백 — 화면마다 적용/리로드 로직이 달라 부모가 주입한다.
  onSave: (intent: ClassifiedIntent) => Promise<void>;
  // 복수 저장(미지정 시 각 인텐트를 onSave로 순차 적용)
  onSaveMulti?: (intents: ClassifiedIntent[]) => Promise<void>;
  onCancel: () => void;
  onRetry: () => void;
}

// 확인 단계(phase='confirming')의 3분기 렌더를 한 곳에 모은 공용 컴포넌트.
// 복수 → MultiConfirmCard, 단일 음성 → InlineConfirmCard(자동 마이크 재활성=음성 응답),
// 하이브리드(텍스트) → ConfirmCard. HomeScreen과 /voice 라우트가 동일하게 사용해
// 한쪽만 고쳐지는 divergence(예: /voice에 음성 응답 누락)를 방지한다.
export default function VoiceConfirmLayer({ voice, onSave, onSaveMulti, onCancel, onRetry }: Props) {
  // 포커스된 화면에서만 확인 카드를 렌더한다.
  // voice.phase는 전역 스토어라, 스택에 남아 있는 뒤쪽 화면(예: /day를 띄운 뒤에도 마운트된 홈)이
  // 동시에 확인 카드를 그리면 **레코더가 2개** 열린다. 뒤늦은 레코더는 acquireMic에 실패하고,
  // 사용자의 발화는 이긴 쪽에만 들어가므로 진 쪽은 '발화 없음'으로 오판한다.
  // (앱 자신의 실패 안내 TTS가 이긴 쪽 마이크로 들어가 STT를 오염시키는 경로도 생긴다.)
  const isFocused = useIsFocused();

  const handleConfirm = useCallback(async () => {
    if (voice.classifiedIntent?.events?.length) {
      await voice.confirmMultiAction(async (intents) => {
        if (onSaveMulti) await onSaveMulti(intents);
        else for (const i of intents) await onSave(i);
      });
    } else {
      await voice.confirmAction(onSave);
    }
  }, [voice, onSave, onSaveMulti]);

  if (!isFocused) return null;
  if (voice.phase !== 'confirming' || !voice.classifiedIntent) return null;

  if (voice.classifiedIntent.events?.length) {
    return (
      <MultiConfirmCard
        events={voice.classifiedIntent.events}
        transcript={voice.transcript}
        onConfirm={handleConfirm}
        onCancel={onCancel}
      />
    );
  }

  if (voice.confirmSource === 'voice') {
    return (
      <InlineConfirmCard
        intent={voice.classifiedIntent}
        transcript={voice.transcript}
        onConfirm={handleConfirm}
        onCancel={onCancel}
      />
    );
  }

  // 하이브리드(텍스트) 입력: 정적 버튼 카드
  return (
    <View style={styles.hybridWrap} pointerEvents="box-none">
      <ConfirmCard
        intent={voice.classifiedIntent}
        transcript={voice.transcript}
        onConfirm={handleConfirm}
        onRetry={onRetry}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hybridWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
  },
});
