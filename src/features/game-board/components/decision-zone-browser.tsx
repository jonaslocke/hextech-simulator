"use client";

import { ArchiveX, ArrowLeft, Trash2, X } from "lucide-react";
import { Button } from "@/shared/components/button";
import { DialogPortal } from "@/shared/components/dialog-portal";
import { cn } from "@/shared/utils/cn";
import type { DecisionInspectionZone } from "../decisions/decision-inspection-policy";
import type { Card, PlayerData, ZoneData } from "../types";
import { CardTile } from "./card-tile";
import { EmptyState } from "./empty-state";

export type DecisionInspectedZone = {
  playerId: string;
  zone: DecisionInspectionZone;
};

export function DecisionZoneBrowser({
  inspectedZone,
  onClose,
  onInspectZone,
  opponent,
  player,
}: {
  inspectedZone: DecisionInspectedZone;
  onClose: () => void;
  onInspectZone: (playerId: string, zone: DecisionInspectionZone) => void;
  opponent: PlayerData;
  player: PlayerData;
}) {
  const players = [player, opponent];
  const owner = players.find(
    (candidate) => candidate.playerId === inspectedZone.playerId,
  );

  if (!owner) {
    return null;
  }

  const zone = owner.zones[inspectedZone.zone];
  const ownerLabel =
    owner.playerId === player.playerId ? "Your" : `${owner.name}'s`;
  const title = `${ownerLabel} ${zoneLabel(inspectedZone.zone)}`;

  return (
    <DialogPortal>
      <div
        className="z-[2147483647] fixed inset-0 flex items-center justify-center bg-black/62 p-4 backdrop-blur-sm"
        role="presentation"
      >
        <section
          aria-labelledby="decision-zone-browser-title"
          aria-modal="true"
          className={cn(
            "grid max-h-[min(52rem,calc(100vh-2rem))] w-full max-w-7xl grid-rows-[auto_auto_minmax(0,1fr)] gap-3 overflow-hidden rounded-2xl",
            "border border-cyan-300/25 bg-slate-950/92 p-4 text-slate-100 shadow-2xl shadow-black/85 ring-1 ring-cyan-300/10",
            "supports-backdrop-filter:bg-slate-950/78 supports-backdrop-filter:backdrop-blur-xl",
          )}
          role="dialog"
        >
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-200/75">
                Public game state
              </p>
              <h2
                className="mt-1 text-xl font-semibold text-slate-50"
                id="decision-zone-browser-title"
              >
                {title}
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                {zone.count} {zone.count === 1 ? "card" : "cards"}. This view
                is read-only.
              </p>
            </div>

            <Button
              aria-label="Close zone browser"
              autoFocus
              className="h-9 shrink-0"
              onClick={onClose}
              size="sm"
              type="button"
              variant="secondary"
            >
              <X aria-hidden="true" className="size-4" />
              Close
              <span className="rounded border border-white/15 bg-white/8 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                Esc
              </span>
            </Button>
          </header>

          <nav
            aria-label="Inspectable public zones"
            className="flex flex-wrap gap-2 border-y border-white/10 py-3"
          >
            {players.flatMap((candidate) =>
              (["trash", "banishment"] as const).map((zoneKind) => {
                const candidateZone = candidate.zones[zoneKind];
                const isActive =
                  inspectedZone.playerId === candidate.playerId &&
                  inspectedZone.zone === zoneKind;

                return (
                  <Button
                    aria-pressed={isActive}
                    className={cn(
                      "h-9",
                      isActive &&
                        "border-cyan-200/50 bg-cyan-300/14 text-cyan-50",
                    )}
                    disabled={candidateZone.count === 0}
                    key={`${candidate.playerId}:${zoneKind}`}
                    onClick={() => onInspectZone(candidate.playerId, zoneKind)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    {zoneKind === "trash" ? (
                      <Trash2 aria-hidden="true" className="size-4" />
                    ) : (
                      <ArchiveX aria-hidden="true" className="size-4" />
                    )}
                    {candidate.playerId === player.playerId
                      ? "Your"
                      : "Opponent"}{" "}
                    {zoneLabel(zoneKind)}
                    <span className="font-mono text-xs">
                      {candidateZone.count}
                    </span>
                  </Button>
                );
              }),
            )}

            <Button
              className="ml-auto h-9"
              onClick={onClose}
              size="sm"
              type="button"
              variant="ghost"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back to board
            </Button>
          </nav>

          <ZoneCardGrid zone={zone} zoneKind={inspectedZone.zone} />
        </section>
      </div>
    </DialogPortal>
  );
}

function ZoneCardGrid({
  zone,
  zoneKind,
}: {
  zone: ZoneData;
  zoneKind: DecisionInspectionZone;
}) {
  if (zone.cards.length === 0) {
    return (
      <EmptyState
        label={`No cards in ${zoneLabel(zoneKind).toLowerCase()}.`}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-wrap content-start justify-center gap-3 overflow-auto rounded-xl border border-white/8 bg-black/18 p-4 [scrollbar-color:rgba(103,232,249,0.28)_transparent]">
      {zone.cards.map((card, index) => (
        <ReadOnlyZoneCard
          card={card}
          key={card.instanceId ?? `${card.name}-${index}`}
        />
      ))}
    </div>
  );
}

function ReadOnlyZoneCard({ card }: { card: Card }) {
  return (
    <CardTile
      {...card}
      enableHoverPreview
      enableZoneAnimation={false}
      focusablePreview
      showMight={false}
      size="lg"
    />
  );
}

function zoneLabel(zone: DecisionInspectionZone) {
  return zone === "trash" ? "Trash" : "Banishment";
}
