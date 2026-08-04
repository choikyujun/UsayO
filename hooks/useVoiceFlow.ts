import { useCallback, useEffect, useRef } from 'react';
import { useVoiceStore } from '../stores/useVoiceStore';
import { useVoiceRecorder } from './useVoiceRecorder';
import { runVoiceFlow, flowErrorFromCode } from '../services/voice/VoiceFlowOrchestrator';
import { VoiceServiceError } from '../services/voice/voiceErrors';
import { noiseDetector } from '../services/voice/NoiseDetectorService';
import { audioSessionService } from '../services/voice/AudioSessionService';
import { intentService } from '../services/voice/IntentClassifierService';
import { ttsService } from '../services/voice/TTSService';
import { formatTimeKo } from '../utils/timeHelpers';
import { ClassifiedIntent } from '../types';

type OnAutoSave = (intent: ClassifiedIntent) => Promise<string | undefined>;

// startVoice 호출 출처. 로그로 남겨 이중 시작의 실제 유입 경로를 특정한다.
export type VoiceStartSource = 'fab' | 'voice-route' | 'retry' | 'voice-input';

// 마지막 startVoice 시작 시각(모듈 레벨 = 모든 useVoiceFlow 인스턴스 공유).
// 시간창 기반 중복 시작 차단: 딥링크 setTimeout(500) 등으로 첫 시작이 이미 끝난 뒤
// 지연 유입되는 두 번째 시작은 동기 플래그로 못 막으므로, '마지막 시작 시각' 기준으로 막는다.
let lastVoiceStartAt = 0;
// setTimeout(500)보다 충분히 크되, 사용자의 의도적 빠른 재시도(≥1.5초)는 막지 않도록 1500ms.
const VOICE_START_DEDUP_MS = 1500;

// CREATE 자동 저장(confidence>=0.85 즉시 저장) 스위치. false로 고정 — 모든 진입점에서
// 확인 카드를 거치도록 통일(오인식 일정이 확인 없이 저장되는 최악의 실패 차단, 진입점 간
// 동작 일관성 확보). onAutoSave 콜백 자체는 제거하지 않는다 — QUERY 실행(조회+요약 반환)에
// 여전히 필요하기 때문. 재활성화하려면 이 값만 true로.
const AUTO_SAVE_CREATE = false;

// 워치독 타임아웃. 딥링크 콜드 경로는 소음 측정 선점 대기(~1.4초)를 거쳐 녹음이 시작되므로
// 3초로는 부족해 오탐했다. phase='listening'은 소음 측정 이후에 세팅되지만 여유를 둬 6초.
const WATCHDOG_MS = 6000;

