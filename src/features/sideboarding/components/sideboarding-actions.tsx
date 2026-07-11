import { RotateCcw, Send } from "lucide-react";
import { GameActionButton } from "@/features/game-board/components/game-action-button";
import type { SideboardingDraftAction } from "../sideboarding-draft-reducer";
import type { SideboardingViewModel } from "../sideboarding-view-model";
import type { SideboardingValidationState } from "../use-sideboarding-validation";
import { ValidationSummary } from "./validation-summary";

export function SideboardingActions({
  disabled,
  isSubmitting,
  onDispatch,
  onSubmit,
  validation,
  viewModel,
}: {
  disabled: boolean;
  isSubmitting: boolean;
  onDispatch: (action: SideboardingDraftAction) => void;
  onSubmit: () => void | Promise<void>;
  validation: SideboardingValidationState;
  viewModel: SideboardingViewModel;
}) {
  return (
    <footer className="sticky bottom-0 z-20 border-cyan-300/20 border-t bg-slate-950/95 px-3 py-2.5 text-slate-100 backdrop-blur-xl">
      <div className="grid items-center gap-3 lg:grid-cols-[auto_1fr_auto]">
        <div className="flex flex-wrap gap-2 text-xs">
          <Count
            invalid={viewModel.counts.active !== 40}
            label="Active Deck"
            value={`${viewModel.counts.active}/40`}
          />
          <Count
            invalid={viewModel.counts.mainDeck !== 39}
            label="Main Deck"
            value={String(viewModel.counts.mainDeck)}
          />
          <Count
            invalid={viewModel.counts.chosenChampion !== 1}
            label="Chosen Champion"
            value={String(viewModel.counts.chosenChampion)}
          />
          <Count
            invalid={viewModel.counts.sideboard > 8}
            label="Sideboard"
            value={`${viewModel.counts.sideboard}/8`}
          />
        </div>
        <ValidationSummary validation={validation} />
        <div className="grid gap-2 sm:grid-cols-2">
          <GameActionButton
            actionSlot="secondary"
            disabled={disabled}
            isBusy={isSubmitting}
            onAction={() => onDispatch({ type: "resetToRegisteredDeck" })}
            showKeybind={false}
            variant="secondary"
          >
            <span className="inline-flex items-center gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset to registered deck
            </span>
          </GameActionButton>
          <GameActionButton
            actionSlot="primary"
            disabled={disabled || !validation.isLatestLegal}
            isBusy={isSubmitting}
            onAction={onSubmit}
            variant="default"
          >
            <span className="inline-flex items-center gap-2">
              <Send className="h-4 w-4" />
              {viewModel.hasDraftChanges
                ? "Submit sideboard"
                : "Submit no changes"}
            </span>
          </GameActionButton>
        </div>
      </div>
    </footer>
  );
}

function Count({
  invalid = false,
  label,
  value,
}: {
  invalid?: boolean;
  label: string;
  value: string;
}) {
  return (
    <span
      className={[
        "rounded-md border px-2 py-1",
        invalid
          ? "border-amber-300/40 bg-amber-300/10"
          : "border-white/10 bg-white/5",
      ].join(" ")}
    >
      <span className={invalid ? "text-amber-100/80" : "text-slate-500"}>
        {label}
      </span>{" "}
      <span
        className={[
          "font-semibold tabular-nums",
          invalid ? "text-amber-100" : "text-cyan-100",
        ].join(" ")}
      >
        {value}
      </span>
    </span>
  );
}
