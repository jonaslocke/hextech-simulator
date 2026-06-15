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

export type GameLogEntry = {
  id: string;
  sequence: number;
  createdAt: string;
  type: string;
  actorPlayerId: string | null;
  message: string;
};

export function projectGameEventsForPlayer(
  events: GameEventDocument[],
  viewerPlayerId: string
): GameLogEntry[] {
  return events.map((event) => ({
    id: event.id,
    sequence: event.sequence,
    createdAt: event.createdAt,
    type: event.type,
    actorPlayerId: event.actorPlayerId,
    message: renderEventMessage(event, viewerPlayerId)
  }));
}

function renderEventMessage(event: GameEventDocument, viewerPlayerId: string): string {
  if (event.type === gameEventTypes.playerIntentAccepted) {
    return renderIntentMessage(event, viewerPlayerId);
  }

  if (event.type === gameEventTypes.serverDecision) {
    return renderServerDecisionMessage(event);
  }

  if (event.type === gameEventTypes.rngOperation) {
    return renderRandomOperationMessage(event);
  }

  return "Game event recorded.";
}

function renderIntentMessage(
  event: GameEventDocument,
  viewerPlayerId: string
): string {
  const payload = event.payload as {
    intent?: {
      type?: string;
      payload?: unknown;
    };
  };
  const actor = formatActor(event.actorPlayerId, viewerPlayerId);
  const intent = payload.intent;

  switch (intent?.type) {
    case "setup.chooseStartingPlayer":
      return `${actor} chose the starting player.`;
    case "setup.lockBattlefieldChoice":
      return `${actor} locked a battlefield choice.`;
    case "setup.commitMulligan":
      return `${actor} committed mulligan.`;
    case "game.draw":
      return `${actor} drew ${formatCount(readCount(intent.payload), "card")}.`;
    case "game.channel":
      return `${actor} channeled ${formatCount(readCount(intent.payload), "rune")}.`;
    case "game.recycle": {
      const recyclePayload = intent.payload as
        | {
            cardInstanceIds?: unknown[];
            destinationDeck?: string;
          }
        | undefined;
      const count = recyclePayload?.cardInstanceIds?.length ?? 0;
      const destination =
        recyclePayload?.destinationDeck === "runeDeck" ? "Rune Deck" : "Main Deck";

      return `${actor} recycled ${formatCount(count, "card")} to ${destination}.`;
    }
    case "game.addRuneResource": {
      const resourceType =
        (intent.payload as { resourceType?: unknown } | undefined)?.resourceType ===
        "power"
          ? "Power"
          : "Energy";

      return `${actor} added ${resourceType} to their rune pool.`;
    }
    case "game.playCard":
      return `${actor} played a card.`;
    case "game.pass":
      return `${actor} passed.`;
    case "game.endTurn":
      return `${actor} ended the turn.`;
    case "game.moveUnitToBattlefield":
      return `${actor} moved a unit to a battlefield.`;
    default:
      return `${actor} submitted an unsupported intent.`;
  }
}

function renderServerDecisionMessage(event: GameEventDocument): string {
  const payload = event.payload as {
    decision?: {
      type?: string;
    };
  };

  switch (payload.decision?.type) {
    case "setup.revealBattlefieldChoices":
      return "Server revealed battlefield choices.";
    case "setup.placeStartingObjects":
      return "Server placed starting objects.";
    case "setup.drawOpeningHands":
      return "Server drew opening hands.";
    case "setup.autoKeepOpeningHands":
      return "Server kept opening hands.";
    case "game.start":
      return "Server started the game.";
    case "game.payCosts":
      return "Server paid card costs.";
    case "showdown.enter":
      return "Server opened a showdown.";
    case "showdown.close":
      return "Server closed the showdown.";
    default:
      return "Server decision recorded.";
  }
}

function renderRandomOperationMessage(event: GameEventDocument): string {
  const payload = event.payload as {
    operation?: {
      purpose?: string;
    };
  };
  const purpose = payload.operation?.purpose;

  if (purpose?.startsWith("shuffle-main-deck")) {
    return "Server shuffled a Main Deck.";
  }

  if (purpose?.startsWith("shuffle-rune-deck")) {
    return "Server shuffled a Rune Deck.";
  }

  if (purpose?.startsWith("recycle-main-deck")) {
    return "Server randomized recycled Main Deck card order.";
  }

  if (purpose === "game-1-starting-player-chooser") {
    return "Server randomly selected the starting-player chooser.";
  }

  return "Server used seeded randomness.";
}

function formatActor(actorPlayerId: string | null, viewerPlayerId: string): string {
  if (actorPlayerId === null) {
    return "Server";
  }

  return actorPlayerId === viewerPlayerId ? "You" : "Opponent";
}

function readCount(payload: unknown): number {
  const count = (payload as { count?: unknown } | undefined)?.count;

  return typeof count === "number" && Number.isInteger(count) && count > 0 ? count : 1;
}

function formatCount(count: number, singular: string): string {
  return `${count} ${singular}${count === 1 ? "" : "s"}`;
}