export function useVoiceFlow() {
  const store = useVoiceStore();

  // onAutoSave / prefillContext refs — startVoice 호출 시 저장, onAutoStop에서 참조
  const onAutoSaveRef          = useRef<OnAutoSave | undefined>(undefined);
  const prefillContextRef      = useRef<string | undefined>(undefined);
  const nearbyEventsContextRef = useRef<string | undefined>(undefined);
  const isRetryRef             = useRef(false); // lowConfidence/noSpeech 자동 1회 재시도 추적
  const isCancelledRef         = useRef(false); // cancelVoice 호출 시 zombie 재녹음 방지
  const isProcessingRef        = useRef(false); // onAutoStop + 수동 탭 이중 호출 방지

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
    source: VoiceStartSource,
    onAutoSave?: OnAutoSave,
    prefillContext?: string,
    nearbyEventsContext?: string,
  ) => {
    console.log(`[Voice] startVoice ← source=${source}`);

    // 시간창 dedup: 마지막 시작으로부터 VOICE_START_DEDUP_MS 이내의 새 요청은 무시.
    // 첫 시작이 끝난 뒤 딥링크 타이머로 지연 유입되는 두 번째 시작을 여기서 막는다.
    const now = Date.now();
    const sinceLast = now - lastVoiceStartAt;
    if (sinceLast < VOICE_START_DEDUP_MS) {
      console.log(`[VoiceFlow] startVoice 무시 — ${sinceLast}ms 전 시작(dedup ${VOICE_START_DEDUP_MS}ms), source=${source}`);
      return;
    }

    // 세션 활성 중이면 무시(idle/fail에서만 새 세션 시작).
    const activePhase = useVoiceStore.getState().phase;
    if (activePhase !== 'idle' && activePhase !== 'fail') {
      console.log(`[VoiceFlow] startVoice 무시 — 세션 활성(phase=${activePhase}), source=${source}`);
      return;
    }

    lastVoiceStartAt = now; // 이 시작을 '마지막 시작'으로 기록(뒤이은 중복 요청 차단 기준)

    onAutoSaveRef.current          = onAutoSave;
    prefillContextRef.current      = prefillContext;
    nearbyEventsContextRef.current = nearbyEventsContext;
    isRetryRef.current             = false;
    isCancelledRef.current         = false;
    isProcessingRef.current        = false;
    store.reset();

    // voice-route(위젯 딥링크는 이 라우트로 진입) 진입은 소음 측정을 완전히 생략(기본 임계값=
    // voice 모드). 콜드 경로에서 측정이 마이크/권한을 점유해 경합을 만드는 것을 애초에 차단.
    if (source === 'voice-route') {
      console.log(`[Mic] ${source} — startVoice 소음 측정 생략`);
    } else {
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
    }

    store.setPhase('listening');
    let ok = await recorder.startRecording();
    if (!ok) {
      // 마이크 획득 실패 → 1회 자동 재시도. acquireMic는 직렬화라 진행 중 정리(unload/release)
      // 뒤에 실행되지만, 외부 지연(선점 abort 등) 여유를 위해 짧게 대기 후 재시도. 무한 루프 방지 위해 1회만.
      console.log('[Voice] 마이크 획득 재시도 1회');
      await new Promise(r => setTimeout(r, 250));
      ok = await recorder.startRecording();
    }
    if (!ok) {
      // 재시도까지 실패 → terminal 상태로 전이해 'listening' 갇힘 방지.
      console.log('[VoiceFlow] startRecording 재시도까지 실패 → fail 전이');
      store.setPhase('fail');
      store.setError({ type: 'micUnavailable', message: '마이크를 사용할 수 없습니다. 다시 시도해 주세요.' });
    }
  }, [store, recorder]);

  // 워치독: phase='listening' 진입 후 WATCHDOG_MS 내에 '어느 인스턴스든' 녹음을 시작하지
  // 못하면 갇힘으로 보고 fail 전이(오버레이 닫힘 + FAB 재활성).
  // '녹음 시작' 신호는 인스턴스별 recorder.status가 아니라 **전역 마이크 소유권(micOwner==='voice')**
  // 으로 판정한다 — 세션을 시작하지 않은 다른 useVoiceFlow 인스턴스(예: 홈 오버레이)가 자기
  // idle 상태를 보고 오탐하던 문제(전역 phase ↔ 인스턴스별 status 불일치)를 제거한다.
  // 타이머 만료 시점에 다시 소유권을 확인하므로, 도중에 녹음이 시작되면 fail하지 않는다.
  useEffect(() => {
    if (store.phase !== 'listening') return;
    if (audioSessionService.micOwner === 'voice') return; // 이미 녹음 시작됨
    const t = setTimeout(() => {
      const s = useVoiceStore.getState();
      if (s.phase === 'listening' && audioSessionService.micOwner !== 'voice') {
        console.log('[VoiceFlow] watchdog: recording 미도달(전역 소유자≠voice) → fail 전이');
        audioSessionService.releaseMic('voice', 'watchdog').catch(() => {});
        s.setPhase('fail');
        s.setError({ type: 'micUnavailable', message: '마이크를 사용할 수 없습니다. 다시 시도해 주세요.' });
      }
    }, WATCHDOG_MS);
    return () => clearTimeout(t);
  }, [store.phase]);

  // STT → 인텐트 분류 → 신뢰도 기반 분기
  const processUri = useCallback(async (
    uri: string | null,
    onAutoSave?: OnAutoSave,
  ) => {
    if (isProcessingRef.current) {
      console.log('[VoiceFlow] processUri: 이미 처리 중 — 중복 호출 무시');
      return;
    }
    isProcessingRef.current = true;
    if (!uri) {
      isProcessingRef.current = false;
      store.setPhase('fail');
      store.setError({ type: 'noSpeech', message: '녹음 파일을 가져올 수 없어요.' });
      return;
    }

    console.log('[VoiceFlow] STT triggered:', uri);
    store.setLoadingStage('analyzing');
    const result = await runVoiceFlow(uri, {
      prefillContext: prefillContextRef.current,
      nearbyEventsContext: nearbyEventsContextRef.current,
    });
    prefillContextRef.current      = undefined;
    nearbyEventsContextRef.current = undefined;
    console.log('[VoiceFlow] intent classified:', result.intent);

    if (!result.success || !result.intent) {
      const errType = result.error?.type;
      // lowConfidence/noSpeech: TTS는 orchestrator에서 이미 완료 → 마이크 자동 재시작 (1회)
      if (errType === 'lowConfidence' || errType === 'noSpeech') {
        if (!isRetryRef.current && !isCancelledRef.current) {
          isRetryRef.current    = true;
          isProcessingRef.current = false;
          store.setPhase('listening');
          const ok = await recorder.startRecording();
          if (!ok) {
            store.setPhase('fail');
            store.setError({ type: 'micUnavailable', message: '마이크를 사용할 수 없습니다. 다시 시도해 주세요.' });
          }
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

    // AM/PM은 IntentClassifier(활동 시간대 규칙)에서 이미 확정됨 → 되묻지 않는다.
    const resolvedIntent = result.intent;

    // ── QUERY: 저장이 아니라 조회 경로. 실제 DB 조회 결과를 음성으로 안내 ──
    if (resolvedIntent.intent === 'QUERY') {
      store.setTranscript(result.sttResult?.transcript ?? null);
      store.setClassifiedIntent(resolvedIntent);
      store.setPhase('processing');
      store.setLoadingStage('analyzing');
      try {
        // onAutoSave(=applyClassifiedIntent)는 QUERY를 받으면 조회 후 요약 문자열을 반환
        const summary = onAutoSave ? await onAutoSave(resolvedIntent) : undefined;
        const msg = summary && summary.trim() ? summary : '일정을 확인할 수 없어요. 다시 시도해주세요.';
        console.log('[VoiceFlow] QUERY 결과 안내:', msg);
        store.setPhase('success');
        ttsService.speak(msg).catch(() => {});
      } catch (e) {
        console.error('[VoiceFlow] QUERY 조회 오류:', e);
        store.setPhase('fail');
        store.setError({ type: 'unknown', message: e instanceof Error ? e.message : '조회 실패' });
      }
      isProcessingRef.current = false;
      return;
    }

    // DELETE/UPDATE/COMPLETE는 항상 확인 필요, 멀티 일정도 항상 카드 표시 (outer intent에 startDateTime 없음)
    // targetEventIds 배치 삭제도 확인 필수
    const requiresConfirm =
      resolvedIntent.intent === 'DELETE' ||
      resolvedIntent.intent === 'UPDATE' ||
      resolvedIntent.intent === 'COMPLETE' ||
      resolvedIntent.intent === 'NOTIFICATION_UPDATE' ||
      (resolvedIntent.events?.length ?? 0) > 0 ||
      (resolvedIntent.targetEventIds?.length ?? 0) > 0;

    console.log('[VoiceFlow] 확인 단계 필요:', requiresConfirm,
      '| intent:', resolvedIntent.intent,
      '| confidence:', confidence,
      '| onAutoSave:', !!onAutoSave,
    );

    // ── confidence >= 0.85 CREATE: 즉시 자동 저장 (AUTO_SAVE_CREATE=false로 비활성) ──
    // (자동 저장은 CREATE 전용. QUERY/NAVIGATION/RESCHEDULE_UNDO 등은 위/아래에서 별도 처리)
    // AUTO_SAVE_CREATE=false이면 이 블록은 진입하지 않고 아래 확인 카드 경로로 흐른다.
    if (AUTO_SAVE_CREATE && confidence >= 0.85 && onAutoSave && !requiresConfirm && resolvedIntent.intent === 'CREATE') {
      console.log('[VoiceFlow] DB 저장 호출 (auto-save), time:', resolvedIntent.startDateTime?.date ?? 'none');
      store.setTranscript(result.sttResult?.transcript ?? null);
      store.setClassifiedIntent(resolvedIntent);
      store.setPhase('processing');

      try {
        store.setLoadingStage('saving');
        await onAutoSave(resolvedIntent);
        store.setPhase('success');
        // 성공 문구는 실제 수행된 작업(CREATE)만 반영. 빈 문구면 발화하지 않음(거짓 성공 금지)
        const successMsg = ttsService.generateSuccessMessage(resolvedIntent);
        if (successMsg) ttsService.speak(successMsg).catch(() => {});
      } catch (e) {
        store.setPhase('fail');
        store.setError({ type: 'unknown', message: e instanceof Error ? e.message : '저장 실패' });
      }
      isProcessingRef.current = false;
      return;
    }

    // ── 0.6 <= confidence < 0.85: InlineConfirmCard 표시 ────────
    isProcessingRef.current = false;
    store.setTranscript(result.sttResult?.transcript ?? null);
    store.setClassifiedIntent(resolvedIntent);
    // 모호 해결 후에는 수정된 시간으로 확인 메시지 재생성
    const resolvedConfirmMsg = result.intent.ambiguous
      ? (ttsService.generateConfirmMessage(resolvedIntent) ?? null)
      : (result.confirmMessage ?? null);
    store.setConfirmMessage(resolvedConfirmMsg);
    store.setConfirmSource('voice');
    // 확인 문구 발화는 아래 단일 effect가 담당(모든 화면·모든 소스 통일, 이중 발화 제거).
    store.setPhase('confirming');
  }, [store, recorder]);

  // ── 확인 문구 단일 발화 지점 ─────────────────────────────────
  // phase가 confirming으로 바뀔 때 confirmMessage를 한 번만 발화. 어떤 화면(Home/Day/Week/Month)이든,
  // 어떤 소스(voice/hybrid/ambiguous)든 여기 한 곳에서만 말한다 → 화면별 이중 발화/ dedup skip 제거.
  // 확인 질문은 bypassDedup=true 로 절대 skip되지 않게 한다.
  const prevPhaseForTtsRef = useRef(store.phase);
  useEffect(() => {
    const prev = prevPhaseForTtsRef.current;
    prevPhaseForTtsRef.current = store.phase;
    if (prev !== 'confirming' && store.phase === 'confirming' && store.confirmMessage) {
      ttsService.speak(store.confirmMessage, undefined, undefined, true).catch(() => {});
    }
  }, [store.phase, store.confirmMessage]);

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
      // 무조건 network 분류 제거 — 서비스가 실은 원인 타입(VoiceServiceError.code)으로 분류.
      const code = e instanceof VoiceServiceError ? e.code : 'unknown';
      store.setPhase('fail');
      store.setError(flowErrorFromCode(code, e instanceof Error ? e.message : '처리 실패'));
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
    // reset 경로에서도 마이크 소유권을 반드시 반납(락 누수 방지). 소유자 아니면 안전 no-op.
    audioSessionService.releaseMic('voice', 'retry').catch(() => {});
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
    // getState()로 읽어야 함: onAmPmChange 직후 React re-render 전에 호출되므로
    // store.classifiedIntent (hook 스냅샷)는 stale → PM이 그대로 남는 버그
    const intent = useVoiceStore.getState().classifiedIntent;
    console.log('[VoiceFlow] confirmAction intent:', intent?.ambiguous, '| time:', intent?.startDateTime?.date ?? 'none');
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
      ttsService.speak(msg).catch(() => {});
    }
  }, [store]);

  const confirmMultiAction = useCallback(async (
    onSave: (intents: ClassifiedIntent[]) => Promise<void>,
  ) => {
    const intent = useVoiceStore.getState().classifiedIntent;
    const events = intent?.events;
    if (!events?.length) return;
    console.log('[VoiceFlow] 멀티 저장 시작, events:', events.length);
    events.forEach((e, i) => {
      console.log(`[VoiceFlow] event ${i}:`, {
        title: e.title,
        startAt: e.startDateTime?.date,
        recurrenceRule: e.startDateTime?.recurrenceRule ?? 'null (정상)',
        isRecurring: e.startDateTime?.isRecurring ?? false,
      });
    });
    store.setPhase('processing');
    ttsService.stop();
    try {
      await onSave(events);
      store.setPhase('success');
      // [활동 시간대 규칙] 각 일정의 확정 시각을 오전/오후로 읽어줌 — 규칙/의도 불일치를 귀로 잡는 지점.
      const summary = events
        .map((e) => {
          const iso = e.startDateTime?.date;
          const t = iso ? formatTimeKo(new Date(iso)) : '';
          const title = e.title ?? '일정';
          return t ? `${t} ${title}` : title;
        })
        .join(', ');
      ttsService.speak(`${summary}, 총 ${events.length}개 등록했어요`).catch(() => {});
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
    isHybridMode: store.isHybridMode,
    hybridInputState: store.hybridInputState,
    noiseAnalysis: store.noiseAnalysis,
    error: store.error,
    micStatus: recorder.status,
    loadingStage: store.loadingStage,
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
