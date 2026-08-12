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

const AUTO_SAVE_COUNTDOWN_S = 3;    // 확인 TTS 종료 후 자동 저장까지 카운트다운(초)
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
  const [countdown, setCountdown] = useState<number | null>(null); // 자동 저장까지 남은 초(null=미진행/일시정지)

  const confirmedRef   = useRef(false);
  const countdownRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const pausedRef      = useRef(false); // 카드 탭 시 자동 저장 일시정지(재시작 안 함)
  const recordStopRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reAskCountRef  = useRef(0);
  const isActiveRef    = useRef(true);
  // 확인 응답용 무음 여유(일반 발화 불변) + hadSpeech 견고화: 초기 300ms 트랜지언트 무시 +
  // 300ms 누적 발화가 있어야 hadSpeech=true → 마이크 오픈 직후 주변음/TTS잔향 오탐으로 카운트다운이
  // 잘못 보류되는 것을 방지.
  const recorder = useVoiceRecorder({ silenceMs: 2000, speechWarmupMs: 300, minSpeechMs: 300 });

  const clearCountdown = useCallback(() => {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
    setCountdown(null);
  }, []);

  const slideY  = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // ── Guard: 한 번만 실행 ──────────────────────────────────────
  const resolve = useCallback((result: 'confirm' | 'cancel') => {
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    clearCountdown();
    if (recordStopRef.current) clearTimeout(recordStopRef.current);
    recorder.cancelRecording();
    result === 'confirm' ? onConfirm() : onCancel();
  }, [onConfirm, onCancel, recorder, clearCountdown]);

  // 카드 탭 → 자동 저장 카운트다운 일시정지(취소/저장이 아님 — 사용자가 읽고 결정 중이라는 신호).
  // 이후엔 음성("저장"/"취소") 또는 버튼으로만 진행. 자동 재시작하지 않는다.
  const pauseCountdown = useCallback(() => {
    if (confirmedRef.current || countdownRef.current == null) return;
    pausedRef.current = true;
    clearCountdown();
    console.log('[Confirm] countdown paused(tap)');
  }, [clearCountdown]);

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
      clearCountdown();
      pausedRef.current = true; // 재질문 초과 → 자동 저장 중단, 버튼/음성 대기
      console.log('[Confirm] countdown paused(reask-exhausted)');
      await ttsService.speak('잘 못 들었어요. 화면의 버튼을 눌러주세요.', undefined, undefined, true).catch(() => {});
    };

    // 확인 TTS 종료 후 3초 카운트다운(3→2→1). 녹음과 '병렬'로 독립 진행 — 진행 중엔 hadSpeech로
    // 중단하지 않는다. 판정은 '만료 시점'에만: 발화가 있었으면(hadSpeech) 자동 저장을 보류하고
    // recordDone의 STT 판정을 따르고(취소일 수 있음), 발화가 없었으면 자동 저장한다.
    const startCountdown = () => {
      if (pausedRef.current || confirmedRef.current || !isActiveRef.current) return;
      let remaining = AUTO_SAVE_COUNTDOWN_S;
      setCountdown(remaining);
      console.log('[Confirm] countdown start');
      countdownRef.current = setInterval(() => {
        if (confirmedRef.current || !isActiveRef.current) { clearCountdown(); return; }
        remaining -= 1;
        if (remaining > 0) {
          setCountdown(remaining);
          console.log(`[Confirm] countdown tick ${remaining}`);
          return;
        }
        clearCountdown();
        if (recorder.hadSpeech()) {
          // 발화 감지 → 자동 저장 보류. recordDone(recordStopRef로 보장)이 STT로 판정 →
          // 저장/취소/재질문. 막다른 흐름 아님.
          console.log('[Confirm] countdown fired → defer(speech), STT 판정 대기');
        } else {
          console.log('[Confirm] countdown fired(save)');
          resolve('confirm');
        }
      }, 1000);
    };

    const recordDone = async () => {
      if (confirmedRef.current || !isActiveRef.current) return;
      setMicActive(false);
      const uri = await recorder.stopRecording();
      if (confirmedRef.current || !isActiveRef.current) return;

      const spoke = recorder.hadSpeech(); // 녹음 중 유효 발화(-40dB↑) 감지 여부
      if (!spoke) {
        // 무응답(침묵). 첫 사이클이면 자동 저장 카운트다운이 처리(사용자 침묵=동의).
        // 재질문 이후의 무응답이면 자동 저장 금지 → 버튼 대기.
        if (reAskCountRef.current === 0) {
          console.log('[ConfirmCard/Inline] 무응답(침묵) — 자동 저장 카운트다운이 처리');
        } else {
          console.log('[ConfirmCard/Inline] 재질문 후 무응답 — 버튼 대기');
          await buttonWait();
        }
        return;
      }

      // 발화 감지 → 자동 저장 금지(사용자가 말했으므로 반드시 판정 결과를 따른다)
      clearCountdown();
      console.log('[Confirm] countdown cleared(speech) → STT 판정');

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

      // 확인 TTS가 끝난 뒤(=여기)부터 3초 카운트다운 시작. 발화 감지/카드 탭 시 보류·정지.
      startCountdown();
      recordStopRef.current = setTimeout(recordDone, RECORD_MAX_MS);
    };

    run();
    return () => {
      isActiveRef.current = false;
      clearCountdown();
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

          {/* 하단 상태 — 카운트다운 / 파형 / 힌트 */}
          <View style={styles.footer}>
            {countdown != null ? (
              <>
                {micActive && <MiniWaveform active={micActive} color={colors.primary} />}
                <Text style={styles.countdownText}>{countdown}초 후 저장</Text>
              </>
            ) : pausedRef.current ? (
              <Text style={styles.footerHint}>저장 또는 취소를 선택하세요</Text>
            ) : micActive ? (
              <>
                <MiniWaveform active={micActive} color={colors.primary} />
                <Text style={styles.footerHint}>듣고 있어요</Text>
              </>
            ) : (
              <Text style={styles.footerHint}>저장 또는 취소</Text>
            )}
          </View>

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
    footer: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      minHeight: 24,
    },
    footerHint: {
      fontSize: 12,
      color: c.textMuted,
      textAlign: 'center',
    },
    countdownText: {
      fontSize: 13,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: c.primary,
      textAlign: 'center',
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
