import AsyncStorage from '@react-native-async-storage/async-storage';
import { AlertTriangle, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppTheme, useColors } from '../constants/colors';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { FeatureKey } from '../constants/featureGates';
import UpgradeModal from './UpgradeModal';
import { Spacing } from '../constants/spacing';

interface Props {
  feature: 'voice_create' | 'voice_modify' | 'voice_query';
}

const DISMISS_KEY = () => `yusay_banner_dismissed_${new Date().toISOString().slice(0, 10)}`;

export default function UsageWarningBanner({ feature }: Props) {
  const colors = useColors();
  const gate = useFeatureGate(feature as FeatureKey);
  const [dismissed, setDismissed] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    async function check() {
      const val = await AsyncStorage.getItem(DISMISS_KEY());
      if (val) return;
      setDismissed(false);
    }
    check();
  }, []);

  const shouldShow =
    !dismissed &&
    gate.usageInfo != null &&
    gate.usageInfo.percentage >= 80;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: shouldShow ? 1 : 0,
      duration: shouldShow ? 250 : 200,
      useNativeDriver: true,
    }).start();
  }, [shouldShow]);

  async function handleDismiss() {
    await AsyncStorage.setItem(DISMISS_KEY(), '1');
    setDismissed(true);
  }

  if (!gate.usageInfo || !shouldShow) return null;

  const { used, limit, percentage } = gate.usageInfo;
  const remaining = Math.max(0, limit - used);
  const styles = makeStyles(colors);

  return (
    <>
      <Animated.View style={[styles.banner, { opacity }]} pointerEvents="auto">
        <View style={styles.content}>
          <View style={styles.left}>
            <AlertTriangle size={18} color={colors.warning} />
            <View>
              <Text style={styles.title}>이번 달 사용량 {percentage}%</Text>
              <Text style={styles.sub}>남은 횟수 {remaining}회</Text>
            </View>
          </View>

          <View style={styles.right}>
            <Pressable style={styles.upgradeBtn} onPress={() => setModalVisible(true)}>
              <Text style={styles.upgradeText}>업그레이드</Text>
            </Pressable>
            <Pressable onPress={handleDismiss} hitSlop={8} style={styles.closeBtn}>
              <X size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>

        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${percentage}%` as `${number}%` }]} />
        </View>
      </Animated.View>

      <UpgradeModal
        visible={modalVisible}
        gateType={gate.gateType}
        upgradeTarget={gate.upgradeTarget}
        usageInfo={gate.usageInfo}
        onDismiss={() => setModalVisible(false)}
      />
    </>
  );
}

function makeStyles(c: AppTheme) {
  return StyleSheet.create({
    banner: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.warning + '50',
      borderRadius: 12,
      marginHorizontal: Spacing.base,
      marginBottom: Spacing.sm,
      overflow: 'hidden',
    },
    content: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    left:        { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    title:       { color: c.warning, fontSize: 13, fontFamily: 'Pretendard-Bold', fontWeight: '700' },
    sub:         { color: c.textMuted, fontSize: 11, marginTop: 1 },
    right:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
    upgradeBtn: {
      backgroundColor: c.primary,
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
      borderRadius: 8,
    },
    upgradeText: { color: '#fff', fontSize: 12, fontFamily: 'Pretendard-Bold', fontWeight: '700' },
    closeBtn:    { paddingHorizontal: 4 },
    progressBar: { height: 3, backgroundColor: c.border },
    progressFill: { height: '100%', backgroundColor: c.warning },
  });
}
