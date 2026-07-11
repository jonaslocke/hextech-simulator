import type { DeckConfiguration, SideboardingSessionInput } from "@/shared/game";
import type { DeckReconfigurationIntent } from "./sideboarding-types";

export function buildDeckReconfigurationIntent(input: {
  draft: DeckConfiguration;
  session: SideboardingSessionInput;
}): DeckReconfigurationIntent {
  return {
    kind: "submitDeckReconfiguration",
    matchId: input.session.matchId,
    expectedIntermissionVersion: input.session.expectedIntermissionVersion,
    configuration: {
      chosenChampionRegisteredCardId: input.draft.chosenChampionRegisteredCardId,
      mainDeckRegisteredCardIds: [...input.draft.mainDeckRegisteredCardIds],
      sideboardRegisteredCardIds: [...input.draft.sideboardRegisteredCardIds],
    },
  };
}
