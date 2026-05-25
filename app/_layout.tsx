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
import { signInWithDevice } from '../services/auth/deviceAuth';
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
      // 0. Log device ID unconditionally (needed to build device_user_mapping)
      import('../services/auth/deviceAuth').then(m => m.getDeviceId())
        .then(id  => console.log('[Auth] deviceId:', id))
        .catch(e  => console.warn('[Auth] deviceId unavailable:', e));

      // 1. Device auth — always runs to ensure the session maps to the correct user.
      //    If the Edge Function is down, fall back to existing session or anonymous.
      try {
        const uid = await signInWithDevice();
        console.log('[Auth] device auth OK:', uid);
      } catch (deviceErr) {
        console.warn('[Auth] device auth failed, using fallback:', (deviceErr as Error).message);
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { data, error } = await supabase.auth.signInAnonymously();
          if (error) console.warn('[Auth] signInAnonymously FAILED:', error.message);
          else console.log('[Auth] signInAnonymously OK:', data.session?.user?.id ?? 'no user');
        } else {
          console.log('[Auth] kept existing session:', session.user.id);
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
          <Stack.Screen name="day"      options={{ animation: 'slide_from_right' }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
