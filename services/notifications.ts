import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { calcNotifDate, buildNotifBody, NOTIF_OFF } from '../utils/notificationHelpers';

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

// ── 이벤트별 예약 직렬화 락 (중복 예약 방지) ─────────────────
// 동일 이벤트에 대한 동시 scheduleEventNotification 호출을 직렬화해
// cancel → schedule 사이에 끼어드는 경쟁 조건으로 인한 중복 알림을 방지.
const schedulingQueue = new Map<string, Promise<string | null>>();

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

export function scheduleEventNotification(event: Event): Promise<string | null> {
  // 동일 이벤트의 이전 예약이 끝날 때까지 기다린 후 새 예약 시작 (중복 방지)
  const prev = schedulingQueue.get(event.id) ?? Promise.resolve(null);
  const next = prev.catch(() => null).then(() => _doSchedule(event));
  schedulingQueue.set(event.id, next);
  next.finally(() => {
    if (schedulingQueue.get(event.id) === next) schedulingQueue.delete(event.id);
  });
  return next;
}

async function _doSchedule(event: Event): Promise<string | null> {
  console.log('[Notif] scheduleEventNotification called, N loaded:', !!N, 'isExpoGo:', isExpoGo);
  if (!N) {
    console.log('[Notif] N is null — expo-notifications not loaded (Expo Go?)');
    return null;
  }

  await cancelEventNotification(event.id);

  // 설정에서 활성화된 offset 목록 가져오기
  const settingsOffsets = await getEnabledOffsets();

  // per-event 값 3-상태: NOTIF_OFF(-1)=명시적 off, null/undefined=미설정(기본값), >=0=오프셋
  let offsets: number[];
  const off = event.notification_offset_minutes;
  if (off === NOTIF_OFF) {
    offsets = []; // 명시적 알림 없음 — 위에서 cancel 완료 상태로 새 예약 생략
  } else if (off !== null && off !== undefined) {
    offsets = [off];
  } else {
    offsets = settingsOffsets; // 미설정 → 앱 기본값
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
          title:     event.title,
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

  // 1) 인메모리 맵에서 취소 (현재 세션에서 예약한 경우)
  const ids = notifIdMap.get(eventId) ?? [];
  for (const id of ids) {
    try { await N.cancelScheduledNotificationAsync(id); } catch {}
  }
  notifIdMap.delete(eventId);

  // 2) 앱 재시작 후 맵이 비워진 경우: 시스템 큐를 스캔해서 eventId 매칭 알림 전부 취소
  try {
    const all = await N.getAllScheduledNotificationsAsync();
    const stale = all.filter(n => (n.content.data as Record<string, unknown>)?.eventId === eventId);
    await Promise.all(stale.map(n => N!.cancelScheduledNotificationAsync(n.identifier).catch(() => {})));
    if (stale.length > 0) {
      console.log('[Notifications] 앱 재시작 후 스캔 취소:', eventId, '개수:', stale.length);
    }
  } catch (e) {
    console.log('[Notifications] 스캔 취소 실패:', e);
  }

  console.log('[Notifications] 취소 완료:', eventId);
}

// ── 알림 재예약 ───────────────────────────────────────────────

export async function rescheduleEventNotification(event: Event): Promise<string | null> {
  return scheduleEventNotification(event);
}

// ── per-event 알림 오프셋 저장 + 재예약 (공통 경로) ───────────────
// 모든 화면(홈/일간/주간/타임라인/반복)의 EditNotificationModal onSaved가 공통으로 사용.
// event.notification_offset_minutes에 확정된 값(오프셋 / NOTIF_OFF / null)이 이미 병합돼 있어야 함.
// 성공 시 true 반환 → 호출 화면이 필요하면 그때 목록 갱신.
export async function persistNotificationOffset(event: Event): Promise<boolean> {
  const { error } = await supabase
    .from('events')
    .update({ notification_offset_minutes: event.notification_offset_minutes, updated_at: new Date().toISOString() })
    .eq('id', event.id);
  if (error) {
    console.error('[Notifications] offset 저장 실패:', error.message);
    return false;
  }
  await rescheduleEventNotification(event).catch(e =>
    console.log('[Notifications] reschedule 실패:', e));
  return true;
}

// ── 알림 탭 핸들러 등록 ───────────────────────────────────────
// 알림 탭 시 홈 탭으로 이동. Expo Go에서는 N이 null이라 no-op.
export function setupNotificationTapHandler(): (() => void) | undefined {
  if (!N) return undefined;
  const sub = N.addNotificationResponseReceivedListener(() => {
    try {
      const { router } = require('expo-router') as typeof import('expo-router');
      router.replace('/(tabs)' as never);
    } catch {
      // 라우터 준비 전 탭 → 무시
    }
  });
  return () => sub.remove();
}
