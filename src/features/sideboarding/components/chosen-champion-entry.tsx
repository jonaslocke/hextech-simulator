import { Crown } from "lucide-react";
import type { SideboardingEditorMode } from "../sideboarding-types";
import type { SideboardingViewModel } from "../sideboarding-view-model";
import { CardFace } from "./card-face";
import { CardMetadata } from "./card-metadata";

export function ChosenChampionEntry({
  mode,
  onInspect,
  viewModel,
}: {
  mode: SideboardingEditorMode;
  onInspect: (registeredCardId: string) => void;
  viewModel: SideboardingViewModel;
}) {
  const card = viewModel.chosenChampion;
  if (!card) return null;

  if (mode === "compact") {
    return (
      <button
        className="grid w-full grid-cols-[2.25rem_1fr_auto] items-center gap-2 border-b border-amber-300/30 bg-amber-300/5 px-2.5 py-1.5 text-left transition hover:bg-amber-300/10 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-300/40"
        onClick={() => onInspect(viewModel.chosenChampionRegisteredCardId)}
        onFocus={() => onInspect(viewModel.chosenChampionRegisteredCardId)}
        onMouseEnter={() => onInspect(viewModel.chosenChampionRegisteredCardId)}
        type="button"
      >
        <span className="rounded bg-amber-300/15 px-2 py-1 text-center font-semibold tabular-nums text-amber-100">
          1
        </span>
        <span className="min-w-0">
          <span className="block truncate font-medium text-slate-100">
            {card.name}
          </span>
          <CardMetadata card={card} />
        </span>
        <span className="inline-flex items-center gap-1.5 rounded border border-amber-300/35 bg-amber-300/10 px-2 py-1 text-[10px] font-semibold text-amber-100">
          <Crown className="h-3 w-3" fill="currentColor" />
          Chosen Champion
          {viewModel.changedChosenChampion && (
            <span className="text-amber-200/75">Changed</span>
          )}
        </span>
      </button>
    );
  }

  return (
    <div className="relative min-w-0 overflow-hidden rounded-md border-2 border-amber-300/70 bg-amber-300/5 shadow-[0_0_0_1px_rgba(252,211,77,0.18)]">
      <button
        className="block w-full text-left transition hover:scale-[1.015] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-300/55"
        onClick={() => onInspect(viewModel.chosenChampionRegisteredCardId)}
        onFocus={() => onInspect(viewModel.chosenChampionRegisteredCardId)}
        onMouseEnter={() => onInspect(viewModel.chosenChampionRegisteredCardId)}
        type="button"
      >
        <CardFace card={card} />
      </button>

      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex min-h-5 items-center justify-center gap-1 bg-amber-300/95 px-1 py-1 text-center text-[8px] font-semibold leading-none text-slate-950 shadow-[0_-1px_4px_rgba(0,0,0,0.35)]">
        <Crown className="h-2.5 w-2.5 shrink-0" fill="currentColor" />
        <span className="truncate">Chosen Champion</span>
      </span>

      {viewModel.changedChosenChampion && (
        <span className="pointer-events-none absolute left-1 top-1 rounded bg-slate-950/90 px-1.5 py-0.5 text-[9px] font-semibold text-amber-100">
          Changed
        </span>
      )}
    </div>
  );
}
