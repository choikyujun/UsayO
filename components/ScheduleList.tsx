import { Mic, RefreshCw } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/colors';
import { Database } from '../types/database';

type Schedule = Database['public']['Tables']['schedules']['Row'];

type Props = {
  schedules: Schedule[];
  loading: boolean;
};

export default function ScheduleList({ schedules, loading }: Props) {
  if (loading) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>불러오는 중...</Text>
      </View>
    );
  }

  if (schedules.length === 0) {
    return (
      <View style={styles.empty}>
        <Mic size={48} color={Colors.accent} />
        <Text style={styles.emptyTitle}>오늘 일정이 없어요</Text>
        <Text style={styles.emptyText}>버튼을 눌러 음성으로 일정을 추가해보세요</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
      {schedules.map((item) => (
        <ScheduleItem key={item.id} schedule={item} />
      ))}
    </ScrollView>
  );
}

function ScheduleItem({ schedule }: { schedule: Schedule }) {
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
            <RefreshCw size={11} color={Colors.textMuted} />
            <Text style={styles.badgeText}>반복</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
    paddingHorizontal: 20,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
    gap: 8,
  },
  emptyTitle: {
    marginTop: 8,
    fontSize: 17,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
    color: Colors.text,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    shadowColor: Colors.deep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  timeBlock: {
    width: 72,
  },
  timeText: {
    fontSize: 13,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
    color: Colors.primary,
  },
  divider: {
    width: 2,
    height: 32,
    backgroundColor: Colors.accent,
    borderRadius: 1,
    marginHorizontal: 14,
  },
  content: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
    color: Colors.text,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  badgeText: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
