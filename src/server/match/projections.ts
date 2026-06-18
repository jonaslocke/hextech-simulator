import { z } from "zod";
import {
  getAvailablePaymentModesForPlayer,
  type BattlefieldState,
  type CardLookup,
  type Game,
  type PlayerZones
} from "./game";
import { paymentModeSchema } from "./payment";

export const projectedRunePoolSchema = z.object({
  conditionalEnergy: z
    .record(
      z.string().min(1),
      z.object({
        amount: z.number().int().nonnegative(),
        restriction: z.enum(["spell"])
      })
    )
    .default({}),
  energy: z.number().int().nonnegative(),
  power: z.record(z.string().min(1), z.number().int().nonnegative())
});

export const projectedCardStateSchema = z.object({
  computedMight: z.number().int().min(0).optional(),
  damage: z.number().int().min(0).optional(),
  exhausted: z.boolean()
});

export const projectedChainItemSchema = z.object({
  id: z.string().min(1),
  controllerPlayerId: z.string().min(1),
  sourceCardInstanceId: z.string().min(1).nullable(),
  cardInstanceId: z.string().min(1).nullable(),
  label: z.string().min(1),
  kind: z.enum(["spell", "ability", "trigger", "unit"]),
  targetCardInstanceIds: z.array(z.string().min(1)).default([])
});

export const projectedChainSchema = z
  .object({
    items: z.array(projectedChainItemSchema),
    relevantPlayerIds: z.array(z.string().min(1)).min(1),
    priorityPlayerId: z.string().min(1),
    passedPlayerIds: z.array(z.string().min(1))
  })
  .nullable();

