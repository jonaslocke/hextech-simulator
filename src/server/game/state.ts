import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import {
  gameCardDefinitionSchema,
  type DeckSnapshot,
  type GameCardDefinition,
} from "./schemas";

export const cardInstanceSchema = z.object({
  instanceId: z.string().min(1),
  registeredCardId: z.string().min(1).nullable().optional(),
  ownerPlayerId: z.string().min(1),
  source: z.enum([
    "legend",
    "champion",
    "mainDeck",
    "runeDeck",
    "battlefield",
    "sideboard",
    "token",
  ]),
  cardCode: z.string().min(1),
});

export const playerZonesSchema = z.object({
  legend: z.string().nullable(),
  champion: z.string().nullable(),
  mainDeck: z.array(z.string()),
  runeDeck: z.array(z.string()),
  hand: z.array(z.string()),
  trash: z.array(z.string()),
  banishment: z.array(z.string()),
  base: z.array(z.string()),
});

export const playerStateSchema = z.object({
  playerId: z.string().min(1),
  points: z.number().int().nonnegative().optional(),
  scoredBattlefieldIdsThisTurn: z.array(z.string()).optional(),
  energy: z.number().int().nonnegative(),
  conditionalEnergy: z.number().int().nonnegative(),
  power: z.record(z.number().int().nonnegative()),
  playedMainDeckCardIdsThisTurn: z.array(z.string().min(1)).optional(),
  legionSatisfiedCardIdsThisTurn: z.array(z.string().min(1)).optional(),
  zones: playerZonesSchema,
});

export const battlefieldStateSchema = z.object({
  battlefieldId: z.string().min(1),
  cardInstanceId: z.string().min(1),
  selectedByPlayerId: z.string().min(1),
  controllerPlayerId: z.string().nullable().optional(),
  contestedByPlayerId: z.string().nullable().optional(),
  units: z.array(z.string()),
  facedownCardInstanceId: z.string().min(1).nullable().optional(),
  facedownControllerPlayerId: z.string().min(1).nullable().optional(),
  hiddenAtTurnNumber: z.number().int().positive().nullable().optional(),
});

export const setupStateSchema = z.object({
  playerIds: z.tuple([z.string().min(1), z.string().min(1)]),
  startingPlayerChooserId: z.string().min(1),
  startingPlayerId: z.string().nullable(),
  battlefieldPools: z.record(z.array(z.string())),
  battlefieldChoices: z.record(
    z.object({
      status: z.enum(["unlocked", "locked", "revealed"]),
      cardInstanceId: z.string().nullable(),
    }),
  ),
  mulligans: z.record(
    z.object({
      status: z.enum(["unlocked", "locked"]),
      selectedCardInstanceIds: z.array(z.string()).max(2),
    }),
  ),
});

export const turnStateSchema = z.object({
  turnNumber: z.number().int().positive(),
  activePlayerId: z.string().min(1),
  phase: z.enum(["awaken", "beginning", "channel", "draw", "action", "end"]),
  endTriggersQueued: z.boolean().optional(),
  endDelayedEffectsQueued: z.boolean().optional(),
  stunsCleared: z.boolean().optional(),
  beginningTriggersQueued: z.boolean().optional(),
});

export const cardStateSchema = z.object({
  exhausted: z.boolean(),
  stunned: z.boolean().optional(),
  damage: z.number().int().nonnegative(),
  computedMight: z.number().nullable(),
  objectVersion: z.number().int().nonnegative().optional(),
  combatRole: z.enum(["attacker", "defender"]).nullable().optional(),
  lethalSuppressedDamage: z.number().int().nonnegative().nullable().optional(),
  lethalSuppressedMight: z.number().int().nonnegative().nullable().optional(),
});

