import { createClient } from 'jsr:@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  try {
    const { device_id } = await req.json() as { device_id?: string };
    console.log('[device-auth] device_id:', device_id);

    if (!device_id || typeof device_id !== 'string' || device_id.length < 4) {
      return json({ error: 'invalid device_id' }, 400);
    }

    const supabaseUrl    = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey        = Deno.env.get('SUPABASE_ANON_KEY')!;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const deviceEmail = `device_${device_id}@yusay.device`;

    // ── 1. Look up or create user ─────────────────────────────────────────
    let userId: string;
    let isNewMapping = false;

    const { data: mapping, error: lookupErr } = await admin
      .from('device_user_mapping')
      .select('user_id')
      .eq('device_id', device_id)
      .maybeSingle();

    console.log('[device-auth] mapping:', JSON.stringify(mapping), '| err:', lookupErr?.message ?? null);
    if (lookupErr) throw new Error(`lookup: ${lookupErr.message}`);

    if (mapping?.user_id) {
      userId = mapping.user_id;
      console.log('[device-auth] existing user:', userId);

      // Ensure user has email for OTP generation (migrate if created by old code)
      const { data: userData } = await admin.auth.admin.getUserById(userId);
      if (!userData.user?.email) {
        console.log('[device-auth] migrating: adding email to user');
        const { error: migrateErr } = await admin.auth.admin.updateUserById(userId, {
          email: deviceEmail,
          email_confirm: true,
        });
        if (migrateErr) throw new Error(`migrate: ${migrateErr.message}`);
      }

      await admin
        .from('device_user_mapping')
        .update({ last_login: new Date().toISOString() })
        .eq('device_id', device_id);
    } else {
      console.log('[device-auth] creating new user for device:', device_id);
      const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
        email: deviceEmail,
        email_confirm: true,
        app_metadata: { provider: 'device', device_id },
      });

      if (createErr) {
        // Email already exists: mapping was deleted but auth user still remains.
        // Find the orphaned user via generateLink (returns user info without sending email).
        if (createErr.message?.toLowerCase().includes('already')) {
          console.log('[device-auth] email exists, reconnecting orphaned user...');
          const { data: orphanLink, error: orphanErr } = await admin.auth.admin.generateLink({
            type: 'magiclink',
            email: deviceEmail,
          });
          if (orphanErr || !orphanLink?.user?.id) {
            throw new Error(`find orphaned user: ${orphanErr?.message ?? 'no user'}`);
          }
          userId = orphanLink.user.id;
          console.log('[device-auth] reconnected orphaned user:', userId);
        } else {
          throw new Error(`createUser: ${createErr.message}`);
        }
      } else {
        userId = newUser.user!.id;
        console.log('[device-auth] created new user:', userId);
      }

      isNewMapping = true;
      const { error: insertErr } = await admin.from('device_user_mapping').insert({
        device_id, user_id: userId,
      });
      if (insertErr) throw new Error(`insert mapping: ${insertErr.message}`);
    }

    // ── 2. Generate magic link OTP and exchange for session ───────────────
    // Use the user's actual email (not deviceEmail) so the token is for the correct user.
    const { data: uidData } = await admin.auth.admin.getUserById(userId);
    const linkEmail = uidData.user?.email ?? deviceEmail;
    console.log('[device-auth] generating link for email:', linkEmail, '| userId:', userId);

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: linkEmail,
    });

    if (linkErr || !linkData?.properties?.hashed_token) {
      throw new Error(`generateLink: ${linkErr?.message ?? 'no token in response'}`);
    }

    console.log('[device-auth] link generated, exchanging token for session...');

    // POST /verify with no redirect_to returns JSON session directly (GoTrue behavior).
    const verifyResp = await fetch(`${supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: {
        'apikey':       anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        token_hash: linkData.properties.hashed_token,
        type:       'magiclink',
      }),
    });

    if (!verifyResp.ok) {
      const errBody = await verifyResp.text();
      throw new Error(`verifyOtp: ${verifyResp.status} ${errBody}`);
    }

    const session = await verifyResp.json() as {
      access_token:  string;
      refresh_token: string;
      user?: { id: string };
    };

    if (!session.access_token) {
      throw new Error('verifyOtp: no access_token in response');
    }

    console.log('[device-auth] session ready, user_id:', session.user?.id ?? userId);

    return json({
      access_token:   session.access_token,
      refresh_token:  session.refresh_token,
      user_id:        userId,
      is_new_mapping: isNewMapping,
    });

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
