import { Crown } from "lucide-react";
import { Button } from "@/shared/components/button";
import type { SideboardingDraftAction } from "../sideboarding-draft-reducer";
import {
  isChampionUnit,
  type SideboardingCardGroup,
} from "../sideboarding-view-model";
import { CardFace } from "./card-face";

export function CardGrid({
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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3 p-3">
      {groups.map((group) => {
        const firstCopy = group.copies[0]!;
        const moveAction =
          source === "mainDeck"
            ? "moveMainDeckCopyToSideboard"
            : "moveSideboardCopyToMainDeck";

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
              <Button
                aria-label={`Set ${group.card.name} as Chosen Champion`}
                className="absolute bottom-1 right-1"
                disabled={disabled}
                onClick={() =>
                  onDispatch({
                    type: "setChosenChampion",
                    registeredCardId: firstCopy.registeredCardId,
                  })
                }
                size="icon-xs"
                type="button"
                variant="secondary"
              >
                <Crown className="h-3 w-3" />
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
