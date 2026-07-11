import { MoveLeft, MoveRight } from "lucide-react";
import type { SideboardingDraftAction } from "../sideboarding-draft-reducer";
import {
  isChampionUnit,
  type SideboardingCardGroup,
  type SideboardingViewModel,
} from "../sideboarding-view-model";
import { CardMetadata } from "./card-metadata";
import { ChosenChampionAction } from "./chosen-champion-action";

export function CompactCardList({
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
    <div className="divide-y divide-white/10">
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
          <div
            className="grid w-full grid-cols-[1fr_auto] items-center gap-2 px-2.5 py-1.5 text-sm transition hover:bg-white/5 focus-within:bg-white/5"
            key={`${source}:${group.canonicalName}`}
            onMouseEnter={() => onInspect(firstCopy.registeredCardId)}
          >
            <button
              className="grid min-w-0 grid-cols-[2.25rem_1fr] items-center gap-2 text-left focus:outline-none"
              disabled={disabled}
              onClick={() =>
                onDispatch({
                  type: moveAction,
                  registeredCardId: firstCopy.registeredCardId,
                })
              }
              onFocus={() => onInspect(firstCopy.registeredCardId)}
              type="button"
            >
              <span className="rounded bg-slate-900 px-2 py-1 text-center font-semibold text-cyan-100 tabular-nums">
                {group.quantity}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-100">
                  {group.card.name}
                </span>
                <CardMetadata card={group.card} />
              </span>
            </button>
            <span className="flex items-center gap-1">
              {isChampionUnit(group.card) && (
                <ChosenChampionAction
                  cardName={group.card.name}
                  disabled={disabled}
                  isCurrent={isCurrent}
                  isEligible={isEligible}
                  onSelect={() =>
                    onDispatch({
                      type: "setChosenChampion",
                      registeredCardId: firstCopy.registeredCardId,
                    })
                  }
                />
              )}
              {source === "mainDeck" ? (
                <MoveRight className="h-4 w-4 text-slate-500" />
              ) : (
                <MoveLeft className="h-4 w-4 text-slate-500" />
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
