"use client";

import { ChoiceDialog } from "@/shared/components/choice-dialog";
import type { OptionDecisionRequest } from "./player-decision-types";

export function OptionDecisionPrompt({
  decision,
  onCancel,
  onSubmit,
}: {
  decision: OptionDecisionRequest;
  onCancel?: () => void;
  onSubmit: (selectedIds: string[]) => void;
}) {
  return (
    <ChoiceDialog
      confirmLabel={decision.confirmLabel}
      description={decision.description}
      isOpen
      onCancel={decision.canCancel ? onCancel : undefined}
      onConfirm={onSubmit}
      options={decision.options}
      selectionMode="single"
      title={decision.title}
    />
  );
}
