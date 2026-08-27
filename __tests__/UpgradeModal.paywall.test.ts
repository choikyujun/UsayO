// 페이월 무료 체험 표시 회귀 방지.
//
// 왜 렌더까지 하는가 — trialInfoOf 단위 판정만으로는 "판정이 화면에 반영되는가"를 못 잡는다.
// 이 파일이 막으려는 회귀는 **오퍼가 없는데 "무료 체험" 문구가 뜨는 것**(App Store 3.1.2
// 표시-실제 불일치 = 심사 반려)과 **조회 실패 시 참조가(DEFAULT_PRICE)가 되살아나는 것**이다.
// 둘 다 렌더 결과를 봐야만 잡힌다.
//
// 실행 환경 제약:
//   · package.json의 jest 설정(testEnvironment: node, ts-jest, testMatch: *.test.ts)을
//     그대로 쓴다. jest-expo 프리셋이 없으므로 node_modules는 변환되지 않는다
//     → react-native을 실제로 불러올 수 없어 이 파일 안에서 최소 스텁으로 대체한다.
//   · 같은 이유로 파일 확장자는 .ts다(ts-jest tsconfig에 jsx 옵션이 없어 TSX가 컴파일되지 않음).
//     JSX 대신 React.createElement를 쓴다.
//   · @types/react-test-renderer가 없다(package.json 수정 불가) → 필요한 표면만 아래에 선언한다.

import React from 'react';

// React 18+의 act()는 이 전역 플래그로 "여기는 테스트 환경"임을 판별한다.
// jest-expo 프리셋이라면 자동으로 켜주지만, 이 프로젝트는 소박한 ts-jest 설정을 쓰므로
// 직접 켠다. 켜지 않으면 렌더/상태 갱신마다 act 경고가 쏟아진다.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ── 스토어 응답 훅 (jest.mock 팩토리가 참조하려면 mock 접두사가 필요하다) ──
let mockProductsResponse: unknown[] = [];
let mockFetchShouldThrow = false;
let mockGate: Promise<void> | null = null;

// react-native 스텁. 검증 대상은 "어떤 문자열이 렌더되는가"와 "disabled prop이 무엇인가"라
// 실제 RN 구현이 필요 없다. 스텁이 오히려 RN 내부 변경에 흔들리지 않는다.
jest.mock('react-native', () => {
  const R = require('react');
  const comp = (name: string) => {
    const C = (props: { children?: unknown }) =>
      R.createElement(R.Fragment, null, props.children ?? null);
    C.displayName = name;
    return C;
  };
  const AnimatedValue = class { constructor(public v: number) {} };
  const anim = () => ({ start: () => {} });
  return {
    View: comp('View'),
    Text: comp('Text'),
    Pressable: comp('Pressable'),
    Modal: comp('Modal'),
    ActivityIndicator: comp('ActivityIndicator'),
    Animated: { View: comp('Animated.View'), Value: AnimatedValue, spring: anim, timing: anim, parallel: anim },
    StyleSheet: { create: (o: unknown) => o, absoluteFillObject: {}, absoluteFill: {} },
    Alert: { alert: jest.fn() },
    Linking: { openURL: jest.fn() },
    Platform: { OS: 'ios', select: (o: { ios?: unknown; default?: unknown }) => o.ios ?? o.default },
  };
});

jest.mock('react-native-iap', () => ({
  ErrorCode: { UserCancelled: 'user-cancelled' },
  endConnection: jest.fn(),
  finishTransaction: jest.fn(),
  getAvailablePurchases: jest.fn().mockResolvedValue([]),
  initConnection: jest.fn(),
  purchaseErrorListener: jest.fn(() => ({ remove: jest.fn() })),
  purchaseUpdatedListener: jest.fn(() => ({ remove: jest.fn() })),
  requestPurchase: jest.fn(),
  fetchProducts: jest.fn(async () => {
    if (mockGate) await mockGate;
    if (mockFetchShouldThrow) throw new Error('network down');
    return mockProductsResponse;
  }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-av', () => ({
  Audio: {
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false, status: 'undetermined' }),
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
    Recording: class {},
  },
}));
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(), isSpeakingAsync: jest.fn() }));
jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.0.0', applicationId: 'com.usayo.app' }));
jest.mock('lucide-react-native', () => ({ Check: () => null, RotateCw: () => null }));
jest.mock('../lib/supabase', () => ({ supabase: { functions: { invoke: jest.fn() } } }));
jest.mock('../services/subscription/QuotaTracker', () => ({
  quotaTracker: { refreshFromServer: jest.fn(), getUsage: jest.fn() },
}));

import { Platform } from 'react-native';
import UpgradeModal from '../components/UpgradeModal';

// ── react-test-renderer 최소 타입 (타입 패키지 미설치) ──
type TestInstance = {
  props: Record<string, unknown>;
  children: Array<TestInstance | string>;
  findAll(fn: (n: TestInstance) => boolean, opts?: { deep?: boolean }): TestInstance[];
};
type Tree = { root: TestInstance };
type RTR = { create(el: unknown): Tree; act(cb: () => Promise<void> | void): Promise<void> };
const TestRenderer = require('react-test-renderer') as RTR;
const act = TestRenderer.act;

