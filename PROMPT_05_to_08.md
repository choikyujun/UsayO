# PROMPT 05 — UPDATE·DELETE 일정 탐색 (Event Matching)
> Claude Code에게 전달하는 YuSay 일정 매칭 알고리즘 프롬프트

---

당신은 TypeScript + Supabase 전문가입니다.
"내일 팀 회의 취소해줘"처럼 모호한 음성 명령에서 DB의 정확한 일정을 찾아내는
EventMatcher 서비스를 구현해주세요.

## 매칭 전략 (우선순위 순)

1. **날짜 + 시간 정확 매칭**: start_at 범위 ± 30분
2. **제목 유사도 매칭**: 퍼지 검색 (제목에 키워드 포함)
3. **날짜만 매칭 (모호한 경우)**: 해당 날 모든 일정 후보 반환

## 인터페이스

```typescript
interface MatchResult {
  exactMatch: Event | null;
  candidates: Event[];          // 후보가 여러 개일 때
  needsDisambiguation: boolean; // 사용자 선택 필요 여부
  disambiguationQuestion: string; // "어떤 일정인가요? 팀 회의인가요, 고객 미팅인가요?"
}

class EventMatcher {
  // UPDATE용: 수정할 일정 찾기
  async findForUpdate(query: string, dateHint?: Date): Promise<MatchResult>
  
  // DELETE용: 삭제할 일정 찾기
  async findForDelete(query: string, dateHint?: Date): Promise<MatchResult>
  
  // 모호한 표현 처리
  private async handleAmbiguousQuery(candidates: Event[]): Promise<MatchResult>
  
  // 퍼지 매칭 점수 계산
  private calculateSimilarity(query: string, title: string): number
}
```

## Supabase 쿼리 구현

```typescript
// 날짜 범위 + 제목 퍼지 검색
const { data } = await supabase
  .from('events')
  .select('*')
  .eq('user_id', userId)
  .gte('start_at', dayStart.toISOString())
  .lte('start_at', dayEnd.toISOString())
  .is('deleted_at', null)
  .ilike('title', `%${keyword}%`)
  .order('start_at', { ascending: true });
```

## 중복 처리 UX

후보가 2개 이상이면:
1. TTS: "내일 오후에 일정이 2개 있어요. 팀 회의인가요, 고객 미팅인가요?"
2. 화면: 선택 카드 UI 표시
3. 사용자 음성/탭으로 선택
4. 선택 후 최종 확인 → 처리

후보가 0개이면:
- TTS: "해당 날짜에 일치하는 일정이 없어요."
- 화면: 에러 메시지

단위 테스트 포함. Supabase 클라이언트 목킹 처리.

---

# PROMPT 06 — 소음 감지 + 하이브리드 입력
> Claude Code에게 전달하는 YuSay 소음 환경 대응 프롬프트

---

당신은 React Native 오디오 처리 전문가입니다.
소음 환경에서도 동작하는 하이브리드 음성 입력 시스템을 구현해주세요.

## 소음 감지 (NoiseDetectorService)

```typescript
interface NoiseAnalysis {
  level: 'quiet' | 'moderate' | 'loud';
  snr: number;          // Signal-to-Noise Ratio (dB 추정)
  recommendation: 'voice' | 'hybrid' | 'text';
  warningMessage?: string;
}

class NoiseDetectorService {
  // 녹음 시작 전 1초 동안 배경 소음 측정
  async measureBackgroundNoise(): Promise<NoiseAnalysis>
  
  // 실시간 오디오 레벨 기반 SNR 추정
  estimateSNR(audioLevel: number, backgroundLevel: number): number
}
```

## 모드 자동 전환

```
SNR > 20dB → 정상 음성 모드
SNR 10~20dB → 경고 표시 후 음성 모드 (사용자 선택)
SNR < 10dB → 하이브리드 모드 자동 권장
confidence < 0.6 (인식 후) → 하이브리드 모드 전환
```

## 하이브리드 입력 UI

