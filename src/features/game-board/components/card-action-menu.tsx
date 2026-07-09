"use client";

import { Button } from "@/shared/components/button";
import type { GameProjection } from "@/shared/game";
import { cn } from "@/shared/utils/cn";
import type { ReactNode } from "react";

export type BoardLocation = NonNullable<
  GameProjection["actions"][number]["presentation"]["boardLocation"]
>;

export type CardActionMenuItem = {
  accessibleLabel?: string;
  boardLocation?: BoardLocation | null;
  disabled?: boolean;
  id: string;
  label: ReactNode;
  onSelect?: () => void;
};

export type CardActionMenuState = {
  items: CardActionMenuItem[];
  left: number;
  top: number;
} | null;

export function CardActionMenu({
  items,
  left,
  onClose,
  onItemHighlight,
  onItemHighlightEnd,
  top,
}: {
  items: CardActionMenuItem[];
  left: number;
  onClose: () => void;
  onItemHighlight?: (item: CardActionMenuItem) => void;
  onItemHighlightEnd?: () => void;
  top: number;
}) {
  return (
    <div
      className={cn(
        "fixed flex flex-col max-w-[35vw]",
        "z-[2147483647] bg-slate-950/95 shadow-[0_18px_45px_rgba(0,0,0,0.75)] p-1 border border-white/10",
        "rounded-md ring-1 ring-cyan-300/20  overflow-hidden text-slate-100 text-sm",
      )}
      onPointerDown={(event) => event.stopPropagation()}
      style={{ left, top }}
    >
      {items.map((item) => (
        <Button
          aria-label={item.accessibleLabel}
          className="justify-start enabled:hover:bg-cyan-300/15 px-3 py-2 rounded min-w-0 h-auto min-h-0 font-normal disabled:text-slate-500 text-xs text-left whitespace-normal transition disabled:cursor-not-allowed"
          disabled={item.disabled}
          key={item.id}
          onBlur={onItemHighlightEnd}
          onClick={() => {
            onClose();
            item.onSelect?.();
          }}
          onFocus={() => {
            if (!item.disabled) {
              onItemHighlight?.(item);
            }
          }}
          onPointerEnter={() => {
            if (!item.disabled) {
              onItemHighlight?.(item);
            }
          }}
          onPointerLeave={(event) => {
            if (document.activeElement !== event.currentTarget) {
              onItemHighlightEnd?.();
            }
          }}
          type="button"
          variant="ghost"
        >
          <span className="flex-1 min-w-0 wrap-break-word">{item.label}</span>
        </Button>
      ))}
    </div>
  );
}
