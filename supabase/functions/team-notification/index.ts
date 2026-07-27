import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Payload shape from Supabase Realtime database webhook
interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  record: Record<string, unknown>;
  old_record: Record<string, unknown> | null;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const payload: WebhookPayload = await req.json();
  const { type, table, record } = payload;

  if (table === 'event_requests' && type === 'INSERT') {
    await notifyEventRequest(record as EventRequestRecord);
  }

  if (table === 'event_requests' && type === 'UPDATE') {
    await notifyRequestResponse(record as EventRequestRecord);
  }

  if (table === 'team_events' && type === 'INSERT') {
    await notifyTeamBroadcast(record as TeamEventRecord);
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' },
  });
});

// ── 타입 정의 ─────────────────────────────────────────────────────

interface EventRequestRecord {
  id: string;
  requester_id: string;
  target_user_id: string;
  title: string;
  start_at: string;
  status: string;
}

interface TeamEventRecord {
  id: string;
  team_id: string;
  created_by: string;
  title: string;
  start_at: string;
  scope: string;
}

// ── 알림 함수들 ───────────────────────────────────────────────────

async function notifyEventRequest(req: EventRequestRecord) {
  const { data: requester } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', req.requester_id)
    .single();

  const requesterName = requester?.name ?? '팀원';
  const startDate = new Date(req.start_at).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  await sendPushToUser(req.target_user_id, {
    title: `${requesterName}님의 일정 요청`,
    body: `"${req.title}" — ${startDate}`,
    data: { type: 'event_request', requestId: req.id },
  });
}

async function notifyRequestResponse(req: EventRequestRecord) {
  if (req.status === 'pending') return;

  const { data: target } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', req.target_user_id)
    .single();

  const targetName = target?.name ?? '팀원';
  const accepted = req.status === 'approved';

  await sendPushToUser(req.requester_id, {
    title: accepted ? '일정 요청 수락됨' : '일정 요청 거절됨',
    body: `${targetName}님이 "${req.title}"을 ${accepted ? '수락' : '거절'}했어요.`,
    data: { type: 'request_response', requestId: req.id, status: req.status },
  });
}

async function notifyTeamBroadcast(event: TeamEventRecord) {
  if (event.scope !== 'broadcast') return;

  // Get all team members except the creator
  const { data: members } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('team_id', event.team_id)
    .neq('user_id', event.created_by);

  if (!members?.length) return;

  const { data: creator } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', event.created_by)
    .single();

  const startDate = new Date(event.start_at).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
  });

  const notification = {
    title: '팀 전체 공지 일정',
    body: `${creator?.name ?? '관리자'}: "${event.title}" — ${startDate}`,
    data: { type: 'team_broadcast', teamEventId: event.id },
  };

  await Promise.all(members.map((m) => sendPushToUser(m.user_id, notification)));
}

// ── Expo Push 전송 ────────────────────────────────────────────────

async function sendPushToUser(
  userId: string,
  notification: { title: string; body: string; data: Record<string, unknown> },
) {
  // Expo push token은 profiles 또는 별도 push_tokens 테이블에 저장
  const { data: profile } = await supabase
    .from('profiles')
    .select('push_token')
    .eq('id', userId)
    .single();

  const token = (profile as { push_token?: string } | null)?.push_token;
  if (!token) return;

  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: token,
      title: notification.title,
      body: notification.body,
      data: notification.data,
      sound: 'default',
    }),
  });
}
