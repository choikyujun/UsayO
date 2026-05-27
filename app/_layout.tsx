import 'react-native-url-polyfill/auto';
import '../global.css';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { LogBox, Platform, Text, TextInput, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// 개발 빌드에서 노란 배너 완전 억제 (console.error는 여전히 터미널에 출력됨)
LogBox.ignoreAllLogs();
SplashScreen.preventAutoHideAsync();

// Apply Pretendard as the global default for all Text and TextInput components
(Text as any).defaultProps = (Text as any).defaultProps ?? {};
(Text as any).defaultProps.style = [{ fontFamily: 'Pretendard-Regular' }];
(TextInput as any).defaultProps = (TextInput as any).defaultProps ?? {};
(TextInput as any).defaultProps.style = [{ fontFamily: 'Pretendard-Regular' }];
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { useColors } from '../constants/colors';
import { ThemeProvider } from '../contexts/ThemeContext';
import { UndoToastProvider } from '../contexts/UndoToastContext';
import UndoToast from '../components/UndoToast';
import { supabase } from '../lib/supabase';
import { signInWithDevice } from '../services/auth/deviceAuth';
import { subscriptionService } from '../services/subscription/SubscriptionService';
import { audioSessionService } from '../services/voice/AudioSessionService';
import { noiseDetector } from '../services/voice/NoiseDetectorService';
import { requestNotificationPermission, setupNotificationTapHandler } from '../services/notifications';

// Valid onboarding step → route segment map
const STEP_ROUTES: Record<string, string> = {
  splash: 'splash',
  slides: 'slides',
  'permission-mic': 'permission-mic',
  'calendar-connect': 'calendar-connect',
  ready: 'ready',
};

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Pretendard-Regular':  require('../assets/fonts/Pretendard-Regular.ttf'),
    'Pretendard-Medium':   require('../assets/fonts/Pretendard-Medium.ttf'),
    'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.ttf'),
    'Pretendard-Bold':     require('../assets/fonts/Pretendard-Bold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <UndoToastProvider>
        <AppRoot />
      </UndoToastProvider>
    </ThemeProvider>
  );
}

// ThemeProvider 안에서 렌더링 — useColors() 사용 가능
function AppRoot() {
  const colorScheme = useColorScheme();
  const colors = useColors();

  // 장기 세션 중 토큰 만료 → 자동 재인증
  // initializing 중에는 무시 (signOut({ scope: 'local' }) 가 SIGNED_OUT을 발생시키므로)
  const initDoneRef = useRef(false);
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' && initDoneRef.current) {
        signInWithDevice().catch(e =>
          console.log('[Auth] session expired, re-auth failed:', (e as Error).message),
        );
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    audioSessionService.preinit()
      .then(() => noiseDetector.measureBackgroundNoise())
      .then(noise => {
        audioSessionService.setCachedNoise(noise.snr, noise.recommendation);
        return audioSessionService.cleanup();
      })
      .catch(() => {});
    requestNotificationPermission().catch(() => {});
    return setupNotificationTapHandler();
  }, []);

  useEffect(() => {
    (async () => {
      // 0. Device ID 사전 확인 (로그용)
      import('../services/auth/deviceAuth').then(m => m.getDeviceId())
        .then(({ id, source }) => console.log('[Auth] deviceId pre-check:', source, id))
        .catch(e => console.log('[Auth] deviceId unavailable:', (e as Error).message));

      // 1. Device auth — always runs to ensure the session maps to the correct user.
      try {
        const uid = await signInWithDevice();
        console.log('[Auth] device auth OK:', uid);
      } catch (deviceErr) {
        // Edge Function 실패: 기존 세션 유지 (signOut 호출 금지 — 세션 날아감)
        const errMsg = (deviceErr as Error).message;
        console.log('[Auth] device auth FAILED:', errMsg);
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          console.log('[Auth] kept existing session:', session.user.id);
        } else {
          // 진짜 세션이 없을 때만 익명 로그인 (마지막 수단)
          console.log('[Auth] no existing session — falling back to anonymous');
          const { data, error } = await supabase.auth.signInAnonymously();
          if (error) console.log('[Auth] signInAnonymously FAILED:', error.message);
          else console.log('[Auth] signInAnonymously OK:', data.session?.user?.id ?? 'no user');
        }
      }
      // 초기 인증 완료 — 이후 SIGNED_OUT은 진짜 토큰 만료로 처리
      initDoneRef.current = true;

      // 2. 온보딩 완료 여부 확인
      const done = await AsyncStorage.getItem('onboarding_complete');
      if (!done) {
        const saved = await AsyncStorage.getItem('onboarding_step');
        const step  = (saved && STEP_ROUTES[saved]) ? saved : 'splash';
        router.replace(`/onboarding/${step}` as never);
        return;
      }

      // Initialize RevenueCat
      const rcKey = Platform.OS === 'ios'
        ? process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!
        : process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY!;

      if (rcKey && !rcKey.includes('sandbox_xxx')) {
        await Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        const userId = (await supabase.auth.getUser()).data.user?.id;
        Purchases.configure({ apiKey: rcKey, appUserID: userId });
        subscriptionService.syncFromRevenueCat().catch(() => {});
      }
    })();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <AppStack />
      <UndoToast />
    </GestureHandlerRootView>
  );
}

// Stack 배경도 테마 색으로 — 슬라이드 애니메이션 중 흰 배경 노출 방지
function AppStack() {
  const colors = useColors();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
      <Stack.Screen name="voice"    options={{ presentation: 'modal' }} />
      <Stack.Screen name="settings" options={{ headerShown: false, animation: 'slide_from_right' }} />
      <Stack.Screen name="day"      options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="week"     options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="month"    options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="year"     options={{ animation: 'slide_from_right' }} />
    </Stack>
  );
}
