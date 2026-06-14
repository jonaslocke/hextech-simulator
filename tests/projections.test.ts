import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createGame,
  gameSchema,
  projectGameForPlayer,
  type Game
} from "../src/server/match";

test("projects own hand identities and hides opponent hand identities", () => {
  const game = createProjectionFixture();

  const projection = projectGameForPlayer(game, "player-a");

  assert.deepEqual(projection.players["player-a"]?.zones.hand, {
    cardInstanceIds: ["a-hand-1", "a-hand-2"],
    count: 2,
    visibility: "private"
  });
  assert.deepEqual(projection.players["player-b"]?.zones.hand, {
    cardInstanceIds: [],
    count: 2,
    visibility: "private"
  });
});

test("hides main deck and rune deck order from every viewer", () => {
  const game = createProjectionFixture();

  const playerAProjection = projectGameForPlayer(game, "player-a");
  const playerBProjection = projectGameForPlayer(game, "player-b");

  assert.deepEqual(playerAProjection.players["player-a"]?.zones.mainDeck, {
    cardInstanceIds: [],
    count: 2,
    visibility: "secret"
  });
  assert.deepEqual(playerAProjection.players["player-a"]?.zones.runeDeck, {
    cardInstanceIds: [],
    count: 2,
    visibility: "secret"
  });
  assert.deepEqual(playerBProjection.players["player-a"]?.zones.mainDeck, {
    cardInstanceIds: [],
    count: 2,
    visibility: "secret"
  });
});

test("shows public trash banishment board objects and battlefields", () => {
  const game = createProjectionFixture();

  const projection = projectGameForPlayer(game, "player-a");

  assert.deepEqual(projection.players["player-b"]?.zones.trash.cardInstanceIds, [
    "b-trash-1"
  ]);
  assert.deepEqual(
    projection.players["player-b"]?.zones.banishment.cardInstanceIds,
    ["b-banished-1"]
  );
  assert.deepEqual(projection.players["player-b"]?.zones.base.cardInstanceIds, [
    "b-base-1"
  ]);
  assert.equal(projection.battlefields[0]?.cardInstanceId, "battlefield-a");
  assert.deepEqual(projection.battlefields[0]?.units, ["a-unit-1"]);
});

test("hides locked opponent battlefield identity until reveal", () => {
  const game = gameSchema.parse({
    ...createProjectionFixture(),
    canonicalState: {
      ...createProjectionFixture().canonicalState,
      setup: {
        ...createProjectionFixture().canonicalState.setup,
        battlefieldChoices: {
          "player-a": {
            playerId: "player-a",
            status: "locked",
            cardInstanceId: "battlefield-a",
            lockedAt: "2026-06-14T01:00:00.000Z",
            revealedAt: null
          },
          "player-b": {
            playerId: "player-b",
            status: "locked",
            cardInstanceId: "battlefield-b",
            lockedAt: "2026-06-14T01:00:00.000Z",
            revealedAt: null
          }
        }
      }
    }
  });

  const projection = projectGameForPlayer(game, "player-a");

  assert.equal(
    projection.setup.battlefieldChoices["player-a"]?.cardInstanceId,
    "battlefield-a"
  );
  assert.equal(
    projection.setup.battlefieldChoices["player-b"]?.cardInstanceId,
    null
  );
});

test("shows facedown battlefield identity only to controller", () => {
  const game = createProjectionFixture();

  const playerAProjection = projectGameForPlayer(game, "player-a");
  const playerBProjection = projectGameForPlayer(game, "player-b");

  assert.deepEqual(playerAProjection.battlefields[0]?.facedownSlot, {
    controllerId: "player-a",
    cardInstanceId: "a-facedown-1",
    visibility: "private"
  });
  assert.deepEqual(playerBProjection.battlefields[0]?.facedownSlot, {
    controllerId: "player-a",
    cardInstanceId: null,
    visibility: "secret"
  });
});

test("mulligan projection exposes lock state without selected card identities", () => {
  const game = createProjectionFixture();

  const projection = projectGameForPlayer(game, "player-b");

  assert.deepEqual(projection.setup.mulliganChoices["player-a"], {
    playerId: "player-a",
    status: "locked",
    lockedAt: "2026-06-14T02:00:00.000Z"
  });
  assert.equal(
    "selectedCardInstanceIds" in projection.setup.mulliganChoices["player-a"]!,
    false
  );
});

test("rejects projections for non-game viewers", () => {
  assert.throws(
    () => projectGameForPlayer(createProjectionFixture(), "player-c"),
    /Viewer must be one/
  );
});

function createProjectionFixture(): Game {
  const baseGame = createGame({
    id: "game-1",
    matchId: "match-1",
    gameNumber: 1,
    playerIds: ["player-a", "player-b"]
  });

  return gameSchema.parse({
    ...baseGame,
    stateVersion: 7,
    canonicalState: {
      ...baseGame.canonicalState,
      battlefields: [
        {
          battlefieldId: "battlefield-state-a",
          selectedByPlayerId: "player-a",
          cardInstanceId: "battlefield-a",
          units: ["a-unit-1"],
          facedownSlot: {
            controllerId: "player-a",
            cardInstanceId: "a-facedown-1"
          }
        },
        {
          battlefieldId: "battlefield-state-b",
          selectedByPlayerId: "player-b",
          cardInstanceId: "battlefield-b",
          units: [],
          facedownSlot: null
        }
      ],
      players: {
        "player-a": {
          playerId: "player-a",
          zones: {
            legend: "a-legend",
            champion: "a-champion",
            mainDeck: ["a-deck-1", "a-deck-2"],
            runeDeck: ["a-rune-1", "a-rune-2"],
            hand: ["a-hand-1", "a-hand-2"],
            trash: ["a-trash-1"],
            banishment: ["a-banished-1"],
            base: ["a-base-1"]
          }
        },
        "player-b": {
          playerId: "player-b",
          zones: {
            legend: "b-legend",
            champion: "b-champion",
            mainDeck: ["b-deck-1"],
            runeDeck: ["b-rune-1"],
            hand: ["b-hand-1", "b-hand-2"],
            trash: ["b-trash-1"],
            banishment: ["b-banished-1"],
            base: ["b-base-1"]
          }
        }
      },
      setup: {
        ...baseGame.canonicalState.setup,
        mulliganChoices: {
          "player-a": {
            playerId: "player-a",
            status: "locked",
            selectedCardInstanceIds: ["a-hand-1"],
            lockedAt: "2026-06-14T02:00:00.000Z"
          },
          "player-b": {
            playerId: "player-b",
            status: "unlocked",
            selectedCardInstanceIds: [],
            lockedAt: null
          }
        }
      }
    }
  });
}
