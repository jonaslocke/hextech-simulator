"use client";

import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import type { PropsWithChildren } from "react";

export const LOCATION_DRAG_HOLD_DELAY_MS = 180;
export const LOCATION_DRAG_HOLD_TOLERANCE_PX = 6;

type LocationDragProviderProps = PropsWithChildren<{
  onDragCancel?: (event: DragCancelEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragMove?: (event: DragMoveEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragStart?: (event: DragStartEvent) => void;
}>;

export function LocationDragProvider({
  children,
  onDragCancel,
  onDragEnd,
  onDragMove,
  onDragOver,
  onDragStart,
}: LocationDragProviderProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        delay: LOCATION_DRAG_HOLD_DELAY_MS,
        tolerance: LOCATION_DRAG_HOLD_TOLERANCE_PX,
      },
    }),
  );

  return (
    <DndContext
      collisionDetection={pointerWithin}
      onDragCancel={onDragCancel}
      onDragEnd={onDragEnd}
      onDragMove={onDragMove}
      onDragOver={onDragOver}
      onDragStart={onDragStart}
      sensors={sensors}
    >
      {children}
    </DndContext>
  );
}
