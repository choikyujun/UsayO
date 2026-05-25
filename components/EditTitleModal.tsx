import { Check, X } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, KeyboardAvoidingView, Modal, Platform,
  Pressable, StyleSheet, Text, TextInput, View,
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

interface Props {
  event: Event | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditTitleModal({ event, onClose, onSaved }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const slideY = useRef(new Animated.Value(320)).current;
  const bgOp   = useRef(new Animated.Value(0)).current;

  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [showScopePicker, setShowScopePicker] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const visible    = !!event;
  const isRecurring = event ? (event.is_recurring || isVirtualInstance(event.id)) : false;

  useEffect(() => {
    if (visible && event) {
      setTitle(event.title);
      setShowScopePicker(false);
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }),
        Animated.timing(bgOp,   { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start(() => setTimeout(() => inputRef.current?.focus(), 60));
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 320, duration: 220, useNativeDriver: true }),
        Animated.timing(bgOp,   { toValue: 0,   duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!event) return null;
  const ev = event;

  async function save(scope: Scope) {
    if (!title.trim() || saving) return;
    setSaving(true);
    try {
      const newTitle = title.trim();
      const now      = new Date().toISOString();

      if (!isRecurring || scope === 'all') {
        const realId = isVirtualInstance(ev.id)
          ? (parseInstanceId(ev.id)?.parentId ?? ev.id)
          : ev.id;
        await supabase
          .from('events')
          .update({ title: newTitle, updated_at: now })
          .eq('id', realId);

      } else if (scope === 'this') {
        const parsed       = parseInstanceId(ev.id);
        const parentId     = parsed?.parentId ?? ev.id;
        const instanceDate = parsed?.instanceDate ?? ev.start_at.split('T')[0];
        await supabase.from('event_exceptions').upsert(
          { parent_id: parentId, instance_date: instanceDate, is_deleted: false, override_title: newTitle },
          { onConflict: 'parent_id,instance_date' },
        );

      } else {
        // 'future': end original + create new recurring event with new title
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
            title:               newTitle,
            start_at:            ev.start_at,
            end_at:              ev.end_at,
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
    if (!title.trim()) return;
    if (isRecurring) {
      setShowScopePicker(true);
    } else {
      save('all');
    }
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: bgOp }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
          <View style={styles.handle} />

          {!showScopePicker ? (
            <>
              <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>제목 수정</Text>

              <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.card2 }]}>
                <TextInput
                  ref={inputRef}
                  style={[styles.input, { color: colors.textPrimary }]}
                  value={title}
                  onChangeText={setTitle}
                  returnKeyType="done"
                  onSubmitEditing={handleSavePress}
                  selectionColor={colors.primary}
                  placeholder="일정 제목"
                  placeholderTextColor={colors.textMuted}
                />
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
                  style={[styles.btn, styles.saveBtn, { backgroundColor: title.trim() ? colors.primary : colors.border }]}
                  onPress={handleSavePress}
                  disabled={!title.trim() || saving}
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    backdrop:  { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    kav:       { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor:     c.card,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom:       36, paddingHorizontal:    20,
    },
    handle: {
      width: 36, height: 4, borderRadius: 2, backgroundColor: c.border,
      alignSelf: 'center', marginTop: 12, marginBottom: 16,
    },
    sectionLabel: { fontSize: 12, fontWeight: '600', marginBottom: 10, letterSpacing: 0.4 },
    inputWrap:    { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, marginBottom: 16 },
    input:        { fontSize: 17, paddingVertical: 14 },
    btnRow:       { flexDirection: 'row', gap: 10 },
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
