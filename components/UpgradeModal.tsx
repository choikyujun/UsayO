import { Check } from 'lucide-react-native';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useEffect, useRef, useState } from 'react';
import Purchases from 'react-native-purchases';
import { Colors } from '../constants/colors';
import { GateType } from '../constants/featureGates';
import { subscriptionService } from '../services/subscription/SubscriptionService';

interface Props {
  visible: boolean;
  gateType: GateType;
  upgradeTarget: 'pro' | 'team';
  usageInfo?: { used: number; limit: number; percentage: number };
  onDismiss: () => void;
  onSuccess?: () => void;
}

// ── 게이트별 컨텐츠 ──────────────────────────────────────────

const PRO_FEATURES = [
  '음성 일정 무제한 (Free: 월 50회)',
  'AI 빈 슬롯 제안',
];

const TEAM_FEATURES = [
  '팀 공유 캘린더',
  '온디바이스 AI 처리',
  'WokyToky 근무 연동',
  '관리자 대시보드',
];

function TrialBadge() {
  return (
    <View style={styles.trialBadge}>
      <Text style={styles.trialBadgeText}>7일 무료 체험 가능</Text>
    </View>
  );
}

function HardGate({ upgradeTarget }: { upgradeTarget: 'pro' | 'team' }) {
  const label = upgradeTarget === 'team' ? 'Team' : 'Pro';
  return (
    <>
      <Text style={styles.modalTitle}>{label} 기능이에요</Text>
      <Text style={styles.modalSubtitle}>
        {label} 플랜으로 업그레이드하면 이 기능을 사용할 수 있어요.
      </Text>
      <View style={styles.featureList}>
        {PRO_FEATURES.map(f => (
          <View key={f} style={styles.featureRow}>
            <Check size={16} color={Colors.success} />
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>
      {upgradeTarget === 'pro' && <TrialBadge />}
    </>
  );
}

function UsageGate({ usageInfo }: { usageInfo?: Props['usageInfo'] }) {
  if (!usageInfo) return null;
  const { used, limit, percentage } = usageInfo;
  const remaining = Math.max(0, limit - used);
  return (
    <>
      <Text style={styles.modalTitle}>이번 달 사용량</Text>
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${percentage}%` as `${number}%` }]} />
      </View>
      <Text style={styles.usageText}>
        {used} / {limit}회 사용 · 남은 횟수: <Text style={styles.usageHighlight}>{remaining}회</Text>
      </Text>
      <Text style={styles.modalSubtitle}>
        Pro로 업그레이드하면 무제한으로 사용할 수 있어요.
      </Text>
      <TrialBadge />
    </>
  );
}

function TeamGate() {
  return (
    <>
      <Text style={styles.modalTitle}>Team 전용 기능</Text>
      <Text style={styles.modalSubtitle}>팀 플랜에서만 사용 가능한 기능들이에요.</Text>
      <View style={styles.featureList}>
        {TEAM_FEATURES.map(f => (
          <View key={f} style={styles.featureRow}>
            <Check size={16} color={Colors.success} />
            <Text style={styles.featureText}>{f}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

// ── 메인 모달 ──────────────────────────────────────────────

export default function UpgradeModal({
  visible, gateType, upgradeTarget, usageInfo, onDismiss, onSuccess,
}: Props) {
  const slideY = useRef(new Animated.Value(400)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideY, { toValue: 0, useNativeDriver: true, tension: 55, friction: 9 }),
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideY, { toValue: 400, duration: 220, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [visible]);

  async function handleUpgrade() {
    if (upgradeTarget === 'team') {
      // Team plan requires contacting sales — no direct in-app purchase
      onDismiss();
      return;
    }

    try {
      setLoading(true);
      const offerings = await Purchases.getOfferings();
      const pkg = offerings.current?.availablePackages.find(
        p => p.packageType === 'MONTHLY'
      );

      if (!pkg) {
        Alert.alert('오류', '상품을 찾을 수 없어요. 잠시 후 다시 시도해주세요.');
        return;
      }

      await subscriptionService.purchaseSubscription(pkg);
      onSuccess?.();
      onDismiss();
    } catch (e: unknown) {
      const err = e as { userCancelled?: boolean };
      if (!err.userCancelled) {
        Alert.alert('결제 오류', '결제 중 오류가 발생했어요. 다시 시도해주세요.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore() {
    try {
      setLoading(true);
      await subscriptionService.restorePurchases();
      onSuccess?.();
      onDismiss();
    } catch {
      Alert.alert('복원 오류', '구매 복원에 실패했어요.');
    } finally {
      setLoading(false);
    }
  }

  const ctaLabel = upgradeTarget === 'team'
    ? '팀 플랜 문의하기'
    : gateType === 'usage'
      ? 'Pro로 업그레이드 (₩3,900/월)'
      : '무료로 시작하기';

  const ctaCaption = upgradeTarget === 'pro' ? '7일 후 ₩3,900/월 · 언제든 취소 가능' : undefined;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={styles.handle} />

        {gateType === 'hard'  && <HardGate upgradeTarget={upgradeTarget} />}
        {gateType === 'usage' && <UsageGate usageInfo={usageInfo} />}
        {gateType === 'team'  && <TeamGate />}

        <Pressable style={[styles.ctaBtn, loading && styles.ctaBtnDisabled]} onPress={handleUpgrade} disabled={loading}>
          {loading
            ? <ActivityIndicator color={Colors.textPrimary} />
            : <Text style={styles.ctaText}>{ctaLabel}</Text>
          }
        </Pressable>

        {ctaCaption && <Text style={styles.ctaCaption}>{ctaCaption}</Text>}

        <View style={styles.footer}>
          <Pressable style={styles.dismissBtn} onPress={onDismiss}>
            <Text style={styles.dismissText}>나중에</Text>
          </Pressable>
          {upgradeTarget === 'pro' && (
            <Pressable style={styles.restoreBtn} onPress={handleRestore} disabled={loading}>
              <Text style={styles.restoreText}>구매 복원</Text>
            </Pressable>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
}

// ── 스타일 ────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: Colors.darkCard,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.darkBorder,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modalSubtitle: {
    color: Colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  featureList: {
    gap: 10,
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    color: Colors.textPrimary,
    fontSize: 15,
  },
  trialBadge: {
    alignSelf: 'flex-start',
    backgroundColor: Colors.accent + '20',
    borderWidth: 1,
    borderColor: Colors.accent + '50',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 20,
  },
  trialBadgeText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  // Usage gate
  progressBar: {
    height: 8,
    backgroundColor: Colors.darkBorder,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.warning,
    borderRadius: 4,
  },
  usageText: {
    color: Colors.textMuted,
    fontSize: 14,
    marginBottom: 12,
  },
  usageHighlight: {
    color: Colors.textPrimary,
    fontWeight: '700',
  },
  // CTA
  ctaBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  ctaBtnDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  ctaCaption: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 12,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
  },
  dismissBtn: {
    paddingVertical: 8,
  },
  dismissText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  restoreBtn: {
    paddingVertical: 8,
  },
  restoreText: {
    color: Colors.textMuted,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
