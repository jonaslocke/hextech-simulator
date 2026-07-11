import type { SideboardingDraftAction } from "../sideboarding-draft-reducer";
import type {
  SideboardingCardCopyView,
  SideboardingViewModel,
} from "../sideboarding-view-model";
import { isChampionUnit } from "../sideboarding-view-model";
import { CardFace } from "./card-face";
import { ChosenChampionAction } from "./chosen-champion-action";

export function IndividualCardGrid({
  copies,
  disabled,
  onDispatch,
  onInspect,
  source,
  viewModel,
}: {
  copies: SideboardingCardCopyView[];
  disabled: boolean;
  onDispatch: (action: SideboardingDraftAction) => void;
  onInspect: (registeredCardId: string) => void;
  source: "mainDeck" | "sideboard";
  viewModel: SideboardingViewModel;
}) {
  const moveAction =
    source === "mainDeck"
      ? "moveMainDeckCopyToSideboard"
      : "moveSideboardCopyToMainDeck";

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(5.6rem,1fr))] gap-2.5 p-2.5">
      {copies.map(({ card, copy }) => {
        const isCurrent =
          viewModel.chosenChampionRegisteredCardId === copy.registeredCardId;
        const isEligible =
          viewModel.eligibleChosenChampionRegisteredCardIds.has(
            copy.registeredCardId,
          );

        return (
          <div className="relative" key={`${source}:${copy.registeredCardId}`}>
            <button
              className="block w-full rounded-md text-left transition hover:scale-[1.015] focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
              disabled={disabled}
              onClick={() =>
                onDispatch({
                  type: moveAction,
                  registeredCardId: copy.registeredCardId,
                })
              }
              onFocus={() => onInspect(copy.registeredCardId)}
              onMouseEnter={() => onInspect(copy.registeredCardId)}
              type="button"
            >
              <CardFace card={card} />
            </button>
            {isChampionUnit(card) && (
              <ChosenChampionAction
                cardName={card.name}
                className="absolute right-1 top-1"
                disabled={disabled}
                isCurrent={isCurrent}
                isEligible={isEligible}
                onSelect={() =>
                  onDispatch({
                    type: "setChosenChampion",
                    registeredCardId: copy.registeredCardId,
                  })
                }
                visibleOnArtwork
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
