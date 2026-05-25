import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Modal, Pressable, StyleSheet, Text, View,
} from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { supabase } from '../lib/supabase';
import { Event } from '../types/database';
import { isVirtualInstance, parseInstanceId } from '../utils/recurrenceHelpers';

type Scope = 'this' | 'future' | 'all';

const SCOPE_LABELS: Record<Scope, string> = {
  this:   '이번 일정만',
  future: '이번 + 앞으로 모두',
  all:    '전체 반복 수정',
};

const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function formatDateLabel(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${KO_DAYS[d.getDay()]}요일`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

interface Props {
  visible: boolean;
  event: Event | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditTimeModal({ visible, event, onClose, onSaved }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const slideY = useRef(new Animated.Value(400)).current;
  const bgOp   = useRef(new Animated.Value(0)).current;

  const [date,    setDate]    = useState(new Date());
  const [hour,    setHour]    = useState(0);
  const [minute,  setMinute]  = useState(0);
  const [saving,  setSaving]  = useState(false);
  const [showScopePicker, setShowScopePicker] = useState(false);

  const isRecurring = event ? (event.is_recurring || isVirtualInstance(event.id)) : false;

  useEffect(() => {
    if (visible && event) {
      const dt = new Date(event.start_at);
      setDate(dt);
      setHour(dt.getHours());
      setMinute(dt.getMinutes());
      setShowScopePicker(false);

      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }),
        Animated.timing(bgOp,   { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 400, duration: 220, useNativeDriver: true }),
        Animated.timing(bgOp,   { toValue: 0,   duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const ev = event;
  const durationMs = ev ? new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime() : 3_600_000;

  function prevDay() {
    setDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; });
  }
  function nextDay() {
    setDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; });
  }
  function incHour()   { setHour(h  => (h  +  1) % 24); }
  function decHour()   { setHour(h  => (h  + 23) % 24); }
  function incMinute() { setMinute(m => (m  +  5) % 60); }
  function decMinute() { setMinute(m => (m  + 55) % 60); }

  function buildTimes() {
    const start = new Date(date);
    start.setHours(hour, minute, 0, 0);
    const end = new Date(start.getTime() + durationMs);
    return { newStart: start.toISOString(), newEnd: end.toISOString() };
  }

  async function save(scope: Scope) {
    if (!ev || saving) return;
    setSaving(true);
    try {
      const { newStart, newEnd } = buildTimes();
      const now = new Date().toISOString();

      if (!isRecurring || scope === 'all') {
        const realId = isVirtualInstance(ev.id)
          ? (parseInstanceId(ev.id)?.parentId ?? ev.id)
          : ev.id;
        await supabase.from('events')
          .update({ start_at: newStart, end_at: newEnd, updated_at: now })
          .eq('id', realId);

      } else if (scope === 'this') {
        const parsed       = parseInstanceId(ev.id);
        const parentId     = parsed?.parentId ?? ev.id;
        const instanceDate = parsed?.instanceDate ?? ev.start_at.split('T')[0];
        await supabase.from('event_exceptions').upsert(
          {
            parent_id:      parentId,
            instance_date:  instanceDate,
            is_deleted:     false,
            override_start: newStart,
            override_end:   newEnd,
          },
          { onConflict: 'parent_id,instance_date' },
        );

      } else {
        // 'future': end original + create new recurring event with new start/end
        const parsed       = parseInstanceId(ev.id);
        const parentId     = parsed?.parentId ?? ev.id;
        const instanceDate = parsed?.instanceDate ?? ev.start_at.split('T')[0];

        const prevDay = new Date(instanceDate + 'T00:00:00');
        prevDay.setDate(prevDay.getDate() - 1);

        await supabase.from('events')
          .update({ recurrence_end_date: prevDay.toISOString().split('T')[0], updated_at: now })
          .eq('id', parentId);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('events').insert({
            user_id:             user.id,
            title:               ev.title,
            start_at:            newStart,
            end_at:              newEnd,
            is_recurring:        ev.is_recurring,
            recurrence_rule:     ev.recurrence_rule,
            recurrence_end_date: ev.recurrence_end_date,
            color:               ev.color,
            category:            ev.category,
            created_via:         'manual' as const,
          });
        }
      }

      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  function handleSavePress() {
    if (isRecurring) {
      setShowScopePicker(true);
    } else {
      save('all');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: bgOp }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={styles.handle} />

        {!showScopePicker ? (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>시간 변경</Text>

            {/* ── Date row ── */}
            <View style={[styles.dateRow, { borderColor: colors.border }]}>
              <Pressable style={styles.arrowBtn} onPress={prevDay} hitSlop={8}>
                <ChevronLeft size={20} color={colors.textMuted} strokeWidth={1.5} />
              </Pressable>
              <Text style={[styles.dateLabel, { color: colors.textPrimary }]}>
                {formatDateLabel(date)}
              </Text>
              <Pressable style={styles.arrowBtn} onPress={nextDay} hitSlop={8}>
                <ChevronRight size={20} color={colors.textMuted} strokeWidth={1.5} />
              </Pressable>
            </View>

            {/* ── Time picker ── */}
            <View style={styles.timePicker}>
              {/* Hour column */}
              <View style={styles.spinnerCol}>
                <Pressable style={styles.spinnerBtn} onPress={incHour} hitSlop={8}>
                  <ChevronUp size={24} color={colors.primary} strokeWidth={1.5} />
                </Pressable>
                <View style={[styles.spinnerValue, { borderColor: colors.border, backgroundColor: colors.card2 }]}>
                  <Text style={[styles.spinnerText, { color: colors.textPrimary }]}>{pad2(hour)}</Text>
                </View>
                <Pressable style={styles.spinnerBtn} onPress={decHour} hitSlop={8}>
                  <ChevronDown size={24} color={colors.primary} strokeWidth={1.5} />
                </Pressable>
              </View>

              <Text style={[styles.colon, { color: colors.textPrimary }]}>:</Text>

              {/* Minute column */}
              <View style={styles.spinnerCol}>
                <Pressable style={styles.spinnerBtn} onPress={incMinute} hitSlop={8}>
                  <ChevronUp size={24} color={colors.primary} strokeWidth={1.5} />
                </Pressable>
                <View style={[styles.spinnerValue, { borderColor: colors.border, backgroundColor: colors.card2 }]}>
                  <Text style={[styles.spinnerText, { color: colors.textPrimary }]}>{pad2(minute)}</Text>
                </View>
                <Pressable style={styles.spinnerBtn} onPress={decMinute} hitSlop={8}>
                  <ChevronDown size={24} color={colors.primary} strokeWidth={1.5} />
                </Pressable>
              </View>
            </View>

            <View style={styles.btnRow}>
              <Pressable
                style={[styles.btn, styles.cancelBtn, { borderColor: colors.border }]}
                onPress={onClose}
              >
                <X size={18} color={colors.textMuted} strokeWidth={1.5} />
                <Text style={[styles.btnText, { color: colors.textMuted }]}>취소</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.saveBtn, { backgroundColor: colors.primary }]}
                onPress={handleSavePress}
                disabled={saving}
              >
                <Check size={18} color="#fff" strokeWidth={2} />
                <Text style={[styles.btnText, { color: '#fff' }]}>저장</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>반복 일정 수정 범위</Text>

            {(['this', 'future', 'all'] as Scope[]).map((scope, i, arr) => (
              <Pressable
                key={scope}
                style={({ pressed }) => [
                  styles.scopeItem,
                  { borderBottomColor: colors.border, borderBottomWidth: i < arr.length - 1 ? StyleSheet.hairlineWidth : 0 },
                  { opacity: pressed ? 0.6 : 1 },
                ]}
                onPress={() => save(scope)}
              >
                <Text style={[styles.scopeText, { color: scope === 'this' ? colors.textPrimary : colors.error }]}>
                  {SCOPE_LABELS[scope]}
                </Text>
              </Pressable>
            ))}

            <Pressable
              style={[styles.backBtn, { backgroundColor: colors.card2 }]}
              onPress={() => setShowScopePicker(false)}
            >
              <Text style={[styles.btnText, { color: colors.textMuted }]}>뒤로</Text>
            </Pressable>
          </>
        )}
      </Animated.View>
    </Modal>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    backdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      position:            'absolute',
      bottom:              0, left: 0, right: 0,
      backgroundColor:     c.card,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom:       40, paddingHorizontal:    20,
    },
    handle: {
      width: 36, height: 4, borderRadius: 2, backgroundColor: c.border,
      alignSelf: 'center', marginTop: 12, marginBottom: 16,
    },
    sectionLabel: { fontSize: 12, fontWeight: '600', marginBottom: 12, letterSpacing: 0.4 },

    dateRow: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      borderWidth: 1, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 4,
      marginBottom: 20,
    },
    arrowBtn:  { padding: 8 },
    dateLabel: { fontSize: 15, fontWeight: '600' },

    timePicker: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 12, marginBottom: 24,
    },
    spinnerCol: { alignItems: 'center', gap: 8 },
    spinnerBtn: { padding: 4 },
    spinnerValue: {
      width: 80, height: 56, borderRadius: 12, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    spinnerText: { fontSize: 28, fontWeight: '300', letterSpacing: 1 },
    colon:       { fontSize: 28, fontWeight: '300', marginTop: -4 },

    btnRow: { flexDirection: 'row', gap: 10 },
    btn: {
      flex: 1, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12,
    },
    cancelBtn: { borderWidth: 1 },
    saveBtn:   {},
    btnText:   { fontSize: 16, fontWeight: '600' },

    scopeItem: { paddingVertical: 17 },
    scopeText: { fontSize: 16 },
    backBtn: {
      marginTop: 12, paddingVertical: 14,
      borderRadius: 12, alignItems: 'center',
    },
  });
}
