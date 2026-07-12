"use client";

import { Info } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { Checkbox } from "@/shared/components/checkbox";
import { Kbd } from "@/shared/components/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/shared/components/tooltip";
import { cn } from "@/shared/utils/cn";
import type { ChainCardEntry } from "../types";
import { CardTile } from "./card-tile";
import { EmptyState } from "./empty-state";
import { FloatingOverlayPanel } from "./floating-overlay-panel";
import { GameActionButton } from "./game-action-button";

export function ChainOverlay({
  canPassPriority = false,
  chainCards,
  chainPassLabel = "Pass priority",
  isCloseDisabled = false,
  interactionSuspended = false,
  isOpen,
  isSubmittingAction = false,
  onClose,
  onItemPointerEnter,
  onItemPointerLeave,
  onPassPriority,
  priorityWindowKey,
}: {
  canPassPriority?: boolean;
  chainCards: ChainCardEntry[];
  chainPassLabel?: string;
  isCloseDisabled?: boolean;
  interactionSuspended?: boolean;
  isOpen: boolean;
  isSubmittingAction?: boolean;
  onClose: () => void;
  onItemPointerEnter?: (targetCardInstanceIds: string[]) => void;
  onItemPointerLeave?: () => void;
  onPassPriority?: () => void | Promise<unknown>;
  priorityWindowKey?: string;
}) {
  const autoPassControlId = useId();
  const [passAllPriority, setPassAllPriority] = useState(false);
  const previousChainItemIdsRef = useRef<string[]>([]);
  const wasOpenRef = useRef(isOpen);
  const lastAutoPassWindowKeyRef = useRef<string | null>(null);

  const chainItemIds = useMemo(
    () => unique(chainCards.map((entry) => entry.chainItemId)),
    [chainCards],
  );

  const chainItemKey = chainItemIds.join("|");
  const hasChainItems = chainItemIds.length > 0;
  const canTogglePassAll =
    isOpen && hasChainItems && !interactionSuspended;

  useEffect(() => {
    const previousChainItemIds = previousChainItemIdsRef.current;
    const opened = isOpen && !wasOpenRef.current;
    const chainStarted =
      chainItemIds.length > 0 && previousChainItemIds.length === 0;
    const chainBecameEmpty =
      chainItemIds.length === 0 && previousChainItemIds.length > 0;
    const newItemAdded = chainItemIds.some(
      (chainItemId) => !previousChainItemIds.includes(chainItemId),
    );

    if (!isOpen || opened || chainStarted || chainBecameEmpty || newItemAdded) {
      setPassAllPriority(false);
      lastAutoPassWindowKeyRef.current = null;
    }

    previousChainItemIdsRef.current = chainItemIds;
    wasOpenRef.current = isOpen;
  }, [chainItemIds, isOpen]);

  useEffect(() => {
    if (!canTogglePassAll) {
      return;
    }

    function handleWindowKeyDown(event: KeyboardEvent) {
      if (shouldIgnoreKeyShortcut(event, "r")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setPassAllPriority((current) => !current);
    }

    window.addEventListener("keydown", handleWindowKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown, true);
    };
  }, [canTogglePassAll]);

  useEffect(() => {
    if (
      interactionSuspended ||
      !passAllPriority ||
      !canPassPriority ||
      !hasChainItems ||
      isSubmittingAction ||
      !onPassPriority
    ) {
      return;
    }

    const windowKey = priorityWindowKey ?? chainItemKey;

    if (lastAutoPassWindowKeyRef.current === windowKey) {
      return;
    }

    lastAutoPassWindowKeyRef.current = windowKey;
    void onPassPriority();
  }, [
    canPassPriority,
    chainItemKey,
    interactionSuspended,
    hasChainItems,
    isSubmittingAction,
    onPassPriority,
    passAllPriority,
    priorityWindowKey,
  ]);

  const handlePassAllPriorityChange = useCallback(
    (checked: boolean | "indeterminate") => {
      setPassAllPriority(checked === true);
    },
    [],
  );

  const passButtonLabel = isSubmittingAction
    ? "Submitting…"
    : canPassPriority
      ? chainPassLabel
      : "Waiting";

  return (
    <FloatingOverlayPanel
      closeLabel="Close chain"
      isCloseDisabled={isCloseDisabled}
      isOpen={isOpen}
      onClose={onClose}
      title="Chain"
    >
      <TooltipProvider delayDuration={150}>
        <div className="gap-3 grid">
          <ChainCards
            emptyLabel="The chain is empty."
            entries={chainCards}
            onItemPointerEnter={onItemPointerEnter}
            onItemPointerLeave={onItemPointerLeave}
          />

          {hasChainItems && (
            <div className="flex items-center gap-2">
              <label
                className={cn(
                  "flex items-center gap-1.5 bg-white/6 px-2 border border-white/10 rounded-lg w-37 h-9 text-left transition shrink-0",
                  "hover:bg-white/9",
                )}
                htmlFor={autoPassControlId}
              >
                <Checkbox
                  checked={passAllPriority}
                  disabled={interactionSuspended}
                  id={autoPassControlId}
                  onCheckedChange={handlePassAllPriorityChange}
                />

                <span className="font-semibold text-slate-100 text-xs whitespace-nowrap cursor-pointer">
                  Auto-pass
                </span>

                <Kbd className="bg-white/10 shadow-none ml-auto px-1.5 py-0.5 border-white/15 text-[10px] text-slate-300">
                  R
                </Kbd>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      aria-label="What auto-pass does"
                      className="inline-flex justify-center items-center rounded focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-300 text-slate-400 hover:text-slate-200 transition shrink-0"
                      type="button"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </TooltipTrigger>

                  <TooltipContent
                    align="start"
                    className="z-100 bg-slate-950 shadow-xl px-3 py-2 border border-white/10 max-w-64 text-slate-100 text-xs leading-snug"
                    side="bottom"
                    sideOffset={8}
                  >
                    Automatically passes priority whenever you receive it for
                    this chain. Resets when the chain empties or a new item is
                    added.
                  </TooltipContent>
                </Tooltip>
              </label>

              <GameActionButton
                actionSlot="primary"
                className="flex-1 justify-center bg-cyan-300 hover:bg-cyan-200 disabled:bg-cyan-300 disabled:opacity-50 text-slate-950"
                disabled={interactionSuspended || !canPassPriority}
                isActive={isOpen && hasChainItems}
                isBusy={isSubmittingAction}
                keybindClassName="border-slate-950/20 bg-slate-950/10 text-slate-950/80"
                onAction={onPassPriority}
              >
                {passButtonLabel}
              </GameActionButton>
            </div>
          )}
        </div>
      </TooltipProvider>
    </FloatingOverlayPanel>
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
            enableHoverPreview
            enableZoneAnimation={false}
            key={entry.card.instanceId ?? `${entry.card.name}-${index}`}
            ownerLabel={entry.controllerName}
            ownerSeat={entry.controllerSeat}
            preserveOrientation
            {...entry.card}
            damage={undefined}
            isExhausted={false}
            isStunned={false}
            showMight={false}
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
            {entry.targetLabels.length > 0 && <ChainTargetSummary entry={entry} />}
          </div>
        </div>
      ))}
    </div>
  );
}

