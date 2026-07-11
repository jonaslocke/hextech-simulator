import type { SideboardingDraftAction } from "../sideboarding-draft-reducer";
import {
  isChampionUnit,
  type SideboardingCardGroup,
  type SideboardingViewModel,
} from "../sideboarding-view-model";
import { CardFace } from "./card-face";
import { ChosenChampionAction } from "./chosen-champion-action";

export function CardGrid({
  disabled,
  groups,
  onDispatch,
  onInspect,
  source,
  viewModel,
}: {
  disabled: boolean;
  groups: SideboardingCardGroup[];
  onDispatch: (action: SideboardingDraftAction) => void;
  onInspect: (registeredCardId: string) => void;
  source: "mainDeck" | "sideboard";
  viewModel: SideboardingViewModel;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(5.8rem,1fr))] gap-2.5 p-2.5">
      {groups.map((group) => {
        const firstCopy = group.copies[0]!;
        const moveAction =
          source === "mainDeck"
            ? "moveMainDeckCopyToSideboard"
            : "moveSideboardCopyToMainDeck";
        const isCurrent =
          viewModel.chosenChampionRegisteredCardId ===
          firstCopy.registeredCardId;
        const isEligible =
          viewModel.eligibleChosenChampionRegisteredCardIds.has(
            firstCopy.registeredCardId,
          );

        return (
          <div className="relative" key={`${source}:${group.canonicalName}`}>
            <button
              className="block w-full rounded-md text-left transition hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-cyan-300/50"
              disabled={disabled}
              onClick={() =>
                onDispatch({
                  type: moveAction,
                  registeredCardId: firstCopy.registeredCardId,
                })
              }
              onFocus={() => onInspect(firstCopy.registeredCardId)}
              onMouseEnter={() => onInspect(firstCopy.registeredCardId)}
              type="button"
            >
              <CardFace card={group.card} />
              <span className="absolute right-1 top-1 rounded bg-slate-950/90 px-2 py-1 text-xs font-semibold text-cyan-100">
                x{group.quantity}
              </span>
            </button>
            {isChampionUnit(group.card) && (
              <ChosenChampionAction
                cardName={group.card.name}
                className="absolute right-1 top-1"
                disabled={disabled}
                isCurrent={isCurrent}
                isEligible={isEligible}
                onSelect={() =>
                  onDispatch({
                    type: "setChosenChampion",
                    registeredCardId: firstCopy.registeredCardId,
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
