import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { DeckSnapshot, GameCardDefinition } from "./schemas";

export const cardInstanceSchema = z.object({
  instanceId: z.string().min(1),
  ownerPlayerId: z.string().min(1),
  source: z.enum(["legend", "champion", "mainDeck", "runeDeck", "battlefield", "sideboard"]),
  cardCode: z.string().min(1)
});

export const playerZonesSchema = z.object({
  legend: z.string().nullable(),
  champion: z.string().nullable(),
  mainDeck: z.array(z.string()),
  runeDeck: z.array(z.string()),
  hand: z.array(z.string()),
  trash: z.array(z.string()),
  banishment: z.array(z.string()),
  base: z.array(z.string())
});

export const playerStateSchema = z.object({
  playerId: z.string().min(1),
  points: z.number().int().nonnegative().optional(),
  scoredBattlefieldIdsThisTurn: z.array(z.string()).optional(),
  energy: z.number().int().nonnegative(),
  conditionalEnergy: z.number().int().nonnegative(),
  power: z.record(z.number().int().nonnegative()),
  zones: playerZonesSchema
});

export const battlefieldStateSchema = z.object({
  battlefieldId: z.string().min(1),
  cardInstanceId: z.string().min(1),
  selectedByPlayerId: z.string().min(1),
  controllerPlayerId: z.string().nullable().optional(),
  contestedByPlayerId: z.string().nullable().optional(),
  units: z.array(z.string())
});

export const setupStateSchema = z.object({
  playerIds: z.tuple([z.string().min(1), z.string().min(1)]),
  startingPlayerChooserId: z.string().min(1),
  startingPlayerId: z.string().nullable(),
  battlefieldPools: z.record(z.array(z.string())),
  battlefieldChoices: z.record(z.object({
    status: z.enum(["unlocked", "locked", "revealed"]),
    cardInstanceId: z.string().nullable()
  })),
  mulligans: z.record(z.object({
    status: z.enum(["unlocked", "locked"]),
    selectedCardInstanceIds: z.array(z.string()).max(2)
  }))
});

export const turnStateSchema = z.object({
  turnNumber: z.number().int().positive(),
  activePlayerId: z.string().min(1),
  phase: z.enum(["awaken", "beginning", "channel", "draw", "action", "end"]),
  endTriggersQueued: z.boolean().optional(),
  endDelayedEffectsQueued: z.boolean().optional()
});

export const cardStateSchema = z.object({
  exhausted: z.boolean(),
  damage: z.number().int().nonnegative(),
  computedMight: z.number().nullable(),
  objectVersion: z.number().int().nonnegative().optional(),
  combatRole: z.enum(["attacker", "defender"]).nullable().optional()
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
  behaviorEvent: z.object({
    type: z.string(),
    actorPlayerId: z.string().nullable(),
    subjectCardInstanceId: z.string().nullable(),
    values: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
  }).nullable().default(null)
});

const triggerOrderChoiceSchema = z.object({
  id: z.string().min(1),
  playerId: z.string().min(1),
  type: z.literal("orderTriggers"),
  optionIds: z.array(z.string().min(1)),
  pendingItems: z.array(chainItemSchema)
});

const combatDamageChoiceSchema = z.object({
  id: z.string().min(1),
  playerId: z.string().min(1),
  type: z.literal("assignCombatDamage"),
  totalDamage: z.number().int().nonnegative(),
  targetUnitIds: z.array(z.string().min(1))
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
  targetRequirements: z.array(z.object({
    kind: z.enum(["card", "battlefield", "player"]),
    label: z.string().min(1).optional(),
    sourceZone: z.enum(["hand", "trash", "mainDeck"]).optional(),
    legalIds: z.array(z.string().min(1)),
    minimum: z.number().int().nonnegative(),
    maximum: z.number().int().nonnegative()
  })).optional()
});

const damageAssignmentSchema = z.object({
  targetUnitId: z.string().min(1),
  amount: z.number().int().positive()
});

