"use client";

import type { Card, GameLogEntry, TemporaryZone, ZoneData } from "../types";
import {
  FloatingOverlayPanel,
  type FloatingOverlayPlacement,
} from "./floating-overlay-panel";
import { BoardSlot } from "./board-slot";
import { CardTile } from "./card-tile";
import { EmptyState } from "./empty-state";

type TemporaryZoneOverlayZone = Exclude<TemporaryZone, "chain">;

export function TemporaryZoneOverlay({
  enableCloseShortcut = true,
  logEntries,
  onClose,
  openZone,
  opponentBanishment,
  opponentTrash,
  placement = "primary",
  playerBanishment,
  playerTrash,
}: {
  enableCloseShortcut?: boolean;
  logEntries: GameLogEntry[];
  onClose: () => void;
  openZone: TemporaryZoneOverlayZone;
  opponentBanishment: ZoneData;
  opponentTrash: ZoneData;
  placement?: FloatingOverlayPlacement;
  playerBanishment: ZoneData;
  playerTrash: ZoneData;
}) {
  if (!openZone) {
    return null;
  }

  const title = getTemporaryZoneTitle(openZone);
  const message = getTemporaryZoneEmptyMessage(openZone);

  return (
    <FloatingOverlayPanel
      closeLabel="Close temporary zone"
      enableCloseShortcut={enableCloseShortcut}
      isOpen={Boolean(openZone)}
      onClose={onClose}
      placement={placement}
      title={title}
    >
      {openZone === "banish" ? (
        <div className="gap-2 grid">
          <BoardSlot title="Player 1 Banish">
            <ZoneCards
              emptyLabel="No banished cards"
              cards={playerBanishment.cards}
            />
          </BoardSlot>
          <BoardSlot title="Player 2 Banish">
            <ZoneCards
              emptyLabel="No banished cards"
              cards={opponentBanishment.cards}
            />
          </BoardSlot>
        </div>
      ) : openZone === "log" ? (
        <LogList entries={logEntries} />
      ) : openZone === "playerTrash" ? (
        <ZoneCards emptyLabel="No cards in trash" cards={playerTrash.cards} />
      ) : openZone === "opponentTrash" ? (
        <ZoneCards emptyLabel="No cards in trash" cards={opponentTrash.cards} />
      ) : (
        <EmptyState label={message} />
      )}
    </FloatingOverlayPanel>
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
          showMight={false}
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
        <li
          key={entry.id}
          className="bg-white/[0.07] shadow-black/20 shadow-sm p-2 border border-white/10 rounded"
        >
          <div className="text-[10px] text-slate-500 uppercase">
            Event {entry.sequence}
          </div>
          <div>{entry.message}</div>
        </li>
      ))}
    </ol>
  );
}

function getTemporaryZoneTitle(openZone: TemporaryZoneOverlayZone) {
  switch (openZone) {
    case "banish":
      return "Banished Cards";
    case "playerTrash":
      return "Player Trash";
    case "opponentTrash":
      return "Opponent Trash";
    case "log":
    default:
      return "Game Log";
  }
}

function getTemporaryZoneEmptyMessage(openZone: TemporaryZoneOverlayZone) {
  switch (openZone) {
    case "banish":
      return "";
    default:
      return "No accepted server events are present in the current preview state.";
  }
}
