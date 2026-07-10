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
      className="bg-cyan-300/8 hover:bg-cyan-300/14 border-cyan-300/25 hover:border-cyan-200/45 h-8 text-cyan-100 shrink-0"
      onClick={onInspect}
      size="xs"
      type="button"
      variant="secondary"
    >
      <Eye aria-hidden="true" className="size-4" />
      Inspect game state
    </Button>
  );
}
