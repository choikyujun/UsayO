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
  → **이 시점 방식은 이후 결함이 발견돼 교체됐다. 현재 방식과 전체 이력은 5-4 참조.**
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

## 5. 확인 카드 자동 저장·재시도 안내 수정 (2026-08-xx) + 잔여 관찰

> 확인 카드 3초 카운트다운 병렬화 + 자동 재시도 실패 안내 억제 + STT 타임아웃 수정 중 기록.

### 남은 관찰 항목 (미해결·수정 금지 — 원인 확인 시 착수)
5. **녹음 파일 <1024바이트 즉시 noSpeech**: `SpeechRecognitionService`가 파일 크기 1024바이트
   미만이면 Whisper 호출 없이 즉시 noSpeech 처리한다(0바이트 파일 방어). 실사용에서 정상 발화인데도
   이 판정이 나오면, 녹음이 데이터 없이 만들어진 것 — 오디오 세션 글리치(선점/재초기화), 마이크
   재탭(A)이 시작 직후 너무 빨리 종료, 또는 소음 적응(C)이 초기 순간 무음에서 조기 auto-stop한
   경우가 후보. 지금은 자동 1회 재시도가 '조용히' 이를 흡수하도록 수정했으나(안내 억제), 애초에
   빈 녹음이 생기는 근본 원인은 미규명 — 실기 로그(녹음 크기·시작~종료 간격)로 재현 시 조사한다.
   현재는 미수정.
6. **STT 콜드스타트 ~8~9초**: stt-proxy Edge Function 유휴 후 첫 호출이 느림. 타임아웃 15초를
   두었고(초과 시 1회 안내 + 늦은 응답 무시), warmup 핑은 아직 미도입 — 실사용에서 반복되면
   부트스트랩/포그라운드 warmup으로 대응(별건).

## 관련 코드 위치 (위젯·음성)
- 위젯: `widget-extension/android/*`(provider·컬렉션 서비스·리시버·레이아웃),
  `modules/YuSayWidgetBridge/*`(브릿지), `services/widget/*`(refreshWidget·push·drain).
- 음성 무음 적응: `hooks/useVoiceRecorder.ts`(p25 floor), `constants/voiceRecording.ts`(15초 상한).

## 5-1. 확인 카드 카운트다운 공용화 (2026-08-13, tag: `v-pre-multiconfirm-countdown` 직후)

> 복수 확인 카드(MultiConfirmCard)에 자동 저장 카운트다운이 없어, 무응답 시 자동 저장되지 않고
> "저장할까요? 저장 또는 취소라고 말해주세요"로 재질문되던 문제 수정.

- 확인 음성 루프(확인 TTS 종료 대기 → 마이크 오픈 → 3초 카운트다운 ∥ 녹음 → confirm-mode STT
  판정 → 재질문/버튼 대기)를 **`hooks/useConfirmVoiceLoop.ts` 단일 훅**으로 추출.
  단일/복수 카드가 같은 훅을 호출하므로 카운트다운·재질문 한도·레코더 파라미터
  (`silenceMs 2000` / `speechWarmupMs 300` / `minSpeechMs 300`)가 항상 함께 움직인다.
- **왜 VoiceConfirmLayer가 아니라 훅인가**: 그 층에 두면 음성 루프가 필요 없는 하이브리드(텍스트)
  `ConfirmCard` 경로에서도 훅이 무조건 실행된다(훅은 조건부 호출 불가 → 마이크가 열림).
  렌더 분기는 계속 레이어가, 루프는 훅이 소유한다.
- 안내 문구 길이 차이("2개 일정 저장할까요?"가 더 짧음)는 타이밍에 영향 없음 —
  `waitForNextSpeechToFinish`가 **실제 발화의 종료 이벤트**에 바인딩되므로 카운트다운
  기준점(마이크 오픈 직후)은 단일/복수가 동일하다.
- 부수 변경: 복수 카드의 **카드 본문 탭이 '취소'에서 '카운트다운 일시정지'로** 바뀌었다
  (단일 카드와 동일). 취소는 배경 탭 또는 취소 버튼. 목록을 읽는 동안 취소되던 동작 제거.

## 5-2. "취소"가 저장으로 뒤집히던 회귀 수정 — 확정 지점 단일화 (2026-08-13, tag: `v-pre-cancel-regression` 직후)

> 증상: 확인 카드 카운트다운 중 "취소"라고 말했는데 저장됨. 훅 추출과는 무관한 **구조적 레이스**로,
> 카운트다운이 도입된 시점부터 존재했다(추출 전후 판정 로직은 기계적 diff로 동일 확인).

### 원인
확정 지점이 둘(3.0초 벽시계 카운트다운 / 3.5초 STT)이었고, 앞선 카운트다운이 **300~600ms 지연되는
지표**로 단독 확정했다. `hadSpeech`는 `speechWarmupMs 300`(집계 제외 구간) + `minSpeechMs 300`(누적
요구) 때문에 발화 시작 S에서 빨라야 S+300ms에 true가 된다. ⇒ **t≈2.7초 이후 발화는 만료 시점에
감지 불가**. 화면에는 그때 "1초 후 저장"이 떠 있어 UI가 사각지대로 발화를 유도했다.
게다가 `resolve('confirm')`이 `confirmedRef`를 잠그고 녹음을 폐기해, 그 "취소" 발화는 **전사조차
되지 않았다**(로그에 판정 실패조차 남지 않는 이유).
공범: 확인 레코더에 `onAutoStop`을 연결하지 않아, 레코더가 t≈3.0초에 스스로 무음 종료하고
마이크를 닫아도 아무도 몰랐다 → 그 이후 발화는 녹음되지도 않음.

