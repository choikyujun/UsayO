import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { AppTheme, useColors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { formatClockKo } from '../utils/timeHelpers';

// 텍스트로 일정 추가 — 음성을 쓸 수 없는 상황(회의 중 등)의 보조 입력.
//
// 설계 원칙:
//  · AI 분석을 거치지 않는다. 날짜·시간·제목·장소를 개별 필드로 받아 그대로 저장한다.
//  · 확인 카드 없이 바로 저장한다(사용자가 직접 입력한 값이라 되물을 이유가 없다).
//  · 쿼터를 차감하지 않는다 — STT/인텐트 API를 호출하지 않으므로 서버 쿼터(stt-proxy)와
//    무관하고, 클라이언트 quotaTracker.checkQuota도 호출하지 않는다(무료 무제한이 의도).
//
// 레이아웃 주의: 제목 autoFocus로 키보드가 즉시 올라온다. 날짜·시간을 EditTimeModal 같은
// 큰 스피너로 두면 키보드에 가리므로, 여기서는 **한 줄짜리 스테퍼**로 압축했다(약 120dp 절약).

const KO_DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const TIME_STEP_MIN = 30;   // 화살표 1탭 = 30분
const MIN_LEAD_MIN = 10;    // 기본 시각이 이보다 가까우면 다음 정시로 미룬다(아래 참조)

function formatDateLabel(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${KO_DAYS[d.getDay()]})`;
}

// 기본 시각 = 다음 정시. 단 남은 시간이 MIN_LEAD_MIN 미만이면 그다음 정시.
//   이유: 알림 기본값이 60분·10분 전이라, 5분 뒤 일정을 만들면 두 알림이 모두 이미 지나
//   **알림이 하나도 가지 않는다.** 급히 등록하는 상황에서 조용히 알림이 빠지는 것을 막는다.
export function nextHourDefault(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  if (d.getTime() - now.getTime() < MIN_LEAD_MIN * 60_000) d.setHours(d.getHours() + 1);
  return d;
}

export interface AddEventValues {
  startAt: Date;
  title: string;
  location: string;
}

interface Props {
  visible: boolean;
  /** 기본 날짜(YYYY-MM-DD). 미지정 시 오늘. 일/주/월 뷰에서 보고 있는 날짜를 넘기는 용도. */
  defaultDate?: string;
  onDismiss: () => void;
  /** 저장. 실패 시 throw하면 모달이 열린 채 입력값을 유지하고 오류를 표시한다. */
  onSave: (values: AddEventValues) => Promise<void>;
}

export default function AddEventModal({ visible, defaultDate, onDismiss, onSave }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const slideY = useRef(new Animated.Value(400)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const [start, setStart] = useState<Date>(() => nextHourDefault());
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  // 열릴 때마다 초기화. defaultDate가 있으면 그 날짜 + 기본 시각(다음 정시).
  useEffect(() => {
    if (!visible) return;
    const base = nextHourDefault();
    if (defaultDate) {
      const [y, m, d] = defaultDate.split('-').map(Number);
      if (y && m && d) base.setFullYear(y, m - 1, d);
    }
    setStart(base);
    setTitle('');
    setLocation('');
    setError(null);
    setSaving(false);
    setShowDatePicker(false);
    setShowTimePicker(false);
  }, [visible, defaultDate]);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true }),
      visible
        ? Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 55, friction: 9 })
        : Animated.timing(slideY, { toValue: 400, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [visible]);

  function shiftDays(delta: number) {
    setStart(prev => {
      const d = new Date(prev);
      d.setDate(d.getDate() + delta);
      return d;
    });
  }

  function shiftMinutes(delta: number) {
    setStart(prev => new Date(prev.getTime() + delta * 60_000));
  }

  function onDateChange(_: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (!selected) return;
    setStart(prev => {
      const d = new Date(prev);
      d.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
      return d;
    });
  }

  function onTimeChange(_: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowTimePicker(false);
    if (!selected) return;
    setStart(prev => {
      const d = new Date(prev);
      d.setHours(selected.getHours(), selected.getMinutes(), 0, 0);
      return d;
    });
  }

  const canSave = title.trim().length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ startAt: start, title: title.trim(), location: location.trim() });
      onDismiss(); // 성공 시에만 닫는다
    } catch (e) {
      // 실패 시 모달을 닫지 않는다 — 입력값을 그대로 두고 재시도할 수 있게.
      console.log('[AddEvent] 저장 실패:', (e as Error)?.message);
      setError('저장하지 못했어요. 연결을 확인하고 다시 시도해주세요.');
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={saving ? undefined : onDismiss} />
      </Animated.View>

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>일정 추가</Text>

          {/* ── 날짜 ── */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>날짜</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => shiftDays(-1)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="하루 전으로"
              >
                <ChevronLeft size={20} color={colors.textMuted} strokeWidth={1.5} />
              </Pressable>
              <Pressable
                onPress={() => setShowDatePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`날짜 선택, 현재 ${formatDateLabel(start)}`}
              >
                <Text style={styles.stepperValue}>{formatDateLabel(start)}</Text>
              </Pressable>
              <Pressable
                onPress={() => shiftDays(1)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="하루 뒤로"
              >
                <ChevronRight size={20} color={colors.textMuted} strokeWidth={1.5} />
              </Pressable>
            </View>
          </View>

          {/* ── 시간 ── */}
          <View style={styles.fieldRow}>
            <Text style={styles.fieldLabel}>시간</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => shiftMinutes(-TIME_STEP_MIN)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`${TIME_STEP_MIN}분 앞당기기`}
              >
                <ChevronLeft size={20} color={colors.textMuted} strokeWidth={1.5} />
              </Pressable>
              <Pressable
                onPress={() => setShowTimePicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`시간 선택, 현재 ${formatClockKo(start)}`}
              >
                <Text style={styles.stepperValue}>{formatClockKo(start)}</Text>
              </Pressable>
              <Pressable
                onPress={() => shiftMinutes(TIME_STEP_MIN)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`${TIME_STEP_MIN}분 미루기`}
              >
                <ChevronRight size={20} color={colors.textMuted} strokeWidth={1.5} />
              </Pressable>
            </View>
          </View>

          {/* ── 제목(필수) ── */}
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="일정 제목"
            placeholderTextColor={colors.textMuted}
            autoFocus
            returnKeyType="next"
            maxLength={100}
            accessibilityLabel="일정 제목"
          />

          {/* ── 장소(선택) ── */}
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="장소 (선택)"
            placeholderTextColor={colors.textMuted}
            returnKeyType="done"
            maxLength={100}
            onSubmitEditing={handleSave}
            accessibilityLabel="장소, 선택 입력"
          />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.btnRow}>
            <Pressable style={styles.cancelBtn} onPress={onDismiss} disabled={saving}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable
              style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
              onPress={handleSave}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityLabel="저장"
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.saveText}>저장</Text>}
            </Pressable>
          </View>

          {/* 시스템 피커 — Android는 다이얼로그, iOS는 인라인 스피너 + 완료 버튼 */}
          {showDatePicker && (
            <>
              <DateTimePicker
                value={start}
                mode="date"
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={onDateChange}
                locale="ko-KR"
              />
              {Platform.OS === 'ios' && (
                <Pressable style={styles.pickerDone} onPress={() => setShowDatePicker(false)}>
                  <Text style={styles.pickerDoneText}>완료</Text>
                </Pressable>
              )}
            </>
          )}
          {showTimePicker && (
            <>
              <DateTimePicker
                value={start}
                mode="time"
                display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
                onChange={onTimeChange}
                locale="ko-KR"
                minuteInterval={5}
              />
              {Platform.OS === 'ios' && (
                <Pressable style={styles.pickerDone} onPress={() => setShowTimePicker(false)}>
                  <Text style={styles.pickerDoneText}>완료</Text>
                </Pressable>
              )}
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    kav: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      paddingBottom: 32,
    },
    handle: {
      width: 36,
      height: 4,
      backgroundColor: c.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: Spacing.base,
    },
    title: {
      fontSize: 18,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: c.textPrimary,
      marginBottom: Spacing.base,
    },
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: Spacing.sm,
    },
    fieldLabel: {
      width: 44,
      fontSize: 14,
      color: c.textMuted,
    },
    stepper: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.card2,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: Spacing.md,
      paddingVertical: 10,
    },
    stepperValue: {
      fontSize: 16,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: c.textPrimary,
    },
    input: {
      backgroundColor: c.card2,
      borderWidth: 1,
      borderColor: c.border,
      borderRadius: 12,
      paddingHorizontal: Spacing.md,
      paddingVertical: 12,
      fontSize: 16,
      color: c.textPrimary,
      marginTop: Spacing.sm,
    },
    error: {
      marginTop: Spacing.sm,
      fontSize: 13,
      color: c.error,
    },
    btnRow: {
      flexDirection: 'row',
      gap: Spacing.sm,
      marginTop: Spacing.base,
    },
    cancelBtn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: c.border,
    },
    cancelText: {
      fontSize: 15,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: c.textMuted,
    },
    saveBtn: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: c.primary,
    },
    saveBtnDisabled: {
      opacity: 0.4,
    },
    saveText: {
      fontSize: 15,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: '#fff',
    },
    pickerDone: {
      alignSelf: 'flex-end',
      paddingHorizontal: Spacing.lg,
      paddingVertical: Spacing.sm,
      borderRadius: 10,
      backgroundColor: c.primary,
      marginTop: Spacing.sm,
    },
    pickerDoneText: {
      color: '#fff',
      fontSize: 14,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
    },
  });
}
