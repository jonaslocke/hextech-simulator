import { createRandomOperationEvent } from "../events";
import type { RandomOperation } from "../engine";
import type { Repositories } from "../db";
import {
  assignGameOneStartingPlayerChooser,
  shuffleMainDecks,
  shuffleRuneDecks,
  type Game,
  type ShuffleDecksResult
} from "./game";

export type SetupServiceOptions = {
  createEventId?: (input: { gameId: string; sequence: number }) => string;
};

export type SetupServiceResult = {
  game: Game;
};

export async function assignGameOneStartingPlayerChooserWithEvents(
  repositories: Pick<Repositories, "games" | "gameEvents">,
  gameId: string,
  now = new Date().toISOString(),
  options: SetupServiceOptions = {}
): Promise<SetupServiceResult> {
  const game = await requireGame(repositories, gameId);
  const result = assignGameOneStartingPlayerChooser(game, now);

  await persistGameAndRandomOperations(repositories, result.game, [
    result.randomOperation
  ], now, options);

  return {
    game: result.game
  };
}

export async function shuffleMainDecksWithEvents(
  repositories: Pick<Repositories, "games" | "gameEvents">,
  gameId: string,
  now = new Date().toISOString(),
  options: SetupServiceOptions = {}
): Promise<SetupServiceResult> {
  return shuffleDecksWithEvents(repositories, gameId, now, options, shuffleMainDecks);
}

export async function shuffleRuneDecksWithEvents(
  repositories: Pick<Repositories, "games" | "gameEvents">,
  gameId: string,
  now = new Date().toISOString(),
  options: SetupServiceOptions = {}
): Promise<SetupServiceResult> {
  return shuffleDecksWithEvents(repositories, gameId, now, options, shuffleRuneDecks);
}

async function shuffleDecksWithEvents(
  repositories: Pick<Repositories, "games" | "gameEvents">,
  gameId: string,
  now: string,
  options: SetupServiceOptions,
  shuffle: (game: Game, now: string) => ShuffleDecksResult
): Promise<SetupServiceResult> {
  const game = await requireGame(repositories, gameId);
  const result = shuffle(game, now);

  await persistGameAndRandomOperations(
    repositories,
    result.game,
    result.randomOperations,
    now,
    options
  );

  return {
    game: result.game
  };
}

async function persistGameAndRandomOperations(
  repositories: Pick<Repositories, "games" | "gameEvents">,
  game: Game,
  randomOperations: RandomOperation[],
  now: string,
  options: SetupServiceOptions
) {
  const existingEvents = await repositories.gameEvents.findByGameId(game.id);
  let sequence = existingEvents.length;

  await repositories.games.upsert(game);

  for (const operation of randomOperations) {
    sequence += 1;
    await repositories.gameEvents.append(
      createRandomOperationEvent({
        id: createEventId(game.id, sequence, options),
        now,
        matchId: game.matchId,
        gameId: game.id,
        sequence,
        operation
      })
    );
  }
}

async function requireGame(
  repositories: Pick<Repositories, "games">,
  gameId: string
): Promise<Game> {
  const game = await repositories.games.findById(gameId);

  if (!game) {
    throw new Error(`Game not found: ${gameId}`);
  }

  return game;
}

function createEventId(
  gameId: string,
  sequence: number,
  options: SetupServiceOptions
): string {
  return options.createEventId?.({ gameId, sequence }) ?? `${gameId}:event:${sequence}`;
}
