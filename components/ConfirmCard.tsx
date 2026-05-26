import { Calendar, Check, FileText, MapPin, RefreshCw, Users } from 'lucide-react-native';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Colors } from '../constants/colors';
import { ClassifiedIntent } from '../types';
import { formatKoreanTime } from '../utils/timeFormat';

type Props = {
  intent: ClassifiedIntent;
  transcript?: string | null;
  onConfirm: () => void;
  onRetry: () => void;
  onAmPmChange?: (patched: ClassifiedIntent) => void;
};

const INTENT_LABEL: Record<string, string> = {
  CREATE: '일정 추가',
  UPDATE: '일정 수정',
  DELETE: '일정 삭제',
  QUERY: '일정 조회',
  UNKNOWN: '알 수 없음',
};

export default function ConfirmCard({ intent, transcript, onConfirm, onRetry, onAmPmChange }: Props) {
  const slideY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const displayDateTime = intent.startDateTime ?? intent.updateFields?.startDateTime;

  // AM/PM 선택 상태: ambiguous일 때만 사용자가 바꿀 수 있음
  const initialMeridiem = intent.suggestedMeridiem ?? 'AM';
  const [meridiem, setMeridiem] = useState<'AM' | 'PM'>(initialMeridiem);

  const handleMeridiem = (m: 'AM' | 'PM') => {
    setMeridiem(m);
    if (!intent.ambiguous || !displayDateTime) return;
    const d = new Date(displayDateTime.date);
    const h = d.getHours() % 12;
    d.setHours(m === 'AM' ? h : h + 12);
    onAmPmChange?.({
      ...intent,
      ambiguous: false,
      startDateTime: { ...displayDateTime, date: d.toISOString() },
    });
  };

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  // ambiguous 시 meridiem 선택에 따라 date를 재계산 (표시용)
  const resolvedDate = (() => {
    if (!displayDateTime) return null;
    if (!intent.ambiguous) return new Date(displayDateTime.date);
    const d = new Date(displayDateTime.date);
    const h = d.getHours() % 12;
    d.setHours(meridiem === 'AM' ? h : h + 12);
    return d;
  })();

  const dateStr = resolvedDate ? formatKoreanTime(resolvedDate) : null;

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
            <FileText size={16} color={Colors.textMuted} />
            <Text style={styles.detailText}>{title}</Text>
          </View>
        )}
        {!!displayDateTime && (
          <View style={styles.detailRow}>
            <Calendar size={16} color={intent.ambiguous ? Colors.accent : Colors.textMuted} />
            {intent.ambiguous ? (
              <View style={styles.ampmRow}>
                <Text style={[styles.detailText, styles.ampmDate]}>{dateStr}</Text>
                <View style={styles.ampmToggle}>
                  <Pressable
                    style={[styles.ampmBtn, meridiem === 'AM' && styles.ampmBtnActive]}
                    onPress={() => handleMeridiem('AM')}
                  >
                    <Text style={[styles.ampmBtnText, meridiem === 'AM' && styles.ampmBtnTextActive]}>
                      오전
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.ampmBtn, meridiem === 'PM' && styles.ampmBtnActive]}
                    onPress={() => handleMeridiem('PM')}
                  >
                    <Text style={[styles.ampmBtnText, meridiem === 'PM' && styles.ampmBtnTextActive]}>
                      오후
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Text style={styles.detailText}>{dateStr}</Text>
            )}
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
        {!!intent.notes && (
          <View style={styles.detailRow}>
            <FileText size={16} color={Colors.textMuted} />
            <Text style={[styles.detailText, styles.detailMuted]}>{intent.notes}</Text>
          </View>
        )}
        {!!intent.attendees?.length && (
          <View style={styles.detailRow}>
            <Users size={16} color={Colors.textMuted} />
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
  detailMuted: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.textMuted,
  },
  ampmRow: {
    flex: 1,
    gap: 8,
  },
  ampmDate: {
    flex: 0,
  },
  ampmToggle: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  ampmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.accent,
  },
  ampmBtnActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  ampmBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.primary,
  },
  ampmBtnTextActive: {
    color: '#fff',
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
