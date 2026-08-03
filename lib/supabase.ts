import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Database } from '../types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const isBlank = (v: string | undefined): boolean => !v || v.trim().length === 0;

// EAS 빌드에 env가 안 들어가는 등 URL/KEY가 비면, createClient가 모듈 로드 중 throw해
// 앱이 아예 안 뜬다(화면 자체가 안 나옴). 설정 부재를 플래그로 노출하고 루트에서 안내
// 화면으로 분기한다. 값이 없을 때는 throw를 막기 위해 안전한 플레이스홀더로 생성만 하되,
// 안내 화면에서 멈추므로 이 클라이언트로 실제 네트워크 요청이 나가지 않는다.
const missing: string[] = [
  isBlank(supabaseUrl) ? 'EXPO_PUBLIC_SUPABASE_URL' : null,
  isBlank(supabaseAnonKey) ? 'EXPO_PUBLIC_SUPABASE_ANON_KEY' : null,
].filter((v): v is string => v !== null);

// 개발 빌드에서만 누락 변수명을 노출(변수명 자체는 비밀이 아니나 프로덕션에서는 내부 정보 최소화).
export const supabaseConfigError: string | null =
  missing.length === 0
    ? null
    : __DEV__
      ? `Supabase 환경변수 누락: ${missing.join(', ')}`
      : 'config_missing';

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

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
