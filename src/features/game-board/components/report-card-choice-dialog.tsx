"use client";

import {
  ChoiceDialog,
  type ChoiceDialogProps,
} from "@/shared/components/choice-dialog";
import { useReportCardSelection } from "../report-card-selection-context";

export function ReportCardChoiceDialog(props: ChoiceDialogProps) {
  const {
    isReportMode,
    selectedCardInstanceIds,
    toggleCardInstanceId,
  } = useReportCardSelection();

  return (
    <ChoiceDialog
      {...props}
      diagnosticCardSelection={
        isReportMode && selectedCardInstanceIds
          ? { selectedCardInstanceIds, toggleCardInstanceId }
          : undefined
      }
    />
  );
}
