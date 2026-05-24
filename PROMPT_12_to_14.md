# PROMPT 12 — iOS·Android 위젯
> Claude Code에게 전달하는 YuSay 위젯 구현 프롬프트

---

당신은 React Native 위젯 개발 전문가입니다.
YuSay 앱의 홈 화면 위젯과 잠금화면 위젯을 구현해주세요.

## 위젯 종류 (3가지)

### 1. 스몰 위젯 (2×2) — Free 이상
```
┌──────────────┐
│  [🎙 버튼]  │
│             │
│   11:00     │
│ 디자인 리뷰  │
└──────────────┘
크기: 120×120px 기준
배경: #0E0C1F
요소: FAB 버튼 + 다음 일정 시간 + 제목
탭 → 앱 열기 + 음성 즉시 시작
```

### 2. 미디엄 위젯 (4×2) — Pro 이상
```
┌─────────────────────────┐
│  [🎙]    │ 11:00 디자인 리뷰  │
│  오늘 3개  │ 14:00 팀장 1:1    │
│  남음     │ 18:00 팀 저녁     │
└─────────────────────────┘
크기: 252×120px 기준
좌측: FAB + 오늘 남은 일정 수
우측: 오늘 일정 3개 리스트 (컬러바 + 시간 + 제목)
탭 → 해당 일정 상세로 이동
```

### 3. 잠금화면 위젯 — Pro 이상 (iOS 16+)
```
[🎙 YuSay] 11:00 디자인 리뷰
가로형 텍스트 위젯
다음 일정 시간 + 제목 표시
탭 → 앱 열기
```

## iOS 위젯 (WidgetKit)

```swift
// ios/YuSayWidget/YuSayWidget.swift
// SwiftUI 기반 WidgetKit

struct YuSayWidgetSmall: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "YuSaySmall", provider: Provider()) { entry in
      SmallWidgetView(entry: entry)
    }
    .configurationDisplayName("YuSay")
    .description("다음 일정 + 음성 버튼")
    .supportedFamilies([.systemSmall])
  }
}

// 데이터 공유: App Groups
// group.app.yusay.widget
// UserDefaults(suiteName: "group.app.yusay.widget")
```

## Android 위젯 (AppWidget)

```kotlin
// android/app/src/main/java/app/yusay/widget/YuSayWidget.kt
// RemoteViews 기반 AppWidget
// 데이터 공유: SharedPreferences
```

## React Native ↔ 위젯 데이터 전달

```typescript
// 매 일정 변경 시 위젯 데이터 업데이트
import * as WidgetKit from 'expo-widgets';

async function updateWidgetData() {
  const nextEvent = await EventService.getNextEvent();
  const todayCount = await EventService.getTodayCount();
  
  const widgetData = {
    nextEventTitle: nextEvent?.title ?? '일정 없음',
    nextEventTime: nextEvent?.start_at ?? null,
    todayRemainingCount: todayCount,
    updatedAt: new Date().toISOString(),
  };
  
  await WidgetKit.reloadAllTimelines();
  // SharedPreferences / App Groups에 JSON 저장
}
```

## 위젯 게이트 처리

```typescript
// 스몰 위젯: 모든 플랜 사용 가능
// 미디엄·잠금화면: Pro 이상만
// 위젯 선택 화면에서 Pro 뱃지 표시
// 무료 유저가 미디엄 위젯 추가 시도 → 업그레이드 안내
```

expo-widgets 또는 react-native-widget-extension 사용.
iOS/Android 네이티브 코드 모두 포함해주세요.

---

# PROMPT 13 — 팀 플랜 + WokyToky 연동
> Claude Code에게 전달하는 YuSay B2B 팀 기능 구현 프롬프트

---

당신은 B2B SaaS + React Native 전문가입니다.
YuSay 팀 플랜의 공유 캘린더와 WokyToky 근태 연동을 구현해주세요.

## 팀 플랜 기능