const SKU_M = 'com.yusay.pro.monthly';
const SKU_A = 'com.yusay.pro.annual';

function setOS(os: 'ios' | 'android') { (Platform as unknown as { OS: string }).OS = os; }

// iOS 상품. offers로 오퍼 배열을 그대로 주입해 성격별 케이스를 만든다.
const iosProduct = (id: string, price: string, offers: unknown[]) => ({
  id, displayPrice: price, price: Number(price.replace(/[^0-9.]/g, '')), subscriptionOffers: offers,
});
const freeTrialOffer = (unit: string, value: number, count = 1) =>
  ({ type: 'introductory', paymentMode: 'free-trial', period: { unit, value }, periodCount: count });

// Android 상품. pricingPhaseList를 그대로 주입한다.
const androidProduct = (id: string, price: string, phases: unknown[][]) => ({
  id, displayPrice: price, price: Number(price.replace(/[^0-9.]/g, '')),
  subscriptionOfferDetailsAndroid: phases.map((list) => ({ pricingPhases: { pricingPhaseList: list } })),
});
const PAID_PHASE = { billingPeriod: 'P1M', priceAmountMicros: '3900000' };

async function render(): Promise<Tree> {
  let tree!: Tree;
  await act(async () => {
    tree = TestRenderer.create(
      React.createElement(UpgradeModal, {
        visible: true, gateType: 'hard', upgradeTarget: 'pro', onDismiss: () => {},
      }),
    );
  });
  return tree;
}

function textOf(inst: TestInstance | string): string {
  if (typeof inst === 'string') return inst;
  return inst.children.map(textOf).join('');
}
const screenText = (tree: Tree) => textOf(tree.root);

// 하위에 needle을 포함하는, onPress를 가진 가장 안쪽 요소(버튼) 탐색.
function pressableWith(tree: Tree, needle: string): TestInstance | undefined {
  const found = tree.root
    .findAll((n) => typeof n.props?.onPress === 'function', { deep: true })
    .filter((n) => textOf(n).includes(needle));
  return found.length ? found[found.length - 1] : undefined;
}

// 누름 + 그 결과로 생기는 상태 갱신까지 act로 감싼다.
// onPress가 async면(재시도 = loadPkgs) 반환 Promise를 await해야 이후 setState가 act 안에 든다.
async function press(node: TestInstance | undefined): Promise<void> {
  expect(node).toBeTruthy();
  await act(async () => { await (node!.props.onPress as () => unknown)(); });
}

beforeEach(() => {
  setOS('ios');
  mockFetchShouldThrow = false;
  mockGate = null;
  mockProductsResponse = [];
});

// ── 배지가 꺼져야 하는 경우 ──────────────────────────────────
// 여기 5건이 이 파일의 핵심이다. 하나라도 무너지면 존재하지 않는 무료 체험을 광고하게 된다.

describe('무료 체험 배지 — 꺼져야 하는 경우', () => {
  test('iOS 오퍼 0개 → 배지 없음, 캡션에 체험 문구 없음, 고지 4종 유지', async () => {
    mockProductsResponse = [iosProduct(SKU_M, '₩3,900', []), iosProduct(SKU_A, '₩39,000', [])];
    const all = screenText(await render());
    expect(all).not.toContain('무료 체험');
    // 체험이 빠져도 가격·주기·자동 갱신·해지 경로 4종은 반드시 남는다(애플·구글 공통 요건).
    expect(all).toContain('₩39,000/년 자동 갱신 · 스토어에서 언제든 해지');
    expect(all).toContain('Pro 시작하기');
  });

  test('iOS 유료 도입 오퍼만(pay-up-front) → 배지 없음', async () => {
    const paidIntro = { type: 'introductory', paymentMode: 'pay-up-front', period: { unit: 'month', value: 1 }, periodCount: 1 };
    mockProductsResponse = [iosProduct(SKU_M, '₩3,900', [paidIntro]), iosProduct(SKU_A, '₩39,000', [paidIntro])];
    expect(screenText(await render())).not.toContain('무료 체험');
  });

  test('iOS 프로모션 오퍼만 → 배지 없음', async () => {
    const promo = { type: 'promotional', paymentMode: 'free-trial', period: { unit: 'week', value: 1 }, periodCount: 1 };
    mockProductsResponse = [iosProduct(SKU_M, '₩3,900', [promo]), iosProduct(SKU_A, '₩39,000', [promo])];
    expect(screenText(await render())).not.toContain('무료 체험');
  });

  test('Android 기본 요금제만 → 배지 없음 (오퍼 개수는 1 이상이다)', async () => {
    setOS('android');
    mockProductsResponse = [
      androidProduct(SKU_M, '₩3,900', [[PAID_PHASE]]),
      androidProduct(SKU_A, '₩39,000', [[PAID_PHASE]]),
    ];
    const all = screenText(await render());
    expect(all).not.toContain('무료 체험');
    expect(all).toContain('₩39,000/년 자동 갱신');
  });

  test('Android 빈 문자열 가격 단계 → 배지 없음 (Number("") === 0 오판 회귀 방지)', async () => {
    setOS('android');
    const emptyPricePhase = { billingPeriod: 'P1W', priceAmountMicros: '' };
    mockProductsResponse = [
      androidProduct(SKU_M, '₩3,900', [[emptyPricePhase, PAID_PHASE]]),
      androidProduct(SKU_A, '₩39,000', [[emptyPricePhase, PAID_PHASE]]),
    ];
    expect(screenText(await render())).not.toContain('무료 체험');
  });
});

