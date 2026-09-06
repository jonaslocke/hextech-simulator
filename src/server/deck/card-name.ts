import type { Card, CardCatalog } from "@/server/catalog";

/** Resolves the established Master Yi starter-deck export spelling. */
export function resolveDeckCard(
  catalog: Pick<CardCatalog, "byName">,
  deckName: string,
): Card | undefined {
  return catalog.byName.get(deckName) ??
    [...catalog.byName.values()].find((card) =>
      deckCardNameAliases(card).includes(deckName),
    );
}

// this should not be resolved like this, bottom of line this is a data inconsistency, code should not be created to fix data inconsistency, 
// the appropriate fix would be fix the deck files, since the card found on there is not the right one based on real card names on corpus

export function deckCardNameAliases(card: Card): string[] {
  return card.name.startsWith("Master Yi, ")
    ? [card.name.replace(/^Master Yi, /, "Yi, ")]
    : [];
}

export function deckCardNameLookupCandidates(name: string): string[] {
  return [
    name,
    ...(name.startsWith("Yi, ")
      ? [name.replace(/^Yi, /, "Master Yi, ")]
      : []),
  ];
}
