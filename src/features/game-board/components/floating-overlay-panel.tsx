"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { GripVertical, X } from "lucide-react";
import { Button } from "@/shared/components/button";
import { Kbd } from "@/shared/components/kbd";
import { cn } from "@/shared/utils/cn";

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

export type FloatingOverlayPlacement = "primary" | "secondary";

const VIEWPORT_PADDING = 8;
const DEFAULT_OVERLAY_WIDTH = 288;
const DEFAULT_OVERLAY_HEIGHT = 360;

export function FloatingOverlayPanel({
  children,
  className,
  closeLabel = "Close overlay",
  enableCloseShortcut = true,
  isCloseDisabled = false,
  isOpen,
  onClose,
  placement = "primary",
  title,
}: {
  children: ReactNode;
  className?: string;
  closeLabel?: string;
  enableCloseShortcut?: boolean;
  isCloseDisabled?: boolean;
  isOpen: boolean;
  onClose: () => void;
  placement?: FloatingOverlayPlacement;
  title: string;
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
    if (!isOpen || !position) {
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
  }, [clampOverlayPosition, isOpen, position]);

  useEffect(() => {
    if (!isOpen || !position || typeof ResizeObserver === "undefined") {
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
  }, [clampOverlayPosition, isOpen, position]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [isOpen]);

  const canCloseWithShortcut = isOpen && !isCloseDisabled && enableCloseShortcut;

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

  if (!isOpen) {
    return null;
  }

  return (
    <div className="z-30 fixed inset-0 overflow-hidden pointer-events-none">
      <div
        aria-label={title}
        className={cn(
          "fixed bg-slate-950/55 supports-backdrop-filter:bg-slate-950/45 shadow-2xl shadow-black/60 backdrop-blur-md p-3 border border-white/15 rounded-xl outline-none ring-1 ring-cyan-300/10 w-84 text-slate-100 pointer-events-auto select-none",
          position
            ? "left-0 top-0"
            : placement === "secondary"
              ? "right-[min(26rem,calc(100vw-22rem))] top-20"
              : "right-16 top-20",
          className,
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
            {!isCloseDisabled && enableCloseShortcut && (
              <Kbd className="hidden sm:inline-flex bg-white/10 shadow-none px-1.5 py-0.5 border-white/15 text-[10px] text-slate-300">
                Esc
              </Kbd>
            )}
            <Button
              aria-label={closeLabel}
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
        {children}
      </div>
    </div>
  );
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