음성 인식 실패 또는 소음 환경 시:
1. 인식된 텍스트를 입력 필드에 미리 채움
2. 사용자가 텍스트 직접 수정 가능
3. 날짜/시간 선택기 (DateTimePicker) 보조 제공
4. "확인" 버튼으로 처리

```typescript
interface HybridInputState {
  prefillText: string;      // STT 결과로 미리 채운 텍스트
  isVoiceMode: boolean;
  fallbackReason: 'noise' | 'low_confidence' | 'user_choice';
}
```

expo-av 기반 마이크 레벨 측정 코드 포함.
하이브리드 모드 컴포넌트(HybridInputModal) React Native 코드 작성.

---

# PROMPT 07 — 피처 게이트 시스템 (요금제 기능 제한)
> Claude Code에게 전달하는 YuSay 구독 기반 기능 제한 구현 프롬프트

---

당신은 React Native + Supabase 환경에서 구독 기반 기능 제한 시스템을 구현하는 시니어 개발자입니다.

## 플랜 정의
- free: 기본 무료
- pro: 개인 유료 (₩3,900/월)
- team: 기업 유료 (₩9,900/인/월)

## 1. FEATURE_GATES 상수 (constants/featureGates.ts)

```typescript
export const FEATURE_GATES = {
  voice_create:      { free: { limit: 50 },   pro: 'unlimited', team: 'unlimited' },
  voice_modify:      { free: { limit: 20 },   pro: 'unlimited', team: 'unlimited' },
  voice_query:       { free: { turns: 3 },    pro: 'unlimited', team: 'unlimited' },
  google_sync:       { free: false,           pro: true,        team: true },
  apple_sync:        { free: false,           pro: true,        team: true },
  ai_slot:           { free: false,           pro: true,        team: true },
  lang_en:           { free: false,           pro: true,        team: true },
  lang_ja:           { free: false,           pro: true,        team: true },
  lang_sea:          { free: false,           pro: { count: 1 }, team: 'all' },
  widget_medium:     { free: false,           pro: true,        team: true },
  widget_lockscreen: { free: false,           pro: true,        team: true },
  team_calendar:     { free: false,           pro: false,       team: true },
  on_device:         { free: false,           pro: false,       team: true },
  wokytoky_sync:     { free: false,           pro: false,       team: true },
} as const;

export type FeatureKey = keyof typeof FEATURE_GATES;
export type PlanType = 'free' | 'pro' | 'team';
export type GateType = 'hard' | 'usage' | 'lang' | 'team';
```

## 2. SubscriptionService

```typescript
class SubscriptionService {
  async getCurrentPlan(): Promise<PlanType>  // 캐시 우선, 서버 검증
  async refreshFromServer(): Promise<void>
  async upgradePlan(plan: PlanType): Promise<void>
  isFeatureAllowed(feature: FeatureKey): boolean
  getGateType(feature: FeatureKey): GateType
}
```

## 3. useFeatureGate 훅

```typescript
interface FeatureGateResult {
  isAllowed: boolean;
  gateType: GateType;
  upgradeTarget: 'pro' | 'team';
  usageInfo?: { used: number; limit: number; percentage: number };
}

function useFeatureGate(feature: FeatureKey): FeatureGateResult
```

## 4. QuotaTracker (사용량 추적)

```typescript
class QuotaTracker {
  async incrementUsage(type: 'create' | 'modify' | 'query'): Promise<void>
  async getStatus(type: string): Promise<{ used: number; limit: number; percentage: number; daysUntilReset: number }>
  async checkQuota(type: string): Promise<boolean>  // 사용 가능 여부
  private async syncToServer(): Promise<void>       // 백그라운드 동기화
}
```

## 5. FeatureGate 컴포넌트

```tsx
// 사용 예시
<FeatureGate feature="google_sync">
  <GoogleSyncButton />
</FeatureGate>

// 커스텀 폴백
<FeatureGate 
  feature="ai_slot" 
  fallback={<LockedSlotCard />}
>
  <AISlotSuggestions />
</FeatureGate>
```

