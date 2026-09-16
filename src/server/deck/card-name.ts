import type { Card, CardCatalog } from "@/server/catalog";
import { deriveCardCodeFromCard } from "@/server/card-catalog/identity";
import type { DeckEntry } from "./types";

type IdentityCatalog = Pick<CardCatalog, "byName"> & Partial<Pick<CardCatalog, "cards" | "canonicalByName">>;
type DeckCardName = string | Pick<DeckEntry, "name" | "section">;

export type DeckCardIdentityResult =
  | { ok: true; card: Card }
  | { ok: false; code: "deck.unknownCard" | "deck.ambiguousCard" | "deck.invalidCardName"; message: string };

/** Exact deck-facing identity is separate from source names and canonical codes. */
export function resolveDeckCardIdentity(catalog: IdentityCatalog, input: DeckCardName): DeckCardIdentityResult {
  const name = typeof input === "string" ? input : input.name;
  const cards = catalog.cards ?? [...catalog.byName.values()];
  const championTags = verifiedChampionTags(cards);
  const candidates = cards.filter((card) => card.classification.type === "Legend"
    ? legendDeckName(card, championTags) === name
    : card.name === name || deckCardNameAliases(card).includes(name));
  if (candidates.length === 0) {
    const malformedLegend = cards.some((card) => card.classification.type === "Legend" && card.name === name);
    return {
      ok: false,
      code: malformedLegend ? "deck.invalidCardName" : "deck.unknownCard",
      message: malformedLegend
        ? `Legend "${name}" must use its exact full Champion and title name.`
        : `Unknown exact deck card name: "${name}".`,
    };
  }

  if (candidates.length === 1) return { ok: true, card: candidates[0]! };
  const maintained = candidates.filter((card) =>
    catalog.canonicalByName?.get(card.name)?.public_code === card.public_code);
  if (maintained.length === 1) return { ok: true, card: maintained[0]! };

  // Source flags identify standard representations. They do not authorize
  // deleting title qualifiers or choosing arbitrarily among different cards.
  const standard = candidates.filter((card) => !card.metadata.alternate_art &&
    !card.metadata.overnumbered && !card.metadata.signature);
  const preferred = standard.length > 0 ? standard : candidates;
  const byCode = new Map<string, Card[]>();
  for (const card of preferred) {
    const code = deriveCardCodeFromCard(card);
    byCode.set(code, [...(byCode.get(code) ?? []), card]);
  }
  if (byCode.size !== 1) {
    return { ok: false, code: "deck.ambiguousCard", message: `Deck card name "${name}" has no unambiguous canonical printing.` };
  }
  const sameCode = [...byCode.values()][0]!;
  const card = sameCode.find((candidate) => catalog.byName.get(candidate.name) === candidate) ?? sameCode[0]!;
  return { ok: true, card };
}

export function resolveDeckCard(catalog: IdentityCatalog, input: DeckCardName): Card | undefined {
  const result = resolveDeckCardIdentity(catalog, input);
  return result.ok ? result.card : undefined;
}

/** A Champion tag is verified against source Champion Unit identity, never a submitted choice. */
export function resolveLegendChampionTag(card: Card, catalog?: IdentityCatalog): string | undefined {
  return legendChampionTag(card, verifiedChampionTags(catalog?.cards ?? [...(catalog?.byName.values() ?? [])]));
}

export function deckCardNameAliases(card: Card, catalog?: IdentityCatalog): string[] {
  if (card.classification.type === "Legend") {
    const name = legendDeckName(card, verifiedChampionTags(catalog?.cards ?? [...(catalog?.byName.values() ?? [])]));
    return name ? [name] : [];
  }
  // Established exact starter export representation; it is not a fuzzy match.
  return card.name.startsWith("Master Yi, ") ? [card.name.replace(/^Master Yi, /, "Yi, ")] : [];
}

/** Retrieval candidates are deliberately broader than accepted identities. */
export function deckCardNameLookupCandidates(input: DeckCardName, catalog?: IdentityCatalog): string[] {
  const name = typeof input === "string" ? input : input.name;
  const candidates = [name];
  if (name.startsWith("Yi, ")) candidates.push(name.replace(/^Yi, /, "Master Yi, "));
  if (catalog) {
    const result = resolveDeckCardIdentity(catalog, input);
    if (result.ok) candidates.push(result.card.name);
  } else if (typeof input !== "string" && input.section === "Legend" && name.includes(", ")) {
    candidates.push(name.slice(name.indexOf(", ") + 2));
  }
  return [...new Set(candidates)];
}

function verifiedChampionTags(cards: readonly Card[]): Set<string> {
  const result = new Set<string>();
  for (const card of cards) {
    if (card.classification.type !== "Unit" || card.classification.supertype !== "Champion") continue;
    const separator = card.name.indexOf(" - ");
    const name = separator >= 0
      ? card.name.slice(0, separator).split(", ").at(-1)!
      : card.name.split(", ")[0]!;
    if (card.tags.includes(name)) result.add(name);
  }
  return result;
}

function legendChampionTag(card: Card, championTags: ReadonlySet<string>): string | undefined {
  const tags = [...new Set(card.tags)];
  const verified = tags.filter((tag) => championTags.has(tag));
  if (verified.length === 1) return verified[0];
  // A normalized, single-tag Legend is itself unambiguous source evidence.
  return tags.length === 1 ? tags[0] : undefined;
}

function legendDeckName(card: Card, championTags: ReadonlySet<string>): string | undefined {
  const champion = legendChampionTag(card, championTags);
  if (!champion) return undefined;
  const separator = card.name.indexOf(" - ");
  if (separator >= 0) {
    const sourceTags = card.name.slice(0, separator).split(", ");
    if (sourceTags.at(-1) === champion && sourceTags.every((tag) => card.tags.includes(tag))) {
      return `${champion}, ${card.name.slice(separator + 3)}`;
    }
  }
  return card.name.startsWith(`${champion}, `) ? card.name : `${champion}, ${card.name}`;
}
