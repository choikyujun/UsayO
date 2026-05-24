import { router } from 'expo-router';
import { Mic } from 'lucide-react-native';
import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import FeatureGate from '../components/FeatureGate';
import {
  CATEGORY_COLORS,
  DAYS_KO,
  MONTHS_KO,
  addDays,
  formatTime12,
  getFreeSlots,
  getWeekStart,
  groupEventsByDate,
  toDateStr,
} from '../components/calendar/calendarUtils';
import { AppTheme, useColors } from '../constants/colors';
import { useCalendarEvents } from '../hooks/useCalendarEvents';
import { Event } from '../types/database';

type Tab = 'week' | 'month' | 'ai';
const TAB_LABELS: Record<Tab, string> = { week: '이번 주', month: '이번 달', ai: 'AI 빈 슬롯' };
const TAB_ORDER: Tab[] = ['week', 'month', 'ai'];

function thisWeekRange() {
  const ws = getWeekStart(new Date());
  return { start: toDateStr(ws), end: toDateStr(addDays(ws, 6)) };
}

function thisMonthRange() {
  const n = new Date();
  const y = n.getFullYear(), m = n.getMonth();
  return {
    start: `${y}-${String(m + 1).padStart(2, '0')}-01`,
    end: toDateStr(new Date(y, m + 1, 0)),
  };
}

function getWeekOfMonth(date: Date): number {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  return Math.ceil((date.getDate() + first.getDay()) / 7);
}

interface FreeSlot {
  date: Date;
  startHour: number;
  endHour: number;
  durationHours: number;
}

function computeFreeSlots(weekDays: Date[], byDate: Record<string, Event[]>): FreeSlot[] {
  const now = new Date();
  const slots: FreeSlot[] = [];

  for (const day of weekDays) {
    if (day < now && toDateStr(day) !== toDateStr(now)) continue;
    const ds = toDateStr(day);
    const dayEvts = byDate[ds] ?? [];
    for (const s of getFreeSlots(dayEvts, 9, 21)) {
      slots.push({ date: day, startHour: s.startH, endHour: s.endH, durationHours: s.endH - s.startH });
    }
  }

  return slots.sort((a, b) => b.durationHours - a.durationHours).slice(0, 3);
}

function dDayFrom(event: Event): number {
  return Math.ceil((new Date(event.start_at).getTime() - Date.now()) / 86_400_000);
}

export default function UpcomingScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [tab, setTab] = useState<Tab>('week');
  const fadeAnim = useRef(new Animated.Value(1)).current;

  const { start: wStart, end: wEnd } = thisWeekRange();
  const { start: mStart, end: mEnd } = thisMonthRange();

  const { events: weekEvents } = useCalendarEvents(wStart, wEnd);
  const { events: monthEvents } = useCalendarEvents(mStart, mEnd);

  const weekStart = getWeekStart(new Date());
  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const byDateWeek  = groupEventsByDate(weekEvents);
  const byDateMonth = groupEventsByDate(monthEvents);
  const freeSlots   = computeFreeSlots(weekDays, byDateWeek);

  const now = new Date();
  const nextImportant = monthEvents.find(
    e => e.category === 'important' && new Date(e.start_at) > now
  );
  const ddayNum = nextImportant ? dDayFrom(nextImportant) : null;

  const allFuture = weekEvents.filter(e => new Date(e.start_at) > now);
  const nextEvent = allFuture[0] ?? null;

  function switchTab(newTab: Tab) {
    if (newTab === tab) return;
    Animated.timing(fadeAnim, { toValue: 0, duration: 80, useNativeDriver: true }).start(() => {
      setTab(newTab);
      Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    });
  }

  const weeklyBuckets: Record<number, number> = {};
  for (const e of monthEvents) {
    const wk = getWeekOfMonth(new Date(e.start_at));
    weeklyBuckets[wk] = (weeklyBuckets[wk] ?? 0) + 1;
  }
  const maxWeek = 5;
  let freestWeek = 1;
  let minCount = Infinity;
  for (let w = 1; w <= maxWeek; w++) {
    const c = weeklyBuckets[w] ?? 0;
    if (c < minCount) { minCount = c; freestWeek = w; }
  }

  return (
    <View style={styles.root}>
      {nextImportant && ddayNum !== null && (
        <View style={styles.ddayBanner}>
          <View style={styles.ddayBadge}>
            <Text style={styles.ddayNum}>D-{ddayNum}</Text>
          </View>
          <Text style={styles.ddayTitle} numberOfLines={1}>{nextImportant.title}</Text>
          <Text style={styles.ddayDate}>
            {new Date(nextImportant.start_at).getMonth() + 1}월 {new Date(nextImportant.start_at).getDate()}일
          </Text>
        </View>
      )}

      <View style={styles.tabs}>
        {TAB_ORDER.map(t => {
          const active = t === tab;
          return (
            <Pressable key={t} style={[styles.tab, active && styles.tabActive]} onPress={() => switchTab(t)}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{TAB_LABELS[t]}</Text>
            </Pressable>
          );
        })}
      </View>

      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {tab === 'week' && (
          <WeekView
            weekDays={weekDays}
            byDate={byDateWeek}
            nextEventId={nextEvent?.id}
          />
        )}
        {tab === 'month' && (
          <MonthView
            monthEvents={monthEvents}
            byDate={byDateMonth}
            freestWeek={freestWeek}
          />
        )}
        {tab === 'ai' && (
          <AISlotView freeSlots={freeSlots} />
        )}
      </Animated.View>
    </View>
  );
}

