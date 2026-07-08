"use client";

import { useDraggable } from "@dnd-kit/core";
import type { CSSProperties, ReactNode } from "react";
import type { BoardDragSourceLocation } from "./location-drag-actions";
import { locationDragCardId } from "./location-drag-actions";

type DraggableLocationCardProps = {
  cardInstanceId: string;
  children: ReactNode;
  sourceLocation: BoardDragSourceLocation;
};

export function DraggableLocationCard({
  cardInstanceId,
  children,
  sourceLocation,
}: DraggableLocationCardProps) {
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    id: locationDragCardId(cardInstanceId),
    data: {
      type: "location-card",
      sourceCardInstanceId: cardInstanceId,
      sourceLocation,
    },
  });

  const style: CSSProperties = {
    filter: isDragging ? "grayscale(1) saturate(0.15)" : undefined,
    opacity: isDragging ? 0.28 : undefined,
  };

  return (
    <div
      {...attributes}
      {...listeners}
      className="relative touch-none shrink-0"
      data-location-dragging={isDragging ? "true" : undefined}
      ref={setNodeRef}
      style={style}
    >
      {children}
    </div>
  );
}
