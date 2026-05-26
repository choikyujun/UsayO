import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Event } from '../types/database';
import { calcNotifDate, buildNotifBody } from '../utils/notificationHelpers';

// 알림이 포그라운드에서도 표시되도록 핸들러 설정
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge:  false,
    shouldShowBanner: true,
    shouldShowList:   true,
  }),
});

// 알림 ID 스토리지 키: eventId → notificationId
const NOTIF_ID_KEY = (eventId: string) => `yusay_notif_${eventId}`;

// ── 권한 요청 ─────────────────────────────────────────────────────

/**
 * 알림 권한 요청. 이미 granted면 즉시 true 반환.
 * iOS: 반드시 호출 필요. Android 13+: POST_NOTIFICATIONS 권한 자동 처리.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowSound: true,
      allowBadge: false,
    },
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'YuSay 일정 알림',
      importance: Notifications.AndroidImportance.HIGH,
      sound: 'default',
    });
  }

  return status === 'granted';
}

// ── 알림 예약 ─────────────────────────────────────────────────────

/**
 * 이벤트의 알림을 예약. 기존 알림이 있으면 먼저 취소.
 * - notification_offset_minutes === null → 알림 없음 (기존 취소만)
 * - 이미 지난 시각 → 예약하지 않음
 * @returns 예약된 notificationId or null
 */
export async function scheduleEventNotification(event: Event): Promise<string | null> {
  // 기존 알림 먼저 취소
  await cancelEventNotification(event.id);

  if (event.notification_offset_minutes === null || event.notification_offset_minutes === undefined) {
    return null;
  }

  const triggerDate = calcNotifDate(event);
  if (!triggerDate) return null;

  const granted = await requestNotificationPermission();
  if (!granted) {
    console.warn('[Notifications] 권한 없음 — 알림 예약 생략');
    return null;
  }

  try {
    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: '📅 ' + event.title,
        body:  buildNotifBody(event),
        data:  { eventId: event.id },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
    });

    // eventId → notifId 저장 (AsyncStorage 없이 인메모리 맵으로 관리)
    notifIdMap.set(event.id, notifId);
    console.log('[Notifications] 예약 완료:', event.title, '@', triggerDate.toLocaleString('ko-KR'));
    return notifId;
  } catch (e) {
    console.error('[Notifications] scheduleNotificationAsync 실패:', e);
    return null;
  }
}

/**
 * 이벤트 알림 취소.
 */
export async function cancelEventNotification(eventId: string): Promise<void> {
  const notifId = notifIdMap.get(eventId);
  if (!notifId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notifId);
    notifIdMap.delete(eventId);
    console.log('[Notifications] 취소 완료:', eventId);
  } catch (e) {
    console.warn('[Notifications] cancel 실패:', e);
  }
}

/**
 * 이벤트 알림 reschedule (시간 변경, 알림 offset 변경 시).
 */
export async function rescheduleEventNotification(event: Event): Promise<string | null> {
  return scheduleEventNotification(event);
}

// ── 인메모리 notifId 맵 ───────────────────────────────────────────
// 앱 재시작 시 맵이 초기화되지만, Expo Notifications의 getPresentedNotificationsAsync()로
// 복원 가능 (현재는 단순화를 위해 인메모리만 사용)
const notifIdMap = new Map<string, string>();
