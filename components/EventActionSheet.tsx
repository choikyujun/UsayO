import { Bell, Bookmark, ChevronsRight, Clock, Pencil, Share2, Trash2 } from 'lucide-react-native';
import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated, Modal, Pressable, Share, StyleSheet, Text, View,
} from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { Event } from '../types/database';
import { formatTimeKo } from '../utils/timeHelpers';
import { isVirtualInstance, parseInstanceId } from '../utils/recurrenceHelpers';

export type RecurringDeleteScope = 'this' | 'future' | 'all';

interface Props {
  event: Event | null;
  onClose: () => void;
  onDelete: (event: Event) => void;
  onDeleteRecurring?: (event: Event, scope: RecurringDeleteScope) => void;
  onEditTitle?: (event: Event) => void;
  onEditTime?: (event: Event) => void;
}

export default function EventActionSheet({ event, onClose, onDelete, onDeleteRecurring, onEditTitle, onEditTime }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const slideY = useRef(new Animated.Value(320)).current;
  const bgOp   = useRef(new Animated.Value(0)).current;

  const [showRecurringPicker, setShowRecurringPicker] = useState(false);

  const visible = !!event;

  useEffect(() => {
    if (visible) {
      setShowRecurringPicker(false);
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 70, friction: 12 }),
        Animated.timing(bgOp, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 320, duration: 220, useNativeDriver: true }),
        Animated.timing(bgOp, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  if (!event) return null;
  const ev = event;

  const isRecurringEvent = ev.is_recurring || isVirtualInstance(ev.id);
  const startStr = formatTimeKo(new Date(ev.start_at));

  async function handleShare() {
    onClose();
    await Share.share({ message: `[YuSay] ${startStr} ${ev.title}` });
  }

  function handleDeletePress() {
    if (isRecurringEvent && onDeleteRecurring) {
      setShowRecurringPicker(true);
    } else {
      onClose();
      onDelete(ev);
    }
  }

  function handleRecurringScope(scope: RecurringDeleteScope) {
    setShowRecurringPicker(false);
    onClose();
    if (scope === 'all' && !isVirtualInstance(ev.id)) {
      // 부모 자체 삭제
      onDelete(ev);
    } else {
      onDeleteRecurring?.(ev, scope);
    }
  }

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: bgOp }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={styles.handle} />

        <View style={styles.titleRow}>
          <Text style={styles.time}>{startStr}</Text>
          <View style={styles.titleWrap}>
            <Text style={styles.title} numberOfLines={2}>{ev.title}</Text>
            {isRecurringEvent && (
              <Text style={[styles.recurBadge, { color: colors.accent }]}>🔁 반복 일정</Text>
            )}
          </View>
        </View>

        {!showRecurringPicker ? (
          <>
            <View style={styles.actions}>
              <ActionBtn label="시간 변경" Icon={Clock}   onPress={() => onEditTime?.(ev)}  colors={colors} />
              <ActionBtn label="제목 수정" Icon={Pencil}  onPress={() => onEditTitle?.(ev)} colors={colors} />
              <ActionBtn label="알림 설정" Icon={Bell}    onPress={onClose}          colors={colors} />
              <ActionBtn label="카카오로 공유" Icon={Share2} onPress={handleShare}   colors={colors} />
              <ActionBtn label="삭제"      Icon={Trash2}  onPress={handleDeletePress} colors={colors} danger />
            </View>

            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.pickerHeader}>
              <Text style={[styles.pickerTitle, { color: colors.textPrimary }]}>
                반복 일정 삭제
              </Text>
              <Text style={[styles.pickerSub, { color: colors.textMuted }]}>
                어느 범위를 삭제할까요?
              </Text>
            </View>

            <View style={styles.actions}>
              <ActionBtn
                label="이번 일정만"
                Icon={Bookmark}
                onPress={() => handleRecurringScope('this')}
                colors={colors}
              />
              <ActionBtn
                label="이번 + 앞으로 모두"
                Icon={ChevronsRight}
                onPress={() => handleRecurringScope('future')}
                colors={colors}
                danger
              />
              <ActionBtn
                label="전체 반복 삭제"
                Icon={Trash2}
                onPress={() => handleRecurringScope('all')}
                colors={colors}
                danger
              />
            </View>

            <Pressable style={styles.cancelBtn} onPress={() => setShowRecurringPicker(false)}>
              <Text style={styles.cancelText}>뒤로</Text>
            </Pressable>
          </>
        )}
      </Animated.View>
    </Modal>
  );
}

function ActionBtn({
  label, Icon, onPress, colors, danger,
}: { label: string; Icon: LucideIcon; onPress: () => void; colors: AppTheme; danger?: boolean }) {
  const iconColor = danger ? colors.error : colors.textPrimary;
  return (
    <Pressable
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', gap: 12,
        paddingHorizontal: 20, paddingVertical: 14,
        opacity: pressed ? 0.6 : 1,
      }]}
      onPress={onPress}
    >
      <Icon size={20} color={iconColor} strokeWidth={1.5} />
      <Text style={{ fontSize: 16, color: iconColor, fontWeight: danger ? '600' : '400' }}>
        {label}
      </Text>
    </Pressable>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: {
      position: 'absolute', bottom: 0, left: 0, right: 0,
      backgroundColor: c.card,
      borderTopLeftRadius: 20, borderTopRightRadius: 20,
      paddingBottom: 36,
    },
    handle: {
      width: 36, height: 4, borderRadius: 2,
      backgroundColor: c.border,
      alignSelf: 'center', marginTop: 12, marginBottom: 12,
    },
    titleRow: {
      paddingHorizontal: 20, paddingBottom: 12,
      borderBottomWidth: 0.5, borderColor: c.border, gap: 2,
    },
    titleWrap: { gap: 2 },
    time:       { fontSize: 11, color: c.textMuted },
    title:      { fontSize: 17, fontWeight: '700', color: c.textPrimary },
    recurBadge: { fontSize: 11, fontWeight: '500' },
    actions:    { paddingTop: 6 },
    cancelBtn: {
      marginHorizontal: 20, marginTop: 8,
      paddingVertical: 14, borderRadius: 12,
      backgroundColor: c.card2, alignItems: 'center',
    },
    cancelText: { fontSize: 16, color: c.textMuted, fontWeight: '600' },
    pickerHeader: {
      paddingHorizontal: 20, paddingVertical: 12, gap: 2,
    },
    pickerTitle: { fontSize: 15, fontWeight: '700' },
    pickerSub:   { fontSize: 13 },
  });
}
