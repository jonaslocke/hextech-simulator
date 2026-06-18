"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import cardBackImage from "../../../../assets/cardback.jpg";
import { motion } from "motion/react";
import type { Card, ZoneKind } from "../types";

export type CardZonePlacement = {
  card: Card;
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

type RectSnapshot = {
  height: number;
  left: number;
  top: number;
  width: number;
};

type CapturedPlacement = CardZonePlacement & {
  rect?: RectSnapshot;
};

export type CardZoneAnimationSnapshot = {
  counts: Map<string, ZoneAnimationCount>;
  placements: Map<string, CapturedPlacement>;
  stateVersion: number;
};

type TransferAnimation = {
  card: Card;
  flipToBack: boolean;
  from: RectSnapshot;
  fromRotation: number;
  id: string;
  index: number;
  isVisibleDestination: boolean;
  to: RectSnapshot;
  toRotation: number;
};

type Props = {
  pendingSnapshot?: CardZoneAnimationSnapshot | null;
  placements: CardZonePlacement[];
  stateVersion: number;
  zoneCounts: ZoneAnimationCount[];
  onActiveCardIdsChange: (cardInstanceIds: Set<string>) => void;
  onPendingSnapshotConsumed?: () => void;
};

const HIDDEN_DESTINATION_KINDS = new Set<ZoneKind>(["mainDeck", "runeDeck"]);

export function CardZoneTransferOverlay({
  pendingSnapshot,
  placements,
  stateVersion,
  zoneCounts,
  onActiveCardIdsChange,
  onPendingSnapshotConsumed,
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

  latestInputRef.current = {
    placements,
    zoneCounts,
  };

  const placementSignature = useMemo(
    () =>
      placements
        .map((placement) => `${placement.card.instanceId ?? ""}:${placement.zoneId}`)
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

    for (const [cardInstanceId, previousPlacement] of previous.placements) {
      if (!previousPlacement.rect) {
        continue;
      }

      const nextPlacement = nextPlacements.get(cardInstanceId);
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

      const destinationZoneId = nextPlacement?.zoneId ?? hiddenDestination?.zoneId;

      if (!destinationZoneId || destinationZoneId === previousPlacement.zoneId) {
        continue;
      }

      if (isBaseToBattlefield(previousPlacement, nextPlacement)) {
        continue;
      }

      const destinationRect =
        nextPlacement?.rect ?? readZoneRect(destinationZoneId);

      if (!destinationRect) {
        continue;
      }

      nextTransfers.push({
        card: previousPlacement.card,
        flipToBack: !nextPlacement,
        from: previousPlacement.rect,
        fromRotation: previousPlacement.card.isExhausted ? 90 : 0,
        id: `${stateVersion}:${cardInstanceId}:${previousPlacement.zoneId}->${destinationZoneId}`,
        index: nextTransfers.length,
        isVisibleDestination: Boolean(nextPlacement?.rect),
        to: destinationRect,
        toRotation: nextPlacement?.card.isExhausted ? 90 : 0,
      });
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
    countSignature,
    onPendingSnapshotConsumed,
    placementSignature,
    pendingSnapshot,
    stateVersion,
  ]);

  useLayoutEffect(() => {
    onActiveCardIdsChange(
      new Set(
        transfers.flatMap((transfer) =>
          transfer.isVisibleDestination && transfer.card.instanceId
            ? [transfer.card.instanceId]
            : [],
        ),
      ),
    );
  }, [onActiveCardIdsChange, transfers]);

  if (transfers.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[2147483645]">
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

  return (
    <motion.div
      animate={{
        left: target.left,
        opacity: transfer.isVisibleDestination ? 1 : 0,
        rotate: transfer.toRotation,
        scale: target.scale,
        top: target.top,
      }}
      className="fixed rounded-md border border-yellow-300/50 bg-slate-900 shadow-[0_18px_45px_rgba(0,0,0,0.65)]"
      initial={{
        left: transfer.from.left,
        opacity: 1,
        rotate: transfer.fromRotation,
        scale: 1,
        top: transfer.from.top,
      }}
      onAnimationComplete={onComplete}
      style={{
        height: transfer.from.height,
        transformOrigin: "center center",
        width: transfer.from.width,
      }}
      transition={{
        delay: transfer.index * 0.06,
        duration: transfer.isVisibleDestination ? 0.34 : 0.42,
        ease: [0.22, 1, 0.36, 1],
      }}
    >
      <motion.div
        animate={{ rotateY: transfer.flipToBack ? 180 : 0 }}
        className="relative h-full w-full"
        initial={{ rotateY: 0 }}
        style={{
          transformStyle: "preserve-3d",
        }}
        transition={{
          delay: transfer.index * 0.06,
          duration: 0.32,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Transfer overlay renders existing card art. */}
        <img
          alt=""
          className="absolute inset-0 block h-full w-full rounded-md object-cover"
          draggable={false}
          src={transfer.card.img}
          style={{ backfaceVisibility: "hidden" }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- Transfer overlay renders the local card back asset. */}
        <img
          alt=""
          className="absolute inset-0 block h-full w-full rounded-md object-cover"
          draggable={false}
          src={cardBackImage.src}
          style={{
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
          }}
        />
      </motion.div>
    </motion.div>
  );
}

function capturePlacements(placements: CardZonePlacement[]) {
  const rects = readCardRects();
  const captured = new Map<string, CapturedPlacement>();

  for (const placement of placements) {
    const cardInstanceId = placement.card.instanceId;

    if (!cardInstanceId) {
      continue;
    }

    captured.set(cardInstanceId, {
      ...placement,
      rect: rects.get(cardInstanceId),
    });
  }

  return captured;
}

function readCardRects() {
  const rects = new Map<string, RectSnapshot>();

  document
    .querySelectorAll<HTMLElement>("[data-card-instance-id]")
    .forEach((element) => {
      const cardInstanceId = element.dataset.cardInstanceId;

      if (!cardInstanceId || rects.has(cardInstanceId)) {
        return;
      }

      rects.set(cardInstanceId, toSnapshot(element.getBoundingClientRect()));
    });

  return rects;
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

function isBaseToBattlefield(
  previousPlacement: CapturedPlacement,
  nextPlacement: CapturedPlacement | undefined,
) {
  return (
    previousPlacement.zoneKind === "base" &&
    nextPlacement?.zoneKind === "battlefield"
  );
}

function targetGeometry(transfer: TransferAnimation) {
  if (transfer.isVisibleDestination) {
    return {
      left: transfer.to.left,
      scale: transfer.to.width / transfer.from.width,
      top: transfer.to.top,
    };
  }

  const scale = Math.min(
    0.72,
    Math.max(0.38, Math.min(transfer.to.width, transfer.to.height) / transfer.from.width),
  );

  return {
    left: transfer.to.left + transfer.to.width / 2 - transfer.from.width / 2,
    scale,
    top: transfer.to.top + transfer.to.height / 2 - transfer.from.height / 2,
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
