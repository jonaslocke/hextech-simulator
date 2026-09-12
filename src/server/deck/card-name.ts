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
