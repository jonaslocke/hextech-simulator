"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import cardBackImage from "../../../../assets/cardback.jpg";
import { motion } from "motion/react";
import type { Card, ZoneKind } from "../types";
import { AttachmentCardGroup } from "./attachment-card-group";
import { CardTile } from "./card-tile";
import type { LocationTransferStartRect } from "../drag-and-drop/location-drag-actions";
import {
  boardLocationTransferNeedsDestinationRect,
  exactPlacementCandidateIndex,
} from "./card-zone-transfer-geometry";

export type CardZonePlacement = {
  attachments?: Card[];
  card: Card;
  layoutIndex?: number;
  ownerPlayerId: string;
  zoneId: string;
  zoneKind: ZoneKind | "battlefield";
};

export type ZoneAnimationCount = {
  count: number;
  ownerPlayerId: string;
  zoneId: string;
  zoneKind: ZoneKind | "battlefield";
};

export type RectSnapshot = LocationTransferStartRect;

type CapturedPlacement = CardZonePlacement & {
  rect?: RectSnapshot;
};

export type CardZoneAnimationSnapshot = {
  counts: Map<string, ZoneAnimationCount>;
  placements: Map<string, CapturedPlacement>;
  stateVersion: number;
};

export type CardZoneSourceReservation = {
  attachmentCount: number;
  cardInstanceId: string;
  slotIndex: number;
  sourceExhausted: boolean;
  zoneId: string;
};

type TransferAnimation = {
  attachments: Card[];
  card: Card;
  flipToBack: boolean;
  from: RectSnapshot;
  fromRotation: number;
  id: string;
  index: number;
  isBoardLocationTransfer: boolean;
  isVisibleDestination: boolean;
  sourceReservation?: CardZoneSourceReservation;
  to: RectSnapshot;
  toRotation: number;
};

type Props = {
  activeTransferStartRects?: ReadonlyMap<string, LocationTransferStartRect>;
  pendingSnapshot?: CardZoneAnimationSnapshot | null;
  placements: CardZonePlacement[];
  stateVersion: number;
  zoneCounts: ZoneAnimationCount[];
  onActiveCardIdsChange: (cardInstanceIds: Set<string>) => void;
  onActiveSourceReservationsChange?: (
    reservations: CardZoneSourceReservation[],
  ) => void;
  onPendingSnapshotConsumed?: () => void;
  onTransferStartRectsConsumed?: (cardInstanceIds: readonly string[]) => void;
};

const HIDDEN_DESTINATION_KINDS = new Set<ZoneKind>(["mainDeck", "runeDeck"]);
const BOARD_LOCATION_KINDS = new Set<ZoneKind | "battlefield">([
  "base",
  "battlefield",
]);

