"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/components/dropdown-menu";
import type { GameProjection } from "@/shared/game";
import type { ReactNode } from "react";

export type BoardLocation = NonNullable<
  GameProjection["actions"][number]["presentation"]["boardLocation"]
>;

export type CardActionMenuGroup = {
  id: string;
  items: CardActionMenuItem[];
  label: string;
};

export type CardActionMenuItem = {
  accessibleLabel?: string;
  boardLocation?: BoardLocation | null;
  disabled?: boolean;
  groups?: CardActionMenuGroup[];
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
    <DropdownMenu open onOpenChange={(open) => !open && onClose()}>
      <DropdownMenuTrigger asChild>
        <button
          aria-hidden="true"
          className="fixed size-px opacity-0 pointer-events-none"
          style={{ left, top }}
          tabIndex={-1}
          type="button"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="z-[2147483647] max-h-(--radix-dropdown-menu-content-available-height) max-w-[min(35vw,24rem)] overflow-x-hidden overflow-y-auto border border-white/10 bg-slate-950/95 p-1 text-slate-100 shadow-[0_18px_45px_rgba(0,0,0,0.75)] ring-1 ring-cyan-300/20"
        collisionPadding={8}
        onPointerDown={(event) => event.stopPropagation()}
        side="bottom"
      >
        {items.map((item) =>
          item.groups ? (
            <DropdownMenuSub key={item.id}>
              <DropdownMenuSubTrigger
                aria-label={item.accessibleLabel}
                className="px-3 py-2 text-xs whitespace-normal"
              >
                {item.label}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                className="z-[2147483647] max-h-(--radix-dropdown-menu-content-available-height) min-w-56 max-w-[min(35vw,24rem)] overflow-x-hidden overflow-y-auto border border-white/10 bg-slate-950/95 p-1 text-slate-100 shadow-[0_18px_45px_rgba(0,0,0,0.75)] ring-1 ring-cyan-300/20"
                collisionPadding={8}
                onPointerDown={(event) => event.stopPropagation()}
              >
                {item.groups.map((group, groupIndex) => (
                  <div key={group.id}>
                    {groupIndex > 0 && <DropdownMenuSeparator className="my-1 bg-white/15" />}
                    <DropdownMenuLabel className="px-3 py-1.5 text-[10px] tracking-[0.16em] text-slate-400 uppercase">
                      {group.label}
                    </DropdownMenuLabel>
                    {group.items.map((groupItem) => (
                      <MenuItem
                        item={groupItem}
                        key={groupItem.id}
                        onHighlight={onItemHighlight}
                        onHighlightEnd={onItemHighlightEnd}
                        onClose={onClose}
                      />
                    ))}
                  </div>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : (
            <MenuItem
              item={item}
              key={item.id}
              onHighlight={onItemHighlight}
              onHighlightEnd={onItemHighlightEnd}
              onClose={onClose}
            />
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MenuItem({
  item,
  onClose,
  onHighlight,
  onHighlightEnd,
}: {
  item: CardActionMenuItem;
  onClose: () => void;
  onHighlight?: (item: CardActionMenuItem) => void;
  onHighlightEnd?: () => void;
}) {
  return (
    <DropdownMenuItem
      aria-label={item.accessibleLabel}
      className="px-3 py-2 text-xs whitespace-normal focus:bg-cyan-300/15 focus:text-slate-100"
      disabled={item.disabled}
      onBlur={onHighlightEnd}
      onFocus={() => onHighlight?.(item)}
      onPointerLeave={(event) => {
        if (document.activeElement !== event.currentTarget) {
          onHighlightEnd?.();
        }
      }}
      onPointerMove={() => onHighlight?.(item)}
      onSelect={() => {
        onClose();
        item.onSelect?.();
      }}
    >
      {item.label}
    </DropdownMenuItem>
  );
}
