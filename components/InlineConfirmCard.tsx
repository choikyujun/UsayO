import { Calendar, FileText, MapPin, RefreshCw, Users } from 'lucide-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { useConfirmVoiceLoop } from '../hooks/useConfirmVoiceLoop';
import { ClassifiedIntent } from '../types';
import { Spacing } from '../constants/spacing';
import ConfirmCardFooter from './ConfirmCardFooter';

const INTENT_LABEL: Record<string, string> = {
  CREATE:              '일정 추가',
  UPDATE:              '일정 수정',
  DELETE:              '일정 삭제',
  QUERY:               '일정 조회',
  COMPLETE:            '일정 완료',
  NOTIFICATION_UPDATE: '알림 변경',
};

interface Props {
  intent: ClassifiedIntent;
  transcript?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatDateTime(iso: string, originalText?: string): string {
  if (originalText) return originalText;
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day   = d.getDate();
  const hour  = d.getHours();
  const min   = d.getMinutes();
  const ampm  = hour < 12 ? '오전' : '오후';
  const h12   = hour % 12 || 12;
  const minStr = min > 0 ? `:${String(min).padStart(2, '0')}` : '';
  return `${month}월 ${day}일 ${ampm} ${h12}${minStr}시`;
}

export default function InlineConfirmCard({ intent, transcript, onConfirm, onCancel }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const dt = intent.startDateTime ?? intent.updateFields?.startDateTime;
  console.log('[ConfirmCard/Inline] props 받음:', { time: dt?.date ?? 'none', ambiguous: intent.ambiguous, suggestedMeridiem: intent.suggestedMeridiem ?? 'none' });
  console.log('[ConfirmCard/Inline] showAmpmToggle 결정:', false, '(InlineConfirmCard는 AM/PM 토글 없음 — ambiguous이면 ConfirmCard로 라우팅돼야 함)');
  console.log('[ConfirmCard/Inline] 렌더 시점:', new Date().toISOString());

  // 확인 음성 루프(마이크 오픈·카운트다운·STT 판정·재질문)는 공용 훅이 소유한다.
  // MultiConfirmCard와 동일한 훅 → 한쪽만 고쳐지는 divergence 방지.
  const { status, countdown, micActive, resolve, pauseCountdown } =
    useConfirmVoiceLoop({ onConfirm, onCancel, logTag: '[Confirm]' });

  const slideY  = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // ── 슬라이드인 애니메이션 ────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  const dateStr = dt ? formatDateTime(dt.date, dt.originalText) : null;
  const title   =
    intent.title ??
    intent.updateFields?.title ??
    intent.targetEventQuery ??
    intent.deleteTargetQuery;

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* 배경(카드 밖) 탭 → 취소 */}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => resolve('cancel')} />
      <View style={styles.overlay} pointerEvents="box-none">
        <Animated.View
          style={[styles.card, { transform: [{ translateY: slideY }], opacity }]}
        >
         {/* 카드 본문 탭 → 카운트다운 일시정지(취소/저장 아님) */}
         <Pressable onPress={pauseCountdown}>
          {/* 인텐트 배지 */}
          <View style={styles.headerRow}>
            <View style={styles.intentBadge}>
              <Text style={styles.intentLabel}>
                {INTENT_LABEL[intent.intent] ?? intent.intent}
              </Text>
            </View>
          </View>

          {/* 인식된 텍스트 */}
          {!!transcript && (
            <Text style={styles.rawText}>"{transcript}"</Text>
          )}

          {/* 상세 정보 */}
          <View style={styles.details}>
            {!!title && (
              <View style={styles.detailRow}>
                <FileText size={16} color={colors.textMuted} />
                <Text style={styles.detailText}>{title}</Text>
              </View>
            )}
            {!!dateStr && (
              <View style={styles.detailRow}>
                <Calendar size={16} color={colors.textMuted} />
                <Text style={styles.detailText}>{dateStr}</Text>
              </View>
            )}
            {dt?.isRecurring && (
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

         </Pressable>

          {/* 하단 상태 — N초 후 저장 / 듣는 중 / 확인 중 (복수 카드와 공용) */}
          <ConfirmCardFooter status={status} countdown={countdown} micActive={micActive} />

          {/* 버튼 — 취소 / 저장(즉시). 음성 "저장"/"취소"와 동일 동작. */}
          <View style={styles.buttonRow}>
            <Pressable style={styles.btnCancel} onPress={() => resolve('cancel')}>
              <Text style={styles.btnCancelText}>취소</Text>
            </Pressable>
            <Pressable style={styles.btnSave} onPress={() => resolve('confirm')}>
              <Text style={styles.btnSaveText}>저장</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    card: {
      backgroundColor: c.card,
      borderRadius: 20,
      padding: Spacing.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.18,
      shadowRadius: 20,
      elevation: 12,
      borderWidth: 1,
      borderColor: c.border,
    },
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.md,
    },
    intentBadge: {
      backgroundColor: c.primary + '1A',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: 20,
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
      marginBottom: 20,
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
    buttonRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.base,
    },
    btnCancel: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    btnCancelText: {
      fontSize: 15,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: c.textMuted,
    },
    btnSave: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 14,
      alignItems: 'center',
      backgroundColor: c.primary,
    },
    btnSaveText: {
      fontSize: 15,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: '#FFFFFF',
    },
  });
}