## 6. UpgradeModal (게이트 유형별)

- HARD: "Pro 기능이에요" + 기능 목록 + 7일 체험 CTA
- USAGE: 진행률 바 + 남은 횟수 + 업그레이드 버튼
- LANG: Free vs Pro 언어 비교 표
- TEAM: 팀 기능 목록 + "문의하기" 버튼

## 7. UsageWarningBanner

홈 화면 하단: 사용량 80% 이상 시 표시
- 진행률 바 + 남은 횟수 + 소프트 업그레이드 버튼
- 닫기 가능 (당일 재표시 안 함, AsyncStorage 활용)

RevenueCat 연동은 PROMPT_14 참조.
TypeScript strict, 단위 테스트 포함.

---

# PROMPT 08 — 홈 화면 UI
> Claude Code에게 전달하는 YuSay 홈 화면 구현 프롬프트

---

당신은 React Native + NativeWind UI 전문가입니다.
YuSay 홈 화면을 정확하게 구현해주세요.

## 레이아웃 구조 (위→아래)

```
StatusBar (다크 테마)
│
BigClock 컴포넌트
│  - 현재 시각: Space Mono Bold, 52px, #EEEDFE
│  - 날짜: DM Sans Regular, 14px, #4a4670
│
VoiceFAB 컴포넌트 (중앙 배치)
│  - 원형 버튼 62px, 배경 #534AB7
│  - 외부 링 64px, 테두리 #2a2460
│  - 펄스 애니메이션 (3초 주기, opacity 0→0 scale 0.9→1.5)
│  - 라벨: "말하려면 탭하세요" 7.5px #3a3660
│
구분선 (0.5px, #18163A)
│
EventListFade 컴포넌트
│  - 섹션 타이틀: "오늘 일정" 7.5px uppercase
│  - ScrollView (스크롤 가능, 스크롤바 숨김)
│  - EventCard 리스트
│  - 하단 페이드 오버레이 (gradient transparent→#0E0C1F, 70px)
│  - "아래로 스크롤 · N개 일정" 힌트
│
BottomNav (고정)
```

## EventCard 컴포넌트

```tsx
interface EventCardProps {
  event: Event;
  isCompleted?: boolean;
  isNext?: boolean;      // 다음 일정 강조 (보라 테두리)
  isFading?: boolean;    // 페이드 영역 카드
}
```

스타일:
- 배경: #13112A, 테두리 0.5px #1E1B3A, radius 10px
- 완료: opacity 0.3, 제목 line-through
- 다음 일정: border-color #534AB7, border-width 1px
- 시간: Space Mono 7px #4a4670
- 컬러 바: 2.5px 세로 막대 (카테고리 색상)

## 페이드 로직

```typescript
// 4번째 카드부터 페이드 시작
// gradient overlay: 투명 → #0E0C1F
// 스크롤하면 페이드 아래로 이동
// 스크롤 완전히 내리면 페이드 사라짐
```

## 다크·라이트 모드

```typescript
// 시스템 설정 자동 추적
// 라이트: 배경 #F5F4FF, 카드 #FFFFFF, 텍스트 #26215C
// 다크: 배경 #0E0C1F, 카드 #13112A, 텍스트 #EEEDFE
// FAB 색상은 양쪽 동일 #534AB7
```

## VoiceFAB 탭 시 동작

```typescript
// 1. 햅틱 피드백 (expo-haptics Medium)
// 2. 플랜 체크 (useFeatureGate)
// 3. 사용량 체크 (QuotaTracker)
// 4. 음성 플로우 시작 (VoiceFlowOrchestrator)
// 5. 화면 전환: voice/listening.tsx
```

## UsageWarningBanner 위치

EventListFade 위, 구분선 아래에 렌더링.
조건: quota.percentage >= 80 && !dismissedToday

Animated API로 부드러운 등장/퇴장 애니메이션 포함.
