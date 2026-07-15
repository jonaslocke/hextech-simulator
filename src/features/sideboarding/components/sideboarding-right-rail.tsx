import type { SideboardingDraftAction } from "../sideboarding-draft-reducer";
import type { SideboardingViewModel } from "../sideboarding-view-model";
import type { SideboardingValidationState } from "../use-sideboarding-validation";
import { CardInspector } from "./card-inspector";
import { SideboardingActions } from "./sideboarding-actions";

export function SideboardingRightRail({
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
    <aside className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-white/10 bg-slate-950/75 text-slate-100">
      <CardInspector card={viewModel.selectedCard} />
      <SideboardingActions
        disabled={disabled}
        isSubmitting={isSubmitting}
        onDispatch={onDispatch}
        onSubmit={onSubmit}
        validation={validation}
        viewModel={viewModel}
      />
    </aside>
  );
}
