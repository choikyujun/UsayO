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
}

// ── 알림 ID 인메모리 맵 ────────────────────────────────────────
const notifIdMap = new Map<string, string>();

// ── 권한 요청 ─────────────────────────────────────────────────

export async function requestNotificationPermission(): Promise<boolean> {
  if (!N) return false;

  const { status: existing } = await N.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await N.requestPermissionsAsync({
    ios: { allowAlert: true, allowSound: true, allowBadge: false },
  });

  if (Platform.OS === 'android') {
    await N.setNotificationChannelAsync('default', {
      name: 'YuSay 일정 알림',
      importance: N.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  return status === 'granted';
}

// ── 알림 예약 ─────────────────────────────────────────────────

export async function scheduleEventNotification(event: Event): Promise<string | null> {
  if (!N) return null;

  await cancelEventNotification(event.id);

  if (event.notification_offset_minutes === null || event.notification_offset_minutes === undefined) {
    return null;
  }

  const triggerDate = calcNotifDate(event);
  if (!triggerDate) return null;

  const granted = await requestNotificationPermission();
  if (!granted) {
    console.log('[Notifications] 권한 없음 — 알림 예약 생략');
    return null;
  }

  try {
    const notifId = await N.scheduleNotificationAsync({
      content: {
        title: '📅 ' + event.title,
        body:  buildNotifBody(event),
        data:  { eventId: event.id },
      },
      trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });
    notifIdMap.set(event.id, notifId);
    console.log('[Notifications] 예약 완료:', event.title, '@', triggerDate.toLocaleString('ko-KR'));
    return notifId;
  } catch (e) {
    console.error('[Notifications] scheduleNotificationAsync 실패:', e);
    return null;
  }
}

// ── 알림 취소 ─────────────────────────────────────────────────

export async function cancelEventNotification(eventId: string): Promise<void> {
  if (!N) return;
  const notifId = notifIdMap.get(eventId);
  if (!notifId) return;
  try {
    await N.cancelScheduledNotificationAsync(notifId);
    notifIdMap.delete(eventId);
    console.log('[Notifications] 취소 완료:', eventId);
  } catch (e) {
    console.log('[Notifications] cancel 실패:', e);
  }
}

// ── 알림 재예약 ───────────────────────────────────────────────

export async function rescheduleEventNotification(event: Event): Promise<string | null> {
  return scheduleEventNotification(event);
}
