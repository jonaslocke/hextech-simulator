"use client";

import { useEffect, useRef } from "react";
import {
  appendViewerSafeProjectionHistory,
  type StructuredBugReport,
} from "@/shared/bug-report";
import type { GameProjection } from "@/shared/game";

export function useViewerSafeProjectionHistory(projection: GameProjection) {
  const historyRef = useRef<GameProjection[]>([]);

  useEffect(() => {
    historyRef.current = appendViewerSafeProjectionHistory(
      historyRef.current,
      projection,
    );
  }, [projection]);

  return historyRef;
}

export async function persistStructuredBugReport(report: StructuredBugReport): Promise<string> {
  const response = await fetch("/api/bug-reports", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(report),
  });
  const payload = (await response.json()) as {
    accepted: boolean;
    artifactPath?: string;
    error?: { message?: string };
  };
  if (!response.ok || !payload.accepted || !payload.artifactPath) {
    throw new Error(payload.error?.message ?? "Could not save the bug report artifact.");
  }
  return payload.artifactPath;
}
