"use client";

import { CardRulesText } from "@/features/card-presentation";
import { ChoiceDialog } from "@/shared/components/choice-dialog";
import type { ReactNode } from "react";
import type { OrderedDecisionRequest } from "./player-decision-types";

export function OrderedDecisionPrompt({
  decision,
  headerAction,
  interactionSuspended,
  isSubmitting,
  isVisible,
  onSubmit,
}: {
  decision: OrderedDecisionRequest;
  headerAction?: ReactNode;
  interactionSuspended: boolean;
  isSubmitting: boolean;
  isVisible: boolean;
  onSubmit: (orderedIds: string[]) => void;
}) {
  return (
    <ChoiceDialog
      confirmLabel={decision.confirmLabel}
      decisionKey={decision.decisionKey}
      description={decision.description}
      headerAction={headerAction}
      interactionSuspended={interactionSuspended}
      isOpen
      isSubmitting={isSubmitting}
      isVisible={isVisible}
      onConfirm={onSubmit}
      options={decision.options.map((option) => ({
        ...option,
        descriptionContent: option.description ? (
          <CardRulesText text={option.description} />
        ) : undefined,
      }))}
      selectionMode="ordered"
      title={decision.title}
    />
  );
}
