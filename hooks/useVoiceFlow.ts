import { useCallback, useRef } from 'react';
import { useVoiceStore } from '../stores/useVoiceStore';
import { useVoiceRecorder } from './useVoiceRecorder';
import { runVoiceFlow } from '../services/voice/VoiceFlowOrchestrator';
import { noiseDetector } from '../services/voice/NoiseDetectorService';
import { audioSessionService } from '../services/voice/AudioSessionService';
import { intentService } from '../services/voice/IntentClassifierService';
import { ttsService } from '../services/voice/TTSService';
import { ClassifiedIntent } from '../types';

type OnAutoSave = (intent: ClassifiedIntent) => Promise<string | undefined>;

export function useVoiceFlow() {
  const store = useVoiceStore();

  // onAutoSave / prefillContext refs — startVoice 호출 시 저장, onAutoStop에서 참조
  const onAutoSaveRef     = useRef<OnAutoSave | undefined>(undefined);
  const prefillContextRef = useRef<string | undefined>(undefined);
  const isRetryRef        = useRef(false); // lowConfidence/noSpeech 자동 1회 재시도 추적
  const isCancelledRef    = useRef(false); // cancelVoice 호출 시 zombie 재녹음 방지

  const processUriRef = useRef<
    ((uri: string | null, onAutoSave?: OnAutoSave) => Promise<void>) | null
  >(null);

  const recorder = useVoiceRecorder({
    onAutoStop: useCallback((uri: string | null) => {
      console.log('[VoiceFlow] auto-stop received URI:', uri);
      store.setPhase('processing');
      // onAutoSaveRef.current를 함께 전달 → 0.85+ 패스가 auto-stop에서도 동작
      processUriRef.current?.(uri, onAutoSaveRef.current);
    }, [store]),
  });

  const startVoice = useCallback(async (
    onAutoSave?: OnAutoSave,
    prefillContext?: string,
  ) => {
    onAutoSaveRef.current     = onAutoSave;
    prefillContextRef.current = prefillContext;
    isRetryRef.current        = false;
    isCancelledRef.current    = false;
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
  ) => {
    if (!uri) {
      store.setPhase('fail');
      store.setError({ type: 'noSpeech', message: '녹음 파일을 가져올 수 없어요.' });
      return;
    }

    console.log('[VoiceFlow] STT triggered:', uri);
    const result = await runVoiceFlow(uri, { prefillContext: prefillContextRef.current });
    prefillContextRef.current = undefined;
    console.log('[VoiceFlow] intent classified:', result.intent);

    if (!result.success || !result.intent) {
      const errType = result.error?.type;
      // lowConfidence/noSpeech: TTS는 orchestrator에서 이미 완료 → 마이크 자동 재시작 (1회)
      if (errType === 'lowConfidence' || errType === 'noSpeech') {
        if (!isRetryRef.current && !isCancelledRef.current) {
          isRetryRef.current = true;
          store.setPhase('listening');
          await recorder.startRecording();
        } else {
          isRetryRef.current = false;
          if (!isCancelledRef.current) {
            store.setPhase('fail');
            store.setError(result.error ?? { type: 'unknown', message: '처리 실패' });
          }
        }
        return;
      }
      store.setPhase('fail');
      store.setError(result.error ?? { type: 'unknown', message: '처리 실패' });
      return;
    }

    const confidence = result.intent.confidence;

    // DELETE/UPDATE/COMPLETE는 항상 확인 필요, 멀티 일정도 항상 카드 표시 (outer intent에 startDateTime 없음)
    const requiresConfirm =
      result.intent.intent === 'DELETE' ||
      result.intent.intent === 'UPDATE' ||
      result.intent.intent === 'COMPLETE' ||
      (result.intent.events?.length ?? 0) > 0;

    // ── confidence >= 0.85: 즉시 자동 저장 ──────────────────────
    if (confidence >= 0.85 && onAutoSave && !requiresConfirm) {
      store.setTranscript(result.sttResult?.transcript ?? null);
      store.setClassifiedIntent(result.intent);
      store.setPhase('processing');

      try {
        await onAutoSave(result.intent);
        store.setPhase('success');
        const successMsg = ttsService.generateSuccessMessage(result.intent);
        ttsService.speak(successMsg || '완료됐어요').catch(() => {});
      } catch (e) {
        store.setPhase('fail');
        store.setError({ type: 'unknown', message: e instanceof Error ? e.message : '저장 실패' });
      }
      return;
    }

    // ── 0.6 <= confidence < 0.85: InlineConfirmCard 표시 ────────
    store.setTranscript(result.sttResult?.transcript ?? null);
    store.setClassifiedIntent(result.intent);
    store.setConfirmMessage(result.confirmMessage ?? null);
    store.setConfirmSource('voice');
    if (result.confirmMessage) ttsService.speak(result.confirmMessage).catch(() => {});
    store.setPhase('confirming');
  }, [store, recorder]);

  // onAutoStop 콜백이 항상 최신 processUri를 참조하도록 ref 동기화
  processUriRef.current = processUri;

  // 수동 종료 경로
  const stopAndProcess = useCallback(async (
    onAutoSave?: OnAutoSave,
  ) => {
    store.setPhase('processing');
    const uri = await recorder.stopRecording();
    await processUri(uri, onAutoSave);
  }, [store, recorder, processUri]);

  // 마이크 탭 즉시 저장 — startVoice 때 저장된 콜백 재사용
  const stopAndProcessStored = useCallback(async () => {
    store.setPhase('processing');
    const uri = await recorder.stopRecording();
    await processUri(uri, onAutoSaveRef.current);
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
    isRetryRef.current     = false;
    isCancelledRef.current = true;
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
      // 사용자 친화적 오류 메시지는 그대로 읽어줌 (찾을 수 없어요, 여러 개 등)
      ttsService.speak(msg).catch(() => {});
    }
  }, [store]);

  const confirmMultiAction = useCallback(async (
    onSave: (intents: ClassifiedIntent[]) => Promise<void>,
  ) => {
    const intent = store.classifiedIntent;
    const events = intent?.events;
    if (!events?.length) return;
    store.setPhase('processing');
    ttsService.stop();
    try {
      await onSave(events);
      store.setPhase('success');
      ttsService.speak(`${events.length}개 일정을 등록했어요`).catch(() => {});
    } catch (e) {
      const msg = e instanceof Error ? e.message : '저장 실패';
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
    confirmMultiAction,
    stopAndProcessStored,
  };
}
