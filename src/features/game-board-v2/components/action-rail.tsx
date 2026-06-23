"use client";

import { History, Layers3, SkipForward } from "lucide-react";
import { TemporaryZone } from "../types";
import { ActionButton } from "./action-button";

export function ActionRail({
  isChainLockedOpen = false,
  onPassTurn,
  openZone,
  passTurnDisabled = false,
  passTurnLabel = "Pass Turn",
  setOpenZone,
}: {
  isChainLockedOpen?: boolean;
  onPassTurn?: () => void;
  openZone: TemporaryZone;
  passTurnDisabled?: boolean;
  passTurnLabel?: string;
  setOpenZone: (zone: TemporaryZone) => void;
}) {
  return (
    <aside className="relative flex flex-col justify-center items-center gap-3 bg-[#111827] px-3">
      <ActionButton
        active={openZone === "chain"}
        label={isChainLockedOpen ? "Chain is resolving" : "Chain"}
        onClick={() =>
          setOpenZone(openZone === "chain" && !isChainLockedOpen ? null : "chain")
        }
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
        disabled={passTurnDisabled || !onPassTurn}
        label={passTurnLabel}
        onClick={onPassTurn ?? (() => undefined)}
      >
        <SkipForward className="size-5" />
      </ActionButton>
    </aside>
  );
}

