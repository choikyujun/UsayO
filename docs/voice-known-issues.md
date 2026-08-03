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