function ChainTargetSummary({ entry }: { entry: ChainCardEntry }) {
  const groups = groupChainTargets(entry);

  return (
    <div className="mt-2 border-white/10 bg-slate-950/30 px-2 py-1.5 border rounded">
      <div className="mb-1 font-medium text-[10px] text-slate-400 uppercase tracking-wide">
        Targets · {entry.targetLabels.length} {entry.targetLabels.length === 1 ? "assignment" : "assignments"}
      </div>
      <div className="flex flex-wrap gap-1">
        {groups.map((group) => (
          <span
            className="inline-flex items-center gap-1 bg-cyan-300/10 px-1.5 py-0.5 border border-cyan-200/20 rounded text-[10px] text-cyan-50"
            key={group.instanceId}
          >
            <span className="max-w-36 truncate">{group.label}</span>
            <span className="font-semibold text-cyan-200">×{group.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function groupChainTargets(entry: ChainCardEntry) {
  const groups = new Map<string, { instanceId: string; label: string; count: number }>();
  entry.targetCardInstanceIds.forEach((instanceId, index) => {
    const existing = groups.get(instanceId);
    if (existing) {
      existing.count += 1;
      return;
    }
    groups.set(instanceId, {
      instanceId,
      label: entry.targetLabels[index] ?? "Unknown target",
      count: 1,
    });
  });
  return [...groups.values()];
}

function shouldIgnoreKeyShortcut(event: KeyboardEvent, key: string) {
  return (
    event.defaultPrevented ||
    event.repeat ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey ||
    isEditableTarget(event.target) ||
    event.key.toLowerCase() !== key
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

function unique(values: string[]) {
  return Array.from(new Set(values));
}
