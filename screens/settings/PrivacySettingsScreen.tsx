import AsyncStorage from '@react-native-async-storage/async-storage';
import { BarChart2, ChevronRight, Mic, Smartphone } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import FeatureGate from '../../components/FeatureGate';
import { AppTheme, useColors } from '../../constants/colors';
import { supabase } from '../../lib/supabase';
import { Spacing } from '../../constants/spacing';

const ANALYTICS_KEY = 'yusay_analytics_consent';

export default function PrivacySettingsScreen() {
  const colors = useColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [analytics, setAnalytics] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(ANALYTICS_KEY).then(v => {
      setAnalytics(v === '1');
      setLoaded(true);
    });
  }, []);

  async function toggleAnalytics(v: boolean) {
    setAnalytics(v);
    await AsyncStorage.setItem(ANALYTICS_KEY, v ? '1' : '0');
  }

  function handleDeleteData() {
    Alert.alert(
      '내 데이터 삭제',
      '모든 일정과 음성 기록을 삭제합니다.\n되돌릴 수 없어요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제하기',
          style: 'destructive',
          onPress: async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) return;
              await supabase
                .from('events')
                .update({ deleted_at: new Date().toISOString() })
                .eq('user_id', user.id);
              Alert.alert('완료', '모든 데이터가 삭제되었습니다.');
            } catch {
              Alert.alert('오류', '데이터 삭제에 실패했어요. 다시 시도해주세요.');
            }
          },
        },
      ]
    );
  }

  if (!loaded) return <View style={styles.root} />;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scroll}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>데이터 처리</Text>
        <View style={styles.card}>
          <Row
            icon={<Mic size={20} color={colors.textMuted} />}
            label="녹음 즉시 삭제"
            sub="음성 인식 완료 후 녹음 파일을 즉시 삭제해요"
            value={true}
            locked
            colors={colors}
          />
          <FeatureGate
            feature="on_device"
            fallback={
              <Row
                icon={<Smartphone size={20} color={colors.textMuted} />}
                label="온디바이스 처리"
                sub="Team 플랜 — 음성 처리를 기기에서만 수행"
                value={false}
                locked
                badge="Team"
                colors={colors}
              />
            }
          >
            <Row
              icon="📱"
              label="온디바이스 처리"
              sub="음성 처리를 기기에서만 수행해요"
              value={true}
              colors={colors}
            />
          </FeatureGate>
          <Row
            icon={<BarChart2 size={20} color={colors.textMuted} />}
            label="분석 데이터 수집"
            sub="익명 사용 통계만 수집 (개인정보 포함 안 됨)"
            value={analytics}
            onToggle={toggleAnalytics}
            colors={colors}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>약관 및 정책</Text>
        <View style={styles.card}>
          <Pressable style={styles.linkRow}>
            <Text style={styles.linkLabel}>개인정보 처리방침</Text>
            <ChevronRight size={20} color={colors.textMuted} />
          </Pressable>
          <Pressable style={[styles.linkRow, styles.border]}>
            <Text style={styles.linkLabel}>서비스 이용약관</Text>
            <ChevronRight size={20} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>

      <View style={styles.section}>
        <Pressable style={styles.deleteBtn} onPress={handleDeleteData}>
          <Text style={styles.deleteBtnText}>내 데이터 삭제</Text>
        </Pressable>
        <Text style={styles.deleteHint}>
          모든 일정·음성 기록이 영구 삭제됩니다. 되돌릴 수 없어요.
        </Text>
      </View>
    </ScrollView>
  );
}

function Row({
  icon, label, sub, value, onToggle, locked, badge, colors,
}: {
  icon: React.ReactNode;
  label: string;
  sub?: string;
  value: boolean;
  onToggle?: (v: boolean) => void;
  locked?: boolean;
  badge?: string;
  colors: AppTheme;
}) {
  return (
    <View style={{
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.md,
      borderTopWidth: 0.5,
      borderTopColor: colors.border,
      gap: Spacing.md,
    }}>
      <View style={{ width: 24, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 15, color: colors.textPrimary, fontFamily: 'Pretendard-Medium', fontWeight: '500' }}>{label}</Text>
          {badge && (
            <View style={{
              backgroundColor: colors.warning + '20',
              paddingHorizontal: 6,
              paddingVertical: 1,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.warning + '50',
            }}>
              <Text style={{ fontSize: 10, color: colors.warning, fontFamily: 'Pretendard-Bold', fontWeight: '700' }}>{badge}</Text>
            </View>
          )}
        </View>
        {sub ? <Text style={{ fontSize: 11, color: colors.textMuted, lineHeight: 15 }}>{sub}</Text> : null}
      </View>
      {locked ? (
        <Switch
          value={value}
          disabled
          trackColor={{ false: colors.border, true: colors.primary + 'AA' }}
          thumbColor={colors.textMuted}
        />
      ) : (
        <Switch
          value={value}
          onValueChange={onToggle}
          trackColor={{ false: colors.border, true: colors.primary + 'AA' }}
          thumbColor={value ? colors.primary : colors.textMuted}
        />
      )}
    </View>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    root:        { flex: 1, backgroundColor: c.bg },
    scroll:      { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing['2xl'], gap: 16 },
    section:     { gap: 8 },
    sectionTitle: { fontSize: 13, fontFamily: 'Pretendard-Bold', fontWeight: '700', color: c.accent, paddingLeft: 4 },
    card: {
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 0.5,
      borderColor: c.border,
      overflow: 'hidden',
    },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.base,
      paddingVertical: 14,
      justifyContent: 'space-between',
    },
    linkLabel: { fontSize: 15, color: c.textPrimary, fontFamily: 'Pretendard-Medium', fontWeight: '500' },
    border: { borderTopWidth: 0.5, borderTopColor: c.border },
    deleteBtn: {
      backgroundColor: c.error + '15',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.error + '40',
      paddingVertical: 14,
      alignItems: 'center',
    },
    deleteBtnText: { fontSize: 15, color: c.error, fontFamily: 'Pretendard-Bold', fontWeight: '700' },
    deleteHint: { fontSize: 11, color: c.textMuted, textAlign: 'center', lineHeight: 16 },
  });
}
