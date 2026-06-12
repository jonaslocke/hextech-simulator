import { randomUUID } from "node:crypto";
import { z } from "zod";

export const gameStatuses = ["setup_pending", "ready", "in_progress", "complete"] as const;

export const battlefieldChoiceSchema = z.object({
  playerId: z.string().min(1),
  status: z.enum(["unlocked", "locked", "revealed"]),
  cardInstanceId: z.string().min(1).nullable(),
  lockedAt: z.string().datetime().nullable(),
  revealedAt: z.string().datetime().nullable()
});

export const gameSetupStateSchema = z.object({
  playerIds: z.tuple([z.string().min(1), z.string().min(1)]),
  startingPlayerChooserId: z.string().min(1).nullable(),
  startingPlayerId: z.string().min(1).nullable(),
  battlefieldChoices: z.record(z.string().min(1), battlefieldChoiceSchema)
});

export const canonicalGameStateSchema = z.object({
  setup: gameSetupStateSchema
});

export const gameSchema = z.object({
  id: z.string().min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  matchId: z.string().min(1),
  gameNumber: z.number().int().min(1).max(3),
  status: z.enum(gameStatuses),
  stateVersion: z.number().int().min(0),
  canonicalState: canonicalGameStateSchema,
  winnerPlayerId: z.string().min(1).nullable()
});

export type GameStatus = (typeof gameStatuses)[number];
export type BattlefieldChoice = z.infer<typeof battlefieldChoiceSchema>;
export type GameSetupState = z.infer<typeof gameSetupStateSchema>;
export type CanonicalGameState = z.infer<typeof canonicalGameStateSchema>;
export type Game = z.infer<typeof gameSchema>;

export type CreateGameInput = {
  id?: string;
  now?: string;
  matchId: string;
  gameNumber: number;
  playerIds: [string, string];
};

export function createGame(input: CreateGameInput): Game {
  assertDistinctPlayerIds(input.playerIds);

  const now = input.now ?? new Date().toISOString();
  const canonicalState: CanonicalGameState = {
    setup: {
      playerIds: input.playerIds,
      startingPlayerChooserId: null,
      startingPlayerId: null,
      battlefieldChoices: createInitialBattlefieldChoices(input.playerIds)
    }
  };

  return gameSchema.parse({
    id: input.id ?? randomUUID(),
    createdAt: now,
    updatedAt: now,
    matchId: input.matchId,
    gameNumber: input.gameNumber,
    status: "setup_pending",
    stateVersion: 0,
    canonicalState,
    winnerPlayerId: null
  });
}

function createInitialBattlefieldChoices(
  playerIds: [string, string]
): Record<string, BattlefieldChoice> {
  return Object.fromEntries(
    playerIds.map((playerId) => [
      playerId,
      {
        playerId,
        status: "unlocked",
        cardInstanceId: null,
        lockedAt: null,
        revealedAt: null
      }
    ])
  );
}

function assertDistinctPlayerIds(playerIds: [string, string]) {
  if (playerIds[0] === playerIds[1]) {
    throw new Error("A game cannot use the same playerId for both players.");
  }
}
