import type { Card } from "../catalog";

export function deriveCardCode(publicCode: string): string {
  const match = publicCode.match(
    /^([A-Z0-9]+-(?:\d{3}|[A-Z]+\d{1,3}))/i,
  );

  if (!match) {
    throw new Error(`Unable to derive card code from public code: ${publicCode}`);
  }

  return match[1]!.toUpperCase();
}

export function deriveCardCodeFromCard(card: Card): string {
  return deriveCardCode(card.public_code);
}