### 수정 (안전 규칙)
- **자동 저장의 근거는 단 하나**: 레코더가 "2초 연속 무음"을 실측해 스스로 종료했을 때(`onAutoStop`).
  **벽시계 타이머는 어떤 경우에도 저장을 확정하지 않는다.** 확정 지점은 `decide()` 하나.
- 카운트다운은 '침묵이 이어지는 중'이라는 **예고 표시**일 뿐, 만료해도 아무것도 확정하지 않는다.
- 100ms 폴링으로 발화 감지 즉시 카운트다운 무력화 → 이후 판정은 STT만 신뢰(감지 지연 1초 → ~100ms).
- 무음을 확인하지 못한 환경(지속 소음)은 **저장하지 않고 재질문**한다 — 잘못 저장하는 것보다 안전.
- 화면 표시: `N초 후 저장` → (발화 감지) `듣는 중` → (녹음 종료) `확인 중`. 사용자가 화면만 보고
  자기 발화가 인식됐는지 안다. 두 카드가 `ConfirmCardFooter`를 공용해 표시 규칙도 단일화.

### 타이밍(백스톱 상향의 영향)
| 상황 | 종료 트리거 | 카드 체류 | 자동 저장 |
|------|-------------|-----------|-----------|
| 조용 + 무응답 | 무음 auto-stop t≈3.0s | ~3.1–3.3s | **함** (기존과 동일) |
| 조용 + 발화 | 발화 종료 +2초 무음 | 발화종료+2s → STT | 안 함(STT 판정) |
| 소음 지속 + 무응답 | 백스톱 4.0s | 4.0s 후 재질문 | **안 함** |
| 소음 지속 + 발화 | 백스톱 8.0s | 8.0s + STT | 안 함(STT 판정) |

- 최악(소음+발화+STT 콜드스타트): 8.0s + STT 최대 15s(타임아웃) ≈ 23s. 통상은 8.0s + 1~3s.
  이 구간 내내 화면은 `듣는 중` → `확인 중`을 표시하므로 멈춘 것처럼 보이지 않는다.
- 자동 저장이 일어나는 최대 시각은 **~3.3초**로 기존과 동일하다. 8초 백스톱은 '발화가 감지된
  경우'에만 도달하며, 그 경로는 저장이 아니라 STT 판정으로 간다.

## 5-3. 확인 카드 중복 렌더 제거 (동일 커밋)

`voice.phase`가 전역 스토어인데 `DayView/WeekView/MonthView`가 `VoiceConfirmLayer`를 쓰지 않고
카드를 직접 렌더했다. `day/week/month`는 스택 라우트라 그 아래 홈이 계속 마운트된 상태 →
**확인 카드 2개 = 레코더 2개**. 뒤늦은 쪽은 `acquireMic`에 실패하는데, 회귀 이전 코드는
`startRecording()`의 반환값을 버려서 **녹음 없이 카운트다운만 돌다 3초 뒤 자동 저장**했다.

- 세 화면을 `VoiceConfirmLayer`로 통일(확인 카드 렌더 진입점이 홈/`/voice` 포함 한 곳으로 수렴).
- `VoiceConfirmLayer`에 `useIsFocused()` 가드 추가 — **포커스된 화면만** 카드를 렌더한다.
  통일만으로는 두 화면이 각자 레이어를 렌더해 중복이 남기 때문에 가드가 함께 필요하다.
- 부수 효과: 세 화면도 이제 하이브리드(텍스트) 입력 시 `ConfirmCard`(정적 버튼)로 라우팅된다.
  이전에는 텍스트 확인인데도 `InlineConfirmCard`가 떠 마이크가 자동으로 열렸다.

## 5-4. 긴 발화 잘림·쪼개짐 수정 (2026-08-13, tag: `v-pre-speech-fix` 직후)

> 증상: 복수 일정처럼 긴 문장을 말하면 앞/뒤가 잘리고, 한 발화가 두 녹음으로 쪼개지며,
> 무관한 환각("날씨였습니다")이 섞였다. 별개의 두 결함이 연쇄한 것.

### 원인 A — 소음 적응 임계가 **사용자 발화 자체로** 상승 (문장 끝 잘림)
floor(p25) 추정 창에 발화 샘플이 그대로 들어가, 말을 이어가면 창이 발화 레벨로 채워져 floor가
'배경'이 아니라 **'내 목소리의 하위 25%'** 가 됐다. 임계 = floor+8dB가 사용자 목소리보다 높아지면
평범한 말소리가 무음으로 집계되고 1.5초 뒤 auto-stop → 문장 중간에서 녹음 종료.
"쉼이 1초 미만이었다"와 모순되지 않는다 — **실제로 쉰 게 아니라 말하는 중에 무음으로 오판**된 것.
긴 발화에서만 재현되는 이유: 창이 30샘플(3초)이라 3초 이상 이어져야 floor가 충분히 오르고,
목소리가 잦아드는 1.5초 구간이 생길 확률이 길이에 비례한다. 이론상 최소 발생 시각은
warmup 1000ms + silence 1500ms = 2.5초 이후.

**수정**: floor 추정 창에 **'무음 후보'만** 넣는다(직전 틱 임계 이상 = 발화로 판정된 샘플 배제).
- 표본이 마르면(긴 발화) **마지막 안정 floor를 유지**한다(`lastFloorRef`).
- running-min 붕괴 방지 장치는 그대로: 무효(-90 이하) 필터, p25 백분위, 하한 `SILENCE_DB`.
- 배경 자체가 오른 경우(에어컨·TV)를 위해 **임계 초과가 10초 연속**이면 배경 상승으로 보고 창을
  비우고 3초간 재학습한다. 사람 발화는 어절 사이마다 임계 아래로 내려가 연속이 끊기므로
  이 경로로 들어가지 않는다(= 발화는 floor를 올리지 못한다).
