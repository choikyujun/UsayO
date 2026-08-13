import { Calendar } from 'lucide-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { useConfirmVoiceLoop } from '../hooks/useConfirmVoiceLoop';
import { ClassifiedIntent } from '../types';
import { Spacing } from '../constants/spacing';
import ConfirmCardFooter from './ConfirmCardFooter';

interface Props {
  events:     ClassifiedIntent[];
  transcript?: string | null;
  onConfirm:  () => void;
  onCancel:   () => void;
}

function formatDateTime(iso: string, originalText?: string): string {
  if (originalText) return originalText;
  const d     = new Date(iso);
  const month = d.getMonth() + 1;
  const day   = d.getDate();
  const hour  = d.getHours();
  const min   = d.getMinutes();
  const ampm  = hour < 12 ? '오전' : '오후';
  const h12   = hour % 12 || 12;
  const minStr = min > 0 ? `:${String(min).padStart(2, '0')}` : '';
  return `${month}월 ${day}일 ${ampm} ${h12}${minStr}시`;
}

export default function MultiConfirmCard({ events, transcript, onConfirm, onCancel }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const slideY  = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // 확인 음성 루프(마이크 오픈·카운트다운·STT 판정·재질문)는 공용 훅이 소유한다.
  // InlineConfirmCard(단일)와 완전히 동일한 훅 → 카운트다운/레코더 파라미터가 항상 같이 움직인다.
  const { status, countdown, micActive, resolve, pauseCountdown } =
    useConfirmVoiceLoop({ onConfirm, onCancel, logTag: '[MultiConfirm]' });

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

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
          {/* 배지 */}
          <View style={styles.headerRow}>
            <View style={styles.badge}>
              <Text style={[styles.badgeText, { color: colors.primary }]}>
                일정 {events.length}개 추가
              </Text>
            </View>
          </View>

          {/* 인식 텍스트 */}
          {!!transcript && (
            <Text style={[styles.rawText, { color: colors.textMuted }]}>"{transcript}"</Text>
          )}

          {/* 일정 목록 */}
          <View style={styles.list}>
            {events.map((ev, idx) => {
              const dt      = ev.startDateTime;
              const dateStr = dt ? formatDateTime(dt.date, dt.originalText) : null;
              return (
                <View key={idx} style={styles.eventRow}>
                  <Calendar size={14} color={colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.eventTitle, { color: colors.textPrimary }]}>
                      {ev.title ?? '새 일정'}
                    </Text>
                    {!!dateStr && (
                      <Text style={[styles.eventDate, { color: colors.textMuted }]}>
                        {dateStr}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
          </View>
         </Pressable>

          {/* 하단 상태 — N초 후 저장 / 듣는 중 / 확인 중 (단일 카드와 공용 컴포넌트) */}
          <View style={styles.footerWrap}>
            <ConfirmCardFooter status={status} countdown={countdown} micActive={micActive} />
          </View>

          {/* 버튼 */}
          <View style={styles.buttons}>
            <Pressable
              style={[styles.btn, styles.cancelBtn, { borderColor: colors.border }]}
              onPress={() => resolve('cancel')}
            >
              <Text style={[styles.btnText, { color: colors.textMuted }]}>취소</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.confirmBtn, { backgroundColor: colors.primary }]}
              onPress={() => resolve('confirm')}
            >
              <Text style={[styles.btnText, { color: '#fff' }]}>전체 저장</Text>
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
      marginBottom: Spacing.md,
    },
    badge: {
      backgroundColor: c.primary + '1A',
      paddingHorizontal: Spacing.md,
      paddingVertical: Spacing.xs,
      borderRadius: 20,
    },
    badgeText: {
      fontSize: 12,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
    },
    rawText: {
      fontSize: 14,
      fontStyle: 'italic',
      marginBottom: Spacing.base,
    },
    list: {
      gap: Spacing.md,
      marginBottom: Spacing.base,
    },
    footerWrap: {
      marginBottom: Spacing.sm,
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    eventTitle: {
      fontSize: 16,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
    },
    eventDate: {
      fontSize: 13,
      marginTop: 2,
    },
    buttons: {
      flexDirection: 'row',
      gap: 10,
    },
    btn: {
      flex: 1,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelBtn: {
      borderWidth: 1,
    },
    confirmBtn: {},
    btnText: {
      fontSize: 15,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
    },
  });
}
