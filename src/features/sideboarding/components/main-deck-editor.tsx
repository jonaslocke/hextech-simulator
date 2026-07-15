import type { SideboardingDraftAction } from "../sideboarding-draft-reducer";
import type {
  SideboardingCardGroup,
  SideboardingViewModel,
} from "../sideboarding-view-model";
import type { SideboardingEditorMode } from "../sideboarding-types";
import { CardGrid } from "./card-grid";
import { ChosenChampionEntry } from "./chosen-champion-entry";
import { CompactCardList } from "./compact-card-list";

export function MainDeckEditor({
  disabled,
  groups,
  mode,
  onDispatch,
  onInspect,
  viewModel,
}: {
  disabled: boolean;
  groups: SideboardingCardGroup[];
  mode: SideboardingEditorMode;
  onDispatch: (action: SideboardingDraftAction) => void;
  onInspect: (registeredCardId: string) => void;
  viewModel: SideboardingViewModel;
}) {
  return (
    <section className="flex min-h-0 flex-col rounded-md border border-white/10 bg-slate-950/75">
      <header className="flex items-center justify-between border-b border-white/10 px-2.5 py-1.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Main Deck</h2>
          <p className="text-xs text-slate-500">
            {viewModel.counts.mainDeck} editable cards
          </p>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "compact" ? (
          <>
            <ChosenChampionEntry
              mode={mode}
              onInspect={onInspect}
              viewModel={viewModel}
            />
            <CompactCardList
              disabled={disabled}
              groups={groups}
              onDispatch={onDispatch}
              onInspect={onInspect}
              source="mainDeck"
              viewModel={viewModel}
            />
          </>
        ) : (
          <CardGrid
            disabled={disabled}
            groups={groups}
            leadingItem={
              <ChosenChampionEntry
                mode={mode}
                onInspect={onInspect}
                viewModel={viewModel}
              />
            }
            onDispatch={onDispatch}
            onInspect={onInspect}
            source="mainDeck"
            viewModel={viewModel}
          />
        )}
      </div>
    </section>
  );
}
