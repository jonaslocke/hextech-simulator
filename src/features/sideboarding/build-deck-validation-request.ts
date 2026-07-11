import type { DeckValidationRequest } from "@/shared/deck-validation";
import type { DeckConfiguration, SideboardingSessionInput } from "@/shared/game";

export function buildDeckValidationRequest(input: {
  draft: DeckConfiguration;
  session: SideboardingSessionInput;
}): DeckValidationRequest {
  return {
    policy: "riftbound-1v1-match",
    deck: {
      legendRegisteredCardId:
        input.session.originalRegisteredDeck.legendRegisteredCardId,
      chosenChampionRegisteredCardId: input.draft.chosenChampionRegisteredCardId,
      mainDeckRegisteredCardIds: input.draft.mainDeckRegisteredCardIds,
      runeDeckRegisteredCardIds:
        input.session.originalRegisteredDeck.runeDeckRegisteredCardIds,
      battlefieldRegisteredCardIds:
        input.session.originalRegisteredDeck.battlefieldRegisteredCardIds,
      sideboardRegisteredCardIds: input.draft.sideboardRegisteredCardIds,
    },
  };
}
