import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── JWT signing via Web Crypto (Deno built-in, no external deps) ─────────
function b64url(buf: ArrayBuffer | Uint8Array): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function signJWT(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header  = b64url(new TextEncoder().encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body    = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const data    = `${header}.${body}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return `${data}.${b64url(sig)}`;
}

// ── Main handler ─────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { device_id } = await req.json() as { device_id?: string };
    if (!device_id || typeof device_id !== 'string' || device_id.length < 4) {
      return json({ error: 'invalid device_id' }, 400);
    }

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const jwtSecret      = Deno.env.get('SUPABASE_JWT_SECRET')!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // ── 1. Look up or create user ────────────────────────────────────────
    let userId: string;

    const { data: mapping, error: lookupErr } = await admin
      .from('device_user_mapping')
      .select('user_id')
      .eq('device_id', device_id)
      .maybeSingle();

    if (lookupErr) throw new Error(`lookup: ${lookupErr.message}`);

    if (mapping?.user_id) {
      userId = mapping.user_id;
      await admin
        .from('device_user_mapping')
        .update({ last_login: new Date().toISOString() })
        .eq('device_id', device_id);
    } else {
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email_confirm: true,
        app_metadata:  { provider: 'device', device_id },
      });
      if (createErr || !newUser.user) throw new Error(`createUser: ${createErr?.message}`);
      userId = newUser.user.id;

      const { error: insertErr } = await admin.from('device_user_mapping').insert({
        device_id, user_id: userId,
      });
      if (insertErr) throw new Error(`insert mapping: ${insertErr.message}`);
    }

    // ── 2. Issue tokens (30-day access + 30-day refresh) ─────────────────
    const now     = Math.floor(Date.now() / 1000);
    const exp30d  = now + 60 * 60 * 24 * 30;

    const baseClaims = {
      sub:  userId,
      role: 'authenticated',
      aud:  'authenticated',
      iss:  'supabase',
      iat:  now,
    };

    const [accessToken, refreshToken] = await Promise.all([
      signJWT({ ...baseClaims, exp: exp30d },             jwtSecret),
      signJWT({ ...baseClaims, exp: exp30d, type: 'refresh' }, jwtSecret),
    ]);

    return json({ access_token: accessToken, refresh_token: refreshToken, user_id: userId });
  } catch (err) {
    console.error('[device-auth]', err);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
