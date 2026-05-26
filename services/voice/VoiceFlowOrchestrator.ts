import { ClassifiedIntent, STTResult } from '../../types';
import { speechService } from './SpeechRecognitionService';
import { intentService } from './IntentClassifierService';
import { ttsService } from './TTSService';

const CONFIDENCE_THRESHOLD = 0.6;

export type VoiceFlowError =
  | { type: 'permission'; message: string }
  | { type: 'network'; message: string }
  | { type: 'lowConfidence'; sttResult: STTResult }
  | { type: 'noSpeech'; message: string }
  | { type: 'unknown'; message: string };

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
    const message = e instanceof Error ? e.message : '음성 인식 실패';
    console.error('[VoiceFlow] STT 오류:', message);
    const isNetworkError = message.includes('Network request failed') || message.includes('연결');
    const type: VoiceFlowError['type'] = isNetworkError ? 'network' : 'unknown';
    if (!skipTTS) await ttsService.speak(ttsService.generateErrorMessage(type)).catch(() => {});
    return { success: false, error: { type, message } };
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
    console.error('[VoiceFlow] 인텐트 분류 오류:', message);
    const isNetworkError = message.includes('Network request failed') || message.includes('연결');
    const errorType: VoiceFlowError['type'] = isNetworkError ? 'network' : 'unknown';
    if (!skipTTS) ttsService.speak(ttsService.generateErrorMessage(errorType)).catch(() => {});
    return { success: false, sttResult, error: { type: errorType, message } };
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
