"use client";

import type { ProjectedAction } from "@/shared/game";
import type { DragEndEvent, DragOverEvent } from "@dnd-kit/core";
import { useCallback, useMemo, useRef, useState } from "react";
import { buildCard } from "../board-model";
import type { BoardCatalogCard, BoardProjection } from "../board-view-model";
import { AttachmentCardGroup } from "../components/attachment-card-group";
import { CardTile } from "../components/card-tile";
import {
  boardLocationDropStatus,
  findLocationDragActionForDrop,
  isBoardDropLocationData,
  isLocationDragData,
  legalDropLocationsForCard,
  locationDragActionKind,
  movementDraftDropIntent,
  movementDraftLegalDropLocationsForCard,
  type BoardDropLocation,
  type LocationDragData,
  type LocationTransferStartRect,
  type MovementDraftDragContext,
} from "../drag-and-drop/location-drag-actions";

export function useBoardLocationDragState({
  actions,
  cardsByInstanceId,
  cardStates,
  movementDraft,
  onAcceptedMoveDrop,
  onAcceptedPlayDrop,
  onStageMovementDraftCard,
  onUnstageMovementDraftCard,
}: {
  actions: readonly ProjectedAction[];
  cardsByInstanceId: Record<string, BoardCatalogCard>;
  cardStates: BoardProjection["cardStates"];
  movementDraft?: MovementDraftDragContext | null;
  onAcceptedMoveDrop?: (action: ProjectedAction) => void | Promise<boolean>;
  onAcceptedPlayDrop?: (action: ProjectedAction) => void | Promise<boolean>;
  onStageMovementDraftCard?: (cardInstanceId: string) => void;
  onUnstageMovementDraftCard?: (cardInstanceId: string) => void;
}) {
  const [activeLocationDrag, setActiveLocationDrag] =
    useState<LocationDragData | null>(null);
  const [hoveredLocationDrop, setHoveredLocationDrop] =
    useState<BoardDropLocation | null>(null);
  const [activeTransferStartRects, setActiveTransferStartRects] = useState<
    Map<string, LocationTransferStartRect>
  >(new Map());

  const activeLocationDragRef = useRef<LocationDragData | null>(null);
  const hoveredLocationDropRef = useRef<BoardDropLocation | null>(null);

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

  const activeLocationDragAttachments = useMemo(() => {
    if (!activeLocationDrag) {
      return [];
    }

    return Object.entries(cardStates).flatMap(([cardInstanceId, state]) =>
      state?.attachedToCardInstanceId ===
      activeLocationDrag.sourceCardInstanceId
        ? buildCard(cardInstanceId, cardsByInstanceId, cardStates)
        : [],
    );
  }, [activeLocationDrag, cardStates, cardsByInstanceId]);

  const activeLocationDragAttachmentIds = useMemo(
    () =>
      new Set(
        activeLocationDragAttachments.flatMap((card) =>
          card.instanceId ? [card.instanceId] : [],
        ),
      ),
    [activeLocationDragAttachments],
  );

  const activeLocationDragLegalDrops = useMemo(() => {
    if (!activeLocationDrag) {
      return [];
    }

    if (movementDraft) {
      return movementDraftLegalDropLocationsForCard({
        movementDraft,
        sourceCardInstanceId: activeLocationDrag.sourceCardInstanceId,
      });
    }

    return legalDropLocationsForCard({
      actions,
      sourceCardInstanceId: activeLocationDrag.sourceCardInstanceId,
      sourceLocation: activeLocationDrag.sourceLocation,
    });
  }, [actions, activeLocationDrag, movementDraft]);

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

    const host = (
      <CardTile
        {...activeLocationDragCard}
        enableHoverPreview={false}
        enableZoneAnimation={false}
        focusablePreview={false}
      />
    );

    return (
      <div
        className="inline-flex opacity-95 pointer-events-none"
        style={{
          filter:
            "drop-shadow(0 0 1px rgba(103,232,249,0.95)) drop-shadow(0 0 8px rgba(103,232,249,0.75)) drop-shadow(0 0 22px rgba(103,232,249,0.35))",
        }}
      >
        {activeLocationDragAttachments.length > 0 &&
        activeLocationDragCard.instanceId ? (
          <AttachmentCardGroup
            attachments={activeLocationDragAttachments.map(
              (attachment, index) => ({
                id:
                  attachment.instanceId ??
                  `${attachment.name}-${index}`,
                card: (
                  <CardTile
                    {...attachment}
                    enableHoverPreview={false}
                    enableZoneAnimation={false}
                    focusablePreview={false}
                  />
                ),
              }),
            )}
            groupId={activeLocationDragCard.instanceId}
            host={host}
          />
        ) : (
          host
        )}
      </div>
    );
  }, [activeLocationDragAttachments, activeLocationDragCard]);

  const setHoveredDrop = useCallback((location: BoardDropLocation | null) => {
    hoveredLocationDropRef.current = location;
    setHoveredLocationDrop(location);
  }, []);

  const handleLocationDragDataChange = useCallback(
    (data: LocationDragData | null) => {
      const nextData =
        data &&
        movementDraft &&
        !movementDraft.eligibleCardInstanceIds.has(data.sourceCardInstanceId) &&
        !movementDraft.stagedCardInstanceIds.has(data.sourceCardInstanceId)
          ? null
          : data;

      activeLocationDragRef.current = nextData;
      setActiveLocationDrag(nextData);

      if (!nextData) {
        setHoveredDrop(null);
      }
    },
    [movementDraft, setHoveredDrop],
  );

  const handleLocationDragCancel = useCallback(() => {
    setHoveredDrop(null);
  }, [setHoveredDrop]);

  const handleLocationDragOver = useCallback(
    (event: DragOverEvent) => {
      const overData = event.over?.data.current;

      setHoveredDrop(
        isBoardDropLocationData(overData) ? overData.location : null,
      );
    },
    [setHoveredDrop],
  );

  const rememberTransferStartRect = useCallback(
    (event: DragEndEvent, cardInstanceId: string) => {
      const group = Array.from(
        document.querySelectorAll<HTMLElement>("[data-attachment-group-id]"),
      ).find(
        (candidate) =>
          candidate.dataset.attachmentGroupId === cardInstanceId &&
          candidate.querySelector('[data-location-dragging="true"]'),
      );
      const groupRect = group?.getBoundingClientRect();
      const translatedRect = event.active.rect.current.translated;
      const initialRect = event.active.rect.current.initial;
      const sourceRect = groupRect ?? translatedRect ?? initialRect;

      if (!sourceRect) {
        return;
      }

      const rect = groupRect
        ? {
            height: groupRect.height,
            left: groupRect.left + event.delta.x,
            top: groupRect.top + event.delta.y,
            width: groupRect.width,
          }
        : {
            height: sourceRect.height,
            left: sourceRect.left,
            top: sourceRect.top,
            width: sourceRect.width,
          };

      setActiveTransferStartRects((current) => {
        const next = new Map(current);
        next.set(cardInstanceId, rect);
        return next;
      });
    },
    [],
  );

  const discardTransferStartRect = useCallback((cardInstanceId: string) => {
    setActiveTransferStartRects((current) => {
      if (!current.has(cardInstanceId)) {
        return current;
      }
      const next = new Map(current);
      next.delete(cardInstanceId);
      return next;
    });
  }, []);

  const consumeTransferStartRects = useCallback(
    (cardInstanceIds: readonly string[]) => {
      setActiveTransferStartRects((current) => {
        const next = new Map(current);
        let changed = false;
        for (const cardInstanceId of cardInstanceIds) {
          changed = next.delete(cardInstanceId) || changed;
        }
        return changed ? next : current;
      });
    },
    [],
  );

  const handleLocationDragEnd = useCallback(
    (event: DragEndEvent) => {
      const activeData = event.active.data.current;
      const dragData = isLocationDragData(activeData)
        ? activeData
        : activeLocationDragRef.current;

      const overData = event.over?.data.current;
      const destinationFromDropData = isBoardDropLocationData(overData)
        ? overData.location
        : null;

      const destination =
        destinationFromDropData ?? hoveredLocationDropRef.current;

      setHoveredDrop(null);

      if (!dragData || !destination) {
        return;
      }

      if (movementDraft) {
        const intent = movementDraftDropIntent({
          destination,
          movementDraft,
          sourceCardInstanceId: dragData.sourceCardInstanceId,
        });
        if (!intent) {
          return;
        }

        rememberTransferStartRect(
          event,
          dragData.sourceCardInstanceId,
        );
        if (intent === "stage") {
          onStageMovementDraftCard?.(dragData.sourceCardInstanceId);
        } else {
          onUnstageMovementDraftCard?.(dragData.sourceCardInstanceId);
        }
        return;
      }

      const action = findLocationDragActionForDrop({
        actions,
        destination,
        sourceCardInstanceId: dragData.sourceCardInstanceId,
        sourceLocation: dragData.sourceLocation,
      });

      const actionKind = action ? locationDragActionKind(action) : null;

      if (!action || !actionKind) {
        return;
      }

      if (actionKind === "move") {
        if (!onAcceptedMoveDrop) {
          return;
        }

        rememberTransferStartRect(event, dragData.sourceCardInstanceId);
        void Promise.resolve(onAcceptedMoveDrop(action)).then((accepted) => {
          if (accepted === false) {
            discardTransferStartRect(dragData.sourceCardInstanceId);
          }
        });
        return;
      }

      if (actionKind === "play") {
        if (!onAcceptedPlayDrop) {
          return;
        }

        void onAcceptedPlayDrop(action);
      }
    },
    [
      actions,
      discardTransferStartRect,
      movementDraft,
      onAcceptedMoveDrop,
      onAcceptedPlayDrop,
      onStageMovementDraftCard,
      onUnstageMovementDraftCard,
      rememberTransferStartRect,
      setHoveredDrop,
    ],
  );

  return {
    activeLocationDrag,
    activeLocationDragAttachmentIds,
    activeLocationDragOverlay,
    activeTransferStartRects,
    consumeTransferStartRects,
    getLocationDropStatus,
    handleLocationDragCancel,
    handleLocationDragDataChange,
    handleLocationDragEnd,
    handleLocationDragOver,
    isLocationDropEnabled,
  };
}