- 검증 로그: `floor=…(p25 n=… excluded=… [held]) thr=…`. **3초 이상 말해도 thr이 상승하지 않아야
  한다.** 어절 사이 dip이 창에 쌓여 thr이 몇 dB(예: -40 → -37) 오르는 것은 정상 — 발화 레벨
  (-25 내외)과는 여전히 큰 격차이며, p25가 하위 25%라 진짜 배경 샘플이 바닥을 붙든다.
- 부수 효과(의도됨): 임계가 낮게 유지되므로 확인 카드의 "2초 연속 무음" 신호가 더 신뢰할 수
  있게 되고, `hadSpeech` 감지도 민감해진다(취소 발화 감지에 유리).
- 트레이드오프: 녹음 **도중** 배경이 급상승하면 10초 재학습 전까지 무음 판정이 안 나 15초 상한까지
  갈 수 있다. 창은 녹음마다 초기화되므로 다음 녹음에서 즉시 재학습된다.

### 소음 적응 임계 — 수정 이력 (같은 곳을 두 번 고쳤다)

`useVoiceRecorder.ts`의 무음 임계 = `max(SILENCE_DB(-40), floor + 8dB)`. 이 `floor`(배경 레벨)를
어떻게 추정하느냐가 세 번 바뀌었다. **다음에 이 코드를 고칠 때 아래 두 실패를 다시 밟지 말 것.**

1. **1차 — running-min**: floor를 최근 최소값으로 추정.
   → 말 중간의 순간 무음·무효 샘플에 끌려 **하한으로 붕괴**. 임계가 -40에 붙어 소음 환경에서
   무음 판정이 아예 안 됐다.
2. **2차 — p25 백분위 전환** (tag `v-widget-voice-verified`): 최근 3초(30샘플) 창의 하위 25백분위.
   붕괴는 해소. 그러나 **창에 발화 샘플이 그대로 들어가는 것**을 놓쳤다 → 긴 발화에서 floor가
   '내 목소리의 하위 25%'로 올라가고 임계가 목소리를 넘어 **말하는 중에 무음 판정**(문장 끝 잘림).
   짧은 발화에서는 창(3초)이 차기 전에 끝나 드러나지 않았다.
3. **3차 — 발화 샘플 배제 (현재)**: 창에 넣을지를 **직전 틱의 임계**로 판정해 무음 후보만 넣는다.
   - 표본이 마르면(긴 발화) **마지막 안정 floor 유지**(`lastFloorRef`).
   - 배경 자체가 오른 경우(에어컨·TV)를 위해 **임계 초과 10초 연속**이면 창을 비우고 3초 재학습.
     사람 발화는 어절 사이마다 임계 아래로 내려가 연속이 끊기므로 이 경로에 들어가지 않는다.
   - 1차의 붕괴 방지 장치(무효 -90 필터, p25, 하한 `SILENCE_DB`)는 전부 유지.

**교훈**: floor 추정을 바꿀 때는 (a) 조용한 방 무응답, (b) 소음 환경 무응답, (c) **3초 이상 연속
발화** 세 가지를 모두 봐야 한다. 2차 수정은 (c)를 보지 않아 통과했다.

**트레이드오프(수용함)**: 녹음 **도중** 배경이 급상승하면 10초 재학습 전까지 무음 판정이 나지 않아
15초 상한까지 갈 수 있다. 창은 **녹음마다 초기화**되므로 다음 녹음에서는 첫 ~500ms에 즉시
재학습된다. 발화를 잘못 끊는 것보다 안전한 방향이라 이대로 둔다.

### 원인 B — 저신뢰 시 '조용한' 자동 재녹음 (발화 쪼개짐·앞부분 유실)
`confidence < 0.6`이면 **안내 없이** 곧바로 `startRecording()`을 다시 호출했다. 사용자는 재시도를
모른 채 한 문장을 계속 말하는 중이라, 재시도 녹음이 발화 중간부터 잡혀 앞부분이 통째로 사라졌다.
STT+분류에 걸리는 2~5초 동안은 마이크가 닫혀 있어 그 구간은 어디에도 남지 않는다(중간 유실).

**수정**: 재시도 전에 짧게 알린다(`RETRY_PROMPT = '다시 한번 말씀해 주세요.'`).
- **실패 안내와 재시도 안내를 구분한다.** 실패 안내("잘 못 들었어요…")는 여전히 억제한다 —
  자동 재시도가 성공할 수 있는데 실패부터 말하는 혼란을 막기 위한 원래 의도는 유지. 다만
  **실제로 다시 들을 때는 반드시 알린다**.
- 안내 TTS가 **끝난 뒤에** 마이크를 연다(안내가 녹음에 섞이는 것 방지). 안내 중 취소되면 재녹음 안 함.
- `phase='listening'` 전이도 마이크를 실제로 여는 시점으로 미뤘다(워치독 6초 오탐 방지).

### 원인 C — 환각("날씨였습니다")
원인 B의 부산물(사용자가 이미 말을 멈춘 뒤 조용히 열린 빈 녹음). 별도 조치 없음 — B 수정으로
빈도가 줄어야 한다. 재현되면 known-issue 5번의 `<1024바이트 즉시 noSpeech` 항목과 함께 본다.

### 실기 검증 결과 (2026-08-13, 릴리스 APK)
- 복수 일정 긴 문장이 **한 번에 인식**됨(잘림·쪼개짐 재현 안 됨).
- 짧은 발화 회귀 없음. 확인 카드(자동 저장·취소 발화) 회귀 없음.

### 로그 보강 (진단용)
- `[VOICE][1-REC] bytes=… durationMs=… reason=… peakDb=… avgDb=… floor=… thr=… excluded=…`
  — `reason`은 `silence-auto-stop | max-duration | manual`. "왜 여기서 끊겼는가"를 즉시 판별.
