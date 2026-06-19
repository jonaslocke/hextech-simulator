import type { CardCatalog } from "../catalog";
import type { Repositories } from "../db";
import {
  persistDeckSnapshot,
  validateDeckList,
  type DeckSnapshot
} from "../deck";
import { projectGameEventsForPlayer, type GameLogEntry } from "../events";
import {
  createBestOfThreeMatch,
  hashPlayerToken,
  matchSchema,
  type Match
} from ".";
import {
  createGame,
  type CardLookup,
  type Game
} from "./game";
import { handleMatchIntent } from "./intent-service";
import { projectGameForPlayer, type GameProjection } from "./projections";

export type AnnieLuxAcceptanceInput = {
  annieDeckSource: string;
  luxDeckSource: string;
  catalog: CardCatalog;
  matchId?: string;
  gameId?: string;
  now?: string;
  rngSeed?: string;
};

export type AnnieLuxAcceptanceResult = {
  match: Match;
  game: Game;
  playerTokens: Record<"annie" | "lux", string>;
  playedUnitCardInstanceId: string;
  battlefieldId: string;
  cardsByInstanceId: CardLookup;
  projections: Record<"annie" | "lux", GameProjection>;
  logEntries: Record<"annie" | "lux", GameLogEntry[]>;
};

const anniePlayerId = "annie";
const luxPlayerId = "lux";
const annieToken = "annie-token";
const luxToken = "lux-token";

export async function runAnnieLuxFirstShowdownAcceptance(
  repositories: Repositories,
  input: AnnieLuxAcceptanceInput
): Promise<AnnieLuxAcceptanceResult> {
  const now = input.now ?? new Date().toISOString();
  const matchId = input.matchId ?? "match-annie-lux-acceptance";
  const gameId = input.gameId ?? `${matchId}:game:1`;
  const rngSeed = input.rngSeed ?? "annie-lux-4";

  const annieSnapshot = requireValidDeckSnapshot(
    input.annieDeckSource,
    input.catalog,
    anniePlayerId
  );
  const luxSnapshot = requireValidDeckSnapshot(
    input.luxDeckSource,
    input.catalog,
    luxPlayerId
  );
  const annieDeck = await persistDeckSnapshot(repositories.deckSnapshots, {
    snapshot: annieSnapshot,
    playerId: anniePlayerId,
    matchId,
    now: new Date(now)
  });
  const luxDeck = await persistDeckSnapshot(repositories.deckSnapshots, {
    snapshot: luxSnapshot,
    playerId: luxPlayerId,
    matchId,
    now: new Date(now)
  });
  let match = matchSchema.parse({
    ...createBestOfThreeMatch({
      id: matchId,
      now,
      playerSeats: [
        {
          playerId: anniePlayerId,
          seat: "player-1",
          tokenHash: hashPlayerToken(annieToken),
          deckSnapshotId: annieDeck.id
        },
        {
          playerId: luxPlayerId,
          seat: "player-2",
          tokenHash: hashPlayerToken(luxToken),
          deckSnapshotId: luxDeck.id
        }
      ]
    }),
    currentGameId: gameId,
    gameIds: [gameId]
  });
  const game = createGame({
    id: gameId,
    now,
    matchId,
    gameNumber: 1,
    playerIds: [anniePlayerId, luxPlayerId],
    rngSeed,
    battlefieldCardInstanceIdsByPlayer: {
      [anniePlayerId]: findInstanceIds(annieSnapshot, "battlefield"),
      [luxPlayerId]: findInstanceIds(luxSnapshot, "battlefield")
    },
    mainDeckCardInstanceIdsByPlayer: {
      [anniePlayerId]: findInstanceIds(annieSnapshot, "mainDeck"),
      [luxPlayerId]: findInstanceIds(luxSnapshot, "mainDeck")
    },
    runeDeckCardInstanceIdsByPlayer: {
      [anniePlayerId]: findInstanceIds(annieSnapshot, "runeDeck"),
      [luxPlayerId]: findInstanceIds(luxSnapshot, "runeDeck")
    }
  });

  await repositories.matches.upsert(match);
  await repositories.games.upsert(game);

  await submitIntent(repositories, matchId, gameId, annieToken, {
    type: "setup.lockBattlefieldChoice",
    payload: {
      cardInstanceId: findFirstInstanceId(annieSnapshot, "battlefield")
    }
  });
  await submitIntent(repositories, matchId, gameId, luxToken, {
    type: "setup.lockBattlefieldChoice",
    payload: {
      cardInstanceId: findFirstInstanceId(luxSnapshot, "battlefield")
    }
  });
  await submitIntent(repositories, matchId, gameId, annieLuxTokenByChooser, {
    type: "setup.chooseStartingPlayer",
    payload: {
      startingPlayerId: luxPlayerId
    }
  });

  const cardsByInstanceId = createCardsByInstanceId(annieSnapshot, luxSnapshot);

  await submitIntent(repositories, matchId, gameId, luxToken, {
    type: "game.channel",
    payload: {
      count: 2
    }
  }, cardsByInstanceId);
  await submitIntent(repositories, matchId, gameId, luxToken, {
    type: "game.draw"
  }, cardsByInstanceId);

  const playableUnitId = findCardInPlayerZone(
    await requirePersistedGame(repositories, gameId),
    luxPlayerId,
    "hand",
    "Daring Poro",
    cardsByInstanceId
  );
  await submitIntent(repositories, matchId, gameId, luxToken, {
    type: "game.playCard",
    payload: {
      cardInstanceId: playableUnitId,
      selectedModeId: "regular",
      destination: "base"
    }
  }, cardsByInstanceId);
  await submitIntent(repositories, matchId, gameId, luxToken, {
    type: "game.endTurn"
  }, cardsByInstanceId);
  await submitIntent(repositories, matchId, gameId, annieToken, {
    type: "game.endTurn"
  }, cardsByInstanceId);

  const battlefieldId = (await requirePersistedGame(repositories, gameId))
    .canonicalState.battlefields.find(
      (battlefield) => battlefield.selectedByPlayerId === luxPlayerId
    )?.battlefieldId;

  if (!battlefieldId) {
    throw new Error("Lux battlefield was not found in acceptance path.");
  }

  await submitIntent(repositories, matchId, gameId, luxToken, {
    type: "game.moveUnitToBattlefield",
    payload: {
      unitCardInstanceId: playableUnitId,
      battlefieldId
    }
  }, cardsByInstanceId);
  await submitIntent(repositories, matchId, gameId, luxToken, {
    type: "game.pass"
  }, cardsByInstanceId);
  await submitIntent(repositories, matchId, gameId, annieToken, {
    type: "game.pass"
  }, cardsByInstanceId);

  const finalGame = await requirePersistedGame(repositories, gameId);
  const events = await repositories.gameEvents.findByGameId(gameId);
  match = (await repositories.matches.findById(matchId)) ?? match;

  return {
    match,
    game: finalGame,
    playerTokens: {
      annie: annieToken,
      lux: luxToken
    },
    playedUnitCardInstanceId: playableUnitId,
    battlefieldId,
    cardsByInstanceId,
    projections: {
      annie: projectGameForPlayer(finalGame, anniePlayerId, cardsByInstanceId),
      lux: projectGameForPlayer(finalGame, luxPlayerId, cardsByInstanceId)
    },
    logEntries: {
      annie: projectGameEventsForPlayer(events, anniePlayerId),
      lux: projectGameEventsForPlayer(events, luxPlayerId)
    }
  };
}

