import { createHash, randomBytes, randomUUID } from "node:crypto";
import { z } from "zod";
import type { DeckSnapshotV2, GameCardDefinition } from "./schemas";

export const cardInstanceV2Schema = z.object({
  instanceId: z.string().min(1),
  ownerPlayerId: z.string().min(1),
  source: z.enum(["legend", "champion", "mainDeck", "runeDeck", "battlefield", "sideboard"]),
  cardCode: z.string().min(1)
});

export const playerZonesV2Schema = z.object({
  legend: z.string().nullable(),
  champion: z.string().nullable(),
  mainDeck: z.array(z.string()),
  runeDeck: z.array(z.string()),
  hand: z.array(z.string()),
  trash: z.array(z.string()),
  banishment: z.array(z.string()),
  base: z.array(z.string())
});

export const playerStateV2Schema = z.object({
  playerId: z.string().min(1),
  energy: z.number().int().nonnegative(),
  conditionalEnergy: z.number().int().nonnegative(),
  power: z.record(z.number().int().nonnegative()),
  zones: playerZonesV2Schema
});

export const battlefieldStateV2Schema = z.object({
  battlefieldId: z.string().min(1),
  cardInstanceId: z.string().min(1),
  selectedByPlayerId: z.string().min(1),
  units: z.array(z.string())
});

