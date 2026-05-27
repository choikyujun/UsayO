import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useColors } from '../constants/colors';
import { Event } from '../types/database';
import EventCard from './EventCard';

const CARD_RADIUS = 10;

const DAYS_KO = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

interface EventGroup {
  dateKey: string;
  label: string;
  events: Event[];
}

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function groupEvents(events: Event[]): EventGroup[] {
  const now = new Date();
  const todayKey = localDateKey(now);
  const tom = new Date(now);
  tom.setDate(tom.getDate() + 1);
  const tomorrowKey = localDateKey(tom);

  const map = new Map<string, EventGroup>();
  for (const event of events) {
    const d = new Date(event.start_at);
    const key = localDateKey(d);
    if (!map.has(key)) {
      let label: string;
      const m = d.getMonth() + 1;
      const day = d.getDate();
      if (key === todayKey) {
        label = `오늘  ${m}월 ${day}일`;
      } else if (key === tomorrowKey) {
        label = `내일  ${m}월 ${day}일`;
      } else {
        label = `${DAYS_KO[d.getDay()]}  ${m}월 ${day}일`;
      }
      map.set(key, { dateKey: key, label, events: [] });
    }
    map.get(key)!.events.push(event);
  }
  return [...map.values()];
}

interface Props {
  events: Event[];
  loading?: boolean;
  newEventId?: string | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  listPaddingBottom?: number;
}

export default function EventListFade({ events, loading, newEventId, onRefresh, isRefreshing, listPaddingBottom }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const sectionOffsetsRef = useRef<Record<string, number>>({});
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;
  const prevNewIdRef = useRef<string | null>(null);
  const [scrolled, setScrolled] = useState(false);

  const now = new Date();
  const todayKey = localDateKey(now);
  const groups = useMemo(() => groupEvents(events), [events]);

  // "다음" 일정 ID (아직 종료되지 않은 가장 가까운 이벤트)
  const nextEventId = events.find(e => {
    const end = e.end_at ? new Date(e.end_at) : new Date(e.start_at);
    return end >= now;
  })?.id;

  // 새 이벤트 fade-in + scale + highlight — 이벤트가 리스트에 실제로 존재할 때만 트리거
  useEffect(() => {
    if (!newEventId) return;
    const eventExists = events.some(e => e.id === newEventId);
    if (!eventExists || newEventId === prevNewIdRef.current) return;
    prevNewIdRef.current = newEventId;
    fadeAnim.setValue(0);
    scaleAnim.setValue(0.95);
    highlightAnim.setValue(0.22);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 5, tension: 100, useNativeDriver: true }),
      Animated.timing(highlightAnim, { toValue: 0, duration: 1600, delay: 200, useNativeDriver: true }),
    ]).start();
  }, [newEventId, events]);

  // 새 이벤트가 속한 섹션으로 자동 스크롤
  useEffect(() => {
    if (!newEventId) return;
    const group = groups.find(g => g.events.some(e => e.id === newEventId));
    if (!group) return;
    const timer = setTimeout(() => {
      const y = sectionOffsetsRef.current[group.dateKey];
      if (y !== undefined) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [newEventId, groups]);

  if (loading) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>불러오는 중...</Text>
      </View>
    );
  }

  const todayGroup = groups.find(g => g.dateKey === todayKey);
  const hasTodayEvents = todayGroup && todayGroup.events.length > 0;
  const extraCount = Math.max(0, events.length - 4);

  if (groups.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>이번 주 일정이 없어요</Text>
        <Text style={styles.emptyHint}>음성으로 일정을 추가해보세요</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={[styles.list, listPaddingBottom != null && { paddingBottom: listPaddingBottom }]}
        showsVerticalScrollIndicator={false}
        onScroll={e => setScrolled(e.nativeEvent.contentOffset.y > 10)}
        scrollEventThrottle={16}
        refreshControl={onRefresh ? (
          <RefreshControl
            refreshing={isRefreshing ?? false}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        ) : undefined}
      >
        {!hasTodayEvents && (
          <View style={styles.todayEmpty}>
            <Text style={styles.todayEmptyText}>오늘은 일정이 없어요</Text>
          </View>
        )}

        {groups.map(group => (
          <View key={group.dateKey}>
            <View
              onLayout={e => {
                sectionOffsetsRef.current[group.dateKey] = e.nativeEvent.layout.y;
              }}
            >
              <Text style={styles.sectionHeader}>{group.label}</Text>
            </View>

            {group.events.map(event => {
              const card = (
                <EventCard
                  key={event.id}
                  event={event}
                  isNext={event.id === nextEventId}
                />
              );
              if (event.id === newEventId) {
                return (
                  <Animated.View
                    key={event.id}
                    style={{ opacity: fadeAnim, transform: [{ scale: scaleAnim }] }}
                  >
                    <View style={styles.newCardWrap}>
                      {card}
                      <Animated.View
                        pointerEvents="none"
                        style={[styles.newHighlight, { opacity: highlightAnim }]}
                      />
                    </View>
                  </Animated.View>
                );
              }
              return card;
            })}
          </View>
        ))}
      </ScrollView>

      {!scrolled && extraCount > 0 && (
        <View style={styles.fadeWrap} pointerEvents="none">
          <View style={styles.fadeTop} />
          <View style={styles.fadeMid} />
          <View style={styles.fadeBottom} />
          <Text style={styles.hintText}>아래로 스크롤 · {extraCount}개 더</Text>
        </View>
      )}
    </View>
  );
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    scroll: { flex: 1 },
    list: { paddingHorizontal: 16, paddingBottom: 24 },

    empty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingBottom: 40,
    },
    emptyText: {
      fontSize: 15,
      color: c.textMuted,
      fontFamily: 'Pretendard-Medium',
      fontWeight: '500',
    },
    emptyHint: {
      fontSize: 13,
      color: c.accent,
    },

    todayEmpty: {
      paddingVertical: 12,
      paddingHorizontal: 4,
      marginBottom: 4,
    },
    todayEmptyText: {
      fontSize: 13,
      color: c.textMuted,
      fontStyle: 'italic',
    },

    sectionHeader: {
      fontSize: 11,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: c.textTertiary,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      paddingTop: 16,
      paddingBottom: 6,
      paddingHorizontal: 2,
    },

    newCardWrap: { position: 'relative' },
    newHighlight: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: c.primary,
      borderRadius: CARD_RADIUS,
      marginBottom: 8,
    },

    fadeWrap: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 80,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 10,
    },
    fadeTop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 20,
      backgroundColor: c.bg,
      opacity: 0.1,
    },
    fadeMid: {
      position: 'absolute',
      top: 20,
      left: 0,
      right: 0,
      height: 30,
      backgroundColor: c.bg,
      opacity: 0.55,
    },
    fadeBottom: {
      position: 'absolute',
      top: 50,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: c.bg,
      opacity: 0.92,
    },
    hintText: {
      fontSize: 12,
      color: c.accent,
      letterSpacing: 0.3,
      zIndex: 1,
    },
  });
}