### 팀 공유 캘린더
```typescript
// 팀원이 "팀장님 내일 오후 2시에 회의 잡아줘" 발화 시:
// 1. intent: CREATE, target_user: "팀장"
// 2. 팀장 캘린더에 일정 추가 요청 전송
// 3. 팀장에게 알림: "최규진님이 회의를 요청했어요"
// 4. 팀장 승인 → 양쪽 캘린더에 등록

// 권한 규칙:
// - 본인 일정: 생성·수정·삭제 모두 가능
// - 타인 일정: 요청만 가능 (승인 필요)
// - 팀 공지 일정: admin·owner만 생성
```

### 팀 브로드캐스트 일정
```typescript
// "전체 공지: 다음 주 월요일 전체 회의" 발화 시:
// 1. intent: CREATE, scope: 'team_broadcast'
// 2. 모든 팀원 캘린더에 동시 등록
// 3. 푸시 알림 일괄 발송
// 4. 거부 불가 (공지 일정)

// Supabase Realtime 활용:
// team_events 테이블 변경 → 실시간 팀원 캘린더 업데이트
```

### 팀 빈 시간 찾기
```typescript
// "우리 팀 이번 주 공통 가능 시간 찾아줘" 발화 시:
// 1. 팀원 전체 캘린더 조회 (권한 있는 범위)
// 2. 겹치는 빈 슬롯 계산
// 3. 최소 30분 이상 슬롯 추천

async function findTeamAvailability(
  teamId: string,
  range: { start: Date; end: Date },
  minDuration: number  // 분
): Promise<TimeSlot[]>
```

## WokyToky 연동

WokyToky GitHub: https://github.com/choikyujin/wokytoky

### 연동 포인트
```typescript
// WokyToky 기존 테이블 구조 활용:
// workers: 직원 정보 (user_id, company_id, name, position)
// companies: 회사 정보 (id, name, settings)
// attendance: 근태 기록 (worker_id, date, clock_in, clock_out)

// YuSay가 추가로 활용:
// 출근 시간 → 오전 미팅 가능 시간 계산
// 퇴근 시간 → "퇴근 후" 기본값 계산
// 근무 일정 → 개인 캘린더 자동 반영

// 연동 방식: Supabase 같은 인스턴스 사용 시 foreign key
// 또는 별도 인스턴스 시 REST API 연동
```

### Supabase RLS (팀 권한)
```sql
-- 팀원은 같은 팀 이벤트만 조회 가능
CREATE POLICY "팀 이벤트 조회" ON public.events
  FOR SELECT USING (
    team_id IN (
      SELECT team_id FROM public.team_members 
      WHERE user_id = auth.uid()
    )
  );

-- 본인만 직접 수정, 타인 이벤트는 event_requests 테이블 경유
CREATE POLICY "이벤트 수정 본인만" ON public.events
  FOR UPDATE USING (auth.uid() = user_id);
```

### 관리자 대시보드 (웹)
```typescript
// Next.js 별도 웹앱 또는 인앱 웹뷰
// 팀 멤버 관리 (초대·제거·권한)
// 팀 캘린더 월간 뷰
// 팀 음성 사용량 통계
// 결제 관리 (팀 플랜 인원 추가·감소)
```

---

# PROMPT 14 — RevenueCat 결제 + 지역별 가격
> Claude Code에게 전달하는 YuSay 결제 시스템 구현 프롬프트

---

당신은 모바일 인앱결제 + RevenueCat 전문가입니다.
YuSay의 구독 결제 시스템을 구현해주세요.

## RevenueCat 상품 구성

```
Entitlements:
  pro_access: Pro 기능 전체
  team_access: Team 기능 전체

Offerings:
  default:
    - yusay_pro_monthly (월간)
    - yusay_pro_annual (연간, 17% 할인)
  team:
    - yusay_team_monthly

Products (App Store Connect / Google Play):
  com.yusay.pro.monthly
  com.yusay.pro.annual
  com.yusay.team.monthly
```

## 지역별 가격 설정

