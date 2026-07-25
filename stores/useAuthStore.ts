import { create } from 'zustand';

// 인증 상태 단일 소스.
// - 'pending' : 아직 인증된 세션이 확정되지 않음 → 데이터 조회를 시작하지 않는다(로딩 유지).
// - 'authed'  : 이번 부트스트랩에서 발급된 세션 확정. 조회 가능.
// - 'failed'  : 인증 확정 실패(오프라인/에러). 무한 로딩 방지를 위해 조회 훅이 로딩을 종료한다.
//
// ★ 이벤트 의존 제거: supabase.auth.onAuthStateChange를 구독하지 않는다.
//   AsyncStorage에 남은 옛 세션 복원이 부트스트랩 이전에 TOKEN_REFRESHED를 내보내면
//   그것을 authed로 오인해 인증 전 조회가 발사되는 문제가 있었다.
//   이제 authed는 오직 app/_layout 부트스트랩의 signInWithDevice(또는 익명 로그인)가
//   "이번 실행에서 발급한 세션"의 user_id로만 markAuthed 한다. → signOut 이전의 어떤
//   이벤트도 authed를 만들지 못하고, 초기 상태는 항상 'pending'으로 확정된다.
export type AuthStatus = 'pending' | 'authed' | 'failed';

interface AuthStore {
  status: AuthStatus;
  userId: string | null;
  markAuthed: (userId: string) => void;
  markFailed: () => void;
  reset: () => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  status: 'pending',
  userId: null,
  markAuthed: (userId) => set({ status: 'authed', userId }),
  // 이미 authed면 덮어쓰지 않음(뒤늦은 실패가 정상 세션을 지우지 않도록)
  markFailed: () => set((s) => (s.status === 'authed' ? s : { status: 'failed', userId: null })),
  // 부트스트랩 시작 시 호출 — Fast Refresh 등으로 살아남은 모듈 상태를 매 실행 pending에서 출발시킴.
  reset: () => set({ status: 'pending', userId: null }),
}));
