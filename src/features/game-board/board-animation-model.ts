import type {
  CardZonePlacement,
  ZoneAnimationCount,
} from "./components/card-zone-transfer-overlay";
import { groupCardsByAttachment } from "./components/attachment-layout";
import type { BattlefieldData, Card, PlayerData } from "./types";
import type { createBoardModel } from "./board-model";

export function createAnimationData(
  board: ReturnType<typeof createBoardModel>,
): {
  placements: CardZonePlacement[];
  zoneCounts: ZoneAnimationCount[];
} {
  const placements: CardZonePlacement[] = [];
  const zoneCounts: ZoneAnimationCount[] = [];

  addPlayerAnimationData(board.player, placements, zoneCounts);
  addPlayerAnimationData(board.opponent, placements, zoneCounts);
  addBattlefieldAnimationData({
    battlefield: board.playerBattlefield,
    opponentPlayerId: board.opponent.playerId,
    placements,
    playerPlayerId: board.player.playerId,
    zoneCounts,
  });
  addBattlefieldAnimationData({
    battlefield: board.opponentBattlefield,
    opponentPlayerId: board.opponent.playerId,
    placements,
    playerPlayerId: board.player.playerId,
    zoneCounts,
  });

  return { placements, zoneCounts };
}

export function areSetsEqual<T>(left: Set<T>, right: Set<T>) {
  if (left.size !== right.size) {
    return false;
  }

  for (const item of left) {
    if (!right.has(item)) {
      return false;
    }
  }

  return true;
}

function addPlayerAnimationData(
  player: PlayerData,
  placements: CardZonePlacement[],
  zoneCounts: ZoneAnimationCount[],
) {
  const zones = Object.values(player.zones);

  for (const zone of zones) {
    const zoneId = `${player.playerId}:${zone.kind}`;
    const unitGroupById =
      zone.kind === "base"
        ? unitGroupMetadata(zone.cards.filter((card) => card.type !== "Rune"))
        : new Map<string, { attachments: Card[]; layoutIndex: number }>();

    zoneCounts.push({
      count: zone.count,
      ownerPlayerId: player.playerId,
      zoneId,
      zoneKind: zone.kind,
    });

    for (const card of zone.cards) {
      const group = card.instanceId
        ? unitGroupById.get(card.instanceId)
        : undefined;
      placements.push({
        attachments: group?.attachments,
        card,
        layoutIndex: group?.layoutIndex,
        ownerPlayerId: player.playerId,
        zoneId,
        zoneKind: zone.kind,
      });
    }
  }
}

function addBattlefieldAnimationData({
  battlefield,
  opponentPlayerId,
  placements,
  playerPlayerId,
  zoneCounts,
}: {
  battlefield: BattlefieldData;
  opponentPlayerId: string;
  placements: CardZonePlacement[];
  playerPlayerId: string;
  zoneCounts: ZoneAnimationCount[];
}) {
  const playerZoneId = `battlefield:${battlefield.id}:player`;
  const opponentZoneId = `battlefield:${battlefield.id}:opponent`;

  zoneCounts.push(
    {
      count: battlefield.playerUnits.length,
      ownerPlayerId: playerPlayerId,
      zoneId: playerZoneId,
      zoneKind: "battlefield",
    },
    {
      count: battlefield.opponentUnits.length,
      ownerPlayerId: opponentPlayerId,
      zoneId: opponentZoneId,
      zoneKind: "battlefield",
    },
  );

  addBattlefieldSidePlacements({
    attachments: battlefield.playerAttachments,
    ownerPlayerId: playerPlayerId,
    placements,
    units: battlefield.playerUnits,
    zoneId: playerZoneId,
  });
  addBattlefieldSidePlacements({
    attachments: battlefield.opponentAttachments,
    ownerPlayerId: opponentPlayerId,
    placements,
    units: battlefield.opponentUnits,
    zoneId: opponentZoneId,
  });
}

function addBattlefieldSidePlacements({
  attachments,
  ownerPlayerId,
  placements,
  units,
  zoneId,
}: {
  attachments: Card[];
  ownerPlayerId: string;
  placements: CardZonePlacement[];
  units: Card[];
  zoneId: string;
}) {
  const groups = groupCardsByAttachment([...units, ...attachments]);

  for (const [layoutIndex, { host, attachments: attachedCards }] of groups.entries()) {
    placements.push({
      attachments: attachedCards,
      card: host,
      layoutIndex:
        host.type?.split(" / ").includes("Unit") && host.instanceId
          ? layoutIndex
          : undefined,
      ownerPlayerId,
      zoneId,
      zoneKind: "battlefield",
    });

    for (const attachment of attachedCards) {
      placements.push({
        card: attachment,
        ownerPlayerId,
        zoneId,
        zoneKind: "battlefield",
      });
    }
  }
}

function unitGroupMetadata(cards: readonly Card[]) {
  const metadata = new Map<
    string,
    { attachments: Card[]; layoutIndex: number }
  >();

  for (const [layoutIndex, { host, attachments }] of groupCardsByAttachment(
    cards,
  ).entries()) {
    if (
      host.instanceId &&
      host.type?.split(" / ").includes("Unit")
    ) {
      metadata.set(host.instanceId, {
        attachments,
        layoutIndex,
      });
    }
  }

  return metadata;
}
