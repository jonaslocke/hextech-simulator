import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveRemainingBattlefieldRegisteredIdsByPlayerId,
  deriveScoreByPlayerId,
  deriveUsedBattlefieldRegisteredIdsByPlayerId,
  playerWithTwoSetPoints,
  type MatchDocument,
} from "../src/server/game";
import type { DeckSnapshotDocument } from "../src/server/game/repositories";

test("derives match scores and completed battlefield usage without duplicates", () => {
  const match = matchFixture();
  assert.deepEqual(deriveScoreByPlayerId(match), { p1: 2, p2: 0 });
  assert.deepEqual(deriveUsedBattlefieldRegisteredIdsByPlayerId(match), {
    p1: ["p1:bf-a", "p1:bf-b"],
    p2: ["p2:bf-a"],
  });
  assert.equal(playerWithTwoSetPoints(match), "p1");
});

test("derives remaining battlefields from registered deck instances", () => {
  const match = matchFixture();
  const decks = [deck("p1", ["p1:bf-a", "p1:bf-b", "p1:bf-c"]), deck("p2", ["p2:bf-a", "p2:bf-b", "p2:bf-c"])] as const;

  assert.deepEqual(deriveRemainingBattlefieldRegisteredIdsByPlayerId(match, decks), {
    p1: ["p1:bf-c"],
    p2: ["p2:bf-b", "p2:bf-c"],
  });
});

function matchFixture(): MatchDocument {
  return {
    id: "match",
    format: "riftbound-1v1-match",
    status: "playing",
    stateVersion: 1,
    createdAt: "now",
    updatedAt: "now",
    currentGameId: "game-2",
    gameIds: ["game-1", "game-2"],
    completedGames: [
      {
        gameId: "game-1",
        gameNumber: 1,
        winnerPlayerId: "p1",
        loserPlayerId: "p2",
        startingPlayerChooserId: "p1",
        startingPlayerId: "p1",
        battlefieldRegisteredCardIdByPlayerId: {
          p1: "p1:bf-a",
          p2: "p2:bf-a",
        },
        completionReason: "victory",
        completedAt: "later",
      },
      {
        gameId: "game-2",
        gameNumber: 2,
        winnerPlayerId: "p1",
        loserPlayerId: "p2",
        startingPlayerChooserId: "p2",
        startingPlayerId: "p2",
        battlefieldRegisteredCardIdByPlayerId: {
          p1: "p1:bf-b",
          p2: "p2:bf-a",
        },
        completionReason: "victory",
        completedAt: "later",
      },
    ],
    betweenGames: null,
    completion: null,
    seats: [seat("p1", "player-1"), seat("p2", "player-2")],
  };
}

function deck(playerId: string, battlefieldIds: string[]): DeckSnapshotDocument {
  return {
    id: `${playerId}:deck`,
    createdAt: "now",
    updatedAt: "now",
    matchId: "match",
    playerId,
    snapshot: {
      sourceText: "synthetic",
      catalogDigest: "synthetic",
      entries: [],
      cards: [],
    },
    instances: battlefieldIds.map((registeredCardId) => ({
      instanceId: registeredCardId,
      registeredCardId,
      ownerPlayerId: playerId,
      source: "battlefield" as const,
      cardCode: registeredCardId,
    })),
  };
}

function seat(playerId: string, seat: "player-1" | "player-2") {
  return {
    playerId,
    seat,
    tokenHash: `${playerId}:token`,
    registeredDeckSnapshotId: `${playerId}:deck`,
    displayName: playerId,
    currentDeckConfiguration: {
      chosenChampionRegisteredCardId: `${playerId}:champion`,
      mainDeckRegisteredCardIds: [],
      sideboardRegisteredCardIds: [],
    },
  };
}
