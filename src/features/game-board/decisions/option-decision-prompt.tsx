"use client";

import { ChoiceDialog } from "@/shared/components/choice-dialog";
import type { OptionDecisionRequest } from "./player-decision-types";

export function OptionDecisionPrompt({
  decision,
  isSubmitting,
  onCancel,
  onSubmit,
}: {
  decision: OptionDecisionRequest;
  isSubmitting: boolean;
  onCancel?: () => void;
  onSubmit: (selectedIds: string[]) => void;
}) {
  return (
    <ChoiceDialog
      confirmLabel={decision.confirmLabel}
      decisionKey={decision.decisionKey}
      description={decision.description}
      isOpen
      isSubmitting={isSubmitting}
      onCancel={decision.canCancel ? onCancel : undefined}
      onConfirm={onSubmit}
      options={decision.options}
      selectionMode="single"
      title={decision.title}
    />
  );
}
