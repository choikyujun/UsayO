import { File } from 'expo-file-system';
import { STTResult } from '../../types';
import { supabase } from '../../lib/supabase';
import { useSubscriptionStore } from '../../stores/useSubscriptionStore';
import { VoiceServiceError, classifyProxyError } from './voiceErrors';

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

// 'notif' = 알림 오프셋 음성 선택. 기존 일정 속성 변경이라 서버 쿼터 미차감(confirm과 동일 처리).
export type TranscribeMode = 'default' | 'confirm' | 'notif';

// [프라이버시] 로컬 녹음(.m4a) 파일 즉시 삭제. STT 소비 후·녹음 취소 시 모든 경로에서 호출.
// SDK 54 File API. 존재하지 않거나 실패해도 조용히 무시(파일 없음=이미 목적 달성).
export function deleteAudioFile(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch { /* 삭제 실패 무시 */ }
}

export class SpeechRecognitionService {
  // API 키는 클라이언트에 두지 않는다. Whisper 호출/키는 stt-proxy(서버 secret)가 전담.

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

    // 확인/알림 모드는 항상 한국어로 강제(짧은 응답은 언어 추정이 흔들림).
    const lang = (mode === 'confirm' || mode === 'notif')
      ? 'ko'
      : (SUPPORTED_LANGUAGES.includes(language as SupportedLanguage) ? language : 'ko');

    // 오디오를 base64로 인코딩해 stt-proxy(서버)로 전송. 키/multipart/prompt는 서버가 처리.
    const audioBase64 = await file.base64();

    // STT 타임아웃 15초. Edge 콜드스타트가 보통 8~9초라 여유를 두되, 그 이상 늘어지면 한 번만
    // 실패로 전환한다. Promise.race라 타임아웃 후 늦게 도착한 invoke 응답은 무시됨(중복 처리 방지).
    const STT_TIMEOUT_MS = 15_000;
    const { data: proxyData, error: proxyError } = await Promise.race([
      supabase.functions.invoke('stt-proxy', { body: { audioBase64, language: lang, mode } }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new VoiceServiceError('server', `stt-proxy timeout ${STT_TIMEOUT_MS}ms`)), STT_TIMEOUT_MS),
      ),
    ]);

    // 프록시 오류 → 원인 타입으로 분류해 던진다(문구는 UI가 결정).
    if (proxyError) {
      const code = classifyProxyError(proxyError);
      console.log('[STT] stt-proxy error:', (proxyError as Error).name, '→', code);
      throw new VoiceServiceError(code, `stt-proxy: ${(proxyError as Error).message ?? (proxyError as Error).name}`);
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
      throw new VoiceServiceError('server', `Whisper upstream ${upstreamStatus}`);
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
      // 이미 분류된 에러(QuotaExceeded/VoiceServiceError)는 그대로. 그 외(파일 부재 등)는
      // 문구 매칭 없이 unknown으로. (네트워크 판정은 프록시 오류 분류에서만 이뤄짐)
      if (e instanceof QuotaExceededError || e instanceof VoiceServiceError) throw e;
      throw new VoiceServiceError('unknown', e instanceof Error ? e.message : String(e));
    } finally {
      // [프라이버시] STT 전송 완료 후(성공/실패 무관) 로컬 녹음 파일 즉시 삭제.
      deleteAudioFile(audioUri);
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
}

export const speechService = new SpeechRecognitionService();
