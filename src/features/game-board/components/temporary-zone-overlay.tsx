"use client";

import type { GameLogEntry } from "@/server/events";
import { X } from "lucide-react";
import { Card, TemporaryZone, ZoneData } from "../types";
import { BoardSlot } from "./board-slot";
import { CardTile } from "./card-tile";
import { EmptyState } from "./empty-state";

export function TemporaryZoneOverlay({
  canPassChain = false,
  chainCards,
  chainPassLabel = "Pass priority",
  isCloseDisabled = false,
  logEntries,
  openZone,
  onClose,
  onPassChain,
  opponentBanishment,
  opponentTrash,
  playerBanishment,
  playerTrash,
}: {
  canPassChain?: boolean;
  chainCards: Card[];
  chainPassLabel?: string;
  isCloseDisabled?: boolean;
  logEntries: GameLogEntry[];
  openZone: TemporaryZone;
  onClose: () => void;
  onPassChain?: () => void;
  opponentBanishment: ZoneData;
  opponentTrash: ZoneData;
  playerBanishment: ZoneData;
  playerTrash: ZoneData;
}) {
  if (!openZone) {
    return null;
  }

  const title =
    openZone === "chain"
      ? "Chain"
      : openZone === "banish"
        ? "Banished Cards"
        : openZone === "playerTrash"
          ? "Player Trash"
          : openZone === "opponentTrash"
            ? "Opponent Trash"
            : "Game Log";
  const message =
    openZone === "chain"
      ? "The chain is empty."
      : openZone === "banish"
        ? ""
        : "No accepted server events are present in the current preview state.";

  return (
    <div className="top-20 right-16 z-30 absolute bg-[#111827]/95 shadow-2xl shadow-black/50 p-3 border border-white/10 rounded-lg w-72">
      <div className="flex justify-between items-center mb-3">
        <div className="font-semibold text-sm">{title}</div>
        <button
          aria-label="Close temporary zone"
          className="disabled:opacity-40 bg-slate-700 hover:bg-slate-600 p-1 rounded text-slate-100 disabled:cursor-not-allowed"
          disabled={isCloseDisabled}
          onClick={onClose}
          type="button"
        >
          <X className="size-4" />
        </button>
      </div>
      {openZone === "banish" ? (
        <div className="gap-2 grid">
          <BoardSlot title="Player 1 Banish">
            <ZoneCards emptyLabel="No banished cards" cards={playerBanishment.cards} />
          </BoardSlot>
          <BoardSlot title="Player 2 Banish">
            <ZoneCards emptyLabel="No banished cards" cards={opponentBanishment.cards} />
          </BoardSlot>
        </div>
      ) : openZone === "log" ? (
        <LogList entries={logEntries} />
      ) : openZone === "playerTrash" ? (
        <ZoneCards emptyLabel="No cards in trash" cards={playerTrash.cards} />
      ) : openZone === "opponentTrash" ? (
        <ZoneCards emptyLabel="No cards in trash" cards={opponentTrash.cards} />
      ) : openZone === "chain" ? (
        <div className="grid gap-3">
          <ZoneCards emptyLabel={message} cards={chainCards} />
          {chainCards.length > 0 && (
            <button
              className="disabled:opacity-50 bg-cyan-300 hover:bg-cyan-200 disabled:hover:bg-cyan-300 px-3 py-2 rounded font-semibold text-slate-950 text-sm disabled:cursor-not-allowed"
              disabled={!canPassChain}
              onClick={onPassChain}
              type="button"
            >
              {canPassChain ? chainPassLabel : "Waiting for priority"}
            </button>
          )}
        </div>
      ) : (
        <EmptyState label={message} />
      )}
    </div>
  );
}

function ZoneCards({
  cards,
  emptyLabel,
}: {
  cards: Card[];
  emptyLabel: string;
}) {
  if (cards.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }

  return (
    <div className="flex gap-2 overflow-auto">
      {cards.map((card, index) => (
        <CardTile
          enableZoneAnimation={false}
          enableHoverPreview
          key={card.instanceId ?? `${card.name}-${index}`}
          {...card}
        />
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
