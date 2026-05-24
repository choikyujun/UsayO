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
}

export async function runVoiceFlow(
  audioUri: string,
  options: VoiceFlowOptions = {},
): Promise<VoiceFlowResult> {
  const { language = 'ko', timezone = 'Asia/Seoul', skipTTS = false } = options;

  // 1. STT 변환
  let sttResult: STTResult;
  try {
    sttResult = await speechService.transcribe(audioUri, language);
  } catch (e) {
    const message = e instanceof Error ? e.message : '음성 인식 실패';
    const type = message.includes('연결') ? 'network' : 'unknown';
    if (!skipTTS) {
      ttsService.speak(ttsService.generateErrorMessage(type === 'network' ? 'network' : 'unknown'));
    }
    return { success: false, error: { type, message } };
  }

  // 2. 무음 / 낮은 신뢰도 처리
  if (!sttResult.transcript.trim()) {
    if (!skipTTS) ttsService.speak(ttsService.generateErrorMessage('noSpeech'));
    return { success: false, error: { type: 'noSpeech', message: '음성이 감지되지 않았어요.' } };
  }

  if (sttResult.confidence < CONFIDENCE_THRESHOLD) {
    if (!skipTTS) ttsService.speak(ttsService.generateErrorMessage('lowConfidence'));
    return { success: false, sttResult, error: { type: 'lowConfidence', sttResult } };
  }

  // 3. LLM 인텐트 분류
  let intent: ClassifiedIntent;
  try {
    intent = await intentService.classify(sttResult.transcript, language, timezone);
  } catch (e) {
    const message = e instanceof Error ? e.message : '인텐트 분류 실패';
    if (!skipTTS) ttsService.speak(ttsService.generateErrorMessage('network'));
    return { success: false, sttResult, error: { type: 'network', message } };
  }

  if (intent.intent === 'UNKNOWN' || intent.confidence < CONFIDENCE_THRESHOLD) {
    if (!skipTTS) ttsService.speak(ttsService.generateErrorMessage('lowConfidence'));
    return { success: false, sttResult, intent, error: { type: 'lowConfidence', sttResult } };
  }

  // 4. TTS 재확인 메시지
  const confirmMessage = ttsService.generateConfirmMessage(intent, language);
  if (!skipTTS && confirmMessage) {
    ttsService.speak(confirmMessage);
  }

  return {
    success: true,
    sttResult,
    intent,
    confirmMessage,
  };
}