async function annieLuxTokenByChooser(
  repositories: Repositories,
  gameId: string
): Promise<string> {
  const game = await requirePersistedGame(repositories, gameId);
  const chooserId = game.canonicalState.setup.startingPlayerChooserId;

  if (chooserId === anniePlayerId) {
    return annieToken;
  }

  if (chooserId === luxPlayerId) {
    return luxToken;
  }

  throw new Error("Starting-player chooser has not been assigned.");
}

async function submitIntent(
  repositories: Repositories,
  matchId: string,
  gameId: string,
  tokenOrTokenFactory:
    | string
    | ((repositories: Repositories, gameId: string) => Promise<string>),
  intent: {
    type: string;
    payload?: unknown;
  },
  cardsByInstanceId?: CardLookup
) {
  const game = await requirePersistedGame(repositories, gameId);
  const playerToken =
    typeof tokenOrTokenFactory === "string"
      ? tokenOrTokenFactory
      : await tokenOrTokenFactory(repositories, gameId);
  const result = await handleMatchIntent(
    repositories,
    {
      matchId,
      gameId,
      playerToken,
      stateVersion: game.stateVersion,
      intent
    },
    {
      cardsByInstanceId
    }
  );

  if (!result.accepted) {
    throw new Error(
      `Acceptance intent failed: ${result.error.code} ${result.error.message}`
    );
  }

  return result.game;
}

function requireValidDeckSnapshot(
  sourceText: string,
  catalog: CardCatalog,
  ownerId: string
): DeckSnapshot {
  const result = validateDeckList(sourceText, catalog, {
    ownerId
  });

  if (!result.ok) {
    throw new Error(
      `Fixture deck is invalid for ${ownerId}: ${JSON.stringify(result.issues)}`
    );
  }

  return result.snapshot;
}

function findInstanceIds(
  snapshot: DeckSnapshot,
  source: DeckSnapshot["instances"][number]["source"]
): string[] {
  return snapshot.instances
    .filter((instance) => instance.source === source)
    .map((instance) => instance.instanceId);
}

function findFirstInstanceId(
  snapshot: DeckSnapshot,
  source: DeckSnapshot["instances"][number]["source"]
): string {
  const instanceId = findInstanceIds(snapshot, source)[0];

  if (!instanceId) {
    throw new Error(`Deck snapshot does not contain a ${source} instance.`);
  }

  return instanceId;
}

function createCardsByInstanceId(
  ...snapshots: DeckSnapshot[]
): CardLookup {
  return Object.fromEntries(
    snapshots.flatMap((snapshot) =>
      snapshot.instances.map((instance) => [instance.instanceId, instance.card])
    )
  );
}

async function requirePersistedGame(
  repositories: Repositories,
  gameId: string
): Promise<Game> {
  const game = await repositories.games.findById(gameId);

  if (!game) {
    throw new Error(`Game not found: ${gameId}`);
  }

  return game;
}

function findCardInPlayerZone(
  game: Game,
  playerId: string,
  zone: "hand" | "base",
  cardName: string,
  cardsByInstanceId: CardLookup
): string {
  const player = game.canonicalState.players[playerId];

  if (!player) {
    throw new Error(`Player not found: ${playerId}`);
  }

  const instanceId = player.zones[zone].find(
    (candidate) => cardsByInstanceId[candidate]?.name === cardName
  );

  if (!instanceId) {
    throw new Error(`${cardName} was not found in ${playerId} ${zone}.`);
  }

  return instanceId;
}
