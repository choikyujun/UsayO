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

## 3. 홈 화면 이중 소스(useSchedules / useEventsForDate) — 단일화 후속 과제

> 2026-08-05 기록. "다가올 일정 삭제 시 상단 요약 stale" 버그 수정 중 확인.

### 현재 상태
- HomeScreen은 두 데이터 소스를 병행한다:
  - `useSchedules`(allEvents, D+0~D+7) — CRUD 함수 + "다가올 일정" 목록.
  - `useEventsForDate`(monthEvents → 오늘 필터) — 상단 요약·TimeSpine·reschedule 낙관 패치.
- 모든 뮤테이션이 **두 소스를 함께 갱신**하도록 정렬해 두었다(reloadForDate+reloadSchedules
  또는 양쪽 낙관 패치). 삭제·완료(upcoming)에서 useEventsForDate를 빠뜨렸던 것이 위 버그였고
  수정 완료.
- 구조적 취약점: **새 뮤테이션을 추가할 때 한쪽 소스를 빠뜨리면 같은 버그가 재발**한다.
  두 소스가 각자 상태를 들고 있어 어긋날 여지가 상존.

### 향후 조치(별도 리팩터 — 출시 후 착수, 지시 없이 진행 금지)
- 요약·TimeSpine을 `allEvents`(useSchedules) 단일 소스에서 파생하도록 통일 검토.
- 회귀 위험이 큼: `useEventsForDate`에 요약·TimeSpine·**reschedule 낙관 패치(스냅백 방지)**·
  월 카운트(달력 점)·`loading` 스켈레톤·다수 reload 경로가 얽혀 있음. 단순 치환이 아니라
  각 소비처를 하나씩 옮기며 검증해야 함.

## 관련 코드 위치 (이중 소스)
- `screens/HomeScreen.tsx` — 두 훅 병행 + 각 뮤테이션 핸들러.
- `hooks/useEventsForDate.ts`(monthEvents·patchEvent·removeEvent) / `hooks/useSchedules.ts`(allEvents·CRUD).

## 4. 위젯·음성 실기 검증 통과 (2026-08-12, tag: v-widget-voice-verified)

> 커밋 `caa6556` 기준. 위젯 재작성(컬렉션/옵션B/스크롤/폰트) + 소음 적응형 녹음 실기 검증 완료.

### 검증 통과 항목
- **위젯 UI**: 컬렉션(과거3+오늘+7일), 빈 날 숨김(오늘 예외), 항목 형식(오전/오후·제목·장소),
  최초 오늘 위치 스크롤, 폰트 +3sp(시각 잘림 없음), 배경 투명도 기본 72%.
- **위젯 완료(옵션 B)**: 완료 원 탭 시 앱 안 열고 즉시 반영 + 대기 큐, 앱 실행 시 Supabase 동기화.
  반복(가상 인스턴스) 완료 원은 비활성.
- **위젯 갱신 트리거**: 홈 삭제(TimeSpine 즉시 커밋)·다가올 삭제·완료·이동·생성 모두 반영.
  (홈 삭제 후 위젯 반영 지연 3~4초는 런처 특성상 정상 범위로 확인됨.)
- **음성 소음 적응**: 무음 임계 = max(-40, 배경 p25 + 8dB). 최근 3초 창 p25로 floor 안정
  (running-min 붕괴 문제 해소). 조용한 환경은 -40 유지.
- **음성 안전망**: 마이크 재탭 수동 종료(말 끝남), 15초 상한 정상.

### 남은 관찰 항목 (미해결·수정 금지 — 재현/필요 시 착수)
1. **refreshWidget 중복 호출 + 레이스**: 홈 삭제 시 `timeSpineDelete` 직후 `foreground`가 연달아
   호출됨(결과는 동일하나 불필요한 중복). 여러 refreshWidget이 동시 실행되면 먼저 시작한 stale
   fetch가 나중에 도착해 덮어쓸 **이론적 레이스**가 있음. 실기에서 재현되면 refreshWidget에
   "최신 요청만 반영"하는 seq 가드를 추가한다. (현재 미재현.)
2. **위젯 완료의 서버 반영 지연(옵션 B)**: 완료는 앱 다음 실행/포그라운드 시 Supabase에 반영됨.
   앱을 오래 안 열면 다른 기기와 어긋난다(realtime 미도입 모델과 일관). 대기 큐 7일 경과 폐기.
3. **반복 일정 위젯 완료 비활성**: 가상 인스턴스는 completed_at 단일 모델로 완료 반영이 안 돼
   완료 원을 비활성 처리. 부모 매핑/인스턴스별 완료는 후속 과제.
4. **위젯 플러그인 .ts↔.js 동기화 함정**: `plugins/withYuSayWidgets/*.ts`를 고치면 컴파일된
   `.js`도 함께 갱신해야 한다(app.json은 .js를 사용). 누락 시 EAS 빌드가 "Unknown error. See
   logs of the Prebuild build phase"로만 표시돼 원인 파악이 어렵다. 로컬 `npx expo prebuild
   -p android --clean`으로 재현하면 실제 스택(예: ENOENT copy)이 드러난다.

## 관련 코드 위치 (위젯·음성)
- 위젯: `widget-extension/android/*`(provider·컬렉션 서비스·리시버·레이아웃),
  `modules/YuSayWidgetBridge/*`(브릿지), `services/widget/*`(refreshWidget·push·drain).
- 음성 무음 적응: `hooks/useVoiceRecorder.ts`(p25 floor), `constants/voiceRecording.ts`(15초 상한).
