"use client";

import { History, Layers3, PanelRightOpen } from "lucide-react";
import { TemporaryZone } from "../types";
import { ActionButton } from "./ActionButton";

export function ActionRail({
  openZone,
  setOpenZone,
}: {
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
        active={openZone === "banish"}
        label="Banish"
        onClick={() => setOpenZone(openZone === "banish" ? null : "banish")}
      >
        <PanelRightOpen className="size-5" />
      </ActionButton>
      <ActionButton
        active={openZone === "log"}
        label="Game Log"
        onClick={() => setOpenZone(openZone === "log" ? null : "log")}
      >
        <History className="size-5" />
      </ActionButton>
    </aside>
  );
}
