"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  boardDropLocationId,
  type BoardDropLocation,
  type BoardDropLocationData,
} from "./location-drag-actions";

export function useBoardLocationDroppable({
  disabled,
  location,
}: {
  disabled: boolean;
  location: BoardDropLocation;
}) {
  return useDroppable({
    data: {
      location,
      type: "board-drop-location",
    } satisfies BoardDropLocationData,
    disabled,
    id: boardDropLocationId(location),
  });
}
