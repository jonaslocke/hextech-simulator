"use client";

import { createPortal } from "react-dom";
import { useLayoutEffect, useState, type MouseEvent } from "react";
import { DraggableLocationCard } from "../drag-and-drop/draggable-location-card";
import type { MovementDraftView } from "../interactions/movement-draft";
import type { Card } from "../types";
import { AttachmentCardGroup } from "./attachment-card-group";
import { CardTile } from "./card-tile";

export function MovementDraftStage({
  canDrag,
  hiddenCardInstanceIds,
  movementDraft,
  onCardPrimaryAction,
  onCardPointerEnter,
  onCardPointerLeave,
}: {
  canDrag: boolean;
  hiddenCardInstanceIds?: Set<string>;
  movementDraft: MovementDraftView | null;
  onCardPrimaryAction?: (
    card: Card,
    event?: MouseEvent<HTMLDivElement>,
  ) => void;
  onCardPointerEnter?: (card: Card) => void;
  onCardPointerLeave?: (card: Card) => void;
}) {
  const destinationZoneId = movementDraft
    ? `battlefield:${movementDraft.destination.battlefieldId}:player`
    : null;
  const [destinationElement, setDestinationElement] =
    useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!destinationZoneId) {
      setDestinationElement(null);
      return;
    }

    const destination = Array.from(
      document.querySelectorAll<HTMLElement>("[data-zone-animation-id]"),
    ).find(
      (candidate) =>
        candidate.dataset.zoneAnimationId === destinationZoneId,
    );
    setDestinationElement(destination ?? null);
  }, [destinationZoneId]);

  if (!movementDraft || !destinationElement) {
    return null;
  }

  return createPortal(
    <>
      {movementDraft.stagedUnits.map(
        ({ attachments, stagedUnit }, stagedIndex) => {
          const unitId = stagedUnit.instanceId;
          const key = unitId ?? `${stagedUnit.name}-${stagedIndex}`;
          const tile = (
            <CardTile
              enableHoverPreview
              isStagedForMovement
              isTransferHidden={
                unitId ? hiddenCardInstanceIds?.has(unitId) : false
              }
              onPrimaryAction={
                onCardPrimaryAction
                  ? (event) => onCardPrimaryAction(stagedUnit, event)
                  : undefined
              }
              onHighlightPointerEnter={
                onCardPointerEnter
                  ? () => onCardPointerEnter(stagedUnit)
                  : undefined
              }
              onHighlightPointerLeave={
                onCardPointerLeave
                  ? () => onCardPointerLeave(stagedUnit)
                  : undefined
              }
              showMight
              {...stagedUnit}
            />
          );
          const host =
            canDrag && unitId ? (
              <DraggableLocationCard
                cardInstanceId={unitId}
                registrationKey="movement-draft-stage"
                sourceLocation={movementDraft.destination}
              >
                {tile}
              </DraggableLocationCard>
            ) : (
              tile
            );

          if (attachments.length === 0) {
            return <div key={key}>{host}</div>;
          }

          return (
            <AttachmentCardGroup
              attachments={attachments.map((attachment, attachmentIndex) => ({
                id:
                  attachment.instanceId ??
                  `${attachment.name}-${attachmentIndex}`,
                card: (
                  <CardTile
                    enableHoverPreview
                    isTransferHidden={
                      attachment.instanceId
                        ? hiddenCardInstanceIds?.has(attachment.instanceId)
                        : false
                    }
                    showMight
                    {...attachment}
                  />
                ),
              }))}
              groupId={key}
              host={host}
              key={key}
            />
          );
        },
      )}
    </>,
    destinationElement,
  );
}