- `[VOICE][2-STT] … recMs=… chars=…` — 전사가 몇 초짜리 녹음에서 나왔는지 한 줄로 대조.
- `[VoiceFlow] 재시도 시작 — 직전 stop 이후 …ms (이 구간 발화는 녹음되지 않음)` — 유실 구간 길이.
- `[Recorder] 배경 상승 감지(…) → floor 재학습` — 재학습 경로 진입 시.

## 관련 코드 위치 (긴 발화)
- `hooks/useVoiceRecorder.ts` — floor 추정 창(무음 후보만), 재학습, 레벨 통계·종료 사유 로그.
- `hooks/useVoiceFlow.ts` — 저신뢰 재시도 경로(`RETRY_PROMPT`, 안내 후 마이크 오픈).
- `services/voice/VoiceFlowOrchestrator.ts` — `CONFIDENCE_THRESHOLD = 0.6`.
- `services/voice/voiceTrace.ts` — 직전 녹음 길이·종료 시각 보관(로그 상관용).

## 5-5. 위젯 최초 스크롤이 오늘로 안 가던 문제 (2026-08-13, tag: `v-pre-widget-scroll` 직후)

> **이 절의 수정은 이후 폐기됐다.** 여기서 고친 것(플래그 소모)은 실재하는 결함이었지만,
> 그것만으로는 증상이 낫지 않았다. 진짜 벽은 API 계약이었고 스크롤 방식 자체를 버렸다 → **5-7 참조.**

> 증상: 위젯을 새로 배치하면 과거 일정이 맨 위에 보인다. `af767ee`(최초 렌더 시 오늘 위치로
> 스크롤) 당시엔 동작했고 `caa6556`(tag `v-widget-voice-verified`)에서도 검증 통과했다.

### 원인 A — 데이터가 없는데 '스크롤함' 플래그를 소모 (결정적)
`update()`가 데이터 유무와 무관하게 `setScrollPosition(list, load()?.todayIndex ?: 0)`을 쏘고
곧바로 `scrolled_$id = true`를 저장했다. **위젯을 처음 배치하는 시점에는 앱이 아직 데이터를
push하기 전이라 `load()`가 null** → 인덱스 0으로 스크롤(=맨 위, 과거)한 뒤 플래그만 소모됐다.
나중에 데이터가 들어와도 '이미 스크롤함'으로 판정돼 영영 오늘로 가지 않는다.

이전에 동작한 이유: 그때는 앱이 이미 데이터를 push한 적이 있어 prefs에 값이 남아 있었고,
위젯 배치 시 `load()`가 정상 데이터를 돌려줬다. **패키지명 변경(`com.yusay.app` →
`com.usayo.app`, `0198e51`)으로 prefs 이름(`com.usayo.app.widget`)이 새로 시작되면서**
"데이터 없는 상태로 첫 배치" 경로가 처음 밟혔고, 그때 결함이 드러났다.

### 원인 B — 데이터가 채워지기 전에 스크롤 (구조적)
`setScrollPosition`이 `setRemoteAdapter`와 같은 RemoteViews에 담겨 나가, 리스트에 데이터가
채워지기 전에 적용된다. `onUpdate`도 `update()`를 전부 돌린 **뒤에**
`notifyAppWidgetViewDataChanged`를 호출하므로 순서상 항상 데이터보다 앞선다.

### 확인했으나 원인이 아니었던 것 — `todayIndex` 계산
빈 날 숨기기(`bb85a50`)가 인덱스를 어긋나게 했는지 확인했으나 **정상**이다.
`if (isToday) todayIndex = rows.length`가 헤더 push **직전**에 실행되고, 빈 날은 같은 반복
안에서 `rows.pop()`으로 헤더를 즉시 제거하므로 오늘 차례가 올 때 `rows.length`는 정확하다.

### 수정
- **플래그는 데이터가 실제로 채워진 뒤에만 세운다.** provider는 `rows > 0`일 때만 스크롤을
  시도하고 플래그는 건드리지 않는다. 플래그 소유자는 `WidgetListFactory`.
- **팩토리가 데이터 로드 직후 한 번 더 확실히 적용한다**: `onDataSetChanged`에서
  400ms 뒤 `partiallyUpdateAppWidget`으로 스크롤 액션만 보낸다(다른 뷰 건드리지 않음).
  실패하면 플래그를 세우지 않아 다음 갱신에서 재시도한다.
- **`onDeleted`에서 `scrolled_$id`를 지운다.** appWidgetId는 재사용되므로, 남겨두면 같은 id로
  새로 배치했을 때 '이미 스크롤함'으로 판정돼 오늘로 가지 않는다.
- 로그: `[Widget] scroll → position=N (rows=M, todayIndex=K) stage=provider|factory`.

### 함정 (다음에 이 코드를 만질 때)
- `update()` 안에서 지역 변수명 `data`를 쓰면 아래 `Intent.apply {}` 블록의 `data =`
  (=`Intent.setData`)를 가려 컴파일이 깨진다. 실제로 밟았다 — `widgetData`로 명명.
- `widget-extension/android/*.kt`가 소스이고 `android/`는 gitignore + prebuild 산출물이다.
  고친 뒤 prebuild(또는 동일 파일 복사)로 동기화하지 않으면 **빌드에 반영되지 않는다.**
  (known-issue 4번의 플러그인 `.ts↔.js` 동기화 함정과 같은 계열.)

## 5-6. 위젯 완료 탭이 앱을 여는 문제 — 계측 우선 (2026-08-13)

> 증상: ① 완료 원 탭 → 앱이 열림(옵션 B는 앱을 안 여는 게 목적) ② 열린 앱에는 완료 미반영
> ③ 위젯으로 돌아가면 위젯에는 완료 표시 ④ 앱을 다시 열면 완료 반영됨.

