import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import { Colors } from '../constants/colors';
import { HybridInputState } from '../types';

interface Props {
  visible: boolean;
  hybridState: HybridInputState;
  onConfirm: (editedText: string) => void;
  onRetryVoice: () => void;
  onDismiss: () => void;
}

const REASON_HEADER: Record<HybridInputState['fallbackReason'], { icon: string; title: string; subtitle: string }> = {
  noise: {
    icon: '🔇',
    title: '소음 환경 감지됨',
    subtitle: '텍스트로 직접 입력해주세요',
  },
  low_confidence: {
    icon: '🤔',
    title: '음성 인식이 불확실해요',
    subtitle: '아래 내용을 확인·수정 후 확인해주세요',
  },
  user_choice: {
    icon: '✏️',
    title: '텍스트 입력 모드',
    subtitle: '명령을 직접 입력해주세요',
  },
};

export default function HybridInputModal({ visible, hybridState, onConfirm, onRetryVoice, onDismiss }: Props) {
  const [text, setText] = useState(hybridState.prefillText);
  const slideY = useRef(new Animated.Value(300)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  // hybridState가 바뀔 때 (새 STT 결과 등) 텍스트 동기화
  useEffect(() => {
    setText(hybridState.prefillText);
  }, [hybridState.prefillText]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 55, friction: 9 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 300, duration: 200, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  const header = REASON_HEADER[hybridState.fallbackReason];

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.kvWrapper}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
          {/* 헤더 */}
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerIcon}>{header.icon}</Text>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>{header.title}</Text>
              <Text style={styles.headerSubtitle}>{header.subtitle}</Text>
            </View>
          </View>

          {/* 텍스트 입력 */}
          <View style={styles.inputWrapper}>
            <Text style={styles.inputLabel}>명령어</Text>
            <TextInput
              style={styles.input}
              value={text}
              onChangeText={setText}
              placeholder="예: 내일 오후 3시에 팀 회의 잡아줘"
              placeholderTextColor={Colors.textMuted}
              multiline
              autoFocus={hybridState.fallbackReason !== 'low_confidence'}
              returnKeyType="done"
            />
          </View>

          {/* 입력 힌트 */}
          <View style={styles.hintRow}>
            <Text style={styles.hint}>날짜·시간·제목을 자연어로 입력하세요</Text>
          </View>

          {/* 액션 버튼 */}
          <View style={styles.actions}>
            {hybridState.fallbackReason !== 'noise' && (
              <Pressable style={styles.retryBtn} onPress={onRetryVoice}>
                <Text style={styles.retryText}>다시 녹음</Text>
              </Pressable>
            )}
            <Pressable
              style={[styles.confirmBtn, !text.trim() && styles.confirmBtnDisabled]}
              onPress={() => text.trim() && onConfirm(text.trim())}
              disabled={!text.trim()}
            >
              <Text style={styles.confirmText}>확인</Text>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  kvWrapper: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.darkCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 36,
    paddingTop: 12,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.darkBorder,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 20,
  },
  headerIcon: {
    fontSize: 28,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  headerSubtitle: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  inputLabel: {
    color: Colors.accent,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  inputWrapper: {
    marginBottom: 12,
  },
  input: {
    backgroundColor: Colors.darkBg,
    borderWidth: 1,
    borderColor: Colors.darkBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.textPrimary,
    fontSize: 16,
    minHeight: 56,
    maxHeight: 120,
  },
  hintRow: {
    marginBottom: 20,
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 12,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  retryBtn: {
    flex: 1,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: 'center',
  },
  retryText: {
    color: Colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 2,
    paddingVertical: 15,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  confirmBtnDisabled: {
    backgroundColor: Colors.darkBorder,
  },
  confirmText: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
  },
});
