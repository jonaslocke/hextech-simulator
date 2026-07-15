import type { CSSProperties, ReactNode } from "react";
import type { SideboardingDraftAction } from "../sideboarding-draft-reducer";
import type { SideboardingEditorMode } from "../sideboarding-types";
import type { SideboardingViewModel } from "../sideboarding-view-model";
import { CardGrid } from "./card-grid";
import { ChosenChampionEntry } from "./chosen-champion-entry";
import { EditorToolbar } from "./editor-toolbar";
import { IndividualCardGrid } from "./individual-card-grid";
import { MainDeckEditor } from "./main-deck-editor";
import { SideboardEditor } from "./sideboard-editor";

const CARD_WORKSPACE_STYLE = {
  "--sideboarding-card-width":
    "clamp(4.5rem, min(calc((100cqw - 4.5rem) * 0.125), calc((100dvh - 19rem) * 0.117647)), 7.25rem)",
} as CSSProperties;

export function SideboardingEditorWorkspace({
  disabled,
  mode,
  onDispatch,
  onInspect,
  onModeChange,
  viewModel,
}: {
  disabled: boolean;
  mode: SideboardingEditorMode;
  onDispatch: (action: SideboardingDraftAction) => void;
  onInspect: (registeredCardId: string) => void;
  onModeChange: (mode: SideboardingEditorMode) => void;
  viewModel: SideboardingViewModel;
}) {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-white/10 bg-slate-950/60">
      <EditorToolbar mode={mode} onModeChange={onModeChange} />

      {mode === "compact" ? (
        <CompactWorkspace
          disabled={disabled}
          onDispatch={onDispatch}
          onInspect={onInspect}
          viewModel={viewModel}
        />
      ) : (
        <CardWorkspace
          disabled={disabled}
          mode={mode}
          onDispatch={onDispatch}
          onInspect={onInspect}
          viewModel={viewModel}
        />
      )}
    </section>
  );
}

function CompactWorkspace({
  disabled,
  onDispatch,
  onInspect,
  viewModel,
}: {
  disabled: boolean;
  onDispatch: (action: SideboardingDraftAction) => void;
  onInspect: (registeredCardId: string) => void;
  viewModel: SideboardingViewModel;
}) {
  return (
    <div className="grid min-h-0 flex-1 gap-2.5 p-2.5 md:grid-cols-[minmax(0,1.42fr)_minmax(15rem,0.58fr)]">
      <MainDeckEditor
        disabled={disabled}
        groups={viewModel.mainDeckGroups}
        mode="compact"
        onDispatch={onDispatch}
        onInspect={onInspect}
        viewModel={viewModel}
      />
      <SideboardEditor
        disabled={disabled}
        groups={viewModel.sideboardGroups}
        mode="compact"
        onDispatch={onDispatch}
        onInspect={onInspect}
        viewModel={viewModel}
      />
    </div>
  );
}

function CardWorkspace({
  disabled,
  mode,
  onDispatch,
  onInspect,
  viewModel,
}: {
  disabled: boolean;
  mode: Exclude<SideboardingEditorMode, "compact">;
  onDispatch: (action: SideboardingDraftAction) => void;
  onInspect: (registeredCardId: string) => void;
  viewModel: SideboardingViewModel;
}) {
  return (
    <div
      className="min-h-0 flex-1 overflow-hidden p-2.5 [container-type:inline-size]"
      style={CARD_WORKSPACE_STYLE}
    >
      <CardWorkspaceSection
        countLabel={`${viewModel.counts.mainDeck} editable cards`}
        title="Main Deck"
      >
        {mode === "grid" ? (
          <CardGrid
            disabled={disabled}
            groups={viewModel.mainDeckGroups}
            leadingItem={
              <ChosenChampionEntry
                mode="grid"
                onInspect={onInspect}
                viewModel={viewModel}
              />
            }
            onDispatch={onDispatch}
            onInspect={onInspect}
            source="mainDeck"
            viewModel={viewModel}
          />
        ) : (
          <IndividualCardGrid
            copies={viewModel.mainDeckCopies}
            disabled={disabled}
            leadingItem={
              <ChosenChampionEntry
                mode="allCards"
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
      </CardWorkspaceSection>

      <div className="my-2 border-t border-white/15" />

      <CardWorkspaceSection
        countLabel={`${viewModel.counts.sideboard}/8 cards`}
        title="Sideboard"
      >
        {mode === "grid" ? (
          <CardGrid
            disabled={disabled}
            groups={viewModel.sideboardGroups}
            onDispatch={onDispatch}
            onInspect={onInspect}
            source="sideboard"
            viewModel={viewModel}
          />
        ) : (
          <IndividualCardGrid
            copies={viewModel.sideboardCopies}
            disabled={disabled}
            onDispatch={onDispatch}
            onInspect={onInspect}
            source="sideboard"
            viewModel={viewModel}
          />
        )}
      </CardWorkspaceSection>
    </div>
  );
}

function CardWorkspaceSection({
  children,
  countLabel,
  title,
}: {
  children: ReactNode;
  countLabel: string;
  title: string;
}) {
  return (
    <section className="min-w-0">
      <header className="mb-1 flex items-end justify-between gap-3 px-0.5">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          <p className="text-[11px] text-slate-500">{countLabel}</p>
        </div>
      </header>
      {children}
    </section>
  );
}
