import { createHash } from "node:crypto";
import { fixedMvpCards } from "./fixed-mvp-cards.generated";
import type { Card } from "./schemas";
import {
  deriveCanonicalPrintingGroupKey,
  deriveCardCodeFromCard,
} from "../card-catalog/identity";
import { resolveCanonicalPrintingGroups } from "../card-catalog/printing-selection";

const FIXED_MVP_CATALOG_SOURCE = "fixed-mvp-cards.generated.ts";

export type CardCatalog = {
  cards: Card[];
  byName: Map<string, Card>;
  byCardCode: Map<string, Card>;
  byPublicCode: Map<string, Card>;
  setFiles: string[];
  versionHash: string;
};

export async function loadCardCatalog(): Promise<CardCatalog> {
  const selection = resolveCanonicalPrintingGroups(
    fixedMvpCards,
    deriveCanonicalPrintingGroupKey,
  );
  if (selection.unresolved.length > 0) {
    throw new Error(
      selection.unresolved.map((group) => group.reason).join("; "),
    );
  }
  const cards = selection.selected;
  const hash = createHash("sha256");
  hash.update(FIXED_MVP_CATALOG_SOURCE);
  hash.update(JSON.stringify(cards));

  const byName = new Map<string, Card>();
  const byCardCode = new Map<string, Card>();
  const byPublicCode = new Map<string, Card>();

  for (const card of cards) {
    if (!byName.has(card.name)) {
      byName.set(card.name, card);
    }

    const cardCode = deriveCardCodeFromCard(card);
    if (byCardCode.has(cardCode)) {
      throw new Error(`Duplicate canonical gameplay identity: ${cardCode}.`);
    }
    byCardCode.set(cardCode, card);
    if (byPublicCode.has(card.public_code)) {
      throw new Error(`Duplicate canonical public code: ${card.public_code}.`);
    }
    byPublicCode.set(card.public_code, card);
  }

  return {
    cards,
    byName,
    byCardCode,
    byPublicCode,
    setFiles: [FIXED_MVP_CATALOG_SOURCE],
    versionHash: hash.digest("hex")
  };
}

export function requireCardByCode(catalog: CardCatalog, cardCode: string): Card {
  const card = catalog.byCardCode.get(cardCode.toUpperCase());
  if (!card) throw new Error(`Unknown card code: ${cardCode}`);
  return card;
}

export function requireCardByName(catalog: CardCatalog, name: string): Card {
  const card = catalog.byName.get(name);

  if (!card) {
    throw new Error(`Unknown card: ${name}`);
  }

  return card;
}
