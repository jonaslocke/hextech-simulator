"use client";

import { createContext, type ReactNode, useContext } from "react";

const ReportCardSelectionContext = createContext<{
  isReportMode: boolean;
  selectedCardInstanceIds: ReadonlySet<string> | null;
  toggleCardInstanceId: (instanceId: string) => void;
}>({
  isReportMode: false,
  selectedCardInstanceIds: null,
  toggleCardInstanceId: () => undefined,
});

export function ReportCardSelectionProvider({
  children,
  isReportMode,
  selectedCardInstanceIds,
  toggleCardInstanceId,
}: {
  children: ReactNode;
  isReportMode: boolean;
  selectedCardInstanceIds: ReadonlySet<string> | null;
  toggleCardInstanceId: (instanceId: string) => void;
}) {
  return (
    <ReportCardSelectionContext.Provider
      value={{ isReportMode, selectedCardInstanceIds, toggleCardInstanceId }}
    >
      {children}
    </ReportCardSelectionContext.Provider>
  );
}

export function useReportCardSelection() {
  return useContext(ReportCardSelectionContext);
}
