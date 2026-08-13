// [임시 계측 · voice-verify] 폰 검증용 파이프라인 타이밍 추적. 검증 종료 후 제거 예정.
// 녹음 종료 시점을 앵커로 잡아 DB 반영까지의 총 왕복(TOTAL)을 계산한다. 로깅 전용 — 로직 영향 없음.
let recordingEndAt = 0;
let lastDurationMs = -1;

export const voiceTrace = {
  // [VOICE][1-REC] 시점에 호출 — TOTAL 시작 앵커 + 직전 녹음 길이 보관.
  // durationMs는 [VOICE][2-STT]가 "이 전사가 몇 초짜리 녹음에서 나왔는가"를 한 줄로 보여주는 데 쓴다
  // (문장 잘림 진단: 실제 발화 길이 대비 녹음이 짧으면 중간 종료).
  markRecordingEnd(durationMs = -1): void {
    recordingEndAt = Date.now();
    lastDurationMs = durationMs;
  },
  // [VOICE][TOTAL] 시점에 호출 — 녹음 종료 이후 경과 ms (앵커 없으면 -1)
  sinceRecordingEnd(): number {
    return recordingEndAt ? Date.now() - recordingEndAt : -1;
  },
  // 직전 녹음 길이 ms (없으면 -1)
  lastRecordingDurationMs(): number {
    return lastDurationMs;
  },
};