export const setupStateV2Schema = z.object({
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

export const turnStateV2Schema = z.object({
  turnNumber: z.number().int().positive(),
  activePlayerId: z.string().min(1),
  phase: z.enum(["awaken", "beginning", "channel", "draw", "action", "end"])
});

export const cardStateV2Schema = z.object({
  exhausted: z.boolean(),
  damage: z.number().int().nonnegative(),
  computedMight: z.number().nullable()
});

export const gameStateV2Schema = z.object({
  setup: setupStateV2Schema,
  players: z.record(playerStateV2Schema),
  battlefields: z.array(battlefieldStateV2Schema),
  cardStates: z.record(cardStateV2Schema),
  turn: turnStateV2Schema.nullable(),
  chain: z.object({
    items: z.array(z.object({
      id: z.string(), label: z.string(), controllerPlayerId: z.string(),
      sourceCardInstanceId: z.string().nullable(), targetCardInstanceIds: z.array(z.string()),
      behaviorClauseId: z.string().nullable().default(null),
      behaviorEvent: z.object({
        type: z.string(), actorPlayerId: z.string().nullable(),
        subjectCardInstanceId: z.string().nullable(),
        values: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      }).nullable().default(null)
    })),
    priorityPlayerId: z.string().min(1),
    passedPlayerIds: z.array(z.string().min(1))
  }).nullable(),
  showdown: z.object({
    battlefieldId: z.string().min(1),
    priorityPlayerId: z.string().min(1),
    passedPlayerIds: z.array(z.string().min(1))
  }).nullable(),
  modifiers: z.array(z.object({
    id: z.string().min(1), sourceCardInstanceId: z.string().nullable(),
    controllerPlayerId: z.string().min(1).optional(),
    targetCardInstanceId: z.string().nullable(), attribute: z.string().min(1),
    operation: z.enum(["increase", "reduce", "multiply", "set"]),
    amount: z.number(), minimum: z.number().nullable(), duration: z.string().min(1),
    createdAtTurn: z.number().int().nonnegative()
  })),
  delayedEffects: z.array(z.object({
    id: z.string().min(1), point: z.string().min(1), controllerPlayerId: z.string().min(1),
    sourceCardInstanceId: z.string().min(1), clauseId: z.string().min(1),
    selectedIds: z.array(z.string())
  })),
  pendingChoice: z.object({
    id: z.string().min(1), playerId: z.string().min(1), type: z.literal("orderTriggers"),
    optionIds: z.array(z.string().min(1)), pendingItems: z.array(z.object({
      id: z.string(), label: z.string(), controllerPlayerId: z.string(),
      sourceCardInstanceId: z.string().nullable(), targetCardInstanceIds: z.array(z.string()),
      behaviorClauseId: z.string().nullable().default(null),
      behaviorEvent: z.object({
        type: z.string(), actorPlayerId: z.string().nullable(),
        subjectCardInstanceId: z.string().nullable(),
        values: z.record(z.union([z.string(), z.number(), z.boolean(), z.null()]))
      }).nullable().default(null)
    }))
  }).nullable()
});

export const gameDocumentV2Schema = z.object({
  id: z.string().min(1), createdAt: z.string(), updatedAt: z.string(),
  matchId: z.string().min(1), stateVersion: z.number().int().nonnegative(),
  status: z.enum(["setup_pending", "ready", "in_progress", "complete"]),
  winnerPlayerId: z.string().nullable(), state: gameStateV2Schema
});

export type CardInstanceV2 = z.infer<typeof cardInstanceV2Schema>;
export type PlayerStateV2 = z.infer<typeof playerStateV2Schema>;
export type GameStateV2 = z.infer<typeof gameStateV2Schema>;
export type GameDocumentV2 = z.infer<typeof gameDocumentV2Schema>;

export type MatchDocumentV2 = {
  id: string; createdAt: string; updatedAt: string;
  status: "setup_pending" | "in_progress" | "complete";
  currentGameId: string;
  seats: [
    { playerId: string; seat: "player-1"; tokenHash: string; deckSnapshotId: string },
    { playerId: string; seat: "player-2"; tokenHash: string; deckSnapshotId: string }
  ];
};

export type DeckRuntimeSnapshotV2 = {
  template: DeckSnapshotV2;
  instances: CardInstanceV2[];
};

export function createPlayerTokenV2(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashPlayerTokenV2(token) };
}

export function hashPlayerTokenV2(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyPlayerTokenV2(token: string, hash: string): boolean {
  return hashPlayerTokenV2(token) === hash;
}

export function createRuntimeDeckSnapshot(
  template: DeckSnapshotV2,
  playerId: string
): DeckRuntimeSnapshotV2 {
  const instances: CardInstanceV2[] = [];
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

export function createInitialGameV2(input: {
  matchId: string; gameId?: string; now: string; rngSeed: string;
  playerIds: [string, string]; decks: [DeckRuntimeSnapshotV2, DeckRuntimeSnapshotV2];
}): GameDocumentV2 {
  const chooserIndex = createHash("sha256").update(input.rngSeed).digest()[0]! % 2;
  const players = Object.fromEntries(input.playerIds.map((playerId, index) => {
    const deck = input.decks[index]!;
    return [playerId, {
      playerId, energy: 0, conditionalEnergy: 0, power: {},
      zones: {
        legend: null, champion: null,
        mainDeck: idsBySource(deck, "mainDeck"), runeDeck: idsBySource(deck, "runeDeck"),
        hand: [], trash: [], banishment: [], base: []
      }
    }];
  }));
  const cardStates = Object.fromEntries(input.decks.flatMap((deck) =>
    deck.instances.map((instance) => [instance.instanceId, {
      exhausted: false, damage: 0, computedMight: cardByCode(deck, instance.cardCode).card.attributes.might
    }])
  ));
  return gameDocumentV2Schema.parse({
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
      players, battlefields: [], cardStates, turn: null, chain: null, showdown: null,
      modifiers: [], delayedEffects: [], pendingChoice: null
    }
  });
}

export function createMatchIdV2(): string { return randomUUID(); }

function idsBySource(deck: DeckRuntimeSnapshotV2, source: CardInstanceV2["source"]): string[] {
  return deck.instances.filter((instance) => instance.source === source).map((instance) => instance.instanceId);
}
function cardByCode(deck: DeckRuntimeSnapshotV2, code: string): GameCardDefinition {
  return deck.template.cards.find((definition) => definition.cardCode === code)!;
}
function sectionSource(section: DeckSnapshotV2["entries"][number]["section"]): CardInstanceV2["source"] {
  return ({ Legend: "legend", Champion: "champion", Runes: "runeDeck", Battlefields: "battlefield", MainDeck: "mainDeck", Sideboard: "sideboard" } as const)[section];
}
