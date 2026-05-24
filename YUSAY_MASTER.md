# YuSay — 마스터 프로덕트 문서
> "Yu say. It's done." — 타이핑 없이 음성만으로 스케줄을 생성·수정·삭제하는 Voice-First 캘린더 앱
> 최종 작성일: 2026년 5월

---

## 목차
1. [앱 개요](#1-앱-개요)
2. [기술 스택](#2-기술-스택)
3. [전체 화면 구조 (26개)](#3-전체-화면-구조)
4. [핵심 음성 플로우 (A)](#4-핵심-음성-플로우)
5. [온보딩 플로우 (B)](#5-온보딩-플로우)
6. [캘린더 뷰 (C)](#6-캘린더-뷰)
7. [다가올 탭 + 설정 탭 (D)](#7-다가올--설정-탭)
8. [요금제 & 기능 제한](#8-요금제--기능-제한)
9. [지역별 현지화 가격](#9-지역별-현지화-가격)
10. [피처 게이트 시스템](#10-피처-게이트-시스템)
11. [브랜딩 & 디자인 토큰](#11-브랜딩--디자인-토큰)
12. [개발 로드맵](#12-개발-로드맵)

---

## 1. 앱 개요

| 항목 | 내용 |
|------|------|
| **앱 이름** | YuSay |
| **슬로건** | "Yu say. It's done." |
| **핵심 기능** | 음성만으로 일정 생성·수정·삭제·조회 (Full Voice CRUD) |
| **타깃** | 이동 중 직장인, ADHD 성인, 비영어권 아시아 사용자 |
| **플랫폼** | iOS + Android (React Native) |
| **수익 모델** | Freemium + B2B SaaS |
| **목표 시장** | 한국 → 일본 → 동남아 → 영어권 |

### 핵심 차별점
- 경쟁 앱(Todoist Ramble, Hero)은 음성 **생성만** 가능 — YuSay는 수정·삭제까지 완전 음성 CRUD
- **한국어·일본어·동남아어** 특화 — 비영어권 사실상 블루오션
- **AI 재확인 플로우** — "3시에 회의 잡았어요, 맞나요?" 방식으로 오인식 즉시 보정
- **소음 환경 하이브리드 입력** — 카페·지하철에서도 동작

---

## 2. 기술 스택

```
Frontend:   React Native + Expo SDK 52+
Backend:    Supabase (PostgreSQL + Auth + Realtime + Storage)
STT:        Whisper API (기본) / Google Speech-to-Text (대안)
LLM:        Claude Sonnet API (인텐트 분류 + 날짜 파싱)
TTS:        expo-speech / Google TTS
결제:        RevenueCat SDK (iOS IAP + Google Play Billing)
상태관리:   Zustand
네비게이션: Expo Router v3
UI:         NativeWind (Tailwind for RN) + 커스텀 컴포넌트
알림:       Expo Notifications
위젯:       expo-widgets (iOS WidgetKit + Android AppWidgets)
캘린더 연동: Google Calendar API v3 + EventKit (Apple)
```

---

## 3. 전체 화면 구조

총 **26개 화면**, 5개 탭 + 온보딩

### 탭 구조
```
홈 탭 (🏠)
├── 홈 메인 ✅ (시간 상단 + FAB + 일정 페이드 리스트)
├── 일정 상세
└── 전체 목록 (페이드 아래 전체 보기)

캘린더 탭 (📅)
├── 월간 뷰 ✅ (도트 인디케이터 + 바텀시트)
├── 주간 뷰 ✅ (타임라인 + 현재시각 라인)
├── 일간 뷰 ✅ (시간 블록 + 여유 슬롯)
└── 연간 뷰 ✅ (히트맵 12개월)

음성 FAB (🎙) — 어느 탭에서나 중앙 고정
├── 청취 화면 ✅
├── CREATE 확인 ✅
├── UPDATE 확인 ✅ (Before→After 미리보기)
├── DELETE 확인 ✅ (중복 선택 + 5초 되돌리기)
├── QUERY 응답 ✅ (음성+시각 동시 + 연속 대화)
└── 인식 실패 복구 ✅ (하이브리드 입력)

다가올 탭 (⏰)
├── 이번 주 뷰 ✅
├── 이번 달 뷰 ✅
└── AI 빈 슬롯 제안 ✅

설정 탭 (⚙️)
├── 설정 메인 ✅
├── 캘린더 연동 ✅
├── 알림 설정 ✅
├── 언어·음성 ✅
└── 프라이버시 ✅

온보딩 (👋) — 최초 설치 시만
├── 스플래시 ✅
├── 소개 슬라이드 1 — "말하면 일정이 잡혀요" ✅
├── 소개 슬라이드 2 — "전부 음성으로" ✅
├── 소개 슬라이드 3 — "한국어를 제대로" ✅
├── 마이크 권한 요청 ✅
├── 캘린더 연동 ✅
└── 시작 화면 ✅
```

### 홈 화면 레이아웃 (핵심)
```
┌─────────────────────┐
│  09:41              │  ← 상태바
│  ████████████████   │
│                     │
│     09:41           │  ← 빅 타임 (Space Mono Bold 52px)
│  2026.5.25 월요일   │
│                     │
│      [🎙 FAB]       │  ← 중앙 음성 버튼 (항상 dominant)
│   말하려면 탭하세요  │
│ ─────────────────── │
│ 오늘 일정           │
│ 09:00 │ 스탠드업 ✓  │  ← 완료 (흐림 처리)
│ 11:00 │ 디자인 리뷰 │  ← 현재 강조 (보더)
│ 14:00 │ 팀장 1:1    │
│ 15:30 │ 개발 리뷰   │  ← 하단으로 갈수록
│ 18:00 │ 팀 저녁     │  ← FADE OUT ↓
│ ██████ FADE █████  │
│  아래로 스크롤      │
│ ┌─┐[홈][📅]   [⏰][⚙]│  ← 탭바 (FAB 중앙 돌출)
└─────────────────────┘
```

---

## 4. 핵심 음성 플로우

### 공통 플로우
```
FAB 탭 → 청취 화면 (파형 애니메이션)
→ STT 변환 → LLM 인텐트 분류
→ 인텐트별 처리 → AI 재확인
→ 음성 또는 탭으로 확정 → 완료
```

### CREATE 플로우
```
"내일 오후 3시에 팀 회의 잡아줘"
→ intent: CREATE
→ date: 내일 15:00, title: 팀 회의
→ AI 재확인: "내일 오후 3시 팀 회의, 맞나요?"
→ 확정 → DB 저장 → 캘린더 동기화 → 완료
```

### UPDATE 플로우 ⭐ (업계 차별점)
```
"내일 팀 회의 4시로 바꿔줘"
→ intent: UPDATE
→ DB 검색: "팀 회의" 내일 15:00 매칭 (confidence 91%)
→ Before→After 미리보기: 15:00 → 16:00
→ "이렇게 바꿀까요?" 확인
→ 확정 → DB 업데이트 → 완료
```

### DELETE 플로우 ⭐ (업계 차별점)
```
"내일 약속 취소해줘"
→ intent: DELETE
→ 후보 복수: "팀 회의 15:00" / "팀 저녁 18:00"
→ 선택 요청: "어떤 걸 취소할까요?"
→ 선택 → "정말 삭제할까요?" 최종 확인
→ 삭제 → 5초 되돌리기 배너 → 완료
```

### QUERY 플로우
```
"이번 주 일정 알려줘"
→ intent: QUERY, range: 이번 주
→ 음성 읽기 (TTS) + 리스트 시각화 동시
→ 연속 대화: "목요일 비어있어?" → 컨텍스트 유지
→ 답변: "목요일 오전이 비어있어요"
```

### 인식 실패 복구 플로우
```
소음 감지 (SNR < 15dB) → 경고 표시
→ 인식 시도 → confidence < 60%
→ "잘 못 들었어요" + 들린 내용 표시
→ [다시 말하기] 또는 [직접 입력] 선택
→ 하이브리드 입력 모드 → 완료
```

---

## 5. 온보딩 플로우

### 7단계 순서
```
스플래시 (로고 + 파형 애니메이션 + 로딩바)
→ 슬라이드 1: "말하면 일정이 잡혀요"
→ 슬라이드 2: "전부 음성으로 됩니다" (생성·수정·삭제)
→ 슬라이드 3: "한국어를 제대로 알아요" (자연어 예시)
→ 마이크 권한 요청 (이유 먼저, 시스템 팝업 후)
→ 캘린더 연동 (Google/Apple, 건너뛰기 가능)
→ 준비 완료 (첫 음성 입력 즉시 유도)
```

### 권한 요청 원칙
- 시스템 팝업 **전**에 "왜 필요한지" 화면 제공
- 녹음 저장 안 됨 명시
- "나중에" 선택지 항상 제공
- 온보딩 완료 후 즉시 첫 성공 경험 유도

---

## 6. 캘린더 뷰

### 4가지 뷰 전환
탭바: 일 | 주 | 월 | 연

### 월간 뷰 (기본)
- 도트 인디케이터: 업무(보라)/개인(초록)/중요(주황)
- 날짜 탭 → 바텀시트 슬라이드업 (달력 유지)
- 일정 2개 이상 → 도트 복수 표시

### 주간 뷰
- 타임라인 (세로축: 시간, 가로축: 요일)
- 현재 시각 빨간 라인
- 오늘 컬럼 미세 배경 강조
- 빈 시간대 점선 박스 (QUERY 연동)

### 일간 뷰
- 상단 요약 칩: "4개 일정 · 3시간 여유 · 오후 밀집"
- 이벤트 블록 높이 = 소요 시간
- 빈 슬롯 점선 표시 (계획 유도)
- 현재 시각 라인 + 시간 표시

### 연간 뷰
- 12개월 히트맵 (농도 5단계)
- 바쁜 달 자동 강조 (🔥 표시)
- 탭 → 해당 월간 뷰 드릴다운

---

## 7. 다가올 + 설정 탭

### 다가올 탭
- **이번 주**: 요일별 시간순 리스트, 오늘·내일 강조
- **이번 달**: 주차별 그룹 + D-Day 카운트 + AI 인사이트
- **AI 빈 슬롯**: 비어있는 시간 3개 제안 + 즉시 음성 등록

### 설정 탭 구조
```
프로필 (이름 + 이메일 + 플랜 뱃지)
Pro 업그레이드 배너 (가격 직접 노출)
─────────────────
캘린더 연동   → Google ✓ / Apple / Naver
알림 설정     → 시작 전 알림, 음성 읽기, 진동
언어·음성     → 언어 선택 (Pro 잠금), TTS 속도
프라이버시    → 녹음 삭제, On-Device(Team), 데이터 삭제
앱 정보       → 버전, 피드백
─────────────────
로그아웃
```

---

## 8. 요금제 & 기능 제한

### 3티어 플랜

| 기능 | Free | Pro | Team |
|------|------|-----|------|
| 가격 | 무료 | ₩3,900/월 | ₩9,900/인/월 |
| 연간 | — | ₩39,000/년 | ₩99,000/인/년 |
| 최소 인원 | 1 | 1 | 5인 |
| 음성 CREATE | 월 50회 | 무제한 | 무제한 |
| 음성 UPDATE·DELETE | 월 20회 | 무제한 | 무제한 |
| 언어 | 한국어 | 4개 (한·영·일·동남아1) | 전체 |
| Google·Apple 연동 | ❌ | ✅ | ✅ |
| AI 빈 슬롯 제안 | ❌ | ✅ | ✅ |
| 위젯 (미디엄·잠금) | ❌ | ✅ | ✅ |
| 팀 공유 캘린더 | ❌ | ❌ | ✅ |
| On-Device 처리 | ❌ | ❌ | ✅ |
| WokyToky 연동 | ❌ | ❌ | ✅ |
| 7일 무료 체험 | — | ✅ | 데모 요청 |

### 게이트 유형 4가지
- **HARD GATE**: 기능 잠금 → 탭 시 업그레이드 모달
- **USAGE GATE**: 횟수 제한 → 80%/100% 경고 배너
- **LANG GATE**: 언어 잠금 → Pro 뱃지 표시
- **TEAM GATE**: 기업 전용 → "문의하기" B2B 퍼널

---

## 9. 지역별 현지화 가격 (PPP 기반)

| 지역 | Pro/월 | Pro/연 | Team/인/월 |
|------|--------|--------|-----------|
| 🇰🇷 한국 | ₩3,900 | ₩39,000 | ₩9,900 |
| 🇺🇸 미국 | $3.99 | $39.99 | $9.99 |
| 🇯🇵 일본 | ¥480 | ¥4,800 | ¥1,200 |
| 🇸🇬 싱가포르 | S$2.99 | S$29.99 | S$7.99 |
| 🇲🇾 말레이시아 | RM8.90 | RM89 | RM22 |
| 🇹🇭 태국 | ฿69 | ฿690 | ฿179 |
| 🇵🇭 필리핀 | ₱119 | ₱1,190 | ₱299 |
| 🇮🇩 인도네시아 | Rp29,000 | Rp290,000 | Rp75,000 |
| 🇻🇳 베트남 | ₫49,000 | ₫490,000 | ₫129,000 |

> 결제 수단: RevenueCat SDK (App Store + Google Play + GrabPay + GoPay + PromptPay 등 현지 결제)

---

## 10. 피처 게이트 시스템

### 아키텍처 흐름
```
SubscriptionService (캐시 + 서버 검증)
→ useFeatureGate(featureKey)
→ FEATURE_GATES 상수 매칭
→ isAllowed / gateType / upgradeTarget 반환
→ <FeatureGate> 컴포넌트 렌더링
→ 허용: children / 거부: <UpgradeModal>
```

### FEATURE_GATES 전체 정의
```typescript
const FEATURE_GATES = {
  voice_create:      { free: { limit: 50 },  pro: 'unlimited', team: 'unlimited' },
  voice_modify:      { free: { limit: 20 },  pro: 'unlimited', team: 'unlimited' },
  voice_query:       { free: { turns: 3 },   pro: 'unlimited', team: 'unlimited' },
  google_sync:       { free: false,          pro: true,        team: true },
  apple_sync:        { free: false,          pro: true,        team: true },
  ai_slot:           { free: false,          pro: true,        team: true },
  lang_en:           { free: false,          pro: true,        team: true },
  lang_ja:           { free: false,          pro: true,        team: true },
  lang_sea:          { free: false,          pro: { count: 1 },team: 'all' },
  widget_medium:     { free: false,          pro: true,        team: true },
  widget_lockscreen: { free: false,          pro: true,        team: true },
  team_calendar:     { free: false,          pro: false,       team: true },
  on_device:         { free: false,          pro: false,       team: true },
  wokytoksy_sync:   { free: false,          pro: false,       team: true },
}
```

---

## 11. 브랜딩 & 디자인 토큰

### 컬러 팔레트
```
Voice Purple (Primary):  #534AB7
Night Ink (Deep):        #26215C
Soft Wave (Accent):      #AFA9EC
Whisper (Background):    #EEEDFE
Done Green (Success):    #1D9E75
Warning Orange:          #EF9F27
Delete Coral:            #D85A30
Error Red:               #E24B4A

Dark BG:    #0E0C1F
Dark Card:  #13112A
Dark Nav:   #09081A
Dark Border:#1E1B3A
```

### 타이포그래피
```
Display (시간):  Space Mono Bold 52px
Title:           DM Sans SemiBold 22px
Body:            DM Sans Regular 16px
Caption:         DM Sans Regular 12px
```

### 네비게이션 구조
```
하단 탭바 5개: 홈 | 캘린더 | [FAB 돌출] | 다가올 | 설정
FAB: 탭바 중앙 돌출 42px 퍼플 원형
어느 화면에서든 음성 버튼 한 번에 접근
```

---

## 12. 개발 로드맵

| Phase | 기간 | 목표 | KPI |
|-------|------|------|-----|
| Phase 1 | 0~3개월 | 음성 CRUD + 한국어 최적화 + 기본 UI | 앱스토어 출시 / DAU 1,000 |
| Phase 2 | 3~6개월 | 노이즈 필터 + Google·Apple 연동 + 영어·일본어 | MAU 10,000 / Pro 전환 5% |
| Phase 3 | 6~12개월 | B2B Team 플랜 + 동남아 진출 + Watch | MRR ₩5,000만 / 기업 20사 |
| Phase 4 | 12개월~ | Series A + 아시아 전체 + 글로벌 | ARR ₩10억 |

---

## 개발 프롬프트 파일 목록
```
prompts/
├── PROMPT_01_PROJECT_SETUP.md       — 프로젝트 초기 설정
├── PROMPT_02_DATABASE_SCHEMA.md     — Supabase DB 스키마
├── PROMPT_03_VOICE_ENGINE.md        — 음성 엔진 (STT+LLM+TTS)
├── PROMPT_04_KOREAN_NLP.md          — 한국어 날짜·시간 파싱
├── PROMPT_05_EVENT_MATCHING.md      — UPDATE·DELETE 일정 탐색
├── PROMPT_06_NOISE_HYBRID.md        — 소음 감지 + 하이브리드 입력
├── PROMPT_07_FEATURE_GATE.md        — 요금제 기능 제한 시스템
├── PROMPT_08_HOME_SCREEN.md         — 홈 화면 UI
├── PROMPT_09_CALENDAR_VIEWS.md      — 캘린더 4개 뷰
├── PROMPT_10_UPCOMING_SETTINGS.md   — 다가올 + 설정 탭
├── PROMPT_11_ONBOARDING.md          — 온보딩 7단계
├── PROMPT_12_WIDGETS.md             — iOS·Android 위젯
├── PROMPT_13_TEAM_B2B.md            — 팀 플랜 + WokyToky 연동
└── PROMPT_14_PAYMENT_REVENUECAT.md  — 결제 + 지역별 가격
```
