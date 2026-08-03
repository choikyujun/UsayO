import { Calendar } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { speechService } from '../services/voice/SpeechRecognitionService';
import { ttsService } from '../services/voice/TTSService';
import { ClassifiedIntent } from '../types';
import { evaluateConfirmSTT } from '../utils/voiceResponseMatcher';
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
  const startRecordRef = useRef<() => Promise<boolean>>(() => Promise.resolve(false));
  const reAskCountRef  = useRef(0);
  const MAX_REASK = 2;                   // 재질문 최대 2회, 이후 버튼 대기로 정지
  // 마이크 시작 실패 시 안내(저장/취소 버튼은 항상 노출 → 갇힘 없음).
  const [micUnavailable, setMicUnavailable] = useState(false);

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
        const stt = await speechService.transcribe(uri, 'ko', { mode: 'confirm' });
        const { action, reason } = evaluateConfirmSTT(stt); // 환각 방어(길이/신호/무음/신뢰) 후 키워드 판정
        if (!isActiveRef.current) return;
        if (action === 'confirm') { onConfirm(); return; }
        if (action === 'cancel')  { onCancel();  return; }
        console.log('[MultiConfirm] 거부/미인식 →', JSON.stringify(stt.transcript), '| reason=', reason, '| conf=', stt.confidence);
      }
      // unknown(환각/미인식/무음) → 재질문
      await reAskOrStop();
    } catch {
      await reAskOrStop();
    }
  }, [onConfirm, onCancel, reAskOrStop]);

  // 확인 응답은 짧고 반응 지연이 있어 무음 임계를 약간 넉넉히(일반 발화 파라미터는 불변).
  const recorder = useVoiceRecorder({ onAutoStop: handleAutoStop, silenceMs: 2000 });
  // startRecording을 감싸 실패(false) 시 음성 루프를 멈추고 버튼 대기로 복귀 + 안내.
  const tryStart = useCallback(async (): Promise<boolean> => {
    const ok = await recorder.startRecording();
    if (!ok) {
      isActiveRef.current = false;
      setMicUnavailable(true);
      await ttsService
        .speak('마이크를 사용할 수 없어요. 화면의 저장 또는 취소 버튼을 눌러주세요.', undefined, undefined, true)
        .catch(() => {});
    }
    return ok;
  }, [recorder]);
  startRecordRef.current = tryStart;

  useEffect(() => {
    isActiveRef.current = true;
    let opened = false;
    const openMic = () => {
      if (opened || !isActiveRef.current) return;
      opened = true;
      console.log('[Mic] open', Date.now(), '(awaitSpeechSettled resolved)'); // [진단] 마이크 오픈 시각
      startRecordRef.current().catch(() => {}); // tryStart 경유 → 실패 시 버튼 대기 복귀
    };
    const _mountAt = Date.now();
    console.log('[Mic] card mounted, awaitSpeechSettled 등록', _mountAt); // [진단]
    // 확인 질문(useVoiceFlow가 발화)이 "시작→완전 종료"된 뒤에만 마이크를 연다.
    // 아무 발화나 첫 settle이 아니라 그 확인 발화에 바인딩 → 질문 재생 중 조기 오픈 방지.
    // 발화가 끝내 시작 안 하면 폴백 오픈(교착 방지, 버튼 항상 사용 가능).
    ttsService.waitForNextSpeechToFinish(1500, 8000).then(openMic);
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

          {micUnavailable && (
            <Text style={[styles.micNotice, { color: colors.textMuted }]}>
              마이크를 사용할 수 없어요. 버튼을 눌러주세요.
            </Text>
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
    micNotice: {
      fontSize: 12,
      textAlign: 'center',
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
