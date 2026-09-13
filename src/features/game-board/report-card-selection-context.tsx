"use client";

import { createContext, type ReactNode, useContext } from "react";

const ReportCardSelectionContext = createContext<ReadonlySet<string> | null>(null);

export function ReportCardSelectionProvider({
  children,
  selectedCardInstanceIds,
}: {
  children: ReactNode;
  selectedCardInstanceIds: ReadonlySet<string> | null;
}) {
  return (
    <ReportCardSelectionContext.Provider value={selectedCardInstanceIds}>
      {children}
    </ReportCardSelectionContext.Provider>
  );
}

export function useReportCardSelection() {
  return useContext(ReportCardSelectionContext);
}