// ── WeekView ──────────────────────────────────────────────

function WeekView({
  weekDays, byDate, nextEventId,
}: { weekDays: Date[]; byDate: Record<string, Event[]>; nextEventId?: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const today = toDateStr(new Date());
  const tomorrow = toDateStr(addDays(new Date(), 1));

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.weekScroll}>
      {weekDays.map((day, i) => {
        const ds = toDateStr(day);
        const events = byDate[ds] ?? [];
        const isToday = ds === today;
        const isTomorrow = ds === tomorrow;

        let dayLabel = `${DAYS_KO[day.getDay()]} ${day.getMonth() + 1}/${day.getDate()}`;
        if (isToday)    dayLabel = `오늘 · ${dayLabel}`;
        if (isTomorrow) dayLabel = `내일 · ${dayLabel}`;

        return (
          <View key={ds} style={styles.dayGroup}>
            <View style={[styles.dayGroupHeader, isToday && styles.dayGroupHeaderToday]}>
              <Text style={[styles.dayGroupTitle, isToday && styles.dayGroupTitleToday]}>
                {dayLabel}
              </Text>
              {isToday && <View style={styles.todayDot} />}
            </View>

            {events.length === 0 ? (
              <Text style={styles.emptyDayText}>일정 없음 · 여유로운 하루</Text>
            ) : (
              events.map(e => (
                <EventItem key={e.id} event={e} isSoon={e.id === nextEventId} />
              ))
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ── MonthView ─────────────────────────────────────────────

function MonthView({
  monthEvents, byDate, freestWeek,
}: { monthEvents: Event[]; byDate: Record<string, Event[]>; freestWeek: number }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const byWeek: Record<number, Event[]> = {};
  for (const e of monthEvents) {
    const wk = getWeekOfMonth(new Date(e.start_at));
    (byWeek[wk] ??= []).push(e);
  }
  const weeks = Array.from(new Set(monthEvents.map(e => getWeekOfMonth(new Date(e.start_at))))).sort();

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.weekScroll}>
      <View style={styles.insightCard}>
        <Text style={styles.insightIcon}>✨</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.insightTitle}>이번 달 가장 여유로운 주는 {freestWeek}주차예요</Text>
          <Text style={styles.insightSub}>그때 중요한 약속을 잡아보는 건 어떨까요?</Text>
        </View>
      </View>

      {weeks.map(wk => {
        const evts = byWeek[wk] ?? [];
        return (
          <View key={wk} style={styles.weekGroup}>
            <View style={styles.weekHeader}>
              <Text style={styles.weekTitle}>{wk}주차</Text>
              <View style={styles.weekUnderline} />
            </View>
            {evts.map(e => {
              const dDay = Math.ceil((new Date(e.start_at).getTime() - Date.now()) / 86_400_000);
              return (
                <EventItem
                  key={e.id}
                  event={e}
                  ddayLabel={dDay >= 0 && dDay <= 30 ? `D-${dDay}` : undefined}
                />
              );
            })}
          </View>
        );
      })}

      {monthEvents.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>이번 달 일정이 없어요</Text>
        </View>
      )}
    </ScrollView>
  );
}

// ── AISlotView ────────────────────────────────────────────

function AISlotView({ freeSlots }: { freeSlots: FreeSlot[] }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <FeatureGate feature="ai_slot">
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.weekScroll}>
        <Text style={styles.aiSlotHint}>
          💡 음성으로 &apos;이번 주 빈 시간 찾아줘&apos;라고 말해도 돼요
        </Text>
        {freeSlots.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>빈 시간이 없어요</Text>
            <Text style={styles.emptyHint}>이번 주 일정이 꽉 찼네요!</Text>
          </View>
        ) : (
          freeSlots.map((slot, i) => (
            <FreeSlotCard key={i} slot={slot} index={i} />
          ))
        )}
      </ScrollView>
    </FeatureGate>
  );
}

