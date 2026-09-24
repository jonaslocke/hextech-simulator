import { createHash } from "node:crypto";
import type { Db } from "mongodb";
import { CANONICAL_CARDS_COLLECTION, loadBehaviorDefinitions, type CanonicalCardDocument } from "../card-catalog";
import { deriveCardCodeFromCard } from "../card-catalog/identity";
import { loadCardCatalog, type CardCatalog } from "../catalog";
import { resolveDeckCardIdentity } from "../deck/card-name";
import { parseDeckList } from "../deck/parser";
import { inspectCanonicalDeckReadiness, type RuntimeBehaviorDefinition } from "./catalog-readiness";
import { deckSnapshotSchema, type DeckSnapshot } from "./schemas";

export class GameCatalogError extends Error {
  readonly code = "game_catalog_unavailable";

  constructor(public readonly issues: string[]) {
    super(`Game catalog is unavailable: ${issues.join("; ")}`);
  }
}

export async function buildDeckSnapshotFromSource(db: Db, sourceText: string): Promise<DeckSnapshot> {
  const catalog = await loadCardCatalog();
  const entries = resolveEntries(sourceText, catalog);
  const codes = [...new Set(entries.map(({ cardCode }) => cardCode))];
  const [storedCards, behaviorDefinitions] = await Promise.all([
    db.collection<CanonicalCardDocument>(CANONICAL_CARDS_COLLECTION)
      .find({ cardCode: { $in: codes } }).toArray(),
    loadBehaviorDefinitions(db),
  ]);
  return buildDeckSnapshot(sourceText, storedCards, behaviorDefinitions, catalog);
}

/** Intermediate executable snapshot construction; Deck Validation owns admission. */
export function buildDeckSnapshot(
  sourceText: string,
  canonicalCards: readonly CanonicalCardDocument[],
  behaviorDefinitions: readonly RuntimeBehaviorDefinition[],
  sourceCatalog?: Pick<CardCatalog, "cards" | "byName">,
): DeckSnapshot {
  const catalog = sourceCatalog ?? {
    cards: canonicalCards.map((document) => document.card),
    byName: new Map(canonicalCards.map((document) => [document.card.name, document.card])),
  };
  const entries = resolveEntries(sourceText, catalog);
  const codes = new Set(entries.map(({ cardCode }) => cardCode));
  const readiness = inspectCanonicalDeckReadiness({
    cards: canonicalCards.filter((document) => codes.has(document.cardCode)),
    behaviorDefinitions,
  });
  const issues = readiness.reasons.map((reason) => reason.message);
  for (const cardCode of codes) {
    if (!canonicalCards.some((document) => document.cardCode === cardCode)) {
      issues.push(`Missing approved canonical card: ${cardCode}`);
    }
  }
  if (issues.length > 0) throw new GameCatalogError(issues);
  const cards = readiness.cards;
  const digest = createHash("sha256")
    .update(JSON.stringify([...cards].sort((left, right) => left.cardCode.localeCompare(right.cardCode))))
    .digest("hex");
  return deckSnapshotSchema.parse({ sourceText, catalogDigest: digest, entries, cards });
}

function resolveEntries(sourceText: string, catalog: Pick<CardCatalog, "cards" | "byName">) {
  const issues: string[] = [];
  const entries = parseDeckList(sourceText).entries.flatMap((entry) => {
    const resolved = resolveDeckCardIdentity(catalog, entry);
    if (!resolved.ok) {
      issues.push(resolved.message);
      return [];
    }
    return [{ section: entry.section, quantity: entry.quantity, cardCode: deriveCardCodeFromCard(resolved.card) }];
  });
  if (issues.length > 0) throw new GameCatalogError(issues);
  return entries;
}
