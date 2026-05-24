import { router } from 'expo-router';
import { CheckCircle, Square, XCircle } from 'lucide-react-native';
import { useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ConfirmCard from '../../components/ConfirmCard';
import { Colors } from '../../constants/colors';
import { useVoiceFlow } from '../../hooks/useVoiceFlow';
import { useSchedules } from '../../hooks/useSchedules';
import { ttsService } from '../../services/voice/TTSService';

const TODAY = new Date().toISOString().split('T')[0];

export default function VoiceModal() {
  const insets = useSafeAreaInsets();
  const voice = useVoiceFlow();
  const { applyClassifiedIntent, reload } = useSchedules(TODAY);

  // Pulse animation for listening state
  const pulseScale = useRef(new Animated.Value(1)).current;
  const pulseOpacity = useRef(new Animated.Value(0.4)).current;
  const pulseAnim = useRef<Animated.CompositeAnimation | null>(null);

  // Audio level bar animation
  const levelWidth = useRef(new Animated.Value(0)).current;

  // prevMicStatus: stopRecording()은 recording→processing→idle 순서로 전환되므로
  // prev==='recording'||prev==='processing' 모두 체크해야 자동 무음 종료가 감지됨.
  // phase='listening' 가드로 startVoice() 직후 경쟁 조건(idle+listening) 방지.
  const prevMicStatus = useRef(voice.micStatus);

  useEffect(() => {
    if (voice.phase === 'listening') {
      pulseAnim.current = Animated.loop(
        Animated.sequence([
          Animated.parallel([
            Animated.timing(pulseScale, { toValue: 1.6, duration: 800, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0, duration: 800, useNativeDriver: true }),
          ]),
          Animated.parallel([
            Animated.timing(pulseScale, { toValue: 1, duration: 0, useNativeDriver: true }),
            Animated.timing(pulseOpacity, { toValue: 0.4, duration: 0, useNativeDriver: true }),
          ]),
        ]),
      );
      pulseAnim.current.start();
    } else {
      pulseAnim.current?.stop();
      pulseScale.setValue(1);
      pulseOpacity.setValue(0.4);
    }
    return () => { pulseAnim.current?.stop(); };
  }, [voice.phase]);

  useEffect(() => {
    Animated.timing(levelWidth, {
      toValue: voice.audioLevel,
      duration: 80,
      useNativeDriver: false,
    }).start();
  }, [voice.audioLevel]);

  // Auto-stop: stopRecording()이 recording→processing→idle을 거치므로
  // prev가 'recording' 또는 'processing'이고 idle로 전환된 경우 모두 감지.
  useEffect(() => {
    const prev = prevMicStatus.current;
    prevMicStatus.current = voice.micStatus;

    if (
      (prev === 'recording' || prev === 'processing') &&
      voice.micStatus === 'idle' &&
      voice.phase === 'listening'
    ) {
      console.log('[Voice] stopRecording triggered: auto-stop (silence or max duration)');
      voice.stopAndProcess();
    }
  }, [voice.micStatus, voice.phase]);

  // Speak confirm message when entering confirming phase
  const prevPhase = useRef(voice.phase);
  useEffect(() => {
    if (prevPhase.current !== 'confirming' && voice.phase === 'confirming' && voice.confirmMessage) {
      ttsService.speak(voice.confirmMessage);
    }
    prevPhase.current = voice.phase;
  }, [voice.phase, voice.confirmMessage]);

  // 마운트 즉시 녹음 시작 (탭 한 번으로 바로 시작)
  useEffect(() => {
    voice.startVoice();
  }, []);

  // Auto-navigate back after success
  useEffect(() => {
    if (voice.phase === 'success') {
      const t = setTimeout(() => router.back(), 1500);
      return () => clearTimeout(t);
    }
  }, [voice.phase]);

  const handleConfirm = useCallback(async () => {
    await voice.confirmAction(async (intent) => {
      await applyClassifiedIntent(intent);
      await reload();
    });
  }, [voice, applyClassifiedIntent, reload]);

  const handleClose = useCallback(() => {
    voice.cancelVoice();
    router.back();
  }, [voice]);

  // listening 중 배경 탭 → 즉시 종료 + STT 처리 / 그 외엔 닫기
  const handleBackdropPress = useCallback(() => {
    if (voice.phase === 'listening') {
      console.log('[Voice] stopRecording triggered: backdrop tap');
      voice.stopAndProcess();
    } else {
      handleClose();
    }
  }, [voice.phase, voice.stopAndProcess, handleClose]);

  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdropPress} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>

        {/* ── LISTENING ── */}
        {voice.phase === 'listening' && (
          <PhaseListening
            pulseScale={pulseScale}
            pulseOpacity={pulseOpacity}
            levelWidth={levelWidth}
            silenceProgress={voice.silenceProgress}
            onStop={voice.stopAndProcess}
          />
        )}

        {/* ── PROCESSING ── */}
        {voice.phase === 'processing' && <PhaseProcessing />}

        {/* ── CONFIRMING ── */}
        {voice.phase === 'confirming' && voice.classifiedIntent && (
          <View style={styles.confirmWrap}>
            <ConfirmCard
              intent={voice.classifiedIntent}
              transcript={voice.transcript}
              onConfirm={handleConfirm}
              onRetry={() => { voice.retryVoice(); }}
            />
          </View>
        )}

        {/* ── SUCCESS ── */}
        {voice.phase === 'success' && <PhaseSuccess />}

        {/* ── FAIL ── */}
        {voice.phase === 'fail' && (
          <PhaseFail
            message={errorMessage(voice.error)}
            onRetry={voice.retryVoice}
            onClose={handleClose}
          />
        )}
      </View>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────

function PhaseListening({
  pulseScale,
  pulseOpacity,
  levelWidth,
  silenceProgress,
  onStop,
}: {
  pulseScale: Animated.Value;
  pulseOpacity: Animated.Value;
  levelWidth: Animated.Value;
  silenceProgress: number;
  onStop: () => void;
}) {
  const silenceOpacity = silenceProgress > 0 ? 1 : 0;
  const silenceSeconds = Math.ceil((1 - silenceProgress) * 3);

  return (
    <View style={styles.phaseCenter}>
      <Text style={styles.listeningLabel}>듣고 있어요...</Text>

      <View style={styles.micContainer}>
        <Animated.View
          style={[
            styles.pulse,
            { transform: [{ scale: pulseScale }], opacity: pulseOpacity },
          ]}
        />
        <View style={[styles.micBtn, styles.micBtnActive]}>
          <Text style={styles.micIcon}>🎙</Text>
        </View>
      </View>

      <View style={styles.levelTrack}>
        <Animated.View
          style={[
            styles.levelFill,
            {
              width: levelWidth.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>

      {silenceOpacity > 0 && (
        <Text style={styles.silenceHint}>{silenceSeconds}초 후 자동 종료...</Text>
      )}

      <Pressable style={styles.stopBtn} onPress={onStop}>
        <Square size={18} color={Colors.primary} fill={Colors.primary} />
        <Text style={styles.stopText}>완료</Text>
      </Pressable>
    </View>
  );
}

function PhaseProcessing() {
  return (
    <View style={styles.phaseCenter}>
      <ActivityIndicator size="large" color={Colors.primary} />
      <Text style={styles.processingText}>분석 중...</Text>
    </View>
  );
}

function PhaseSuccess() {
  return (
    <View style={styles.phaseCenter}>
      <CheckCircle size={56} color={Colors.success} />
      <Text style={styles.successText}>완료!</Text>
      <Text style={styles.successSub}>일정이 저장되었어요</Text>
    </View>
  );
}

function PhaseFail({
  message,
  onRetry,
  onClose,
}: {
  message: string;
  onRetry: () => void;
  onClose: () => void;
}) {
  return (
    <View style={styles.phaseCenter}>
      <XCircle size={48} color="#EF4444" />
      <Text style={styles.failText}>{message}</Text>
      <View style={styles.failActions}>
        <Pressable style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryText}>다시 시도</Text>
        </Pressable>
        <Pressable style={styles.closeBtn} onPress={onClose}>
          <Text style={styles.closeBtnText}>닫기</Text>
        </Pressable>
      </View>
    </View>
  );
}

function errorMessage(error: unknown): string {
  if (!error) return '처리에 실패했어요';
  if (typeof error === 'object' && 'message' in error) return (error as { message: string }).message;
  if (typeof error === 'object' && 'type' in error) {
    const e = error as { type: string };
    if (e.type === 'lowConfidence') return '음성을 정확히 인식하지 못했어요';
  }
  return '처리에 실패했어요';
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 20,
    minHeight: 320,
  },
  phaseCenter: {
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 32,
    gap: 16,
  },
  hint: {
    fontSize: 13,
    color: Colors.textMuted,
    fontWeight: '500',
  },
  example: {
    fontSize: 16,
    color: Colors.text,
    fontWeight: '600',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  micContainer: {
    width: 88,
    height: 88,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  pulse: {
    position: 'absolute',
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.primary,
  },
  micBtn: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.deep,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  micBtnActive: {
    backgroundColor: '#E53E3E',
  },
  micIcon: {
    fontSize: 32,
  },
  tapHint: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  closeTextBtn: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 24,
  },
  closeText: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  listeningLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.primary,
  },
  silenceHint: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  levelTrack: {
    width: '100%',
    height: 6,
    backgroundColor: Colors.background,
    borderRadius: 3,
    overflow: 'hidden',
  },
  levelFill: {
    height: '100%',
    backgroundColor: Colors.primary,
    borderRadius: 3,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 28,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    marginTop: 4,
  },
  stopText: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.primary,
  },
  processingText: {
    fontSize: 16,
    color: Colors.textMuted,
    marginTop: 12,
  },
  successText: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.success,
  },
  successSub: {
    fontSize: 15,
    color: Colors.textMuted,
  },
  failText: {
    fontSize: 15,
    color: '#EF4444',
    textAlign: 'center',
    fontWeight: '600',
  },
  failActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  retryBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  retryText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  closeBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: Colors.accent,
    alignItems: 'center',
  },
  closeBtnText: {
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 15,
  },
  confirmWrap: {
    paddingVertical: 8,
  },
});
