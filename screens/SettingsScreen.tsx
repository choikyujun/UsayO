import { router } from 'expo-router';
import { Bell, Calendar, Check, ChevronRight, Globe, Info, Lock } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import UpgradeModal from '../components/UpgradeModal';
import { AppTheme, useColors } from '../constants/colors';
import { ACCENT_PALETTES, useTheme } from '../contexts/ThemeContext';
import { SETTINGS_FLAGS } from '../constants/featureFlags';
import { supabase } from '../lib/supabase';
import { useSubscriptionStore } from '../stores/useSubscriptionStore';
import { Spacing } from '../constants/spacing';

const PLAN_LABEL: Record<string, string> = {
  free: 'Free',
  pro: 'Pro',
  team: 'Team',
};

type LucideIcon = React.ComponentType<{ size: number; color: string }>;

interface MenuItem {
  Icon: LucideIcon;
  label: string;
  route: string;
}

const MENU_ITEMS: MenuItem[] = [
  // 캘린더 연동은 mock 상태 → SETTINGS_FLAGS.calendarIntegration로 숨김(복원 시 아래 주석 해제 불필요, 플래그만 true)
  ...(SETTINGS_FLAGS.calendarIntegration
    ? [{ Icon: Calendar, label: '캘린더 연동', route: '/settings/calendar-integration' }]
    : []),
  { Icon: Bell,     label: '알림 설정',   route: '/settings/notifications' },
  { Icon: Globe,    label: '언어·음성',   route: '/settings/language' },
  { Icon: Lock,     label: '프라이버시',  route: '/settings/privacy' },
  { Icon: Info,     label: '앱 정보',     route: '/settings/app-info' },
];

