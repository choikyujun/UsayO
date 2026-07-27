import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Claude(Anthropic) 프록시 — API 키를 클라이언트에서 서버 secret으로 이관.
// 클라이언트는 device-auth 세션 JWT로만 호출 가능(verify_jwt=true + getUser).
// 프롬프트/파싱은 클라이언트가 담당하고, 이 함수는 상류 호출만 대행한다.
// (요청 transcript/응답 본문은 프라이버시상 로그로 남기지 않음. 키도 로그 금지.)

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';

function json(obj: unknown, status: number): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // 1. 인증 — 유효 세션 없으면 호출 차단(키만 숨기는 게 아니라 호출 자체 제한)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Unauthorized' }, 401);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  // 2. 요청 파싱 — 클라이언트가 만든 Claude 요청 바디를 그대로 전달
  let payload: { model?: string; max_tokens?: number; system?: string; messages?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Bad request' }, 400);
  }
  const { model, max_tokens, system, messages } = payload ?? {};
  if (!model || !messages) return json({ error: 'Missing model/messages' }, 400);

  // 3. 서버 secret 키로 상류 Claude 호출
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Server misconfigured: ANTHROPIC_API_KEY' }, 500);

  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens, system, messages }),
    });
  } catch (_e) {
    // 상류 네트워크 실패 → 502로 래핑(항상 200 바디로 감싸 클라이언트가 upstreamStatus로 분기)
    return json({ upstreamStatus: 502, body: { error: 'upstream fetch failed' } }, 200);
  }

  const text = await upstream.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = { raw: text };
  }

  // 상류 상태를 그대로 실어 200으로 래핑 → 클라이언트가 4xx/5xx 분기(fallback/throw)를 정확히 재현
  return json({ upstreamStatus: upstream.status, body }, 200);
});
