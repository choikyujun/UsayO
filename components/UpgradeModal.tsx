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
import type { ProductSubscription } from 'react-native-iap';
import { Colors } from '../constants/colors';
import { GateType, FREE_COMMAND_LIMIT } from '../constants/featureGates';
import { DEFAULT_PRICE } from '../constants/pricing';
import { subscriptionService } from '../services/subscription/SubscriptionService';
import { getProProducts, priceNumberOf, priceStringOf, setIAPCallbacks } from '../lib/iap';
import { Spacing } from '../constants/spacing';

type Period = 'annual' | 'monthly';

// 가격 문자열("₩39,000", "$39.99")에서 비교용 숫자만 추출(절약률 폴백 계산용).
function priceToNumber(s: string): number {
  const n = parseFloat(s.replace(/[^0-9.]/g, ''));
  return Number.isNaN(n) ? 0 : n;
}

// 연 결제 절약률(%) = 1 - 연가 / (월가 x 12). 실제 가격에서 계산, 양수일 때만 표시.
function computeSavingsPct(monthly: number, annual: number): number | null {
  if (!monthly || !annual) return null;
  const yearlyIfMonthly = monthly * 12;
  if (yearlyIfMonthly <= 0) return null;
  const pct = Math.round((1 - annual / yearlyIfMonthly) * 100);
  return pct > 0 ? pct : null;
}

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
  // 숫자는 FREE_COMMAND_LIMIT 한 곳에서만 관리(서버 stt-proxy와 동일 값).
  `음성 일정 무제한 (Free: 월 ${FREE_COMMAND_LIMIT}회)`,
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
  const [period, setPeriod] = useState<Period>('annual'); // 기본 선택 = 연간(LTV 유리)
  const [pkgs, setPkgs] = useState<{ monthly?: ProductSubscription; annual?: ProductSubscription }>({});

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

  // 스토어에서 월/연 상품 로드(가격 표시·구매용). 실패 시 참조가로 폴백.
  useEffect(() => {
    if (!visible || upgradeTarget !== 'pro') return;
    setPeriod('annual'); // 열 때마다 연간 기본으로
    let cancelled = false;
    (async () => {
      await subscriptionService.loadProducts().catch(() => {});
      if (!cancelled) setPkgs(getProProducts());
    })();
    return () => { cancelled = true; };
  }, [visible, upgradeTarget]);

  // 구매 결과는 결제창이 아니라 purchaseUpdatedListener(비동기 서버 검증)로 돌아온다.
  // 모달이 열려 있는 동안만 자기 핸들러를 붙이고, 닫히면 원상복구(연결 자체는 유지).
  useEffect(() => {
    if (!visible) return;
    setIAPCallbacks({
      onPurchased: () => {
        setLoading(false);
        onSuccess?.();
        onDismiss();
      },
      onError: (userCancelled) => {
        setLoading(false);
        if (!userCancelled) {
          Alert.alert('결제 오류', '결제 확인 중 문제가 발생했어요. 잠시 후 다시 시도해주세요.');
        }
      },
    });
    return () => setIAPCallbacks({});
  }, [visible, onSuccess, onDismiss]);

  // 표시 가격: 스토어 우선, 없으면 참조가(DEFAULT_PRICE). 절약률은 실제 숫자에서 계산.
  const monthlyStr = priceStringOf(pkgs.monthly) ?? DEFAULT_PRICE.monthly;
  const annualStr = priceStringOf(pkgs.annual) ?? DEFAULT_PRICE.annual;
  const monthlyNum = priceNumberOf(pkgs.monthly) ?? priceToNumber(DEFAULT_PRICE.monthly);
  const annualNum = priceNumberOf(pkgs.annual) ?? priceToNumber(DEFAULT_PRICE.annual);
  const savingsPct = computeSavingsPct(monthlyNum, annualNum);

  async function handleUpgrade() {
    if (upgradeTarget === 'team') {
      // Team은 인앱 구매 대상이 아니다 — 영업 문의로만 전환(스토어 상품 노출 없음).
      onDismiss();
      return;
    }

    try {
      setLoading(true);
      // 결제창만 띄운다. 성공/실패는 위 리스너가 받는다(setLoading도 거기서 해제).
      await subscriptionService.purchasePro(period === 'annual' ? 'annual' : 'monthly');
    } catch (e: unknown) {
      // requestPurchase가 즉시 던지는 경우(상품 없음·스토어 미연결 등). 취소는 리스너로 온다.
      setLoading(false);
      console.log('[UpgradeModal] purchase 실패:', (e as Error)?.message);
      Alert.alert('결제 오류', '결제를 시작할 수 없어요. 잠시 후 다시 시도해주세요.');
    }
  }

  async function handleRestore() {
    try {
      setLoading(true);
      const restored = await subscriptionService.restorePurchases();
      if (restored) {
        onSuccess?.();
        onDismiss();
      } else {
        Alert.alert('복원할 구매 없음', '이 계정에서 복원할 구독을 찾지 못했어요.');
      }
    } catch {
      Alert.alert('복원 오류', '구매 복원에 실패했어요.');
    } finally {
      setLoading(false);
    }
  }

  const ctaLabel = upgradeTarget === 'team' ? '팀 플랜 문의하기' : 'Pro 시작하기';

  const ctaCaption = upgradeTarget === 'pro'
    ? (period === 'annual'
        ? `7일 무료 후 ${annualStr}/년 · 언제든 취소 가능`
        : `7일 무료 후 ${monthlyStr}/월 · 언제든 취소 가능`)
    : undefined;

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

        {upgradeTarget === 'pro' && (
          <View style={styles.periodToggle}>
            <Pressable
              style={[styles.periodOption, period === 'annual' && styles.periodOptionActive]}
              onPress={() => setPeriod('annual')}
            >
              <View style={styles.periodTop}>
                <Text style={[styles.periodLabel, period === 'annual' && styles.periodLabelActive]}>연간</Text>
                {savingsPct != null && (
                  <View style={styles.saveBadge}>
                    <Text style={styles.saveBadgeText}>{savingsPct}% 절약</Text>
                  </View>
                )}
              </View>
              <Text style={[styles.periodPrice, period === 'annual' && styles.periodPriceActive]}>
                {annualStr}<Text style={styles.periodUnit}> / 년</Text>
              </Text>
            </Pressable>

            <Pressable
              style={[styles.periodOption, period === 'monthly' && styles.periodOptionActive]}
              onPress={() => setPeriod('monthly')}
            >
              <View style={styles.periodTop}>
                <Text style={[styles.periodLabel, period === 'monthly' && styles.periodLabelActive]}>월간</Text>
              </View>
              <Text style={[styles.periodPrice, period === 'monthly' && styles.periodPriceActive]}>
                {monthlyStr}<Text style={styles.periodUnit}> / 월</Text>
              </Text>
            </Pressable>
          </View>
        )}

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
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: 40,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.darkBorder,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.lg,
  },
  modalTitle: {
    color: Colors.textPrimary,
    fontSize: 20,
    fontFamily: 'Pretendard-Bold',
    fontWeight: '700',
    marginBottom: Spacing.sm,
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
    paddingVertical: Spacing.xs,
    marginBottom: 20,
  },
  trialBadgeText: {
    color: Colors.accent,
    fontSize: 13,
    fontFamily: 'Pretendard-SemiBold',
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
    marginBottom: Spacing.md,
  },
  usageHighlight: {
    color: Colors.textPrimary,
    fontFamily: 'Pretendard-Bold',
    fontWeight: '700',
  },
  // 월/연 선택 토글
  periodToggle: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  periodOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.darkBorder,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: 6,
  },
  periodOptionActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent + '12',
  },
  periodTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 20,
  },
  periodLabel: {
    color: Colors.textMuted,
    fontSize: 14,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
  },
  periodLabelActive: {
    color: Colors.textPrimary,
  },
  periodPrice: {
    color: Colors.textMuted,
    fontSize: 17,
    fontFamily: 'Pretendard-Bold',
    fontWeight: '700',
  },
  periodPriceActive: {
    color: Colors.textPrimary,
  },
  periodUnit: {
    fontSize: 12,
    fontFamily: 'Pretendard-Medium',
    fontWeight: '500',
    color: Colors.textMuted,
  },
  saveBadge: {
    backgroundColor: Colors.accent,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  saveBadgeText: {
    color: Colors.textPrimary,
    fontSize: 10,
    fontFamily: 'Pretendard-Bold',
    fontWeight: '700',
  },
  // CTA
  ctaBtn: {
    backgroundColor: Colors.primary,
    paddingVertical: Spacing.base,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.xs,
  },
  ctaBtnDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontFamily: 'Pretendard-Bold',
    fontWeight: '700',
  },
  ctaCaption: {
    color: Colors.textMuted,
    fontSize: 12,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.lg,
  },
  dismissBtn: {
    paddingVertical: Spacing.sm,
  },
  dismissText: {
    color: Colors.textMuted,
    fontSize: 14,
  },
  restoreBtn: {
    paddingVertical: Spacing.sm,
  },
  restoreText: {
    color: Colors.textMuted,
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
