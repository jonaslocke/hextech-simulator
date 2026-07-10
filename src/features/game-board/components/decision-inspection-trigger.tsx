"use client";

import { Eye } from "lucide-react";
import { Button } from "@/shared/components/button";

export function DecisionInspectionTrigger({
  onInspect,
}: {
  onInspect: () => void;
}) {
  return (
    <Button
      className="h-8 shrink-0 border-cyan-300/25 bg-cyan-300/8 text-cyan-100 hover:border-cyan-200/45 hover:bg-cyan-300/14"
      onClick={onInspect}
      size="sm"
      type="button"
      variant="secondary"
    >
      <Eye aria-hidden="true" className="size-4" />
      Inspect game state
    </Button>
  );
}
