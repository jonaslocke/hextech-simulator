import { z } from "zod";
import type { BattlefieldState, Game, PlayerZones } from "./game";

export const projectedRunePoolSchema = z.object({
  energy: z.number().int().nonnegative(),
  power: z.record(z.string().min(1), z.number().int().nonnegative())
});

export const projectedCardStateSchema = z.object({
  exhausted: z.boolean()
});

export const projectedZoneSchema = z.object({
  cardInstanceIds: z.array(z.string().min(1)),
  count: z.number().int().nonnegative(),
  visibility: z.enum(["public", "private", "secret"])
});

export const projectedPlayerZonesSchema = z.object({
  legend: projectedZoneSchema,
  champion: projectedZoneSchema,
  mainDeck: projectedZoneSchema,
  runeDeck: projectedZoneSchema,
  hand: projectedZoneSchema,
  trash: projectedZoneSchema,
  banishment: projectedZoneSchema,
  base: projectedZoneSchema
});

export const projectedPlayerStateSchema = z.object({
  playerId: z.string().min(1),
  isViewer: z.boolean(),
  runePool: projectedRunePoolSchema,
  zones: projectedPlayerZonesSchema
});

export const projectedBattlefieldSchema = z.object({
  battlefieldId: z.string().min(1),
  selectedByPlayerId: z.string().min(1),
  cardInstanceId: z.string().min(1),
  units: z.array(z.string().min(1)),
  facedownSlot: z
    .object({
      controllerId: z.string().min(1),
      cardInstanceId: z.string().min(1).nullable(),
      visibility: z.enum(["private", "secret"])
    })
    .nullable()
});

export const projectedSetupStateSchema = z.object({
  playerIds: z.tuple([z.string().min(1), z.string().min(1)]),
  startingPlayerChooserId: z.string().min(1).nullable(),
  startingPlayerId: z.string().min(1).nullable(),
  battlefieldChoices: z.record(
    z.string().min(1),
    z.object({
      playerId: z.string().min(1),
      status: z.enum(["unlocked", "locked", "revealed"]),
      cardInstanceId: z.string().min(1).nullable(),
      lockedAt: z.string().datetime().nullable(),
      revealedAt: z.string().datetime().nullable()
    })
  ),
  mulliganChoices: z.record(
    z.string().min(1),
    z.object({
      playerId: z.string().min(1),
      status: z.enum(["unlocked", "locked"]),
      lockedAt: z.string().datetime().nullable()
    })
  )
});

export const projectedTurnStateSchema = z
  .object({
    turnNumber: z.number().int().min(1),
    activePlayerId: z.string().min(1),
    phase: z.enum(["awaken", "beginning", "channel", "draw", "action", "end"]),
    passedPlayerIds: z.array(z.string().min(1))
  })
  .nullable();

export const projectedShowdownStateSchema = z
  .object({
    battlefieldId: z.string().min(1),
    relevantPlayerIds: z.array(z.string().min(1)).min(1),
    focusPlayerId: z.string().min(1),
    priorityPlayerId: z.string().min(1),
    passedPlayerIds: z.array(z.string().min(1))
  })
  .nullable();

export const gameProjectionSchema = z.object({
  id: z.string().min(1),
  matchId: z.string().min(1),
  gameNumber: z.number().int().min(1).max(3),
  status: z.enum(["setup_pending", "ready", "in_progress", "complete"]),
  stateVersion: z.number().int().nonnegative(),
  viewerPlayerId: z.string().min(1),
  winnerPlayerId: z.string().min(1).nullable(),
  setup: projectedSetupStateSchema,
  turn: projectedTurnStateSchema,
  showdown: projectedShowdownStateSchema,
  players: z.record(z.string().min(1), projectedPlayerStateSchema),
  battlefields: z.array(projectedBattlefieldSchema),
  cardStates: z.record(z.string().min(1), projectedCardStateSchema)
});

export type ProjectedRunePool = z.infer<typeof projectedRunePoolSchema>;
export type ProjectedCardState = z.infer<typeof projectedCardStateSchema>;
export type ProjectedZone = z.infer<typeof projectedZoneSchema>;
export type ProjectedPlayerZones = z.infer<typeof projectedPlayerZonesSchema>;
export type ProjectedPlayerState = z.infer<typeof projectedPlayerStateSchema>;
export type ProjectedBattlefield = z.infer<typeof projectedBattlefieldSchema>;
export type ProjectedSetupState = z.infer<typeof projectedSetupStateSchema>;
export type ProjectedTurnState = z.infer<typeof projectedTurnStateSchema>;
export type ProjectedShowdownState = z.infer<typeof projectedShowdownStateSchema>;
export type GameProjection = z.infer<typeof gameProjectionSchema>;

