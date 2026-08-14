import AsyncStorage from '@react-native-async-storage/async-storage';
import { disconnectIAP } from '../../lib/iap';
import { supabase } from '../../lib/supabase';

// 계정 삭제 오케스트레이션.
// 서버(delete-account Edge Function)가 auth user + 소유 데이터를 하드 삭제한 뒤,
// 로컬 상태(온보딩 플래그·RevenueCat 연결·Supabase 세션)를 정리한다.
//
// 재인증 가드: supabase.auth.signOut()은 SIGNED_OUT 이벤트를 발생시키고,
// app/_layout.tsx의 onAuthStateChange 핸들러가 이를 "토큰 만료"로 오인해 signInWithDevice()로
// 즉시 새 계정을 만든다. 계정 삭제 직후에는 그 자동 재인증을 막아야 하므로 플래그로 스킵시킨다.
let deleting = false;
export function isAccountDeletionInProgress(): boolean {
  return deleting;
}

export class AccountDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountDeletionError';
  }
}

// 계정과 모든 소유 데이터를 영구 삭제한다.
// 실패 시 AccountDeletionError를 던지며, 이 경우 서버는 계정을 삭제하지 않았고(원자적 실패)
// 로컬 세션도 그대로 유지되어 재시도가 안전하다.
export async function deleteAccount(): Promise<void> {
  deleting = true;

  // 1. 서버 삭제 (JWT는 supabase-js가 자동 첨부). 여기서 실패하면 아무것도 정리하지 않고 중단.
  try {
    const { data, error } = await supabase.functions.invoke('delete-account');
    if (error) throw new Error(error.message || 'delete-account invoke failed');
    if (!data?.deleted) {
      throw new Error(data?.detail || data?.error || 'delete-account: 예상치 못한 응답');
    }
  } catch (e) {
    deleting = false; // 삭제 안 됨 → 가드 해제, 앱 정상 사용 유지, 재시도 가능
    throw new AccountDeletionError(e instanceof Error ? e.message : String(e));
  }

  // 2. 서버 삭제 성공 — 이후 로컬 정리는 실패해도 치명적이지 않다(계정은 이미 사라짐).
  //    온보딩 플래그 제거 → 다음 진입이 첫 실행처럼 동작.
  await AsyncStorage.multiRemove(['onboarding_complete', 'onboarding_step']).catch(() => {});

  // 3. 스토어 연결 해제 — 구매 리스너·스토어 연결을 끊는다.
  //    (RevenueCat 시절의 Purchases.logOut 대체. react-native-iap에는 '로그아웃' 개념이 없고
  //     구독은 스토어 계정에 귀속되므로, 앱 쪽 연결만 정리하면 된다. 실패해도 무시.)
  try { await disconnectIAP(); } catch { /* 미연결 — 무시 */ }

  // 4. 로컬 세션 종료. SIGNED_OUT → _layout 재인증 가드가 스킵.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {});

  // SIGNED_OUT 이벤트가 비동기로 도착하므로 잠시 가드를 유지한 뒤 해제한다.
  // (이후의 진짜 토큰 만료 재인증은 정상 동작해야 하므로 영구 유지하지 않는다.)
  setTimeout(() => { deleting = false; }, 5000);
}
