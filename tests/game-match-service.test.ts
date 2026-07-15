import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db } from "mongodb";
import {
  createGameRepositories,
  createInitialDeckConfiguration,
  createInitialGame,
  createMatch,
  createRuntimeDeckSnapshot,
  getViewerState,
  hashPlayerToken,
  MatchServiceError,
  performMatchAction,
  projectMatch,
  type DeckSnapshotDocument,
  type GameRepositories,
  type MatchDocument,
} from "../src/server/game";
import type { DeckSnapshot, GameCardDefinition } from "../src/server/game/schemas";

test("creates a persisted match with synthetic decks and viewer projections", async () => {
  const fixture = memoryFixture();
  const result = await createMatch({
    db: fixture.db,
    repositories: fixture.repositories,
    matchId: "match-create",
    now: "2026-07-15T00:00:00.000Z",
    rngSeed: "synthetic-seed",
    deckTemplates: [syntheticDeck(), syntheticDeck()],
    playerDeckLabels: { player1: "Synthetic A", player2: "Synthetic B" },
    playerNames: { player1: "Alpha", player2: "Beta" },
  });

  assert.equal(result.matchId, "match-create");
  assert.equal(result.projections["player-1"]?.matchId, "match-create");
  assert.equal(result.projections["player-1"]?.status, "playing");
  assert.equal(result.projections["player-1"]?.viewerPlayerId, "player-1");
  assert.equal(result.projections["player-1"]?.currentGame.status, "setup_pending");
  assert.equal(result.projections["player-1"]?.currentGame.players[1]?.displayName, "Beta");
  assert.equal((await fixture.repositories.matches.findById("match-create"))?.stateVersion, 0);
  assert.equal((await fixture.repositories.games.findById(result.gameId))?.status, "setup_pending");
  assert.equal((await fixture.repositories.deckSnapshots.findById("match-create:deck:player-1"))?.instances.length, 58);

  const viewer = await getViewerState(
    fixture.repositories,
    result.matchId,
    result.players.player1.playerToken,
  );
  assert.equal(viewer.viewerPlayerId, "player-1");
  assert.equal(viewer.currentGame.actions.length, 3);
});

test("rejects invalid player tokens before loading match state", async () => {
  const fixture = memoryFixture();
  const result = await createMatch({
    db: fixture.db,
    repositories: fixture.repositories,
    matchId: "match-token",
    deckTemplates: [syntheticDeck(), syntheticDeck()],
  });

  await assert.rejects(
    () => getViewerState(fixture.repositories, result.matchId, "invalid-token"),
    (error) =>
      error instanceof MatchServiceError &&
      error.code === "match.invalidPlayerToken",
  );
});

test("persists a setup action and rejects a stale gameplay version", async () => {
  const setupFixture = memoryFixture();
  const created = await createMatch({
    db: setupFixture.db,
    repositories: setupFixture.repositories,
    matchId: "match-action",
    deckTemplates: [syntheticDeck(), syntheticDeck()],
  });
  const initial = created.projections["player-1"]!;
  const chooseBattlefield = initial.currentGame.actions[0]!;

  const afterAction = await performMatchAction(setupFixture.repositories, {
    matchId: created.matchId,
    playerToken: created.players.player1.playerToken,
    stateVersion: initial.stateVersion,
    actionId: chooseBattlefield.id,
    selectedIds: [],
    now: "2026-07-15T00:00:01.000Z",
  });
  assert.equal(afterAction.currentGame.stateVersion, 1);
  assert.equal((await setupFixture.repositories.games.findById(created.gameId))?.stateVersion, 1);

  const staleFixture = await seededInProgressMatch("match-stale");
  await assert.rejects(
    () => performMatchAction(staleFixture.repositories, {
      matchId: staleFixture.match.id,
      playerToken: staleFixture.tokens.player1,
      stateVersion: 0,
      actionId: "synthetic-action",
      selectedIds: [],
    }),
    (error) =>
      error instanceof MatchServiceError &&
      error.code === "state.gameVersionStale",
  );
});

