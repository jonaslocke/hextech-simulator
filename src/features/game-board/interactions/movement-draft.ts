import type { BoardModel } from "../board-model";
import type {
  CardZonePlacement,
  ZoneAnimationCount,
} from "../components/card-zone-transfer-overlay";
import { groupCardsByAttachment } from "../components/attachment-layout";
import type { BoardDropLocation } from "../drag-and-drop/location-drag-actions";
import type { BattlefieldData, Card } from "../types";

type UnitVisualGroup = {
  attachments: Card[];
  origin: BoardDropLocation;
  unit: Card;
};

export type StagedMovementUnit = UnitVisualGroup & {
  stagedUnit: Card;
};

export type MovementDraftView = {
  destination: Extract<BoardDropLocation, { kind: "battlefield" }>;
  eligibleCardInstanceIds: Set<string>;
  hiddenCardInstanceIds: Set<string>;
  originByCardInstanceId: Map<string, BoardDropLocation>;
  stagedCardInstanceIds: Set<string>;
  stagedUnits: StagedMovementUnit[];
};

export function createMovementDraftView({
  board,
  destinationBattlefieldId,
  eligibleUnitIds,
  selectedUnitIds,
}: {
  board: BoardModel;
  destinationBattlefieldId: string;
  eligibleUnitIds: readonly string[];
  selectedUnitIds: readonly string[];
}): MovementDraftView {
  const unitsById = collectViewerUnitVisualGroups(board);
  const eligibleCardInstanceIds = new Set(eligibleUnitIds);
  const stagedCardInstanceIds = new Set(selectedUnitIds);
  const originByCardInstanceId = new Map<string, BoardDropLocation>();

  for (const unitId of eligibleUnitIds) {
    const group = unitsById.get(unitId);
    if (group) {
      originByCardInstanceId.set(unitId, group.origin);
    }
  }

  const stagedUnits = selectedUnitIds.flatMap((unitId) => {
    const group = unitsById.get(unitId);
    if (!group) {
      return [];
    }

    return [
      {
        ...group,
        stagedUnit: {
          ...group.unit,
          isExhausted: true,
        },
      },
    ];
  });

  const hiddenCardInstanceIds = new Set<string>();
  for (const staged of stagedUnits) {
    if (staged.unit.instanceId) {
      hiddenCardInstanceIds.add(staged.unit.instanceId);
    }
    for (const attachment of staged.attachments) {
      if (attachment.instanceId) {
        hiddenCardInstanceIds.add(attachment.instanceId);
      }
    }
  }

  return {
    destination: {
      kind: "battlefield",
      battlefieldId: destinationBattlefieldId,
    },
    eligibleCardInstanceIds,
    hiddenCardInstanceIds,
    originByCardInstanceId,
    stagedCardInstanceIds,
    stagedUnits,
  };
}

export function applyMovementDraftToAnimationData(
  animationData: {
    placements: CardZonePlacement[];
    zoneCounts: ZoneAnimationCount[];
  },
  movementDraft: MovementDraftView | null,
): {
  placements: CardZonePlacement[];
  zoneCounts: ZoneAnimationCount[];
} {
  if (!movementDraft) {
    return animationData;
  }

  const destinationZoneId = `battlefield:${movementDraft.destination.battlefieldId}:player`;
  const visualCardById = new Map<string, Card>();
  const stagedHostIds = new Set<string>();

  for (const staged of movementDraft.stagedUnits) {
    if (staged.stagedUnit.instanceId) {
      stagedHostIds.add(staged.stagedUnit.instanceId);
      visualCardById.set(staged.stagedUnit.instanceId, staged.stagedUnit);
    }
    for (const attachment of staged.attachments) {
      if (attachment.instanceId) {
        visualCardById.set(attachment.instanceId, attachment);
      }
    }
  }

  return {
    placements: animationData.placements.map((placement) => {
      const instanceId = placement.card.instanceId;
      const visualCard = instanceId ? visualCardById.get(instanceId) : undefined;
      if (!visualCard) {
        return placement;
      }

      return {
        ...placement,
        card: visualCard,
        layoutIndex:
          instanceId && stagedHostIds.has(instanceId)
            ? undefined
            : placement.layoutIndex,
        zoneId: destinationZoneId,
        zoneKind: "battlefield" as const,
      };
    }),
    zoneCounts: animationData.zoneCounts,
  };
}

export function viewerUnitVisualGroup(
  board: BoardModel,
  unitInstanceId: string,
): UnitVisualGroup | null {
  return collectViewerUnitVisualGroups(board).get(unitInstanceId) ?? null;
}

function collectViewerUnitVisualGroups(board: BoardModel) {
  const groupsById = new Map<string, UnitVisualGroup>();
  const baseCards = board.player.zones.base.cards.filter(
    (card) => card.type !== "Rune",
  );

  addVisualGroups({
    cards: baseCards,
    groupsById,
    origin: { kind: "base" },
  });
  addBattlefieldVisualGroups(board.playerBattlefield, groupsById);
  addBattlefieldVisualGroups(board.opponentBattlefield, groupsById);

  return groupsById;
}

function addBattlefieldVisualGroups(
  battlefield: BattlefieldData,
  groupsById: Map<string, UnitVisualGroup>,
) {
  addVisualGroups({
    cards: [...battlefield.playerUnits, ...battlefield.playerAttachments],
    groupsById,
    origin: {
      kind: "battlefield",
      battlefieldId: battlefield.id,
    },
  });
}

function addVisualGroups({
  cards,
  groupsById,
  origin,
}: {
  cards: readonly Card[];
  groupsById: Map<string, UnitVisualGroup>;
  origin: BoardDropLocation;
}) {
  for (const { host, attachments } of groupCardsByAttachment(cards)) {
    const unitId = host.instanceId;
    if (!unitId || !host.type?.split(" / ").includes("Unit")) {
      continue;
    }

    groupsById.set(unitId, {
      attachments,
      origin,
      unit: host,
    });
  }
}
