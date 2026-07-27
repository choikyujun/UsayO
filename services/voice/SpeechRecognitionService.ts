import { File } from 'expo-file-system';
import { STTResult } from '../../types';
import { supabase } from '../../lib/supabase';
import { useSubscriptionStore } from '../../stores/useSubscriptionStore';

// 서버 쿼터 초과 신호를 상류 오류와 구분하기 위한 전용 에러.
export class QuotaExceededError extends Error {
  used: number;
  limit: number;
  constructor(used: number, limit: number) {
    super('QUOTA_EXCEEDED');
    this.name = 'QuotaExceededError';
    this.used = used;
    this.limit = limit;
  }
}

// language 검증만 클라이언트에서 유지. Whisper 호출/키/prompt(default·confirm 분기)는 stt-proxy(서버)가 담당.
const SUPPORTED_LANGUAGES = ['ko', 'en', 'ja', 'th', 'id', 'vi'] as const;
type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

export type TranscribeMode = 'default' | 'confirm';

export class SpeechRecognitionService {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY ?? '';
  }

  async transcribeWithWhisper(audioUri: string, language: string, mode: TranscribeMode = 'default'): Promise<STTResult> {
    // SDK 54 File API (deprecated getInfoAsync/readAsStringAsync 대체).
    const file = new File(audioUri);

    // 빈 파일 업로드 방지 (오디오 세션 충돌 시 0바이트 파일 생성됨) — 무음 스킵
    try {
      if (!file.exists || file.size < 1024) {
        console.log('[STT] 녹음 파일 너무 작음 (size:', file.exists ? file.size : 0, ') → noSpeech 처리');
        return { transcript: '', confidence: 0, language };
      }
    } catch { /* File 접근 실패 시 계속 진행 */ }

    // 확인 모드는 항상 한국어로 강제(짧은 응답은 언어 추정이 흔들림).
    const lang = mode === 'confirm'
      ? 'ko'
      : (SUPPORTED_LANGUAGES.includes(language as SupportedLanguage) ? language : 'ko');

    // 오디오를 base64로 인코딩해 stt-proxy(서버)로 전송. 키/multipart/prompt는 서버가 처리.
    const audioBase64 = await file.base64();

    const { data: proxyData, error: proxyError } = await supabase.functions.invoke('stt-proxy', {
      body: { audioBase64, language: lang, mode },
    });

    // 네트워크/인증/릴레이 오류 → 상위 catch가 네트워크로 처리
    if (proxyError) {
      throw new Error('인터넷 연결을 확인해주세요.');
    }

    // 서버 쿼터 초과 → 전용 에러(상류 상태와 구분). 상류 호출 없이 즉시 반환된 신호.
    if (proxyData?.quotaExceeded) {
      const used = proxyData.used ?? 0;
      const limit = proxyData.limit ?? 0;
      useSubscriptionStore.getState().setCommandUsage(used, limit);
      throw new QuotaExceededError(used, limit);
    }
    // 서버 권위 사용량 반영 (default 모드 성공 시에만 quota가 실림)
    if (proxyData?.quota) {
      useSubscriptionStore.getState().setCommandUsage(proxyData.quota.used, proxyData.quota.limit);
    }

    // 프록시는 항상 200으로 {upstreamStatus, body} 래핑 (1단계와 동일)
    const upstreamStatus: number = proxyData?.upstreamStatus ?? 0;
    const data = proxyData?.body ?? {};
    if (upstreamStatus < 200 || upstreamStatus >= 300) {
      throw new Error(`Whisper API 오류: ${upstreamStatus}`);
    }

    const confidence = this.estimateConfidence(data.segments);

    // 환각 판별 신호 추출 (verbose_json). 확인 응답 방어용 — 일반 발화 동작엔 영향 없음.
    const segs: Array<{ no_speech_prob?: number; avg_logprob?: number; compression_ratio?: number }> =
      Array.isArray(data.segments) ? data.segments : [];
    const avg = (fn: (s: typeof segs[number]) => number) =>
      segs.length ? segs.reduce((a, s) => a + fn(s), 0) / segs.length : undefined;
    const avgLogprob = avg((s) => s.avg_logprob ?? 0);
    const noSpeechProb = avg((s) => s.no_speech_prob ?? 0);
    const compressionRatio = segs.length
      ? Math.max(...segs.map((s) => s.compression_ratio ?? 0))
      : undefined;
    const durationSec = typeof data.duration === 'number' ? data.duration : undefined;

    return {
      transcript: data.text?.trim() ?? '',
      confidence,
      language: data.language ?? lang,
      alternatives: data.segments?.slice(0, 3).map((s: { text: string; no_speech_prob?: number }) => ({
        transcript: s.text?.trim(),
        confidence: 1 - (s.no_speech_prob ?? 0),
      })),
      avgLogprob,
      compressionRatio,
      noSpeechProb,
      durationSec,
    };
  }

  async transcribe(audioUri: string, language = 'ko', options?: { mode?: TranscribeMode }): Promise<STTResult> {
    const _t0 = Date.now(); // [임시 계측 · voice-verify]
    const mode = options?.mode ?? 'default';

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