export const gameStateSchema = z.object({
  setup: setupStateSchema,
  players: z.record(playerStateSchema),
  battlefields: z.array(battlefieldStateSchema),
  cardStates: z.record(cardStateSchema),
  turn: turnStateSchema.nullable(),
  chain: z.object({
    items: z.array(chainItemSchema),
    relevantPlayerIds: z.array(z.string().min(1)).min(1),
    priorityPlayerId: z.string().min(1),
    passedPlayerIds: z.array(z.string().min(1))
  }).nullable(),
  showdown: z.object({
    kind: z.enum(["nonCombat", "combat"]),
    battlefieldId: z.string().min(1),
    relevantPlayerIds: z.array(z.string().min(1)).min(1),
    focusPlayerId: z.string().min(1),
    passedPlayerIds: z.array(z.string().min(1))
  }).nullable(),
  combat: z.object({
    battlefieldId: z.string().min(1),
    stage: z.enum(["showdown", "attackerAssignment", "defenderAssignment"]),
    attackerPlayerId: z.string().min(1),
    defenderPlayerId: z.string().min(1),
    attackerUnitIds: z.array(z.string().min(1)),
    defenderUnitIds: z.array(z.string().min(1)),
    attackerMight: z.number().int().nonnegative().nullable(),
    defenderMight: z.number().int().nonnegative().nullable(),
    attackerAssignments: z.array(damageAssignmentSchema),
    defenderAssignments: z.array(damageAssignmentSchema)
  }).nullable(),
  modifiers: z.array(z.object({
    id: z.string().min(1), sourceCardInstanceId: z.string().nullable(),
    controllerPlayerId: z.string().min(1).optional(),
    targetCardInstanceId: z.string().nullable(), attribute: z.string().min(1),
    targetScope: z.string().min(1),
    operation: z.enum(["increase", "reduce", "multiply", "set"]),
    amount: z.number(), minimum: z.number().nullable(), duration: z.string().min(1),
    createdAtTurn: z.number().int().nonnegative()
  })),
  delayedEffects: z.array(z.object({
    id: z.string().min(1), point: z.string().min(1), controllerPlayerId: z.string().min(1),
    sourceCardInstanceId: z.string().min(1), clauseId: z.string().min(1),
    selectedIds: z.array(z.string())
  })),
  effectResolutions: z.array(z.object({
    id: z.string().min(1),
    controllerPlayerId: z.string().min(1),
    sourceCardInstanceId: z.string().min(1),
    clauseId: z.string().min(1),
    nextEffectIndex: z.number().int().nonnegative(),
    delayedEffectId: z.string().min(1).nullable(),
    endingPlayerId: z.string().min(1).nullable(),
    initialSelectedIds: z.array(z.string()).default([]),
    targetsLocked: z.boolean().optional(),
    selectionsByBinding: z.record(z.array(z.string()))
  })),
  pendingChoice: z.discriminatedUnion("type", [
    triggerOrderChoiceSchema,
    combatDamageChoiceSchema,
    effectSelectionChoiceSchema
  ]).nullable(),
  queuedTriggerChoices: z.array(triggerOrderChoiceSchema),
  queuedChainItems: z.array(chainItemSchema).optional(),
  queuedBehaviorEvents: z.array(z.object({
    type: z.string(),
    actorPlayerId: z.string().nullable(),
    subjectCardInstanceId: z.string().nullable(),
    values: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
  })).optional()
});

export const gameDocumentSchema = z.object({
  id: z.string().min(1), createdAt: z.string(), updatedAt: z.string(),
  matchId: z.string().min(1), stateVersion: z.number().int().nonnegative(),
  status: z.enum(["setup_pending", "ready", "in_progress", "complete"]),
  winnerPlayerId: z.string().nullable(), state: gameStateSchema
});

export type CardInstance = z.infer<typeof cardInstanceSchema>;
export type ChainItem = z.infer<typeof chainItemSchema>;
export type PlayerState = z.infer<typeof playerStateSchema>;
export type GameState = z.infer<typeof gameStateSchema>;
export type GameDocument = z.infer<typeof gameDocumentSchema>;

