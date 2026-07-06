"use client";

import { ChoiceDialog } from "@/shared/components/choice-dialog";
import type { OrderedDecisionRequest } from "./player-decision-types";

export function OrderedDecisionPrompt({
  decision,
  isSubmitting,
  onSubmit,
}: {
  decision: OrderedDecisionRequest;
  isSubmitting: boolean;
  onSubmit: (orderedIds: string[]) => void;
}) {
  return (
    <ChoiceDialog
      confirmLabel={decision.confirmLabel}
      decisionKey={decision.decisionKey}
      description={decision.description}
      isOpen
      isSubmitting={isSubmitting}
      onConfirm={onSubmit}
      options={decision.options}
      selectionMode="ordered"
      title={decision.title}
    />
  );
}
