"use client";

import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { GripVertical, X } from "lucide-react";
import { Button } from "@/shared/components/button";
import { Kbd } from "@/shared/components/kbd";
import { cn } from "@/shared/utils/cn";
import {
  Card,
  ChainCardEntry,
  GameLogEntry,
  TemporaryZone,
  ZoneData,
} from "../types";
import { BoardSlot } from "./board-slot";
import { CardTile } from "./card-tile";
import { EmptyState } from "./empty-state";

type OverlayPosition = {
  x: number;
  y: number;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startX: number;
  startY: number;
};

const VIEWPORT_PADDING = 8;
const DEFAULT_OVERLAY_WIDTH = 288;
const DEFAULT_OVERLAY_HEIGHT = 360;

export function TemporaryZoneOverlay({
  canPassChain = false,
  chainCards,
  chainPassLabel = "Pass priority",
  isCloseDisabled = false,
  isSubmittingAction = false,
  logEntries,
  onChainItemPointerEnter,
  onChainItemPointerLeave,
  openZone,
  onClose,
  onPassChain,
  opponentBanishment,
  opponentTrash,
  playerBanishment,
  playerTrash,
}: {
  canPassChain?: boolean;
  chainCards: ChainCardEntry[];
  chainPassLabel?: string;
  isCloseDisabled?: boolean;
  isSubmittingAction?: boolean;
  logEntries: GameLogEntry[];
  onChainItemPointerEnter?: (targetCardInstanceIds: string[]) => void;
  onChainItemPointerLeave?: () => void;
  openZone: TemporaryZone;
  onClose: () => void;
  onPassChain?: () => void;
  opponentBanishment: ZoneData;
  opponentTrash: ZoneData;
  playerBanishment: ZoneData;
  playerTrash: ZoneData;
}) {
  const [position, setPosition] = useState<OverlayPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dragStateRef = useRef<DragState | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const clampOverlayPosition = useCallback((nextPosition: OverlayPosition) => {
    if (typeof window === "undefined") {
      return nextPosition;
    }

    const panelRect = panelRef.current?.getBoundingClientRect();
    const panelWidth = panelRect?.width ?? DEFAULT_OVERLAY_WIDTH;
    const panelHeight = panelRect?.height ?? DEFAULT_OVERLAY_HEIGHT;
    const maxX = Math.max(
      VIEWPORT_PADDING,
      window.innerWidth - panelWidth - VIEWPORT_PADDING,
    );
    const maxY = Math.max(
      VIEWPORT_PADDING,
      window.innerHeight - panelHeight - VIEWPORT_PADDING,
    );

    return {
      x: clamp(nextPosition.x, VIEWPORT_PADDING, maxX),
      y: clamp(nextPosition.y, VIEWPORT_PADDING, maxY),
    };
  }, []);

  const startDrag = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!panelRef.current || event.button !== 0) {
        return;
      }

      const rect = panelRef.current.getBoundingClientRect();
      const currentPosition = clampOverlayPosition({
        x: rect.left,
        y: rect.top,
      });

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragStateRef.current = {
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: currentPosition.x,
        startY: currentPosition.y,
      };
      setPosition(currentPosition);
      setIsDragging(true);
    },
    [clampOverlayPosition],
  );

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    function handlePointerMove(event: PointerEvent) {
      const dragState = dragStateRef.current;

      if (!dragState || event.pointerId !== dragState.pointerId) {
        return;
      }

      const nextPosition = {
        x: dragState.startX + event.clientX - dragState.startClientX,
        y: dragState.startY + event.clientY - dragState.startClientY,
      };

      setPosition(clampOverlayPosition(nextPosition));
    }

    function stopDragging(event: PointerEvent) {
      const dragState = dragStateRef.current;

      if (dragState && event.pointerId !== dragState.pointerId) {
        return;
      }

      dragStateRef.current = null;
      setIsDragging(false);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [clampOverlayPosition, isDragging]);

  useEffect(() => {
    if (!openZone || !position) {
      return;
    }

    function clampCurrentPosition() {
      setPosition((currentPosition) =>
        currentPosition
          ? clampOverlayPosition(currentPosition)
          : currentPosition,
      );
    }

    window.addEventListener("resize", clampCurrentPosition);

    return () => {
      window.removeEventListener("resize", clampCurrentPosition);
    };
  }, [clampOverlayPosition, openZone, position]);

  useEffect(() => {
    if (!openZone || !position || typeof ResizeObserver === "undefined") {
      return;
    }

    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setPosition((currentPosition) =>
        currentPosition
          ? clampOverlayPosition(currentPosition)
          : currentPosition,
      );
    });

    observer.observe(panel);

    return () => {
      observer.disconnect();
    };
  }, [clampOverlayPosition, openZone, position]);

  useEffect(() => {
    if (!openZone) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [openZone]);

  const canUsePassShortcut =
    openZone === "chain" &&
    chainCards.length > 0 &&
    canPassChain &&
    !isSubmittingAction &&
    Boolean(onPassChain);
  const canCloseWithShortcut = Boolean(openZone) && !isCloseDisabled;

  useEffect(() => {
    if (!canCloseWithShortcut) {
      return;
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreCloseShortcut(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onClose();
    }

    window.addEventListener("keydown", handleWindowKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown, true);
    };
  }, [canCloseWithShortcut, onClose]);

  useEffect(() => {
    if (!canUsePassShortcut) {
      return;
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (shouldIgnorePassShortcut(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onPassChain?.();
    }

    window.addEventListener("keydown", handleWindowKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown, true);
    };
  }, [canUsePassShortcut, onPassChain]);

  if (!openZone) {
    return null;
  }

  const title = getTemporaryZoneTitle(openZone);
  const message = getTemporaryZoneEmptyMessage(openZone);

  return (
    <div className="z-30 fixed inset-0 overflow-hidden pointer-events-none">
      <div
        aria-label={title}
        className={cn(
          "fixed bg-slate-950/55 supports-backdrop-filter:bg-slate-950/45 shadow-2xl shadow-black/60 backdrop-blur-md p-3 border border-white/15 rounded-xl outline-none ring-1 ring-cyan-300/10 w-84 text-slate-100 pointer-events-auto select-none",
          position ? "left-0 top-0" : "right-16 top-20",
        )}
        ref={panelRef}
        role="dialog"
        style={
          position
            ? {
                transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
              }
            : undefined
        }
        tabIndex={-1}
      >
        <div className="flex justify-between items-center gap-2 mb-3">
          <div
            aria-label={`Move ${title}`}
            className={cn(
              "flex flex-1 items-center gap-1 hover:bg-white/10 -ml-1 px-1 py-1 rounded outline-none min-w-0 font-semibold text-slate-100 text-sm text-left transition cursor-grab active:cursor-grabbing",
              isDragging && "cursor-grabbing bg-white/10",
            )}
            onPointerDown={startDrag}
            role="presentation"
            title="Drag to move"
          >
            <GripVertical className="size-4 text-slate-500 shrink-0" />
            <span className="truncate">{title}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!isCloseDisabled && (
              <Kbd className="hidden sm:inline-flex bg-white/10 shadow-none px-1.5 py-0.5 border-white/15 text-[10px] text-slate-300">
                Esc
              </Kbd>
            )}
            <Button
              aria-label="Close temporary zone"
              className="bg-white/10 hover:bg-white/20 disabled:opacity-40 p-0 border border-white/10 size-7 text-slate-100 disabled:cursor-not-allowed"
              disabled={isCloseDisabled}
              onClick={onClose}
              onPointerDown={(event) => event.stopPropagation()}
              type="button"
              variant="secondary"
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
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
          <ZoneCards
            emptyLabel="No cards in trash"
            cards={opponentTrash.cards}
          />
        ) : openZone === "chain" ? (
          <div className="gap-3 grid">
            <ChainCards
              emptyLabel={message}
              entries={chainCards}
              onItemPointerEnter={onChainItemPointerEnter}
              onItemPointerLeave={onChainItemPointerLeave}
            />
            {chainCards.length > 0 && (
              <Button
                className="bg-cyan-300 hover:bg-cyan-200 disabled:bg-cyan-300 disabled:opacity-50 w-full font-semibold text-slate-950 text-sm disabled:cursor-not-allowed"
                disabled={!canPassChain || isSubmittingAction}
                onClick={onPassChain}
                type="button"
              >
                <span>
                  {isSubmittingAction
                    ? "Submitting…"
                    : canPassChain
                      ? chainPassLabel
                      : "Waiting for priority"}
                </span>
                {canUsePassShortcut && (
                  <span className="inline-flex items-center gap-1 ml-2 font-medium text-slate-950/75 text-xs">
                    <span className="hidden sm:inline">Press</span>
                    <Kbd className="bg-slate-950/10 shadow-none px-1.5 py-0.5 border-slate-950/20 text-[10px] text-slate-950/80">
                      J
                    </Kbd>
                  </span>
                )}
              </Button>
            )}
          </div>
        ) : (
          <EmptyState label={message} />
        )}
      </div>
    </div>
  );
}

