import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Platform, Pressable, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { useColors } from '../constants/colors';

export type CalendarView = 'day' | 'week' | 'month' | 'year';

const TABS: { key: CalendarView; label: string }[] = [
  { key: 'day',   label: '일' },
  { key: 'week',  label: '주' },
  { key: 'month', label: '월' },
  { key: 'year',  label: '연' },
];

const LABEL_MAP: Record<CalendarView, string> = {
  day: '일', week: '주', month: '월', year: '연',
};

interface Props {
  currentView: CalendarView;
  onSelect:    (view: CalendarView) => void;
}

export default function ViewTabBar({ currentView, onSelect }: Props) {
  const colors = useColors();

  function handlePress(view: CalendarView) {
    if (view === currentView) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (view === 'week') {
      router.push('/week');
      return;
    }
    if (view === 'month' || view === 'year') {
      if (Platform.OS === 'android') {
        ToastAndroid.show(`${LABEL_MAP[view]} 뷰 준비 중`, ToastAndroid.SHORT);
      }
    }
    onSelect(view);
  }

  return (
    <View style={[styles.bar, { borderBottomColor: colors.border }]}>
      {TABS.map(tab => {
        const active = tab.key === currentView;
        return (
          <Pressable
            key={tab.key}
            style={[styles.tab, active && { backgroundColor: colors.primary }]}
            onPress={() => handlePress(tab.key)}
            hitSlop={4}
          >
            <Text style={[styles.label, { color: active ? '#fff' : colors.accent }, active && styles.labelActive]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection:     'row',
    paddingHorizontal: 16,
    paddingVertical:   6,
    gap:               8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex:           1,
    height:         32,
    borderRadius:   16,
    alignItems:     'center',
    justifyContent: 'center',
  },
  tabActive: {
    // backgroundColor injected inline from colors.primary
  },
  label: {
    fontSize:   13,
    fontFamily: 'Pretendard-Regular',
    fontWeight: '400',
  },
  labelActive: {
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
  },
});
