import { useMemo, useState } from 'react';
import {
  LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View,
} from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { cancelEventNotification, rescheduleEventNotification } from '../services/notifications';
import { Event } from '../types/database';
import RecurringEventRow from './RecurringEventRow';
import EditTimeModal from './EditTimeModal';
import EditTitleModal from './EditTitleModal';
import EventActionSheet from './EventActionSheet';
import { Spacing } from '../constants/spacing';

if (Platform.OS === 'android') {
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}

interface Props {
  events: Event[];
  onDeleted?: () => void;
}

export default function RecurringBadge({ events, onDeleted }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [expanded, setExpanded] = useState(false);
  const [sheetEvent,       setSheetEvent]       = useState<Event | null>(null);
  const [editEvent,        setEditEvent]        = useState<Event | null>(null);
  const [editTitleVisible, setEditTitleVisible] = useState(false);
  const [editTimeVisible,  setEditTimeVisible]  = useState(false);

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
        onDeleted={onDeleted}
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
