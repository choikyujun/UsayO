# 음성(마이크) 알려진 잔여 사항

> 커밋 `0737502` (태그 `v-voice-mic-lock-verified`) 기준. 실기 검증 통과 후 남긴 메모.
> **여기 적힌 것은 미해결/보류 사항이며, 지시 없이 수정하지 말 것.**

## 1. startVoice 인스턴스 이원화 (구조적 잔여 — 보류)

딥링크(위젯 `yusay://voice`) 1회에 **두 경로가 각각 다른 `useVoiceFlow` 인스턴스로**
`startVoice`를 호출한다:

- `voice-route` — expo-router가 `/voice` 라우트(`app/voice/index.tsx`)를 열며 마운트
  effect에서 자동 시작.
- `deeplink` — `app/_layout.tsx`의 딥링크 핸들러가 `router.replace('/')` 후
  `setTimeout(500)` → `triggerVoiceFromDeeplink` → HomeScreen `onVoiceTrigger` →
  `handleFabPress('deeplink')`.

### 현재 상태
- 관측상 **`voice-route`가 항상 먼저 도착**(두 호출 간격 412~508ms)하고, 두 번째는
  `useVoiceFlow`의 **시간창 dedup(1500ms)** 으로 차단된다. → 실기 6회 전부
  `Only one Recording` 0건, `tap→preparing` 딥링크당 1회.
- 즉 **기능상 문제는 없으나 근본 원인(이원화)은 남아 있다.**

### 위험
- **저사양 기기·고부하에서 도착 순서가 역전**될 가능성이 있다(예: `deeplink`가 먼저,
  `voice-route`가 뒤). dedup은 순서와 무관하게 두 번째를 막지만, **순서 역전 시
  화면 상태(어느 인스턴스가 오버레이를 그리는지)는 미검증**이다.

### 향후 조치(판단 보류)
- **출시 후 실사용 로그**(`[Voice] startVoice ← source=…`)로 실제 도착 순서·빈도를 확인한 뒤,
  한쪽 경로(가장 유력하게는 `/voice` 라우트 자동시작 또는 딥링크 타이머 트리거)를
  **제거**할지 판단한다.
- 제거 시 화면 상태(오버레이 렌더 주체) 회귀 검증 필요.

## 관련 코드 위치
- `hooks/useVoiceFlow.ts` — `startVoice(source, …)` + 시간창 dedup(`VOICE_START_DEDUP_MS`).
- `app/voice/index.tsx` — 마운트 자동시작(`voice-route`).
- `app/_layout.tsx` — 딥링크 핸들러(`setTimeout(500)`, dedup 2초).
- `screens/HomeScreen.tsx` — `onVoiceTrigger` → `handleFabPress('deeplink')`.

## 2. i18n 미구현 — 현재는 한국어 단독 (출시 범위 영향)

> 2026-08-04 기록. 무료 한도 50회 확정 작업(`7db3395`) 중 전수 조사에서 확인.

### 현재 상태
- **i18n 라이브러리가 없다**(i18next / react-i18next / expo-localization / lingui 등 미설치).
  `useTranslation`·`getLocales`·locales/ 디렉터리 등 번역 인프라도 없음.
- 모든 사용자 노출 문자열이 **한국어로 소스에 하드코딩**돼 있다(UI 라벨, 페이월 카피,
  TTS 문구, 안내/에러 메시지 등). → 현재 코드 상태로는 **한국어 단독 출시만 가능**.

### 사업 기준과의 간극
- 프로젝트 전제는 **다국어(국내+글로벌)** 였고, 언어 코드는 i18n으로 처리하기로 돼 있었다
  (CLAUDE.md 하드룰). 현 구현은 이 전제를 아직 충족하지 못한다.
- 따라서 **출시 범위(초기 한국어 한정)와 스토어 문구**에 이 점을 명시적으로 반영해야 한다.
  (다국어 지원을 암시하는 스토어 카피·스크린샷은 실제 지원 전까지 지양.)

### 향후 조치(판단 보류 — 지시 없이 착수 금지)
- **WokyToky의 13개 언어 i18n 자산 재활용 가능 여부를 별도 검토**한다(키 구조·번역 커버리지·
  라이선스·문자열 포맷 호환). 재활용 가능하면 도입 비용이 크게 준다.
- 도입 시: (a) 하드코딩 문자열을 키로 추출, (b) 한도 숫자 같은 동적 값은 보간(interpolation)으로,
  (c) TTS 문구의 언어별 조사·어순 차이 처리(예: 을/를 — 별도 known-issue 후보).

## 관련 코드 위치 (i18n)
- 전역: 사용자 노출 문자열 전반(하드코딩 한국어). 대표적으로 `components/UpgradeModal.tsx`
  (페이월 카피), `services/voice/TTSService.ts`(음성 문구), 각 `screens/*`·`components/*` 라벨.
- 참고: 무료 한도 숫자는 `constants/featureGates.ts`의 `FREE_COMMAND_LIMIT` 한 곳으로 이미 통합됨.
