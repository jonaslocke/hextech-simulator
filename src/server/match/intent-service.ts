import type { GameEventDocument, Repositories } from "../db";
import {
  createPlayerIntentAcceptedEvent,
  createServerDecisionEvent
} from "../events";
import {
  chooseStartingPlayerIntentSchema,
  commitMulliganIntentSchema,
  lockBattlefieldChoiceIntentSchema,
  matchIntentPayloadSchema,
  type MatchIntentPayload
} from "../../shared/intents";
import {
  chooseStartingPlayer,
  commitMulligan,
  lockBattlefieldChoice,
  revealBattlefieldChoices,
  type Game
} from "./game";
import { projectGameForPlayer, type GameProjection } from "./projections";
import { verifyPlayerToken } from "./tokens";

export type IntentServiceOptions = {
  createEventId?: (input: { gameId: string; sequence: number }) => string;
  now?: () => string;
};

export type IntentServiceAcceptedResult = {
  accepted: true;
  game: Game;
  projection: GameProjection;
  events: GameEventDocument[];
};

export type IntentServiceRejectedResult = {
  accepted: false;
  error: {
    code: string;
    message: string;
    source?: string;
  };
};

export type IntentServiceResult =
  | IntentServiceAcceptedResult
  | IntentServiceRejectedResult;

export async function handleMatchIntent(
  repositories: Pick<Repositories, "matches" | "games" | "gameEvents">,
  input: MatchIntentPayload,
  options: IntentServiceOptions = {}
): Promise<IntentServiceResult> {
  const parsed = matchIntentPayloadSchema.safeParse(input);

  if (!parsed.success) {
    return reject("invalid_payload", "Intent request payload is malformed.");
  }

  const payload = parsed.data;
  const match = await repositories.matches.findById(payload.matchId);

  if (!match) {
    return reject("match_not_found", "Match was not found.");
  }

  const seat = match.playerSeats.find((candidate) =>
    verifyPlayerToken(payload.playerToken, candidate.tokenHash)
  );

  if (!seat) {
    return reject("invalid_player_token", "Player token is invalid for this match.");
  }

  const gameId = payload.gameId ?? match.currentGameId;

  if (!gameId) {
    return reject("game_not_found", "Match does not have a current game.");
  }

  if (!match.gameIds.includes(gameId) && match.currentGameId !== gameId) {
    return reject("game_not_in_match", "Game does not belong to this match.");
  }

  const game = await repositories.games.findById(gameId);

  if (!game || game.matchId !== match.id) {
    return reject("game_not_found", "Game was not found for this match.");
  }

  if (game.stateVersion !== payload.stateVersion) {
    return reject(
      "state_version_mismatch",
      "Client state version does not match the canonical game state."
    );
  }

  const now = options.now?.() ?? new Date().toISOString();
  const transition = applyIntent(game, seat.playerId, payload, now);

  if (!transition.accepted) {
    return transition;
  }

  const existingEvents = await repositories.gameEvents.findByGameId(game.id);
  let sequence = existingEvents.length;
  const events: GameEventDocument[] = [];

  sequence += 1;
  events.push(
    createPlayerIntentAcceptedEvent({
      id: createEventId(game.id, sequence, options),
      now,
      matchId: game.matchId,
      gameId: game.id,
      sequence,
      actorPlayerId: seat.playerId,
      intent: payload.intent
    })
  );

  for (const decision of transition.serverDecisions) {
    sequence += 1;
    events.push(
      createServerDecisionEvent({
        id: createEventId(game.id, sequence, options),
        now,
        matchId: game.matchId,
        gameId: game.id,
        sequence,
        decision
      })
    );
  }

  await repositories.games.upsert(transition.game);

  for (const event of events) {
    await repositories.gameEvents.append(event);
  }

  return {
    accepted: true,
    game: transition.game,
    projection: projectGameForPlayer(transition.game, seat.playerId),
    events
  };
}

type AppliedIntentResult =
  | {
      accepted: true;
      game: Game;
      serverDecisions: Array<{
        type: string;
        payload?: unknown;
      }>;
    }
  | IntentServiceRejectedResult;

function applyIntent(
  game: Game,
  actorPlayerId: string,
  input: MatchIntentPayload,
  now: string
): AppliedIntentResult {
  try {
    switch (input.intent.type) {
      case "setup.chooseStartingPlayer": {
        const intent = chooseStartingPlayerIntentSchema.parse(input.intent);

        return {
          accepted: true,
          game: chooseStartingPlayer(game, {
            actorPlayerId,
            startingPlayerId: intent.payload.startingPlayerId,
            now
          }),
          serverDecisions: []
        };
      }

      case "setup.lockBattlefieldChoice": {
        const intent = lockBattlefieldChoiceIntentSchema.parse(input.intent);
        const lockedGame = lockBattlefieldChoice(game, {
          actorPlayerId,
          cardInstanceId: intent.payload.cardInstanceId,
          now
        });
        const choices = lockedGame.canonicalState.setup.battlefieldChoices;
        const shouldReveal = lockedGame.canonicalState.setup.playerIds.every(
          (playerId) => choices[playerId]?.status === "locked"
        );

        if (!shouldReveal) {
          return {
            accepted: true,
            game: lockedGame,
            serverDecisions: []
          };
        }

        return {
          accepted: true,
          game: revealBattlefieldChoices(lockedGame, now),
          serverDecisions: [
            {
              type: "setup.revealBattlefieldChoices"
            }
          ]
        };
      }

      case "setup.commitMulligan": {
        const intent = commitMulliganIntentSchema.parse(input.intent);

        return {
          accepted: true,
          game: commitMulligan(game, {
            actorPlayerId,
            selectedCardInstanceIds: intent.payload.selectedCardInstanceIds,
            now
          }),
          serverDecisions: []
        };
      }

      default:
        return reject(
          "unsupported_intent",
          `Intent type is not supported: ${input.intent.type}`,
          input.intent.type
        );
    }
  } catch (error) {
    return reject(
      "illegal_intent",
      error instanceof Error ? error.message : "Intent could not be applied.",
      input.intent.type
    );
  }
}

function reject(
  code: string,
  message: string,
  source?: string
): IntentServiceRejectedResult {
  return {
    accepted: false,
    error: {
      code,
      message,
      ...(source ? { source } : {})
    }
  };
}

function createEventId(
  gameId: string,
  sequence: number,
  options: IntentServiceOptions
): string {
  return options.createEventId?.({ gameId, sequence }) ?? `${gameId}:event:${sequence}`;
}
