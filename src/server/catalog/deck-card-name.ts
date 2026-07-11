import type { Card } from "./schemas";

type DeckNameCard = Pick<Card, "name" | "tags" | "classification">;

export function getDeckCardNameAliases(card: DeckNameCard): string[] {
  if (card.classification.type !== "Legend") {
    return [card.name];
  }

  const championTag = card.tags[0]?.trim();
  if (!championTag) {
    return [card.name];
  }

  return [card.name, `${championTag} - ${card.name}`];
}

export function getDeckCardLookupCandidates(name: string): string[] {
  const legendSourceName = getLegendSourceNameFromDeckName(name);

  return legendSourceName ? [name, legendSourceName] : [name];
}

function getLegendSourceNameFromDeckName(name: string): string | null {
  const separator = " - ";
  const separatorIndex = name.indexOf(separator);
  if (separatorIndex <= 0) {
    return null;
  }

  const sourceName = name.slice(separatorIndex + separator.length).trim();
  return sourceName || null;
}
