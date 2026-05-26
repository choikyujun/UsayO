import { Calendar, Check, FileText, MapPin, Mic, RefreshCw, Users } from 'lucide-react-native';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Colors } from '../constants/colors';
import { ClassifiedIntent } from '../types';
import { formatKoreanTime } from '../utils/timeFormat';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { speechService } from '../services/voice/SpeechRecognitionService';
import { ttsService } from '../services/voice/TTSService';
import { matchAmbiguousResponse, AmbiguousResponse } from '../utils/voiceResponseMatcher';

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

const RECORD_MS = 2500; // 음성 응답 최대 녹음 시간

export default function ConfirmCard({ intent, transcript, onConfirm, onRetry, onAmPmChange }: Props) {
  const slideY = useRef(new Animated.Value(80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  console.log('[ConfirmCard/Full] props 받음:', { ambiguous: intent.ambiguous, suggestedMeridiem: intent.suggestedMeridiem ?? 'none' });
  console.log('[ConfirmCard/Full] showAmpmToggle 결정:', intent.ambiguous === true);
  console.log('[ConfirmCard/Full] 렌더 시점:', new Date().toISOString());

  const displayDateTime = intent.startDateTime ?? intent.updateFields?.startDateTime;

  // AM/PM 선택 상태
  const initialMeridiem = intent.suggestedMeridiem ?? 'AM';
  const [meridiem, setMeridiem] = useState<'AM' | 'PM'>(initialMeridiem);
  const [voiceActive, setVoiceActive] = useState(false);

  // 음성 응답용 refs
  const confirmedRef   = useRef(false);
  const recordStopRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceRecorder  = useVoiceRecorder();

  // resolveVoice는 매 렌더마다 최신 값을 캡처하도록 ref에 직접 할당
  const resolveVoiceRef = useRef<((a: AmbiguousResponse | 'cancel') => void) | null>(null);
  resolveVoiceRef.current = (action: AmbiguousResponse | 'cancel') => {
    console.log('[Ambig] 적용 액션:', action);
    if (confirmedRef.current) return;
    confirmedRef.current = true;
    if (recordStopRef.current) clearTimeout(recordStopRef.current);
    voiceRecorder.cancelRecording();
    setVoiceActive(false);

    if ((action === 'am' || action === 'pm') && displayDateTime) {
      const m: 'AM' | 'PM' = action === 'am' ? 'AM' : 'PM';
      const d = new Date(displayDateTime.date);
      const h = d.getHours() % 12;
      d.setHours(m === 'PM' ? h + 12 : h);
      const finalDate = d.toISOString();
      console.log('[Ambig] saveEvent 직전 final meridiem:', m, '| 원본 시간:', displayDateTime.date, '| 변환 시간:', finalDate);
      onAmPmChange?.({
        ...intent,
        ambiguous: false,
        startDateTime: { ...displayDateTime, date: finalDate },
      });
    }
    if (action === 'cancel') {
      onRetry();
    } else {
      onConfirm();
    }
  };

  // 슬라이드인 애니메이션
  useEffect(() => {
    Animated.parallel([
      Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 60 }),
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
    ]).start();
  }, []);

  // 음성 응답 흐름 (ambiguous일 때만)
  useEffect(() => {
    if (!intent.ambiguous) return;
    let active = true;

    const run = async () => {
      // TTS 완료 대기
      await ttsService.waitForSpeech();
      console.log('[Ambig] TTS 완료, STT 재개 시도');
      if (!active || confirmedRef.current) return;
      await new Promise<void>(r => setTimeout(r, 200));
      if (!active || confirmedRef.current) return;

      await voiceRecorder.startRecording();
      if (!active || confirmedRef.current) { voiceRecorder.cancelRecording(); return; }
      setVoiceActive(true);
      console.log('[Ambig] STT 시작됨, isListening: true, RECORD_MS:', RECORD_MS);

      recordStopRef.current = setTimeout(async () => {
        if (!active || confirmedRef.current) return;
        setVoiceActive(false);
        const uri = await voiceRecorder.stopRecording();

        if (!uri) {
          console.log('[Ambig] 무음(uri 없음) → 추정값 확정');
          resolveVoiceRef.current?.('confirm');
          return;
        }

        try {
          const stt    = await speechService.transcribe(uri, 'ko');
          console.log('[Ambig] STT transcript 받음:', JSON.stringify(stt.transcript), '| confidence:', stt.confidence);
          const action = matchAmbiguousResponse(stt.transcript);
          console.log('[Ambig] matchConfirmResponse 결과:', action);
          resolveVoiceRef.current?.(action === 'unknown' ? 'confirm' : action);
        } catch (e) {
          console.log('[Ambig] STT 실패 → 추정값 확정, 오류:', e instanceof Error ? e.message : String(e));
          resolveVoiceRef.current?.('confirm');
        }
      }, RECORD_MS);
    };

    run();
    return () => {
      active = false;
      if (recordStopRef.current) clearTimeout(recordStopRef.current);
      voiceRecorder.cancelRecording();
    };
  }, []);  // 마운트 시 1회

  // 버튼 탭 시 음성 응답 루프 중단
  const handleManualConfirm = useCallback(() => {
    confirmedRef.current = true;
    if (recordStopRef.current) clearTimeout(recordStopRef.current);
    voiceRecorder.cancelRecording();
    onConfirm();
  }, [onConfirm, voiceRecorder]);

  const handleManualRetry = useCallback(() => {
    confirmedRef.current = true;
    if (recordStopRef.current) clearTimeout(recordStopRef.current);
    voiceRecorder.cancelRecording();
    onRetry();
  }, [onRetry, voiceRecorder]);

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
                {voiceActive && (
                  <View style={styles.voiceIndicator}>
                    <Mic size={12} color={Colors.primary} />
                    <Text style={styles.voiceHint}>듣고 있어요</Text>
                  </View>
                )}
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
        <Pressable style={styles.retryBtn} onPress={handleManualRetry}>
          <Text style={styles.retryText}>다시</Text>
        </Pressable>
        <Pressable style={styles.confirmBtn} onPress={handleManualConfirm}>
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
  voiceIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  voiceHint: {
    fontSize: 12,
    color: Colors.primary,
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