export function CardZoneTransferOverlay({
  activeTransferStartRects,
  pendingSnapshot,
  placements,
  stateVersion,
  zoneCounts,
  onActiveCardIdsChange,
  onActiveSourceReservationsChange,
  onPendingSnapshotConsumed,
  onTransferStartRectsConsumed,
}: Props) {
  const latestInputRef = useRef({
    placements,
    zoneCounts,
  });
  const previousRef = useRef<CardZoneAnimationSnapshot>({
    counts: new Map(),
    placements: new Map(),
    stateVersion,
  });
  const [transfers, setTransfers] = useState<TransferAnimation[]>([]);
  const [layoutRetryVersion, setLayoutRetryVersion] = useState(0);
  const boardDestinationRetryRef = useRef<string | null>(null);

  latestInputRef.current = {
    placements,
    zoneCounts,
  };

  const placementSignature = useMemo(
    () =>
      placements
        .map(
          (placement) =>
            `${placement.card.instanceId ?? ""}:${placement.zoneId}:${
              placement.card.isExhausted ? "e" : "r"
            }`,
        )
        .sort()
        .join("|"),
    [placements],
  );
  const countSignature = useMemo(
    () =>
      zoneCounts
        .map((zone) => `${zone.zoneId}:${zone.count}`)
        .sort()
        .join("|"),
    [zoneCounts],
  );

  useLayoutEffect(() => {
    const currentInput = latestInputRef.current;
    const nextCounts = new Map(
      currentInput.zoneCounts.map((zone) => [zone.zoneId, zone]),
    );
    const nextPlacements = capturePlacements(currentInput.placements);
    const fallbackPrevious = previousRef.current;
    const shouldUsePendingSnapshot =
      pendingSnapshot !== null &&
      pendingSnapshot !== undefined &&
      stateVersion > pendingSnapshot.stateVersion;
    const previous = shouldUsePendingSnapshot
      ? pendingSnapshot
      : fallbackPrevious;
    const isAuthoritativeTransition = stateVersion > previous.stateVersion;
    const missingBoardDestination = Array.from(previous.placements.entries()).find(
      ([cardInstanceId, previousPlacement]) => {
        const nextPlacement = nextPlacements.get(cardInstanceId);
        return Boolean(
          nextPlacement &&
            boardLocationTransferNeedsDestinationRect({
              fromZoneId: previousPlacement.zoneId,
              fromZoneKind: previousPlacement.zoneKind,
              hasDestinationRect: Boolean(nextPlacement.rect),
              toZoneId: nextPlacement.zoneId,
              toZoneKind: nextPlacement.zoneKind,
            }),
        );
      },
    );

    if (missingBoardDestination) {
      const [cardInstanceId, previousPlacement] = missingBoardDestination;
      const nextPlacement = nextPlacements.get(cardInstanceId)!;
      const retryKey = `${stateVersion}:${cardInstanceId}:${previousPlacement.zoneId}->${nextPlacement.zoneId}`;

      if (boardDestinationRetryRef.current !== retryKey) {
        boardDestinationRetryRef.current = retryKey;
        setLayoutRetryVersion((current) => current + 1);
      }
      return;
    }

    boardDestinationRetryRef.current = null;
    previousRef.current = {
      counts: nextCounts,
      placements: nextPlacements,
      stateVersion,
    };

    if (previous.placements.size === 0) {
      setTransfers((current) => (current.length === 0 ? current : []));
      if (shouldUsePendingSnapshot) {
        onPendingSnapshotConsumed?.();
      }
      return;
    }

    const nextTransfers: TransferAnimation[] = [];
    const consumedTransferStartIds: string[] = [];

    for (const [cardInstanceId, previousPlacement] of previous.placements) {
      if (!previousPlacement.rect) {
        continue;
      }

      const nextPlacement = nextPlacements.get(cardInstanceId);
      if (
        isAttachmentCoveredByMovingHost({
          cardInstanceId,
          nextPlacement,
          nextPlacements,
          previousPlacement,
          previousPlacements: previous.placements,
        })
      ) {
        continue;
      }

      const hiddenDestination = nextPlacement
        ? undefined
        : inferHiddenDestination({
            card: previousPlacement.card,
            counts: nextCounts,
            ownerPlayerId: previousPlacement.ownerPlayerId,
            previousCounts: previous.counts,
          });

      if (!nextPlacement && !hiddenDestination) {
        continue;
      }

      const destinationZoneId =
        nextPlacement?.zoneId ?? hiddenDestination?.zoneId;

      if (
        !destinationZoneId ||
        destinationZoneId === previousPlacement.zoneId
      ) {
        continue;
      }

      const destinationRect =
        nextPlacement?.rect ?? readZoneRect(destinationZoneId);

      if (!destinationRect) {
        continue;
      }

      const transferStartRect = activeTransferStartRects?.get(cardInstanceId);
      if (transferStartRect) {
        consumedTransferStartIds.push(cardInstanceId);
      }

      const isBoardLocationTransfer = Boolean(
        nextPlacement &&
          BOARD_LOCATION_KINDS.has(previousPlacement.zoneKind) &&
          BOARD_LOCATION_KINDS.has(nextPlacement.zoneKind),
      );
      const sourceReservation =
        isAuthoritativeTransition &&
        isBoardLocationTransfer &&
        previousPlacement.layoutIndex !== undefined
          ? {
              attachmentCount: previousPlacement.attachments?.length ?? 0,
              cardInstanceId,
              slotIndex: previousPlacement.layoutIndex,
              sourceExhausted: Boolean(previousPlacement.card.isExhausted),
              zoneId: previousPlacement.zoneId,
            }
          : undefined;

      nextTransfers.push({
        attachments:
          nextPlacement?.attachments ?? previousPlacement.attachments ?? [],
        card: nextPlacement?.card ?? previousPlacement.card,
        flipToBack: !nextPlacement,
        from: transferStartRect ?? previousPlacement.rect,
        fromRotation: previousPlacement.card.isExhausted ? 90 : 0,
        id: `${stateVersion}:${cardInstanceId}:${previousPlacement.zoneId}->${destinationZoneId}`,
        index: nextTransfers.length,
        isBoardLocationTransfer,
        isVisibleDestination: Boolean(nextPlacement?.rect),
        sourceReservation,
        to: destinationRect,
        toRotation: nextPlacement?.card.isExhausted ? 90 : 0,
      });
    }

    if (consumedTransferStartIds.length > 0) {
      onTransferStartRectsConsumed?.(consumedTransferStartIds);
    }

    if (nextTransfers.length === 0) {
      if (shouldUsePendingSnapshot) {
        onPendingSnapshotConsumed?.();
      }
      return;
    }

    setTransfers((current) => [...current, ...nextTransfers]);
    if (shouldUsePendingSnapshot) {
      onPendingSnapshotConsumed?.();
    }
  }, [
    activeTransferStartRects,
    countSignature,
    layoutRetryVersion,
    onPendingSnapshotConsumed,
    onTransferStartRectsConsumed,
    placementSignature,
    pendingSnapshot,
    stateVersion,
  ]);

  useLayoutEffect(() => {
    const activeCardIds = new Set<string>();
    const sourceReservations: CardZoneSourceReservation[] = [];

    for (const transfer of transfers) {
      if (transfer.isVisibleDestination) {
        if (transfer.card.instanceId) {
          activeCardIds.add(transfer.card.instanceId);
        }
        for (const attachment of transfer.attachments) {
          if (attachment.instanceId) {
            activeCardIds.add(attachment.instanceId);
          }
        }
      }
      if (transfer.sourceReservation) {
        sourceReservations.push(transfer.sourceReservation);
      }
    }

    onActiveCardIdsChange(activeCardIds);
    onActiveSourceReservationsChange?.(sourceReservations);
  }, [
    onActiveCardIdsChange,
    onActiveSourceReservationsChange,
    transfers,
  ]);

  if (transfers.length === 0) {
    return null;
  }

  return (
    <div className="z-[2147483645] fixed inset-0 pointer-events-none">
      {transfers.map((transfer) => (
        <TransferCard
          key={transfer.id}
          transfer={transfer}
          onComplete={() => {
            requestAnimationFrame(() => {
              setTransfers((current) =>
                current.filter((item) => item.id !== transfer.id),
              );
            });
          }}
        />
      ))}
    </div>
  );
}

