import { useCallback, useEffect, useRef, useState } from 'react';
import { ClassifiedIntent } from '../types';
import { speakPrefillLabel, stopPrefillTTS } from '../services/voice/tts';
import { audioSessionService } from '../services/voice/AudioSessionService';
import { useVoiceFlow } from './useVoiceFlow';

export interface VoiceInputPrefill {
  dateStr:  string;
  hour?:    number;
  minute?:  number;
  ttsLabel: string; // e.g. "오후 3시", "수요일 오후 2시", "5월 30일"
}

type OnAutoSave = (intent: ClassifiedIntent) => Promise<string | undefined>;
type OnUndo     = (eventId: string) => Promise<void>;

function buildPrefillContext(prefill: VoiceInputPrefill): string {
  if (prefill.hour !== undefined) {
    const h = String(prefill.hour).padStart(2, '0');
    const m = String(prefill.minute ?? 0).padStart(2, '0');
    return `${prefill.dateStr} ${h}:${m}`;
  }
  return prefill.dateStr;
}

export function useVoiceInput(ttsEnabled: boolean) {
  const voice = useVoiceFlow();
  const [overlayVisible, setOverlayVisible] = useState(false);
  const isTTSRef = useRef(false);

  // Hide overlay when voice reaches a terminal phase
  useEffect(() => {
    if (['confirming', 'success', 'fail', 'idle'].includes(voice.phase)) {
      setOverlayVisible(false);
    }
  }, [voice.phase]);

  const startWithPrefill = useCallback(async (
    prefill:    VoiceInputPrefill,
    onAutoSave: OnAutoSave,
    onUndo:     OnUndo,
  ) => {
    // 오버레이 즉시 표시 — 시각적 피드백 < 200ms
    setOverlayVisible(true);

    if (ttsEnabled && !isTTSRef.current) {
      isTTSRef.current = true;
      try {
        await speakPrefillLabel(prefill.ttsLabel);
      } catch { /* TTS 실패해도 계속 */ } finally {
        stopPrefillTTS();
        isTTSRef.current = false;
        await audioSessionService.releasePlaybackSession();
      }
      // 오디오 세션 핸드오프 대기 (TTS→마이크 전환)
      await new Promise<void>(resolve => setTimeout(resolve, 300));
    }

    const prefillContext = buildPrefillContext(prefill);
    voice.startVoice(onAutoSave, onUndo, prefillContext);
  }, [voice, ttsEnabled]);

  const cancelVoiceInput = useCallback(() => {
    stopPrefillTTS();
    isTTSRef.current = false;
    voice.cancelVoice();
    setOverlayVisible(false);
  }, [voice]);

  return {
    ...voice,
    overlayVisible,
    startWithPrefill,
    cancelVoiceInput,
  };
}
