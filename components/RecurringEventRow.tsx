import { haptic } from '../utils/haptics';
import { useMemo, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { AppTheme, useColors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { formatRecurrenceLabel, parseInstanceId, isVirtualInstance } from '../utils/recurrenceHelpers';
import { todayDateStr } from '../utils/timeHelpers';

interface Props {
  event: Event;
  onLongPress?: (event: Event) => void;
}

export default function RecurringEventRow({ event, onLongPress }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const swipeRef = useRef<Swipeable>(null);

  const label = formatRecurrenceLabel(event.recurrence_rule, event.start_at);

  function getParentId(): string {
    if (isVirtualInstance(event.id)) {
      return parseInstanceId(event.id)?.parentId ?? event.id;
    }
    return event.id;
  }

  async function handleSkipToday() {
    haptic.light();
    swipeRef.current?.close();
    const today = todayDateStr();
    const parentId = getParentId();
    supabase
      .from('event_exceptions')
      .insert({ parent_id: parentId, instance_date: today, is_deleted: true })
      .then(({ error }) => { if (error) console.error('[RecurringEventRow] skip failed:', error.message); });
  }

  async function handleStopAfterToday() {
    haptic.medium();
    swipeRef.current?.close();
    const today = todayDateStr();
    const parentId = getParentId();
    supabase
      .from('events')
      .update({ recurrence_end_date: today })
      .eq('id', parentId)
      .then(({ error }) => { if (error) console.error('[RecurringEventRow] stop-after-today failed:', error.message); });
  }

  function renderRightActions() {
    return (
      <View style={styles.actions}>
        <Pressable style={[styles.actionBtn, styles.skipBtn]} onPress={handleSkipToday}>
          <Text style={styles.actionIcon}>📌</Text>
          <Text style={styles.actionLabel}>오늘 건너뜀</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, styles.stopBtn]} onPress={handleStopAfterToday}>
          <Text style={styles.actionIcon}>⏹</Text>
          <Text style={styles.actionLabel}>중지</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Swipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      renderRightActions={renderRightActions}
    >
      <Pressable
        style={styles.row}
        onLongPress={() => onLongPress?.(event)}
        delayLongPress={400}
      >
        <Text style={[styles.icon, { color: colors.accent }]}>🔁</Text>
        <View style={styles.content}>
          <Text style={styles.label} numberOfLines={1}>{label}</Text>
          <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
        </View>
      </Pressable>
    </Swipeable>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 10,
      backgroundColor: c.bg,
      gap: 10,
    },
    icon: {
      fontSize: 14,
    },
    content: {
      flex: 1,
      gap: 1,
    },
    label: {
      fontSize: 11,
      color: c.textMuted,
      fontFamily: 'Pretendard-Medium',
      fontWeight: '500',
    },
    title: {
      fontSize: 14,
      color: c.textPrimary,
      fontFamily: 'Pretendard-Medium',
      fontWeight: '500',
    },
    actions: {
      flexDirection: 'row',
    },
    actionBtn: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      gap: 3,
    },
    skipBtn: {
      backgroundColor: c.card2,
    },
    stopBtn: {
      backgroundColor: c.error + 'CC',
    },
    actionIcon: {
      fontSize: 16,
    },
    actionLabel: {
      fontSize: 11,
      color: '#fff',
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
    },
  });
}
