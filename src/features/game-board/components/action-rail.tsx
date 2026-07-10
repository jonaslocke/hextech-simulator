"use client";

import { Flag, History, Layers3, SkipForward } from "lucide-react";
import { useState } from "react";
import { TemporaryZone } from "../types";
import { ActionButton } from "./action-button";
import { ConcedeGameDialog } from "./concede-game-dialog";

type OpenableActionRailZone = Exclude<TemporaryZone, "chain">;

export function ActionRail({
  concedeDisabled = false,
  isChainOpen = false,
  isChainLockedOpen = false,
  onChainOpenChange,
  onConcede,
  onPassTurn,
  openZone,
  passTurnDisabled = false,
  passTurnLabel = "Pass Turn",
  setOpenZone,
}: {
  concedeDisabled?: boolean;
  isChainOpen?: boolean;
  isChainLockedOpen?: boolean;
  onChainOpenChange: (isOpen: boolean) => void;
  onConcede?: () => void | Promise<void>;
  onPassTurn?: () => void;
  openZone: OpenableActionRailZone | null;
  passTurnDisabled?: boolean;
  passTurnLabel?: string;
  setOpenZone: (zone: OpenableActionRailZone | null) => void;
}) {
  const [isConcedeDialogOpen, setIsConcedeDialogOpen] = useState(false);

  const canPassTurn = Boolean(onPassTurn) && !passTurnDisabled;
  const canConcede = Boolean(onConcede) && !concedeDisabled;

  return (
    <>
      <aside
        aria-label="Game actions"
        className="relative flex flex-col justify-center items-center gap-3 bg-slate-950/25 supports-backdrop-filter:bg-slate-950/18 shadow-[inset_1px_0_0_rgba(255,255,255,0.035),-12px_0_32px_rgba(0,0,0,0.16)] supports-backdrop-filter:backdrop-blur-md px-3 border-white/10 border-l ring-1 ring-white/5 overflow-hidden"
      >
        <div
          aria-hidden="true"
          className="left-0 absolute inset-y-3 bg-linear-to-b from-transparent via-cyan-200/20 to-transparent w-px pointer-events-none"
        />

        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-b from-white/3 via-transparent to-black/10 pointer-events-none"
        />

        <div className="z-10 relative flex flex-col py-10 h-full">
          <div className="flex flex-col flex-1 justify-center gap-3">
            <ActionButton
              active={isChainOpen}
              label={isChainLockedOpen ? "Chain is resolving" : "Chain"}
              onClick={() =>
                onChainOpenChange(isChainLockedOpen ? true : !isChainOpen)
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
              disabled={!canPassTurn}
              isShortcutActive={!isConcedeDialogOpen}
              label={passTurnLabel}
              onClick={onPassTurn ?? (() => undefined)}
              shortcut="space"
              shortcutBadge="␣"
              shortcutLabel="Space"
            >
              <SkipForward className="size-5" />
            </ActionButton>
          </div>

          {onConcede && (
            <ActionButton
              active={false}
              disabled={!canConcede}
              label="Concede Game"
              onClick={() => setIsConcedeDialogOpen(true)}
              variant="concede"
            >
              <Flag className="size-5" />
            </ActionButton>
          )}
        </div>
      </aside>

      {onConcede && (
        <ConcedeGameDialog
          disabled={!canConcede}
          isOpen={isConcedeDialogOpen}
          onConcede={onConcede}
          onOpenChange={setIsConcedeDialogOpen}
        />
      )}
    </>
  );
}