export const chainItemSchema = z.object({
  id: z.string(),
  kind: z.enum(["spell", "permanent", "activatedAbility", "trigger"]),
  label: z.string(),
  controllerPlayerId: z.string(),
  sourceCardInstanceId: z.string().nullable(),
  targetCardInstanceIds: z.array(z.string()),
  targetObjectVersions: z.record(z.number().int().nonnegative()).default({}),
  behaviorClauseId: z.string().nullable().default(null),
  activatedBehaviorId: z.string().nullable().default(null),
  behaviorEvent: z
    .object({
      type: z.string(),
      actorPlayerId: z.string().nullable(),
      subjectCardInstanceId: z.string().nullable(),
      values: z.record(
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      ),
    })
    .nullable()
    .default(null),
});

const triggerOrderChoiceSchema = z.object({
  id: z.string().min(1),
  playerId: z.string().min(1),
  type: z.literal("orderTriggers"),
  optionIds: z.array(z.string().min(1)),
  pendingItems: z.array(chainItemSchema),
});

const combatDamageChoiceSchema = z.object({
  id: z.string().min(1),
  playerId: z.string().min(1),
  type: z.literal("assignCombatDamage"),
  totalDamage: z.number().int().nonnegative(),
  targetUnitIds: z.array(z.string().min(1)),
});

const effectSelectionChoiceSchema = z.object({
  id: z.string().min(1),
  playerId: z.string().min(1),
  type: z.literal("effectSelection"),
  resolutionId: z.string().min(1).nullable(),
  bindingKey: z.string().min(1),
  prompt: z.string().min(1),
  optionKind: z.enum(["card", "battlefield"]).default("card"),
  sourceZone: z.enum(["hand", "trash", "mainDeck"]).nullable().default(null),
  presentation: z.enum(["cardSelection", "vision"]).default("cardSelection"),
  legalCardIds: z.array(z.string().min(1)),
  minimum: z.number().int().nonnegative(),
  maximum: z.number().int().nonnegative(),
  chainItem: chainItemSchema.nullable().optional(),
  targetRequirements: z
    .array(
      z.object({
        kind: z.enum(["card", "battlefield", "player"]),
        label: z.string().min(1).optional(),
        selectionKey: z.string().min(1).optional(),
        selectionPurpose: z.enum(["target", "optionalCost"]).optional(),
        sourceZone: z.enum(["hand", "trash", "mainDeck"]).optional(),
        legalIds: z.array(z.string().min(1)),
        minimum: z.number().int().nonnegative(),
        maximum: z.number().int().nonnegative(),
      }),
    )
    .optional(),
});

const tokenPlacementChoiceSchema = z.object({
  id: z.string().min(1),
  playerId: z.string().min(1),
  type: z.literal("tokenPlacement"),
  resolutionId: z.string().min(1),
  bindingKey: z.string().min(1),
  prompt: z.string().min(1),
  tokenName: z.string().min(1),
  count: z.number().int().positive(),
  legalDestinationIds: z.array(z.string().min(1)),
  destinationLabels: z.record(z.string().min(1)).default({}),
});

const binaryChoiceSchema = z.object({
  id: z.string().min(1), playerId: z.string().min(1), type: z.literal("binary"),
  resolutionId: z.string().min(1), bindingKey: z.string().min(1), prompt: z.string().min(1),
  acceptLabel: z.string().min(1), declineLabel: z.string().min(1),
});

const damageAssignmentSchema = z.object({
  targetUnitId: z.string().min(1),
  amount: z.number().int().positive(),
});

