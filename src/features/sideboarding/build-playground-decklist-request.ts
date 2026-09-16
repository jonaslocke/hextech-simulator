import type {
  RegisteredDeckValidationRequest,
  TextDeckValidationRequest,
} from "@/shared/deck-validation";

/** The visual fixture has no persisted match; validate its draft through text input. */
export function buildPlaygroundDecklistRequest(
  request: RegisteredDeckValidationRequest,
  deckNamesByRegisteredId: Record<string, string>,
): TextDeckValidationRequest {
  const sections = {
    Legend: [request.deck.legendRegisteredCardId],
    Champion: [request.deck.chosenChampionRegisteredCardId],
    MainDeck: request.deck.mainDeckRegisteredCardIds,
    Sideboard: request.deck.sideboardRegisteredCardIds,
    Runes: request.deck.runeDeckRegisteredCardIds,
    Battlefields: request.deck.battlefieldRegisteredCardIds,
  };

  return {
    input: "text",
    policy: request.policy,
    sourceText: Object.entries(sections).map(([section, ids]) => {
      const quantities = new Map<string, number>();
      for (const id of ids) {
        const name = deckNamesByRegisteredId[id];
        if (!name) throw new Error("A playground copy has no deck-facing name.");
        quantities.set(name, (quantities.get(name) ?? 0) + 1);
      }
      return [
        `${section}:`,
        ...[...quantities].map(([name, quantity]) => `${quantity} ${name}`),
      ].join("\n");
    }).join("\n\n"),
  };
}