test("projects between-games status, scores, remaining battlefields, and capabilities", async () => {
  const fixture = await seededBetweenGamesMatch("match-projection");
  const projection = projectMatch({
    match: fixture.match,
    currentGame: fixture.game,
    viewerPlayerId: "player-1",
    decks: fixture.decks,
  });

  assert.equal(projection.status, "between_games");
  assert.deepEqual(projection.scoreByPlayerId, { "player-1": 1, "player-2": 0 });
  assert.equal(projection.completedGames.length, 1);
  assert.equal(projection.betweenGames?.nextGameNumber, 2);
  assert.equal(projection.betweenGames?.previousGameWinnerPlayerId, "player-1");
  assert.deepEqual(
    projection.betweenGames?.remainingBattlefieldRegisteredIdsByPlayerId,
    {
      "player-1": [
        "match-projection:player-1:battlefield:BATTLEFIELD-2:1",
        "match-projection:player-1:battlefield:BATTLEFIELD-3:1",
      ],
      "player-2": [
        "match-projection:player-2:battlefield:BATTLEFIELD-2:1",
        "match-projection:player-2:battlefield:BATTLEFIELD-3:1",
      ],
    },
  );
  assert.equal(projection.betweenGames?.viewerStatus, "pending");
  assert.equal(projection.betweenGames?.opponentStatus, "submitted");
  assert.equal(projection.betweenGames?.capabilities.canConcedeMatch, true);
});

test("concedes a between-games match and persists the winner", async () => {
  const fixture = await seededBetweenGamesMatch("match-concede");
  const result = await performMatchAction(fixture.repositories, {
    db: fixture.db,
    matchId: fixture.match.id,
    playerToken: fixture.tokens.player2,
    stateVersion: fixture.match.stateVersion,
    intent: {
      type: "match.concedeMatch",
      payload: { betweenGamesId: fixture.match.betweenGames!.id },
    },
    now: "2026-07-15T00:00:02.000Z",
  });

  assert.equal(result.status, "complete");
  assert.equal(result.winnerPlayerId, "player-1");
  assert.equal(result.completionReason, "match_concession");
  assert.equal((await fixture.repositories.matches.findById(fixture.match.id))?.status, "complete");
  assert.equal((await fixture.repositories.gameEvents.findByGameId(fixture.game.id)).at(-1)?.type, "match.conceded");
});

test("creates the next game when both players are ready between games", async () => {
  const fixture = await seededBetweenGamesMatch("match-next-game");
  const result = await performMatchAction(fixture.repositories, {
    db: fixture.db,
    matchId: fixture.match.id,
    playerToken: fixture.tokens.player1,
    stateVersion: fixture.match.stateVersion,
    intent: {
      type: "match.readyForNextGame",
      payload: { betweenGamesId: fixture.match.betweenGames!.id },
    },
    now: "2026-07-15T00:00:03.000Z",
  });

  assert.equal(result.status, "playing");
  assert.equal(result.currentGameId, "match-next-game:game:2");
  assert.deepEqual(result.gameIds, [
    "match-next-game:game:1",
    "match-next-game:game:2",
  ]);
  assert.equal(result.gameNumber, 2);
  assert.equal(result.betweenGames, null);
  assert.equal(
    (await fixture.repositories.matches.findById(fixture.match.id))?.currentGameId,
    "match-next-game:game:2",
  );
  assert.equal(
    (await fixture.repositories.games.findById("match-next-game:game:2"))?.status,
    "setup_pending",
  );
});

function memoryFixture() {
  const collections = new Map<string, Map<string, Record<string, unknown>>>();
  const db = {
    client: {
      startSession() {
        return {
          async withTransaction(callback: () => Promise<void>) {
            await callback();
          },
          async endSession() {},
        };
      },
    },
    collection(name: string) {
      const documents = collections.get(name) ?? new Map<string, Record<string, unknown>>();
      collections.set(name, documents);
      return {
        async findOne(filter: { _id: string }) {
          return documents.get(filter._id) ?? null;
        },
        async insertOne(document: Record<string, unknown>) {
          const id = String(document._id);
          if (documents.has(id)) throw { code: 11000 };
          documents.set(id, structuredClone(document));
        },
        async updateOne(
          filter: { _id: string; stateVersion?: number },
          update: { $set: Record<string, unknown> },
          options?: { upsert?: boolean },
        ) {
          const existing = documents.get(filter._id);
          if (filter.stateVersion !== undefined && existing?.stateVersion !== filter.stateVersion) {
            return { modifiedCount: 0 };
          }
          if (!existing && !options?.upsert) return { modifiedCount: 0 };
          documents.set(filter._id, structuredClone(update.$set));
          return { modifiedCount: 1 };
        },
        find(filter: { gameId: string }) {
          return {
            sort() {
              return {
                async toArray() {
                  return [...documents.values()]
                    .filter((document) => document.gameId === filter.gameId)
                    .sort((left, right) => Number(left.sequence) - Number(right.sequence));
                },
              };
            },
          };
        },
      };
    },
  } as unknown as Db;

  return { db, repositories: createGameRepositories(db) };
}