export const gameStateSchema = z.object({
  setup: setupStateSchema,
  players: z.record(playerStateSchema),
  battlefields: z.array(battlefieldStateSchema),
  cardStates: z.record(cardStateSchema),
  createdCardInstances: z.array(cardInstanceSchema).default([]).optional(),
  createdCardDefinitions: z
    .array(gameCardDefinitionSchema)
    .default([])
    .optional(),
  turn: turnStateSchema.nullable(),
  chain: z
    .object({
      items: z.array(chainItemSchema),
      relevantPlayerIds: z.array(z.string().min(1)).min(1),
      priorityPlayerId: z.string().min(1),
      passedPlayerIds: z.array(z.string().min(1)),
    })
    .nullable(),
  showdown: z
    .object({
      kind: z.enum(["nonCombat", "combat"]),
      battlefieldId: z.string().min(1),
      relevantPlayerIds: z.array(z.string().min(1)).min(1),
      focusPlayerId: z.string().min(1),
      passedPlayerIds: z.array(z.string().min(1)),
    })
    .nullable(),
  combat: z
    .object({
      battlefieldId: z.string().min(1),
      stage: z.enum(["showdown", "attackerAssignment", "defenderAssignment"]),
      attackerPlayerId: z.string().min(1),
      defenderPlayerId: z.string().min(1),
      attackerUnitIds: z.array(z.string().min(1)),
      defenderUnitIds: z.array(z.string().min(1)),
      attackerMight: z.number().int().nonnegative().nullable(),
      defenderMight: z.number().int().nonnegative().nullable(),
      attackerAssignments: z.array(damageAssignmentSchema),
      defenderAssignments: z.array(damageAssignmentSchema),
    })
    .nullable(),
  modifiers: z.array(
    z.object({
      id: z.string().min(1),
      sourceCardInstanceId: z.string().nullable(),
      controllerPlayerId: z.string().min(1).optional(),
      targetCardInstanceId: z.string().nullable(),
      attribute: z.string().min(1),
      targetScope: z.string().min(1),
      operation: z.enum(["increase", "reduce", "multiply", "set"]),
      amount: z.number(),
      minimum: z.number().nullable(),
      duration: z.string().min(1),
      createdAtTurn: z.number().int().nonnegative(),
    }),
  ),
  ongoingEffects: z
    .array(
      z.object({
        id: z.string().min(1),
        behaviorId: z.string().min(1),
        controllerPlayerId: z.string().min(1),
        sourceCardInstanceId: z.string().min(1),
        targetCardInstanceIds: z.array(z.string()),
        duration: z.string().min(1),
        createdAtTurn: z.number().int().nonnegative(),
      }),
    )
    .default([]),
  delayedEffects: z.array(
    z.object({
      id: z.string().min(1),
      point: z.string().min(1),
      controllerPlayerId: z.string().min(1),
      sourceCardInstanceId: z.string().min(1),
      clauseId: z.string().min(1),
      selectedIds: z.array(z.string()),
    }),
  ),
  effectResolutions: z.array(
    z.object({
      id: z.string().min(1),
      controllerPlayerId: z.string().min(1),
      sourceCardInstanceId: z.string().min(1),
      clauseId: z.string().min(1),
      nextEffectIndex: z.number().int().nonnegative(),
      delayedEffectId: z.string().min(1).nullable(),
      endingPlayerId: z.string().min(1).nullable(),
      initialSelectedIds: z.array(z.string()).default([]),
      targetsLocked: z.boolean().optional(),
      selectionsByBinding: z.record(z.array(z.string())),
    }),
  ),
  pendingChoice: z
    .discriminatedUnion("type", [
      triggerOrderChoiceSchema,
      combatDamageChoiceSchema,
      effectSelectionChoiceSchema,
      tokenPlacementChoiceSchema,
      binaryChoiceSchema,
    ])
    .nullable(),
  queuedTriggerChoices: z.array(triggerOrderChoiceSchema),
  queuedChainItems: z.array(chainItemSchema).optional(),
  queuedBehaviorEvents: z
    .array(
      z.object({
        type: z.string(),
        actorPlayerId: z.string().nullable(),
        subjectCardInstanceId: z.string().nullable(),
        values: z.record(
          z.union([z.string(), z.number(), z.boolean(), z.null()]),
        ),
      }),
    )
    .optional(),
});

export const gameDocumentSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  matchId: z.string().min(1),
  gameNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  stateVersion: z.number().int().nonnegative(),
  status: z.enum(["setup_pending", "ready", "in_progress", "complete"]),
  winnerPlayerId: z.string().nullable(),
  completionReason: z.enum(["victory", "game_concession"]).nullable(),
  state: gameStateSchema,
});

export type CardInstance = z.infer<typeof cardInstanceSchema>;
export type ChainItem = z.infer<typeof chainItemSchema>;
export type PlayerState = z.infer<typeof playerStateSchema>;
export type GameState = z.infer<typeof gameStateSchema>;
export type GameDocument = z.infer<typeof gameDocumentSchema>;

