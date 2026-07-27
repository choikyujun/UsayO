import { create } from 'zustand';

// 녹음 중 100ms마다 갱신되는 고빈도 텔레메트리(레벨/무음 진행/경과).
// 화면 트리 최상위(HomeScreen)가 아니라 이 외부 스토어에 두고,
// 레벨바 등 "리프 컴포넌트"만 selector로 구독 → 100ms 리렌더를 리프에 격리.
// (recorder 내부 무음 카운터·hadSpeech 로직과 무관 — 값의 발행 대상만 여기로 옮김)
interface RecorderTelemetry {
  audioLevel: number;      // 0~1 정규화
  silenceProgress: number; // 0~1 (1=자동 종료 직전)
  duration: number;        // ms
  setLevel: (v: number) => void;
  setSilenceProgress: (v: number) => void;
  setDuration: (v: number) => void;
  reset: () => void;
}

export const useRecorderTelemetryStore = create<RecorderTelemetry>((set) => ({
  audioLevel: 0,
  silenceProgress: 0,
  duration: 0,
  setLevel: (v) => set({ audioLevel: v }),
  setSilenceProgress: (v) => set({ silenceProgress: v }),
  setDuration: (v) => set({ duration: v }),
  reset: () => set({ audioLevel: 0, silenceProgress: 0, duration: 0 }),
}));
