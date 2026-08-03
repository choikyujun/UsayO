import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import { Audio } from 'expo-av';
import { File } from 'expo-file-system';
import { MicStatus } from '../types';
import { audioSessionService } from '../services/voice/AudioSessionService';
import { deleteAudioFile } from '../services/voice/SpeechRecognitionService';
import { useRecorderTelemetryStore } from '../stores/useRecorderTelemetryStore';
import { voiceTrace } from '../services/voice/voiceTrace'; // [임시 계측 · voice-verify]
import { MAX_DURATION_MS } from '../constants/voiceRecording';
import { ttsService } from '../services/voice/TTSService';

const WARMUP_MS       = 1_000;   // 녹음 시작 후 첫 1초는 무음 감지 제외
const SILENCE_DB      = -40;     // dB 기준값 (이하면 무음)
const SILENCE_LEVEL   = 0.01;    // 정규화 기준값 (이하면 무음)
const SILENCE_MS      = 1_500;   // 무음 지속 1.5초 → 자동 종료
const LEVEL_INTERVAL  = 100;     // 측정 인터벌 (ms)

export interface VoiceRecorderState {
  status: MicStatus;
  error: string | null;
  // audioLevel/silenceProgress/duration은 useRecorderTelemetryStore로 이관(고빈도 격리).
}

export interface UseVoiceRecorderReturn extends VoiceRecorderState {
  // true = 녹음 시작됨, false = 시작 실패/중복(무시). 호출자는 false 시 실패 처리.
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => void;
  start: () => Promise<boolean>;
  stop: () => Promise<string | null>;
  reset: () => void;
  hadSpeech: () => boolean; // 이번(직전) 녹음 중 유효 발화(-40dB 이상)가 감지됐는지 — 침묵/발화 구분용
}

export interface VoiceRecorderOptions {
  onAutoStop?: (uri: string | null) => void;
  silenceMs?: number;  // 무음 자동종료 임계 override (미지정 시 일반 발화 기본값)
  warmupMs?: number;   // 워밍업(무음 감지 제외) 구간 override
  // hadSpeech 판정 강화 옵션 (미지정 시 기존 동작 = 유효 샘플 1회로 true, 카드 경로 보존)
  minSpeechMs?: number;    // 이만큼의 누적 유효 발화가 있어야 hadSpeech=true (TTS 잔향/블립 배제)
  speechWarmupMs?: number; // 녹음 시작 후 이 구간은 hadSpeech 집계 제외(잔향/마이크 트랜지언트 배제)
}