### 코드로 확인한 것 — 의심 지점은 전부 정상이었다
패키지명 변경이 어긋뜨렸는지 전수 확인했으나 **모두 정상**이다. (스크롤 문제와 달리 여기서는
패키지 변경이 원인이 아니다.)
- 템플릿은 `getBroadcast`(+`FLAG_MUTABLE`)로 `WidgetActionReceiver`를 명시 지정. `getActivity` 아님.
- 매니페스트에 `.widget.WidgetActionReceiver`(exported=false) 등록됨. PendingIntent는 생성자
  (=앱) 권한으로 발송되므로 exported=false여도 정상 수신된다.
- fill-in은 `event_body`=`action=open`, `event_check`=`action=complete`로 분리돼 있고,
  레이아웃상 둘은 **형제**라 겹치지 않는다(`event_check`가 `event_body` 안에 있지 않음).
- `widget-extension/android/*` ↔ prebuild 산출물 `android/*` 전 파일 동일(스테일 사본 아님).
- 헤더의 add/mic 버튼은 리스트와 겹치지 않는다(레이아웃상 오버레이 없음).
- 리시버의 `complete` 분기에는 `startActivity`가 없다.

즉 **완료 원을 정확히 눌렀다면 앱이 열릴 경로가 코드에 없다.** 가장 유력한 설명은 탭이
`event_check`(34dp)가 아니라 그 왼쪽 `event_body`에 떨어진 것(=`action=open`)이다.

### 조치
1. **분기 계측**(원인 확정용): `[WidgetAction] received action=… eventId=… done=…` +
   분기별 로그(`→ open 분기(앱 실행)` / `→ complete 분기(앱 안 엶)` / `→ 분기 없음`).
   - `action=open`이 찍히면 → 오탭(행 본문). 아래 2번으로 완화.
   - `action=complete`가 찍혔는데도 앱이 열리면 → **원인은 이 리시버 바깥**. 다시 조사할 것.
   - `action=null`이면 → fill-in extra 미전달(템플릿/필인 불일치) 쪽을 판다.
2. **오탭 완화**: `event_check` 폭 34dp → 44dp(높이 34dp 유지 — 높이를 키우면 보이는 항목 수가
   준다). `event_body`가 weight=1이라 제목 영역만 그만큼 줄어든다.

### ②④에 대한 메모 (별도 수정 안 함)
`drainPendingCompletions`는 이미 앱 시작(`auth-ready`)과 **포그라운드 복귀**(`AppState active`)에서
돈다. 다만 드레인은 Supabase 왕복(수백 ms)이고 화면 리로드는 즉시 일어나므로, **드레인이 끝나기
전에 화면이 이미 로드**되면 그 실행에서는 완료가 안 보이고 다음 실행에서 보인다(=②④).
①이 해결되면 앱이 열리지 않으므로 ②는 사라진다. 드레인 완료 후 화면 리로드를 트리거하는 것은
별건 개선 과제로 남긴다(지시 없이 착수 금지).

## 5-7. RemoteViews 스크롤 포기 — 데이터 순서로 해결 (2026-08-13, tag: `v-pre-widget-order` 직후)

> **결론: 위젯 리스트를 '오늘 위치로' 스크롤하는 기능을 폐기했다.** 대신 오늘을 항상 첫 row에
> 두는 데이터 순서로 바꿨다. 다시 스크롤로 해결하려 들지 말 것 — 아래 이유로 불가능하다.

### 왜 불가능한가 (API 계약)
`RemoteViews.setScrollPosition(viewId, position)`은 내부적으로 `AbsListView.smoothScrollToPosition`
이고, 그 계약은 **"해당 항목이 보이게(displayed) 한다"** 이지 **최상단 정렬이 아니다.**
- 목표 항목이 **이미 화면 안이면 아무 일도 하지 않는다(no-op).**
- 아래쪽 항목으로 갈 때는 최소 스크롤만 하므로 **하단에 걸린다.**
RemoteViews에는 `setSelection`/`scrollToPositionWithOffset` 같은 상단 정렬 API가 노출돼 있지 않다.

### 두 번 조용히 깨진 이력
1. **1차(`af767ee` 직후 ~ `caa6556`)**: 동작했다. 당시엔 빈 날도 헤더+"일정 없음"을 차지해
   `todayIndex ≥ 6`이었고, 화면 밖이라 스크롤이 실제로 일어났다.
2. **2차(`bb85a50` 빈 날 숨기기)**: `todayIndex`가 작아져(실측 **2**) **화면 안으로 들어왔다**
   → `smoothScrollToPosition(2)`가 no-op. **인덱스 계산은 정상인데** 기능만 조용히 죽었다.
   위젯 크기 `minHeight=250dp`에서 헤더(~50dp)를 빼면 리스트 ~195dp, 행 ~34dp → 5~6행이 보인다.
3. **3차(`0198e51` 패키지명 변경)**: 별개 결함이 겹쳤다 — 데이터가 없는 첫 배치에서
   `scrolled_$id` 플래그만 소모(5-5). 이걸 고쳐도 2차 원인이 남아 여전히 안 됐다.

실측 로그(수정 후에도 실패):
```
scroll → position=2 (rows=16, todayIndex=2) stage=provider
scroll → position=2 (rows=16, todayIndex=2) stage=factory   ← 호출은 정상, 화면은 그대로
```
**두 번 다 "호출은 성공, 효과는 없음"이라 로그만 봐서는 정상으로 보였다.** 이것이 조용히
깨진 이유이고, 스크롤 방식을 폐기한 결정적 근거다.

