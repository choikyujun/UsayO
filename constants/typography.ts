export const FontFamily = {
  regular:  'Pretendard-Regular',
  medium:   'Pretendard-Medium',
  semiBold: 'Pretendard-SemiBold',
  bold:     'Pretendard-Bold',
} as const;

export const FontSize = {
  xs:   11,
  sm:   12,
  base: 14,
  md:   16,
  lg:   18,
  xl:   20,
  '2xl': 24,
  '3xl': 28,
  '4xl': 32,
} as const;

// Convenience map: fontWeight string → FontFamily key
// Use these in StyleSheet instead of fontWeight + system font.
export const FontWeight = {
  '400': FontFamily.regular,
  '500': FontFamily.medium,
  '600': FontFamily.semiBold,
  '700': FontFamily.bold,
} as const;
