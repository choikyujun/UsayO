# YuSay — Claude Code 개발 실행 순서
> 이 파일을 보면서 순서대로 진행하세요.
> 각 단계 완료 확인 후 다음 단계로.

---

## ⚡ 공통 규칙 (매 단계 적용)
- 한 번에 하나씩 — 완료 확인 후 다음
- 에러 나면 그 단계에서 해결 후 진행
- DB 작업 전 항상 백업 먼저 (supabase db dump)
- 기존 테이블 **DROP 절대 금지** — ALTER TABLE ADD COLUMN만
- API 키는 반드시 .env 파일에서 읽기
- TypeScript strict mode, 단위 테스트 포함

---

## STEP 0 — 기존 코드 AUDIT (기존 작업 있으면 필수)

**Claude Code에게 전달:**
```
CLAUDE_CODE_START_HERE.md 와 PROMPT_00_AUDIT_EXISTING.md 를 읽고,
기존 yusay 폴더를 분석해서
구현됨 / 수정필요 / 미구현 으로 분류해줘.
```

**완료 확인:** AUDIT 보고서 받으면 검토 후 "시작해"

---

## STEP 1 — 프로젝트 초기 설정

**Claude Code에게 전달:**
```
PROMPT_01_PROJECT_SETUP.md 를 읽고 실행해줘.
기존 폴더 구조는 유지하면서
누락된 디렉토리와 파일만 추가해줘.
```

**완료 확인:** `expo start` 정상 실행

---

## STEP 2 — Supabase DB 스키마

**Claude Code에게 전달:**
```
PROMPT_02_DATABASE_SCHEMA.md 를 읽고 실행해줘.
기존 테이블은 DROP 하지 말고,
ALTER TABLE ADD COLUMN 으로 누락된 컬럼만 추가해줘.
마이그레이션 전에 현재 스키마 먼저 보여줘.
```

**완료 확인:** Supabase 대시보드에서 테이블 확인

---

## ✅ 체크포인트 1
> expo start 정상 + Supabase 테이블 생성 확인
> 여기까지 되면 기반 완성

---

## STEP 3 — 음성 엔진 (STT + LLM + TTS)

**Claude Code에게 전달:**
```
PROMPT_03_VOICE_ENGINE.md 를 읽고 실행해줘.
VoiceFlowOrchestrator 까지 완성하고,
"내일 오후 3시에 팀 회의 잡아줘" 테스트 케이스가
통과하면 알려줘.
```

**완료 확인:** 실제 음성 입력 → 인텐트 분류 → TTS 재확인 동작

---

## STEP 4 — 한국어 날짜·시간 파싱

**Claude Code에게 전달:**
```
PROMPT_04_KOREAN_NLP.md 를 읽고 실행해줘.
파일 하단의 Jest 테스트 케이스 20개 모두 통과해야 해.
실패하는 케이스 있으면 고쳐서 다시 돌려줘.
```

**완료 확인:** `jest` 실행 → 20개 테스트 전부 통과

---

## STEP 5 — 이벤트 매칭 (UPDATE·DELETE용)

**Claude Code에게 전달:**
```
PROMPT_05_to_08.md 에서 PROMPT 05 (Event Matching) 부분만 실행해줘.
"내일 약속 취소해줘" 발화 시
후보 일정 2개가 뜨고 선택할 수 있어야 해.
```

**완료 확인:** UPDATE·DELETE 플로우 실제 동작

---

## 🎙 체크포인트 2 — 음성 핵심
> "내일 3시 회의 잡아줘" → DB 저장
> "내일 회의 취소해줘" → 삭제
> 이게 YuSay의 핵심

---

## STEP 6 — 소음 감지 + 하이브리드 입력

**Claude Code에게 전달:**
```
PROMPT_05_to_08.md 에서 PROMPT 06 (소음 감지·하이브리드) 부분 실행해줘.
카페 소음 시뮬레이션으로 SNR 측정되고
하이브리드 모드로 전환되면 돼.
```

**완료 확인:** 소음 환경 → 자동 하이브리드 전환

---

## STEP 7 — 피처 게이트 시스템 (요금제 제한)

**Claude Code에게 전달:**
```
PROMPT_05_to_08.md 에서 PROMPT 07 (Feature Gate) 부분 실행해줘.
useFeatureGate, FeatureGate 컴포넌트, UpgradeModal, QuotaTracker 전부 만들어줘.
Free 계정에서 51번째 음성 입력 시 업그레이드 모달이 뜨는지 확인해줘.
```