function syntheticDeck(): DeckSnapshot {
  const mainCodes = Array.from({ length: 13 }, (_, index) => `MAIN-${index + 1}`);
  const runeCodes = Array.from({ length: 6 }, (_, index) => `RUNE-${index + 1}`);
  const battlefieldCodes = ["BATTLEFIELD-1", "BATTLEFIELD-2", "BATTLEFIELD-3"];
  const sideboardCodes = ["SIDE-1", "SIDE-2"];
  const cards = [
    syntheticCard("LEGEND", "Legend", "Legend"),
    syntheticCard("CHAMPION", "Champion", "Unit", "Champion"),
    ...mainCodes.map((code) => syntheticCard(code, code, "Spell")),
    ...runeCodes.map((code) => syntheticCard(code, code, "Rune", "Basic")),
    ...battlefieldCodes.map((code) => syntheticCard(code, code, "Battlefield")),
    ...sideboardCodes.map((code) => syntheticCard(code, code, "Spell")),
  ];
  return {
    sourceText: "synthetic match deck",
    catalogDigest: "synthetic-match-deck",
    entries: [
      { section: "Legend", quantity: 1, cardCode: "LEGEND" },
      { section: "Champion", quantity: 1, cardCode: "CHAMPION" },
      ...mainCodes.map((cardCode) => ({ section: "MainDeck" as const, quantity: 3, cardCode })),
      ...runeCodes.map((cardCode) => ({ section: "Runes" as const, quantity: 2, cardCode })),
      ...battlefieldCodes.map((cardCode) => ({ section: "Battlefields" as const, quantity: 1, cardCode })),
      ...sideboardCodes.map((cardCode) => ({ section: "Sideboard" as const, quantity: 1, cardCode })),
    ],
    cards,
  };
}

function syntheticCard(
  code: string,
  name: string,
  type: GameCardDefinition["card"]["classification"]["type"] = "Spell",
  supertype: GameCardDefinition["card"]["classification"]["supertype"] = null,
): GameCardDefinition {
  const isUnit = type === "Unit";
  return {
    cardCode: code,
    sourceTextHash: `synthetic:${code}`,
    behaviorModel: { playTimings: [], clauses: [] },
    card: {
      id: code,
      name,
      public_code: `${code}/001`,
      attributes: { energy: isUnit || type === "Spell" ? 1 : null, might: isUnit ? 1 : null, power: null },
      classification: {
        type,
        supertype,
        domain: ["Mind"],
      },
      text: { plain: "" },
      set: { set_id: "SYNTHETIC", label: "Synthetic" },
      media: {},
      tags: ["SyntheticLegend"],
      metadata: {},
    },
  };
}

function seedMatch(
  repositories: GameRepositories,
  match: MatchDocument,
  game: ReturnType<typeof createInitialGame>,
  decks: DeckSnapshotDocument[],
) {
  return Promise.all([
    repositories.matches.insert(match),
    repositories.games.insert(game),
    ...decks.map((deck) => repositories.deckSnapshots.insert(deck)),
  ]);
}

