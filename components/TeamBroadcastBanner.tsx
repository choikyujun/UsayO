import { Megaphone } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/colors';
import type { TeamEvent } from '../types/team';
import { Spacing } from '../constants/spacing';

interface Props {
  event: TeamEvent;
  onPress?: (event: TeamEvent) => void;
}

export default function TeamBroadcastBanner({ event, onPress }: Props) {
  const start = new Date(event.start_at);
  const dateStr = start.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' });
  const timeStr = start.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
  const isBroadcast = event.scope === 'broadcast';

  return (
    <Pressable
      style={[styles.banner, isBroadcast && styles.bannerBroadcast]}
      onPress={() => onPress?.(event)}
    >
      <View style={styles.iconWrap}>
        <Megaphone size={16} color={isBroadcast ? Colors.warning : Colors.accent} />
      </View>
      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={[styles.scopeLabel, isBroadcast && styles.scopeLabelBroadcast]}>
            {isBroadcast ? '전체 공지' : '선택 참여'}
          </Text>
          <Text style={styles.datetime}>{dateStr} {timeStr}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>{event.title}</Text>
        {event.location && (
          <Text style={styles.location} numberOfLines={1}>{event.location}</Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: Colors.darkCard,
    borderRadius: 12,
    padding: Spacing.md,
    marginHorizontal: Spacing.base,
    marginVertical: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.accent + '30',
    borderLeftWidth: 3,
    borderLeftColor: Colors.accent,
  },
  bannerBroadcast: {
    borderColor: Colors.warning + '30',
    borderLeftColor: Colors.warning,
    backgroundColor: Colors.warning + '08',
  },
  iconWrap: {
    marginTop: 2,
  },
  content: {
    flex: 1,
    gap: 3,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  scopeLabel: {
    fontSize: 10,
    fontFamily: 'Pretendard-Bold',
    fontWeight: '700',
    color: Colors.accent,
    letterSpacing: 0.3,
  },
  scopeLabelBroadcast: {
    color: Colors.warning,
  },
  datetime: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  title: {
    fontSize: 14,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  location: {
    fontSize: 12,
    color: Colors.textMuted,
  },
});
