import type { BoardModel } from "../board-model";
import { groupCardsByAttachment } from "../components/attachment-layout";
import type { CardZoneSourceReservation } from "../components/card-zone-transfer-overlay";
import type { BattlefieldData, Card, PlayerData } from "../types";

const TRANSPARENT_PIXEL =
  "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

export function applyTransferSourceReservations(
  board: BoardModel,
  reservations: readonly CardZoneSourceReservation[],
): {
  board: BoardModel;
  placeholderCardInstanceIds: Set<string>;
} {
  if (reservations.length === 0) {
    return {
      board,
      placeholderCardInstanceIds: new Set(),
    };
  }

  const placeholderCardInstanceIds = new Set<string>();
  let player = board.player;
  let opponent = board.opponent;
  let playerBattlefield = board.playerBattlefield;
  let opponentBattlefield = board.opponentBattlefield;

  const reservationsByZone = new Map<string, CardZoneSourceReservation[]>();
  for (const reservation of reservations) {
    reservationsByZone.set(reservation.zoneId, [
      ...(reservationsByZone.get(reservation.zoneId) ?? []),
      reservation,
    ]);
  }

  const playerBaseReservations = reservationsByZone.get(
    `${board.player.playerId}:base`,
  );
  if (playerBaseReservations?.length) {
    player = withBaseReservations(
      player,
      playerBaseReservations,
      placeholderCardInstanceIds,
    );
  }

  const opponentBaseReservations = reservationsByZone.get(
    `${board.opponent.playerId}:base`,
  );
  if (opponentBaseReservations?.length) {
    opponent = withBaseReservations(
      opponent,
      opponentBaseReservations,
      placeholderCardInstanceIds,
    );
  }

  playerBattlefield = withBattlefieldReservations({
    battlefield: playerBattlefield,
    placeholderCardInstanceIds,
    reservationsByZone,
  });
  opponentBattlefield = withBattlefieldReservations({
    battlefield: opponentBattlefield,
    placeholderCardInstanceIds,
    reservationsByZone,
  });

  return {
    board: {
      ...board,
      opponent,
      opponentBattlefield,
      player,
      playerBattlefield,
    },
    placeholderCardInstanceIds,
  };
}

function withBaseReservations(
  player: PlayerData,
  reservations: readonly CardZoneSourceReservation[],
  placeholderCardInstanceIds: Set<string>,
): PlayerData {
  const runes = player.zones.base.cards.filter((card) => card.type === "Rune");
  const permanents = player.zones.base.cards.filter((card) => card.type !== "Rune");
  const groups = groupCardsByAttachment(permanents).map(({ host, attachments }) => [
    host,
    ...attachments,
  ]);

  for (const reservation of [...reservations].sort(
    (left, right) => left.slotIndex - right.slotIndex,
  )) {
    const placeholder = placeholderGroup(
      reservation,
      placeholderCardInstanceIds,
    );
    groups.splice(Math.min(reservation.slotIndex, groups.length), 0, placeholder);
  }

  return {
    ...player,
    zones: {
      ...player.zones,
      base: {
        ...player.zones.base,
        cards: [...groups.flat(), ...runes],
      },
    },
  };
}

function withBattlefieldReservations({
  battlefield,
  placeholderCardInstanceIds,
  reservationsByZone,
}: {
  battlefield: BattlefieldData;
  placeholderCardInstanceIds: Set<string>;
  reservationsByZone: Map<string, CardZoneSourceReservation[]>;
}) {
  let playerUnits = battlefield.playerUnits;
  let playerAttachments = battlefield.playerAttachments;
  let opponentUnits = battlefield.opponentUnits;
  let opponentAttachments = battlefield.opponentAttachments;

  const playerReservations = reservationsByZone.get(
    `battlefield:${battlefield.id}:player`,
  );
  if (playerReservations?.length) {
    const result = insertBattlefieldReservations(
      playerUnits,
      playerAttachments,
      playerReservations,
      placeholderCardInstanceIds,
    );
    playerUnits = result.units;
    playerAttachments = result.attachments;
  }

  const opponentReservations = reservationsByZone.get(
    `battlefield:${battlefield.id}:opponent`,
  );
  if (opponentReservations?.length) {
    const result = insertBattlefieldReservations(
      opponentUnits,
      opponentAttachments,
      opponentReservations,
      placeholderCardInstanceIds,
    );
    opponentUnits = result.units;
    opponentAttachments = result.attachments;
  }

  if (
    playerUnits === battlefield.playerUnits &&
    opponentUnits === battlefield.opponentUnits
  ) {
    return battlefield;
  }

  return {
    ...battlefield,
    opponentAttachments,
    opponentUnits,
    playerAttachments,
    playerUnits,
  };
}

function insertBattlefieldReservations(
  units: Card[],
  attachments: Card[],
  reservations: readonly CardZoneSourceReservation[],
  placeholderCardInstanceIds: Set<string>,
) {
  const nextUnits = [...units];
  const nextAttachments = [...attachments];

  for (const reservation of [...reservations].sort(
    (left, right) => left.slotIndex - right.slotIndex,
  )) {
    const [host, ...groupAttachments] = placeholderGroup(
      reservation,
      placeholderCardInstanceIds,
    );
    nextUnits.splice(
      Math.min(reservation.slotIndex, nextUnits.length),
      0,
      host,
    );
    nextAttachments.push(...groupAttachments);
  }

  return {
    attachments: nextAttachments,
    units: nextUnits,
  };
}

function placeholderGroup(
  reservation: CardZoneSourceReservation,
  placeholderCardInstanceIds: Set<string>,
): Card[] {
  const hostId = placeholderId(reservation.cardInstanceId, "host");
  placeholderCardInstanceIds.add(hostId);
  const host: Card = {
    img: TRANSPARENT_PIXEL,
    instanceId: hostId,
    isExhausted: reservation.sourceExhausted,
    name: "Movement placeholder",
  };
  const attachments = Array.from(
    { length: reservation.attachmentCount },
    (_, index): Card => {
      const attachmentId = placeholderId(
        reservation.cardInstanceId,
        `attachment-${index}`,
      );
      placeholderCardInstanceIds.add(attachmentId);
      return {
        attachedToCardInstanceId: hostId,
        img: TRANSPARENT_PIXEL,
        instanceId: attachmentId,
        name: "Movement attachment placeholder",
      };
    },
  );

  return [host, ...attachments];
}

function placeholderId(cardInstanceId: string, suffix: string) {
  return `__movement-source-placeholder:${cardInstanceId}:${suffix}`;
}