export function projectGameForPlayer(game: Game, viewerPlayerId: string): GameProjection {
  if (!game.canonicalState.setup.playerIds.includes(viewerPlayerId)) {
    throw new Error("Viewer must be one of the game players.");
  }

  const players = Object.fromEntries(
    game.canonicalState.setup.playerIds.map((playerId) => {
      const player = game.canonicalState.players[playerId];

      if (!player) {
        throw new Error("Game player state is missing.");
      }

      return [
        playerId,
        {
          playerId,
          isViewer: playerId === viewerPlayerId,
          runePool: player.runePool,
          zones: projectZones(player.zones, playerId === viewerPlayerId)
        }
      ];
    })
  );
  const battlefields = game.canonicalState.battlefields.map((battlefield) =>
    projectBattlefield(battlefield, viewerPlayerId)
  );

  return gameProjectionSchema.parse({
    id: game.id,
    matchId: game.matchId,
    gameNumber: game.gameNumber,
    status: game.status,
    stateVersion: game.stateVersion,
    viewerPlayerId,
    winnerPlayerId: game.winnerPlayerId,
    setup: projectSetup(game, viewerPlayerId),
    turn: game.canonicalState.turn,
    showdown: game.canonicalState.showdown,
    players,
    battlefields,
    cardStates: projectCardStates(game, players, battlefields)
  });
}

function projectSetup(game: Game, viewerPlayerId: string): ProjectedSetupState {
  return {
    playerIds: game.canonicalState.setup.playerIds,
    startingPlayerChooserId: game.canonicalState.setup.startingPlayerChooserId,
    startingPlayerId: game.canonicalState.setup.startingPlayerId,
    battlefieldChoices: Object.fromEntries(
      game.canonicalState.setup.playerIds.map((playerId) => {
        const choice = game.canonicalState.setup.battlefieldChoices[playerId];

        if (!choice) {
          throw new Error("Battlefield choice state is missing.");
        }

        return [
          playerId,
          {
            ...choice,
            cardInstanceId:
              choice.status === "revealed" || playerId === viewerPlayerId
                ? choice.cardInstanceId
                : null
          }
        ];
      })
    ),
    mulliganChoices: Object.fromEntries(
      game.canonicalState.setup.playerIds.map((playerId) => {
        const choice = game.canonicalState.setup.mulliganChoices[playerId];

        if (!choice) {
          throw new Error("Mulligan choice state is missing.");
        }

        return [
          playerId,
          {
            playerId,
            status: choice.status,
            lockedAt: choice.lockedAt
          }
        ];
      })
    )
  };
}

function projectZones(zones: PlayerZones, isViewer: boolean): ProjectedPlayerZones {
  return {
    legend: publicZone(zones.legend === null ? [] : [zones.legend]),
    champion: publicZone(zones.champion === null ? [] : [zones.champion]),
    mainDeck: secretZone(zones.mainDeck.length),
    runeDeck: secretZone(zones.runeDeck.length),
    hand: isViewer ? privateZone(zones.hand) : privateCountOnlyZone(zones.hand.length),
    trash: publicZone(zones.trash),
    banishment: publicZone(zones.banishment),
    base: publicZone(zones.base)
  };
}

function projectBattlefield(
  battlefield: BattlefieldState,
  viewerPlayerId: string
): ProjectedBattlefield {
  return {
    battlefieldId: battlefield.battlefieldId,
    selectedByPlayerId: battlefield.selectedByPlayerId,
    cardInstanceId: battlefield.cardInstanceId,
    units: battlefield.units,
    facedownSlot:
      battlefield.facedownSlot === null
        ? null
        : {
            controllerId: battlefield.facedownSlot.controllerId,
            cardInstanceId:
              battlefield.facedownSlot.controllerId === viewerPlayerId
                ? battlefield.facedownSlot.cardInstanceId
                : null,
            visibility:
              battlefield.facedownSlot.controllerId === viewerPlayerId
                ? "private"
                : "secret"
          }
  };
}

function publicZone(cardInstanceIds: string[]): ProjectedZone {
  return {
    cardInstanceIds,
    count: cardInstanceIds.length,
    visibility: "public"
  };
}

function privateZone(cardInstanceIds: string[]): ProjectedZone {
  return {
    cardInstanceIds,
    count: cardInstanceIds.length,
    visibility: "private"
  };
}

function privateCountOnlyZone(count: number): ProjectedZone {
  return {
    cardInstanceIds: [],
    count,
    visibility: "private"
  };
}

function secretZone(count: number): ProjectedZone {
  return {
    cardInstanceIds: [],
    count,
    visibility: "secret"
  };
}

function projectCardStates(
  game: Game,
  players: Record<string, ProjectedPlayerState>,
  battlefields: ProjectedBattlefield[]
): Record<string, ProjectedCardState> {
  const visibleCardInstanceIds = new Set<string>();

  for (const player of Object.values(players)) {
    for (const zone of Object.values(player.zones)) {
      for (const cardInstanceId of zone.cardInstanceIds) {
        visibleCardInstanceIds.add(cardInstanceId);
      }
    }
  }

  for (const battlefield of battlefields) {
    visibleCardInstanceIds.add(battlefield.cardInstanceId);

    for (const unitCardInstanceId of battlefield.units) {
      visibleCardInstanceIds.add(unitCardInstanceId);
    }

    if (battlefield.facedownSlot?.cardInstanceId) {
      visibleCardInstanceIds.add(battlefield.facedownSlot.cardInstanceId);
    }
  }

  return Object.fromEntries(
    Object.entries(game.canonicalState.cardStates).filter(([cardInstanceId]) =>
      visibleCardInstanceIds.has(cardInstanceId)
    )
  );
}
