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
    <section className="shrink-0 border-t border-white/10 p-2.5">
      <div className="grid grid-cols-2 gap-1.5 text-[11px]">
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

      <div className="mt-2.5 rounded-md border border-white/10 bg-white/[0.03] p-2">
        <ValidationSummary validation={validation} />
      </div>

      <div className="mt-2.5 grid gap-2">
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
    </section>
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
    <div
      className={[
        "rounded-md border px-2 py-1.5",
        invalid
          ? "border-amber-300/40 bg-amber-300/10"
          : "border-white/10 bg-white/5",
      ].join(" ")}
    >
      <div className={invalid ? "text-amber-100/80" : "text-slate-500"}>
        {label}
      </div>
      <div
        className={[
          "font-semibold tabular-nums",
          invalid ? "text-amber-100" : "text-cyan-100",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}
