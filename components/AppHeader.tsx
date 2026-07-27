import { haptic } from '../utils/haptics';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '../constants/colors';
import { useCurrentDate } from '../hooks/useCurrentDate';
import VoiceHintRotator from './VoiceHintRotator';
import { Spacing } from '../constants/spacing';

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
  // tabsOnly: 탭 행만 렌더(날짜·시각·힌트 생략). 홈은 이 정보를 대화형 메시지 아래로 강등해
  // 직접 렌더하므로 홈에서만 true. 다른 화면은 기본(false)으로 기존 레이아웃 유지.
  tabsOnly?: boolean;
}

export default function AppHeader({ currentTab, tabsOnly }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { today } = useCurrentDate(); // midnight-aware date (triggers at 00:00)

  const [timeStr, setTimeStr] = useState(() => formatTime(new Date()));
  useEffect(() => {
    if (tabsOnly) return; // 홈은 시각을 직접 렌더 → 여기 타이머 불필요
    const id = setInterval(() => setTimeStr(formatTime(new Date())), 60_000);
    return () => clearInterval(id);
  }, [tabsOnly]);

  function handleTab(tab: AppTab) {
    if (tab === currentTab) return;
    haptic.light();

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
              accessibilityRole="tab"
              accessibilityLabel={`${tab.label} 뷰`}
              accessibilityState={{ selected: active }}
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

      {/* ── 날짜 · 시간 + 힌트 (홈은 tabsOnly로 생략 → 메시지 아래로 강등해 직접 렌더) ── */}
      {!tabsOnly && (
        <>
          <View style={styles.dateRow}>
            <Text style={[styles.dateText, { color: colors.textPrimary }]}>
              {formatDate(today)}
            </Text>
            <Text style={[styles.sep, { color: colors.textSecondary }]}>  ·  </Text>
            <Text style={[styles.timeText, { color: colors.textSecondary }]}>
              {timeStr}
            </Text>
          </View>

          <VoiceHintRotator />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderBottomWidth: 0.5,
  },
  tabRow: {
    flexDirection: 'row',
    paddingLeft: Spacing.lg,
    gap: Spacing.md,
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
    fontFamily: 'Pretendard-Regular',
    fontWeight: '400',
  },
  tabLabelActive: {
    fontFamily: 'Pretendard-Medium',
    fontWeight: '500',
  },
  dateRow: {
    flexDirection:  'row',
    paddingLeft: Spacing.lg,
    paddingBottom: Spacing.xs,
    height:         36,
    alignItems:     'center',
  },
  dateText: {
    fontSize:   20,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
  },
  sep: {
    fontSize:   20,
    fontFamily: 'Pretendard-Regular',
    fontWeight: '400',
  },
  timeText: {
    fontSize:   20,
    fontFamily: 'Pretendard-Regular',
    fontWeight: '400',
  },
});
