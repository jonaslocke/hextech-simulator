import assert from "node:assert/strict";
import { test } from "node:test";
import { loadCardCatalog } from "../src/server/catalog";
import type {
  BaseDocument,
  CardCatalogVersionDocument,
  DeckSnapshotDocument,
  DocumentRepository,
  GameDocument,
  GameEventDocument,
  GameEventRepository,
  MatchDocument,
  Repositories
} from "../src/server/db";
import {
  createFixedDeckMatch,
  type CreateFixedDeckMatchResult
} from "../src/server/match/fixed-deck-match-service";
import { handleMatchIntent, type Game } from "../src/server/match";

test("runs no-showdown Annie vs Lux path through setup and basic gameplay", async () => {
  const catalog = await loadCardCatalog();
  const repositories = createInMemoryRepositories();
  const created = await createFixedDeckMatch(repositories, {
    catalog,
    matchId: "match-no-showdown",
    now: "2026-06-15T12:00:00.000Z",
    playerDecks: {
      player1: "annie",
      player2: "lux"
    },
    rngSeed: "annie-lux-4"
  });
  const chooserId = created.game.canonicalState.setup.startingPlayerChooserId;
  const chooserToken = tokenForPlayer(created, chooserId);

  await submitIntent(repositories, created, chooserToken, {
    type: "setup.chooseStartingPlayer",
    payload: {
      startingPlayerId: "player-2"
    }
  });
  await submitIntent(repositories, created, created.players.player1.playerToken, {
    type: "setup.lockBattlefieldChoice",
    payload: {
      cardInstanceId: ownFirstBattlefield(created, "player-1")
    }
  });
  const startedGame = await submitIntent(
    repositories,
    created,
    created.players.player2.playerToken,
    {
      type: "setup.lockBattlefieldChoice",
      payload: {
        cardInstanceId: ownFirstBattlefield(created, "player-2")
      }
    }
  );

  assert.equal(startedGame.status, "in_progress");
  assert.equal(startedGame.canonicalState.turn?.activePlayerId, "player-2");
  assert.equal(startedGame.canonicalState.players["player-1"]?.zones.hand.length, 4);
  assert.equal(startedGame.canonicalState.players["player-2"]?.zones.hand.length, 4);

  await submitIntent(repositories, created, created.players.player2.playerToken, {
    type: "game.channel",
    payload: {
      count: 2
    }
  });
  const afterDraw = await submitIntent(
    repositories,
    created,
    created.players.player2.playerToken,
    {
      type: "game.draw"
    }
  );
  const player2Projection = (
    await submitIntent(
      repositories,
      created,
      created.players.player2.playerToken,
      {
        type: "game.pass"
      }
    )
  ).canonicalState.players["player-2"];

  assert.equal(afterDraw.canonicalState.players["player-2"]?.zones.hand.length, 5);
  assert.equal(player2Projection?.zones.base.length, 2);

  const availableCardInstanceId = await firstAvailablePlayableCard(
    repositories,
    created,
    created.players.player2.playerToken
  );
  const afterPlay = await submitIntent(
    repositories,
    created,
    created.players.player2.playerToken,
    {
      type: "game.playCard",
      payload: {
        cardInstanceId: availableCardInstanceId,
        selectedModeId: "regular",
        destination: "base"
      }
    }
  );
  const events = await repositories.gameEvents.findByGameId(created.game.id);
  const player1Projection = created.projections["player-1"];
  const player2HandCount = afterPlay.canonicalState.players["player-2"]!.zones.hand.length;

  assert.equal(afterPlay.canonicalState.showdown, null);
  assert.equal(
    afterPlay.canonicalState.players["player-2"]?.zones.base.includes(
      availableCardInstanceId
    ),
    true
  );
  assert.deepEqual(afterPlay.canonicalState.cardStates[availableCardInstanceId], {
    exhausted: true
  });
  assert.equal(player1Projection?.players["player-2"]?.zones.hand.cardInstanceIds.length, 0);
  assert.equal(player2HandCount, 4);
  assert.equal(
    events.some(
      (event) =>
        (event.payload as { decision?: { type?: string } }).decision?.type ===
        "game.start"
    ),
    true
  );
  assert.equal(
    events.some(
      (event) =>
        (event.payload as { decision?: { type?: string } }).decision?.type ===
        "game.payCosts"
    ),
    true
  );
});

