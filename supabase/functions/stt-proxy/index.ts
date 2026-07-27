import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Whisper(OpenAI STT) 프록시 — API 키를 클라이언트에서 서버 secret으로 이관.
// 클라이언트는 오디오를 base64 JSON으로 보내고(verify_jwt=true + getUser로 인증),
// 서버가 base64→multipart 재구성 후 Whisper 호출. mode별 prompt 분기는 서버가 담당.
// (오디오 내용/base64/키는 절대 로그로 남기지 않음.)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions';
const SUPPORTED_LANGUAGES = ['ko', 'en', 'ja', 'th', 'id', 'vi'];

// 무료 플랜 월 음성 명령 상한 (단일 버킷). 클라이언트 featureGates.FREE_COMMAND_LIMIT와 동일 값 유지.
const FREE_COMMAND_LIMIT = 60;

// 일반 발화용 도메인 어휘 프롬프트 (constants/voiceVocabulary.ts와 동일 소스)
const CALENDAR_TERMS = [
  '잡아줘', '등록해줘', '추가해줘', '만들어줘',
  '바꿔줘', '수정해줘', '변경해줘', '옮겨줘',
  '취소해줘', '삭제해줘', '지워줘',
  '알려줘', '보여줘', '확인해줘',
  '오늘', '내일', '모레', '어제',
  '이번 주', '다음 주', '저번 주',
  '월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일',
  '오전', '오후', '아침', '점심', '저녁', '밤', '새벽',
  '정오', '자정', '퇴근 후', '출근 전',
  '시', '분', '시간', '일 후', '주 후',
  '매일', '매주', '매월', '매년',
  '평일', '주말', '격주',
  '회의', '미팅', '약속', '면담', '발표', '면접',
  '점심 약속', '저녁 약속', '출장', '워크숍', '세미나',
  '병원', '치과', '헬스장', '운동',
  '팀 회의', '팀장', '부장', '대리', '과장',
  '캘린더', '달력', '일정', '스케줄',
  '다가올 일정', '이번 달', '오늘 일정',
];
const DEFAULT_PROMPT = CALENDAR_TERMS.join(', ');

// 확인 단계 전용 프롬프트 (짧은 응답 인식률 향상)
const CONFIRM_PROMPT =
  '응. 어. 네. 그래. 맞아. 오케이. 저장. 저장해. 저장해줘. 해줘. 좋아. 아니. 아니야. 취소. 취소해. 안해. 하지마. 됐어.';

// 알림 오프셋 선택 전용 프롬프트 (짧은 시간 표현 인식률 향상)
const NOTIF_PROMPT =
  '알림 없음. 시작 시. 5분 전. 10분 전. 15분 전. 30분 전. 1시간 전. 2시간 전. 1일 전. 1주 전. 꺼줘.';

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 1. 인증
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // 2. 요청 파싱
  let payload: { audioBase64?: string; language?: string; mode?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const { audioBase64, language, mode } = payload ?? {};
  if (!audioBase64) return json({ error: 'Missing audioBase64' }, 400);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return json({ error: 'Server misconfigured: OPENAI_API_KEY' }, 500);

  // 3. mode/language 분기 (confirm·notif 모드는 항상 ko)
  const lang = (mode === 'confirm' || mode === 'notif')
    ? 'ko'
    : (SUPPORTED_LANGUAGES.includes(language ?? '') ? (language as string) : 'ko');
  const prompt = mode === 'confirm' ? CONFIRM_PROMPT
    : mode === 'notif' ? NOTIF_PROMPT
    : DEFAULT_PROMPT;

  // 3a. 오디오 디코드 먼저 — 인코딩 오류는 쿼터 카운트 이전에 걸러 손해 방지.
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(audioBase64);
  } catch {
    return json({ error: 'Invalid audio encoding' }, 400);
  }

  // 3b. 서버 사이드 쿼터 강제 — default 모드(1 음성 명령 = 1 카운트)만.
  //     confirm(확인 응답)·notif(알림 오프셋 선택)는 같은/부수 상호작용이라 검사·카운트 제외.
  const month = new Date().toISOString().slice(0, 7); // UTC 'YYYY-MM'
  let quotaInfo: { used: number; limit: number } | null = null;
  let incremented = false;

  if (mode !== 'confirm' && mode !== 'notif') {
    // 플랜 판정은 subscriptions만 신뢰(profiles.plan은 클라 수정 가능 → 사용 금지).
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('plan, status, current_period_end')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const nowMs = Date.now();
    const isPaid = !!sub
      && (sub.plan === 'pro' || sub.plan === 'team')
      && (sub.status === 'active' || sub.status === 'trial')
      && (!sub.current_period_end || new Date(sub.current_period_end).getTime() > nowMs);

    if (!isPaid) {
      const { data: q, error: qErr } = await supabase.rpc('check_and_increment_quota', {
        p_user_id: user.id, p_month: month, p_limit: FREE_COMMAND_LIMIT,
      });
      if (qErr) {
        // RPC 실패 → 가용성 우선(fail-open): 막지 않고 카운트만 스킵. 키/PII 없이 사유만 로그.
        console.error('[stt-proxy] quota rpc error:', qErr.message);
      } else if (q && q.allowed === false) {
        // 상한 초과 → 상류(Whisper) 호출 없이 즉시 차단 신호 반환.
        return json({ quotaExceeded: true, used: q.used, limit: q.limit }, 200);
      } else if (q) {
        quotaInfo = { used: q.used, limit: q.limit };
        incremented = true;
      }
    }
  }

  // 4. multipart 재구성 → Whisper 호출
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/m4a' }), 'recording.m4a');
  form.append('model', 'whisper-1');
  form.append('language', lang);
  form.append('response_format', 'verbose_json');
  if (prompt) form.append('prompt', prompt); // ampm은 빈 프롬프트 → 미첨부(에코 차단)
  // 확인 모드만 temperature=0으로 결정성 확보(환각 억제). 일반 발화는 불변.
  if (mode === 'confirm') form.append('temperature', '0');

  // 상류 실패/무음 시 증가분을 되돌리기 위한 헬퍼 (사용자가 손해 보지 않도록)
  const rollback = async () => {
    if (!incremented) return;
    incremented = false;
    await supabase.rpc('decrement_quota', { p_user_id: user.id, p_month: month }).catch(() => {});
    if (quotaInfo) quotaInfo = { ...quotaInfo, used: Math.max(0, quotaInfo.used - 1) };
  };

  let upstream: Response;
  try {
    upstream = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (_e) {
    await rollback(); // 네트워크 실패 → 카운트 롤백
    return json({ upstreamStatus: 502, body: { error: 'upstream fetch failed' } }, 200);
  }

  const text = await upstream.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  // 실패(비 2xx) 또는 무음(빈 텍스트)은 명령으로 카운트하지 않음 → 롤백.
  const okStatus = upstream.status >= 200 && upstream.status < 300;
  const transcript =
    body && typeof (body as { text?: unknown }).text === 'string'
      ? ((body as { text: string }).text).trim()
      : '';
  if (!okStatus || !transcript) {
    await rollback();
  }

  // 상류 상태 + 서버 권위 사용량(quota)을 실어 200 래핑.
  return json({ upstreamStatus: upstream.status, body, quota: quotaInfo }, 200);
});
