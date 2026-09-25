"use client";

import type { Card, GameLogEntry, TemporaryZone, ZoneData } from "../types";
import { useEffect, useState } from "react";
import {
  FloatingOverlayPanel,
  type FloatingOverlayPlacement,
} from "./floating-overlay-panel";
import { CardTile } from "./card-tile";
import { EmptyState } from "./empty-state";

type TemporaryZoneOverlayZone = Exclude<TemporaryZone, "chain">;

export function TemporaryZoneOverlay({
  enableCloseShortcut = true,
  interactionSuspended = false,
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
  interactionSuspended?: boolean;
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
      isCloseDisabled={interactionSuspended}
      isOpen={Boolean(openZone)}
      onClose={onClose}
      placement={placement}
      title={title}
      className="flex h-[min(640px,calc(100dvh-16px))] w-[min(568px,calc(100vw-16px))] flex-col"
    >
      {openZone === "playerBanish" ? (
        <ZoneCards emptyLabel="No banished cards" cards={playerBanishment.cards} />
      ) : openZone === "opponentBanish" ? (
        <ZoneCards emptyLabel="No banished cards" cards={opponentBanishment.cards} />
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

export function ZoneCards({
  cards,
  emptyLabel,
}: {
  cards: Card[];
  emptyLabel: string;
}) {
  const [size, setSize] = useState<"lg" | "xl">("xl");
  useEffect(() => {
    const updateSize = () => setSize(window.innerHeight <= 700 ? "lg" : "xl");
    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, []);

  if (cards.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }

  return (
    <div className="grid flex-1 min-h-0 max-h-full grid-cols-4 content-start justify-start gap-3 overflow-x-hidden overflow-y-auto pr-2" data-board-scroll>
      {cards.map((card, index) => (
        <CardTile
          enableZoneAnimation={false}
          enableHoverPreview
          key={card.instanceId ?? `${card.name}-${index}`}
          size={size}
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
    case "playerBanish":
      return "Your Banishment";
    case "opponentBanish":
      return "Opponent Banishment";
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
    case "playerBanish":
    case "opponentBanish":
      return "";
    default:
      return "No accepted server events are present in the current preview state.";
  }
}