export function useVoiceRecorder(options?: VoiceRecorderOptions): UseVoiceRecorderReturn {
  const [status, setStatus] = useState<MicStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  // 고빈도(100ms) 레벨/무음/경과는 외부 텔레메트리 스토어에 발행 → 화면 트리 리렌더 방지.
  // 스토어 setter는 불변이라 getState()로 1회 취득(구독 아님). 기존 호출부 이름 유지.
  const { setLevel: setAudioLevel, setSilenceProgress, setDuration } = useRecorderTelemetryStore.getState();

  const recordingRef     = useRef<Audio.Recording | null>(null);
  const startingRef      = useRef(false); // startRecording 재진입(동시 호출) 가드
  const lastUriRef       = useRef<string | null>(null);
  const levelTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef     = useRef<number>(0);
  const silenceStartRef  = useRef<number | null>(null); // 무음 시작 타임스탬프
  const autoStopRef      = useRef<(() => Promise<string | null>) | null>(null);
  const onAutoStopRef    = useRef(options?.onAutoStop);
  onAutoStopRef.current  = options?.onAutoStop;
  const speechMsRef      = useRef(0); // 누적 유효 발화 시간(ms)
  const minSpeechMsRef   = useRef(options?.minSpeechMs ?? LEVEL_INTERVAL); // 기본: 1샘플=현행
  minSpeechMsRef.current = options?.minSpeechMs ?? LEVEL_INTERVAL;
  const speechWarmupMsRef = useRef(options?.speechWarmupMs ?? 0);
  speechWarmupMsRef.current = options?.speechWarmupMs ?? 0;
  const silenceMsRef     = useRef(options?.silenceMs ?? SILENCE_MS);
  silenceMsRef.current   = options?.silenceMs ?? SILENCE_MS;
  const warmupMsRef      = useRef(options?.warmupMs ?? WARMUP_MS);
  warmupMsRef.current    = options?.warmupMs ?? WARMUP_MS;

  const clearTimers = useCallback(() => {
    if (levelTimerRef.current) clearInterval(levelTimerRef.current);
    if (maxTimerRef.current)   clearTimeout(maxTimerRef.current);
    levelTimerRef.current = null;
    maxTimerRef.current   = null;
    silenceStartRef.current = null;
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    const rec = recordingRef.current;
    if (!rec) return lastUriRef.current; // auto-stop이 이미 실행 → 캐시 반환

    // 동시 호출 방지: ref를 즉시 null로 — 100ms 타이머가 다시 진입해도 위 guard에서 차단
    recordingRef.current = null;
    clearTimers();
    setStatus('processing');
    setSilenceProgress(0);

    try {
      await rec.stopAndUnloadAsync();
      await audioSessionService.cleanup();
      const uri = rec.getURI() ?? null;
      console.log('[Recorder] stopRecording URI:', uri);
      lastUriRef.current = uri;
      // [VOICE][1-REC] 임시 계측: 파일크기 + 녹음길이, TOTAL 앵커 설정
      voiceTrace.markRecordingEnd();
      const recMs = startTimeRef.current ? Date.now() - startTimeRef.current : -1;
      let recBytes = -1;
      if (uri) {
        try {
          const f = new File(uri); // SDK 54 File API (deprecated getInfoAsync 대체)
          recBytes = f.exists ? f.size : -1;
        } catch { /* 크기 조회 실패 무시 */ }
      }
      console.log(`[VOICE][1-REC] bytes=${recBytes} durationMs=${recMs}`);
      return uri;
    } catch (e) {
      setError(e instanceof Error ? e.message : '녹음 중지 실패');
      return lastUriRef.current;
    } finally {
      await audioSessionService.releaseMic('voice'); // 소유권 반납(정리 완료까지 대기)
      setStatus('idle');
      setAudioLevel(0);
    }
  }, [clearTimers]);

  useEffect(() => { autoStopRef.current = stopRecording; }, [stopRecording]);

  const startRecording = useCallback(async (): Promise<boolean> => {
    const t0 = Date.now();

    // 재진입 가드: 이미 시작 진행 중이면 중복 호출을 무시하고 반환(중복 createAsync 방지).
    if (startingRef.current) {
      console.log('[Mic] startRecording 무시 — 이미 시작 진행 중 (재진입 차단)');
      return false;
    }
    startingRef.current = true;

    setError(null);
    setSilenceProgress(0);
    lastUriRef.current = null;

    // Stage 1: 즉시 UI 피드백 (<5ms) — 사용자가 응답 느낌
    setStatus('preparing');
    console.log('[Mic] tap→preparing:', Date.now() - t0, 'ms');

    try {
      // Stage 0: 이전 세션의 Recording이 남아 있으면 반드시 정리(단일 객체 보장).
      if (recordingRef.current) {
        console.log('[Mic] 잔존 Recording 정리 후 진행');
        try { await recordingRef.current.stopAndUnloadAsync(); } catch { /* 무시 */ }
        recordingRef.current = null;
      }

      // Stage 2: 오디오 모드 설정 (preinit 이후 ~30-50ms)
      const ready = await audioSessionService.prepareForRecording();
      console.log('[Mic] preparing→audioMode:', Date.now() - t0, 'ms');
      if (!ready) {
        Alert.alert(
          '마이크 권한이 필요해요',
          'Settings에서 UsayO의 마이크 권한을 켜주세요.',
          [
            { text: '취소', style: 'cancel' },
            { text: 'Settings 열기', onPress: () => Linking.openSettings() },
          ],
        );
        setStatus('idle');
        return false; // 권한 없음 → 실패(호출자가 terminal 상태로 전이)
      }

      // Stage 2.5: 마이크 소유권 획득 — noise-measure가 점유 중이면 abort 후 이전.
      // voice가 이미 소유 중이면 false(중복 시작) → 여기서 중단.
      // onAbort: 이 소유권의 단일 정리 경로 — 선점/stale/release 어디서 호출돼도 녹음을
      // unload하고 파일을 삭제한다(멱등: recordingRef가 null이면 no-op).
      const gotMic = await audioSessionService.acquireMic('voice', async () => {
        clearTimers();
        const rec = recordingRef.current;
        recordingRef.current = null;
        if (rec) {
          const uri = rec.getURI();
          try { await rec.stopAndUnloadAsync(); } catch { /* 이미 정리됨 무시 */ }
          deleteAudioFile(uri);
        }
      });
      if (!gotMic) {
        console.log('[Mic] 소유권 획득 실패 — 중복 시작으로 판단, 무시');
        setStatus('idle');
        return false;
      }

      // Stage 2.7: 녹음 직전 재생 중인 TTS 중지 — 실패 안내 등 앱 자신의 TTS가 마이크에
      // 녹음돼(에코) STT로 되먹히는 것을 차단(수정 4). 정상 플로우는 이미 TTS 완료 후라 no-op.
      ttsService.stop();

      // Stage 3: 녹음 인스턴스 생성 (~150-300ms)
      const { recording } = await Audio.Recording.createAsync({
        ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
        isMeteringEnabled: true,
      });
      console.log('[Mic] audioMode→recording active:', Date.now() - t0, 'ms');

      recordingRef.current = recording;
      startTimeRef.current = Date.now();
      silenceStartRef.current = null;
      speechMsRef.current = 0; // 새 녹음 시작 시 누적 발화 리셋
      setStatus('recording');

      // 4. 100ms 인터벌: 오디오 레벨 + 무음 카운트다운
      levelTimerRef.current = setInterval(async () => {
        const rec = recordingRef.current;
        if (!rec) return;

        const st = await rec.getStatusAsync().catch(() => null);
        if (!st?.isRecording) return;

        const now     = Date.now();
        const elapsed = now - startTimeRef.current;
        setDuration(elapsed);

        const db         = st.metering ?? -160;
        const normalized = Math.max(0, Math.min(1, (db + 160) / 160));
        setAudioLevel(normalized);

        // 워밍업 기간 또는 소리가 있는 경우 → 무음 타이머 리셋
        const inWarmup = elapsed < warmupMsRef.current;
        const isSilent = db < SILENCE_DB;

        // 누적 유효 발화 집계 — speechWarmup 구간(잔향/트랜지언트)은 제외. 지속성 기반 판정.
        if (!isSilent && elapsed >= speechWarmupMsRef.current) {
          speechMsRef.current += LEVEL_INTERVAL;
        }

        if (inWarmup || !isSilent) {
          if (silenceStartRef.current !== null) {
            silenceStartRef.current = null;
            setSilenceProgress(0);
          }
          return;
        }

        // 무음 감지: 타이머 시작 또는 진행
        if (silenceStartRef.current === null) {
          silenceStartRef.current = now;
        }

        const silenceElapsed = now - silenceStartRef.current;
        const progress = Math.min(1, silenceElapsed / silenceMsRef.current);
        setSilenceProgress(progress);

        console.log(`[Recorder] silence ${silenceElapsed}ms / ${silenceMsRef.current}ms (${Math.round(progress * 100)}%)`);

        if (silenceElapsed >= silenceMsRef.current) {
          silenceStartRef.current = null;
          setSilenceProgress(0);
          console.log('[Voice] stopRecording triggered: silence auto-stop');
          const uri = await autoStopRef.current?.() ?? null;
          onAutoStopRef.current?.(uri);
        }
      }, LEVEL_INTERVAL);

      // 5. 최대 녹음 시간 30초
      maxTimerRef.current = setTimeout(async () => {
        console.log('[Voice] stopRecording triggered: max duration');
        const uri = await autoStopRef.current?.() ?? null;
        onAutoStopRef.current?.(uri);
      }, MAX_DURATION_MS);

      return true; // 녹음 시작 성공

    } catch (e) {
      const msg = e instanceof Error ? e.message : '녹음 시작 실패';
      console.log('[Recorder] startRecording error:', msg);
      // 실패 정리: 소유권 반납이 onAbort로 부분 Recording unload+파일삭제 수행(정리 완료 대기).
      clearTimers();
      await audioSessionService.releaseMic('voice');
      setError(msg);
      setStatus('idle');
      return false;
    } finally {
      startingRef.current = false;
    }
  }, [clearTimers]);

  const cancelRecording = useCallback(() => {
    clearTimers();
    startingRef.current = false;
    // [프라이버시] recordingRef의 unload+파일삭제는 releaseMic의 onAbort가 단일 경로로
    // 수행한다(직렬화 → 다음 acquire가 unload 완료를 대기). 여기서 직접 unload하지 않아
    // '소유권 반납 후 unload 미완' 경합을 제거한다.
    audioSessionService.releaseMic('voice').catch(() => {});
    deleteAudioFile(lastUriRef.current);
    lastUriRef.current = null;
    silenceStartRef.current = null;
    audioSessionService.cleanup();
    setStatus('idle');
    setAudioLevel(0);
    setSilenceProgress(0);
    setDuration(0);
    setError(null);
  }, [clearTimers]);

  useEffect(() => {
    return () => {
      clearTimers();
      // 언마운트 → 소유권 반납(onAbort가 unload 수행, 누수 방지)
      audioSessionService.releaseMic('voice').catch(() => {});
    };
  }, [clearTimers]);

  // 앱이 백그라운드로 가면 진행 중 녹음/시작을 정리하고 마이크 소유권을 반납한다.
  // (cancelRecording이 unload + releaseMic + 상태 리셋을 모두 수행)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' && (recordingRef.current || startingRef.current)) {
        console.log('[Recorder] AppState background → 진행 중 녹음 정리 + releaseMic');
        cancelRecording();
      }
    });
    return () => sub.remove();
  }, [cancelRecording]);

  return {
    status,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    start: startRecording,
    stop: stopRecording,
    reset: cancelRecording,
    hadSpeech: () => speechMsRef.current >= minSpeechMsRef.current,
  };
}

export type RecorderStatus = MicStatus;
