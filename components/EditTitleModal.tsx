import { X } from 'lucide-react-native';
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
  visible: boolean;
  event: Event | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditTitleModal({ visible, event, onClose, onSaved }: Props) {
  console.log('[EditTitleModal] render, visible:', visible, 'event:', event?.id ?? null);
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  const [title,           setTitle]           = useState('');
  const [focused,         setFocused]         = useState(false);
  const [saving,          setSaving]          = useState(false);
  const [showScopePicker, setShowScopePicker] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const isRecurring = event ? (event.is_recurring || isVirtualInstance(event.id)) : false;
  const ev = event;

  useEffect(() => {
    if (visible && event) {
      setTitle(event.title);
      setShowScopePicker(false);
      setFocused(false);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1,    duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 20 }),
      ]).start(() => setTimeout(() => inputRef.current?.focus(), 60));
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0,    duration: 150, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  async function save(scope: Scope) {
    if (!ev || !title.trim() || saving) return;
    setSaving(true);
    try {
      const newTitle = title.trim();
      const now      = new Date().toISOString();

      if (!isRecurring || scope === 'all') {
        const realId = isVirtualInstance(ev.id)
          ? (parseInstanceId(ev.id)?.parentId ?? ev.id)
          : ev.id;
        await supabase.from('events').update({ title: newTitle, updated_at: now }).eq('id', realId);

      } else if (scope === 'this') {
        const parsed       = parseInstanceId(ev.id);
        const parentId     = parsed?.parentId ?? ev.id;
        const instanceDate = parsed?.instanceDate ?? ev.start_at.split('T')[0];
        await supabase.from('event_exceptions').upsert(
          { parent_id: parentId, instance_date: instanceDate, is_deleted: false, override_title: newTitle },
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
            user_id: user.id, title: newTitle,
            start_at: ev.start_at, end_at: ev.end_at,
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
    if (!ev || !title.trim()) return;
    if (isRecurring) setShowScopePicker(true);
    else             save('all');
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ── Dim backdrop ── */}
        <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} pointerEvents="none" />
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        {/* ── Modal card ── */}
        <View style={styles.centerWrap} pointerEvents="box-none">
          <Animated.View style={[styles.modal, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>

            {/* Header */}
            <View style={styles.header}>
              <Text style={[styles.heading, { color: colors.textPrimary }]}>
                {showScopePicker ? '반복 일정 수정 범위' : '제목 수정'}
              </Text>
              <Pressable onPress={onClose} hitSlop={10}>
                <X size={20} color={colors.textMuted} strokeWidth={1.5} />
              </Pressable>
            </View>

            {!showScopePicker ? (
              <>
                {/* Input */}
                <TextInput
                  ref={inputRef}
                  style={[
                    styles.input,
                    { color: colors.textPrimary, backgroundColor: colors.card2 },
                    { borderColor: focused ? colors.primary : colors.border,
                      borderWidth: focused ? 1.5 : 1 },
                  ]}
                  value={title}
                  onChangeText={setTitle}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  returnKeyType="done"
                  onSubmitEditing={handleSavePress}
                  selectionColor={colors.primary}
                  placeholder="일정 제목"
                  placeholderTextColor={colors.textTertiary}
                />

                {/* Buttons */}
                <View style={styles.btnRow}>
                  <Pressable style={styles.cancelBtn} onPress={onClose}>
                    <Text style={[styles.cancelText, { color: colors.textSecondary }]}>취소</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.saveBtn, { backgroundColor: title.trim() ? colors.primary : colors.border }]}
                    onPress={handleSavePress}
                    disabled={!title.trim() || saving}
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
                      <Text style={[styles.scopeText,
                        { color: scope === 'this' ? colors.textPrimary : colors.error },
                      ]}>
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
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    kav:       { flex: 1 },
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
    input: {
      height: 52,
      borderRadius: 12,
      paddingHorizontal: 16,
      fontSize: 16,
      marginBottom: 20,
    },
    btnRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 12,
    },
    cancelBtn:    { height: 48, paddingHorizontal: 8, justifyContent: 'center' },
    cancelText:   { fontSize: 16, fontWeight: '500' },
    saveBtn:      { height: 48, paddingHorizontal: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
    saveBtnText:  { fontSize: 16, fontWeight: '600', color: '#fff' },
    scopeList:    { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginBottom: 16, overflow: 'hidden' },
    scopeItem:    { paddingVertical: 15, paddingHorizontal: 16 },
    scopeText:    { fontSize: 16 },
  });
}
