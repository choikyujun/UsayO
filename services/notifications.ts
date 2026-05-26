import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Event } from '../types/database';
import { calcNotifDate, buildNotifBody } from '../utils/notificationHelpers';

// Expo Go SDK 53+에서는 expo-notifications 모듈 로드 시 console.error를 방출.
// require 전에 실행 환경을 확인해 Expo Go에서는 아예 로드하지 않음.
const isExpoGo =
  Constants.appOwnership === 'expo' ||
  (Constants.executionEnvironment as string | undefined) === 'storeClient';

type NotifModule = typeof import('expo-notifications');
let N: NotifModule | null = null;

if (!isExpoGo) {
  N = require('expo-notifications') as NotifModule;
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge:  false,
      shouldShowBanner: true,
      shouldShowList:   true,
    }),
  });
  // Android 채널은 앱 시작 시 무조건 생성 (권한 여부와 무관)
  if (Platform.OS === 'android') {
    N.setNotificationChannelAsync('default', {
      name: 'YuSay 일정 알림',
      importance: N.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#534AB7',
      sound: 'default',
    }).then(() => console.log('[Notifications] Android channel created'))
      .catch(e => console.log('[Notifications] channel error:', e));
  }
}

// ── 설정에서 활성화된 offset 목록 읽기 ────────────────────────
export async function getEnabledOffsets(): Promise<number[]> {
  const [v10, v60] = await Promise.all([
    AsyncStorage.getItem('yusay_notif_before_10'),
    AsyncStorage.getItem('yusay_notif_before_60'),
  ]);
  // 저장값 없으면 기본 true
  const on10 = v10 === null ? true : v10 === '1';
  const on60 = v60 === null ? true : v60 === '1';
  const offsets: number[] = [];
  if (on60) offsets.push(60);
  if (on10) offsets.push(10);
  return offsets; // 큰 값 먼저 (먼 알림 먼저 예약)
}

// ── 알림 ID 인메모리 맵 (이벤트 1개 → 알림 N개) ─────────────
const notifIdMap = new Map<string, string[]>();

// ── 권한 요청 ─────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (!N) return false;

  const { status: existing } = await N.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await N.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });

  console.log('[Notifications] permission status:', status);

  return status === 'granted';
}

// ── 알림 예약 ─────────────────────────────────────────────────

export async function scheduleEventNotification(event: Event): Promise<string | null> {
  console.log('[Notif] scheduleEventNotification called, N loaded:', !!N, 'isExpoGo:', isExpoGo);
  if (!N) {
    console.log('[Notif] N is null — expo-notifications not loaded (Expo Go?)');
    return null;
  }

  await cancelEventNotification(event.id);

  // 설정에서 활성화된 offset 목록 가져오기
  const settingsOffsets = await getEnabledOffsets();

  // 이벤트에 per-event override가 있으면 그것만 사용, 없으면 설정값 사용
  let offsets: number[];
  if (event.notification_offset_minutes !== null && event.notification_offset_minutes !== undefined) {
    offsets = [event.notification_offset_minutes];
  } else {
    offsets = settingsOffsets;
  }

  if (offsets.length === 0) {
    console.log('[Notif] no offsets enabled — 예약 생략');
    return null;
  }

  console.log('[Notif] offsets to schedule:', offsets);
  console.log('[Notif] event start_at:', event.start_at);
  console.log('[Notif] now:', new Date().toISOString());

  const granted = await requestNotificationPermission();
  if (!granted) {
    console.log('[Notifications] 권한 없음 — 알림 예약 생략');
    return null;
  }

  const scheduledIds: string[] = [];
  for (const offset of offsets) {
    const eventWithOffset = { ...event, notification_offset_minutes: offset };
    const triggerDate = calcNotifDate(eventWithOffset);
    if (!triggerDate) {
      console.log(`[Notif] offset ${offset}min → triggerDate is past — 생략`);
      continue;
    }

    console.log(`[Notif] scheduling offset=${offset}min for:`, triggerDate.toISOString());
    try {
      const notifId = await N.scheduleNotificationAsync({
        content: {
          title:     '📅 ' + event.title,
          body:      buildNotifBody(eventWithOffset),
          data:      { eventId: event.id },
          channelId: 'default',
        },
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: triggerDate },
      });
      scheduledIds.push(notifId);
      console.log(`[Notif] scheduled id (offset=${offset}min):`, notifId);
    } catch (e) {
      console.error(`[Notifications] scheduleNotificationAsync 실패 (offset=${offset}):`, e);
    }
  }

  if (scheduledIds.length > 0) {
    notifIdMap.set(event.id, scheduledIds);
    const all = await N.getAllScheduledNotificationsAsync();
    console.log('[Notif] all scheduled count:', all.length);
    return scheduledIds[0];
  }

  return null;
}

// ── 알림 취소 ─────────────────────────────────────────────────

export async function cancelEventNotification(eventId: string): Promise<void> {
  if (!N) return;
  const ids = notifIdMap.get(eventId);
  if (!ids || ids.length === 0) return;
  for (const id of ids) {
    try {
      await N.cancelScheduledNotificationAsync(id);
    } catch (e) {
      console.log('[Notifications] cancel 실패:', e);
    }
  }
  notifIdMap.delete(eventId);
  console.log('[Notifications] 취소 완료:', eventId);
}

// ── 알림 재예약 ───────────────────────────────────────────────

export async function rescheduleEventNotification(event: Event): Promise<string | null> {
  return scheduleEventNotification(event);
}
