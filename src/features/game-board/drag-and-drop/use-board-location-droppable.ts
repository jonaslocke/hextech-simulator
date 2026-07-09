"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  boardDropLocationId,
  type BoardDropLocation,
  type BoardDropLocationData,
} from "./location-drag-actions";

export function useBoardLocationDroppable({
  disabled,
  droppableId,
  location,
}: {
  disabled: boolean;
  droppableId?: string;
  location: BoardDropLocation;
}) {
  return useDroppable({
    data: {
      location,
      type: "board-drop-location",
    } satisfies BoardDropLocationData,
    disabled,
    id: droppableId ?? boardDropLocationId(location),
  });
}
