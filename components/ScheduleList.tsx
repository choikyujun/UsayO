import { Mic, RefreshCw } from 'lucide-react-native';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { Database } from '../types/database';

type Schedule = Database['public']['Tables']['schedules']['Row'];

type Props = {
  schedules: Schedule[];
  loading: boolean;
};

export default function ScheduleList({ schedules, loading }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  if (loading) {
    return (
      <View style={staticStyles.empty}>
        <Text style={styles.emptyText}>불러오는 중...</Text>
      </View>
    );
  }

  if (schedules.length === 0) {
    return (
      <View style={staticStyles.empty}>
        <Mic size={48} color={colors.accent} />
        <Text style={styles.emptyTitle}>오늘 일정이 없어요</Text>
        <Text style={styles.emptyText}>버튼을 눌러 음성으로 일정을 추가해보세요</Text>
      </View>
    );
  }

  return (
    <ScrollView style={staticStyles.list} showsVerticalScrollIndicator={false}>
      {schedules.map((item) => (
        <ScheduleItem key={item.id} schedule={item} />
      ))}
    </ScrollView>
  );
}

function ScheduleItem({ schedule }: { schedule: Schedule }) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const start = new Date(schedule.start_at);
  const hour = start.getHours();
  const min = start.getMinutes();
  const ampm = hour < 12 ? '오전' : '오후';
  const h12 = hour % 12 || 12;
  const timeStr = `${ampm} ${h12}:${String(min).padStart(2, '0')}`;

  return (
    <View style={styles.item}>
      <View style={styles.timeBlock}>
        <Text style={styles.timeText}>{timeStr}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.content}>
        <Text style={styles.title}>{schedule.title}</Text>
        {schedule.is_recurring && (
          <View style={styles.badge}>
            <RefreshCw size={11} color={colors.textMuted} />
            <Text style={styles.badgeText}>반복</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const staticStyles = StyleSheet.create({
  list:  { flex: 1, paddingHorizontal: 20 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60, gap: 8 },
});

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    emptyTitle: {
      marginTop: 8,
      fontSize: 17,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: c.textPrimary,
    },
    emptyText: { fontSize: 14, color: c.textMuted, textAlign: 'center' },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 14,
      padding: 16,
      marginBottom: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.07,
      shadowRadius: 6,
      elevation: 3,
    },
    timeBlock: { width: 72 },
    timeText: {
      fontSize: 13,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: c.primary,
    },
    divider: {
      width: 2,
      height: 32,
      backgroundColor: c.accent,
      borderRadius: 1,
      marginHorizontal: 14,
    },
    content: { flex: 1, gap: 4 },
    title: {
      fontSize: 15,
      fontFamily: 'Pretendard-SemiBold',
      fontWeight: '600',
      color: c.textPrimary,
    },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    badgeText: { fontSize: 12, color: c.textMuted },
  });
}
