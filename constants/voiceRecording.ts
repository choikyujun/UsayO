// 음성 녹음 공용 상수. useVoiceRecorder(녹음 로직)와 AudioSessionService(마이크 소유권
// 게이트)가 동일 값을 참조하도록 한 곳에서 정의한다(숫자 중복 기입 금지).

// 단일 녹음의 최대 길이. 이 시간이 지나면 자동 종료된다.
export const MAX_DURATION_MS = 30_000;
