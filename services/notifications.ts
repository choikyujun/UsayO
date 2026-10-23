import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { calcNotifDate, buildNotifBody, NOTIF_OFF } from '../utils/notificationHelpers';
import { isVirtualInstance, parseInstanceId } from '../utils/recurrenceHelpers';
import { localDateStr } from '../utils/timeHelpers';

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
      name: 'UsayO 일정 알림',
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

  // 완료된 일정은 예약하지 않는다. 완료 처리 자체가 취소를 호출하지만(setEventCompletion),
  // 완료된 뒤에도 알림 오프셋 편집·드래그 이동·음성 NOTIFICATION_UPDATE 같은 다른 경로가
  // 이 함수를 다시 부를 수 있다. 그때 알림이 되살아나던 것을 여기서 막는다(안전망).
  // 위 cancel은 이미 실행됐으므로 기존 예약도 함께 정리된 상태로 반환한다.
  // completed_at이 null로 돌아가면(완료 취소) 이 가드는 자연스럽게 풀려 재예약된다.
  if (event.completed_at) {
    console.log('[Notif] 완료된 일정 — 예약 생략:', event.id);
    return null;
  }

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
        },
        // channelId는 content가 아니라 trigger에 지정한다(SDK 54: DateTriggerInput.channelId).
        // 생성한 채널('default', 위 setNotificationChannelAsync)과 동일 ID여야 Android가
        // 해당 채널로 라우팅한다. content에 두면 무시되고 채널 라우팅이 누락된다.
        trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: triggerDate, channelId: 'default' },
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