// ── 배지가 켜져야 하는 경우 ──────────────────────────────────

describe('무료 체험 배지 — 켜져야 하는 경우', () => {
  test('iOS introductory + free-trial → 배지 표시 + 기간 라벨 정확 + CTA/캡션 반영', async () => {
    mockProductsResponse = [
      iosProduct(SKU_M, '₩3,900', [freeTrialOffer('week', 1)]),
      iosProduct(SKU_A, '₩39,000', [freeTrialOffer('week', 1)]),
    ];
    const all = screenText(await render());
    // P1W와 P7D는 같은 '7일'로 정규화된다 — 스토어가 어느 표기를 주든 문구가 같아야 한다.
    expect(all).toContain('7일 무료 체험 가능');
    expect(all).toContain('7일 무료 체험 후 ₩39,000/년 자동 갱신 · 스토어에서 언제든 해지');
    expect(all).toContain('무료로 시작하기');
  });

  test('월/연 비대칭 오퍼 → 탭 전환 시 배지가 선택된 상품을 따라간다', async () => {
    mockProductsResponse = [
      iosProduct(SKU_M, '₩3,900', [freeTrialOffer('day', 7)]), // 월간에만 체험
      iosProduct(SKU_A, '₩39,000', []),
    ];
    const tree = await render();
    // 초기 선택은 연간 → 체험 없음
    expect(screenText(tree)).not.toContain('무료 체험');
    expect(screenText(tree)).toContain('₩39,000/년 자동 갱신');

    await press(pressableWith(tree, '월간'));

    const after = screenText(tree);
    expect(after).toContain('7일 무료 체험 가능');
    expect(after).toContain('7일 무료 체험 후 ₩3,900/월 자동 갱신 · 스토어에서 언제든 해지');
  });
});

// ── 로드 상태 ────────────────────────────────────────────────

describe('상품 로드 상태', () => {
  test('loading → CTA disabled, 금액 문자열 0건, 배지 없음', async () => {
    let release!: () => void;
    mockGate = new Promise<void>((r) => { release = r; });
    mockProductsResponse = [
      iosProduct(SKU_M, '₩3,900', [freeTrialOffer('week', 1)]),
      iosProduct(SKU_A, '₩39,000', [freeTrialOffer('week', 1)]),
    ];

    const tree = await render(); // 게이트가 안 풀렸으므로 loading 상태에서 멈춘다
    const all = screenText(tree);
    expect(all).toContain('가격 확인 중');
    expect(all).not.toContain('₩');        // 스켈레톤 — 금액 미표시
    expect(all).not.toContain('무료 체험');  // unknown이므로 숨김(있던 배지가 사라지면 안 되므로)

    const cta = pressableWith(tree, '가격 확인 중');
    expect(cta?.props.disabled).toBe(true);

    await act(async () => { release(); await Promise.resolve(); });
    mockGate = null;
  });

  test('failed → CTA disabled, 재시도 누를 수 있음, DEFAULT_PRICE 참조가 0건', async () => {
    mockFetchShouldThrow = true;
    const tree = await render();
    const all = screenText(tree);
    expect(all).toContain('가격을 불러오지 못했어요');
    // 참조가 폴백이 되살아나면 여기서 잡힌다(DEFAULT_PRICE = KR: ₩3,900 / ₩39,000).
    expect(all).not.toContain('₩3,900');
    expect(all).not.toContain('₩39,000');
    expect(all).not.toContain('무료 체험');

    const retry = pressableWith(tree, '다시 시도');
    expect(retry).toBeTruthy();
    expect(retry?.props.disabled).toBeFalsy();

    const ctaDisabled = tree.root
      .findAll((n) => typeof n.props?.onPress === 'function' && textOf(n).includes('Pro 시작하기'), { deep: true })
      .map((n) => n.props.disabled);
    expect(ctaDisabled).toContain(true);

    // 복구 경로 — 응답이 정상으로 돌아오면 재시도로 회복된다.
    mockFetchShouldThrow = false;
    mockProductsResponse = [
      iosProduct(SKU_M, '₩3,900', [freeTrialOffer('week', 1)]),
      iosProduct(SKU_A, '₩39,000', [freeTrialOffer('week', 1)]),
    ];
    await press(retry);

    const after = screenText(tree);
    expect(after).not.toContain('가격을 불러오지 못했어요');
    expect(after).toContain('₩39,000');
    expect(after).toContain('7일 무료 체험 가능');
  });
});
