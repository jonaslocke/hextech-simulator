import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameEventDocument } from "../src/server/db";
import {
  gameEventTypes,
  projectGameEventsForPlayer
} from "../src/server/events";

test("renders setup events without exposing locked battlefield identity", () => {
  const entries = projectGameEventsForPlayer(
    [
      createEvent({
        type: gameEventTypes.playerIntentAccepted,
        actorPlayerId: "player-a",
        payload: {
          intent: {
            type: "setup.lockBattlefieldChoice",
            payload: {
              cardInstanceId: "secret-battlefield-id"
            }
          }
        }
      })
    ],
    "player-b"
  );

  assert.equal(entries[0]?.message, "Opponent locked a battlefield choice.");
  assert.equal(entries[0]?.message.includes("secret-battlefield-id"), false);
});

test("renders draw channel pass and end-turn events safely", () => {
  const entries = projectGameEventsForPlayer(
    [
      createEvent({
        sequence: 1,
        type: gameEventTypes.playerIntentAccepted,
        actorPlayerId: "player-a",
        payload: {
          intent: {
            type: "game.draw",
            payload: {
              count: 2
            }
          }
        }
      }),
      createEvent({
        sequence: 2,
        type: gameEventTypes.playerIntentAccepted,
        actorPlayerId: "player-b",
        payload: {
          intent: {
            type: "game.channel",
            payload: {
              count: 1
            }
          }
        }
      }),
      createEvent({
        sequence: 3,
        type: gameEventTypes.playerIntentAccepted,
        actorPlayerId: "player-a",
        payload: {
          intent: {
            type: "game.pass"
          }
        }
      }),
      createEvent({
        sequence: 4,
        type: gameEventTypes.playerIntentAccepted,
        actorPlayerId: "player-a",
        payload: {
          intent: {
            type: "game.endTurn"
          }
        }
      })
    ],
    "player-a"
  );

  assert.deepEqual(
    entries.map((entry) => entry.message),
    [
      "You drew 2 cards.",
      "Opponent channeled 1 rune.",
      "You passed.",
      "You ended the turn."
    ]
  );
});

test("renders recycle and rng events without card identities", () => {
  const entries = projectGameEventsForPlayer(
    [
      createEvent({
        sequence: 1,
        type: gameEventTypes.playerIntentAccepted,
        actorPlayerId: "player-a",
        payload: {
          intent: {
            type: "game.recycle",
            payload: {
              ownerPlayerId: "player-a",
              sourceZone: "hand",
              destinationDeck: "mainDeck",
              cardInstanceIds: ["secret-card-1", "secret-card-2"]
            }
          }
        }
      }),
      createEvent({
        sequence: 2,
        type: gameEventTypes.rngOperation,
        actorPlayerId: null,
        payload: {
          operation: {
            seed: "seed",
            rngAlgorithm: "seedrandom",
            rngStep: 0,
            purpose: "recycle-main-deck:player-a",
            result: {
              values: ["secret-card-2", "secret-card-1"]
            }
          }
        }
      })
    ],
    "player-b"
  );

  assert.deepEqual(
    entries.map((entry) => entry.message),
    [
      "Opponent recycled 2 cards to Main Deck.",
      "Server randomized recycled Main Deck card order."
    ]
  );
  assert.equal(entries.some((entry) => entry.message.includes("secret-card")), false);
});

test("renders server decisions for game log", () => {
  const entries = projectGameEventsForPlayer(
    [
      createEvent({
        type: gameEventTypes.serverDecision,
        actorPlayerId: null,
        payload: {
          decision: {
            type: "game.start"
          }
        }
      })
    ],
    "player-a"
  );

  assert.equal(entries[0]?.message, "Server started the game.");
});

test("renders showdown movement and server decisions", () => {
  const entries = projectGameEventsForPlayer(
    [
      createEvent({
        sequence: 1,
        type: gameEventTypes.playerIntentAccepted,
        actorPlayerId: "player-a",
        payload: {
          intent: {
            type: "game.moveUnitToBattlefield",
            payload: {
              unitCardInstanceId: "unit-secret",
              battlefieldId: "battlefield-a"
            }
          }
        }
      }),
      createEvent({
        sequence: 2,
        type: gameEventTypes.serverDecision,
        actorPlayerId: null,
        payload: {
          decision: {
            type: "showdown.enter"
          }
        }
      }),
      createEvent({
        sequence: 3,
        type: gameEventTypes.serverDecision,
        actorPlayerId: null,
        payload: {
          decision: {
            type: "showdown.close"
          }
        }
      })
    ],
    "player-b"
  );

  assert.deepEqual(
    entries.map((entry) => entry.message),
    [
      "Opponent moved a unit to a battlefield.",
      "Server opened a showdown.",
      "Server closed the showdown."
    ]
  );
  assert.equal(entries.some((entry) => entry.message.includes("unit-secret")), false);
});

function createEvent(
  input: Partial<GameEventDocument> & Pick<GameEventDocument, "type" | "payload">
): GameEventDocument {
  return {
    id: `event-${input.sequence ?? 1}`,
    createdAt: "2026-06-14T08:00:00.000Z",
    updatedAt: "2026-06-14T08:00:00.000Z",
    matchId: "match-1",
    gameId: "game-1",
    sequence: input.sequence ?? 1,
    actorPlayerId: input.actorPlayerId ?? null,
    ...input
  };
}