// ── EventItem ─────────────────────────────────────────────

function EventItem({
  event, isSoon, ddayLabel,
}: { event: Event; isSoon?: boolean; ddayLabel?: string }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const color = CATEGORY_COLORS[event.category ?? 'work'];
  const start = new Date(event.start_at);

  return (
    <View style={styles.eventItem}>
      <View style={[styles.eventBar, { backgroundColor: color }]} />
      <View style={styles.eventBody}>
        <Text style={styles.eventTime}>{formatTime12(start)}</Text>
        <Text style={styles.eventTitle} numberOfLines={1}>{event.title}</Text>
        {event.location ? (
          <Text style={styles.eventLoc} numberOfLines={1}>{event.location}</Text>
        ) : null}
      </View>
      {isSoon && (
        <View style={styles.soonBadge}>
          <Text style={styles.soonText}>곧</Text>
        </View>
      )}
      {ddayLabel && (
        <View style={styles.ddaySmallBadge}>
          <Text style={styles.ddaySmallText}>{ddayLabel}</Text>
        </View>
      )}
    </View>
  );
}

// ── FreeSlotCard ──────────────────────────────────────────

function FreeSlotCard({ slot, index }: { slot: FreeSlot; index: number }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const startH = Math.floor(slot.startHour);
  const endH   = Math.ceil(slot.endHour);
  const dur    = Math.round(slot.durationHours * 10) / 10;

  function formatH(h: number) {
    return h < 12 ? `오전 ${h}시` : h === 12 ? '정오' : `오후 ${h - 12}시`;
  }

  const labels = ['🥇 가장 긴 여유', '🥈 두 번째', '🥉 세 번째'];

  return (
    <View style={styles.slotCard}>
      <View style={styles.slotCardHeader}>
        <Text style={styles.slotRank}>{labels[index]}</Text>
        <View style={styles.slotDurBadge}>
          <Text style={styles.slotDur}>{dur}h 여유</Text>
        </View>
      </View>
      <Text style={styles.slotDate}>
        {MONTHS_KO[slot.date.getMonth()]} {slot.date.getDate()}일 ({DAYS_KO[slot.date.getDay()]})
      </Text>
      <Text style={styles.slotTime}>{formatH(startH)} – {formatH(endH)}</Text>
      <Pressable
        style={styles.slotCta}
        onPress={() => router.push('/voice')}
      >
        <Mic size={16} color="#fff" />
        <Text style={styles.slotCtaText}>일정 잡기</Text>
      </Pressable>
    </View>
  );
}

