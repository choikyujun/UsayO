import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { Audio } from 'expo-av';
import { MicStatus } from '../types';
import { audioSessionService } from '../services/voice/AudioSessionService';

const MAX_DURATION_MS = 30_000;
const WARMUP_MS       = 1_000;   // 녹음 시작 후 첫 1초는 무음 감지 제외
const SILENCE_DB      = -40;     // dB 기준값 (이하면 무음)
const SILENCE_LEVEL   = 0.01;    // 정규화 기준값 (이하면 무음)
const SILENCE_MS      = 3_000;   // 무음 지속 3초 → 자동 종료
const LEVEL_INTERVAL  = 100;     // 측정 인터벌 (ms)

export interface VoiceRecorderState {
  status: MicStatus;
  audioLevel: number;      // 0~1 (정규화)
  silenceProgress: number; // 0~1 (0=소리 있음, 1=3초 무음 → 자동 종료 직전)
  duration: number;        // ms
  error: string | null;
}

export interface UseVoiceRecorderReturn extends VoiceRecorderState {
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => void;
  start: () => Promise<void>;
  stop: () => Promise<string | null>;
  reset: () => void;
}

export interface VoiceRecorderOptions {
  onAutoStop?: (uri: string | null) => void;
}

export function useVoiceRecorder(options?: VoiceRecorderOptions): UseVoiceRecorderReturn {
  const [status, setStatus] = useState<MicStatus>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [silenceProgress, setSilenceProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recordingRef     = useRef<Audio.Recording | null>(null);
  const lastUriRef       = useRef<string | null>(null);
  const levelTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const maxTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTimeRef     = useRef<number>(0);
  const silenceStartRef  = useRef<number | null>(null); // 무음 시작 타임스탬프
  const autoStopRef      = useRef<(() => Promise<string | null>) | null>(null);
  const onAutoStopRef    = useRef(options?.onAutoStop);
  onAutoStopRef.current  = options?.onAutoStop;

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
        Alert.alert('마이크 권한이 필요해요', '설정 > YuSay > 마이크를 허용해주세요.', [{ text: '확인' }]);
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
      setStatus('recording');

      // 4. 100ms 인터벌: 오디오 레벨 + 무음 카운트다운
      levelTimerRef.current = setInterval(async () => {
        const rec = recordingRef.current;
        if (!rec) return;

        const st = await rec.getStatusAsync();
        if (!st.isRecording) return;

        const now     = Date.now();
        const elapsed = now - startTimeRef.current;
        setDuration(elapsed);

        const db         = st.metering ?? -160;
        const normalized = Math.max(0, Math.min(1, (db + 160) / 160));
        setAudioLevel(normalized);

        // 워밍업 기간(첫 1초) 또는 소리가 있는 경우 → 무음 타이머 리셋
        const inWarmup = elapsed < WARMUP_MS;
        const isSilent = db < SILENCE_DB;

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
        const progress = Math.min(1, silenceElapsed / SILENCE_MS);
        setSilenceProgress(progress);

        console.log(`[Recorder] silence ${silenceElapsed}ms / ${SILENCE_MS}ms (${Math.round(progress * 100)}%)`);

        if (silenceElapsed >= SILENCE_MS) {
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
      rec.stopAndUnloadAsync().catch(() => {});
    }
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
    audioLevel,
    silenceProgress,
    duration,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    start: startRecording,
    stop: stopRecording,
    reset: cancelRecording,
  };
}

export type RecorderStatus = MicStatus;
