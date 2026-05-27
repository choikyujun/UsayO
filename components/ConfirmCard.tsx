import { Calendar, Check, FileText, MapPin, RefreshCw, Users } from 'lucide-react-native';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useRef } from 'react';
import { AppTheme, useColors } from '../constants/colors';
import { ClassifiedIntent } from '../types';
import { formatKoreanTime } from '../utils/timeFormat';
import { Spacing } from '../constants/spacing';

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
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const slideY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const displayDateTime = intent.startDateTime ?? intent.updateFields?.startDateTime;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const dateStr = displayDateTime ? formatKoreanTime(new Date(displayDateTime.date)) : null;

  const batchCount = intent.targetEventIds?.length ?? 0;
  const title = batchCount > 1
    ? `${batchCount}개 일정`
    : (intent.title ??
       intent.updateFields?.title ??
       intent.targetEventQuery ??
       intent.deleteTargetQuery);

  return (
    <Animated.View style={[styles.card, { transform: [{ translateY: slideY }], opacity }]}>
      <View style={styles.intentBadge}>
        <Text style={styles.intentLabel}>{INTENT_LABEL[intent.intent] ?? intent.intent}</Text>
      </View>

      {!!transcript && <Text style={styles.rawText}>"{transcript}"</Text>}

      <View style={styles.details}>
        {!!title && (
          <View style={styles.detailRow}>
            <FileText size={16} color={colors.textMuted} />
            <Text style={styles.detailText}>{title}</Text>
          </View>
        )}
        {!!displayDateTime && (
          <View style={styles.detailRow}>
            <Calendar size={16} color={colors.textMuted} />
            <Text style={styles.detailText}>{dateStr}</Text>
          </View>
        )}
        {displayDateTime?.isRecurring && (
          <View style={styles.detailRow}>
            <RefreshCw size={16} color={colors.textMuted} />
            <Text style={styles.detailText}>반복 일정</Text>
          </View>
        )}
        {!!intent.location && (
          <View style={styles.detailRow}>
            <MapPin size={16} color={colors.accent} />
            <Text style={styles.detailText}>{intent.location}</Text>
          </View>
        )}
        {!!intent.notes && (
          <View style={styles.detailRow}>
            <FileText size={16} color={colors.textMuted} />
            <Text style={[styles.detailText, styles.detailMuted]}>{intent.notes}</Text>
          </View>
        )}
        {!!intent.attendees?.length && (
          <View style={styles.detailRow}>
            <Users size={16} color={colors.textMuted} />
            <Text style={[styles.detailText, styles.detailMuted]}>
              {intent.attendees.join(', ')}
            </Text>
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

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    card: {
      backgroundColor: c.card,
      borderRadius: 20,
      padding: Spacing.lg,
      marginHorizontal: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 12,
    },
    intentBadge: {
      backgroundColor: c.card2,
      alignSelf: 'flex-start',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: 20,
      marginBottom: Spacing.md,
    },
    intentLabel: {
      color: c.primary,
      fontSize: 12,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
    },
    rawText: {
      fontSize: 14,
      color: c.textMuted,
      marginBottom: Spacing.base,
      fontStyle: 'italic',
    },
    details: {
      gap: 10,
      marginBottom: Spacing.lg,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.sm,
    },
    detailText: {
      fontSize: 17,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: c.textPrimary,
      flex: 1,
    },
    detailMuted: {
      fontSize: 14,
      fontFamily: 'Pretendard-Regular',
      fontWeight: '400',
      color: c.textMuted,
    },
    actions: {
      flexDirection: 'row',
      gap: Spacing.md,
    },
    retryBtn: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 14,
      borderWidth: 1.5,
      borderColor: c.accent,
      alignItems: 'center',
    },
    retryText: {
      color: c.primary,
      fontSize: 15,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
    },
    confirmBtn: {
      flex: 2,
      flexDirection: 'row',
      paddingVertical: 14,
      borderRadius: 14,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    confirmText: {
      color: '#fff',
      fontSize: 15,
      fontFamily: 'Pretendard-Bold',
      fontWeight: '700',
    },
  });
}
