import type { Card } from "../catalog";

export function deriveCardCode(publicCode: string): string {
  if (publicCode.length < 7) {
    throw new Error(`public_code is too short to derive card code: ${publicCode}`);
  }

  return publicCode.slice(0, 7);
}

export function deriveCardCodeFromCard(card: Pick<Card, "public_code">): string {
  return deriveCardCode(card.public_code);
}

export function readSetCodeFromCards(cards: Card[]): string {
  const setCodes = [...new Set(cards.map((card) => card.set.set_id))];

  if (setCodes.length === 0) {
    return "unknown";
  }

  if (setCodes.length === 1) {
    return setCodes[0]!;
  }

  return "mixed";
}

