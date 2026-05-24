import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// 음성 파일 삭제 확인 기록 — STT 완료 직후 호출
// 실제 오디오 파일은 앱 메모리에서만 처리되고 서버에 저장되지 않음
// 이 함수는 voice_log에 audio_deleted_at 타임스탬프를 기록
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return new Response('Unauthorized', { status: 401 });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return new Response('Unauthorized', { status: 401 });

  const { log_id } = await req.json();

  const { error } = await supabase
    .from('voice_logs')
    .update({ audio_deleted_at: new Date().toISOString() })
    .eq('id', log_id)
    .eq('user_id', user.id);  // RLS 이중 보호

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ deleted: true, at: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
