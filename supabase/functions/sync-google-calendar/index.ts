import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  try {
    // 1. 사용자 캘린더 연동 정보 조회
    const { data: integration } = await supabase
      .from('calendar_integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', 'google')
      .single();

    if (!integration) {
      return new Response(JSON.stringify({ error: 'Google Calendar not connected' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // TODO: Google Calendar API v3 연동 (PROMPT_10에서 구현)
    // const googleEvents = await fetchGoogleCalendarEvents(integration.access_token);
    // await syncEventsToSupabase(googleEvents, user.id);

    await supabase
      .from('calendar_integrations')
      .update({ last_synced_at: new Date().toISOString() })
      .eq('id', integration.id);

    return new Response(JSON.stringify({ success: true, synced: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
