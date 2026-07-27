import { Check, X } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  Animated, Modal, Pressable, ScrollView,
  StyleSheet, Text, View,
} from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { useVoiceRecorder } from '../hooks/useVoiceRecorder';
import { speechService } from '../services/voice/SpeechRecognitionService';
import { ttsService } from '../services/voice/TTSService';
import { Event } from '../types/database';
import {
  ALLDAY_NOTIF_OPTIONS,
  TIMED_NOTIF_OPTIONS,
  NotifOption,
  offsetToLabel,
} from '../utils/notificationHelpers';
import { formatTimeKo } from '../utils/timeHelpers';
import { matchNotificationOffset } from '../utils/voiceResponseMatcher';
import { Spacing } from '../constants/spacing';

interface Props {
  visible:  boolean;
  event:    Event | null;
  onClose:  () => void;
  onSaved:  (updatedEvent: Event) => void;
}

export default function EditNotificationModal({ visible, event, onClose, onSaved }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1,    duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 20 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 0,    duration: 150, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.95, duration: 150, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  // ── Voice STT: TTS → record → match → onSaved/close/restart ──
  // 모든 훅은 조건 없이 호출한다(Hooks 규칙). event는 ref로 안전 참조하고, early-return은 훅 뒤에서.
  const isVoiceActiveRef = useRef(false);
  const startVoiceRef    = useRef<() => Promise<void>>(() => Promise.resolve());
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const eventRef = useRef(event);
  eventRef.current = event;

  const handleVoiceAutoStop = useCallback(async (uri: string | null) => {
    if (!isVoiceActiveRef.current) return;
    try {
      if (uri) {
        const stt   = await speechService.transcribe(uri, 'ko', { mode: 'notif' }); // 쿼터 미차감
        const match = matchNotificationOffset(stt.transcript);
        if (!isVoiceActiveRef.current) return;
        if (match.type === 'offset') {
          const ev = eventRef.current;
          if (ev) {
            onSavedRef.current({ ...ev, notification_offset_minutes: match.offsetMinutes });
            onCloseRef.current();
          }
          return;
        }
        if (match.type === 'cancel') {
          onCloseRef.current();
          return;
        }
      }
      // unknown → restart
      if (isVoiceActiveRef.current) await startVoiceRef.current().catch(() => {});
    } catch {
      if (isVoiceActiveRef.current) await startVoiceRef.current().catch(() => {});
    }
  }, []);

  const voiceRecorder = useVoiceRecorder({ onAutoStop: handleVoiceAutoStop });
  startVoiceRef.current = voiceRecorder.startRecording;

  useEffect(() => {
    if (visible && event) {
      isVoiceActiveRef.current = true;
      (async () => {
        try {
          await ttsService.speak('어떻게 알려드릴까요?');
          await ttsService.waitForSpeech(5000);
          await new Promise<void>(r => setTimeout(r, 400));
          if (isVoiceActiveRef.current) await voiceRecorder.startRecording();
        } catch {
          if (isVoiceActiveRef.current) await voiceRecorder.startRecording().catch(() => {});
        }
      })();
    } else {
      isVoiceActiveRef.current = false;
      voiceRecorder.cancelRecording();
    }
    return () => {
      isVoiceActiveRef.current = false;
      voiceRecorder.cancelRecording();
    };
  }, [visible, event]);

  // ── 모든 훅 호출 이후에만 early-return (event null 안전) ──
  if (!event) return null;

  const isAllDay = event.is_all_day;
  const options: NotifOption[] = isAllDay ? ALLDAY_NOTIF_OPTIONS : TIMED_NOTIF_OPTIONS;
  const currentOffset = event.notification_offset_minutes ?? null;
  const startStr = isAllDay
    ? '종일'
    : formatTimeKo(new Date(event.start_at));

  function handleSelect(option: NotifOption) {
    const updated: Event = { ...event!, notification_offset_minutes: option.offsetMinutes };
    onSaved(updated);
    onClose();
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} pointerEvents="none" />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View style={[styles.modal, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>

          {/* 헤더 */}
          <View style={styles.header}>
            <Text style={[styles.heading, { color: colors.textPrimary }]}>알림 설정</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color={colors.textMuted} strokeWidth={1.5} />
            </Pressable>
          </View>

          {/* 일정 정보 */}
          <Text style={[styles.eventInfo, { color: colors.textSecondary }]} numberOfLines={1}>
            {startStr}  {event.title}
          </Text>

          {/* 옵션 리스트 — 각 옵션 = [라벨(좌, flex) … 체크(우)] 한 행 고정 */}
          <ScrollView
            style={styles.listWrap}
            bounces={false}
            showsVerticalScrollIndicator
          >
            {options.map((opt, i) => {
              const selected = opt.offsetMinutes === currentOffset;
              return (
                <Pressable
                  key={String(opt.offsetMinutes) + i}
                  style={({ pressed }) => [
                    styles.optionRow,
                    i < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                    pressed && { backgroundColor: colors.card2 },
                  ]}
                  onPress={() => handleSelect(opt)}
                >
                  <Text
                    style={[
                      styles.optionLabel,
                      { color: selected ? colors.primary : colors.textPrimary },
                      selected && { fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
                    ]}
                    numberOfLines={1}
                  >
                    {opt.label}
                  </Text>
                  {selected && (
                    <Check size={18} color={colors.primary} strokeWidth={2} style={styles.optionCheck} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>

          {/* 취소 버튼 */}
          <Pressable style={[styles.cancelBtn, { backgroundColor: colors.card2 }]} onPress={onClose}>
            <Text style={[styles.cancelText, { color: colors.textSecondary }]}>취소</Text>
          </Pressable>

        </Animated.View>
      </View>
    </Modal>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    centerWrap: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'center',
      alignItems: 'center',
    },
    modal: {
      width: '85%',
      maxHeight: '75%',
      backgroundColor: c.card,
      borderRadius: 20,
      padding: Spacing.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 8,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    heading:    { fontSize: 18, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
    eventInfo:  { fontSize: 13, marginBottom: Spacing.sm },
    // 340 = 약 6.5행 → 마지막 행이 살짝 잘려 스크롤 가능함이 드러남
    listWrap:   { maxHeight: 340 },
    optionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: 52,             // 일정한 행 높이 + 충분한 터치 영역
      paddingVertical: 12,
      paddingHorizontal: 4,      // 좌우 동일 인셋(모달 패딩 위에)
    },
    optionLabel: { flex: 1, fontSize: 16 }, // 좌측 flex → 체크는 항상 같은 행 우측 끝
    optionCheck: { marginLeft: Spacing.sm },
    cancelBtn: {
      marginTop: Spacing.base,
      height: 48,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: { fontSize: 16, fontFamily: 'Pretendard-Medium', fontWeight: '500' },
  });
}
