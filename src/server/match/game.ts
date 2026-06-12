import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  chooseRandomItem,
  createRngState,
  randomOperationSchema,
  rngStateSchema,
  type RandomOperation
} from "../engine";

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
  rng: rngStateSchema,
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
  rngSeed?: string;
};

export type AssignStartingPlayerChooserResult = {
  game: Game;
  randomOperation: RandomOperation;
};

export function createGame(input: CreateGameInput): Game {
  assertDistinctPlayerIds(input.playerIds);

  const id = input.id ?? randomUUID();
  const now = input.now ?? new Date().toISOString();
  const canonicalState: CanonicalGameState = {
    rng: createRngState(input.rngSeed ?? id),
    setup: {
      playerIds: input.playerIds,
      startingPlayerChooserId: null,
      startingPlayerId: null,
      battlefieldChoices: createInitialBattlefieldChoices(input.playerIds)
    }
  };

  return gameSchema.parse({
    id,
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

export function assignGameOneStartingPlayerChooser(
  game: Game,
  now = new Date().toISOString()
): AssignStartingPlayerChooserResult {
  if (game.gameNumber !== 1) {
    throw new Error("Only game 1 starting-player chooser is selected by RNG.");
  }

  if (game.canonicalState.setup.startingPlayerChooserId !== null) {
    throw new Error("Starting-player chooser has already been assigned.");
  }

  const choice = chooseRandomItem(
    game.canonicalState.rng,
    game.canonicalState.setup.playerIds,
    "game-1-starting-player-chooser"
  );
  const updatedGame = gameSchema.parse({
    ...game,
    updatedAt: now,
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      rng: choice.rngState,
      setup: {
        ...game.canonicalState.setup,
        startingPlayerChooserId: choice.value
      }
    }
  });

  return {
    game: updatedGame,
    randomOperation: randomOperationSchema.parse(choice.operation)
  };
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
