import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { FlatItem, useEventGrouping } from '../hooks/useEventGrouping';
import { supabase } from '../lib/supabase';
import { cancelEventNotification, rescheduleEventNotification } from '../services/notifications';
import { Event } from '../types/database';
import { todayDateStr } from '../utils/timeHelpers';
import EmptyTodayState from './EmptyTodayState';
import EditTimeModal from './EditTimeModal';
import EditTitleModal from './EditTitleModal';
import EventActionSheet from './EventActionSheet';
import EventGroupHeader from './EventGroupHeader';
import EventRow from './EventRow';
import NowIndicator from './NowIndicator';
import { Spacing } from '../constants/spacing';

interface Props {
  events:        Event[];
  loading?:      boolean;
  newEventId?:   string | null;
  onRefresh?:    () => void;
  isRefreshing?: boolean;
  listPaddingBottom?: number;
  selectedDate?: string;
}

interface DeletedItem {
  event:   Event;
  timeoutId: ReturnType<typeof setTimeout>;
}

export default function TodayEventList({
  events, loading, newEventId, onRefresh, isRefreshing, listPaddingBottom, selectedDate,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [hiddenIds,    setHiddenIds]    = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [deletedItem,  setDeletedItem]  = useState<DeletedItem | null>(null);
  const [sheetEvent,       setSheetEvent]       = useState<Event | null>(null);
  const [editEvent,        setEditEvent]        = useState<Event | null>(null);
  const [editTitleVisible, setEditTitleVisible] = useState(false);
  const [editTimeVisible,  setEditTimeVisible]  = useState(false);
  const toastOpacity = useRef(new Animated.Value(0)).current;

  // Filter hidden events (soft-deleted but undoable)
  const visibleEvents = useMemo(
    () => events.filter(e => !hiddenIds.has(e.id)),
    [events, hiddenIds],
  );

  const items = useEventGrouping(visibleEvents, selectedDate);

  // ── Delete with undo toast ────────────────────────────────────
  function handleDelete(event: Event) {
    // Hide row immediately
    setHiddenIds(prev => new Set([...prev, event.id]));

    // Clear any existing toast
    if (deletedItem) {
      clearTimeout(deletedItem.timeoutId);
      commitDelete(deletedItem.event);
    }

    // Show toast
    Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();

    const timeoutId = setTimeout(() => {
      commitDelete(event);
      Animated.timing(toastOpacity, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => {
        setDeletedItem(null);
      });
    }, 5000);

    setDeletedItem({ event, timeoutId });
  }

  function handleUndoDelete() {
    if (!deletedItem) return;
    clearTimeout(deletedItem.timeoutId);
    setHiddenIds(prev => {
      const next = new Set(prev);
      next.delete(deletedItem.event.id);
      return next;
    });
    setDeletedItem(null);
    Animated.timing(toastOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }

  function commitDelete(event: Event) {
    cancelEventNotification(event.id).catch(e => console.log('[Notifications] cancel 실패:', e));
    supabase
      .from('events')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', event.id)
      .then(({ error }) => { if (error) console.error('[TodayEventList] delete failed:', error.message); });
  }

  // ── Complete (visual only) ────────────────────────────────────
  function handleComplete(event: Event) {
    setCompletedIds(prev => new Set([...prev, event.id]));
  }

  // ── Cleanup on unmount ────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (deletedItem) {
        clearTimeout(deletedItem.timeoutId);
        commitDelete(deletedItem.event);
      }
    };
  }, [deletedItem]);

  // ── Render each flat item ─────────────────────────────────────
  const renderItem = useCallback(({ item }: { item: FlatItem }) => {
    switch (item.type) {
      case 'group':
        return <EventGroupHeader label={item.label} />;
      case 'now':
        return <NowIndicator timeStr={item.timeStr} />;
      case 'date-header':
        return <DateHeader label={item.label} colors={colors} />;
      case 'empty-today':
        return <EmptyTodayState isToday={!selectedDate || selectedDate === todayDateStr()} />;
      case 'event':
        return (
          <EventRow
            event={item.event}
            isPast={item.isPast}
            isNext={item.isNext}
            isLunch={item.isLunch}
            isHoliday={item.isHoliday}
            isLunar={item.isLunar}
            onDelete={handleDelete}
            onComplete={handleComplete}
            onLongPress={setSheetEvent}
          />
        );
    }
  }, [colors, handleDelete]);

  const keyExtractor = useCallback((item: FlatItem) => item.key, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <Text style={styles.loadingText}>불러오는 중...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={items}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        style={styles.list}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: listPaddingBottom ?? 24 },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={onRefresh ? (
          <RefreshControl
            refreshing={isRefreshing ?? false}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        ) : undefined}
        // Keep the list from re-measuring if only items change (no key changes)
        removeClippedSubviews={Platform.OS !== 'ios'}
      />

      {/* ── Delete undo toast ────────────────────────────────── */}
      <Animated.View style={[styles.toast, { opacity: toastOpacity }]} pointerEvents="box-none">
        <Text style={styles.toastText}>
          {deletedItem ? `"${deletedItem.event.title}" 삭제됨` : ''}
        </Text>
        <Pressable onPress={handleUndoDelete} hitSlop={12}>
          <Text style={styles.toastUndo}>되돌리기</Text>
        </Pressable>
      </Animated.View>

      {/* ── Long-press action sheet ──────────────────────────── */}
      <EventActionSheet
        event={sheetEvent}
        onClose={() => setSheetEvent(null)}
        onEditTitle={ev => { setEditEvent(ev); setSheetEvent(null); setEditTitleVisible(true); }}
        onEditTime={ev  => { setEditEvent(ev); setSheetEvent(null); setEditTimeVisible(true);  }}
      />
      <EditTitleModal
        visible={editTitleVisible}
        event={editEvent}
        onClose={() => setEditTitleVisible(false)}
        onSaved={() => { setEditTitleVisible(false); onRefresh?.(); }}
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
          onRefresh?.();
        }}
      />
    </View>
  );
}

function DateHeader({ label, colors }: { label: string; colors: AppTheme }) {
  return (
    <View style={{
      paddingTop: Spacing.lg,
      paddingBottom: 6,
      paddingHorizontal: 20,
      borderTopWidth: 0.5,
      borderTopColor: colors.border,
      marginTop: Spacing.sm,
    }}>
      <Text style={{ fontSize: 12, fontFamily: 'Pretendard-Bold', fontWeight: '700', color: colors.textMuted, letterSpacing: 0.4 }}>
        {label}
      </Text>
    </View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    root:        { flex: 1 },
    list:        { flex: 1 },
    content:     { flexGrow: 1 },
    center:      { flex: 1, alignItems: 'center', justifyContent: 'center' },
    loadingText: { fontSize: 14, color: c.textMuted },

    toast: {
      position: 'absolute',
      bottom: 20,
      left: 20,
      right: 20,
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 0.5,
      borderColor: c.border,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.12,
      shadowRadius: 8,
      elevation: 6,
    },
    toastText: { fontSize: 14, color: c.textPrimary, flex: 1 },
    toastUndo: { fontSize: 14, color: c.accent, fontFamily: 'Pretendard-Bold', fontWeight: '700', marginLeft: 12 },
  });
}