### 대신 채택한 것 — 데이터 순서
```
오늘 · 8월 13일 수요일   ← 항상 rows[0]
  (현재 시각 선, 오늘 일정)
8월 14일 …앞으로 7일…
지난 일정                ← 구분 행(과거 일정이 하나도 없으면 넣지 않음)
8월 12일  ← 어제부터 역순(어제→그제→그끄제): 방금 놓친 일정이 구분선 바로 아래
8월 11일
```
- 스크롤 API를 전혀 쓰지 않으므로 런처·타이밍에 좌우되지 않는다(결정적).
- "갱신 시 사용자 스크롤 위치가 튀지 않아야 한다"도 자동 충족 — 스크롤을 건드리지 않으니까.
- 과거 일정의 42% 불투명도 처리는 유지.
- 구분 행은 `widget_row_day.xml`을 재사용한다(뷰 타입 수 불변) — 라벨만 더 흐린 색(#A9A6BC).

### 함께 제거한 것 (되살리지 말 것)
provider의 `setScrollPosition`, factory의 `postDelayed` 재적용, `scrolled_$id` prefs 플래그,
`onDeleted` 정리, 페이로드의 `todayIndex`(JS·types·Kotlin `WidgetData`) 전부.

## 5-8. 위젯 완료가 앱에 즉시 반영되지 않던 문제 (같은 커밋)

5-6에서 별건으로 미뤘던 ②④를 처리했다. `drainPendingCompletions`는 이미 앱 시작·포그라운드
복귀에서 돌지만, **드레인은 Supabase 왕복(수백 ms)이고 화면 리로드(`useFocusEffect`)는 즉시**
끝난다 → 그 실행에서는 완료가 안 보이고 앱을 한 번 더 열어야 보였다.

- 드레인이 **실제로 반영한 항목이 있을 때만** `useDataSyncStore.bump()`로 신호를 보낸다
  (반영 0건이면 bump 안 함 → 불필요한 리로드 없음).
- HomeScreen이 그 신호를 구독해 **이중 소스 양쪽**(`reloadForDate`=상단 요약·TimeSpine,
  `reloadSchedules`=다가올 일정)을 재조회한다. 한쪽만 갱신하면 3번 항목의 재발이다.
- **로딩 표시는 하지 않는다.** 이미 그려진 화면을 수백 ms짜리 스켈레톤으로 덮는 편이 더
  거슬리고, 신호는 실제 변경이 있을 때만 오므로 조용히 갱신되는 편이 자연스럽다.

## 5-9. 위젯·음성 실기 검증 통과 (2026-08-14, tag: `v-widget-usayo-verified`)

> 커밋 `5ba66c9` 기준. 패키지명 `com.usayo.app` 전환 이후의 위젯 전반 + 확인 카드/긴 발화 수정을
> 실기(SM-S926N, 릴리스 APK)에서 검증한 결과.

### 검증 통과 항목
- **위젯 순서**: 오늘 최상단 → 앞으로 7일 → `지난 일정` 구분 행 → 과거 역순(어제→그제→그끄제).
  스크롤 조작 없이 오늘이 먼저 보인다(5-7의 데이터 순서 방식이 의도대로 동작).
- **위젯 완료 즉시 반영**: 위젯에서 완료 체크 후 앱을 열면 **그 자리에서** 반영됨.
  (이전에는 앱을 한 번 더 열어야 했다 — 5-8의 드레인 레이스 해소 확인.)
- **완료 탭이 앱을 열지 않음**: `action=complete` 분기 확인(옵션 B 목적 달성).
  이전 증상은 오탭이었고 완료 원 폭 34dp→44dp 확대로 해소(5-6).
- **패키지명 전환 정합성**: `com.usayo.app`에서 브릿지·prefs·딥링크 모두 정상.
- **확인 카드**: 취소 발화가 저장으로 뒤집히지 않음(5-2), 복수 일정 카드 자동 저장 카운트다운
  동작(5-1).
- **긴 발화**: 복수 일정 문장이 한 번에 인식됨(잘림·쪼개짐 재현 안 됨 — 5-4).

### 여전히 유효한 미해결 항목
4번(위젯 refreshWidget 중복 호출·완료 서버 반영 지연·반복 일정 완료 비활성·플러그인 .ts↔.js
동기화), 5번(빈 녹음 <1024바이트, STT 콜드스타트), 7번(고유명사 오인식, 기기별 TTS 엔진 차이)은
**그대로 미해결**이다. 이번 검증 범위가 아니다.

## 5-10. 텍스트 일정 등록 실기 검증 통과 (2026-08-16, tag: `v-text-input-verified`)

> 커밋 `4400bd6` 기준. 음성을 쓸 수 없는 상황(회의 중 등)의 보조 입력 경로.

### 검증 통과 항목 (실기 확인됨)
- 홈 FAB 우측 연필 버튼 → 바텀시트 진입
- 날짜·시간·제목·장소 입력 → 저장 정상
- 시간 변경(스테퍼·피커) 정상
- 저장 후 홈 목록 즉시 반영(이중 소스 `reloadForDate`/`reloadSchedules`)

### 이번 검증에서 확인하지 않은 항목 (미확인 ≠ 실패)
아래는 구현돼 있으나 실기에서 별도로 확인하지 않았다. 문제 발생 시 여기부터 본다.
1. **알림 예약** — `createEventManual`이 `scheduleEventNotification`을 호출하고
   `notification_offset_minutes=null`이라 설정 기본 오프셋(60·10분 전)을 따르게 돼 있다.
2. **위젯 즉시 갱신** — `refreshWidget('manualCreate')` 호출됨.
3. **저장 실패 시 입력값 보존** — 네트워크 오류로 throw되면 모달을 닫지 않고 인라인 오류를
   표시하도록 돼 있다(비행기 모드 테스트 미실시).
4. **작은 기기에서 키보드 가림** — 시트 ~370dp + 키보드 ~300dp 계산상 여유가 있으나
   저해상도 기기 미확인. 가리면 날짜·시간 줄을 더 압축하거나 시트를 스크롤 가능하게 한다.

### 설계 메모 (다음에 만질 때)
- **쿼터를 차감하지 않는 것이 의도된 동작이다.** 이 경로는 STT·인텐트 API를 쓰지 않아
  서버 쿼터(`stt-proxy`)와 무관하고, `quotaTracker.checkQuota`·`useFeatureGate`도 태우지 않는다.
  무료 사용자도 텍스트로는 무제한 등록 가능하다. **"쿼터가 안 깎인다"는 버그가 아니다.**
- `created_via: 'manual'`로 기록한다. 음성 입력 비율이 핵심 지표라 'voice'로 오염시키면 안 된다.
- 기본 시각 = 다음 정시, 10분 미만 남았으면 그다음 정시. 알림 기본값이 60·10분 전이라
  임박한 일정을 만들면 알림이 하나도 가지 않기 때문이다(조용한 실패 방지).
- `defaultDate` prop이 이미 있다. 일/주/월 뷰 확장 시 각 화면의 날짜를 넘기면 된다
  (그 화면들은 "보고 있는 날짜"가 기본이어야 자연스럽다). 현재는 홈만 연결.

## 관련 코드 위치 (텍스트 일정 등록)
- `components/AddEventModal.tsx` — 4필드 바텀시트(날짜·시간 한 줄 스테퍼 + 시스템 피커).
- `hooks/useSchedules.ts` — `createEventManual`(insert → 알림 예약 → refreshWidget).
- `screens/HomeScreen.tsx` — 연필 버튼(44dp 아웃라인) + `handleManualSave`.

## 5-11. ▶ 다음 작업 시작점 (2026-08-16 기준) — 결제 상품 조회 진단

> **여기부터 이어서 하면 된다.** 결제(IAP) 전환은 코드가 다 들어갔으나 실기 검증이 막혀 있다.

### 현재 막힌 지점
`[iap] fetchProducts: 1개` — Pro 월/연 2개를 요청하는데 **1개만 조회된다.**
코드 쪽 결함은 배제됐다(조사 결과는 아래 "확인된 것" 참조). 남은 것은 Play Console 상태다.

### 빌드 상태 — ⚠️ versionCode 3은 진단에 쓸 수 없다
| 빌드 | 시각 | 포함 여부 |
|---|---|---|
| versionCode 3 (`1b487ad1`) | 8/16 21:02 | 완료. 그러나 **아래 두 커밋 이전**이라 진단 불가 |
| `ba8cc7e` IAP 로그 보강 | 8/16 21:31 | 미포함 |
| `034c366` 키보드 수정 | 8/16 21:39 | 미포함 |

**versionCode 3으로는 어느 SKU가 누락됐는지 알 수 없다**(개수만 찍는 옛 로그). 새로 빌드해야 한다.

### 다음 작업 순서
1. **versionCode 4로 EAS 빌드** — `eas build --platform android --profile production`
2. **내부 테스트 트랙에 업로드**
3. **스토어 경로로 설치** — 로컬 APK 사이드로드가 아니라 Play에서 받아야 구독 상품이 조회된다.
4. **`[iap] fetchProducts` 로그로 누락 SKU 확정**
   ```
   [iap] fetchProducts: N/2개 요청=[...] 수신=[id(status=… offers=…)] 누락=[...]
   ```
   - `status=not-found` → SKU 없음/전파 전
   - `status=no-offers-available` → SKU는 있으나 받을 수 있는 오퍼 없음
   - `offers=0` → 기본 요금제 비활성·가격 미설정 → 조회돼도 **구매 불가**
5. 구매까지 시도하면 `[iap] requestPurchase` / `purchaseError code=…` /
   `[iap] verify 응답 status=… body=…`로 서버 구간까지 추적된다(401=JWT, 403=서비스계정 권한,
   404=미배포, 502=구글 API).

### Play Console 쪽 진행 상황 (2026-08-16 변경)
- `com.yusay.pro.annual`에 **잘못된 월간 요금제(`annual-base`)가 걸려 있어 비활성화**했고,
  **`annual-base-v2`(연간)를 활성화**했다.
- **8/16 변경이라 전파 대기 중**이다. 조회 누락의 유력한 원인이 이것이며, 전파가 끝나면
  2개가 정상 조회될 가능성이 높다. → **빌드 전에 먼저 재확인해 볼 것.**
  (전파만으로 해결되면 4번 로그는 "정상 2개"를 확인하는 용도가 된다.)

### 확인된 것 (다시 조사하지 말 것)
- API는 정상: `fetchProducts({ skus, type: 'subs' })`가 v15의 정식 구독 조회 API다
  (`getSubscriptions` 아님). 인앱 상품용 API를 쓰고 있지 않다.
- 상품 ID 3곳(`constants/pricing.ts` / 클라 `lib/iap.ts` / 서버 `_shared/google-play.ts`)
  모두 일치. 오타 없음.
- `ProductSubscriptionAndroid`의 식별자 필드는 `id`이며 `getProProducts()`가 이를 쓴다(정상).
- **조회 실패한 SKU는 예외도 경고도 없이 배열에서 빠진다**
  (라이브러리 문서: "Unknown SKUs are simply omitted from the result, not thrown").
  "오류가 없는데 1개만 온다"는 것은 정상 동작이며, 그래서 계측을 넣은 것이다.

### 서버 쪽 남은 준비 (결제 실동작 전제)
아직 안 됐다면 이것부터. 안 돼 있으면 결제창은 떠도 검증에서 막혀 플랜이 안 올라간다.
1. 마이그레이션 실행(`purchase_token`/`product_id`/`platform` + 인덱스) — 5-12 아래 SQL은
   `supabase/migrations/20260814000001_subscriptions_iap_columns.sql` 참조.
2. `supabase secrets set GOOGLE_SERVICE_ACCOUNT_JSON=… ANDROID_PACKAGE_NAME=com.usayo.app`
3. `supabase functions deploy verify-purchase` / `play-rtdn --no-verify-jwt`
4. Play Console API 액세스에 서비스 계정 연결 + 권한(재무 데이터 보기·주문 관리)

## 6. 계정 삭제 기능 도입 (2026-08-12) + 후속 과제

> 구글 플레이 필수 요건(계정 생성 앱의 앱 내 계정 삭제 경로) 대응. Edge Function
> `delete-account` + 설정>개인정보 "계정 삭제" UI. `auth.admin.deleteUser(hard)` + FK CASCADE로
> 실삭제. 기존 "내 데이터 삭제"(events 소프트 삭제)와 별개 기능.

### 후속 과제 (지시 없이 착수 금지)
1. **팀 소유권 이전(현재는 소유 팀 통째 삭제)**: 팀 기능이 UI 미노출(비활성)이라, 계정 삭제 시
   `teams WHERE owner_id = userId`를 통째로 삭제한다(`teams.owner_id`가 ON DELETE SET NULL이라
   방치하면 고아 팀이 남기 때문). 팀이 정식 기능이 되면 **소유자 삭제 시 소유권을 다른 멤버에게
   이전**하는 방식으로 재설계해야 한다(다른 멤버의 공유 데이터 보호). 관련: Edge Function
   `supabase/functions/delete-account/index.ts`의 소유 팀 삭제 단계.
2. **Google OAuth grant 서버측 정리**: 계정 삭제 시 `calendar_integrations`는 FK CASCADE로
   지워져 앱 쪽 연결은 끊기지만, Google 계정 설정에 남은 앱 권한(grant)은 그대로다. 필요 시
   삭제 전에 Google OAuth revoke 엔드포인트를 호출해 grant를 정리하는 단계 추가(현재 미구현 —
   보안/프라이버시 강화 항목). 관련: `calendar_integrations`(refresh token 저장).

### 설계 메모 (재인증 가드)
- `supabase.auth.signOut()`은 SIGNED_OUT을 발생시키고 `app/_layout.tsx`의 onAuthStateChange가
  이를 토큰 만료로 오인해 `signInWithDevice()`로 즉시 새 계정을 만든다. 계정 삭제 직후에는
  `services/auth/accountDeletion.ts`의 `isAccountDeletionInProgress()` 플래그로 그 자동 재인증을
  스킵한다(5초 후 해제). 이 가드를 제거하면 삭제 직후 빈 새 계정이 즉시 생성돼 UX가 깨진다.

## 관련 코드 위치 (계정 삭제)
- 서버: `supabase/functions/delete-account/index.ts`(verify_jwt=true, 소유 팀 삭제 + 하드 삭제).
- 클라이언트: `services/auth/accountDeletion.ts`(오케스트레이션·재인증 가드),
  `components/DeleteAccountModal.tsx`(2단계 확인·로딩 잠금·실패 재시도),
  `screens/settings/PrivacySettingsScreen.tsx`(진입 버튼), `app/_layout.tsx`(SIGNED_OUT 가드).

## 7. STT/TTS 관찰 항목 (2026-08-13 기록 — 미해결·수정 금지)

> 복수 확인 카드 카운트다운 작업(5-1) 중 실기 로그에서 함께 관찰. **별건이며 이번 수정 범위 아님.**

9. **고유명사 STT 오인식**: "율곡연수원" → "유료고기연수원"으로 전사됨. 일반 한국어 인식은
   정상인데 지명·기관명 등 고유명사에서 음절 단위로 무너진다. 개선 여지: Whisper 호출 시
   도메인 힌트(prompt/initial_prompt)로 사용자 빈출 고유명사(최근 일정 제목·장소)를 주입.
   지금은 **기록만** — 힌트 주입은 다른 방향의 편향(존재하지 않는 고유명사로 끌어당김)을
   만들 수 있어 별도 검증이 필요하다.
10. **기기별 TTS 엔진 차이(삼성 TTS 거부 → 구글 TTS 폴백)**: 삼성 단말에서
    `SamsungTTS: com.usayo.app is not allowed` 로그와 함께 삼성 TTS가 패키지를 거부하고
    구글 TTS로 폴백된다. **동작에는 문제 없음**(발화 정상). 다만 엔진에 따라 발화 속도·지연이
    달라질 수 있고, 확인 카드는 발화 종료 이벤트에 마이크 오픈/카운트다운을 바인딩하므로,
    폴백까지 실패하는 기기가 나오면 `waitForNextSpeechToFinish`의 폴백 경로(1500ms 내 발화
    미시작 → 즉시 resolve)로 떨어진다. 기기별 확인 카드 이슈 제보 시 이 로그부터 확인할 것.

## 관련 코드 위치 (확인 카드 · STT/TTS)
- 확인 음성 루프: `hooks/useConfirmVoiceLoop.ts`(카운트다운·재질문·레코더 파라미터 단일 소유).
- 카드: `components/InlineConfirmCard.tsx`(단일), `components/MultiConfirmCard.tsx`(복수),
  `components/MiniWaveform.tsx`(공용 파형), `components/VoiceConfirmLayer.tsx`(렌더 분기).
- 판정/발화: `utils/voiceResponseMatcher.ts`(환각 방어 + 키워드),
  `services/voice/SpeechRecognitionService.ts`(confirm 모드 STT), `services/voice/TTSService.ts`.
