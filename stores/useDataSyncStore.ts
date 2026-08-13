import { create } from 'zustand';

// 앱 바깥(위젯 등)에서 일어난 서버 변경을 화면에 알리는 신호.
//
// 왜 필요한가: 위젯에서 완료를 탭하면 대기 큐에 쌓이고, 앱이 포그라운드로 올 때
// drainPendingCompletions가 Supabase에 반영한다. 그런데 화면 리로드(useFocusEffect)는 즉시
// 일어나고 드레인은 네트워크 왕복(수백 ms)이라, **드레인이 끝나기 전에 화면이 이미 로드**되면
// 그 실행에서는 완료가 안 보이고 앱을 한 번 더 열어야 보였다.
// 드레인이 실제로 반영한 항목이 있을 때만 version을 올려, 구독 화면이 다시 조회하게 한다.
//
// 반영한 항목이 없으면 bump하지 않는다 → 불필요한 리로드 없음.
interface DataSyncStore {
  version: number;
  bump: () => void;
}

export const useDataSyncStore = create<DataSyncStore>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
