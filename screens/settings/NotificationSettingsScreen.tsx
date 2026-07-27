import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { AppTheme, useColors } from '../../constants/colors';
import { SETTINGS_FLAGS } from '../../constants/featureFlags';
import { Spacing } from '../../constants/spacing';

interface NotifItem {
  key:   string;
  label: string;
  sub?:  string;
}

const SCHEDULE_NOTIFS: NotifItem[] = [
  { key: 'before_10',   label: '시작 10분 전',  sub: '다음 일정 알림' },
  { key: 'before_60',   label: '시작 1시간 전', sub: '미리 준비할 수 있게' },
  { key: 'daily_recap', label: '하루 전 요약',  sub: '내일 일정 미리 보기' },
];

const VOICE_NOTIFS: NotifItem[] = [
  { key: 'earphone_tts',  label: '이어폰 음성 읽기', sub: '이어폰 연결 시 TTS 자동 실행' },
  { key: 'silent_vibrate', label: '무음 시 진동',   sub: '소리 없이 진동으로 알림' },
];

const STORAGE_PREFIX = 'yusay_notif_';

type ToggleMap = Record<string, boolean>;

const DEFAULTS: ToggleMap = {
  before_10:      true,
  before_60:      true,
  daily_recap:    false,
  earphone_tts:   true,
  silent_vibrate: true,
};

export default function NotificationSettingsScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [toggles, setToggles] = useState<ToggleMap>(DEFAULTS);
  const [loaded, setLoaded]   = useState(false);

  useEffect(() => {
    (async () => {
      const keys    = Object.keys(DEFAULTS);
      const entries = await Promise.all(
        keys.map(async k => [k, await AsyncStorage.getItem(STORAGE_PREFIX + k)] as const)
      );
      const saved: ToggleMap = { ...DEFAULTS };
      for (const [k, v] of entries) {
        if (v !== null) saved[k] = v === '1';
      }
      setToggles(saved);
      setLoaded(true);
    })();
  }, []);

  async function toggle(key: string, value: boolean) {
    setToggles(prev => ({ ...prev, [key]: value }));
    await AsyncStorage.setItem(STORAGE_PREFIX + key, value ? '1' : '0');
  }

  if (!loaded) return <View style={styles.root} />;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <Section title="일정 알림" colors={colors}>
        {/* daily_recap은 미배선 → notifExtras 플래그로 숨김. before_10/60만 실제 예약에 반영됨 */}
        {(SETTINGS_FLAGS.notifExtras ? SCHEDULE_NOTIFS : SCHEDULE_NOTIFS.filter(x => x.key !== 'daily_recap')).map((item, i) => (
          <NotifRow
            key={item.key}
            item={item}
            value={toggles[item.key] ?? false}
            onChange={v => toggle(item.key, v)}
            bordered={i > 0}
            colors={colors}
          />
        ))}
      </Section>

      {/* 음성 알림(이어폰 TTS/무음 진동)은 미배선 → notifExtras 배선 후 복원 */}
      {SETTINGS_FLAGS.notifExtras && (
        <Section title="음성 알림" colors={colors}>
          {VOICE_NOTIFS.map((item, i) => (
            <NotifRow
              key={item.key}
              item={item}
              value={toggles[item.key] ?? false}
              onChange={v => toggle(item.key, v)}
              bordered={i > 0}
              colors={colors}
            />
          ))}
        </Section>
      )}

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          알림 권한이 없으면 일부 기능이 동작하지 않을 수 있어요.
          기기 설정에서 UsayO의 알림을 허용해주세요.
        </Text>
      </View>
    </ScrollView>
  );
}

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: AppTheme }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: 13, fontFamily: 'Pretendard-Bold', fontWeight: '700', color: colors.accent, paddingLeft: 4 }}>
        {title}
      </Text>
      <View style={{
        backgroundColor: colors.card,
        borderRadius: 12,
        borderWidth: 0.5,
        borderColor: colors.border,
        overflow: 'hidden',
      }}>
        {children}
      </View>
    </View>
  );
}

function NotifRow({
  item, value, onChange, bordered, colors,
}: { item: NotifItem; value: boolean; onChange: (v: boolean) => void; bordered: boolean; colors: AppTheme }) {
  return (
    <View style={[
      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: 12 },
      bordered && { borderTopWidth: 0.5, borderTopColor: colors.border },
    ]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 15, color: colors.textPrimary, fontFamily: 'Pretendard-Medium', fontWeight: '500' }}>{item.label}</Text>
        {item.sub ? <Text style={{ fontSize: 11, color: colors.textMuted }}>{item.sub}</Text> : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary + 'AA' }}
        thumbColor={value ? colors.primary : colors.textMuted}
      />
    </View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    root:    { flex: 1, backgroundColor: c.bg },
    scroll:  { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: 40, gap: 16 },
    infoBox: {
      backgroundColor: c.card,
      borderRadius: 10,
      padding: 14,
      borderWidth: 0.5,
      borderColor: c.border,
    },
    infoText: { fontSize: 12, color: c.textMuted, lineHeight: 18 },
  });
}
