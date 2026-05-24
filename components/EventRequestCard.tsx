import { Calendar, Check, Clock, MapPin, X } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
import { Colors } from '../constants/colors';
import type { EventRequest } from '../types/team';

interface Props {
  request: EventRequest;
  requesterName?: string;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string) => Promise<void>;
}

export default function EventRequestCard({ request, requesterName, onApprove, onReject }: Props) {
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);

  async function handle(action: 'approve' | 'reject') {
    setBusy(action);
    try {
      if (action === 'approve') await onApprove(request.id);
      else await onReject(request.id);
    } finally {
      setBusy(null);
    }
  }

  const start = new Date(request.start_at);
  const dateStr = start.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const timeStr = start.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>일정 요청</Text>
        </View>
        <Text style={styles.requester}>
          {requesterName ?? '팀원'}님이 요청했어요
        </Text>
      </View>

      <Text style={styles.title}>{request.title}</Text>

      <View style={styles.meta}>
        <View style={styles.metaRow}>
          <Calendar size={14} color={Colors.accent} />
          <Text style={styles.metaText}>{dateStr}</Text>
        </View>
        <View style={styles.metaRow}>
          <Clock size={14} color={Colors.accent} />
          <Text style={styles.metaText}>{timeStr}</Text>
        </View>
        {request.location && (
          <View style={styles.metaRow}>
            <MapPin size={14} color={Colors.accent} />
            <Text style={styles.metaText}>{request.location}</Text>
          </View>
        )}
      </View>

      {request.note && (
        <Text style={styles.note}>{request.note}</Text>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, styles.rejectBtn]}
          onPress={() => handle('reject')}
          disabled={busy !== null}
        >
          {busy === 'reject'
            ? <ActivityIndicator size="small" color={Colors.textMuted} />
            : <><X size={16} color={Colors.textMuted} /><Text style={styles.rejectText}>거절</Text></>
          }
        </Pressable>
        <Pressable
          style={[styles.btn, styles.approveBtn]}
          onPress={() => handle('approve')}
          disabled={busy !== null}
        >
          {busy === 'approve'
            ? <ActivityIndicator size="small" color="#fff" />
            : <><Check size={16} color="#fff" /><Text style={styles.approveText}>수락</Text></>
          }
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.darkCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.primary + '40',
    marginHorizontal: 16,
    marginVertical: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  badge: {
    backgroundColor: Colors.primary + '20',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: Colors.primary + '50',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.accent,
  },
  requester: {
    fontSize: 12,
    color: Colors.textMuted,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.textPrimary,
    marginBottom: 10,
  },
  meta: {
    gap: 4,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  note: {
    fontSize: 13,
    color: Colors.textMuted,
    fontStyle: 'italic',
    marginBottom: 10,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  rejectBtn: {
    backgroundColor: Colors.darkBorder,
    borderWidth: 1,
    borderColor: Colors.darkBorder,
  },
  rejectText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  approveBtn: {
    backgroundColor: Colors.success,
  },
  approveText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
