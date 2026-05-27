import { useCallback, useMemo, useState } from 'react';
import {
  LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View,
} from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { cancelEventNotification, rescheduleEventNotification } from '../services/notifications';
import { Event } from '../types/database';
import { todayDateStr } from '../utils/timeHelpers';
import { isVirtualInstance, parseInstanceId } from '../utils/recurrenceHelpers';
import { haptic } from '../utils/haptics';
import { useUndoToast } from '../contexts/UndoToastContext';
import RecurringEventRow from './RecurringEventRow';
import EditTimeModal from './EditTimeModal';
import EditTitleModal from './EditTitleModal';
import EventActionSheet, { RecurringDeleteScope } from './EventActionSheet';
import { Spacing } from '../constants/spacing';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

interface Props {
  events: Event[];
}

export default function RecurringBadge({ events }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { showUndo } = useUndoToast();

  const [expanded, setExpanded] = useState(false);
  const [sheetEvent,       setSheetEvent]       = useState<Event | null>(null);
  const [editEvent,        setEditEvent]        = useState<Event | null>(null);
  const [editTitleVisible, setEditTitleVisible] = useState(false);
  const [editTimeVisible,  setEditTimeVisible]  = useState(false);

  function resolveParentId(ev: Event): string {
    if (isVirtualInstance(ev.id)) {
      return parseInstanceId(ev.id)?.parentId ?? ev.id;
    }
    return ev.id;
  }

  const handleDeleteAll = useCallback(async (ev: Event) => {
    haptic.warning();
    const parentId = resolveParentId(ev);

    // 메모리 백업: parent + 인스턴스 + exceptions
    const [eventsRes, exceptionsRes] = await Promise.all([
      supabase.from('events').select('*').or(`id.eq.${parentId},parent_event_id.eq.${parentId}`),
      supabase.from('event_exceptions').select('*').eq('parent_id', parentId),
    ]);
    const backupEvents     = (eventsRes.data     ?? []) as Event[];
    const backupExceptions = (exceptionsRes.data ?? []) as any[];

    // soft-delete events, hard-delete exceptions
    const now = new Date().toISOString();
    await Promise.all([
      supabase.from('events')
        .update({ deleted_at: now })
        .or(`id.eq.${parentId},parent_event_id.eq.${parentId}`),
      supabase.from('event_exceptions')
        .delete()
        .eq('parent_id', parentId),
    ]);

    showUndo('반복 일정 전체 삭제됨', async () => {
      // events 복구 (soft-delete 해제)
      await supabase.from('events')
        .update({ deleted_at: null })
        .or(`id.eq.${parentId},parent_event_id.eq.${parentId}`);
      // exceptions 재삽입
      if (backupExceptions.length > 0) {
        await supabase.from('event_exceptions').insert(backupExceptions);
      }
    });
  }, [showUndo]);

  if (events.length === 0) return null;

  function toggle() {
    LayoutAnimation.configureNext({
      duration: 220,
      create: { type: 'easeInEaseOut', property: 'opacity' },
      update: { type: 'easeInEaseOut' },
      delete: { type: 'easeInEaseOut', property: 'opacity' },
    });
    setExpanded(prev => !prev);
  }

  return (
    <View style={styles.container}>
      {/* Collapsed pill / header */}
      <Pressable style={styles.pill} onPress={toggle}>
        <Text style={[styles.pillText, { color: colors.accent }]}>
          🔁 반복 일정 {events.length}개
        </Text>
        <Text style={[styles.chevron, { color: colors.accent }]}>
          {expanded ? '▴' : '▾'}
        </Text>
      </Pressable>

      {/* Expanded list */}
      {expanded && (
        <View style={styles.list}>
          {events.map(ev => (
            <RecurringEventRow
              key={ev.id}
              event={ev}
              onLongPress={setSheetEvent}
            />
          ))}
        </View>
      )}

      <EventActionSheet
        event={sheetEvent}
        onClose={() => setSheetEvent(null)}
        onEditTitle={ev => { setEditEvent(ev); setSheetEvent(null); setEditTitleVisible(true); }}
        onEditTime={ev  => { setEditEvent(ev); setSheetEvent(null); setEditTimeVisible(true);  }}
        onDeleteAll={handleDeleteAll}
      />
      <EditTitleModal
        visible={editTitleVisible}
        event={editEvent}
        onClose={() => setEditTitleVisible(false)}
        onSaved={() => setEditTitleVisible(false)}
      />
      <EditTimeModal
        visible={editTimeVisible}
        event={editEvent}
        onClose={() => setEditTimeVisible(false)}
        onSaved={() => {
          setEditTimeVisible(false);
          if (editEvent) {
            supabase.from('events').select('*').eq('id', editEvent.id).single()
              .then(({ data }) => {
                if (data) rescheduleEventNotification(data as Event).catch(e =>
                  console.log('[Notifications] reschedule 실패:', e));
              });
          }
        }}
      />
    </View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    container: {
      marginHorizontal: 20,
      marginTop: 10,
      marginBottom: Spacing.xs,
      borderRadius: 12,
      overflow: 'hidden',
      borderWidth: 0.5,
      borderColor: c.border,
      backgroundColor: c.card,
    },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    pillText: {
      fontSize: 13,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
    },
    chevron: {
      fontSize: 11,
      fontFamily: 'Pretendard-Bold',
      fontWeight: '700',
    },
    list: {
      borderTopWidth: 0.5,
      borderTopColor: c.border,
    },
  });
}
