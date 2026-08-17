// 미구현/미배선 설정 UI를 조건부로 숨기기 위한 플래그.
// 눌러도 동작하지 않는 항목을 감춰 사용자 혼란을 막는다(삭제 아님 → 복원 가능).
//
// 복원 방법: 해당 기능을 실제로 구현/배선한 뒤 아래 값을 true로 바꾸면 UI가 다시 나타난다.
export const SETTINGS_FLAGS = {
  // 인식 언어 선택 — 현재 STT 언어는 'ko' 고정. 다국어 엔진/전달 배선 후 true.
  languageSelect: false,
  // 캘린더 연동(Google/Apple/Naver) — 현재 mock(Alert+로컬 state). 실제 OAuth+동기화 구현 후 true.
  calendarIntegration: false,
  // 온디바이스 처리 — 현재 미구현(모든 STT는 서버 Whisper). 온디바이스 STT 구현 후 true.
  onDeviceProcessing: false,
  // 알림 부가 토글(하루 전 요약/이어폰 TTS/무음 진동) — 저장만 되고 읽는 곳 없음. 배선 후 true.
  notifExtras: false,
  // 분석 데이터 수집 — 분석 SDK 없음. 수집 파이프라인 추가 후 true.
  analyticsConsent: false,
  // 개인정보처리방침/이용약관 링크 — 문서 발행 완료(2026-08-17) + Linking 연결됨.
  // URL은 constants/links.ts의 LINKS에서 관리한다.
  policyLinks: true,
} as const;
