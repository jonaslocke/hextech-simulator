import type { GameEventDocument } from "../db";
import type { RandomOperation } from "../engine";

export const gameEventTypes = {
  playerIntentAccepted: "player.intent.accepted",
  rngOperation: "rng.operation",
  serverDecision: "server.decision"
} as const;

export type GameEventType = (typeof gameEventTypes)[keyof typeof gameEventTypes];

export type CreateRandomOperationEventInput = {
  id: string;
  now: string;
  matchId: string;
  gameId: string;
  sequence: number;
  operation: RandomOperation;
};

export type CreatePlayerIntentAcceptedEventInput = {
  id: string;
  now: string;
  matchId: string;
  gameId: string;
  sequence: number;
  actorPlayerId: string;
  intent: {
    type: string;
    payload?: unknown;
  };
};

export type CreateServerDecisionEventInput = {
  id: string;
  now: string;
  matchId: string;
  gameId: string;
  sequence: number;
  decision: {
    type: string;
    payload?: unknown;
  };
};

export function createRandomOperationEvent(
  input: CreateRandomOperationEventInput
): GameEventDocument {
  return {
    id: input.id,
    createdAt: input.now,
    updatedAt: input.now,
    matchId: input.matchId,
    gameId: input.gameId,
    sequence: input.sequence,
    type: gameEventTypes.rngOperation,
    actorPlayerId: null,
    payload: {
      operation: input.operation
    }
  };
}

export function createPlayerIntentAcceptedEvent(
  input: CreatePlayerIntentAcceptedEventInput
): GameEventDocument {
  return {
    id: input.id,
    createdAt: input.now,
    updatedAt: input.now,
    matchId: input.matchId,
    gameId: input.gameId,
    sequence: input.sequence,
    type: gameEventTypes.playerIntentAccepted,
    actorPlayerId: input.actorPlayerId,
    payload: {
      intent: input.intent
    }
  };
}

export function createServerDecisionEvent(
  input: CreateServerDecisionEventInput
): GameEventDocument {
  return {
    id: input.id,
    createdAt: input.now,
    updatedAt: input.now,
    matchId: input.matchId,
    gameId: input.gameId,
    sequence: input.sequence,
    type: gameEventTypes.serverDecision,
    actorPlayerId: null,
    payload: {
      decision: input.decision
    }
  };
}
