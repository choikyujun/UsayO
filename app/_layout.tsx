import 'react-native-url-polyfill/auto';
import '../global.css';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { ThemeProvider } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabase';
import { subscriptionService } from '../services/subscription/SubscriptionService';
import { audioSessionService } from '../services/voice/AudioSessionService';

// Valid onboarding step → route segment map
const STEP_ROUTES: Record<string, string> = {
  splash: 'splash',
  slides: 'slides',
  'permission-mic': 'permission-mic',
  'calendar-connect': 'calendar-connect',
  ready: 'ready',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    // 마이크 권한 + 오디오 세션 사전 초기화 → FAB 탭 시 딜레이 최소화
    audioSessionService.preinit().catch(() => {});
  }, []);

  useEffect(() => {
    (async () => {
      // 1. 항상 먼저 세션 확보 (온보딩 여부 무관)
      const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
      console.log('[Auth] getSession:', session?.user?.id ?? 'null', sessionErr?.message ?? '');

      if (!session) {
        console.log('[Auth] no session → signInAnonymously...');
        const { data, error } = await supabase.auth.signInAnonymously();
        if (error) {
          // 이 메시지가 "Anonymous sign-ins are disabled" 이면
          // Supabase 대시보드 → Authentication → Providers → Anonymous 활성화 필요
          console.warn('[Auth] signInAnonymously FAILED:', error.message, '| status:', error.status);
        } else {
          console.log('[Auth] signInAnonymously OK:', data.session?.user?.id ?? 'no user');
        }
      }

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
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="voice"    options={{ presentation: 'modal' }} />
          <Stack.Screen name="settings" options={{ headerShown: false }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
