import { Calendar } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { speechService } from '../services/voice/SpeechRecognitionService';
import { ttsService } from '../services/voice/TTSService';
import { ClassifiedIntent } from '../types';
import { matchMultiConfirmResponse } from '../utils/voiceResponseMatcher';
import { Spacing } from '../constants/spacing';

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

  // ── Voice STT loop: TTS 질문 → record → confirm-mode STT → match → confirm/cancel/재질문 ──
  const isActiveRef    = useRef(true);
  const startRecordRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const reAskCountRef  = useRef(0);
  const MAX_REASK = 2;                   // 재질문 최대 2회, 이후 버튼 대기로 정지
  const CONFIRM_MIN_CONFIDENCE = 0.4;    // 저신뢰 매칭은 재질문(오저장 방지). 주 판정은 unknown

  // 미인식/저신뢰/무음 → 조용히 재녹음하지 않고 "재질문"(사용자가 미인식을 인지). 한도 초과 시 버튼 대기.
  const reAskOrStop = useCallback(async () => {
    if (!isActiveRef.current) return;
    if (reAskCountRef.current >= MAX_REASK) {
      console.log('[MultiConfirm] 재질문 한도 초과 — 버튼 대기로 정지');
      await ttsService
        .speak('잘 못 들었어요. 화면의 저장 또는 취소 버튼을 눌러주세요.', undefined, undefined, true)
        .catch(() => {});
      return; // 재녹음하지 않음 → 버튼 입력 대기(무한루프 없음)
    }
    reAskCountRef.current += 1;
    // 재질문 발화가 끝난 뒤(speak는 onDone에서 resolve) 다시 녹음
    await ttsService
      .speak('저장할까요? 저장 또는 취소라고 말씀해주세요.', undefined, undefined, true)
      .catch(() => {});
    if (!isActiveRef.current) return;
    await startRecordRef.current().catch(() => {});
  }, []);

  const handleAutoStop = useCallback(async (uri: string | null) => {
    if (!isActiveRef.current) return;
    try {
      if (uri) {
        const stt     = await speechService.transcribe(uri, 'ko', { mode: 'confirm' });
        const action  = matchMultiConfirmResponse(stt.transcript);
        const lowConf = stt.confidence > 0 && stt.confidence < CONFIRM_MIN_CONFIDENCE;
        if (!isActiveRef.current) return;
        if (action === 'confirm' && !lowConf) { onConfirm(); return; }
        if (action === 'cancel'  && !lowConf) { onCancel();  return; }
        console.log('[MultiConfirm] 미인식/저신뢰 →', JSON.stringify(stt.transcript), '| conf=', stt.confidence, '| action=', action);
      }
      // unknown / 저신뢰 / no-audio → 재질문
      await reAskOrStop();
    } catch {
      await reAskOrStop();
    }
  }, [onConfirm, onCancel, reAskOrStop]);

  const recorder = useVoiceRecorder({ onAutoStop: handleAutoStop });
  startRecordRef.current = recorder.startRecording;

  useEffect(() => {
    isActiveRef.current = true;
    let opened = false;
    const openMic = () => {
      if (opened || !isActiveRef.current) return;
      opened = true;
      recorder.startRecording().catch(() => {});
    };
    // 확인 질문(useVoiceFlow가 발화)이 실제로 끝나면(onDone/onStopped/onError) 마이크를 연다.
    // isSpeakingAsync 폴링(재생 전/후 구분 불가) 대신 재생 완료 신호를 사용.
    // 완료 신호가 끝내 안 오면 6s 폴백으로 오픈 → 교착 방지(버튼은 항상 사용 가능).
    ttsService.awaitSpeechSettled(6000).then(openMic);
    return () => {
      isActiveRef.current = false;
      recorder.cancelRecording();
    };
  }, []);

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
      marginBottom: Spacing.lg,
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