App Store Connect Pricing → 각 지역별 다른 가격 설정:
```
KR: ₩3,900 / ₩39,000 / ₩9,900
US: $3.99 / $39.99 / $9.99
JP: ¥480 / ¥4,800 / ¥1,200
SG: S$2.99 / S$29.99 / S$7.99
MY: RM8.90 / RM89 / RM22
TH: ฿69 / ฿690 / ฿179
PH: ₱119 / ₱1,190 / ₱299
ID: Rp29,000 / Rp290,000 / Rp75,000
VN: ₫49,000 / ₫490,000 / ₫129,000
```

RevenueCat이 자동으로 현지 통화·세금·환율 처리.

## RevenueCat SDK 초기화

```typescript
// app/_layout.tsx
import Purchases, { LOG_LEVEL } from 'react-native-purchases';

const REVENUECAT_KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!,
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY!,
};

await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
await Purchases.configure({
  apiKey: Platform.OS === 'ios' ? REVENUECAT_KEYS.ios : REVENUECAT_KEYS.android,
  appUserID: supabaseUser.id,  // Supabase user ID로 통일
});
```

## SubscriptionService (결제 연동)

```typescript
class SubscriptionService {
  // 현재 구독 상태 조회
  async getCustomerInfo(): Promise<CustomerInfo>
  
  // 플랜 확인
  async getCurrentPlan(): Promise<PlanType>
  
  // 구독 구매
  async purchaseSubscription(packageId: string): Promise<void>
  
  // 구독 복원 (앱 재설치 시)
  async restorePurchases(): Promise<void>
  
  // 7일 무료 체험 확인
  async isEligibleForTrial(): Promise<boolean>
  
  // 구독 취소 (관리 페이지로 이동)
  openManageSubscription(): void
}
```

## 업그레이드 모달 결제 흐름

```typescript
// UpgradeModal에서 결제 버튼 탭 시:
async function handleUpgrade(planType: 'pro' | 'team') {
  try {
    setLoading(true);
    const offerings = await Purchases.getOfferings();
    const pkg = offerings.current?.availablePackages.find(
      p => p.identifier === `yusay_${planType}_monthly`
    );
    
    if (!pkg) throw new Error('상품을 찾을 수 없어요');
    
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    
    if (customerInfo.entitlements.active['pro_access']) {
      // 결제 성공
      await updateSupabasePlan('pro');
      onSuccess();
    }
  } catch (e) {
    if (!e.userCancelled) {
      showError('결제 중 오류가 발생했어요. 다시 시도해주세요.');
    }
  } finally {
    setLoading(false);
  }
}
```

## Supabase 동기화 (웹훅)

```typescript
// supabase/functions/revenuecat-webhook/index.ts
// RevenueCat → Supabase Edge Function 웹훅

Deno.serve(async (req) => {
  const event = await req.json();
  
  switch (event.type) {
    case 'INITIAL_PURCHASE':
    case 'RENEWAL':
      await updateUserPlan(event.app_user_id, 'pro');
      break;
    case 'CANCELLATION':
    case 'EXPIRATION':
      await updateUserPlan(event.app_user_id, 'free');
      break;
    case 'TRIAL_STARTED':
      await startTrial(event.app_user_id);
      break;
  }
});
```

## 7일 무료 체험 UI

```tsx
// UpgradeModal 내 체험 뱃지
<TrialBadge>7일 무료 체험 가능</TrialBadge>
<Button onPress={() => handleUpgrade('pro')}>
  무료로 시작하기
</Button>
<Caption>7일 후 ₩3,900/월 · 언제든 취소 가능</Caption>
```

## 현지 결제 수단 (동남아)

```
RevenueCat + Google Play Billing → GoPay, GrabPay, OVO (인도네시아)
RevenueCat + App Store → 현지 앱스토어 결제 수단 자동 지원
직접 통합 불필요 (플랫폼이 처리)
```

전체 에러 핸들링 + 영수증 검증 로직 포함.
TypeScript strict, 테스트 코드 포함.
