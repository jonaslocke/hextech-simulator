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

export type AssignPreviousGameLoserChooserResult = {
  game: Game;
  previousGameLoserId: string;
};

export type ChooseStartingPlayerInput = {
  actorPlayerId: string;
  startingPlayerId: string;
  now?: string;
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

export function assignPreviousGameLoserStartingPlayerChooser(
  game: Game,
  previousGame: Game,
  now = new Date().toISOString()
): AssignPreviousGameLoserChooserResult {
  if (game.gameNumber !== 2 && game.gameNumber !== 3) {
    throw new Error("Only games 2 and 3 use the previous game loser as chooser.");
  }

  if (previousGame.gameNumber !== game.gameNumber - 1) {
    throw new Error("Previous game must immediately precede the game being set up.");
  }

  if (previousGame.status !== "complete" || previousGame.winnerPlayerId === null) {
    throw new Error("Previous game must be complete with a winner.");
  }

  if (game.canonicalState.setup.startingPlayerChooserId !== null) {
    throw new Error("Starting-player chooser has already been assigned.");
  }

  assertSamePlayers(game, previousGame);

  const previousGameLoserId = game.canonicalState.setup.playerIds.find(
    (playerId) => playerId !== previousGame.winnerPlayerId
  );

  if (!previousGameLoserId) {
    throw new Error("Previous game winner must be one of the current game players.");
  }

  return {
    game: gameSchema.parse({
      ...game,
      updatedAt: now,
      stateVersion: game.stateVersion + 1,
      canonicalState: {
        ...game.canonicalState,
        setup: {
          ...game.canonicalState.setup,
          startingPlayerChooserId: previousGameLoserId
        }
      }
    }),
    previousGameLoserId
  };
}

export function chooseStartingPlayer(
  game: Game,
  input: ChooseStartingPlayerInput
): Game {
  const chooserId = game.canonicalState.setup.startingPlayerChooserId;

  if (game.status !== "setup_pending") {
    throw new Error("Starting player can only be chosen during setup.");
  }

  if (chooserId === null) {
    throw new Error("Starting-player chooser has not been assigned.");
  }

  if (game.canonicalState.setup.startingPlayerId !== null) {
    throw new Error("Starting player has already been chosen.");
  }

  if (input.actorPlayerId !== chooserId) {
    throw new Error("Only the assigned starting-player chooser can choose.");
  }

  if (!game.canonicalState.setup.playerIds.includes(input.startingPlayerId)) {
    throw new Error("Starting player must be one of the game players.");
  }

  return gameSchema.parse({
    ...game,
    updatedAt: input.now ?? new Date().toISOString(),
    stateVersion: game.stateVersion + 1,
    canonicalState: {
      ...game.canonicalState,
      setup: {
        ...game.canonicalState.setup,
        startingPlayerId: input.startingPlayerId
      }
    }
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

function assertSamePlayers(game: Game, previousGame: Game) {
  const currentPlayers = new Set(game.canonicalState.setup.playerIds);
  const previousPlayers = new Set(previousGame.canonicalState.setup.playerIds);

  if (
    currentPlayers.size !== previousPlayers.size ||
    [...currentPlayers].some((playerId) => !previousPlayers.has(playerId))
  ) {
    throw new Error("Current game and previous game must contain the same players.");
  }
}
