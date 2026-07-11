import type { SideboardingDraftAction } from "../sideboarding-draft-reducer";
import type {
  SideboardingCardGroup,
  SideboardingViewModel,
} from "../sideboarding-view-model";
import type { SideboardingEditorMode } from "../sideboarding-types";
import { CardGrid } from "./card-grid";
import { CompactCardList } from "./compact-card-list";
import { IndividualCardGrid } from "./individual-card-grid";

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
      <header className="flex items-center justify-between border-white/10 border-b px-2.5 py-1.5">
        <div>
          <h2 className="font-semibold text-slate-100 text-sm">Main Deck</h2>
          <p className="text-slate-500 text-xs">
            {viewModel.counts.mainDeck} editable cards
          </p>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {mode === "compact" ? (
          <CompactCardList
            disabled={disabled}
            groups={groups}
            onDispatch={onDispatch}
            onInspect={onInspect}
            source="mainDeck"
            viewModel={viewModel}
          />
        ) : mode === "grid" ? (
          <CardGrid
            disabled={disabled}
            groups={groups}
            onDispatch={onDispatch}
            onInspect={onInspect}
            source="mainDeck"
            viewModel={viewModel}
          />
        ) : (
          <IndividualCardGrid
            copies={viewModel.mainDeckCopies}
            disabled={disabled}
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
