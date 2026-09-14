import type { Card, ZoneKind } from "./types";

export function filterCardsForZone<T extends Pick<Card, "type">>(
  kind: ZoneKind,
  cards: readonly T[],
): T[] {
  return cards.filter((card) => isCardAllowedInZone(kind, card));
}

export function isCardAllowedInZone(
  kind: ZoneKind,
  card: Pick<Card, "type" | "supertype">,
) {
  switch (kind) {
    case "legend":
      return cardHasProjectedType(card, "Legend");
    case "champion":
      return (
        cardHasProjectedType(card, "Unit") && card.supertype === "Champion"
      );
    case "runeDeck":
      return cardHasProjectedType(card, "Rune");
    case "battlefield":
      return cardHasProjectedType(card, "Unit");
    case "hand":
    case "mainDeck":
      return ["Gear", "Spell", "Unit"].some((type) =>
        cardHasProjectedType(card, type),
      );
    case "base":
      return ["Rune", "Gear", "Unit"].some((type) =>
        cardHasProjectedType(card, type),
      );
    case "banishment":
    case "trash":
      return true;
  }
}

function cardHasProjectedType(
  card: Pick<Card, "type">,
  expectedType: string,
) {
  return card.type?.split(" / ").includes(expectedType) ?? false;
}
