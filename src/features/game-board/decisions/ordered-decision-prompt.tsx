"use client";

import type { ReactNode } from "react";
import { ReportCardChoiceDialog } from "../components/report-card-choice-dialog";
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
    <ReportCardChoiceDialog
      confirmLabel={decision.confirmLabel}
      decisionKey={decision.decisionKey}
      description={decision.description}
      headerAction={headerAction}
      interactionSuspended={interactionSuspended}
      isOpen
      isSubmitting={isSubmitting}
      isVisible={isVisible}
      onConfirm={onSubmit}
      options={decision.options}
      selectionMode="ordered"
      title={decision.title}
    />
  );
}
