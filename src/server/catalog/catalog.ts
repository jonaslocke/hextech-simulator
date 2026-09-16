import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fixedMvpCards } from "./fixed-mvp-cards.generated";
import { cardSetFileSchema, type Card } from "./schemas";

const FIXED_MVP_CATALOG_SOURCE = "fixed-mvp-cards.generated.ts";

export type CardCatalog = {
  cards: Card[];
  byName: Map<string, Card>;
  /** Explicit maintained printing selection, separate from a lookup index. */
  canonicalByName?: Map<string, Card>;
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
    canonicalByName: byName,
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

/** Source identity evidence for arbitrary deck input; this does not assert runtime readiness. */
export async function loadSourceCardCatalog(): Promise<CardCatalog> {
  const fixed = await loadCardCatalog();
  const directory = path.join(process.cwd(), "data", "sets");
  const setFiles = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort();
  const sourceCards = (await Promise.all(setFiles.map(async (filename) =>
    cardSetFileSchema.parse(JSON.parse(await readFile(path.join(directory, filename), "utf8"))),
  ))).flat();
  // Preserve maintained printing identity while reading the current source
  // record, so stale generated text cannot hide a canonical freshness failure.
  const sourceByCode = new Map(sourceCards.map((card) => [card.public_code, card]));
  const maintainedCards = fixed.cards.map((card) => sourceByCode.get(card.public_code) ?? card);
  const canonicalByName = new Map(maintainedCards.map((card) => [card.name, card]));
  const cards = [...maintainedCards, ...sourceCards.filter((card) => !fixed.byPublicCode.has(card.public_code))];
  const byName = new Map(canonicalByName);
  for (const card of cards) if (!byName.has(card.name)) byName.set(card.name, card);
  return {
    cards,
    byName,
    byPublicCode: new Map(cards.map((card) => [card.public_code, card])),
    canonicalByName,
    setFiles,
    versionHash: createHash("sha256").update(JSON.stringify(cards)).digest("hex"),
  };
}
