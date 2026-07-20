"use client";

import { Button } from "@/shared/components/button";
import { useState } from "react";

export function DebugBundleButton({
  matchId,
  playerToken,
}: {
  matchId: string;
  playerToken: string;
}) {
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">(
    "idle",
  );

  async function copyBundle() {
    setStatus("copying");
    try {
      const response = await fetch(
        `/api/matches/${matchId}/debug-bundle?playerToken=${encodeURIComponent(playerToken)}`,
      );
      const result = (await response.json()) as
        | { accepted: true; bundle: unknown }
        | { accepted: false; error: { message: string } };
      if (!result.accepted) throw new Error(result.error.message);
      await navigator.clipboard.writeText(JSON.stringify(result.bundle, null, 2));
      setStatus("copied");
      window.setTimeout(() => setStatus("idle"), 2000);
    } catch {
      setStatus("error");
      window.setTimeout(() => setStatus("idle"), 3000);
    }
  }

  return (
    <Button
      disabled={status === "copying"}
      onClick={() => void copyBundle()}
      size="sm"
      type="button"
      variant="secondary"
    >
      {status === "copying"
        ? "Preparing debug data…"
        : status === "copied"
          ? "Debug data copied"
          : status === "error"
            ? "Copy failed"
            : "Copy debug data"}
    </Button>
  );
}
