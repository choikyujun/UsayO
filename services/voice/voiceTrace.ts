// [임시 계측 · voice-verify] 폰 검증용 파이프라인 타이밍 추적. 검증 종료 후 제거 예정.
// 녹음 종료 시점을 앵커로 잡아 DB 반영까지의 총 왕복(TOTAL)을 계산한다. 로깅 전용 — 로직 영향 없음.
let recordingEndAt = 0;

export const voiceTrace = {
  // [VOICE][1-REC] 시점에 호출 — TOTAL 시작 앵커
  markRecordingEnd(): void {
    recordingEndAt = Date.now();
  },
  // [VOICE][TOTAL] 시점에 호출 — 녹음 종료 이후 경과 ms (앵커 없으면 -1)
  sinceRecordingEnd(): number {
    return recordingEndAt ? Date.now() - recordingEndAt : -1;
  },
};