async function firstAvailablePlayableCard(
  repositories: Repositories,
  created: CreateFixedDeckMatchResult,
  playerToken: string
) {
  const game = await requireGame(repositories, created.game.id);
  const result = await handleMatchIntent(
    repositories,
    {
      matchId: created.match.id,
      gameId: created.game.id,
      playerToken,
      stateVersion: game.stateVersion,
      intent: {
        type: "game.pass"
      }
    },
    {
      cardsByInstanceId: created.cardsByInstanceId
    }
  );

  if (!result.accepted) {
    throw new Error(result.error.message);
  }

  const availableCardInstanceId = Object.keys(
    result.projection.players["player-2"]?.availablePaymentModes ?? {}
  )[0];

  if (!availableCardInstanceId) {
    throw new Error("No supported playable Lux card was available.");
  }

  return availableCardInstanceId;
}

async function submitIntent(
  repositories: Repositories,
  created: CreateFixedDeckMatchResult,
  playerToken: string,
  intent: {
    type: string;
    payload?: unknown;
  }
): Promise<Game> {
  const game = await requireGame(repositories, created.game.id);
  const result = await handleMatchIntent(
    repositories,
    {
      matchId: created.match.id,
      gameId: created.game.id,
      playerToken,
      stateVersion: game.stateVersion,
      intent
    },
    {
      cardsByInstanceId: created.cardsByInstanceId
    }
  );

  if (!result.accepted) {
    throw new Error(result.error.message);
  }

  return result.game;
}

async function requireGame(
  repositories: Repositories,
  gameId: string
): Promise<Game> {
  const game = await repositories.games.findById(gameId);

  if (!game) {
    throw new Error(`Game not found: ${gameId}`);
  }

  return game;
}

function tokenForPlayer(
  created: CreateFixedDeckMatchResult,
  playerId: string | null
): string {
  if (playerId === "player-1") {
    return created.players.player1.playerToken;
  }

  if (playerId === "player-2") {
    return created.players.player2.playerToken;
  }

  throw new Error("Starting player chooser was not assigned.");
}

function ownFirstBattlefield(
  created: CreateFixedDeckMatchResult,
  playerId: "player-1" | "player-2"
) {
  const cardInstanceId =
    created.projections[playerId]?.setup.battlefieldPools[playerId]
      ?.registeredCardInstanceIds[0];

  if (!cardInstanceId) {
    throw new Error(`No battlefield available for ${playerId}.`);
  }

  return cardInstanceId;
}

function createInMemoryRepositories(): Repositories {
  return {
    matches: createDocumentRepository<MatchDocument>(),
    games: createDocumentRepository<GameDocument>(),
    gameEvents: createGameEventRepository(),
    deckSnapshots: createDocumentRepository<DeckSnapshotDocument>(),
    cardCatalogVersions: createDocumentRepository<CardCatalogVersionDocument>()
  };
}

function createDocumentRepository<T extends BaseDocument>(): DocumentRepository<T> {
  const documents = new Map<string, T>();

  return {
    async findById(id) {
      return documents.get(id) ?? null;
    },

    async insert(document) {
      documents.set(document.id, document);
    },

    async upsert(document) {
      documents.set(document.id, document);
    }
  };
}

function createGameEventRepository(): GameEventRepository {
  const base = createDocumentRepository<GameEventDocument>();
  const events: GameEventDocument[] = [];

  return {
    ...base,

    async insert(document) {
      events.push(document);
    },

    async upsert(document) {
      const index = events.findIndex((event) => event.id === document.id);

      if (index === -1) {
        events.push(document);
      } else {
        events[index] = document;
      }
    },

    async findById(id) {
      return events.find((event) => event.id === id) ?? null;
    },

    async findByMatchId(matchId) {
      return events
        .filter((event) => event.matchId === matchId)
        .sort((left, right) => left.sequence - right.sequence);
    },

    async findByGameId(gameId) {
      return events
        .filter((event) => event.gameId === gameId)
        .sort((left, right) => left.sequence - right.sequence);
    },

    async append(event) {
      events.push(event);
    }
  };
}
