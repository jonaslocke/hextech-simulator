"use client";

import { createContext, type ReactNode, useContext } from "react";

const ReportCardSelectionContext = createContext<{
  isReportMode: boolean;
  selectedCardInstanceIds: ReadonlySet<string> | null;
}>({
  isReportMode: false,
  selectedCardInstanceIds: null,
});

export function ReportCardSelectionProvider({
  children,
  isReportMode,
  selectedCardInstanceIds,
}: {
  children: ReactNode;
  isReportMode: boolean;
  selectedCardInstanceIds: ReadonlySet<string> | null;
}) {
  return (
    <ReportCardSelectionContext.Provider
      value={{ isReportMode, selectedCardInstanceIds }}
    >
      {children}
    </ReportCardSelectionContext.Provider>
  );
}

export function useReportCardSelection() {
  return useContext(ReportCardSelectionContext);
}