**완료 확인:** Free → 사용량 초과 → 업그레이드 모달

---

## 💰 체크포인트 3 — 수익화 기반
> 피처 게이트 없이 UI 먼저 만들면 나중에 전부 뜯어야 함
> 여기서 완성 후 UI 진행

---

## STEP 8 — 홈 화면 UI

**Claude Code에게 전달:**
```
PROMPT_05_to_08.md 에서 PROMPT 08 (홈 화면) 부분 실행해줘.
시간 상단 + FAB 중앙 + 일정 페이드 리스트 구조야.
다크·라이트 모드 둘 다 만들어줘.
```

**완료 확인:** 홈 렌더링 + 다크·라이트 전환 + FAB → 음성 시작

---

## STEP 9 — 캘린더 4개 뷰

**Claude Code에게 전달:**
```
PROMPT_09_to_11.md 에서 PROMPT 09 (캘린더) 부분 실행해줘.
월간·주간·일간·연간 뷰 전부야.
탭 전환 애니메이션도 포함해줘.
```

**완료 확인:** 4뷰 전환 + 일정 표시 + 날짜 탭 → 바텀시트

---

## STEP 10 — 다가올 탭 + 설정 탭

**Claude Code에게 전달:**
```
PROMPT_09_to_11.md 에서 PROMPT 10 (다가올·설정) 부분 실행해줘.
AI 빈 슬롯은 FeatureGate로 Pro 이상만 접근하게 해줘.
```

**완료 확인:** 이번 주·달·AI 슬롯 + 설정 5개 서브메뉴

---

## STEP 11 — 온보딩 7단계

**Claude Code에게 전달:**
```
PROMPT_09_to_11.md 에서 PROMPT 11 (온보딩) 부분 실행해줘.
AsyncStorage에 온보딩 완료 플래그 저장해서
재진입 시 건너뛰도록 해줘.
```

**완료 확인:** 앱 삭제 후 재설치 → 온보딩 → 홈 이동

---

## 📱 체크포인트 4 — MVP 완성
> 모든 탭 화면 + 온보딩 플로우 동작
> 여기까지 = 앱스토어 제출 가능한 MVP

---

## STEP 12 — iOS·Android 위젯

**Claude Code에게 전달:**
```
PROMPT_12_to_14.md 에서 PROMPT 12 (위젯) 부분 실행해줘.
스몰 위젯은 Free, 미디엄·잠금화면은
FeatureGate로 Pro 이상만 사용 가능하게 해줘.
```

**완료 확인:** 스몰 위젯 → 다음 일정 + FAB 표시

---

## STEP 13 — 팀 플랜 + WokyToky 연동

**Claude Code에게 전달:**
```
PROMPT_12_to_14.md 에서 PROMPT 13 (팀·B2B) 부분 실행해줘.
팀 공유 캘린더와 Supabase Realtime 연동까지 포함해줘.
```

**완료 확인:** 팀원 A 일정 → 팀원 B 캘린더 실시간 반영

---

## STEP 14 — RevenueCat 결제 + 지역별 가격

**Claude Code에게 전달:**
```
PROMPT_12_to_14.md 에서 PROMPT 14 (결제) 부분 실행해줘.
RevenueCat 샌드박스 환경에서
Pro 구독 구매 → 피처 게이트 즉시 해제 되는지 확인해줘.
```

**완료 확인:** 테스트 결제 → Pro 기능 해제 → 취소 → Free 복귀

---

## 🚀 최종 — 앱스토어 제출

**Claude Code에게 전달:**
```
TestFlight (iOS) 내부 테스트 빌드 만들어줘.
Bundle ID: app.yusay
앱 아이콘, 스플래시 스크린 포함해서
app.json 최종 설정해줘.
```

---

## 파일 목록 요약

```
CLAUDE_CODE_START_HERE.md     ← 항상 첫 번째
YUSAY_MASTER.md               ← 전체 스펙 참조용

prompts/
├── PROMPT_00_AUDIT_EXISTING.md   STEP 0
├── PROMPT_01_PROJECT_SETUP.md    STEP 1
├── PROMPT_02_DATABASE_SCHEMA.md  STEP 2
├── PROMPT_03_VOICE_ENGINE.md     STEP 3
├── PROMPT_04_KOREAN_NLP.md       STEP 4
├── PROMPT_05_to_08.md            STEP 5~8
├── PROMPT_09_to_11.md            STEP 9~11
└── PROMPT_12_to_14.md            STEP 12~14
```
