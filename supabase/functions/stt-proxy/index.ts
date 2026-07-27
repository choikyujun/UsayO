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

  // 3. mode/language 분기 (confirm 모드는 항상 ko)
  const lang = mode === 'confirm'
    ? 'ko'
    : (SUPPORTED_LANGUAGES.includes(language ?? '') ? (language as string) : 'ko');
  const prompt = mode === 'confirm' ? CONFIRM_PROMPT : DEFAULT_PROMPT;

  // 4. base64 → multipart 재구성 → Whisper 호출
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(audioBase64);
  } catch {
    return json({ error: 'Invalid audio encoding' }, 400);
  }

  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/m4a' }), 'recording.m4a');
  form.append('model', 'whisper-1');
  form.append('language', lang);
  form.append('response_format', 'verbose_json');
  if (prompt) form.append('prompt', prompt); // ampm은 빈 프롬프트 → 미첨부(에코 차단)
  // 확인 모드만 temperature=0으로 결정성 확보(환각 억제). 일반 발화는 불변.
  if (mode === 'confirm') form.append('temperature', '0');

  let upstream: Response;
  try {
    upstream = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
  } catch (_e) {
    return json({ upstreamStatus: 502, body: { error: 'upstream fetch failed' } }, 200);
  }

  const text = await upstream.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  // 상류 상태를 실어 200 래핑 → 클라이언트가 파싱/에러 분기를 기존과 동일하게 처리
  return json({ upstreamStatus: upstream.status, body }, 200);
});