export type MatchDocument = {
  id: string; createdAt: string; updatedAt: string;
  status: "setup_pending" | "in_progress" | "complete";
  currentGameId: string;
  seats: [
    { playerId: string; seat: "player-1"; tokenHash: string; deckSnapshotId: string },
    { playerId: string; seat: "player-2"; tokenHash: string; deckSnapshotId: string }
  ];
};

export type DeckRuntimeSnapshot = {
  template: DeckSnapshot;
  instances: CardInstance[];
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
  playerId: string
): DeckRuntimeSnapshot {
  const instances: CardInstance[] = [];
  for (const entry of template.entries) {
    const source = sectionSource(entry.section);
    for (let copy = 1; copy <= entry.quantity; copy += 1) {
      instances.push({
        instanceId: `${playerId}:${source}:${entry.cardCode}:${copy}`,
        ownerPlayerId: playerId,
        source,
        cardCode: entry.cardCode
      });
    }
  }
  return { template, instances };
}

export function createInitialGame(input: {
  matchId: string; gameId?: string; now: string; rngSeed: string;
  playerIds: [string, string]; decks: [DeckRuntimeSnapshot, DeckRuntimeSnapshot];
}): GameDocument {
  const chooserIndex = createHash("sha256").update(input.rngSeed).digest()[0]! % 2;
  const players = Object.fromEntries(input.playerIds.map((playerId, index) => {
    const deck = input.decks[index]!;
    return [playerId, {
      playerId, points: 0, scoredBattlefieldIdsThisTurn: [],
      energy: 0, conditionalEnergy: 0, power: {},
      zones: {
        legend: null, champion: null,
        mainDeck: idsBySource(deck, "mainDeck"), runeDeck: idsBySource(deck, "runeDeck"),
        hand: [], trash: [], banishment: [], base: []
      }
    }];
  }));
  const cardStates = Object.fromEntries(input.decks.flatMap((deck) =>
    deck.instances.map((instance) => [instance.instanceId, {
      exhausted: false, damage: 0, computedMight: cardByCode(deck, instance.cardCode).card.attributes.might,
      objectVersion: 0
    }])
  ));
  return gameDocumentSchema.parse({
    id: input.gameId ?? `${input.matchId}:game:1`, createdAt: input.now, updatedAt: input.now,
    matchId: input.matchId, stateVersion: 0, status: "setup_pending", winnerPlayerId: null,
    state: {
      setup: {
        playerIds: input.playerIds,
        startingPlayerChooserId: input.playerIds[chooserIndex], startingPlayerId: null,
        battlefieldPools: Object.fromEntries(input.playerIds.map((id, i) => [id, idsBySource(input.decks[i]!, "battlefield")])),
        battlefieldChoices: Object.fromEntries(input.playerIds.map((id) => [id, { status: "unlocked", cardInstanceId: null }])),
        mulligans: Object.fromEntries(input.playerIds.map((id) => [id, { status: "unlocked", selectedCardInstanceIds: [] }]))
      },
      players, battlefields: [], cardStates, turn: null, chain: null, showdown: null, combat: null,
      modifiers: [], delayedEffects: [], effectResolutions: [],
      pendingChoice: null, queuedTriggerChoices: []
    }
  });
}

export function createMatchId(): string { return randomUUID(); }

function idsBySource(deck: DeckRuntimeSnapshot, source: CardInstance["source"]): string[] {
  return deck.instances.filter((instance) => instance.source === source).map((instance) => instance.instanceId);
}
function cardByCode(deck: DeckRuntimeSnapshot, code: string): GameCardDefinition {
  return deck.template.cards.find((definition) => definition.cardCode === code)!;
}
function sectionSource(section: DeckSnapshot["entries"][number]["section"]): CardInstance["source"] {
  return ({ Legend: "legend", Champion: "champion", Runes: "runeDeck", Battlefields: "battlefield", MainDeck: "mainDeck", Sideboard: "sideboard" } as const)[section];
}
