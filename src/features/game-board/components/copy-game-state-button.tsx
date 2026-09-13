"use client";

import { Check, Clipboard, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/shared/components/button";
import type { GameProjection } from "@/shared/game";
import { formatGameStateDiagnostic } from "../game-state-diagnostic";

export function CopyGameStateButton({
  projection,
}: {
  projection: GameProjection;
}) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function copyGameState() {
    try {
      await copyText(formatGameStateDiagnostic(projection));
      setCopied(true);
      setError(null);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setError("Could not copy game state.");
    }
  }

  return (
    <div className="relative">
      <Button
        aria-label="Copy viewer-safe game state"
        className="h-7 gap-1.5 px-2 text-xs"
        onClick={() => void copyGameState()}
        title="Copy viewer-safe game state for a defect report"
        variant="secondary"
      >
        {copied ? (
          <Check aria-hidden="true" className="size-3.5" />
        ) : (
          <Clipboard aria-hidden="true" className="size-3.5" />
        )}
        {copied ? "Copied" : "Copy state"}
      </Button>
      {error && (
        <span className="top-full right-0 z-20 absolute mt-1 whitespace-nowrap text-red-200 text-xs">
          <Copy aria-hidden="true" className="inline mr-1 size-3" />
          {error}
        </span>
      )}
    </div>
  );
}

async function copyText(value: string): Promise<void> {
  if (typeof navigator.clipboard?.writeText === "function") {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = value;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command was rejected.");
    }
  } finally {
    textArea.remove();
  }
}
