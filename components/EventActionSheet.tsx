import { Bell, Clock, Pencil, Share2, Trash2 } from 'lucide-react-native';

import type { LucideIcon } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import {
  Animated, Modal, Pressable, Share, StyleSheet, Text, View,
} from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { Event } from '../types/database';
import { formatTimeKo } from '../utils/timeHelpers';
import { isVirtualInstance } from '../utils/recurrenceHelpers';
import { Spacing } from '../constants/spacing';

// 다른 파일에서 여전히 사용 중인 타입은 그대로 export 유지
export type RecurringDeleteScope = 'this' | 'future' | 'all';

interface Props {
  event: Event | null;
  onClose: () => void;
  onEditTitle?: (event: Event) => void;
  onEditTime?: (event: Event) => void;
  onEditNotification?: (event: Event) => void;
  onDeleteAll?: (event: Event) => void;
}

export default function EventActionSheet({ event, onClose, onEditTitle, onEditTime, onEditNotification, onDeleteAll }: Props) {
  const colors = useColors();
  const slideY = useRef(new Animated.Value(320)).current;
  const bgOp   = useRef(new Animated.Value(0)).current;

  const visible = !!event;

  useEffect(() => {
    if (visible) {
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

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: bgOp }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { backgroundColor: colors.card, transform: [{ translateY: slideY }] }]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />

        {/* 이벤트 정보 */}
        <View style={styles.titleRow}>
          <Text style={[styles.eventTitle, { color: colors.textPrimary }]} numberOfLines={1}>
            {ev.title}
          </Text>
          <View style={styles.metaRow}>
            <Text style={[styles.eventTime, { color: colors.textMuted }]}>{startStr}</Text>
            {isRecurringEvent && (
              <View style={[styles.recurTag, { backgroundColor: colors.accent + '20' }]}>
                <Text style={[styles.recurTagText, { color: colors.accent }]}>반복</Text>
              </View>
            )}
          </View>
        </View>

        {/* 4개 아이콘 그리드 */}
        <View style={[styles.gridRow, { borderTopColor: colors.border }]}>
          <GridBtn label="시간 변경" Icon={Clock}   onPress={() => onEditTime?.(ev)}                       colors={colors} />
          <GridBtn label="제목 수정" Icon={Pencil}  onPress={() => onEditTitle?.(ev)}                      colors={colors} />
          <GridBtn label="알림 설정" Icon={Bell}    onPress={() => { onClose(); onEditNotification?.(ev); }} colors={colors} />
          <GridBtn label="공유"      Icon={Share2}  onPress={handleShare}                                   colors={colors} />
        </View>

        {/* 전체 반복 일정 삭제 (반복 일정인 경우에만) */}
        {isRecurringEvent && onDeleteAll && (
          <Pressable
            style={({ pressed }) => [
              styles.deleteAllRow,
              { backgroundColor: pressed ? colors.error + '22' : colors.error + '12' },
            ]}
            onPress={() => { onClose(); onDeleteAll(ev); }}
          >
            <Trash2 size={18} color={colors.error} strokeWidth={1.8} />
            <View style={styles.deleteAllTextCol}>
              <Text style={[styles.deleteAllLabel, { color: colors.error }]}>전체 반복 일정 삭제</Text>
              <Text style={[styles.deleteAllSub, { color: colors.textMuted }]}>지난 일정도 모두 삭제됩니다</Text>
            </View>
          </Pressable>
        )}

        {/* 취소 */}
        <Pressable
          style={({ pressed }) => [styles.cancelBtn, { backgroundColor: colors.card2, opacity: pressed ? 0.6 : 1 }]}
          onPress={onClose}
        >
          <Text style={[styles.cancelBtnText, { color: colors.textSecondary }]}>취소</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

function GridBtn({
  label, Icon, onPress, colors,
}: { label: string; Icon: LucideIcon; onPress: () => void; colors: AppTheme }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.gridBtn, { opacity: pressed ? 0.5 : 1 }]}
      onPress={onPress}
    >
      <View style={[styles.gridIconWrap, { backgroundColor: colors.card2 }]}>
        <Icon size={20} color={colors.textPrimary} strokeWidth={1.5} />
      </View>
      <Text style={[styles.gridLabel, { color: colors.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 40,
  },
  handle: {
    width: 32, height: 3.5, borderRadius: 2,
    alignSelf: 'center', marginTop: 10, marginBottom: Spacing.base,
  },
  titleRow: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.base, gap: Spacing.xs,
  },
  eventTitle: { fontSize: 17, fontFamily: 'Pretendard-Bold', fontWeight: '700', letterSpacing: -0.3 },
  metaRow:    { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eventTime:  { fontSize: 13 },
  recurTag: {
    paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6,
  },
  recurTagText: { fontSize: 11, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    paddingHorizontal: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  gridBtn: { alignItems: 'center', gap: Spacing.sm, flex: 1 },
  gridIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  gridLabel: { fontSize: 11, fontFamily: 'Pretendard-Medium', fontWeight: '500' },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 20,
    marginTop: Spacing.md,
  },
  deleteAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: Spacing.md,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    gap: 12,
  },
  deleteAllTextCol: { flex: 1, gap: 2 },
  deleteAllLabel: { fontSize: 14, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
  deleteAllSub:   { fontSize: 12, fontFamily: 'Pretendard-Regular', fontWeight: '400' },
  cancelBtn: {
    marginHorizontal: 20, marginTop: Spacing.md,
    paddingVertical: 15, borderRadius: 14, alignItems: 'center',
  },
  cancelBtnText: { fontSize: 16, fontFamily: 'Pretendard-SemiBold', fontWeight: '600', textAlign: 'center' },
});
