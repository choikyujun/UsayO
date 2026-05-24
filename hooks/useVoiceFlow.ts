import { useCallback, useRef } from 'react';
import { useVoiceStore } from '../stores/useVoiceStore';
import { useVoiceRecorder } from './useVoiceRecorder';
import { runVoiceFlow } from '../services/voice/VoiceFlowOrchestrator';
import { noiseDetector } from '../services/voice/NoiseDetectorService';
import { audioSessionService } from '../services/voice/AudioSessionService';
import { intentService } from '../services/voice/IntentClassifierService';
import { speechService } from '../services/voice/SpeechRecognitionService';
import { ttsService } from '../services/voice/TTSService';
import { matchQuickResponse } from '../services/voice/QuickResponseMatcher';
import { ClassifiedIntent } from '../types';

type OnAutoSave = (intent: ClassifiedIntent) => Promise<string | undefined>;
type OnUndo     = (eventId: string) => Promise<void>;

export function useVoiceFlow() {
  const store = useVoiceStore();

  // onAutoSave / onUndo refs — startVoice 호출 시 저장, onAutoStop에서 참조
  const onAutoSaveRef = useRef<OnAutoSave | undefined>(undefined);
  const onUndoRef     = useRef<OnUndo | undefined>(undefined);

  const processUriRef = useRef<
    ((uri: string | null, onAutoSave?: OnAutoSave, onUndo?: OnUndo) => Promise<void>) | null
  >(null);

  const recorder = useVoiceRecorder({
    onAutoStop: useCallback((uri: string | null) => {
      console.log('[VoiceFlow] auto-stop received URI:', uri);
      store.setPhase('processing');
      // onAutoSaveRef.current를 함께 전달 → 0.85+ 패스가 auto-stop에서도 동작
      processUriRef.current?.(uri, onAutoSaveRef.current, onUndoRef.current);
    }, [store]),
  });

  const startVoice = useCallback(async (
    onAutoSave?: OnAutoSave,
    onUndo?: OnUndo,
  ) => {
    onAutoSaveRef.current = onAutoSave;
    onUndoRef.current     = onUndo;
    store.reset();

    try {
      const cached = audioSessionService.getCachedNoise();
      if (cached) {
        // 60초 이내 캐시 → 즉시 사용 (측정 스킵)
        if ((cached.recommendation === 'hybrid' || cached.recommendation === 'text') && cached.snr < 10) {
          store.setHybridMode(true);
          store.setHybridInputState({ prefillText: '', isVoiceMode: false, fallbackReason: 'noise' });
          return;
        }
      } else {
        // 캐시 없음 → 측정 후 캐시 저장
        const noise = await noiseDetector.measureBackgroundNoise();
        store.setNoiseAnalysis(noise);
        audioSessionService.setCachedNoise(noise.snr, noise.recommendation);
        if (noise.recommendation === 'hybrid' && noise.snr < 10) {
          store.setHybridMode(true);
          store.setHybridInputState({ prefillText: '', isVoiceMode: false, fallbackReason: 'noise' });
          return;
        }
      }
    } catch { /* 소음 측정 실패 무시 */ }

    store.setPhase('listening');
    await recorder.startRecording();
  }, [store, recorder]);

  // STT → 인텐트 분류 → 신뢰도 기반 분기
  const processUri = useCallback(async (
    uri: string | null,
    onAutoSave?: OnAutoSave,
    onUndo?: OnUndo,
  ) => {
    if (!uri) {
      store.setPhase('fail');
      store.setError({ type: 'noSpeech', message: '녹음 파일을 가져올 수 없어요.' });
      return;
    }

    console.log('[VoiceFlow] STT triggered:', uri);
    const result = await runVoiceFlow(uri);
    console.log('[VoiceFlow] intent classified:', result.intent);

    if (!result.success || !result.intent) {
      if (result.error?.type === 'lowConfidence') {
        ttsService.speak('다시 한 번 말씀해주세요').catch(() => {});
        store.setPhase('idle');
        return;
      }
      store.setPhase('fail');
      store.setError(result.error ?? { type: 'unknown', message: '처리 실패' });
      return;
    }

    const confidence = result.intent.confidence;

    // ── confidence >= 0.85: 즉시 자동 저장 + 3초 취소 대기 ──────
    if (confidence >= 0.85 && onAutoSave) {
      store.setTranscript(result.sttResult?.transcript ?? null);
      store.setClassifiedIntent(result.intent);
      store.setPhase('processing');

      let savedId: string | undefined;
      try {
        savedId = await onAutoSave(result.intent);
        store.setPhase('success');
        ttsService.speak('등록했어요').catch(() => {});
      } catch (e) {
        store.setPhase('fail');
        store.setError({ type: 'unknown', message: e instanceof Error ? e.message : '저장 실패' });
        return;
      }

      // 3초간 음성 "취소" 대기
      if (savedId && onUndo) {
        try {
          await recorder.startRecording();
          await new Promise<void>(r => setTimeout(r, 3000));
          const cancelUri = await recorder.stopRecording();
          if (cancelUri) {
            const stt    = await speechService.transcribe(cancelUri, 'ko');
            const answer = matchQuickResponse(stt.transcript);
            if (answer === 'negative') {
              await onUndo(savedId);
              store.reset();
              ttsService.speak('취소했어요').catch(() => {});
              return;
            }
          }
        } catch { /* 취소 대기 실패 → 저장 유지 */ }
      }
      return;
    }

    // ── 0.6 <= confidence < 0.85: InlineConfirmCard 표시 ────────
    store.setTranscript(result.sttResult?.transcript ?? null);
    store.setClassifiedIntent(result.intent);
    store.setConfirmMessage(result.confirmMessage ?? null);
    store.setConfirmSource('voice');
    store.setPhase('confirming');
  }, [store, recorder]);

  // onAutoStop 콜백이 항상 최신 processUri를 참조하도록 ref 동기화
  processUriRef.current = processUri;

  // 수동 종료 경로
  const stopAndProcess = useCallback(async (
    onAutoSave?: OnAutoSave,
    onUndo?: OnUndo,
  ) => {
    store.setPhase('processing');
    const uri = await recorder.stopRecording();
    await processUri(uri, onAutoSave, onUndo);
  }, [store, recorder, processUri]);

  // 하이브리드 입력 확정
  const confirmHybridInput = useCallback(async (editedText: string) => {
    store.setPhase('processing');
    store.setHybridMode(false);
    store.setHybridInputState(null);

    try {
      const intent = await intentService.classify(editedText);

      if (intent.intent === 'UNKNOWN' || intent.confidence < 0.5) {
        store.setPhase('fail');
        store.setError({ type: 'lowConfidence', sttResult: { transcript: editedText, confidence: intent.confidence, language: 'ko' } });
        return;
      }

      store.setTranscript(editedText);
      store.setClassifiedIntent(intent);
      const msg = ttsService.generateConfirmMessage(intent);
      store.setConfirmMessage(msg);
      store.setConfirmSource('hybrid');
      store.setPhase('confirming');
    } catch (e) {
      store.setPhase('fail');
      store.setError({ type: 'network', message: e instanceof Error ? e.message : '처리 실패' });
    }
  }, [store]);

  const cancelVoice = useCallback(() => {
    ttsService.stop();
    recorder.cancelRecording();
    store.reset();
  }, [store, recorder]);

  const retryVoice = useCallback(() => {
    store.reset();
  }, [store]);

  const switchToHybrid = useCallback((prefillText = '') => {
    recorder.cancelRecording();
    store.setHybridMode(true);
    store.setHybridInputState({
      prefillText,
      isVoiceMode: false,
      fallbackReason: 'user_choice',
    });
    store.setPhase('idle');
  }, [store, recorder]);

  const dismissHybrid = useCallback(() => {
    store.setHybridMode(false);
    store.setHybridInputState(null);
  }, [store]);

  const setConfirmedIntent = useCallback((intent: ClassifiedIntent) => {
    store.setClassifiedIntent(intent);
    store.setPhase('confirming');
    const msg = ttsService.generateConfirmMessage(intent);
    store.setConfirmMessage(msg);
  }, [store]);

  const confirmAction = useCallback(async (
    onSave: (intent: ClassifiedIntent) => Promise<void>,
  ) => {
    const intent = store.classifiedIntent;
    if (!intent) return;
    store.setPhase('processing');
    ttsService.stop();
    try {
      await onSave(intent);
      store.setPhase('success');
      const msg = ttsService.generateSuccessMessage(intent);
      if (msg) ttsService.speak(msg);
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 실패';
      console.error('[VoiceFlow] save error:', e);
      store.setPhase('fail');
      store.setError({ type: 'unknown', message: msg });
      ttsService.speak('저장에 실패했어요. 다시 시도해주세요.').catch(() => {});
    }
  }, [store]);

  return {
    phase: store.phase,
    transcript: store.transcript,
    classifiedIntent: store.classifiedIntent,
    confirmMessage: store.confirmMessage,
    confirmSource: store.confirmSource,
    audioLevel: recorder.audioLevel,
    silenceProgress: recorder.silenceProgress,
    isHybridMode: store.isHybridMode,
    hybridInputState: store.hybridInputState,
    noiseAnalysis: store.noiseAnalysis,
    error: store.error,
    micStatus: recorder.status,
    startVoice,
    stopAndProcess,
    confirmHybridInput,
    cancelVoice,
    retryVoice,
    switchToHybrid,
    dismissHybrid,
    setConfirmedIntent,
    confirmAction,
  };
}
