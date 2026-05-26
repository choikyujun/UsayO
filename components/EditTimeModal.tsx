import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Modal, Platform, Pressable, StyleSheet, Text, View,
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
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${KO_DAYS[d.getDay()]})`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// 누르는 동안 자동 반복 — 350ms 후 시작, 120ms 간격, 1.2초 후 45ms로 가속
function useRepeatPress(action: () => void) {
  const actionRef   = useRef(action);
  actionRef.current = action;
  const ivRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const t1Ref = useRef<ReturnType<typeof setTimeout>  | null>(null);
  const t2Ref = useRef<ReturnType<typeof setTimeout>  | null>(null);

  const start = useCallback(() => {
    actionRef.current();
    t1Ref.current = setTimeout(() => {
      ivRef.current = setInterval(() => actionRef.current(), 120);
      t2Ref.current = setTimeout(() => {
        if (ivRef.current) clearInterval(ivRef.current);
        ivRef.current = setInterval(() => actionRef.current(), 45);
      }, 1200);
    }, 350);
  }, []);

  const stop = useCallback(() => {
    if (t1Ref.current) { clearTimeout(t1Ref.current);   t1Ref.current = null; }
    if (t2Ref.current) { clearTimeout(t2Ref.current);   t2Ref.current = null; }
    if (ivRef.current) { clearInterval(ivRef.current);  ivRef.current = null; }
  }, []);

  useEffect(() => stop, []);
  return { onPressIn: start, onPressOut: stop };
}

interface Props {
  visible: boolean;
  event: Event | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditTimeModal({ visible, event, onClose, onSaved }: Props) {
  console.log('[EditTimeModal] render, visible:', visible, 'event:', event?.id ?? null);
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  const [date,           setDate]           = useState(new Date());
  const [hour,           setHour]           = useState(0);
  const [minute,         setMinute]         = useState(0);
  const [saving,          setSaving]          = useState(false);
  const [showScopePicker, setShowScopePicker] = useState(false);
  const [showTimePicker,  setShowTimePicker]  = useState(false);

  const pickerDate = useMemo(() => {
    const d = new Date(date);
    d.setHours(hour, minute, 0, 0);
    return d;
  }, [date, hour, minute]);

  const isRecurring = event ? (event.is_recurring || isVirtualInstance(event.id)) : false;
  const ev          = event;
  const durationMs  = ev ? new Date(ev.end_at).getTime() - new Date(ev.start_at).getTime() : 3_600_000;

  useEffect(() => {
    if (visible && event) {
      const dt = new Date(event.start_at);
      setDate(dt);
      setHour(dt.getHours());
      setMinute(dt.getMinutes());
      setShowScopePicker(false);
      setShowTimePicker(false);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1,    duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 20 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0,    duration: 150, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  function prevDay() { setDate(d => { const n = new Date(d); n.setDate(n.getDate() - 1); return n; }); }
  function nextDay() { setDate(d => { const n = new Date(d); n.setDate(n.getDate() + 1); return n; }); }
  function incHour()   { setHour(h   => (h  +  1) % 24); }
  function decHour()   { setHour(h   => (h  + 23) % 24); }
  function incMinute() { setMinute(m => (m  +  5) % 60); }
  function decMinute() { setMinute(m => (m  + 55) % 60); }

  function handleTimePickerChange(_: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (selected) {
      setHour(selected.getHours());
      setMinute(selected.getMinutes());
    }
  }

  const incHourRep   = useRepeatPress(incHour);
  const decHourRep   = useRepeatPress(decHour);
  const incMinuteRep = useRepeatPress(incMinute);
  const decMinuteRep = useRepeatPress(decMinute);
  const prevDayRep   = useRepeatPress(prevDay);
  const nextDayRep   = useRepeatPress(nextDay);

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
          { parent_id: parentId, instance_date: instanceDate, is_deleted: false, override_start: newStart, override_end: newEnd },
          { onConflict: 'parent_id,instance_date' },
        );

      } else {
        const parsed       = parseInstanceId(ev.id);
        const parentId     = parsed?.parentId ?? ev.id;
        const instanceDate = parsed?.instanceDate ?? ev.start_at.split('T')[0];
        const prevDay      = new Date(instanceDate + 'T00:00:00');
        prevDay.setDate(prevDay.getDate() - 1);

        await supabase.from('events')
          .update({ recurrence_end_date: prevDay.toISOString().split('T')[0], updated_at: now })
          .eq('id', parentId);

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from('events').insert({
            user_id: user.id, title: ev.title,
            start_at: newStart, end_at: newEnd,
            is_recurring: ev.is_recurring, recurrence_rule: ev.recurrence_rule,
            recurrence_end_date: ev.recurrence_end_date,
            color: ev.color, category: ev.category, created_via: 'manual' as const,
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
    if (!ev) return;
    if (isRecurring) setShowScopePicker(true);
    else             save('all');
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      {/* ── Dim backdrop ── */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} pointerEvents="none" />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      {/* ── Modal card ── */}
      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View style={[styles.modal, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>

          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>
              {showScopePicker ? '반복 일정 수정 범위' : '시간 변경'}
            </Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color={colors.textMuted} strokeWidth={1.5} />
            </Pressable>
          </View>

          {!showScopePicker ? (
            <>
              {/* ── Date row ── */}
              <View style={[styles.dateRow, { backgroundColor: colors.card2, borderColor: colors.border }]}>
                <Pressable {...prevDayRep} hitSlop={10}>
                  <ChevronLeft size={20} color={colors.textMuted} strokeWidth={1.5} />
                </Pressable>
                <Text style={[styles.dateLabel, { color: colors.textPrimary }]}>
                  {formatDateLabel(date)}
                </Text>
                <Pressable {...nextDayRep} hitSlop={10}>
                  <ChevronRight size={20} color={colors.textMuted} strokeWidth={1.5} />
                </Pressable>
              </View>

              {/* ── Time picker ── */}
              <View style={styles.timePicker}>
                {/* Hour spinner */}
                <View style={styles.spinnerCol}>
                  <Pressable style={styles.spinnerArrow} {...incHourRep} hitSlop={12}>
                    <ChevronUp size={22} color={colors.primary} strokeWidth={1.5} />
                  </Pressable>
                  <Pressable onPress={() => setShowTimePicker(true)}>
                    <View style={[styles.spinnerBox, { backgroundColor: colors.card2, borderColor: showTimePicker ? colors.primary : colors.border }]}>
                      <Text style={[styles.spinnerNum, { color: colors.textPrimary }]}>{pad2(hour)}</Text>
                    </View>
                  </Pressable>
                  <Pressable style={styles.spinnerArrow} {...decHourRep} hitSlop={12}>
                    <ChevronDown size={22} color={colors.primary} strokeWidth={1.5} />
                  </Pressable>
                </View>

                <Text style={[styles.colon, { color: colors.textSecondary }]}>:</Text>

                {/* Minute spinner */}
                <View style={styles.spinnerCol}>
                  <Pressable style={styles.spinnerArrow} {...incMinuteRep} hitSlop={12}>
                    <ChevronUp size={22} color={colors.primary} strokeWidth={1.5} />
                  </Pressable>
                  <Pressable onPress={() => setShowTimePicker(true)}>
                    <View style={[styles.spinnerBox, { backgroundColor: colors.card2, borderColor: showTimePicker ? colors.primary : colors.border }]}>
                      <Text style={[styles.spinnerNum, { color: colors.textPrimary }]}>{pad2(minute)}</Text>
                    </View>
                  </Pressable>
                  <Pressable style={styles.spinnerArrow} {...decMinuteRep} hitSlop={12}>
                    <ChevronDown size={22} color={colors.primary} strokeWidth={1.5} />
                  </Pressable>
                </View>
              </View>

              {/* ── 시스템 시계 피커 (iOS: 인라인 스피너, Android: 원형 클럭 다이얼로그) ── */}
              {showTimePicker && Platform.OS === 'ios' && (
                <View style={[styles.iosPickerWrap, { borderColor: colors.border }]}>
                  <DateTimePicker
                    value={pickerDate}
                    mode="time"
                    display="spinner"
                    onChange={handleTimePickerChange}
                    locale="ko-KR"
                    minuteInterval={5}
                    style={{ width: '100%' }}
                  />
                  <Pressable
                    style={[styles.iosPickerDone, { backgroundColor: colors.primary }]}
                    onPress={() => setShowTimePicker(false)}
                  >
                    <Text style={styles.iosPickerDoneText}>완료</Text>
                  </Pressable>
                </View>
              )}
              {showTimePicker && Platform.OS === 'android' && (
                <DateTimePicker
                  value={pickerDate}
                  mode="time"
                  display="clock"
                  onChange={handleTimePickerChange}
                  minuteInterval={5}
                />
              )}

              {/* Buttons */}
              <View style={styles.btnRow}>
                <Pressable style={styles.cancelBtn} onPress={onClose}>
                  <Text style={[styles.cancelText, { color: colors.textSecondary }]}>취소</Text>
                </Pressable>
                <Pressable
                  style={[styles.saveBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSavePress}
                  disabled={saving}
                >
                  <Text style={styles.saveBtnText}>저장</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              {/* Scope picker */}
              <View style={[styles.scopeList, { borderColor: colors.border }]}>
                {(['this', 'future', 'all'] as Scope[]).map((scope, i, arr) => (
                  <Pressable
                    key={scope}
                    style={({ pressed }) => [
                      styles.scopeItem,
                      i < arr.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                      { opacity: pressed ? 0.6 : 1 },
                    ]}
                    onPress={() => save(scope)}
                  >
                    <Text style={[styles.scopeText, { color: scope === 'this' ? colors.textPrimary : colors.error }]}>
                      {SCOPE_LABELS[scope]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={styles.cancelBtn} onPress={() => setShowScopePicker(false)}>
                <Text style={[styles.cancelText, { color: colors.textSecondary }]}>뒤로</Text>
              </Pressable>
            </>
          )}
        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    backdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    centerWrap: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modal: {
      width: '85%',
      backgroundColor: c.card,
      borderRadius: 20,
      padding: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 8,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 20,
    },
    heading: { fontSize: 18, fontWeight: '600' },

    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderWidth: 1,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 20,
    },
    dateLabel: { fontSize: 15, fontWeight: '500' },

    timePicker: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      marginBottom: 24,
    },
    spinnerCol:   { alignItems: 'center', gap: 6 },
    spinnerArrow: { padding: 4 },
    spinnerBox: {
      width: 72, height: 56,
      borderRadius: 12, borderWidth: 1,
      alignItems: 'center', justifyContent: 'center',
    },
    spinnerNum: { fontSize: 26, fontWeight: '300', letterSpacing: 1 },
    colon:      { fontSize: 26, fontWeight: '300', marginBottom: 4 },
    iosPickerWrap: {
      borderRadius: 14, borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden', marginBottom: 8,
    },
    iosPickerDone: {
      margin: 12, borderRadius: 12,
      alignItems: 'center', paddingVertical: 12,
    },
    iosPickerDoneText: { fontSize: 15, fontWeight: '600', color: '#fff' },

    btnRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
    },
    cancelBtn:   { height: 48, paddingHorizontal: 8, justifyContent: 'center' },
    cancelText:  { fontSize: 16, fontWeight: '500' },
    saveBtn:     { height: 48, paddingHorizontal: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    saveBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
    scopeList:   { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 16, overflow: 'hidden' },
    scopeItem:   { paddingVertical: 15, paddingHorizontal: 16 },
    scopeText:   { fontSize: 16 },
  });
}
