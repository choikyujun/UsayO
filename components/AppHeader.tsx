import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../constants/colors';
import { useCurrentDate } from '../hooks/useCurrentDate';
import VoiceHintRotator from './VoiceHintRotator';

export type AppTab = 'home' | 'day' | 'week' | 'month' | 'year';

const TABS: { key: AppTab; label: string }[] = [
  { key: 'home',  label: '홈'  },
  { key: 'day',   label: '일'  },
  { key: 'week',  label: '주간' },
  { key: 'month', label: '월간' },
  { key: 'year',  label: '년간' },
];

const KO_DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function formatDate(d: Date): string {
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${KO_DAYS[d.getDay()]}`;
}

function formatTime(d: Date): string {
  return `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Props {
  currentTab: AppTab;
}

export default function AppHeader({ currentTab }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { today } = useCurrentDate(); // midnight-aware date (triggers at 00:00)

  const [timeStr, setTimeStr] = useState(() => formatTime(new Date()));
  useEffect(() => {
    const id = setInterval(() => setTimeStr(formatTime(new Date())), 60_000);
    return () => clearInterval(id);
  }, []);

  function handleTab(tab: AppTab) {
    if (tab === currentTab) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (tab === 'home') {
      router.dismissAll();
      return;
    }
    if (tab === 'day') {
      router.push('/day');
      return;
    }
    if (tab === 'week') {
      router.push('/week');
      return;
    }
    if (tab === 'month') {
      router.push('/month');
      return;
    }
    if (tab === 'year') {
      router.push('/year');
      return;
    }
  }

  return (
    <View style={[
      styles.container,
      { paddingTop: insets.top + 8, borderBottomColor: colors.border, backgroundColor: colors.bg },
    ]}>
      {/* ── 5탭 ──────────────────────────────────────────────── */}
      <View style={styles.tabRow}>
        {TABS.map(tab => {
          const active = tab.key === currentTab;
          return (
            <Pressable
              key={tab.key}
              style={[styles.tab, active && { backgroundColor: colors.primary }]}
              onPress={() => handleTab(tab.key)}
              hitSlop={4}
            >
              <Text style={[
                styles.tabLabel,
                { color: active ? '#fff' : colors.textSecondary },
                active && styles.tabLabelActive,
              ]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── 날짜 · 시간 ──────────────────────────────────────── */}
      <View style={styles.dateRow}>
        <Text style={[styles.dateText, { color: colors.textPrimary }]}>
          {formatDate(today)}
        </Text>
        <Text style={[styles.sep, { color: colors.textSecondary }]}>  ·  </Text>
        <Text style={[styles.timeText, { color: colors.textSecondary }]}>
          {timeStr}
        </Text>
      </View>

      {/* ── 힌트 ─────────────────────────────────────────────── */}
      <VoiceHintRotator />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 0.5,
  },
  tabRow: {
    flexDirection: 'row',
    paddingLeft:   24,
    gap:           12,
    height:        40,
    alignItems:    'center',
  },
  tab: {
    height:            32,
    paddingHorizontal: 14,
    borderRadius:      16,
    alignItems:        'center',
    justifyContent:    'center',
  },
  tabLabel: {
    fontSize:   13,
    fontWeight: '400',
  },
  tabLabelActive: {
    fontWeight: '500',
  },
  dateRow: {
    flexDirection:  'row',
    paddingLeft:    24,
    paddingBottom:  4,
    height:         36,
    alignItems:     'center',
  },
  dateText: {
    fontSize:   20,
    fontWeight: '600',
  },
  sep: {
    fontSize:   20,
    fontWeight: '400',
  },
  timeText: {
    fontSize:   20,
    fontWeight: '400',
  },
});
