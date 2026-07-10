"use client";

import { Button } from "@/shared/components/button";
import { DialogPortal } from "@/shared/components/dialog-portal";
import { cn } from "@/shared/utils/cn";
import { ArchiveX, ArrowLeft, Trash2 } from "lucide-react";
import type { DecisionInspectionZone } from "../decisions/decision-inspection-policy";
import type { Card, PlayerData, ZoneData } from "../types";
import { CardTile } from "./card-tile";
import { EmptyState } from "./empty-state";
import { GameActionButton } from "./game-action-button";

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
        className="z-[2147483647] fixed inset-0 flex justify-center items-center bg-black/62 backdrop-blur-sm p-4"
        role="presentation"
      >
        <section
          aria-labelledby="decision-zone-browser-title"
          aria-modal="true"
          className={cn(
            "gap-3 grid grid-rows-[auto_auto_minmax(0,1fr)] rounded-2xl w-full max-w-7xl max-h-[min(52rem,calc(100vh-2rem))] overflow-hidden",
            "border border-cyan-300/25 bg-slate-950/92 p-4 text-slate-100 shadow-2xl shadow-black/85 ring-1 ring-cyan-300/10",
            "supports-backdrop-filter:bg-slate-950/78 supports-backdrop-filter:backdrop-blur-xl",
          )}
          role="dialog"
        >
          <header className="flex justify-between items-start gap-3">
            <div className="min-w-0">
              <p className="font-mono font-semibold text-[10px] text-cyan-200/75 uppercase tracking-[0.2em]">
                Public game state
              </p>
              <h2
                className="mt-1 font-semibold text-slate-50 text-xl"
                id="decision-zone-browser-title"
              >
                {title}
              </h2>
              <p className="mt-1 text-slate-400 text-sm">
                {zone.count} {zone.count === 1 ? "card" : "cards"}. This view is
                read-only.
              </p>
            </div>

            <GameActionButton
              actionSlot="cancel"
              aria-label="Close zone browser"
              autoFocus
              onAction={onClose}
              size="compact"
              variant="secondary"
            >
              Back to board
            </GameActionButton>
          </header>

          <nav
            aria-label="Inspectable public zones"
            className="flex flex-wrap gap-2 py-3 border-white/10 border-y"
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
      <EmptyState label={`No cards in ${zoneLabel(zoneKind).toLowerCase()}.`} />
    );
  }

  return (
    <div className="flex flex-wrap justify-center content-start gap-3 bg-black/18 p-4 border border-white/8 rounded-xl min-h-0 overflow-auto [scrollbar-color:rgba(103,232,249,0.28)_transparent]">
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
