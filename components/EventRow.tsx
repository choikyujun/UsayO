import * as Haptics from 'expo-haptics';
import { useRef, useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  UIManager,
  View,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { AppTheme, useColors } from '../constants/colors';
import { Event } from '../types/database';
import { formatTimeKo, formatTimeRow, MONO } from '../utils/timeHelpers';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

interface Props {
  event:      Event;
  isPast:     boolean;
  isNext:     boolean;
  isLunch:    boolean;
  isHoliday:  boolean;
  isLunar:    boolean;
  onDelete:   (e: Event) => void;
  onComplete: (e: Event) => void;
  onLongPress:(e: Event) => void;
}

export default function EventRow({
  event, isPast, isNext, isLunch, isHoliday, isLunar,
  onDelete, onComplete, onLongPress,
}: Props) {
  const colors = useColors();
  const styles = makeStyles(colors);

  const [expanded,  setExpanded]  = useState(false);
  const [localCompleted, setLocalCompleted] = useState(false);
  // Reflect DB-persisted completion (e.g. set via voice COMPLETE intent)
  const completed = localCompleted || !!event.completed_at;
  const swipeRef = useRef<Swipeable>(null);

  const isEffectivelyPast = isPast || completed;
  const startD = new Date(event.start_at);
  const endD   = event.end_at ? new Date(event.end_at) : null;

  function handleTap() {
    LayoutAnimation.configureNext({
      duration: 220,
      create:  { type: 'easeInEaseOut', property: 'opacity' },
      update:  { type: 'easeInEaseOut' },
      delete:  { type: 'easeInEaseOut', property: 'opacity' },
    });
    setExpanded(prev => !prev);
  }

  async function handleLongPress() {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onLongPress(event);
  }

  function handleComplete() {
    setLocalCompleted(true);
    swipeRef.current?.close();
    onComplete(event);
  }

  function handleSwipeDelete() {
    swipeRef.current?.close();
    onDelete(event);
  }

  function renderLeftAction() {
    return (
      <View style={styles.actionLeft}>
        <Text style={styles.actionLeftIcon}>✓</Text>
        <Text style={styles.actionLeftLabel}>완료</Text>
      </View>
    );
  }

  function renderRightAction() {
    return (
      <View style={styles.actionRight}>
        <Text style={styles.actionRightIcon}>🗑️</Text>
        <Text style={styles.actionRightLabel}>삭제</Text>
      </View>
    );
  }

  return (
    <Swipeable
      ref={swipeRef}
      renderLeftActions={renderLeftAction}
      renderRightActions={renderRightAction}
      onSwipeableOpen={(direction) => {
        if (direction === 'left') handleComplete();
        else handleSwipeDelete();
      }}
      friction={2}
      leftThreshold={60}
      rightThreshold={60}
      overshootLeft={false}
      overshootRight={false}
    >
      <Pressable
        style={[
          styles.row,
          isLunch && styles.rowLunch,
          expanded && { backgroundColor: colors.card2 },
        ]}
        onPress={handleTap}
        onLongPress={handleLongPress}
        delayLongPress={500}
      >
        {/* Time column */}
        <Text style={[
          styles.time,
          { fontFamily: MONO },
          isHoliday && { color: '#DC2626' },
          isEffectivelyPast && styles.fadedText,
        ]}>
          {formatTimeRow(startD)}
        </Text>

        {/* Lunar badge */}
        {isLunar && <Text style={styles.lunarBadge}>음</Text>}

        {/* Title */}
        <Text
          style={[
            styles.title,
            isNext && styles.titleNext,
            isEffectivelyPast && styles.fadedText,
            completed && styles.titleCompleted,
          ]}
          numberOfLines={expanded ? undefined : 1}
        >
          {event.title}
        </Text>

        {/* Next-event dot indicator */}
        {isNext && !expanded && <View style={[styles.nextDot, { backgroundColor: colors.accent }]} />}
      </Pressable>

      {/* Expanded detail */}
      {expanded && (
        <View style={[styles.expanded, isEffectivelyPast && { opacity: 0.5 }]}>
          <Text style={styles.expandedTime}>
            {formatTimeKo(startD)}{endD ? ` – ${formatTimeKo(endD)}` : ''}
          </Text>
          {event.location ? (
            <Text style={styles.expandedLine}>📍 {event.location}</Text>
          ) : null}
          {event.description ? (
            <Text style={styles.expandedLine}>💭 {event.description}</Text>
          ) : null}
          {!event.location && !event.description && (
            <Text style={styles.expandedEmpty}>메모나 장소가 없어요</Text>
          )}
        </View>
      )}
    </Swipeable>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      minHeight: 44,
      gap: 12,
      backgroundColor: 'transparent',
    },
    rowLunch: {
      backgroundColor: c.primary + '08',
    },
    time: {
      fontSize: 14,
      color: c.textPrimary,
      width: 42,
      textAlign: 'right',
      lineHeight: 20,
    },
    lunarBadge: {
      fontSize: 9,
      color: c.textMuted,
      borderWidth: 0.5,
      borderColor: c.border,
      borderRadius: 3,
      paddingHorizontal: 3,
      paddingVertical: 1,
      lineHeight: 12,
    },
    title: {
      flex: 1,
      fontSize: 15,
      color: c.textPrimary,
      lineHeight: 20,
    },
    titleNext: {
      fontWeight: '600',
    },
    titleCompleted: {
      textDecorationLine: 'line-through',
    },
    fadedText: {
      opacity: 0.4,
    },
    nextDot: {
      width: 5,
      height: 5,
      borderRadius: 2.5,
      marginRight: 4,
    },
    // ── Swipe actions ────────────────────────────────────────────
    actionLeft: {
      backgroundColor: c.success,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 2,
    },
    actionLeftIcon:  { fontSize: 18, color: '#fff' },
    actionLeftLabel: { fontSize: 10, color: '#fff', fontWeight: '700' },
    actionRight: {
      backgroundColor: c.error,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      gap: 2,
    },
    actionRightIcon:  { fontSize: 16 },
    actionRightLabel: { fontSize: 10, color: '#fff', fontWeight: '700' },
    // ── Expanded ─────────────────────────────────────────────────
    expanded: {
      paddingLeft: 74,   // time-col width + gap
      paddingRight: 20,
      paddingBottom: 12,
      gap: 4,
    },
    expandedTime:  { fontSize: 11, color: c.textMuted },
    expandedLine:  { fontSize: 13, color: c.textSecondary, lineHeight: 18 },
    expandedEmpty: { fontSize: 12, color: c.textMuted, fontStyle: 'italic' },
  });
}
