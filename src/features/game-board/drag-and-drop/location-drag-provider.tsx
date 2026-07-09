"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragCancelEvent,
  type DragEndEvent,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  createContext,
  useContext,
  useMemo,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  isLocationDragData,
  type LocationDragData,
} from "./location-drag-actions";

export const LOCATION_DRAG_HOLD_DELAY_MS = 180;
export const LOCATION_DRAG_HOLD_TOLERANCE_PX = 6;

type LocationDragState = {
  isLocationDragActive: boolean;
};

const LocationDragStateContext = createContext<LocationDragState>({
  isLocationDragActive: false,
});

const locationDragCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);

  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }

  return rectIntersection(args);
};

export function useLocationDragState() {
  return useContext(LocationDragStateContext);
}

type LocationDragProviderProps = PropsWithChildren<{
  activeDragData?: LocationDragData | null;
  dragOverlay?: ReactNode;
  onActiveDragDataChange?: (data: LocationDragData | null) => void;
  onDragCancel?: (event: DragCancelEvent) => void;
  onDragEnd?: (event: DragEndEvent) => void;
  onDragMove?: (event: DragMoveEvent) => void;
  onDragOver?: (event: DragOverEvent) => void;
  onDragStart?: (event: DragStartEvent) => void;
}>;

export function LocationDragProvider({
  activeDragData = null,
  children,
  dragOverlay = null,
  onActiveDragDataChange,
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

  const dragState = useMemo(
    () => ({
      isLocationDragActive: Boolean(activeDragData),
    }),
    [activeDragData],
  );

  return (
    <LocationDragStateContext.Provider value={dragState}>
      <DndContext
        autoScroll={false}
        collisionDetection={locationDragCollisionDetection}
        onDragCancel={(event) => {
          onDragCancel?.(event);
          onActiveDragDataChange?.(null);
        }}
        onDragEnd={(event) => {
          onDragEnd?.(event);
          onActiveDragDataChange?.(null);
        }}
        onDragMove={onDragMove}
        onDragOver={onDragOver}
        onDragStart={(event) => {
          const dragData = event.active.data.current;

          if (isLocationDragData(dragData)) {
            onActiveDragDataChange?.(dragData);
          } else {
            onActiveDragDataChange?.(null);
          }

          onDragStart?.(event);
        }}
        sensors={sensors}
      >
        {children}

        <DragOverlay adjustScale={false} dropAnimation={null}>
          {activeDragData ? dragOverlay : null}
        </DragOverlay>
      </DndContext>
    </LocationDragStateContext.Provider>
  );
}
