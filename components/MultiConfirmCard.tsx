import { Calendar } from 'lucide-react-native';
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { ClassifiedIntent } from '../types';

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

  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onCancel}>
      <View style={styles.overlay} pointerEvents="box-none">
        <Animated.View
          style={[styles.card, { transform: [{ translateY: slideY }], opacity }]}
        >
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

          {/* 버튼 */}
          <View style={styles.buttons}>
            <Pressable
              style={[styles.btn, styles.cancelBtn, { borderColor: colors.border }]}
              onPress={onCancel}
            >
              <Text style={[styles.btnText, { color: colors.textMuted }]}>취소</Text>
            </Pressable>
            <Pressable
              style={[styles.btn, styles.confirmBtn, { backgroundColor: colors.primary }]}
              onPress={onConfirm}
            >
              <Text style={[styles.btnText, { color: '#fff' }]}>전체 저장</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Pressable>
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
      padding: 24,
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
      marginBottom: 12,
    },
    badge: {
      backgroundColor: c.primary + '1A',
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 20,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '600',
    },
    rawText: {
      fontSize: 14,
      fontStyle: 'italic',
      marginBottom: 16,
    },
    list: {
      gap: 12,
      marginBottom: 24,
    },
    eventRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
    },
    eventTitle: {
      fontSize: 16,
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
      fontWeight: '600',
    },
  });
}
