"use client";

import { GameActionButton } from "@/features/game-board/components/game-action-button";
import { cn } from "@/shared/utils/cn";
import {
  PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type PanelPosition = {
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
const DEFAULT_PANEL_WIDTH = 544;
const DEFAULT_PANEL_HEIGHT = 150;

export function TargetSelectionPrompt({
  canSubmit,
  cancelLabel = "Cancel",
  confirmLabel = "Play",
  costPreview,
  helperText,
  isSubmitting = false,
  maxTargets,
  minTargets,
  onCancel,
  onSubmit,
  resetKey,
  selectedCount,
  selectedTargetLabels = [],
  title,
}: {
  helperText?: string;
  canSubmit: boolean;
  cancelLabel?: string;
  confirmLabel?: string;
  costPreview?: {
    additionalPower: number;
    availableAnyPower: number;
    basePower: number;
    energy: number;
    sourceNames: string[];
  };
  isSubmitting?: boolean;
  maxTargets: number;
  minTargets: number;
  onCancel: () => void;
  onSubmit: () => void;
  /**
   * Optional escape hatch for consumers that keep this component mounted while
   * toggling visibility. When the value changes, the panel returns to its
   * default bottom-center position.
   */
  resetKey?: string | number;
  selectedCount: number;
  selectedTargetLabels?: string[];
  title?: string;
}) {
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const dragStateRef = useRef<DragState | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const isOptional = minTargets === 0;
  const targetRequirementLabel = isOptional
    ? "Optional targets"
    : maxTargets === minTargets
      ? "Required targets"
      : "Choose targets";

  const clampPanelPosition = useCallback((nextPosition: PanelPosition) => {
    if (typeof window === "undefined") {
      return nextPosition;
    }

    const panelRect = panelRef.current?.getBoundingClientRect();
    const panelWidth = panelRect?.width ?? DEFAULT_PANEL_WIDTH;
    const panelHeight = panelRect?.height ?? DEFAULT_PANEL_HEIGHT;
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
      const currentPosition = clampPanelPosition({
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
    [clampPanelPosition],
  );

  useEffect(() => {
    if (resetKey === undefined) {
      return;
    }

    setPosition(null);
    setIsDragging(false);
    dragStateRef.current = null;
  }, [resetKey]);

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

      setPosition(clampPanelPosition(nextPosition));
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
  }, [clampPanelPosition, isDragging]);

  useEffect(() => {
    if (!position) {
      return;
    }

    function clampCurrentPosition() {
      setPosition((currentPosition) =>
        currentPosition ? clampPanelPosition(currentPosition) : currentPosition,
      );
    }

    window.addEventListener("resize", clampCurrentPosition);

    return () => {
      window.removeEventListener("resize", clampCurrentPosition);
    };
  }, [clampPanelPosition, position]);

  useEffect(() => {
    if (!position || typeof ResizeObserver === "undefined") {
      return;
    }

    const panel = panelRef.current;

    if (!panel) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setPosition((currentPosition) =>
        currentPosition ? clampPanelPosition(currentPosition) : currentPosition,
      );
    });

    observer.observe(panel);

    return () => {
      observer.disconnect();
    };
  }, [clampPanelPosition, position]);

  return (
    <div
      className={cn(
        "z-2147483646 fixed w-[min(34rem,calc(100vw-2rem))] select-none",
        position ? "left-0 top-0" : "bottom-100 left-1/2 -translate-x-1/2",
      )}
      ref={panelRef}
      style={
        position
          ? { transform: `translate3d(${position.x}px, ${position.y}px, 0)` }
          : undefined
      }
    >
      <section className="bg-slate-950/90 shadow-2xl shadow-black/80 backdrop-blur-md border border-cyan-300/25 rounded-xl ring-1 ring-cyan-300/10 overflow-hidden text-slate-100">
        <div
          className={cn(
            "flex justify-between items-center gap-4 px-4 py-3 border-white/10 border-b cursor-grab active:cursor-grabbing",
            isDragging && "bg-white/4",
          )}
          onPointerDown={startDrag}
          title="Drag to move"
        >
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight">
              {title ?? targetRequirementLabel}
            </div>
            <div className="mt-1 text-slate-400 text-xs">
              {selectedCount}/{maxTargets} selected
              {isOptional ? " · you may play without selecting targets" : ""}
            </div>
            {helperText && (
              <div className="mt-1 text-cyan-100/75 text-xs leading-snug">
                {helperText}
              </div>
            )}
            {selectedTargetLabels.length > 0 && (
              <div className="mt-1 text-cyan-100/80 text-xs leading-snug">
                Targets: {selectedTargetLabels.map((label, index) =>
                  `${index + 1}. ${label}`,
                ).join(" · ")}
              </div>
            )}
          </div>

          <TargetCountBadge
            canSubmit={canSubmit}
            maxTargets={maxTargets}
            minTargets={minTargets}
            selectedCount={selectedCount}
          />
        </div>

        {costPreview && costPreview.additionalPower > 0 && (
          <div className="bg-amber-400/10 px-4 py-3 border-amber-300/25 border-b text-amber-50 text-xs">
            <div className="font-semibold">
              Deflect increases this cost by +{costPreview.additionalPower}{" "}
              Power.
            </div>
            <div className="mt-1 text-amber-100/80">
              Base cost: {costPreview.energy} Energy
              {costPreview.basePower > 0
                ? ` + ${costPreview.basePower} Power`
                : ""}
              {" · "}New cost: {costPreview.energy} Energy +{" "}
              {costPreview.basePower + costPreview.additionalPower} Power
            </div>
            {costPreview.sourceNames.length > 0 && (
              <div className="mt-1 text-amber-100/80">
                Deflect sources: {costPreview.sourceNames.join(", ")}
              </div>
            )}
            {costPreview.availableAnyPower < costPreview.additionalPower && (
              <div className="mt-2 font-medium">
                Add{" "}
                {costPreview.additionalPower - costPreview.availableAnyPower}{" "}
                more Power to your Rune Pool before confirming.
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end items-center gap-2 px-4 py-3">
          <GameActionButton
            actionSlot="cancel"
            onAction={onCancel}
            variant="secondary"
          >
            {cancelLabel}
          </GameActionButton>

          <GameActionButton
            actionSlot="primary"
            disabled={!canSubmit}
            isBusy={isSubmitting}
            onAction={onSubmit}
          >
            {isSubmitting ? "Submitting…" : confirmLabel}
          </GameActionButton>
        </div>
      </section>
    </div>
  );
}

function TargetCountBadge({
  canSubmit,
  maxTargets,
  minTargets,
  selectedCount,
}: {
  canSubmit: boolean;
  maxTargets: number;
  minTargets: number;
  selectedCount: number;
}) {
  const isComplete = selectedCount >= maxTargets;
  const isBelowMinimum = selectedCount < minTargets;

  return (
    <div
      className={cn(
        "px-2.5 py-1 border rounded-full font-semibold text-xs shrink-0",
        canSubmit
          ? "border-cyan-300/50 bg-cyan-300/15 text-cyan-100"
          : isBelowMinimum
            ? "border-yellow-300/40 bg-yellow-300/10 text-yellow-100"
            : isComplete
              ? "border-white/15 bg-white/10 text-slate-300"
              : "border-white/15 bg-white/5 text-slate-400",
      )}
    >
      {selectedCount}/{maxTargets}
    </div>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
