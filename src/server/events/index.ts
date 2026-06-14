import type { GameEventDocument } from "../db";
import type { RandomOperation } from "../engine";

export const gameEventTypes = {
  rngOperation: "rng.operation"
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
