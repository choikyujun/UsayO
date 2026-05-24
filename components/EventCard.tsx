import { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { Colors, useColors } from '../constants/colors';
import { Event } from '../types/database';

const MONO = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });

const CATEGORY_COLORS: Record<string, string> = {
  work: Colors.primary,
  personal: Colors.success,
  important: Colors.warning,
};

interface Props {
  event: Event;
  isNext?: boolean;
}

export default function EventCard({ event, isNext }: Props) {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const now = new Date();
  const startTime = new Date(event.start_at);
  const endTime = event.end_at ? new Date(event.end_at) : null;
  const isDone = endTime ? endTime < now : startTime < now;

  const timeLabel =
    formatTime(startTime) + (endTime ? ` – ${formatTime(endTime)}` : '');
  const barColor = CATEGORY_COLORS[event.category ?? 'work'] ?? Colors.primary;

  return (
    <View style={[styles.card, isNext && styles.nextCard, isDone && styles.doneCard]}>
      <View style={[styles.colorBar, { backgroundColor: barColor }]} />
      <View style={styles.body}>
        <Text style={[styles.time, { fontFamily: MONO }]}>{timeLabel}</Text>
        <Text
          style={[styles.title, isDone && styles.doneTitle]}
          numberOfLines={1}
        >
          {event.title}
        </Text>
        {event.location ? (
          <Text style={styles.location} numberOfLines={1}>
            {event.location}
          </Text>
        ) : null}
      </View>
      {isNext && (
        <View style={styles.nextBadge}>
          <Text style={styles.nextBadgeText}>다음</Text>
        </View>
      )}
    </View>
  );
}

function formatTime(d: Date): string {
  const h = d.getHours();
  const m = d.getMinutes();
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h % 12 || 12;
  return m === 0
    ? `${ampm} ${h12}시`
    : `${ampm} ${h12}:${m.toString().padStart(2, '0')}`;
}

function makeStyles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    card: {
      flexDirection: 'row',
      backgroundColor: c.card,
      borderWidth: 0.5,
      borderColor: c.border,
      borderRadius: 10,
      overflow: 'hidden',
      marginBottom: 8,
    },
    nextCard: {
      borderColor: c.primary,
      borderWidth: 1,
    },
    doneCard: { opacity: 0.35 },
    colorBar: { width: 2.5 },
    body: {
      flex: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    time: {
      fontSize: 11,
      color: c.textTertiary,
      marginBottom: 3,
    },
    title: {
      fontSize: 15,
      fontWeight: '600',
      color: c.textPrimary,
    },
    doneTitle: {
      textDecorationLine: 'line-through',
      color: c.textMuted,
    },
    location: {
      fontSize: 12,
      color: c.textMuted,
      marginTop: 3,
    },
    nextBadge: {
      position: 'absolute',
      top: 8,
      right: 10,
      backgroundColor: c.primary + '30',
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
    },
    nextBadgeText: {
      fontSize: 10,
      color: c.accent,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
  });
}
