import { Calendar, FileText, MapPin, RefreshCw, Users } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { speechService } from '../services/voice/SpeechRecognitionService';
import { ttsService } from '../services/voice/TTSService';
import { evaluateConfirmSTT } from '../utils/voiceResponseMatcher';
import { ClassifiedIntent } from '../types';
import { Spacing } from '../constants/spacing';

const AUTO_CONFIRM_MS    = 5000;
const RECORD_MAX_MS      = 3500;
const MAX_REASK          = 2;    // 발화 미인식 시 재질문 최대 횟수

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

// ── 소형 파형 아이콘 ──────────────────────────────────────────
function MiniWaveform({ active, color }: { active: boolean; color: string }) {
  const bars = [useRef(new Animated.Value(0.3)).current,
                useRef(new Animated.Value(0.6)).current,
                useRef(new Animated.Value(0.4)).current,
                useRef(new Animated.Value(0.7)).current,
                useRef(new Animated.Value(0.3)).current];

  useEffect(() => {
    if (!active) {
      bars.forEach(b => Animated.timing(b, { toValue: 0.3, duration: 200, useNativeDriver: false }).start());
      return;
    }
    const anims = bars.map((b, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(b, {
            toValue: 0.4 + Math.random() * 0.6,
            duration: 200 + i * 60,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
          Animated.timing(b, {
            toValue: 0.2 + Math.random() * 0.3,
            duration: 200 + i * 60,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: false,
          }),
        ]),
      ),
    );
    anims.forEach(a => a.start());
    return () => anims.forEach(a => a.stop());
  }, [active]);

  return (
    <View style={waveStyles.wrap}>
      {bars.map((b, i) => (
        <Animated.View
          key={i}
          style={[waveStyles.bar, { backgroundColor: color, height: b.interpolate({ inputRange: [0, 1], outputRange: [4, 20] }) }]}
        />
      ))}
    </View>
  );
}

const waveStyles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 3, height: 24 },
  bar:  { width: 3, borderRadius: 2 },
});

// ─────────────────────────────────────────────────────────────

