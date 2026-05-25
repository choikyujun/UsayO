import { useColorScheme } from 'react-native';
import { ACCENT_PALETTES, useTheme } from '../contexts/ThemeContext';

// ── 브랜드 상수 (모드 무관) ───────────────────────────────────────────
export const Colors = {
  // Brand
  primary:    '#534AB7',
  deep:       '#26215C',
  accent:     '#AFA9EC',
  background: '#E8E6FF',
  success:    '#1D9E75',
  warning:    '#EF9F27',
  danger:     '#D85A30',
  error:      '#E24B4A',
  // Text (dark theme defaults)
  textPrimary:   '#FFFFFF',
  textSecondary: '#E8E6FF',
  textTertiary:  '#9B97CC',
  textMuted:     '#4A4670',
  // Neutrals
  white: '#FFFFFF',
  text:  '#1A1A2E',
  // Dark surfaces (kept for legacy component fallbacks)
  darkBg:     '#0E0C1F',
  darkCard:   '#1C1A35',
  darkCard2:  '#252348',
  darkBorder: '#2E2B52',
  darkNav:    '#09081A',
} as const;

// ── 테마 타입 ─────────────────────────────────────────────────────────
export interface AppTheme {
  bg:            string;
  card:          string;
  card2:         string;
  border:        string;
  nav:           string;
  textPrimary:   string;
  textSecondary: string;
  textTertiary:  string;
  textMuted:     string;
  accent:        string;
  primary:       string;
  success:       string;
  warning:       string;
  error:         string;
  statusBar:     'light' | 'dark';
  // Day-view time-zone hints
  lunchHint:     string;
  dinnerHint:    string;
}

// ── 모드별 텍스트 + 상태색 (테마 독립) ──────────────────────────────
const darkText = {
  textPrimary:   '#FFFFFF',
  textSecondary: '#D1D5DB',
  textTertiary:  '#9CA3AF',
  textMuted:     '#6B7280',
  success:       '#1D9E75',
  warning:       '#EF9F27',
  error:         '#E24B4A',
  statusBar:     'light' as const,
};

const lightText = {
  textPrimary:   '#111827',
  textSecondary: '#374151',
  textTertiary:  '#6B7280',
  textMuted:     '#9CA3AF',
  success:       '#1D9E75',
  warning:       '#D97706',
  error:         '#DC2626',
  statusBar:     'dark' as const,
};

// ── 시스템 모드 + 사용자 선택 테마 → AppTheme 반환 ───────────────────
export function useColors(): AppTheme {
  const scheme = useColorScheme();
  const { accentId } = useTheme();
  const isDark = scheme === 'dark';
  const palette = ACCENT_PALETTES.find(p => p.id === accentId) ?? ACCENT_PALETTES[0];
  const v = isDark ? palette.dark : palette.light;
  const t = isDark ? darkText : lightText;
  return {
    bg: v.bg, card: v.card, card2: v.card2, border: v.border, nav: v.nav,
    primary: v.primary, accent: v.accent,
    ...t,
    lunchHint:  isDark ? 'rgba(251,191,36,0.10)' : 'rgba(251,191,36,0.14)',
    dinnerHint: isDark ? 'rgba(139,92,246,0.09)' : 'rgba(139,92,246,0.13)',
  };
}

export type ColorKey = keyof typeof Colors;