export function captureCardZoneAnimationSnapshot({
  placements,
  stateVersion,
  zoneCounts,
}: {
  placements: CardZonePlacement[];
  stateVersion: number;
  zoneCounts: ZoneAnimationCount[];
}): CardZoneAnimationSnapshot {
  return {
    counts: new Map(zoneCounts.map((zone) => [zone.zoneId, zone])),
    placements: capturePlacements(placements),
    stateVersion,
  };
}

function TransferCard({
  onComplete,
  transfer,
}: {
  onComplete: () => void;
  transfer: TransferAnimation;
}) {
  const target = targetGeometry(transfer);
  const delay = transfer.isBoardLocationTransfer ? 0 : transfer.index * 0.045;
  const renderAttachmentGroup =
    transfer.isVisibleDestination && transfer.attachments.length > 0;

  return (
    <motion.div
      animate={{
        opacity: transfer.isVisibleDestination ? 1 : 0,
        rotate: renderAttachmentGroup ? 0 : transfer.toRotation,
        scale: target.scale,
        x: target.x,
        y: target.y,
      }}
      className="fixed transform-gpu"
      initial={{
        opacity: 1,
        rotate: renderAttachmentGroup ? 0 : transfer.fromRotation,
        scale: 1,
        x: 0,
        y: 0,
      }}
      onAnimationComplete={onComplete}
      style={{
        height: transfer.from.height,
        left: transfer.from.left,
        top: transfer.from.top,
        transformOrigin: "center center",
        width: transfer.from.width,
        willChange: "transform, opacity",
      }}
      transition={{
        delay,
        duration: transfer.isVisibleDestination ? 0.42 : 0.48,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {renderAttachmentGroup ? (
        <TransferAttachmentGroup delay={delay} transfer={transfer} />
      ) : (
        <TransferCardFaces delay={delay} transfer={transfer} />
      )}
    </motion.div>
  );
}

function TransferAttachmentGroup({
  delay,
  transfer,
}: {
  delay: number;
  transfer: TransferAnimation;
}) {
  const groupId = transfer.card.instanceId ?? transfer.id;
  const host = (
    <motion.div
      animate={{ rotate: transfer.toRotation }}
      initial={{ rotate: transfer.fromRotation }}
      style={{ transformOrigin: "center center" }}
      transition={{
        delay,
        duration: 0.42,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      <CardTile
        enableHoverPreview={false}
        enableZoneAnimation={false}
        focusablePreview={false}
        preserveOrientation
        showMight
        {...transfer.card}
      />
    </motion.div>
  );

  return (
    <AttachmentCardGroup
      attachments={transfer.attachments.map((attachment, index) => ({
        id: attachment.instanceId ?? `${attachment.name}-${index}`,
        card: (
          <CardTile
            enableHoverPreview={false}
            enableZoneAnimation={false}
            focusablePreview={false}
            showMight
            {...attachment}
          />
        ),
      }))}
      groupId={groupId}
      host={host}
    />
  );
}

function TransferCardFaces({
  delay,
  transfer,
}: {
  delay: number;
  transfer: TransferAnimation;
}) {
  return (
    <motion.div
      animate={{ rotateY: transfer.flipToBack ? 180 : 0 }}
      className="relative bg-slate-900 shadow-[0_18px_45px_rgba(0,0,0,0.65)] border border-yellow-300/50 rounded-md w-full h-full transform-gpu"
      initial={{ rotateY: 0 }}
      style={{
        transformStyle: "preserve-3d",
        willChange: "transform",
      }}
      transition={{
        delay: delay + 0.04,
        duration: 0.34,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- Transfer overlay renders existing card art. */}
      <img
        alt=""
        className="block absolute inset-0 rounded-md w-full h-full object-cover"
        draggable={false}
        src={transfer.card.img}
        style={{ backfaceVisibility: "hidden" }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- Transfer overlay renders the local card back asset. */}
      <img
        alt=""
        className="block absolute inset-0 rounded-md w-full h-full object-cover"
        draggable={false}
        src={cardBackImage.src}
        style={{
          backfaceVisibility: "hidden",
          transform: "rotateY(180deg)",
        }}
      />
    </motion.div>
  );
}

function capturePlacements(placements: CardZonePlacement[]) {
  const captured = new Map<string, CapturedPlacement>();

  for (const placement of placements) {
    const cardInstanceId = placement.card.instanceId;

    if (!cardInstanceId) {
      continue;
    }

    captured.set(cardInstanceId, {
      ...placement,
      rect: readPlacementRect(placement),
    });
  }

  return captured;
}

function readPlacementRect(placement: CardZonePlacement) {
  const cardInstanceId = placement.card.instanceId;
  if (!cardInstanceId) {
    return undefined;
  }

  const matchingElements = Array.from(
    document.querySelectorAll<HTMLElement>("[data-card-instance-id]"),
  ).filter(
    (element) => element.dataset.cardInstanceId === cardInstanceId,
  );
  const candidateZoneIds = matchingElements.map(
    (candidate) =>
      candidate.closest<HTMLElement>("[data-zone-animation-id]")?.dataset
        .zoneAnimationId,
  );
  const exactIndex = exactPlacementCandidateIndex(
    placement.zoneId,
    candidateZoneIds,
  );
  const element = exactIndex >= 0 ? matchingElements[exactIndex] : undefined;

  if (!element) {
    return undefined;
  }

  if ((placement.attachments?.length ?? 0) > 0) {
    const group = element.closest<HTMLElement>("[data-attachment-group-id]");
    if (group?.dataset.attachmentGroupId === cardInstanceId) {
      return toSnapshot(group.getBoundingClientRect());
    }
  }

  return toSnapshot(element.getBoundingClientRect());
}

function readZoneRect(zoneId: string) {
  const element = Array.from(
    document.querySelectorAll<HTMLElement>("[data-zone-animation-id]"),
  ).find((candidate) => candidate.dataset.zoneAnimationId === zoneId);

  return element ? toSnapshot(element.getBoundingClientRect()) : undefined;
}

function inferHiddenDestination({
  card,
  counts,
  ownerPlayerId,
  previousCounts,
}: {
  card: Card;
  counts: Map<string, ZoneAnimationCount>;
  ownerPlayerId: string;
  previousCounts: Map<string, ZoneAnimationCount>;
}) {
  const candidateZones = Array.from(counts.values()).filter(
    (zone) =>
      zone.ownerPlayerId === ownerPlayerId &&
      HIDDEN_DESTINATION_KINDS.has(zone.zoneKind as ZoneKind) &&
      zone.count > (previousCounts.get(zone.zoneId)?.count ?? 0),
  );

  if (candidateZones.length === 0) {
    return undefined;
  }

  const preferredKind = card.type === "Rune" ? "runeDeck" : "mainDeck";

  return (
    candidateZones.find((zone) => zone.zoneKind === preferredKind) ??
    candidateZones[0]
  );
}

function isAttachmentCoveredByMovingHost({
  cardInstanceId,
  nextPlacement,
  nextPlacements,
  previousPlacement,
  previousPlacements,
}: {
  cardInstanceId: string;
  nextPlacement: CapturedPlacement | undefined;
  nextPlacements: Map<string, CapturedPlacement>;
  previousPlacement: CapturedPlacement;
  previousPlacements: Map<string, CapturedPlacement>;
}) {
  const hostId =
    nextPlacement?.card.attachedToCardInstanceId ??
    previousPlacement.card.attachedToCardInstanceId;
  if (!hostId || hostId === cardInstanceId) {
    return false;
  }

  const previousHost = previousPlacements.get(hostId);
  const nextHost = nextPlacements.get(hostId);
  if (!previousHost || !nextHost || !nextPlacement) {
    return false;
  }

  return (
    previousHost.zoneId !== nextHost.zoneId &&
    previousPlacement.zoneId === previousHost.zoneId &&
    nextPlacement.zoneId === nextHost.zoneId
  );
}

function targetGeometry(transfer: TransferAnimation) {
  const fromCenterX = transfer.from.left + transfer.from.width / 2;
  const fromCenterY = transfer.from.top + transfer.from.height / 2;
  const toCenterX = transfer.to.left + transfer.to.width / 2;
  const toCenterY = transfer.to.top + transfer.to.height / 2;

  if (transfer.isVisibleDestination) {
    return {
      scale: Math.min(
        transfer.to.width / transfer.from.width,
        transfer.to.height / transfer.from.height,
      ),
      x: toCenterX - fromCenterX,
      y: toCenterY - fromCenterY,
    };
  }

  const scale = Math.min(
    0.72,
    Math.max(
      0.38,
      Math.min(transfer.to.width, transfer.to.height) / transfer.from.width,
    ),
  );

  return {
    scale,
    x: toCenterX - fromCenterX,
    y: toCenterY - fromCenterY,
  };
}

function toSnapshot(rect: DOMRect): RectSnapshot {
  return {
    height: rect.height,
    left: rect.left,
    top: rect.top,
    width: rect.width,
  };
}
