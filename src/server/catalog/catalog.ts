import { createHash } from "node:crypto";
import { fixedMvpCards } from "./fixed-mvp-cards.generated";
import type { Card } from "./schemas";

const FIXED_MVP_CATALOG_SOURCE = "fixed-mvp-cards.generated.ts";

export type CardCatalog = {
  cards: Card[];
  byName: Map<string, Card>;
  byPublicCode: Map<string, Card>;
  setFiles: string[];
  versionHash: string;
};

export async function loadCardCatalog(): Promise<CardCatalog> {
  const cards = [...fixedMvpCards];
  const hash = createHash("sha256");
  hash.update(FIXED_MVP_CATALOG_SOURCE);
  hash.update(JSON.stringify(cards));

  const byName = new Map<string, Card>();
  const byPublicCode = new Map<string, Card>();

  for (const card of cards) {
    if (!byName.has(card.name)) {
      byName.set(card.name, card);
    }

    byPublicCode.set(card.public_code, card);
  }

  return {
    cards,
    byName,
    byPublicCode,
    setFiles: [FIXED_MVP_CATALOG_SOURCE],
    versionHash: hash.digest("hex")
  };
}

export function requireCardByName(catalog: CardCatalog, name: string): Card {
  const card = catalog.byName.get(name);

  if (!card) {
    throw new Error(`Unknown card: ${name}`);
  }

  return card;
}
