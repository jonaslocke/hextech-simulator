import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createAnonymousPlayerSeat,
  createBestOfThreeMatch,
  createPlayerSeat,
  generateAnonymousPlayerToken,
  hashPlayerToken,
  matchSchema,
  verifyPlayerToken
} from "../src/server/match";

test("creates a best-of-3 match with two anonymous player seats", () => {
  const match = createBestOfThreeMatch({
    id: "match-1",
    now: "2026-06-12T00:00:00.000Z",
    playerSeats: [
      {
        playerId: "player-a",
        seat: "player-1",
        tokenHash: "token-hash-a",
        deckSnapshotId: "deck-a"
      },
      {
        playerId: "player-b",
        seat: "player-2",
        tokenHash: "token-hash-b",
        deckSnapshotId: "deck-b"
      }
    ]
  });

  assert.equal(match.format, "best-of-3");
  assert.equal(match.status, "setup_pending");
  assert.equal(match.currentGameId, null);
  assert.deepEqual(match.gameIds, []);
  assert.deepEqual(match.matchScore, {
    "player-a": 0,
    "player-b": 0
  });
  assert.equal(match.winnerPlayerId, null);
  assert.equal(match.playerSeats[0].seat, "player-1");
  assert.equal(match.playerSeats[1].seat, "player-2");
  assert.equal("displayName" in match.playerSeats[0], false);
  assert.doesNotThrow(() => matchSchema.parse(match));
});

test("creates a player seat without requiring a deck snapshot yet", () => {
  const seat = createPlayerSeat({
    playerId: "player-a",
    seat: "player-1",
    tokenHash: "token-hash-a"
  });

  assert.deepEqual(seat, {
    playerId: "player-a",
    seat: "player-1",
    tokenHash: "token-hash-a",
    deckSnapshotId: null
  });
});

test("generates anonymous player tokens as one-time client secrets", () => {
  const first = generateAnonymousPlayerToken();
  const second = generateAnonymousPlayerToken();

  assert.notEqual(first.token, second.token);
  assert.notEqual(first.tokenHash, second.tokenHash);
  assert.equal(first.tokenHash, hashPlayerToken(first.token));
  assert.equal(first.tokenHash.length, 64);
  assert.match(first.token, /^[A-Za-z0-9_-]+$/);
  assert.equal(verifyPlayerToken(first.token, first.tokenHash), true);
  assert.equal(verifyPlayerToken(second.token, first.tokenHash), false);
  assert.equal(verifyPlayerToken(first.token, "not-a-valid-hash"), false);
});

test("creates an anonymous player seat without storing the raw token", () => {
  const result = createAnonymousPlayerSeat({
    playerId: "player-a",
    seat: "player-1",
    deckSnapshotId: "deck-a"
  });

  assert.equal(result.seat.playerId, "player-a");
  assert.equal(result.seat.seat, "player-1");
  assert.equal(result.seat.deckSnapshotId, "deck-a");
  assert.equal(result.seat.tokenHash, hashPlayerToken(result.token));
  assert.equal("token" in result.seat, false);
});

test("rejects a match with duplicate seat ids", () => {
  assert.throws(
    () =>
      createBestOfThreeMatch({
        playerSeats: [
          {
            playerId: "player-a",
            seat: "player-1",
            tokenHash: "token-hash-a"
          },
          {
            playerId: "player-b",
            seat: "player-1",
            tokenHash: "token-hash-b"
          }
        ]
      }),
    /one player-1 seat and one player-2 seat/
  );
});

test("rejects a match with duplicate player ids", () => {
  assert.throws(
    () =>
      createBestOfThreeMatch({
        playerSeats: [
          {
            playerId: "player-a",
            seat: "player-1",
            tokenHash: "token-hash-a"
          },
          {
            playerId: "player-a",
            seat: "player-2",
            tokenHash: "token-hash-b"
          }
        ]
      }),
    /same playerId/
  );
});
