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

  // ── Voice STT: TTS → record → match → handleSelect/close/restart ──
  const isVoiceActiveRef = useRef(false);
  const startVoiceRef    = useRef<() => Promise<void>>(() => Promise.resolve());
  const handleSelectRef  = useRef(handleSelect);
  handleSelectRef.current = handleSelect;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleVoiceAutoStop = useCallback(async (uri: string | null) => {
    if (!isVoiceActiveRef.current) return;
    try {
      if (uri) {
        const stt   = await speechService.transcribe(uri, 'ko');
        const match = matchNotificationOffset(stt.transcript);
        if (!isVoiceActiveRef.current) return;
        if (match.type === 'offset') {
          handleSelectRef.current({ label: '', offsetMinutes: match.offsetMinutes });
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
    if (visible) {
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
  }, [visible]);

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

          {/* 옵션 리스트 */}
          <ScrollView
            style={styles.listWrap}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            {options.map((opt, i) => {
              const selected = opt.offsetMinutes === currentOffset;
              return (
                <Pressable
                  key={String(opt.offsetMinutes) + i}
                  style={({ pressed }) => [
                    styles.optionRow,
                    i < options.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
                    { opacity: pressed ? 0.6 : 1 },
                  ]}
                  onPress={() => handleSelect(opt)}
                >
                  <Text style={[
                    styles.optionLabel,
                    { color: selected ? colors.primary : colors.textPrimary },
                    selected && { fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
                  ]}>
                    {opt.label}
                  </Text>
                  {selected && (
                    <Check size={18} color={colors.primary} strokeWidth={2.5} />
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
      padding: 24,
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
      marginBottom: 8,
    },
    heading:    { fontSize: 18, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
    eventInfo:  { fontSize: 14, marginBottom: 16 },
    listWrap:   { maxHeight: 360 },
    optionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 14,
    },
    optionLabel: { fontSize: 16 },
    cancelBtn: {
      marginTop: 16,
      height: 48,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cancelText: { fontSize: 16, fontFamily: 'Pretendard-Medium', fontWeight: '500' },
  });
}
