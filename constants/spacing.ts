export const Spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  base: 16,
  lg:   24,
  xl:   32,
  '2xl': 48,
} as const;

export type SpacingKey = keyof typeof Spacing;
