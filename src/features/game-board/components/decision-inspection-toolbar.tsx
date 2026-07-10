"use client";

import { ArchiveX, ArrowLeft, Eye, Hand, Trash2 } from "lucide-react";
import { Button } from "@/shared/components/button";
import type { ReactNode } from "react";
import { cn } from "@/shared/utils/cn";
import type {
  DecisionInspectionPolicy,
  DecisionInspectionZone,
} from "../decisions/decision-inspection-policy";
import type { PlayerData } from "../types";

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
        "rounded-xl border border-cyan-300/25 bg-slate-950/88 p-2.5 text-slate-100 shadow-2xl shadow-black/70 ring-1 ring-cyan-300/10",
        "supports-backdrop-filter:bg-slate-950/72 supports-backdrop-filter:backdrop-blur-md",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-1">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-cyan-200/25 bg-cyan-300/12 text-cyan-100">
            <Eye aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-200/80">
              Read-only inspection
            </p>
            <p className="truncate text-sm font-semibold text-slate-100">
              {decisionTitle}
            </p>
          </div>
        </div>

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

        <Button
          autoFocus
          className="ml-auto h-9 shrink-0"
          onClick={onReturnToDecision}
          size="sm"
          type="button"
          variant="secondary"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Return to decision
          <span className="rounded border border-white/15 bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
            Esc
          </span>
        </Button>
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
    <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 p-1.5">
      <span className="max-w-28 truncate px-1 text-xs font-semibold text-slate-300">
        {seatLabel}
      </span>
      <span
        aria-label={`${player.zones.hand.count} cards in ${seatLabel.toLowerCase()} hand`}
        className="inline-flex h-7 items-center gap-1 rounded-md border border-white/10 bg-black/20 px-2 text-xs text-slate-200"
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
      className="h-7 gap-1.5 px-2 text-xs"
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
