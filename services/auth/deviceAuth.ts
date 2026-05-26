import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

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

  const { data: authResult, error: fnError } = await supabase.functions.invoke<{
    access_token:   string;
    refresh_token:  string;
    user_id:        string;
    is_new_mapping?: boolean;
  }>('device-auth', {
    body: { device_id: deviceId },
  });

  if (fnError || !authResult) {
    let msg = fnError?.message ?? 'empty response';
    try {
      const body = await (fnError as any)?.context?.text?.();
      if (body) msg += ` | body: ${body}`;
    } catch {}
    console.log('[Auth] Edge Function error:', msg);
    throw new Error(`device-auth failed: ${msg}`);
  }

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