export const deckConfigurationSchema = z.object({
  chosenChampionRegisteredCardId: z.string().min(1),
  mainDeckRegisteredCardIds: z.array(z.string().min(1)),
  sideboardRegisteredCardIds: z.array(z.string().min(1)),
});

export const completedGameSummarySchema = z.object({
  gameId: z.string().min(1),
  gameNumber: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  winnerPlayerId: z.string().min(1),
  loserPlayerId: z.string().min(1),
  startingPlayerChooserId: z.string().min(1),
  startingPlayerId: z.string().min(1),
  battlefieldRegisteredCardIdByPlayerId: z.record(z.string().min(1)),
  completionReason: z.enum(["victory", "game_concession"]),
  completedAt: z.string(),
});

export const nextGameSubmissionSchema = z.object({
  status: z.enum(["pending", "submitted"]),
  configuration: deckConfigurationSchema.nullable(),
  submittedAt: z.string().nullable(),
});

export const betweenGamesSchema = z.object({
  id: z.string().min(1),
  afterGameId: z.string().min(1),
  nextGameNumber: z.union([z.literal(2), z.literal(3)]),
  previousGameWinnerPlayerId: z.string().min(1),
  previousGameLoserPlayerId: z.string().min(1),
  nextStartingPlayerChooserId: z.string().min(1),
  submissionsByPlayerId: z.record(nextGameSubmissionSchema),
});

export const matchCompletionSchema = z.discriminatedUnion("reason", [
  z.object({
    reason: z.literal("two_set_points"),
    winnerPlayerId: z.string().min(1),
    completedAt: z.string(),
  }),
  z.object({
    reason: z.literal("match_concession"),
    winnerPlayerId: z.string().min(1),
    concededByPlayerId: z.string().min(1),
    completedAt: z.string(),
  }),
]);

export const matchSeatSchema = z.object({
  playerId: z.string().min(1),
  seat: z.enum(["player-1", "player-2"]),
  tokenHash: z.string().min(1),
  displayName: z.string().min(1),
  registeredDeckSnapshotId: z.string().min(1),
  currentDeckConfiguration: deckConfigurationSchema,
});

export const matchDocumentSchema = z.object({
  id: z.string().min(1),
  format: z.literal("riftbound-1v1-match"),
  status: z.enum(["playing", "between_games", "complete"]),
  stateVersion: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
  currentGameId: z.string().min(1),
  gameIds: z.array(z.string().min(1)).min(1).max(3),
  completedGames: z.array(completedGameSummarySchema).max(3),
  betweenGames: betweenGamesSchema.nullable(),
  completion: matchCompletionSchema.nullable(),
  seats: z.tuple([matchSeatSchema, matchSeatSchema]),
});

export type DeckConfiguration = z.infer<typeof deckConfigurationSchema>;
export type CompletedGameSummary = z.infer<typeof completedGameSummarySchema>;
export type NextGameSubmission = z.infer<typeof nextGameSubmissionSchema>;
export type BetweenGamesState = z.infer<typeof betweenGamesSchema>;
export type MatchCompletion = z.infer<typeof matchCompletionSchema>;
export type MatchSeat = z.infer<typeof matchSeatSchema>;
export type MatchDocument = z.infer<typeof matchDocumentSchema>;

export type DeckRuntimeSnapshot = {
  template: DeckSnapshot;
  instances: CardInstance[];
};

export type ActiveGameDeck = {
  legendRegisteredCardId: string;
  chosenChampionRegisteredCardId: string;
  mainDeckRegisteredCardIds: string[];
  runeDeckRegisteredCardIds: string[];
  availableBattlefieldRegisteredCardIds: string[];
  sideboardRegisteredCardIds: string[];
};

export function createPlayerToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashPlayerToken(token) };
}

export function hashPlayerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyPlayerToken(token: string, hash: string): boolean {
  return hashPlayerToken(token) === hash;
}

