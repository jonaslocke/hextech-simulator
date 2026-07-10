"use client";

import { Button } from "@/shared/components/button";
import { cn } from "@/shared/utils/cn";
import { ArchiveX, Eye, Hand, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type {
  DecisionInspectionPolicy,
  DecisionInspectionZone,
} from "../decisions/decision-inspection-policy";
import type { PlayerData } from "../types";
import { GameActionButton } from "./game-action-button";

export function DecisionInspectionToolbar({
  decisionTitle,
  onInspectZone,
  onReturnToDecision,
  opponent,
  player,
  policy,
}: {
  decisionTitle: string;
  onInspectZone: (playerId: string, zone: DecisionInspectionZone) => void;
  onReturnToDecision: () => void;
  opponent: PlayerData;
  player: PlayerData;
  policy: DecisionInspectionPolicy;
}) {
  return (
    <section
      aria-label="Decision inspection controls"
      className={cn(
        "top-14 left-1/2 z-[2147483645] fixed w-[min(74rem,calc(100vw-1rem))] -translate-x-1/2",
        "rounded-xl border border-cyan-300/25 bg-slate-950/88 p-2 text-slate-100 shadow-2xl shadow-black/70 ring-1 ring-cyan-300/10",
        "supports-backdrop-filter:bg-slate-950/72 supports-backdrop-filter:backdrop-blur-md",
      )}
    >
      <div className="flex flex-col gap-4">
        <div className="flex">
          <div className="flex items-center gap-2 px-1 min-w-0">
            <span className="flex justify-center items-center bg-cyan-300/12 border border-cyan-200/25 rounded-full size-7 text-cyan-100 shrink-0">
              <Eye aria-hidden="true" className="size-3.5" />
            </span>
            <p className="flex items-center gap-2 min-w-0 text-xs">
              <span className="font-mono font-semibold text-[10px] text-cyan-200/80 uppercase tracking-[0.16em] shrink-0">
                Read-only inspector
              </span>
              <span
                aria-hidden="true"
                className="bg-white/12 w-px h-4 shrink-0"
              />
              <span
                className="font-semibold text-slate-100 truncate"
                title={decisionTitle}
              >
                {decisionTitle}
              </span>
            </p>
          </div>

          <GameActionButton
            actionSlot="cancel"
            variant="secondary"
            onAction={onReturnToDecision}
            className="ml-auto"
            size="compact"
          >
            Return to decision
          </GameActionButton>
        </div>
        <div className="flex justify-center gap-4">
          <SeatInspectionControls
            onInspectZone={onInspectZone}
            player={player}
            policy={policy}
            seatLabel="You"
          />

          <SeatInspectionControls
            onInspectZone={onInspectZone}
            player={opponent}
            policy={policy}
            seatLabel="Opponent"
          />
        </div>
      </div>
    </section>
  );
}

function SeatInspectionControls({
  onInspectZone,
  player,
  policy,
  seatLabel,
}: {
  onInspectZone: (playerId: string, zone: DecisionInspectionZone) => void;
  player: PlayerData;
  policy: DecisionInspectionPolicy;
  seatLabel: string;
}) {
  return (
    <div className="flex items-center gap-1.5 bg-white/5 p-1.5 border border-white/10 rounded-lg">
      <span className="px-1 max-w-28 font-semibold text-slate-300 text-xs truncate">
        {seatLabel}
      </span>
      <span
        aria-label={`${player.zones.hand.count} cards in ${seatLabel.toLowerCase()} hand`}
        className="inline-flex items-center gap-1 bg-black/20 px-2 border border-white/10 rounded-md h-7 text-slate-200 text-xs"
        title={`${player.zones.hand.count} cards in hand`}
      >
        <Hand aria-hidden="true" className="size-3.5" />
        {player.zones.hand.count}
      </span>

      {policy === "publicGameState" && (
        <>
          <ZoneButton
            count={player.zones.trash.count}
            icon={<Trash2 aria-hidden="true" className="size-3.5" />}
            label="Trash"
            onClick={() => onInspectZone(player.playerId, "trash")}
          />
          <ZoneButton
            count={player.zones.banishment.count}
            icon={<ArchiveX aria-hidden="true" className="size-3.5" />}
            label="Banishment"
            onClick={() => onInspectZone(player.playerId, "banishment")}
          />
        </>
      )}
    </div>
  );
}

function ZoneButton({
  count,
  icon,
  label,
  onClick,
}: {
  count: number;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <Button
      aria-label={`${label}, ${count} cards`}
      className="gap-1.5 px-2 h-7 text-xs"
      disabled={count === 0}
      onClick={onClick}
      size="xs"
      title={count === 0 ? `No cards in ${label.toLowerCase()}` : undefined}
      type="button"
      variant="secondary"
    >
      {icon}
      <span className="hidden lg:inline">{label}</span>
      <span className="font-mono">{count}</span>
    </Button>
  );
}
