import { createClient } from 'jsr:@supabase/supabase-js@2';

// delete-account — 인증된 사용자의 계정과 소유 데이터를 "완전(하드)" 삭제.
// 구글 플레이 필수 요건(계정 생성 앱의 앱 내 계정 삭제 경로).
//
// 삭제 전략
//  - profiles.id → auth.users(id) ON DELETE CASCADE 체인 덕분에
//    auth.admin.deleteUser(userId) 한 번이면 소유 데이터 대부분이 FK CASCADE로 삭제됨:
//    profiles, events(→event_exceptions·자식), voice_logs, subscriptions, user_quotas,
//    calendar_integrations, team_members/team_events/team_invites/event_requests,
//    schedules(레거시), device_user_mapping.
//  - 예외: teams.owner_id 는 ON DELETE SET NULL 이라 소유 팀이 고아로 남는다.
//    → auth 삭제 "전에" 소유 팀을 명시 삭제(그 팀의 members/events/invites는 팀 CASCADE로 정리).
//    (팀 정식 기능화 시 소유권 이전으로 재설계 — docs/voice-known-issues.md 후속 과제.)
//
// 원자성/실패 처리
//  - 순서: (1) 소유 팀 삭제 → (2) auth.admin.deleteUser(하드).
//  - (1) 실패 시: 즉시 중단, 아무것도 삭제되지 않음(계정·데이터 온전) → 에러 반환.
//  - (2) 실패 시: 계정 미삭제 상태로 에러 반환. 나머지는 (2)의 단일 DB 트랜잭션(FK CASCADE)이라
//    (2)가 실패하면 account/데이터도 삭제되지 않음. 재시도 안전(idempotent).
//  - Google 측 OAuth grant 정리는 범위 밖(후속 과제) — calendar_integrations는 CASCADE로 삭제됨.

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 1. 호출자 인증 (본인만 삭제 가능) ──────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'missing Authorization' }, 401);
    const token = authHeader.replace('Bearer ', '');

    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) {
      console.log('[delete-account] auth failed:', authError?.message ?? 'no user');
      return json({ error: 'unauthorized' }, 401);
    }
    const userId = user.id;
    console.log('[delete-account] request for user:', userId);

    // ── 2. 소유 팀 삭제 (owner_id SET NULL 고아 방지) ──────────────────
    // 팀 CASCADE로 team_members/team_events/team_invites/event_requests 정리.
    // 실패 시 여기서 중단 → 계정·데이터 온전.
    const { error: teamErr } = await admin
      .from('teams')
      .delete()
      .eq('owner_id', userId);
    if (teamErr) {
      console.error('[delete-account] owned-team delete failed:', teamErr.message);
      return json({ error: 'team_cleanup_failed', detail: teamErr.message }, 500);
    }

    // ── 3. 계정 하드 삭제 → 나머지 전부 FK CASCADE ────────────────────
    // 두 번째 인자 shouldSoftDelete=false: 실삭제(소프트 아님).
    const { error: delErr } = await admin.auth.admin.deleteUser(userId, false);
    if (delErr) {
      console.error('[delete-account] auth.deleteUser failed:', delErr.message);
      // 계정 미삭제 상태. 클라이언트가 재시도 가능(idempotent).
      return json({ error: 'account_delete_failed', detail: delErr.message }, 500);
    }

    console.log('[delete-account] deleted user:', userId);
    return json({ deleted: true });

  } catch (err) {
    console.error('[delete-account]', err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
