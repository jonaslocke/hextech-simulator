"use client";

import { useDraggable } from "@dnd-kit/core";
import { isValidElement, type CSSProperties, type ReactNode } from "react";
import type { BoardDragSourceLocation } from "./location-drag-actions";
import { locationDragCardId } from "./location-drag-actions";

type DraggableLocationCardProps = {
  cardInstanceId: string;
  children: ReactNode;
  registrationKey?: string;
  sourceLocation: BoardDragSourceLocation;
};

export function DraggableLocationCard({
  cardInstanceId,
  children,
  registrationKey,
  sourceLocation,
}: DraggableLocationCardProps) {
  const isTransferHidden =
    isValidElement<{ isTransferHidden?: boolean }>(children) &&
    Boolean(children.props.isTransferHidden);
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    disabled: isTransferHidden,
    id: registrationKey
      ? `${locationDragCardId(cardInstanceId)}:${encodeURIComponent(registrationKey)}`
      : locationDragCardId(cardInstanceId),
    data: {
      type: "location-card",
      sourceCardInstanceId: cardInstanceId,
      sourceLocation,
    },
  });

  const style: CSSProperties = {
    filter: isDragging ? "grayscale(1) saturate(0.15)" : undefined,
    opacity: isDragging ? 0.28 : undefined,
    pointerEvents: isTransferHidden ? "none" : undefined,
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