export default function InlineConfirmCard({ intent, transcript, onConfirm, onCancel }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const dt = intent.startDateTime ?? intent.updateFields?.startDateTime;
  console.log('[ConfirmCard/Inline] props 받음:', { time: dt?.date ?? 'none', ambiguous: intent.ambiguous, suggestedMeridiem: intent.suggestedMeridiem ?? 'none' });
  console.log('[ConfirmCard/Inline] showAmpmToggle 결정:', false, '(InlineConfirmCard는 AM/PM 토글 없음 — ambiguous이면 ConfirmCard로 라우팅돼야 함)');
  console.log('[ConfirmCard/Inline] 렌더 시점:', new Date().toISOString());

  const [micActive, setMicActive] = useState(false);

  const confirmedRef   = useRef(false);
  const autoTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recordStopRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reAskCountRef  = useRef(0);
  const isActiveRef    = useRef(true);
  const recorder = useVoiceRecorder({ silenceMs: 2000 }); // 확인 응답용 무음 여유(일반 발화 불변)

  const slideY  = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // ── Guard: 한 번만 실행 ──────────────────────────────────────
  const resolve = useCallback((result: 'confirm' | 'cancel') => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    if (autoTimerRef.current)  clearTimeout(autoTimerRef.current);
    if (recordStopRef.current) clearTimeout(recordStopRef.current);
    recorder.cancelRecording();
    result === 'confirm' ? onConfirm() : onCancel();
  }, [onConfirm, onCancel, recorder]);

  // ── 슬라이드인 애니메이션 ────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  // ── 질문 TTS 완료 후 마이크 오픈 → 녹음 → 판정 ──────────────────
  // 핵심: "무응답(침묵)"과 "발화했으나 미인식"을 구분한다.
  //  · 침묵(발화 미감지) → 5초 자동확정 허용(사용자 침묵=동의). STT 생략 → 환각 원천 차단.
  //  · 발화 감지 + confirm/cancel → 즉시 처리.
  //  · 발화 감지 + unknown(환각/오인식) → 자동확정 금지, 재질문. 초과 시 버튼 대기.
  useEffect(() => {
    isActiveRef.current = true;

    const buttonWait = async () => {
      if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
      await ttsService.speak('잘 못 들었어요. 화면의 버튼을 눌러주세요.', undefined, undefined, true).catch(() => {});
    };

    const recordDone = async () => {
      if (confirmedRef.current || !isActiveRef.current) return;
      setMicActive(false);
      const uri = await recorder.stopRecording();
      if (confirmedRef.current || !isActiveRef.current) return;

      const spoke = recorder.hadSpeech(); // 녹음 중 유효 발화(-40dB↑) 감지 여부
      if (!spoke) {
        // 무응답(침묵). 첫 사이클이면 5초 자동확정 타이머가 처리(사용자 침묵=동의).
        // 재질문 이후의 무응답이면 자동확정 금지 → 버튼 대기.
        if (reAskCountRef.current === 0 && autoTimerRef.current) {
          console.log('[ConfirmCard/Inline] 무응답(침묵) — 5초 자동확정 대기');
        } else {
          console.log('[ConfirmCard/Inline] 재질문 후 무응답 — 버튼 대기');
          await buttonWait();
        }
        return;
      }

      // 발화 감지 → 자동확정 금지(사용자가 말했으므로 반드시 판정 결과를 따른다)
      if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }

      let action: 'confirm' | 'cancel' | 'unknown' = 'unknown';
      if (uri) {
        try {
          const stt = await speechService.transcribe(uri, 'ko', { mode: 'confirm' });
          action = evaluateConfirmSTT(stt).action; // 환각 방어(길이/신호/무음/신뢰) 후 키워드 판정
        } catch { action = 'unknown'; }
      }
      if (confirmedRef.current || !isActiveRef.current) return;

      if (action === 'confirm') { resolve('confirm'); return; }
      if (action === 'cancel')  { resolve('cancel');  return; }

      // 발화했으나 미인식 → 절대 자동확정하지 않고 재질문(초과 시 버튼 대기)
      if (reAskCountRef.current >= MAX_REASK) { await buttonWait(); return; }
      reAskCountRef.current += 1;
      console.log('[ConfirmCard/Inline] 발화 미인식 — 재질문', reAskCountRef.current);
      await ttsService.speak('저장할까요? 저장 또는 취소라고 말씀해주세요.', undefined, undefined, true).catch(() => {});
      if (!isActiveRef.current || confirmedRef.current) return;
      await recorder.startRecording();
      if (!isActiveRef.current || confirmedRef.current) { recorder.cancelRecording(); return; }
      setMicActive(true);
      recordStopRef.current = setTimeout(recordDone, RECORD_MAX_MS);
    };

    const run = async () => {
      // 확인 질문(useVoiceFlow가 발화)이 시작→종료될 때까지 대기(폴백 포함).
      await ttsService.waitForNextSpeechToFinish(1500, 8000);
      if (!isActiveRef.current || confirmedRef.current) return;

      await recorder.startRecording();
      if (!isActiveRef.current || confirmedRef.current) { recorder.cancelRecording(); return; }
      setMicActive(true);

      // 자동 저장 타이머: 마이크 오픈(=질문 재생 후) 기준 5초. 발화 감지 시 recordDone에서 취소됨.
      autoTimerRef.current = setTimeout(() => resolve('confirm'), AUTO_CONFIRM_MS);
      recordStopRef.current = setTimeout(recordDone, RECORD_MAX_MS);
    };

    run();
    return () => {
      isActiveRef.current = false;
      if (autoTimerRef.current)  clearTimeout(autoTimerRef.current);
      if (recordStopRef.current) clearTimeout(recordStopRef.current);
      recorder.cancelRecording();
    };
  }, []);

  const dateStr = dt ? formatDateTime(dt.date, dt.originalText) : null;
  const title   =
    intent.title ??
    intent.updateFields?.title ??
    intent.targetEventQuery ??
    intent.deleteTargetQuery;

  return (
    // 화면 어디든 탭 → 즉시 취소
    <Pressable style={StyleSheet.absoluteFill} onPress={() => resolve('cancel')}>
      <View style={styles.overlay} pointerEvents="box-none">
        <Animated.View
          style={[styles.card, { transform: [{ translateY: slideY }], opacity }]}
        >
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

          {/* 하단 상태 — 파형 아이콘 또는 힌트 */}
          <View style={styles.footer}>
            {micActive ? (
              <>
                <MiniWaveform active={micActive} color={colors.primary} />
                <Text style={styles.footerHint}>듣고 있어요</Text>
              </>
            ) : (
              <Text style={styles.footerHint}>탭하면 취소</Text>
            )}
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
    footer: {
      alignItems: 'center',
      gap: 6,
    },
    footerHint: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
    },
  });
}
