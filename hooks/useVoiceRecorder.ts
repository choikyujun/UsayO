import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import { Audio } from 'expo-av';
import { File } from 'expo-file-system';
import { MicStatus } from '../types';
import { audioSessionService } from '../services/voice/AudioSessionService';
import { deleteAudioFile } from '../services/voice/SpeechRecognitionService';
import { useRecorderTelemetryStore } from '../stores/useRecorderTelemetryStore';
import { voiceTrace } from '../services/voice/voiceTrace'; // [임시 계측 · voice-verify]

const MAX_DURATION_MS = 30_000;
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
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => void;
  start: () => Promise<void>;
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
      setStatus('idle');
      setAudioLevel(0);
    }
  }, [clearTimers]);

  useEffect(() => { autoStopRef.current = stopRecording; }, [stopRecording]);

  const startRecording = useCallback(async () => {
    const t0 = Date.now();
    setError(null);
    setSilenceProgress(0);
    lastUriRef.current = null;

    // Stage 1: 즉시 UI 피드백 (<5ms) — 사용자가 응답 느낌
    setStatus('preparing');
    console.log('[Mic] tap→preparing:', Date.now() - t0, 'ms');

    try {
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
        return;
      }

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

    } catch (e) {
      const msg = e instanceof Error ? e.message : '녹음 시작 실패';
      console.log('[Recorder] startRecording error:', msg);
      setError(msg);
      setStatus('idle');
    }
  }, []);

  const cancelRecording = useCallback(() => {
    clearTimers();
    const rec = recordingRef.current;
    recordingRef.current = null; // 즉시 null — stopRecording 동시 진입 차단
    if (rec) {
      const uri = rec.getURI(); // [프라이버시] 취소 경로: 전사 없이 버려지는 녹음 파일도 삭제
      rec.stopAndUnloadAsync()
        .then(() => deleteAudioFile(uri))
        .catch(() => deleteAudioFile(uri));
    }
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
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
    };
  }, [clearTimers]);

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
