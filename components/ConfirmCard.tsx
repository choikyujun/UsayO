import { Calendar, Check, MapPin, RefreshCw } from 'lucide-react-native';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef } from 'react';
import { Colors } from '../constants/colors';
import { ClassifiedIntent } from '../types';

type Props = {
  intent: ClassifiedIntent;
  transcript?: string | null;
  onConfirm: () => void;
  onRetry: () => void;
};

const INTENT_LABEL: Record<string, string> = {
  CREATE: '일정 추가',
  UPDATE: '일정 수정',
  DELETE: '일정 삭제',
  QUERY: '일정 조회',
  UNKNOWN: '알 수 없음',
};

export default function ConfirmCard({ intent, transcript, onConfirm, onRetry }: Props) {
  const slideY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const displayDateTime = intent.startDateTime ?? intent.updateFields?.startDateTime;
  const dateStr = displayDateTime
    ? formatDateTime(displayDateTime.date, displayDateTime.originalText)
    : null;
  const title =
    intent.title ??
    intent.updateFields?.title ??
    intent.targetEventQuery ??
    intent.deleteTargetQuery;

  return (
    <Animated.View style={[styles.card, { transform: [{ translateY: slideY }], opacity }]}>
      <View style={styles.intentBadge}>
        <Text style={styles.intentLabel}>{INTENT_LABEL[intent.intent] ?? intent.intent}</Text>
      </View>

      {!!transcript && <Text style={styles.rawText}>"{transcript}"</Text>}

      <View style={styles.details}>
        {!!title && (
          <View style={styles.detailRow}>
            <MapPin size={16} color={Colors.textMuted} />
            <Text style={styles.detailText}>{title}</Text>
          </View>
        )}
        {!!dateStr && (
          <View style={styles.detailRow}>
            <Calendar size={16} color={Colors.textMuted} />
            <Text style={styles.detailText}>{dateStr}</Text>
          </View>
        )}
        {displayDateTime?.isRecurring && (
          <View style={styles.detailRow}>
            <RefreshCw size={16} color={Colors.textMuted} />
            <Text style={styles.detailText}>반복 일정</Text>
          </View>
        )}
        {!!intent.location && (
          <View style={styles.detailRow}>
            <MapPin size={16} color={Colors.accent} />
            <Text style={styles.detailText}>{intent.location}</Text>
          </View>
        )}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>다시</Text>
        </Pressable>
        <Pressable style={styles.confirmBtn} onPress={onConfirm}>
          <Check size={16} color="#fff" />
          <Text style={styles.confirmText}>맞아요</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

function formatDateTime(iso: string, originalText?: string): string {
  if (originalText) return originalText;
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hour = d.getHours();
  const min = d.getMinutes();
  const ampm = hour < 12 ? '오전' : '오후';
  const h12 = hour % 12 || 12;
  const minStr = min > 0 ? `:${String(min).padStart(2, '0')}` : '';
  return `${month}월 ${day}일 ${ampm} ${h12}${minStr}시`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    marginHorizontal: 20,
    shadowColor: Colors.deep,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  intentBadge: {
    backgroundColor: Colors.background,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 12,
  },
  intentLabel: {
    color: Colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  rawText: {
    fontSize: 14,
    color: Colors.textMuted,
    marginBottom: 16,
    fontStyle: 'italic',
  },
  details: {
    gap: 10,
    marginBottom: 24,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 17,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  retryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    alignItems: 'center',
  },
  retryText: {
    color: Colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  confirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
