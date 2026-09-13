"use client";

import type { ReactNode } from "react";
import { ReportCardChoiceDialog } from "../components/report-card-choice-dialog";
import type { OptionDecisionRequest } from "./player-decision-types";

export function OptionDecisionPrompt({
  decision,
  headerAction,
  interactionSuspended,
  isSubmitting,
  isVisible,
  onCancel,
  onSubmit,
}: {
  decision: OptionDecisionRequest;
  headerAction?: ReactNode;
  interactionSuspended: boolean;
  isSubmitting: boolean;
  isVisible: boolean;
  onCancel?: () => void;
  onSubmit: (selectedIds: string[]) => void;
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
      onCancel={decision.canCancel ? onCancel : undefined}
      onConfirm={onSubmit}
      options={decision.options}
      selectionMode="single"
      title={decision.title}
    />
  );
}
