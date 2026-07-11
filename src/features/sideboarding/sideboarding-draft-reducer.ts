import type { DeckConfiguration } from "@/shared/game";

export type SideboardingDraftAction =
  | { type: "moveMainDeckCopyToSideboard"; registeredCardId: string }
  | { type: "moveSideboardCopyToMainDeck"; registeredCardId: string }
  | { type: "setChosenChampion"; registeredCardId: string }
  | { type: "resetToRegisteredDeck" }
  | { type: "replaceFromServer"; configuration: DeckConfiguration };

export function createSideboardingDraftReducer(input: {
  originalRegisteredDeck: DeckConfiguration;
}) {
  return function sideboardingDraftReducer(
    draft: DeckConfiguration,
    action: SideboardingDraftAction,
  ): DeckConfiguration {
    switch (action.type) {
      case "moveMainDeckCopyToSideboard": {
        if (!draft.mainDeckRegisteredCardIds.includes(action.registeredCardId)) {
          return draft;
        }

        return {
          ...draft,
          mainDeckRegisteredCardIds: removeOne(
            draft.mainDeckRegisteredCardIds,
            action.registeredCardId,
          ),
          sideboardRegisteredCardIds: [
            ...draft.sideboardRegisteredCardIds,
            action.registeredCardId,
          ],
        };
      }
      case "moveSideboardCopyToMainDeck": {
        if (!draft.sideboardRegisteredCardIds.includes(action.registeredCardId)) {
          return draft;
        }

        return {
          ...draft,
          mainDeckRegisteredCardIds: [
            ...draft.mainDeckRegisteredCardIds,
            action.registeredCardId,
          ],
          sideboardRegisteredCardIds: removeOne(
            draft.sideboardRegisteredCardIds,
            action.registeredCardId,
          ),
        };
      }
      case "setChosenChampion": {
        if (draft.chosenChampionRegisteredCardId === action.registeredCardId) {
          return draft;
        }

        const inMainDeck = draft.mainDeckRegisteredCardIds.includes(
          action.registeredCardId,
        );
        const inSideboard = draft.sideboardRegisteredCardIds.includes(
          action.registeredCardId,
        );
        if (!inMainDeck && !inSideboard) {
          return draft;
        }

        return {
          chosenChampionRegisteredCardId: action.registeredCardId,
          mainDeckRegisteredCardIds: inMainDeck
            ? [
                ...removeOne(
                  draft.mainDeckRegisteredCardIds,
                  action.registeredCardId,
                ),
                draft.chosenChampionRegisteredCardId,
              ]
            : draft.mainDeckRegisteredCardIds,
          sideboardRegisteredCardIds: [
            ...(inSideboard
              ? removeOne(
                  draft.sideboardRegisteredCardIds,
                  action.registeredCardId,
                )
              : draft.sideboardRegisteredCardIds),
            ...(inSideboard ? [draft.chosenChampionRegisteredCardId] : []),
          ],
        };
      }
      case "resetToRegisteredDeck":
        return {
          chosenChampionRegisteredCardId:
            input.originalRegisteredDeck.chosenChampionRegisteredCardId,
          mainDeckRegisteredCardIds: [
            ...input.originalRegisteredDeck.mainDeckRegisteredCardIds,
          ],
          sideboardRegisteredCardIds: [
            ...input.originalRegisteredDeck.sideboardRegisteredCardIds,
          ],
        };
      case "replaceFromServer":
        return {
          chosenChampionRegisteredCardId:
            action.configuration.chosenChampionRegisteredCardId,
          mainDeckRegisteredCardIds: [
            ...action.configuration.mainDeckRegisteredCardIds,
          ],
          sideboardRegisteredCardIds: [
            ...action.configuration.sideboardRegisteredCardIds,
          ],
        };
      default:
        return draft;
    }
  };
}

function removeOne(values: readonly string[], target: string): string[] {
  let removed = false;
  return values.filter((value) => {
    if (!removed && value === target) {
      removed = true;
      return false;
    }

    return true;
  });
}
