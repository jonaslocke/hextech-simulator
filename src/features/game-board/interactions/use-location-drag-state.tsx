"use client";

import type { ProjectedAction } from "@/shared/game";
import type { DragOverEvent } from "@dnd-kit/core";
import { useCallback, useMemo, useState } from "react";
import { buildCard } from "../board-model";
import type { BoardCatalogCard, BoardProjection } from "../board-view-model";
import { CardTile } from "../components/card-tile";
import {
  boardLocationDropStatus,
  isBoardDropLocationData,
  legalDropLocationsForCard,
  type BoardDropLocation,
  type LocationDragData,
} from "../drag-and-drop/location-drag-actions";

export function useBoardLocationDragState({
  actions,
  cardsByInstanceId,
  cardStates,
}: {
  actions: readonly ProjectedAction[];
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  cardStates: BoardProjection["cardStates"];
}) {
  const [activeLocationDrag, setActiveLocationDrag] =
    useState<LocationDragData | null>(null);
  const [hoveredLocationDrop, setHoveredLocationDrop] =
    useState<BoardDropLocation | null>(null);

  const activeLocationDragCard = useMemo(() => {
    if (!activeLocationDrag) {
      return null;
    }

    return (
      buildCard(
        activeLocationDrag.sourceCardInstanceId,
        cardsByInstanceId,
        cardStates,
      )[0] ?? null
    );
  }, [activeLocationDrag, cardStates, cardsByInstanceId]);

  const activeLocationDragLegalDrops = useMemo(
    () =>
      activeLocationDrag
        ? legalDropLocationsForCard({
            actions,
            sourceCardInstanceId: activeLocationDrag.sourceCardInstanceId,
            sourceLocation: activeLocationDrag.sourceLocation,
          })
        : [],
    [actions, activeLocationDrag],
  );

  const isLocationDropEnabled = Boolean(activeLocationDrag);

  const getLocationDropStatus = useCallback(
    (location: BoardDropLocation) =>
      boardLocationDropStatus({
        active: isLocationDropEnabled,
        hoveredLocation: hoveredLocationDrop,
        legalLocations: activeLocationDragLegalDrops,
        location,
      }),
    [activeLocationDragLegalDrops, hoveredLocationDrop, isLocationDropEnabled],
  );

  const activeLocationDragOverlay = useMemo(() => {
    if (!activeLocationDragCard) {
      return null;
    }

    return (
      <div
        className="inline-flex opacity-95 pointer-events-none"
        style={{
          filter:
            "drop-shadow(0 0 1px rgba(103,232,249,0.95)) drop-shadow(0 0 8px rgba(103,232,249,0.75)) drop-shadow(0 0 22px rgba(103,232,249,0.35))",
        }}
      >
        <CardTile
          {...activeLocationDragCard}
          enableHoverPreview={false}
          enableZoneAnimation={false}
          focusablePreview={false}
        />
      </div>
    );
  }, [activeLocationDragCard]);

  const handleLocationDragDataChange = useCallback(
    (data: LocationDragData | null) => {
      setActiveLocationDrag(data);

      if (!data) {
        setHoveredLocationDrop(null);
      }
    },
    [],
  );

  const clearHoveredLocationDrop = useCallback(() => {
    setHoveredLocationDrop(null);
  }, []);

  const handleLocationDragOver = useCallback((event: DragOverEvent) => {
    const overData = event.over?.data.current;

    setHoveredLocationDrop(
      isBoardDropLocationData(overData) ? overData.location : null,
    );
  }, []);

  return {
    activeLocationDrag,
    activeLocationDragOverlay,
    getLocationDropStatus,
    handleLocationDragCancel: clearHoveredLocationDrop,
    handleLocationDragDataChange,
    handleLocationDragEnd: clearHoveredLocationDrop,
    handleLocationDragOver,
    isLocationDropEnabled,
  };
}