export default function SettingsScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { accentId, setAccentId, hintEnabled, toggleHint, ttsEnabled, toggleTTS, lunarEnabled, toggleLunar } = useTheme();
  const { plan } = useSubscriptionStore();
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const planColor: Record<string, string> = {
    free: colors.textMuted,
    pro: colors.primary,
    team: colors.warning,
  };

  const initials = 'YU';
  const name     = '유저';
  const email    = 'user@yusay.app';

  async function handleLogout() {
    Alert.alert('로그아웃', '정말 로그아웃하시겠어요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/onboarding/splash' as never);
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {/* Profile card */}
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={styles.profileInfo}>
          <Text style={styles.profileName}>{name}</Text>
          <Text style={styles.profileEmail}>{email}</Text>
        </View>
        <View style={[styles.planBadge, { borderColor: planColor[plan] + '60' }]}>
          <Text style={[styles.planText, { color: planColor[plan] }]}>
            {PLAN_LABEL[plan]}
          </Text>
        </View>
      </View>

      {/* Upgrade banner — Free users only */}
      {plan === 'free' && (
        <Pressable style={styles.upgradeBanner} onPress={() => setUpgradeVisible(true)}>
          <View style={styles.upgradeBannerLeft}>
            <Text style={styles.upgradeBannerTitle}>Pro로 업그레이드</Text>
            <Text style={styles.upgradeBannerSub}>음성 무제한 · AI 빈 슬롯 제안</Text>
          </View>
          <View style={styles.upgradeBannerRight}>
            <Text style={styles.upgradeBannerPrice}>₩3,900/월</Text>
            <ChevronRight size={14} color={colors.primary} />
          </View>
        </Pressable>
      )}

      {/* Accent color picker */}
      <View style={styles.section}>
        <View style={styles.colorPickerHeader}>
          <Text style={styles.colorPickerLabel}>테마</Text>
          <Text style={styles.colorPickerSub}>
            {ACCENT_PALETTES.find(p => p.id === accentId)?.label ?? ''}
          </Text>
        </View>
        <View style={styles.colorRow}>
          {ACCENT_PALETTES.map(palette => {
            const isSelected = palette.id === accentId;
            return (
              <Pressable
                key={palette.id}
                style={[
                  styles.colorCircle,
                  { backgroundColor: palette.color },
                  isSelected && styles.colorCircleSelected,
                ]}
                onPress={() => setAccentId(palette.id)}
                accessibilityLabel={palette.label}
              >
                {isSelected && <Check size={16} color="#fff" strokeWidth={3} />}
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Voice toggles */}
      <View style={styles.section}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>음성 명령 힌트 표시</Text>
          <Switch
            value={hintEnabled}
            onValueChange={toggleHint}
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={hintEnabled ? colors.primary : colors.textMuted}
          />
        </View>
        <View style={[styles.toggleRow, styles.toggleRowBorder]}>
          <Text style={styles.toggleLabel}>음성 확인 (TTS)</Text>
          <Switch
            value={ttsEnabled}
            onValueChange={toggleTTS}
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={ttsEnabled ? colors.primary : colors.textMuted}
          />
        </View>
        <View style={[styles.toggleRow, styles.toggleRowBorder]}>
          <Text style={styles.toggleLabel}>음력 날짜 표시</Text>
          <Switch
            value={lunarEnabled}
            onValueChange={toggleLunar}
            trackColor={{ false: colors.border, true: colors.primary + '80' }}
            thumbColor={lunarEnabled ? colors.primary : colors.textMuted}
          />
        </View>
      </View>

      {/* Menu */}
      <View style={styles.section}>
        {MENU_ITEMS.map((item, i) => (
          <Pressable
            key={item.route}
            style={[styles.menuRow, i > 0 && styles.menuRowBorder]}
            onPress={() => router.push(item.route as never)}
          >
            <item.Icon size={20} color={colors.textMuted} />
            <Text style={styles.menuLabel}>{item.label}</Text>
            <ChevronRight size={20} color={colors.textMuted} />
          </Pressable>
        ))}
      </View>

      {/* Logout */}
      <Pressable style={styles.logoutRow} onPress={handleLogout}>
        <Text style={styles.logoutText}>로그아웃</Text>
      </Pressable>

      <Text style={styles.version}>YuSay v1.0.0 · Yu say. It's done.</Text>

      <UpgradeModal
        visible={upgradeVisible}
        gateType="hard"
        upgradeTarget="pro"
        onDismiss={() => setUpgradeVisible(false)}
      />
    </ScrollView>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: c.bg },
    scroll: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: 40, gap: 12 },
    profileCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: c.card,
      borderRadius: 14,
      padding: Spacing.base,
      borderWidth: 0.5,
      borderColor: c.border,
      gap: 14,
    },
    avatar: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: c.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { fontSize: 20, fontWeight: '800', color: '#fff' },
    profileInfo: { flex: 1 },
    profileName: { fontSize: 16, fontFamily: 'Pretendard-Bold', fontWeight: '700', color: c.textPrimary, marginBottom: 2 },
    profileEmail: { fontSize: 12, color: c.textMuted },
    planBadge: {
      paddingHorizontal: 10,
      paddingVertical: Spacing.xs,
      borderRadius: 10,
      borderWidth: 1.5,
    },
    planText: { fontSize: 12, fontWeight: '800' },
    upgradeBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: c.primary + '15',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.primary + '50',
      padding: 14,
    },
    upgradeBannerLeft: { flex: 1 },
    upgradeBannerTitle: {
      fontSize: 14,
      fontFamily: 'Pretendard-Bold',
      fontWeight: '700',
      color: c.textPrimary,
      marginBottom: 2,
    },
    upgradeBannerSub: { fontSize: 11, color: c.textMuted },
    upgradeBannerRight: { alignItems: 'flex-end', gap: 4 },
    upgradeBannerPrice: { fontSize: 13, fontFamily: 'Pretendard-Bold', fontWeight: '700', color: c.accent },
    section: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 0.5,
      borderColor: c.border,
      overflow: 'hidden',
    },
    // Color picker
    colorPickerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.base,
      paddingTop: 14,
      paddingBottom: 10,
    },
    colorPickerLabel: { fontSize: 15, color: c.textPrimary, fontFamily: 'Pretendard-Medium', fontWeight: '500' },
    colorPickerSub: { fontSize: 12, color: c.textMuted },
    colorRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-around',
      paddingHorizontal: Spacing.base,
      paddingBottom: Spacing.base,
      gap: Spacing.sm,
    },
    colorCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorCircleSelected: {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.35,
      shadowRadius: 4,
      elevation: 4,
      transform: [{ scale: 1.15 }],
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.base,
      paddingVertical: 14,
    },
    toggleRowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
    toggleLabel: { fontSize: 15, color: c.textPrimary, fontFamily: 'Pretendard-Medium', fontWeight: '500' },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.base,
      paddingVertical: 14,
      gap: Spacing.md,
    },
    menuRowBorder: {
      borderTopWidth: 0.5,
      borderTopColor: c.border,
    },
    menuLabel: { flex: 1, fontSize: 15, color: c.textPrimary, fontFamily: 'Pretendard-Medium', fontWeight: '500' },
    logoutRow: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 0.5,
      borderColor: c.border,
      paddingVertical: 14,
      alignItems: 'center',
    },
    logoutText: { fontSize: 15, color: c.error, fontFamily: 'Pretendard-SemiBold', fontWeight: '600' },
    version: {
      textAlign: 'center',
      fontSize: 11,
      color: c.textMuted,
      opacity: 0.5,
      marginTop: Spacing.xs,
    },
  });
}
