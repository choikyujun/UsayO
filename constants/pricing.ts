export const PRODUCT_IDS = {
  proMonthly: 'com.yusay.pro.monthly',
  proAnnual: 'com.yusay.pro.annual',
  teamMonthly: 'com.yusay.team.monthly',
} as const;

export const ENTITLEMENTS = {
  pro: 'pro_access',
  team: 'team_access',
} as const;

export const OFFERINGS = {
  default: 'default',
  team: 'team',
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
