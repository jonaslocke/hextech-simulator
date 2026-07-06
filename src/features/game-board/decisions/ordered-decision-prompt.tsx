"use client";

import { ChoiceDialog } from "@/shared/components/choice-dialog";
import type { OrderedDecisionRequest } from "./player-decision-types";

export function OrderedDecisionPrompt({
  decision,
  onSubmit,
}: {
  decision: OrderedDecisionRequest;
  onSubmit: (orderedIds: string[]) => void;
}) {
  return (
    <ChoiceDialog
      confirmLabel={decision.confirmLabel}
      description={decision.description}
      isOpen
      onConfirm={onSubmit}
      options={decision.options}
      selectionMode="ordered"
      title={decision.title}
    />
  );
}
