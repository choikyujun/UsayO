import * as FileSystem from 'expo-file-system';
import { buildWhisperPrompt } from '../../constants/voiceVocabulary';
import { STTResult } from '../../types';

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const SUPPORTED_LANGUAGES = ['ko', 'en', 'ja', 'th', 'id', 'vi'] as const;
type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export type TranscribeMode = 'default' | 'confirm';

// 확인 단계 전용 프롬프트 — 한 음절 응답(응/네 등)의 인식률을 높이기 위한 예상 후보.
// 일반 일정 발화에는 절대 적용하지 않는다(문장 편향 위험).
const CONFIRM_PROMPT =
  '응. 어. 네. 그래. 맞아. 오케이. 저장. 저장해. 저장해줘. 해줘. 좋아. 아니. 아니야. 취소. 취소해. 안해. 하지마. 됐어.';

export class SpeechRecognitionService {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
  }

  async transcribeWithWhisper(audioUri: string, language: string, mode: TranscribeMode = 'default'): Promise<STTResult> {
    if (!this.apiKey) throw new Error('EXPO_PUBLIC_OPENAI_API_KEY가 설정되지 않았습니다.');

    // 빈 파일 업로드 방지 (오디오 세션 충돌 시 0바이트 파일 생성됨)
    try {
      const info = await FileSystem.getInfoAsync(audioUri);
      const size = (info as { size?: number }).size ?? 0;
      if (!info.exists || size < 1024) {
        console.log('[STT] 녹음 파일 너무 작음 (size:', size, ') → noSpeech 처리');
        return { transcript: '', confidence: 0, language };
      }
    } catch { /* FileSystem 접근 실패 시 계속 진행 */ }

    // 확인 모드는 항상 한국어로 강제(짧은 응답은 언어 추정이 흔들림).
    const lang = mode === 'confirm'
      ? 'ko'
      : (SUPPORTED_LANGUAGES.includes(language as SupportedLanguage) ? language : 'ko');

    const formData = new FormData();
    formData.append('file', {
      uri: audioUri,
      type: 'audio/m4a',
      name: 'recording.m4a',
    } as unknown as Blob);
    formData.append('model', 'whisper-1');
    formData.append('language', lang);
    formData.append('response_format', 'verbose_json');
    // 확인 모드: 예상 응답 후보 프롬프트 / 일반 모드: 기존 어휘 프롬프트
    formData.append('prompt', mode === 'confirm' ? CONFIRM_PROMPT : buildWhisperPrompt());

    const response = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Whisper API 오류: ${response.status} — ${err}`);
    }

    const data = await response.json();
    const confidence = this.estimateConfidence(data.segments);

    return {
      transcript: data.text?.trim() ?? '',
      confidence,
      language: data.language ?? lang,
      alternatives: data.segments?.slice(0, 3).map((s: { text: string; no_speech_prob?: number }) => ({
        transcript: s.text?.trim(),
        confidence: 1 - (s.no_speech_prob ?? 0),
      })),
    };
  }

  async transcribe(audioUri: string, language = 'ko', options?: { mode?: TranscribeMode }): Promise<STTResult> {
    const _t0 = Date.now(); // [임시 계측 · voice-verify]
    const mode = options?.mode ?? 'default';
    // Whisper API가 없으면 개발용 mock 반환 (확인 모드는 confirm-friendly mock)
    if (!this.apiKey) {
      console.log('[STT] API 키 없음 — mock 사용');
      const _r = mode === 'confirm'
        ? { transcript: '저장', confidence: 0.9, language: 'ko' }
        : this.mockResult();
      console.log(`[VOICE][2-STT] MODE=MOCK(${mode}) transcript=${JSON.stringify(_r.transcript)} confidence=${_r.confidence} elapsedMs=${Date.now() - _t0}`);
      return _r;
    }

    try {
      const _r = await this.transcribeWithWhisper(audioUri, language, mode);
      console.log(`[VOICE][2-STT] MODE=REAL(${mode}) transcript=${JSON.stringify(_r.transcript)} confidence=${_r.confidence} elapsedMs=${Date.now() - _t0}`);
      return _r;
    } catch (e) {
      // 오프라인 또는 API 오류 → graceful degradation
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Network') || msg.includes('fetch')) {
        throw new Error('인터넷 연결을 확인해주세요.');
      }
      throw e;
    }
  }

  private estimateConfidence(segments?: Array<{ no_speech_prob?: number }>): number {
    if (!segments?.length) return 0.7;
    const avg = segments.reduce((acc, s) => acc + (1 - (s.no_speech_prob ?? 0)), 0) / segments.length;
    return Math.round(avg * 100) / 100;
  }

  // No-op warmup hook — called at startup so the module is pre-loaded
  prewarm(): void {
    console.log('[STT] prewarm (API-based, no preload needed)');
  }

  private mockResult(): STTResult {
    const mocks = [
      '내일 오후 3시에 팀 회의 잡아줘',
      '다음 주 월요일 점심에 팀장 면담',
      '오늘 저녁 6시 운동 추가해줘',
      '내일 팀 회의 4시로 바꿔줘',
      '이번 주 일정 알려줘',
    ];
    return {
      transcript: mocks[Math.floor(Math.random() * mocks.length)],
      confidence: 0.92,
      language: 'ko',
    };
  }
}

export const speechService = new SpeechRecognitionService();
