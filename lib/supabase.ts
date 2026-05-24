import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Database } from '../types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

/**
 * 현재 유저 ID를 반환한다.
 * - getSession() 우선 사용 (AsyncStorage, 네트워크 불필요)
 * - 세션 없으면 signInAnonymously() 시도
 * - 실패 시 에러 메시지에 실제 원인 포함 (Supabase 대시보드 미설정 등)
 */
export async function ensureAuth(): Promise<string> {
  // 1. 로컬 세션 확인 (빠름, 네트워크 없음)
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    return session.user.id;
  }

  // 2. 세션 없음 → 익명 로그인 시도
  console.log('[Auth] ensureAuth: no session, signing in anonymously...');
  const { data, error } = await supabase.auth.signInAnonymously();

  if (error) {
    // Supabase 대시보드에서 Anonymous sign-in이 비활성화된 경우:
    // error.message = "Anonymous sign-ins are disabled"
    console.log('[Auth] signInAnonymously failed:', error.message, '| status:', error.status);
    throw new Error(`인증 실패: ${error.message}`);
  }

  if (!data.user) {
    throw new Error('인증 실패: 유저 정보 없음');
  }

  console.log('[Auth] signed in anonymously:', data.user.id);
  return data.user.id;
}
