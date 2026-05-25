import * as Application from 'expo-application';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

const EDGE_FN_URL  = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/device-auth`;
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Returns a stable device identifier.
// Android: androidId (survives reinstall on same device, resets only on factory reset)
// iOS: identifierForVendor (survives reinstall, resets on app group removal)
export async function getDeviceId(): Promise<string> {
  if (Platform.OS === 'android') {
    const id = Application.getAndroidId();
    if (!id) throw new Error('androidId unavailable');
    return id;
  }
  const id = await Application.getIosIdForVendorAsync();
  if (!id) throw new Error('iOS identifierForVendor unavailable');
  return id;
}

// Calls the device-auth Edge Function → gets access/refresh tokens → sets session.
export async function signInWithDevice(): Promise<string> {
  const deviceId = await getDeviceId();
  console.log('[DeviceAuth] deviceId:', deviceId);

  const res = await fetch(EDGE_FN_URL, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON}`,
      'apikey':        SUPABASE_ANON,
    },
    body: JSON.stringify({ device_id: deviceId }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`device-auth failed ${res.status}: ${text}`);
  }

  const { access_token, refresh_token, user_id } = await res.json() as {
    access_token:  string;
    refresh_token: string;
    user_id:       string;
  };

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) throw new Error(`setSession failed: ${error.message}`);

  console.log('[DeviceAuth] signed in as:', user_id);
  return user_id;
}
