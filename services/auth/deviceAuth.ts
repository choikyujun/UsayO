import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

const EDGE_FN_URL   = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/device-auth`;
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Returns a stable device identifier.
// Android: androidId — same signing key 유지 시 재설치 후에도 유지 (Android 8+)
// iOS: identifierForVendor — 앱 삭제 시 초기화됨 (같은 vendor 앱이 남아있으면 유지)
export async function getDeviceId(): Promise<{ id: string; source: string }> {
  if (Platform.OS === 'android') {
    const id = Application.getAndroidId();
    if (id) return { id, source: 'android_id' };
    throw new Error('androidId unavailable');
  }
  const id = await Application.getIosIdForVendorAsync();
  if (id) return { id, source: 'idfv' };
  throw new Error('iOS identifierForVendor unavailable');
}

// Calls the device-auth Edge Function → gets access/refresh tokens → sets session.
export async function signInWithDevice(): Promise<string> {
  console.log('[Auth] === session start ===');

  const { id: deviceId, source } = await getDeviceId();
  console.log('[Auth] device_id source:', source);
  console.log('[Auth] device_id value:', deviceId);

  const payload = { device_id: deviceId };
  console.log('[Auth] Edge Function call payload:', JSON.stringify(payload));

  const res = await fetch(EDGE_FN_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'apikey':        SUPABASE_ANON,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.log('[Auth] Edge Function error:', res.status, text);
    throw new Error(`device-auth failed ${res.status}: ${text}`);
  }

  const authResult = await res.json() as {
    access_token:   string;
    refresh_token:  string;
    user_id:        string;
    is_new_mapping?: boolean;
  };

  console.log('[Auth] Edge Function response:', JSON.stringify({
    user_id:        authResult.user_id,
    is_new_mapping: authResult.is_new_mapping,
    has_access:     !!authResult.access_token,
    has_refresh:    !!authResult.refresh_token,
  }));
  console.log('[Auth] mapped user_id:', authResult.user_id);
  console.log('[Auth] is new mapping:', authResult.is_new_mapping ?? 'unknown');

  const { error } = await supabase.auth.setSession({
    access_token:  authResult.access_token,
    refresh_token: authResult.refresh_token,
  });
  if (error) throw new Error(`setSession failed: ${error.message}`);

  console.log('[Auth] === session ready ===');
  return authResult.user_id;
}