function ChainCards({
  emptyLabel,
  entries,
  onItemPointerEnter,
  onItemPointerLeave,
}: {
  emptyLabel: string;
  entries: ChainCardEntry[];
  onItemPointerEnter?: (targetCardInstanceIds: string[]) => void;
  onItemPointerLeave?: () => void;
}) {
  if (entries.length === 0) {
    return <EmptyState label={emptyLabel} />;
  }

  const resolutionOrder = [...entries].reverse();

  return (
    <div className="gap-2 grid pr-1 max-h-[50vh] overflow-auto">
      {resolutionOrder.map((entry, index) => (
        <div
          className={cn(
            "items-center gap-2 grid grid-cols-[auto_minmax(0,1fr)] bg-white/[0.07] shadow-black/20 shadow-sm p-2 border border-white/10 border-l-4 rounded",
            entry.controllerSeat === "player"
              ? "border-l-player-accent-border"
              : "border-l-opponent-accent-border",
          )}
          key={entry.chainItemId}
          onPointerEnter={() =>
            onItemPointerEnter?.(
              [
                entry.sourceCardInstanceId,
                ...entry.targetCardInstanceIds,
              ].filter((cardInstanceId): cardInstanceId is string =>
                Boolean(cardInstanceId),
              ),
            )
          }
          onPointerLeave={onItemPointerLeave}
        >
          <CardTile
            enableZoneAnimation={false}
            enableHoverPreview
            key={entry.card.instanceId ?? `${entry.card.name}-${index}`}
            ownerLabel={entry.controllerName}
            ownerSeat={entry.controllerSeat}
            preserveOrientation
            showMight={false}
            {...entry.card}
          />
          <div className="min-w-0 text-slate-300 text-xs">
            <div
              className={cn(
                "inline-flex mb-1 px-2 py-0.5 rounded font-semibold text-[10px] text-white uppercase tracking-wide",
                entry.controllerSeat === "player"
                  ? "bg-player-accent"
                  : "bg-opponent-accent",
              )}
            >
              {entry.controllerName}
            </div>
            <div className="font-semibold text-slate-100">
              {entry.card.name}
            </div>
            <div className="text-[11px] text-slate-500">
              {index === 0 ? "Resolves next" : `Resolves ${index + 1}`}
            </div>
          </div>
        </div>
      ))}
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

function getTemporaryZoneTitle(openZone: TemporaryZone) {
  switch (openZone) {
    case "chain":
      return "Chain";
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

function getTemporaryZoneEmptyMessage(openZone: TemporaryZone) {
  switch (openZone) {
    case "chain":
      return "The chain is empty.";
    case "banish":
      return "";
    default:
      return "No accepted server events are present in the current preview state.";
  }
}

function shouldIgnoreCloseShortcut(event: KeyboardEvent) {
  return (
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    isEditableTarget(event.target) ||
    event.key !== "Escape"
  );
}

function shouldIgnorePassShortcut(event: KeyboardEvent) {
  return (
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    isEditableTarget(event.target) ||
    event.key.toLowerCase() !== "j"
  );
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable="true"], [role="textbox"]',
    ),
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
