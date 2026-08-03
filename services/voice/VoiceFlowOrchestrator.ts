import { ClassifiedIntent, STTResult } from '../../types';
import { speechService, QuotaExceededError } from './SpeechRecognitionService';
import { intentService } from './IntentClassifierService';
import { ttsService } from './TTSService';
import { VoiceServiceError, VoiceErrorCode } from './voiceErrors';

const CONFIDENCE_THRESHOLD = 0.6;

export type VoiceFlowError =
  | { type: 'permission'; message: string }
  | { type: 'network'; message: string }
  | { type: 'server'; message: string }
  | { type: 'lowConfidence'; sttResult: STTResult }
  | { type: 'noSpeech'; message: string }
  | { type: 'quotaExceeded'; used: number; limit: number }
  | { type: 'micUnavailable'; message: string }
  | { type: 'unknown'; message: string };

// 서비스 원인 타입 → 플로우 에러(UI 분기). network만 '인터넷' 계열, server·auth는 server.
export function flowErrorFromCode(code: VoiceErrorCode, message: string):
  { type: 'network' | 'server' | 'unknown'; message: string } {
  if (code === 'network') return { type: 'network', message };
  if (code === 'unknown') return { type: 'unknown', message };
  return { type: 'server', message }; // server, auth
}

export interface VoiceFlowResult {
  success: boolean;
  sttResult?: STTResult;
  intent?: ClassifiedIntent;
  confirmMessage?: string;
  error?: VoiceFlowError;
}

export interface VoiceFlowOptions {
  language?: string;
  timezone?: string;
  skipTTS?: boolean;
  prefillContext?: string;
  nearbyEventsContext?: string;
}

export async function runVoiceFlow(
  audioUri: string,
  options: VoiceFlowOptions = {},
): Promise<VoiceFlowResult> {
  const { language = 'ko', timezone = 'Asia/Seoul', skipTTS = false, prefillContext, nearbyEventsContext } = options;

  // 1. STT 변환
  let sttResult: STTResult;
  try {
    sttResult = await speechService.transcribe(audioUri, language);
  } catch (e) {
    // 쿼터 초과: TTS·모달은 호출자(HomeScreen)가 담당 → 여기선 신호만 반환(이중 발화 방지).
    if (e instanceof QuotaExceededError) {
      console.log('[VoiceFlow] 쿼터 초과 — used:', e.used, 'limit:', e.limit);
      return { success: false, error: { type: 'quotaExceeded', used: e.used, limit: e.limit } };
    }
    const message = e instanceof Error ? e.message : '음성 인식 실패';
    const code = e instanceof VoiceServiceError ? e.code : 'unknown';
    console.error('[VoiceFlow] STT 오류:', code, message);
    const err = flowErrorFromCode(code, message);
    if (!skipTTS) await ttsService.speak(ttsService.generateErrorMessage(err.type)).catch(() => {});
    return { success: false, error: err };
  }

  // 2. 무음 / 낮은 신뢰도 처리
  if (!sttResult.transcript.trim()) {
    console.log('[Voice] STT error or empty (no transcript)');
    if (!skipTTS) await ttsService.speak(ttsService.generateErrorMessage('noSpeech')).catch(() => {});
    return { success: false, error: { type: 'noSpeech', message: '음성이 감지되지 않았어요.' } };
  }

  console.log('[Voice] STT result:', JSON.stringify({ transcript: sttResult.transcript, confidence: sttResult.confidence }));

  if (sttResult.confidence < CONFIDENCE_THRESHOLD) {
    if (!skipTTS) await ttsService.speak(ttsService.generateErrorMessage('lowConfidence')).catch(() => {});
    return { success: false, sttResult, error: { type: 'lowConfidence', sttResult } };
  }

  // 3. LLM 인텐트 분류
  console.log('[Voice] LLM classifying...');
  let intent: ClassifiedIntent;
  try {
    intent = await intentService.classify(sttResult.transcript, language, timezone, prefillContext, nearbyEventsContext);
  } catch (e) {
    const message = e instanceof Error ? e.message : '인텐트 분류 실패';
    const code = e instanceof VoiceServiceError ? e.code : 'unknown';
    console.error('[VoiceFlow] 인텐트 분류 오류:', code, message);
    const err = flowErrorFromCode(code, message);
    if (!skipTTS) ttsService.speak(ttsService.generateErrorMessage(err.type)).catch(() => {});
    return { success: false, sttResult, error: err };
  }

  console.log('[Voice] LLM result:', JSON.stringify({ intent: intent.intent, confidence: intent.confidence, title: intent.title, deleteTargetQuery: intent.deleteTargetQuery, targetEventQuery: intent.targetEventQuery }));
  console.log('[VoiceFlow] CREATE 진입, ambiguous:', intent.ambiguous, '| suggestedMeridiem:', intent.suggestedMeridiem ?? 'none', '| time:', intent.startDateTime?.date ?? 'none');

  if (intent.intent === 'UNKNOWN' || intent.confidence < CONFIDENCE_THRESHOLD) {
    if (!skipTTS) ttsService.speak(ttsService.generateErrorMessage('lowConfidence')).catch(() => {});
    return { success: false, sttResult, intent, error: { type: 'lowConfidence', sttResult } };
  }

  // 4. 확인 메시지 생성 (TTS는 호출자가 담당 — 이중 재생 방지)
  const confirmMessage = ttsService.generateConfirmMessage(intent, language);

  return {
    success: true,
    sttResult,
    intent,
    confirmMessage,
  };
}
