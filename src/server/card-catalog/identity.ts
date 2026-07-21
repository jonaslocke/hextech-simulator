import type { Card } from "../catalog";

export function deriveCardCode(publicCode: string): string {
  const match = publicCode.match(/^([A-Z0-9]+-(?:\d{3}|[A-Z]\d{2}))/i);

  if (!match) {
    throw new Error(`Unable to derive card code from public code: ${publicCode}`);
  }

  return match[1]!.toUpperCase();
}

export function deriveCardCodeFromCard(card: Card): string {
  return deriveCardCode(card.public_code);
}

export function deriveCanonicalPrintingGroupKey(card: Card): string {
  const cleanName = card.metadata.clean_name ?? card.name;
  const normalizedName = cleanName
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();

  if (!normalizedName) {
    throw new Error(`Unable to derive canonical printing group for ${card.public_code}.`);
  }

  return `${card.set.set_id.toUpperCase()}:${normalizedName}`;
}
