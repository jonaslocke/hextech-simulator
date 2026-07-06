export const CARD_HEIGHT_BY_SIZE = {
  sm: { minimum: 76, viewportRatio: 0.0667, maximum: 96 },
  md: { minimum: 88, viewportRatio: 0.0834, maximum: 120 },
  lg: { minimum: 108, viewportRatio: 0.1, maximum: 144 },
  xl: { minimum: 132, viewportRatio: 0.1223, maximum: 176 },
} as const;

export type ResponsiveCardSize = keyof typeof CARD_HEIGHT_BY_SIZE;

export function responsiveCardHeight(
  size: ResponsiveCardSize,
  viewportHeight: number,
): number {
  const config = CARD_HEIGHT_BY_SIZE[size];
  return Math.min(
    config.maximum,
    Math.max(config.minimum, viewportHeight * config.viewportRatio),
  );
}
