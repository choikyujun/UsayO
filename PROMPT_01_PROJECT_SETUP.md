# PROMPT 01 — 프로젝트 초기 설정
> Claude Code에게 전달하는 YuSay 프로젝트 셋업 프롬프트

---

당신은 React Native + Expo 전문 시니어 개발자입니다.
YuSay라는 Voice-First 캘린더 앱의 프로젝트를 초기 세팅해주세요.

## 앱 정보
- 앱명: YuSay
- 설명: 타이핑 없이 음성만으로 스케줄을 생성·수정·삭제하는 Voice-First 캘린더 앱
- 슬로건: "Yu say. It's done."
- 번들 ID: app.yusay (iOS) / app.yusay (Android)

## 기술 스택
```
Framework:   React Native + Expo SDK 52+
Router:      Expo Router v3 (파일 기반 라우팅)
Backend:     Supabase (DB + Auth + Realtime)
상태관리:    Zustand
UI:          NativeWind v4 (Tailwind CSS for RN)
결제:        RevenueCat SDK
STT:         expo-av (마이크) + Whisper API
TTS:         expo-speech
알림:        Expo Notifications
위젯:        react-native-widget-extension
```

## 디렉토리 구조
다음 구조로 프로젝트를 생성해주세요:
```
yusay/
├── app/                          # Expo Router 라우트
│   ├── (tabs)/
│   │   ├── index.tsx             # 홈 탭
│   │   ├── calendar.tsx          # 캘린더 탭
│   │   ├── upcoming.tsx          # 다가올 탭
│   │   └── settings.tsx          # 설정 탭
│   ├── onboarding/
│   │   ├── splash.tsx
│   │   ├── slide-1.tsx
│   │   ├── slide-2.tsx
│   │   ├── slide-3.tsx
│   │   ├── permission-mic.tsx
│   │   ├── calendar-connect.tsx
│   │   └── ready.tsx
│   ├── voice/
│   │   ├── listening.tsx
│   │   ├── confirm-create.tsx
│   │   ├── confirm-update.tsx
│   │   ├── confirm-delete.tsx
│   │   ├── query-result.tsx
│   │   └── fail-recover.tsx
│   └── _layout.tsx
├── components/
│   ├── voice/
│   │   ├── VoiceFAB.tsx          # 중앙 음성 버튼
│   │   ├── WaveformAnimation.tsx
│   │   └── ConfirmCard.tsx
│   ├── calendar/
│   │   ├── MonthlyView.tsx
│   │   ├── WeeklyView.tsx
│   │   ├── DailyView.tsx
│   │   └── YearlyView.tsx
│   ├── home/
│   │   ├── BigClock.tsx
│   │   ├── EventListFade.tsx
│   │   └── UsageWarningBanner.tsx
│   ├── gate/
│   │   ├── FeatureGate.tsx       # 기능 제한 래퍼
│   │   ├── UpgradeModal.tsx
│   │   └── UsageGateBar.tsx
│   └── shared/
│       ├── BottomNav.tsx
│       └── EventCard.tsx
├── services/
│   ├── voice/
│   │   ├── SpeechRecognitionService.ts
│   │   ├── IntentClassifierService.ts
│   │   ├── TTSService.ts
│   │   └── NoiseDetectorService.ts
│   ├── calendar/
│   │   ├── EventService.ts
│   │   ├── GoogleCalendarService.ts
│   │   └── AppleCalendarService.ts
│   ├── subscription/
│   │   ├── SubscriptionService.ts
│   │   ├── QuotaTracker.ts
│   │   └── FeatureGateService.ts
│   └── nlp/
│       ├── KoreanDateParser.ts
│       └── EventMatcher.ts
├── stores/
│   ├── useEventStore.ts
│   ├── useSubscriptionStore.ts
│   └── useVoiceStore.ts
├── constants/
│   ├── colors.ts                 # 브랜드 컬러
│   ├── featureGates.ts           # 게이트 정의
│   └── plans.ts                 # 요금제 정의
├── hooks/
│   ├── useFeatureGate.ts
│   ├── useVoiceRecorder.ts
│   └── useQuota.ts
├── types/
│   ├── event.ts
│   ├── subscription.ts
│   └── voice.ts
└── supabase/
    ├── client.ts
    └── migrations/
```

## 브랜드 컬러 (constants/colors.ts)
```typescript
export const colors = {
  primary: '#534AB7',      // Voice Purple
  deep: '#26215C',         // Night Ink
  accent: '#AFA9EC',       // Soft Wave
  whisper: '#EEEDFE',      // Background
  success: '#1D9E75',      // Done Green
  warning: '#EF9F27',
  danger: '#D85A30',
  error: '#E24B4A',
  // Dark theme
  darkBg: '#0E0C1F',
  darkCard: '#13112A',
  darkNav: '#09081A',
  darkBorder: '#1E1B3A',
} as const;
```

## 수행 작업
1. `npx create-expo-app yusay --template tabs` 실행
2. 필요한 패키지 전체 설치:
   ```bash
   npx expo install @supabase/supabase-js @react-native-async-storage/async-storage
   npx expo install zustand nativewind tailwindcss
   npx expo install expo-av expo-speech expo-notifications
   npx expo install react-native-purchases  # RevenueCat
   npx expo install expo-calendar expo-haptics
   ```
3. 위 디렉토리 구조대로 폴더 및 빈 파일 생성
4. constants/colors.ts 작성
5. app/_layout.tsx에 NativeWind, Supabase, Zustand Provider 설정
6. BottomNav 기본 구조 (홈/캘린더/FAB돌출/다가올/설정) 작성
7. package.json scripts 설정:
   ```json
   "start": "expo start",
   "ios": "expo run:ios",
   "android": "expo run:android",
   "test": "jest"
   ```
8. .env.example 파일 생성:
   ```
   EXPO_PUBLIC_SUPABASE_URL=
   EXPO_PUBLIC_SUPABASE_ANON_KEY=
   EXPO_PUBLIC_ANTHROPIC_API_KEY=
   EXPO_PUBLIC_REVENUECAT_IOS_KEY=
   EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=
   ```

모든 파일에 TypeScript strict mode 적용, ESLint + Prettier 설정도 포함해주세요.
