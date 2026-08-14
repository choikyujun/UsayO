// 스토어 상품 ID.
// ⚠️ 패키지명은 com.usayo.app이지만 상품 ID는 **com.yusay 접두사를 유지**한다.
//    플레이 콘솔에 이미 등록된 값이라 변경이 불가능하다(오타 아님).
// ⚠️ 서버 supabase/functions/_shared/google-play.ts의 PRO_PRODUCT_IDS/TEAM_PRODUCT_IDS와
//    반드시 일치해야 한다. 어긋나면 "결제는 됐는데 플랜이 안 올라가는" 증상이 난다.
// teamMonthly는 인앱 구매 대상이 아니다(영업 문의 전환) — 서버 판정용으로만 존재.
export const PRODUCT_IDS = {
  proMonthly: 'com.yusay.pro.monthly',
  proAnnual: 'com.yusay.pro.annual',
  teamMonthly: 'com.yusay.team.monthly',
} as const;

// Reference prices per region (displayed as fallback when store price unavailable)
export const REGIONAL_PRICES: Record<string, { monthly: string; annual: string; team: string }> = {
  KR: { monthly: '₩3,900', annual: '₩39,000', team: '₩9,900' },
  US: { monthly: '$3.99',   annual: '$39.99',   team: '$9.99'  },
  JP: { monthly: '¥480',    annual: '¥4,800',   team: '¥1,200' },
  SG: { monthly: 'S$2.99',  annual: 'S$29.99',  team: 'S$7.99' },
  MY: { monthly: 'RM8.90',  annual: 'RM89',     team: 'RM22'   },
  TH: { monthly: '฿69',     annual: '฿690',     team: '฿179'   },
  PH: { monthly: '₱119',    annual: '₱1,190',   team: '₱299'   },
  ID: { monthly: 'Rp29,000', annual: 'Rp290,000', team: 'Rp75,000' },
  VN: { monthly: '₫49,000', annual: '₫490,000', team: '₫129,000' },
};

export const DEFAULT_PRICE = REGIONAL_PRICES.KR;
