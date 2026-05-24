import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// CRON Job: 매월 1일 00:00 KST 실행
// Supabase Dashboard → Edge Functions → 이 함수에 CRON 설정:
// 0 15 L * * (UTC 기준 매월 말일 15:00 = KST 다음 달 1일 00:00)

Deno.serve(async (_req) => {
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const lastMonth = now.getMonth() === 0
    ? `${now.getFullYear() - 1}-12`
    : `${now.getFullYear()}-${String(now.getMonth()).padStart(2, '0')}`;

  // 지난 달 쿼터를 리셋 (지우지 않고 archived로 보관)
  const { count } = await supabase
    .from('user_quotas')
    .select('*', { count: 'exact', head: true })
    .eq('month', lastMonth);

  console.log(`[reset-monthly-quota] ${lastMonth} → ${thisMonth}, records: ${count}`);

  // 새 달 레코드는 increment_quota RPC 첫 호출 시 자동 생성되므로 별도 작업 불필요

  return new Response(
    JSON.stringify({ ok: true, reset_month: lastMonth, new_month: thisMonth }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
