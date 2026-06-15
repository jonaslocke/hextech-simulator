"use client";

import type { GameLogEntry } from "@/server/events";
import { X } from "lucide-react";
import { TemporaryZone, ZoneData } from "../types";
import { BoardSlot } from "./BoardSlot";
import { CardTile } from "./card-tile";
import { EmptyState } from "./EmptyState";

export function TemporaryZoneOverlay({
  logEntries,
  openZone,
  onClose,
  opponentBanishment,
  playerBanishment,
}: {
  logEntries: GameLogEntry[];
  openZone: TemporaryZone;
  onClose: () => void;
  opponentBanishment: ZoneData;
  playerBanishment: ZoneData;
}) {
  if (!openZone) {
    return null;
  }

  const title =
    openZone === "chain"
      ? "Chain"
      : openZone === "banish"
        ? "Banished Cards"
        : "Game Log";
  const message =
    openZone === "chain"
      ? "The chain is empty in the current preview state."
      : openZone === "banish"
        ? ""
        : "No accepted server events are present in the current preview state.";

  return (
    <div className="top-20 right-16 z-30 absolute bg-[#111827]/95 shadow-2xl shadow-black/50 p-3 border border-white/10 rounded-lg w-72">
      <div className="flex justify-between items-center mb-3">
        <div className="font-semibold text-sm">{title}</div>
        <button
          aria-label="Close temporary zone"
          className="bg-slate-700 hover:bg-slate-600 p-1 rounded text-slate-100"
          onClick={onClose}
          type="button"
        >
          <X className="size-4" />
        </button>
      </div>
      {openZone === "banish" ? (
        <div className="gap-2 grid">
          <BoardSlot title="Player 1 Banish">
            <BanishmentCards zone={playerBanishment} />
          </BoardSlot>
          <BoardSlot title="Player 2 Banish">
            <BanishmentCards zone={opponentBanishment} />
          </BoardSlot>
        </div>
      ) : openZone === "log" ? (
        <LogList entries={logEntries} />
      ) : (
        <EmptyState label={message} />
      )}
    </div>
  );
}

function BanishmentCards({ zone }: { zone: ZoneData }) {
  if (zone.cards.length === 0) {
    return <EmptyState label="No banished cards" />;
  }

  return (
    <div className="flex gap-2 overflow-auto">
      {zone.cards.map((card, index) => (
        <CardTile key={card.instanceId ?? `${card.name}-${index}`} {...card} />
      ))}
    </div>
  );
}

function LogList({ entries }: { entries: GameLogEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState label="No accepted server events are present." />;
  }

  return (
    <ol className="gap-2 grid max-h-80 overflow-auto text-slate-200 text-xs">
      {entries.map((entry) => (
        <li key={entry.id} className="bg-white/5 p-2 rounded">
          <div className="text-[10px] text-slate-500 uppercase">
            Event {entry.sequence}
          </div>
          <div>{entry.message}</div>
        </li>
      ))}
    </ol>
  );
}