// 취소 결과. 호출부는 여전히 fire-and-forget으로 쓰지만(예외를 밖으로 던지지 않는다),
// 로그와 이 반환값으로 성공/실패를 구분할 수 있어야 한다.
//   ok       — 모든 취소 시도가 성공했고 시스템 큐 스캔도 성공했다(= 남은 게 없다고 말할 수 있다)
//   targets  — 취소 대상으로 식별한 알림 수(인메모리 맵 ∪ 큐 스캔)
//   cancelled/failed — 실제 취소 호출의 성공/실패 수
//   scanned  — 시스템 큐 스캔 성공 여부. false면 맵에 없는 예약이 남아 있을 수 있다.
export interface CancelResult {
  ok: boolean;
  targets: number;
  cancelled: number;
  failed: number;
  scanned: boolean;
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function cancelEventNotification(eventId: string): Promise<CancelResult> {
  // Expo Go에서는 예약 자체가 일어나지 않는다 → 취소할 것이 없는 것이 정상.
  if (!N) return { ok: true, targets: 0, cancelled: 0, failed: 0, scanned: false };

  // 1) 인메모리 맵(현재 세션에서 예약한 것) + 2) 시스템 큐 스캔(앱 재시작 후 맵이 빈 경우)을
  //    합집합으로 모은다. 같은 id를 두 번 취소하지 않도록 Set을 쓴다.
  const targets = new Set<string>(notifIdMap.get(eventId) ?? []);
  let scanned = false;
  try {
    const all = await N.getAllScheduledNotificationsAsync();
    for (const n of all) {
      if ((n.content.data as Record<string, unknown>)?.eventId === eventId) targets.add(n.identifier);
    }
    scanned = true;
  } catch (e) {
    // 스캔 실패 = "남은 게 없다"고 말할 수 없다. 맵에 있는 것만 취소하고 ok=false로 보고한다.
    console.log(`[Notifications] 예약 목록 조회 실패: ${eventId}:`, errText(e));
  }

  let cancelled = 0;
  let failed = 0;
  for (const id of targets) {
    try {
      await N.cancelScheduledNotificationAsync(id);
      cancelled += 1;
    } catch (e) {
      failed += 1;
      console.log(`[Notifications] 개별 취소 실패: ${eventId} id=${id}:`, errText(e));
    }
  }
  notifIdMap.delete(eventId);

  const ok = failed === 0 && scanned;
  console.log(
    `[Notifications] 취소 ${ok ? '완료' : '불완전'}: ${eventId}` +
    ` targets=${targets.size} cancelled=${cancelled} failed=${failed} scan=${scanned ? 'ok' : 'fail'}`,
  );
  return { ok, targets: targets.size, cancelled, failed, scanned };
}

// ── 반복 일정 부분 삭제('이번만' / '이후 전체') 후 알림 정리 ──────────
// 현재 구조에서 반복 일정의 알림은 **부모 행의 start_at 하나**만 예약된다
// (scheduleEventNotification은 DB 행만 받고 가상 인스턴스를 받지 않는다).
// 따라서 삭제된 범위가 그 부모 start_at의 발생분을 포함할 때만 취소해야 한다.
// 무조건 취소하면 남아 있는 다른 회차의 알림까지 사라진다.
export async function reconcileRecurringDeletion(
  eventId: string,
  scope: 'this' | 'future',
): Promise<void> {
  const parsed = isVirtualInstance(eventId) ? parseInstanceId(eventId) : null;
  const parentId = parsed?.parentId ?? eventId;

  // 가상 인스턴스가 아니다 = 부모 행 자체를 지웠다 → 예약된 그 발생분이 사라진 것이 확실.
  if (!parsed) {
    await cancelEventNotification(parentId);
    return;
  }

  const { data, error } = await supabase
    .from('events').select('start_at').eq('id', parentId).maybeSingle();
  if (error || !data) {
    console.log(`[Notifications] 반복 정리 — 부모 조회 실패: ${parentId}:`, error?.message ?? 'not found');
    return;
  }

  // instanceDate는 makeInstanceId가 로컬 날짜로 만든 값이므로 부모도 로컬 날짜로 비교한다.
  const parentDay = localDateStr(new Date(data.start_at));
  const hit = scope === 'this'
    ? parentDay === parsed.instanceDate
    : parentDay >= parsed.instanceDate;

  if (hit) {
    await cancelEventNotification(parentId);
  } else {
    console.log(
      `[Notifications] 반복 정리 — 예약분(${parentDay})이 삭제 범위(${scope} ${parsed.instanceDate}) 밖 — 유지: ${parentId}`,
    );
  }
}

// ── 알림 content·트리거에 영향을 주는 필드 ────────────────────
// 예약된 알림의 제목·본문·발화 시각은 위 _doSchedule이 예약하는 순간의 값으로 고정된다.
// 따라서 아래 필드가 하나라도 바뀌면 반드시 재예약해야 하고, 그대로면 재예약할 이유가 없다.
//   title                       → content.title + buildNotifBody 문구
//   start_at                    → calcNotifDate(발화 시각)
//   is_all_day                  → calcNotifDate 분기 + buildNotifBody 문구
//   notification_offset_minutes → calcNotifDate + buildNotifBody 문구
//   completed_at                → 예약 여부 자체를 가른다(위 완료 가드)
// location·description·attendees·color·category는 content에 들어가지 않는다 — 제외.
const NOTIF_CONTENT_KEYS = [
  'title', 'start_at', 'is_all_day', 'notification_offset_minutes', 'completed_at',
] as const;

type NotifContentKey = (typeof NOTIF_CONTENT_KEYS)[number];

export function diffNotifContent(before: Event, after: Event): NotifContentKey[] {
  return NOTIF_CONTENT_KEYS.filter(k => (before[k] ?? null) !== (after[k] ?? null));
}

// 재예약 판정 결과. 로그와 이 반환값으로 "왜 재예약했는지 / 왜 건너뛰었는지"를 구분한다.
export type RescheduleOutcome =
  | 'rescheduled'            // content 필드가 바뀌어 재예약했다
  | 'skipped-unchanged'      // content 필드가 그대로다 — 재예약할 이유가 없다
  | 'skipped-completed'      // 수정은 됐지만 완료된 일정이다(완료 가드 유지)
  | 'skipped-instance-scope' // 반복 일정의 일부 회차만 수정 — 부모 알림과 무관
  | 'skipped-notfound';      // 수정 후 행을 다시 읽지 못했다

// 수정 후 값으로 재예약한다.
// before를 주면 content 필드가 실제로 바뀐 경우에만 재예약하고,
// before가 null이면(수정 전 값을 모르면) 안전한 쪽으로 무조건 재예약한다.
// after는 반드시 "수정 후" 객체여야 한다 — DB 응답이거나 수정 후 재조회 결과.
export async function rescheduleIfNotifContentChanged(
  before: Event | null,
  after: Event,
  caller: string,
): Promise<RescheduleOutcome> {
  if (before) {
    const changed = diffNotifContent(before, after);
    if (changed.length === 0) {
      console.log(`[Notif] 재예약 생략 — content 필드 변화 없음 (caller=${caller} id=${after.id})`);
      return 'skipped-unchanged';
    }
    console.log(`[Notif] 재예약 — 변경 필드=${changed.join(',')} (caller=${caller} id=${after.id})`);
  } else {
    console.log(`[Notif] 재예약 — 수정 전 값을 몰라 무조건 재예약 (caller=${caller} id=${after.id})`);
  }

  // 완료된 일정은 _doSchedule이 선취소만 하고 예약을 건너뛴다(완료 가드).
  // 그 경우에도 호출은 해서 남아 있던 예약을 거둔다 — 다만 결과는 재예약이 아니라고 보고한다.
  await scheduleEventNotification(after);
  if (after.completed_at) {
    console.log(`[Notif] 완료된 일정 — 수정됐지만 재예약하지 않음 (caller=${caller} id=${after.id})`);
    return 'skipped-completed';
  }
  return 'rescheduled';
}

// 수정 모달 전용 — 저장이 끝난 뒤 DB 행을 다시 읽어 재예약을 판정한다.
// 모달이 쥐고 있는 Event는 수정 전 값이고 반복 일정이면 가상 인스턴스이므로,
// "수정 후 값"은 DB에서 다시 읽어야 한다. 반드시 쓰기를 await로 끝낸 뒤 호출할 것.
export async function reconcileNotifAfterEdit(
  before: Event,
  scope: 'this' | 'future' | 'all',
  caller: string,
): Promise<RescheduleOutcome> {
  // 반복 일정을 회차 단위로 수정한 경우('이번만' / '이후 전체'), 바뀐 값은
  // event_exceptions나 새로 분리된 행에 들어가고 부모 행의 content는 그대로다.
  // 현재 구조에서 알림은 부모 행 하나만 예약되므로 여기서 재예약할 것이 없다.
  // 부모 알림을 괜히 다시 깔면 reconcileRecurringDeletion이 이미 취소해 둔
  // 회차의 알림을 되살릴 수 있다. 구조적 한계로 남긴다(설계 제안 참조).
  if (scope !== 'all') {
    console.log(
      `[Notif] 재예약 생략 — 반복 회차 범위 수정(scope=${scope})은 부모 알림과 무관` +
      ` (caller=${caller} id=${before.id})`,
    );
    return 'skipped-instance-scope';
  }

  const realId = isVirtualInstance(before.id)
    ? (parseInstanceId(before.id)?.parentId ?? before.id)
    : before.id;

  const { data, error } = await supabase
    .from('events').select('*').eq('id', realId).maybeSingle();
  if (error || !data) {
    console.log(
      `[Notif] 재예약 생략 — 수정 후 행 조회 실패 (caller=${caller} id=${realId}):`,
      error?.message ?? 'not found',
    );
    return 'skipped-notfound';
  }

  // 가상 인스턴스의 Event는 부모 행 + 예외 override를 합성한 값이라 DB 행과 직접
  // 비교할 수 없다. 그럴 때는 before를 버리고 무조건 재예약한다.
  return rescheduleIfNotifContentChanged(
    before.id === realId ? before : null,
    data as Event,
    caller,
  );
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