export function createRuntimeDeckSnapshot(
  template: DeckSnapshot,
  playerId: string,
  idPrefix = playerId,
): DeckRuntimeSnapshot {
  const instances: CardInstance[] = [];
  for (const entry of template.entries) {
    const source = sectionSource(entry.section);
    for (let copy = 1; copy <= entry.quantity; copy += 1) {
      const registeredCardId = `${idPrefix}:${source}:${entry.cardCode}:${copy}`;
      instances.push({
        instanceId: registeredCardId,
        registeredCardId,
        ownerPlayerId: playerId,
        source,
        cardCode: entry.cardCode,
      });
    }
  }
  return { template, instances };
}

export function createInitialGame(input: {
  matchId: string;
  gameId?: string;
  now: string;
  rngSeed: string;
  playerIds: [string, string];
  decks: [DeckRuntimeSnapshot, DeckRuntimeSnapshot];
}): GameDocument {
  const chooserIndex =
    createHash("sha256").update(input.rngSeed).digest()[0]! % 2;
  const players = Object.fromEntries(
    input.playerIds.map((playerId, index) => {
      const deck = input.decks[index]!;
      return [
        playerId,
        {
          playerId,
          points: 0,
          scoredBattlefieldIdsThisTurn: [],
          energy: 0,
          conditionalEnergy: 0,
          power: {},
          zones: {
            legend: null,
            champion: null,
            mainDeck: idsBySource(deck, "mainDeck"),
            runeDeck: idsBySource(deck, "runeDeck"),
            hand: [],
            trash: [],
            banishment: [],
            base: [],
          },
        },
      ];
    }),
  );
  const cardStates = Object.fromEntries(
    input.decks.flatMap((deck) =>
      deck.instances.map((instance) => [
        instance.instanceId,
        {
          exhausted: false,
          damage: 0,
          computedMight: cardByCode(deck, instance.cardCode).card.attributes
            .might,
          objectVersion: 0,
        },
      ]),
    ),
  );
  return gameDocumentSchema.parse({
    id: input.gameId ?? `${input.matchId}:game:1`,
    createdAt: input.now,
    updatedAt: input.now,
    matchId: input.matchId,
    gameNumber: 1,
    stateVersion: 0,
    status: "setup_pending",
    winnerPlayerId: null,
    completionReason: null,
    state: {
      setup: {
        playerIds: input.playerIds,
        startingPlayerChooserId: input.playerIds[chooserIndex],
        startingPlayerId: null,
        battlefieldPools: Object.fromEntries(
          input.playerIds.map((id, i) => [
            id,
            idsBySource(input.decks[i]!, "battlefield"),
          ]),
        ),
        battlefieldChoices: Object.fromEntries(
          input.playerIds.map((id) => [
            id,
            { status: "unlocked", cardInstanceId: null },
          ]),
        ),
        mulligans: Object.fromEntries(
          input.playerIds.map((id) => [
            id,
            { status: "unlocked", selectedCardInstanceIds: [] },
          ]),
        ),
      },
      players,
      battlefields: [],
      cardStates,
      createdCardInstances: [],
      createdCardDefinitions: [],
      turn: null,
      chain: null,
      showdown: null,
      combat: null,
      modifiers: [],
      ongoingEffects: [],
      delayedEffects: [],
      effectResolutions: [],
      pendingChoice: null,
      queuedTriggerChoices: [],
    },
  });
}

export function createMatchId(): string {
  return randomUUID();
}

function idsBySource(
  deck: DeckRuntimeSnapshot,
  source: CardInstance["source"],
): string[] {
  return deck.instances
    .filter((instance) => instance.source === source)
    .map((instance) => instance.instanceId);
}
function cardByCode(
  deck: DeckRuntimeSnapshot,
  code: string,
): GameCardDefinition {
  return deck.template.cards.find(
    (definition) => definition.cardCode === code,
  )!;
}
function sectionSource(
  section: DeckSnapshot["entries"][number]["section"],
): CardInstance["source"] {
  return (
    {
      Legend: "legend",
      Champion: "champion",
      Runes: "runeDeck",
      Battlefields: "battlefield",
      MainDeck: "mainDeck",
      Sideboard: "sideboard",
    } as const
  )[section];
}
