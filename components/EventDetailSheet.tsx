import { MapPin, StickyNote, Users, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated, Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppTheme, useColors } from '../constants/colors';
import { Event } from '../types/database';
import { Spacing } from '../constants/spacing';

const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatEventTime(startAt: string, endAt: string): string {
  const s = new Date(startAt);
  const e = new Date(endAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${s.getMonth() + 1}월 ${s.getDate()}일 (${KO_DAYS[s.getDay()]})`;
  const time = `${s.getHours()}:${pad(s.getMinutes())} – ${e.getHours()}:${pad(e.getMinutes())}`;
  return `${date}  ${time}`;
}

interface Props {
  visible: boolean;
  event:   Event | null;
  onClose: () => void;
}

export default function EventDetailSheet({ visible, event, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

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

  // Swipe-down to close
  const startY    = useSharedValue(0);
  const swipeDist = useSharedValue(0);

  const swipeGesture = Gesture.Pan()
    .onStart(() => { startY.value = 0; })
    .onUpdate(e => { swipeDist.value = Math.max(0, e.translationY); })
    .onEnd(e => {
      if (e.translationY > 80) {
        runOnJS(onClose)();
      }
      swipeDist.value = withTiming(0);
    });

  if (!event) return null;

  const hasLocation  = Boolean(event.location);
  const hasNotes     = Boolean(event.description);
  const hasAttendees = event.attendees && event.attendees.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      {/* Dim backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: bgOp }]} pointerEvents="none" />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      {/* Sheet */}
      <Animated.View
        style={[styles.sheetWrap, { paddingBottom: insets.bottom + 16 }]}
        pointerEvents="box-none"
      >
        <GestureDetector gesture={swipeGesture}>
          <Animated.View style={[styles.sheet, { backgroundColor: colors.card, transform: [{ translateY: slideY }] }]}>
            {/* Drag handle */}
            <View style={styles.handleWrap}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
            </View>

            {/* Close button */}
            <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={12}>
              <X size={20} color={colors.textMuted} strokeWidth={1.5} />
            </Pressable>

            {/* Title */}
            <Text style={[styles.title, { color: colors.textPrimary }]} numberOfLines={2}>
              {event.title}
            </Text>

            {/* Time */}
            <Text style={[styles.time, { color: colors.textSecondary }]}>
              {formatEventTime(event.start_at, event.end_at)}
            </Text>

            {/* Optional fields */}
            {hasLocation && (
              <View style={styles.row}>
                <MapPin size={16} color={colors.textSecondary} strokeWidth={1.5} />
                <Text style={[styles.rowText, { color: colors.textSecondary }]}>
                  {event.location}
                </Text>
              </View>
            )}

            {hasNotes && (
              <View style={styles.row}>
                <StickyNote size={16} color={colors.textSecondary} strokeWidth={1.5} />
                <Text style={[styles.rowText, { color: colors.textSecondary }]} numberOfLines={4}>
                  {event.description}
                </Text>
              </View>
            )}

            {hasAttendees && (
              <View style={styles.row}>
                <Users size={16} color={colors.textSecondary} strokeWidth={1.5} />
                <Text style={[styles.rowText, { color: colors.textSecondary }]} numberOfLines={2}>
                  {event.attendees!.join(', ')}
                </Text>
              </View>
            )}
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </Modal>
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
      minHeight:            260,
      shadowColor:          '#000',
      shadowOffset:         { width: 0, height: -4 },
      shadowOpacity:        0.12,
      shadowRadius:         12,
      elevation:            16,
    },
    handleWrap: {
      alignItems:    'center',
      marginBottom: Spacing.base,
    },
    handle: {
      width:        40,
      height:       4,
      borderRadius: 2,
    },
    closeBtn: {
      position: 'absolute',
      top:      16,
      right:    20,
    },
    title: {
      fontSize:     18,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight:   '600',
      marginBottom: Spacing.sm,
      paddingRight: Spacing.xl,
    },
    time: {
      fontSize:     14,
      marginBottom: Spacing.base,
    },
    row: {
      flexDirection: 'row',
      alignItems:    'flex-start',
      gap:           10,
      marginBottom: Spacing.md,
    },
    rowText: {
      fontSize: 14,
      flex:     1,
      lineHeight: 20,
    },
  });
}
