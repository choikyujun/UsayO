import { Check, RotateCw } from 'lucide-react-native';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Linking,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProductSubscription } from 'react-native-iap';
import { Colors } from '../constants/colors';
import { GateType, FREE_COMMAND_LIMIT } from '../constants/featureGates';
import { LINKS } from '../constants/links';
import { subscriptionService } from '../services/subscription/SubscriptionService';
import { getProProducts, priceNumberOf, priceStringOf, setIAPCallbacks, trialInfoOf, type TrialInfo } from '../lib/iap';
import { Spacing } from '../constants/spacing';

type Period = 'annual' | 'monthly';

// 상품 조회 상태. '로드 전(loading)'과 '체험 없음/가격 없음'을 반드시 구분해야 한다 —
// 초기 상태를 '없음'으로 취급하면 배지가 떴다가 사라지는(사용자가 속았다고 느끼는) 전이가 생긴다.
type LoadState = 'loading' | 'ready' | 'failed';

// ── 문구 ─────────────────────────────────────────────────────
// 주의: 이 프로젝트에는 i18n 인프라가 없다 — i18next/react-i18next/expo-localization 미설치,
//    locales 디렉터리 없음, useTranslation 사용처 0건(docs/voice-known-issues.md 섹션 2).
//    그래서 문구를 화면 곳곳에 흩지 않고 여기 한 곳에 모으고, 기간·가격 같은 가변값은
//    **인자로 받는다**('7일'을 문자열에 박지 않는다). i18n을 도입할 때 이 객체가 그대로
//    키 테이블이 되므로 호출부는 손대지 않아도 된다.
const PAYWALL_TEXT = {
  // label이 비면(기간 파싱 실패) 기간 없이 표기한다 — 틀린 기간을 말하는 것보다 낫다.
  trialBadge: (label: string) => (label ? `${label} 무료 체험 가능` : '무료 체험 가능'),
  captionWithTrial: (label: string, price: string, unit: string) =>
    `${label ? `${label} ` : ''}무료 체험 후 ${price}/${unit} 자동 갱신 · 스토어에서 언제든 해지`,
  // 체험이 없어도 가격·주기·자동 갱신·해지 경로 4종은 반드시 남는다(애플·구글 공통 요건).
  captionNoTrial: (price: string, unit: string) =>
    `${price}/${unit} 자동 갱신 · 스토어에서 언제든 해지`,
  ctaStartTrial: '무료로 시작하기',
  ctaStartPro: 'Pro 시작하기',
  ctaTeam: '팀 플랜 문의하기',
  ctaLoadingPrice: '가격 확인 중',
  priceLoadFailed: '가격을 불러오지 못했어요',
  priceRetry: '다시 시도',
} as const;

// 결제 화면의 법적 문서 링크. 외부 브라우저로 열고, 실패를 삼키지 않는다 —
// 약관·방침 링크가 열리지 않는 것은 스토어 심사 반려 사유이고, 사용자도 "눌렀는데
// 아무 일도 안 일어남"을 앱 고장으로 인식한다. (설정 > 프라이버시와 같은 방식)
async function openLegalLink(url: string, label: string) {
  try {
    await Linking.openURL(url);
  } catch (e) {
    console.log(`[Upgrade] 링크 열기 실패 ${label}:`, (e as Error)?.message);
    Alert.alert(
      '링크를 열 수 없어요',
      `${label} 페이지를 열지 못했습니다. 아래 주소를 브라우저에 직접 입력해 주세요.\n\n${url}`,
    );
  }
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

// 무료 체험 배지 — **스토어가 실제로 오퍼를 돌려준 경우에만** 렌더한다.
//   available → 표시   none → 숨김   unknown(로드 전) → 숨김
// unknown에서 숨기는 이유: 없던 배지가 나중에 나타나는 것은 괜찮지만, 있던 배지가
// 사라지면 사용자는 속았다고 느낀다. 확신이 설 때만 켠다.
function TrialBadge({ trial }: { trial: TrialInfo }) {
  if (trial.state !== 'available') return null;
  return (
    <View style={styles.trialBadge}>
      <Text style={styles.trialBadgeText}>{PAYWALL_TEXT.trialBadge(trial.label)}</Text>
    </View>
  );
}

function HardGate({ upgradeTarget, trial }: { upgradeTarget: 'pro' | 'team'; trial: TrialInfo }) {
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
      {upgradeTarget === 'pro' && <TrialBadge trial={trial} />}
    </>
  );
}