export const projectedPendingChoiceSchema = z
  .object({
    id: z.string().min(1),
    playerId: z.string().min(1),
    type: z.literal("orderTriggers"),
    prompt: z.string().min(1),
    optionIds: z.array(z.string().min(1))
  })
  .nullable();

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
  availablePaymentModes: z.record(
    z.string().min(1),
    z.array(paymentModeSchema)
  ),
  legalTargetsByCard: z.record(
    z.string().min(1),
    z.object({
      cardInstanceIds: z.array(z.string().min(1)),
      battlefieldIds: z.array(z.string().min(1)),
      playerIds: z.array(z.string().min(1))
    })
  ),
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
  battlefieldPools: z.record(
    z.string().min(1),
    z.object({
      playerId: z.string().min(1),
      registeredCardInstanceIds: z.array(z.string().min(1)),
      registeredCount: z.number().int().nonnegative(),
      usedCardInstanceIds: z.array(z.string().min(1)),
      visibility: z.enum(["private", "secret"])
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
    passedPlayerIds: z.array(z.string().min(1)),
    completedStartOfTurnSteps: z
      .array(z.enum(["awaken", "beginning", "channel", "draw"]))
      .default([])
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
  chain: projectedChainSchema,
  pendingChoice: projectedPendingChoiceSchema,
  players: z.record(z.string().min(1), projectedPlayerStateSchema),
  battlefields: z.array(projectedBattlefieldSchema),
  cardStates: z.record(z.string().min(1), projectedCardStateSchema)
});

export type ProjectedRunePool = z.infer<typeof projectedRunePoolSchema>;
export type ProjectedCardState = z.infer<typeof projectedCardStateSchema>;
export type ProjectedChain = z.infer<typeof projectedChainSchema>;
export type ProjectedPendingChoice = z.infer<typeof projectedPendingChoiceSchema>;
export type ProjectedZone = z.infer<typeof projectedZoneSchema>;
export type ProjectedPlayerZones = z.infer<typeof projectedPlayerZonesSchema>;
export type ProjectedPlayerState = z.infer<typeof projectedPlayerStateSchema>;
export type ProjectedBattlefield = z.infer<typeof projectedBattlefieldSchema>;
export type ProjectedSetupState = z.infer<typeof projectedSetupStateSchema>;
export type ProjectedTurnState = z.infer<typeof projectedTurnStateSchema>;
export type ProjectedShowdownState = z.infer<typeof projectedShowdownStateSchema>;
export type GameProjection = z.infer<typeof gameProjectionSchema>;

export function projectGameForPlayer(
  game: Game,
  viewerPlayerId: string,
  cardsByInstanceId?: CardLookup
): GameProjection {
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
          runePool: {
            ...player.runePool,
            conditionalEnergy: player.runePool.conditionalEnergy ?? {}
          },
          availablePaymentModes:
            playerId === viewerPlayerId && cardsByInstanceId
              ? getAvailablePaymentModesForPlayer(game, playerId, cardsByInstanceId)
              : {},
          legalTargetsByCard:
            playerId === viewerPlayerId && cardsByInstanceId
              ? projectLegalTargets(game, playerId, cardsByInstanceId)
              : {},
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
    chain: projectChain(game),
    pendingChoice: projectPendingChoice(game, viewerPlayerId),
    players,
    battlefields,
    cardStates: projectCardStates(game, players, battlefields, cardsByInstanceId)
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
    battlefieldPools: Object.fromEntries(
      game.canonicalState.setup.playerIds.map((playerId) => {
        const pool = game.canonicalState.setup.battlefieldPools[playerId];

        if (!pool) {
          throw new Error("Battlefield pool state is missing.");
        }

        const isViewer = playerId === viewerPlayerId;

        return [
          playerId,
          {
            playerId,
            registeredCardInstanceIds: isViewer ? pool.registeredCardInstanceIds : [],
            registeredCount: pool.registeredCardInstanceIds.length,
            usedCardInstanceIds: isViewer ? pool.usedCardInstanceIds : [],
            visibility: isViewer ? "private" : "secret"
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
  battlefields: ProjectedBattlefield[],
  cardsByInstanceId?: CardLookup
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
    Object.entries(game.canonicalState.cardStates)
      .filter(([cardInstanceId]) => visibleCardInstanceIds.has(cardInstanceId))
      .map(([cardInstanceId, state]) => [
        cardInstanceId,
        {
          ...state,
          ...(cardsByInstanceId?.[cardInstanceId]?.classification.type === "Unit"
            ? {
                computedMight: computeMight(
                  game,
                  cardInstanceId,
                  cardsByInstanceId
                )
              }
            : {})
        }
      ])
  );
}

function projectChain(game: Game): GameProjection["chain"] {
  const chain = game.canonicalState.chain;

  if (chain === null) {
    return null;
  }

  return {
    items: chain.items.map((item) => ({
      id: item.id,
      controllerPlayerId: item.controllerPlayerId,
      sourceCardInstanceId: item.sourceCardInstanceId,
      cardInstanceId: item.cardInstanceId,
      label: item.label,
      kind: item.kind,
      targetCardInstanceIds: item.choices.targetCardInstanceIds
    })),
    relevantPlayerIds: chain.relevantPlayerIds,
    priorityPlayerId: chain.priorityPlayerId,
    passedPlayerIds: chain.passedPlayerIds
  };
}

function projectPendingChoice(
  game: Game,
  viewerPlayerId: string
): GameProjection["pendingChoice"] {
  const choice = game.canonicalState.pendingChoice;

  if (choice === null || choice.playerId !== viewerPlayerId) {
    return null;
  }

  return choice;
}

function projectLegalTargets(
  game: Game,
  playerId: string,
  cardsByInstanceId: CardLookup
): ProjectedPlayerState["legalTargetsByCard"] {
  const player = game.canonicalState.players[playerId];

  if (!player || game.status !== "in_progress" || game.canonicalState.showdown) {
    return {};
  }

  const cards = [...player.zones.hand, ...(player.zones.champion ? [player.zones.champion] : [])];

  return Object.fromEntries(
    cards.flatMap((cardInstanceId) => {
      const card = cardsByInstanceId[cardInstanceId];

      if (card?.classification.type !== "Spell") {
        return [];
      }

      const targetIds = legalTargetIdsForLuxSpell(
        game,
        playerId,
        card.name,
        cardsByInstanceId
      );

      return [
        [
          cardInstanceId,
          {
            cardInstanceIds: targetIds,
            battlefieldIds: game.canonicalState.battlefields.map(
              (battlefield) => battlefield.battlefieldId
            ),
            playerIds: game.canonicalState.setup.playerIds.filter(
              (candidate) => candidate !== playerId
            )
          }
        ]
      ];
    })
  );
}

function legalTargetIdsForLuxSpell(
  game: Game,
  playerId: string,
  cardName: string,
  cardsByInstanceId: CardLookup
): string[] {
  return allBoardUnitIds(game, cardsByInstanceId).filter((cardInstanceId) => {
    if (cardName === "Back to Back") {
      return findOwnerByInstanceId(game, cardInstanceId) === playerId;
    }

    if (cardName === "Falling Comet" || cardName === "Blast of Power") {
      return game.canonicalState.battlefields.some((battlefield) =>
        battlefield.units.includes(cardInstanceId)
      );
    }

    if (
      cardName === "Stupefy" ||
      cardName === "Singularity" ||
      cardName === "Final Spark"
    ) {
      return true;
    }

    return false;
  });
}

function allBoardUnitIds(game: Game, cardsByInstanceId: CardLookup): string[] {
  return [
    ...Object.values(game.canonicalState.players).flatMap((player) =>
      player.zones.base.filter(
        (cardInstanceId) =>
          cardsByInstanceId[cardInstanceId]?.classification.type === "Unit"
      )
    ),
    ...game.canonicalState.battlefields.flatMap((battlefield) =>
      battlefield.units.filter(
        (cardInstanceId) =>
          cardsByInstanceId[cardInstanceId]?.classification.type === "Unit"
      )
    )
  ];
}

function computeMight(
  game: Game,
  cardInstanceId: string,
  cardsByInstanceId: CardLookup
): number {
  const baseMight = cardsByInstanceId[cardInstanceId]?.attributes.might ?? 0;
  let might = baseMight;
  let minimum = 0;

  for (const modifier of game.canonicalState.modifiers) {
    if (
      modifier.kind === "mightDelta" &&
      modifier.targetCardInstanceId === cardInstanceId
    ) {
      might += modifier.amount;
      minimum =
        modifier.minimum === null ? minimum : Math.max(minimum, modifier.minimum);
    }
  }

  return Math.max(minimum, might);
}

function findOwnerByInstanceId(game: Game, cardInstanceId: string): string | null {
  const ownerPrefix = cardInstanceId.split(":")[0];

  if (game.canonicalState.setup.playerIds.includes(ownerPrefix)) {
    return ownerPrefix;
  }

  return null;
}