// ── styles ────────────────────────────────────────────────

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    ddayBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      backgroundColor: c.card,
      borderBottomWidth: 0.5,
      borderColor: c.border,
      gap: 10,
    },
    ddayBadge: {
      backgroundColor: c.warning + '25',
      paddingHorizontal: 10,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.warning + '60',
    },
    ddayNum: { fontSize: 12, color: c.warning, fontWeight: '800' },
    ddayTitle: { flex: 1, fontSize: 13, color: c.textPrimary, fontWeight: '600' },
    ddayDate: { fontSize: 11, color: c.textMuted },
    tabs: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 6,
      borderBottomWidth: 0.5,
      borderColor: c.border,
    },
    tab: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.border,
    },
    tabActive: { backgroundColor: c.primary, borderColor: c.primary },
    tabText: { fontSize: 13, color: c.textMuted, fontWeight: '600' },
    tabTextActive: { color: '#fff' },
    content: { flex: 1 },
    weekScroll: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32, gap: 4 },
    dayGroup: { marginBottom: 16 },
    dayGroupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    dayGroupHeaderToday: {},
    dayGroupTitle: { fontSize: 13, fontWeight: '700', color: c.textMuted },
    dayGroupTitleToday: { color: c.success },
    todayDot: {
      width: 6, height: 6, borderRadius: 3, backgroundColor: c.success,
    },
    emptyDayText: { fontSize: 12, color: c.textMuted, paddingLeft: 4, paddingVertical: 6 },
    eventItem: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 10,
      marginBottom: 6,
      overflow: 'hidden',
      gap: 0,
    },
    eventBar: { width: 3, alignSelf: 'stretch' },
    eventBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
    eventTime: { fontSize: 10, color: c.textMuted, marginBottom: 2 },
    eventTitle: { fontSize: 14, fontWeight: '600', color: c.textPrimary },
    eventLoc: { fontSize: 11, color: c.textMuted, marginTop: 2 },
    soonBadge: {
      backgroundColor: c.success + '25',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      marginRight: 10,
      borderWidth: 1,
      borderColor: c.success + '50',
    },
    soonText: { fontSize: 11, color: c.success, fontWeight: '700' },
    ddaySmallBadge: {
      backgroundColor: c.warning + '20',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      marginRight: 10,
      borderWidth: 1,
      borderColor: c.warning + '50',
    },
    ddaySmallText: { fontSize: 11, color: c.warning, fontWeight: '700' },
    weekGroup: { marginBottom: 20 },
    weekHeader: { marginBottom: 8, gap: 4 },
    weekTitle: { fontSize: 13, fontWeight: '700', color: c.accent },
    weekUnderline: {
      height: 1.5,
      width: 40,
      backgroundColor: c.primary,
      borderRadius: 1,
      opacity: 0.6,
    },
    insightCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: c.primary + '20',
      borderWidth: 1,
      borderColor: c.primary + '40',
      borderRadius: 12,
      padding: 14,
      marginBottom: 16,
    },
    insightIcon: { fontSize: 22 },
    insightTitle: { fontSize: 13, fontWeight: '700', color: c.textPrimary, marginBottom: 3 },
    insightSub: { fontSize: 11, color: c.textMuted },
    aiSlotHint: {
      fontSize: 12,
      color: c.textMuted,
      marginBottom: 12,
      lineHeight: 18,
    },
    slotCard: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 0.5,
      borderColor: c.border,
      padding: 14,
      marginBottom: 10,
    },
    slotCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
    slotRank: { fontSize: 12, color: c.accent, fontWeight: '600' },
    slotDurBadge: {
      backgroundColor: c.success + '20',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: c.success + '40',
    },
    slotDur: { fontSize: 11, color: c.success, fontWeight: '700' },
    slotDate: { fontSize: 14, fontWeight: '700', color: c.textPrimary, marginBottom: 3 },
    slotTime: { fontSize: 12, color: c.textMuted, marginBottom: 12 },
    slotCta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: c.primary,
      borderRadius: 10,
      paddingVertical: 10,
    },
    slotCtaText: { fontSize: 14, fontWeight: '700', color: '#fff' },
    empty: { alignItems: 'center', paddingVertical: 40, gap: 8 },
    emptyText: { fontSize: 15, color: c.textMuted, fontWeight: '500' },
    emptyHint: { fontSize: 12, color: c.accent },
  });
}