function UsageGate({ usageInfo, trial }: { usageInfo?: Props['usageInfo']; trial: TrialInfo }) {
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
      <TrialBadge trial={trial} />
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
  // 상품 조회 상태 — 가격 표시·구매 가능 여부·체험 판정이 모두 이 값에 걸린다.
  const [loadState, setLoadState] = useState<LoadState>('loading');

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

  // 스토어에서 월/연 상품 로드(가격 표시·구매용).
  //
  // 주의: **참조가(DEFAULT_PRICE) 폴백을 쓰지 않는다.** 조회가 실패했는데 하드코딩 가격을
  //    보여주면 스토어와 무관한 금액을 광고하게 된다(심사 반려 + 사용자 신뢰 문제).
  //    실패는 실패로 드러내고 구매를 막는다.
  const cancelledRef = useRef(false);
  const loadPkgs = useCallback(async () => {
    setLoadState('loading');
    try {
      await subscriptionService.loadProducts();
      if (cancelledRef.current) return;
      const next = getProProducts();
      setPkgs(next);
      // 월·연 **둘 다** 가격이 있어야 토글과 절약률이 성립한다. 하나라도 없으면 실패로 본다.
      const ok = !!priceStringOf(next.monthly) && !!priceStringOf(next.annual);
      setLoadState(ok ? 'ready' : 'failed');
      if (!ok) {
        console.warn(
          `[Upgrade] 상품 가격 없음 — 가격 표시·구매 비활성 monthly=${priceStringOf(next.monthly) ?? 'n/a'} annual=${priceStringOf(next.annual) ?? 'n/a'} (원인은 [iap] fetchProducts 로그 참조)`,
        );
      }
    } catch (e) {
      if (cancelledRef.current) return;
      console.warn('[Upgrade] 상품 조회 실패 — 가격 표시·구매 비활성:', (e as Error)?.message);
      setPkgs({});
      setLoadState('failed');
    }
  }, []);

  useEffect(() => {
    if (!visible || upgradeTarget !== 'pro') return;
    setPeriod('annual'); // 열 때마다 연간 기본으로
    cancelledRef.current = false;
    loadPkgs();
    return () => { cancelledRef.current = true; };
  }, [visible, upgradeTarget, loadPkgs]);

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
      onError: (userCancelled, kind) => {
        setLoading(false);
        if (userCancelled) return;
        // 결제가 이미 성공한 경우와 결제 자체가 실패한 경우를 반드시 갈라 말해야 한다.
        // 예전 문구는 둘 다 "잠시 후 다시 시도해주세요"였는데, 결제가 끝난 상태에서
        // '다시 시도'는 **중복 결제를 유도하는 안내**다.
        if (kind === 'verify_retry') {
          Alert.alert(
            '결제는 완료됐어요',
            '구매 확인에 시간이 걸리고 있어요.\n잠시 후 앱을 다시 열면 자동으로 반영됩니다.',
          );
          return;
        }
        if (kind === 'verify_gave_up') {
          Alert.alert(
            '결제는 완료됐어요',
            '구매 확인에 실패했어요.\n아래 \'구매 복원\'을 눌러 다시 시도해주세요.',
          );
          return;
        }
        Alert.alert('결제 오류', '결제를 처리하지 못했어요. 잠시 후 다시 시도해주세요.');
      },
    });
    return () => setIAPCallbacks({});
  }, [visible, onSuccess, onDismiss]);

  // 표시 가격은 **스토어 값만** 쓴다. 없으면 undefined로 두고 아래에서 스켈레톤/오류를 낸다.
  const monthlyStr = priceStringOf(pkgs.monthly);
  const annualStr = priceStringOf(pkgs.annual);
  const monthlyNum = priceNumberOf(pkgs.monthly);
  const annualNum = priceNumberOf(pkgs.annual);
  const savingsPct = monthlyNum != null && annualNum != null
    ? computeSavingsPct(monthlyNum, annualNum)
    : null;

  // 무료 체험 판정 — **선택된 기간의 상품** 기준. 캡션과 배지가 같은 상품을 가리켜야
  // "배지는 체험이라는데 캡션은 아니다" 같은 어긋남이 안 생긴다.
  // loaded는 'loading이 끝났는가'다. 실패(failed)면 pkgs가 비어 trialInfoOf가 'none'을
  // 돌려주고 → 확인되지 않은 체험을 광고하지 않는다.
  const trial = trialInfoOf(
    period === 'annual' ? pkgs.annual : pkgs.monthly,
    loadState !== 'loading',
  );

  // 구매 가능 여부. Team은 인앱 구매 대상이 아니라 상품을 조회하지 않으므로 항상 활성.
  const canPurchase = upgradeTarget !== 'pro' || loadState === 'ready';
  // 상품 조회가 진행 중인가(구매 진행 중인 loading과 다른 상태다).
  // 둘 다 CTA를 막지만 보이는 모습이 달라야 한다 — 구매 중은 '기다리는 중',
  // 조회 중은 '아직 누를 수 없는 이유가 가격이다'를 알려야 한다.
  const productsLoading = upgradeTarget === 'pro' && loadState === 'loading';
  const priceStr = period === 'annual' ? annualStr : monthlyStr;
  const priceUnit = period === 'annual' ? '년' : '월';

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
      const err = e as Error & { code?: string; responseCode?: number; debugMessage?: string };
      console.log(
        `[UpgradeModal] purchase 실패 period=${period} code=${err.code ?? 'n/a'}` +
        ` responseCode=${err.responseCode ?? 'n/a'} message=${err.message ?? '(none)'}` +
        ` debug=${err.debugMessage ?? '(none)'}`,
      );
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

  // '무료로 시작하기'는 실제로 무료 체험이 있을 때만 쓴다 — 없는데 쓰면 표시-실제 불일치다.
  const ctaLabel = upgradeTarget === 'team'
    ? PAYWALL_TEXT.ctaTeam
    : (trial.state === 'available' ? PAYWALL_TEXT.ctaStartTrial : PAYWALL_TEXT.ctaStartPro);

  // 구독 고지 — 체험이 있으면 '기간 + 가격 + 주기 + 자동 갱신 + 해지 경로',
  // 없으면 체험 문구만 빼고 나머지 4종은 그대로 남긴다(애플·구글 공통 요건).
  // 가격을 아직/끝내 모르면 캡션 자체를 내지 않는다 — 빈 금액을 고지할 수는 없다.
  const ctaCaption = upgradeTarget === 'pro' && priceStr
    ? (trial.state === 'available'
        ? PAYWALL_TEXT.captionWithTrial(trial.label, priceStr, priceUnit)
        : PAYWALL_TEXT.captionNoTrial(priceStr, priceUnit))
    : undefined;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <Animated.View style={[styles.backdrop, { opacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
      </Animated.View>

      <Animated.View style={[styles.sheet, { transform: [{ translateY: slideY }] }]}>
        <View style={styles.handle} />

        {gateType === 'hard'  && <HardGate upgradeTarget={upgradeTarget} trial={trial} />}
        {gateType === 'usage' && <UsageGate usageInfo={usageInfo} trial={trial} />}
        {gateType === 'team'  && <TeamGate />}

        {upgradeTarget === 'pro' && loadState === 'failed' && (
          <View style={styles.priceError}>
            <Text style={styles.priceErrorText}>{PAYWALL_TEXT.priceLoadFailed}</Text>
            <Pressable style={styles.retryBtn} onPress={loadPkgs} hitSlop={8}>
              <RotateCw size={14} color={Colors.primary} />
              <Text style={styles.retryText}>{PAYWALL_TEXT.priceRetry}</Text>
            </Pressable>
          </View>
        )}

        {upgradeTarget === 'pro' && loadState !== 'failed' && (
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
              {annualStr
                ? (
                  <Text style={[styles.periodPrice, period === 'annual' && styles.periodPriceActive]}>
                    {annualStr}<Text style={styles.periodUnit}> / 년</Text>
                  </Text>
                )
                : <View style={styles.priceSkeleton} />}
            </Pressable>

            <Pressable
              style={[styles.periodOption, period === 'monthly' && styles.periodOptionActive]}
              onPress={() => setPeriod('monthly')}
            >
              <View style={styles.periodTop}>
                <Text style={[styles.periodLabel, period === 'monthly' && styles.periodLabelActive]}>월간</Text>
              </View>
              {monthlyStr
                ? (
                  <Text style={[styles.periodPrice, period === 'monthly' && styles.periodPriceActive]}>
                    {monthlyStr}<Text style={styles.periodUnit}> / 월</Text>
                  </Text>
                )
                : <View style={styles.priceSkeleton} />}
            </Pressable>
          </View>
        )}

        <Pressable
          style={[styles.ctaBtn, (loading || !canPurchase) && styles.ctaBtnDisabled]}
          onPress={handleUpgrade}
          disabled={loading || !canPurchase}
        >
          {loading ? (
            <ActivityIndicator color={Colors.textPrimary} />
          ) : productsLoading ? (
            // 조회 중 — 버튼은 disabled이고(위 canPurchase), 스피너와 사유를 함께 보인다.
            <View style={styles.ctaLoadingRow}>
              <ActivityIndicator size="small" color={Colors.textPrimary} />
              <Text style={styles.ctaText}>{PAYWALL_TEXT.ctaLoadingPrice}</Text>
            </View>
          ) : (
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          )}
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

        {/* 스토어 심사 요건 — 구독을 판매하는 화면에는 이용약관과 개인정보처리방침
            링크가 보여야 한다(없으면 반려). 게이트 종류와 무관하게 항상 노출한다. */}
        <View style={styles.legalRow}>
          <Pressable hitSlop={8} onPress={() => openLegalLink(LINKS.termsOfService, '이용약관')}>
            <Text style={styles.legalText}>이용약관</Text>
          </Pressable>
          <Text style={styles.legalDot}>·</Text>
          <Pressable hitSlop={8} onPress={() => openLegalLink(LINKS.privacyPolicy, '개인정보처리방침')}>
            <Text style={styles.legalText}>개인정보처리방침</Text>
          </Pressable>
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
  // 가격 자리 스켈레톤 — 조회 중에는 금액 대신 이 자리를 잡아둔다(레이아웃 점프 방지).
  priceSkeleton: {
    height: 20,
    width: '70%',
    borderRadius: 6,
    backgroundColor: Colors.darkBorder,
  },
  // 조회 실패 — 참조가를 대신 보여주지 않고 실패를 드러내고 재시도를 준다.
  priceError: {
    borderWidth: 1,
    borderColor: Colors.darkBorder,
    borderRadius: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.sm,
    gap: Spacing.xs,
    alignItems: 'center',
  },
  priceErrorText: {
    color: Colors.textMuted,
    fontSize: 13,
    fontFamily: 'Pretendard-Regular',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.xs,
  },
  retryText: {
    color: Colors.primary,
    fontSize: 13,
    fontFamily: 'Pretendard-SemiBold',
    fontWeight: '600',
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
  // 스피너 + 사유 문구를 한 줄로. 버튼 높이가 텍스트만 있을 때와 같아야 레이아웃이 안 튄다.
  ctaLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
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
  // 약관·방침 — 결제 동선을 방해하지 않게 CTA보다 낮은 위계로 둔다.
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  legalText: {
    color: Colors.textMuted,
    fontSize: 12,
    textDecorationLine: 'underline',
  },
  legalDot: {
    color: Colors.textMuted,
    fontSize: 12,
  },
});
