import { CalendarDays, Clock3, ChevronLeft, Share2 } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { Spacing } from '../constants/spacing';
import { Event } from '../types/database';
import { formatTimeKo } from '../utils/timeHelpers';
import { buildDayShare, buildOneEventShare } from '../utils/shareText';

interface Props {
  visible: boolean;
  events: Event[]; // 오늘 일정(정렬 무관 — 내부에서 정렬)
  date: Date;      // 오늘
  onClose: () => void;
}

// 기본 공유 시트(RN Share API)로 텍스트 공유. 카카오톡·문자·메일 등 어디로든.
// 취소/실패는 조용히 무시(오류 표시 안 함).
export default function ShareScheduleModal({ visible, events, date, onClose }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [step, setStep] = useState<'menu' | 'pick'>('menu');

  useEffect(() => { if (visible) setStep('menu'); }, [visible]);

  const sortedEvents = useMemo(
    () => [...events].sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime()),
    [events],
  );

  async function doShare(message: string) {
    onClose();
    try { await Share.share({ message }); } catch { /* 취소·실패 조용히 무시 */ }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          {step === 'menu' ? (
            <>
              <Text style={styles.title}>일정 공유</Text>
              <Pressable style={styles.row} onPress={() => doShare(buildDayShare(sortedEvents, date))}>
                <CalendarDays size={22} color={colors.primary} strokeWidth={1.8} />
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>오늘 하루 공유</Text>
                  <Text style={styles.rowSub}>오늘 일정 전체를 한 번에</Text>
                </View>
              </Pressable>
              <Pressable style={styles.row} onPress={() => setStep('pick')}>
                <Clock3 size={22} color={colors.primary} strokeWidth={1.8} />
                <View style={styles.rowText}>
                  <Text style={styles.rowLabel}>일정 하나 공유</Text>
                  <Text style={styles.rowSub}>오늘 일정 중 선택</Text>
                </View>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.pickHeader}>
                <Pressable onPress={() => setStep('menu')} hitSlop={10} style={styles.backBtn}>
                  <ChevronLeft size={22} color={colors.textMuted} strokeWidth={1.8} />
                </Pressable>
                <Text style={styles.title}>공유할 일정 선택</Text>
              </View>
              <ScrollView style={styles.pickList} keyboardShouldPersistTaps="handled">
                {sortedEvents.map(e => (
                  <Pressable key={e.id} style={styles.eventRow} onPress={() => doShare(buildOneEventShare(e))}>
                    <Text style={styles.eventTime}>{formatTimeKo(new Date(e.start_at))}</Text>
                    <Text style={styles.eventTitle} numberOfLines={1}>{e.title}</Text>
                    <Share2 size={16} color={colors.textMuted} strokeWidth={1.8} />
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingHorizontal: Spacing.lg,
      paddingTop: 10,
      paddingBottom: 32,
    },
    handle: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 14 },
    title: { fontSize: 17, fontFamily: 'Pretendard-Bold', fontWeight: '700', color: c.textPrimary, marginBottom: Spacing.md },
    row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 14 },
    rowText: { flex: 1 },
    rowLabel: { fontSize: 16, fontFamily: 'Pretendard-SemiBold', fontWeight: '600', color: c.textPrimary },
    rowSub: { fontSize: 13, color: c.textMuted, marginTop: 2 },
    pickHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.sm },
    backBtn: { padding: 2 },
    pickList: { maxHeight: 320 },
    eventRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: c.border },
    eventTime: { width: 82, fontSize: 14, fontFamily: 'Pretendard-SemiBold', fontWeight: '600', color: c.textSecondary },
    eventTitle: { flex: 1, fontSize: 15, color: c.textPrimary },
  });
}
