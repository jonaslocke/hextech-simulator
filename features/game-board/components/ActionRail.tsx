"use client";

import { History, Layers3, SkipForward } from "lucide-react";
import { TemporaryZone } from "../types";
import { ActionButton } from "./ActionButton";

export function ActionRail({
  onPassTurn,
  openZone,
  setOpenZone,
}: {
  onPassTurn?: () => void;
  openZone: TemporaryZone;
  setOpenZone: (zone: TemporaryZone) => void;
}) {
  return (
    <aside className="relative flex flex-col justify-center items-center gap-3 bg-[#111827] px-3">
      <ActionButton
        active={openZone === "chain"}
        label="Chain"
        onClick={() => setOpenZone(openZone === "chain" ? null : "chain")}
      >
        <Layers3 className="size-5" />
      </ActionButton>
      <ActionButton
        active={openZone === "log"}
        label="Game Log"
        onClick={() => setOpenZone(openZone === "log" ? null : "log")}
      >
        <History className="size-5" />
      </ActionButton>
      <ActionButton
        active={false}
        label="Pass Turn"
        onClick={onPassTurn ?? (() => undefined)}
      >
        <SkipForward className="size-5" />
      </ActionButton>
    </aside>
  );
}
