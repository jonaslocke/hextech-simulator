import { Crown, MoveLeft, MoveRight } from "lucide-react";
import { Button } from "@/shared/components/button";
import type { SideboardingDraftAction } from "../sideboarding-draft-reducer";
import {
  isChampionUnit,
  type SideboardingCardGroup,
} from "../sideboarding-view-model";

export function CompactCardList({
  disabled,
  groups,
  onDispatch,
  onInspect,
  source,
}: {
  disabled: boolean;
  groups: SideboardingCardGroup[];
  onDispatch: (action: SideboardingDraftAction) => void;
  onInspect: (registeredCardId: string) => void;
  source: "mainDeck" | "sideboard";
}) {
  return (
    <div className="divide-y divide-white/10">
      {groups.map((group) => {
        const firstCopy = group.copies[0]!;
        const moveAction =
          source === "mainDeck"
            ? "moveMainDeckCopyToSideboard"
            : "moveSideboardCopyToMainDeck";

        return (
          <div
            className="grid w-full grid-cols-[1fr_auto] items-center gap-2 px-3 py-2 text-sm transition hover:bg-white/5 focus-within:bg-white/5"
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
                <span className="mt-0.5 block truncate text-slate-500 text-xs">
                  {metadata(group)}
                </span>
              </span>
            </button>
            <span className="flex items-center gap-1">
              {isChampionUnit(group.card) && (
                <Button
                  aria-label={`Set ${group.card.name} as Chosen Champion`}
                  disabled={disabled}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDispatch({
                      type: "setChosenChampion",
                      registeredCardId: firstCopy.registeredCardId,
                    });
                  }}
                  size="icon-xs"
                  type="button"
                  variant="secondary"
                >
                  <Crown className="h-3 w-3" />
                </Button>
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

function metadata(group: SideboardingCardGroup) {
  const values = [
    group.card.type,
    group.card.supertype,
    group.card.energy === null ? null : `${group.card.energy} energy`,
    group.card.domains.join("/"),
  ].filter(Boolean);

  return values.join(" / ");
}
