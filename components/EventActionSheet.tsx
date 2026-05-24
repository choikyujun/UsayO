import { useEffect, useMemo, useRef } from 'react';
import {
  Animated, Modal, Pressable, Share, StyleSheet, Text, View,
} from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { Event } from '../types/database';
import { formatTimeKo } from '../utils/timeHelpers';

interface Props {
  event: Event | null;
  onClose: () => void;
  onDelete: (event: Event) => void;
}

export default function EventActionSheet({ event, onClose, onDelete }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  const startStr = formatTimeKo(new Date(ev.start_at));

  async function handleShare() {
    onClose();
    await Share.share({ message: `[YuSay] ${startStr} ${ev.title}` });
  }

  function handleDelete() {
    onClose();
    onDelete(ev);
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
          <Text style={styles.title} numberOfLines={2}>{ev.title}</Text>
        </View>

        <View style={styles.actions}>
          <ActionBtn label="시간 변경" icon="🕐" onPress={onClose} colors={colors} />
          <ActionBtn label="제목 수정" icon="✏️" onPress={onClose} colors={colors} />
          <ActionBtn label="알림 설정" icon="🔔" onPress={onClose} colors={colors} />
          <ActionBtn label="카카오로 공유" icon="💬" onPress={handleShare} colors={colors} />
          <ActionBtn label="삭제" icon="🗑️" onPress={handleDelete} colors={colors} danger />
        </View>

        <Pressable style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelText}>취소</Text>
        </Pressable>
      </Animated.View>
    </Modal>
  );
}

function ActionBtn({
  label, icon, onPress, colors, danger,
}: { label: string; icon: string; onPress: () => void; colors: AppTheme; danger?: boolean }) {
  return (
    <Pressable
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          paddingHorizontal: 20,
          paddingVertical: 14,
          opacity: pressed ? 0.6 : 1,
        },
      ]}
      onPress={onPress}
    >
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={{
        fontSize: 16,
        color: danger ? colors.error : colors.textPrimary,
        fontWeight: danger ? '600' : '400',
      }}>
        {label}
      </Text>
    </Pressable>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    sheet: {
      position: 'absolute',
      bottom: 0, left: 0, right: 0,
      backgroundColor: c.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingBottom: 36,
    },
    handle: {
      width: 36, height: 4,
      borderRadius: 2,
      backgroundColor: c.border,
      alignSelf: 'center',
      marginTop: 12,
      marginBottom: 12,
    },
    titleRow: {
      paddingHorizontal: 20,
      paddingBottom: 12,
      borderBottomWidth: 0.5,
      borderColor: c.border,
      gap: 2,
    },
    time:  { fontSize: 11, color: c.textMuted },
    title: { fontSize: 17, fontWeight: '700', color: c.textPrimary },
    actions: { paddingTop: 6 },
    cancelBtn: {
      marginHorizontal: 20,
      marginTop: 8,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: c.card2,
      alignItems: 'center',
    },
    cancelText: { fontSize: 16, color: c.textMuted, fontWeight: '600' },
  });
}