async function seededInProgressMatch(id: string) {
  const fixture = memoryFixture();
  const tokens = { player1: "player-1-token", player2: "player-2-token" };
  const decks = runtimeDeckDocuments(id);
  const seats = seatsFor(decks, tokens);
  const runtime = [
    createRuntimeDeckSnapshot(decks[0]!.snapshot, "player-1", `${id}:player-1`),
    createRuntimeDeckSnapshot(decks[1]!.snapshot, "player-2", `${id}:player-2`),
  ] as const;
  const game = createInitialGame({
    matchId: id,
    gameId: `${id}:game:1`,
    now: "now",
    rngSeed: "seed",
    playerIds: ["player-1", "player-2"],
    decks: [runtime[0], runtime[1]],
  });
  game.status = "in_progress";
  game.stateVersion = 2;
  game.state.setup.startingPlayerId = "player-1";
  game.state.turn = { turnNumber: 1, activePlayerId: "player-1", phase: "action" };
  const match = matchFor(id, game.id, seats, 0);
  await seedMatch(fixture.repositories, match, game, decks);
  return { ...fixture, match, game, decks, tokens };
}

async function seededBetweenGamesMatch(id: string) {
  const fixture = memoryFixture();
  const tokens = { player1: "player-1-token", player2: "player-2-token" };
  const decks = runtimeDeckDocuments(id);
  const seats = seatsFor(decks, tokens);
  const runtime = [
    createRuntimeDeckSnapshot(decks[0]!.snapshot, "player-1", `${id}:player-1`),
    createRuntimeDeckSnapshot(decks[1]!.snapshot, "player-2", `${id}:player-2`),
  ] as const;
  const game = createInitialGame({
    matchId: id,
    gameId: `${id}:game:1`,
    now: "now",
    rngSeed: "seed",
    playerIds: ["player-1", "player-2"],
    decks: [runtime[0], runtime[1]],
  });
  const match = matchFor(id, game.id, seats, 3);
  match.status = "between_games";
  match.completedGames = [{
    gameId: game.id,
    gameNumber: 1,
    winnerPlayerId: "player-1",
    loserPlayerId: "player-2",
    startingPlayerChooserId: "player-1",
    startingPlayerId: "player-1",
    battlefieldRegisteredCardIdByPlayerId: {
      "player-1": `${id}:player-1:battlefield:BATTLEFIELD-1:1`,
      "player-2": `${id}:player-2:battlefield:BATTLEFIELD-1:1`,
    },
    completionReason: "victory",
    completedAt: "later",
  }];
  match.betweenGames = {
    id: `${id}:between:1`,
    afterGameId: game.id,
    nextGameNumber: 2,
    previousGameWinnerPlayerId: "player-1",
    previousGameLoserPlayerId: "player-2",
    nextStartingPlayerChooserId: "player-2",
    submissionsByPlayerId: {
      "player-1": { status: "pending", configuration: null, submittedAt: null },
      "player-2": { status: "submitted", configuration: seats[1]!.currentDeckConfiguration, submittedAt: "later" },
    },
  };
  await seedMatch(fixture.repositories, match, game, decks);
  return { ...fixture, match, game, decks, tokens };
}

function runtimeDeckDocuments(id: string): DeckSnapshotDocument[] {
  return ["player-1", "player-2"].map((playerId) => {
    const runtime = createRuntimeDeckSnapshot(syntheticDeck(), playerId, `${id}:${playerId}`);
    return {
      id: `${id}:deck:${playerId}`,
      createdAt: "now",
      updatedAt: "now",
      matchId: id,
      playerId,
      snapshot: runtime.template,
      instances: runtime.instances,
    };
  });
}

function seatsFor(decks: DeckSnapshotDocument[], tokens: { player1: string; player2: string }): MatchDocument["seats"] {
  return decks.map((deck, index) => ({
    playerId: deck.playerId,
    seat: (index === 0 ? "player-1" : "player-2") as "player-1" | "player-2",
    tokenHash: hashPlayerToken(index === 0 ? tokens.player1 : tokens.player2),
    displayName: index === 0 ? "Alpha" : "Beta",
    registeredDeckSnapshotId: deck.id,
    currentDeckConfiguration: createInitialDeckConfiguration(deck.instances),
  })) as MatchDocument["seats"];
}

function matchFor(
  id: string,
  gameId: string,
  seats: MatchDocument["seats"],
  stateVersion: number,
): MatchDocument {
  return {
    id,
    format: "riftbound-1v1-match",
    status: "playing",
    stateVersion,
    createdAt: "now",
    updatedAt: "now",
    currentGameId: gameId,
    gameIds: [gameId],
    completedGames: [],
    betweenGames: null,
    completion: null,
    seats,
  };
}
