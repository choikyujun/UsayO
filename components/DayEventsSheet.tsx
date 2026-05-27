import { Calendar, MapPin, X } from 'lucide-react-native';
import EmptyState from './EmptyState';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Modal, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTheme, useColors } from '../constants/colors';
import { Event } from '../types/database';
import EventDetailSheet from './EventDetailSheet';
import { Spacing } from '../constants/spacing';

const KO_DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function formatDayHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${KO_DAYS[d.getDay()]}`;
}

function formatEventTime(ev: Event): string {
  const s = new Date(ev.start_at);
  const e = new Date(ev.end_at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${s.getHours()}:${pad(s.getMinutes())} — ${e.getHours()}:${pad(e.getMinutes())}`;
}

interface Props {
  dateStr: string | null;
  events:  Event[];
  onClose: () => void;
}

export default function DayEventsSheet({ dateStr, events, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const visible = dateStr !== null;

  const slideY = useRef(new Animated.Value(600)).current;
  const bgOp   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(bgOp,   { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 80, friction: 12 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(bgOp,   { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slideY, { toValue: 600, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const swipeDist = useSharedValue(0);
  const swipeGesture = Gesture.Pan()
    .onStart(() => { swipeDist.value = 0; })
    .onUpdate(e => { swipeDist.value = Math.max(0, e.translationY); })
    .onEnd(e => {
      if (e.translationY > 80) runOnJS(onClose)();
      swipeDist.value = withTiming(0);
    });

  const [detailEvent,   setDetailEvent]   = useState<Event | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={onClose}
        statusBarTranslucent
      >
        <Animated.View style={[styles.backdrop, { opacity: bgOp }]} pointerEvents="none" />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <Animated.View
          style={[styles.sheetWrap, { paddingBottom: insets.bottom + 16 }]}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={swipeGesture}>
            <Animated.View
              style={[
                styles.sheet,
                { backgroundColor: colors.card, transform: [{ translateY: slideY }] },
              ]}
            >
              {/* Drag handle */}
              <View style={styles.handleWrap}>
                <View style={[styles.handle, { backgroundColor: colors.border }]} />
              </View>

              {/* Header */}
              <View style={styles.headerRow}>
                <Text style={[styles.dayLabel, { color: colors.textPrimary }]}>
                  {dateStr ? formatDayHeader(dateStr) : ''}
                </Text>
                <Pressable onPress={onClose} hitSlop={12}>
                  <X size={20} color={colors.textMuted} strokeWidth={1.5} />
                </Pressable>
              </View>

              {/* Event list */}
              <ScrollView showsVerticalScrollIndicator={false}>
                {events.length === 0 ? (
                  <EmptyState Icon={Calendar} title="일정이 없어요" />
                ) : (
                  events.map((ev, idx) => {
                    const isCompleted = !!ev.completed_at;
                    return (
                      <Pressable
                        key={ev.id}
                        style={[styles.eventRow, idx < events.length - 1 && { marginBottom: 12 }, isCompleted && { opacity: 0.5 }]}
                        onPress={() => { setDetailEvent(ev); setDetailVisible(true); }}
                      >
                        <Text style={[styles.eventTime, { color: colors.textSecondary }]}>
                          {formatEventTime(ev)}
                        </Text>
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[styles.eventTitle, { color: colors.textPrimary }, isCompleted && styles.strikethrough]}
                            numberOfLines={1}
                          >
                            {ev.title}
                          </Text>
                          {ev.location ? (
                            <View style={styles.locationRow}>
                              <MapPin size={12} color={colors.textTertiary} strokeWidth={1.5} />
                              <Text style={[styles.locationText, { color: colors.textTertiary }]} numberOfLines={1}>
                                {ev.location}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                      </Pressable>
                    );
                  })
                )}
              </ScrollView>
            </Animated.View>
          </GestureDetector>
        </Animated.View>
      </Modal>

      <EventDetailSheet
        visible={detailVisible}
        event={detailEvent}
        onClose={() => setDetailVisible(false)}
      />
    </>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheetWrap: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
    },
    sheet: {
      borderTopLeftRadius:  24,
      borderTopRightRadius: 24,
      padding: Spacing.lg,
      paddingTop: Spacing.md,
      maxHeight:            '60%',
      shadowColor:          '#000',
      shadowOffset:         { width: 0, height: -4 },
      shadowOpacity:        0.12,
      shadowRadius:         12,
      elevation:            16,
    },
    handleWrap: {
      alignItems:   'center',
      marginBottom: Spacing.md,
    },
    handle: {
      width:        40,
      height:       4,
      borderRadius: 2,
    },
    headerRow: {
      flexDirection:  'row',
      justifyContent: 'space-between',
      alignItems:     'center',
      marginBottom: Spacing.base,
    },
    dayLabel: {
      fontSize:   18,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
    },
    emptyText: {
      textAlign: 'center',
      fontSize:  14,
      marginTop: Spacing.lg,
    },
    eventRow: {
      flexDirection: 'row',
      gap: Spacing.md,
      alignItems:    'flex-start',
    },
    eventTime: {
      fontSize:  14,
      width:     110,
      paddingTop: 1,
    },
    eventTitle: {
      fontSize: 16,
    },
    strikethrough: {
      textDecorationLine: 'line-through',
    },
    locationRow: {
      flexDirection: 'row',
      alignItems:    'center',
      gap: Spacing.xs,
      marginTop:     2,
    },
    locationText: {
      fontSize: 13,
      flex:     1,
    },
  });
}
