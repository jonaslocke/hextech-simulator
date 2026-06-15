import type { GameEventDocument, MatchDocument, Repositories } from "../db";
import type { RandomOperation } from "../engine";
import type { Card } from "../catalog";
import {
  createPlayerIntentAcceptedEvent,
  createRandomOperationEvent,
  createServerDecisionEvent,
  projectGameEventsForPlayer,
  type GameLogEntry
} from "../events";
import {
  addRuneResourceIntentSchema,
  channelRunesIntentSchema,
  chooseStartingPlayerIntentSchema,
  commitMulliganIntentSchema,
  drawCardsIntentSchema,
  endTurnIntentSchema,
  lockBattlefieldChoiceIntentSchema,
  matchIntentPayloadSchema,
  moveUnitToBattlefieldIntentSchema,
  passPriorityIntentSchema,
  playCardIntentSchema,
  recycleCardsIntentSchema,
  type MatchIntentPayload
} from "../../shared/intents";
import {
  addRuneResource,
  channelRunes,
  chooseStartingPlayer,
  commitMulligan,
  drawCards,
  endTurn,
  lockBattlefieldChoice,
  moveUnitToBattlefield,
  passPriority,
  passShowdown,
  playCard,
  recycleCards,
  revealBattlefieldChoices,
  startGame,
  type CardLookup,
  type Game
} from "./game";
import { projectGameForPlayer, type GameProjection } from "./projections";
import { verifyPlayerToken } from "./tokens";

export type IntentServiceOptions = {
  cardsByInstanceId?: CardLookup;
  createEventId?: (input: { gameId: string; sequence: number }) => string;
  now?: () => string;
};

export type IntentServiceAcceptedResult = {
  accepted: true;
  game: Game;
  projection: GameProjection;
  events: GameEventDocument[];
  logEntries: GameLogEntry[];
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
  repositories: Pick<Repositories, "matches" | "games" | "gameEvents"> &
    Partial<Pick<Repositories, "deckSnapshots">>,
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
  const cardsByInstanceId =
    options.cardsByInstanceId ??
    (await loadCardsByInstanceIdForMatch(repositories, match));
  const transition = applyIntent(
    game,
    seat.playerId,
    payload,
    now,
    cardsByInstanceId
  );

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

  for (const operation of transition.randomOperations) {
    sequence += 1;
    events.push(
      createRandomOperationEvent({
        id: createEventId(game.id, sequence, options),
        now,
        matchId: game.matchId,
        gameId: game.id,
        sequence,
        operation
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
    projection: projectGameForPlayer(
      transition.game,
      seat.playerId,
      cardsByInstanceId
    ),
    events,
    logEntries: projectGameEventsForPlayer(events, seat.playerId)
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
      randomOperations: RandomOperation[];
    }
  | IntentServiceRejectedResult;

function applyIntent(
  game: Game,
  actorPlayerId: string,
  input: MatchIntentPayload,
  now: string,
  cardsByInstanceId: CardLookup
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
          serverDecisions: [],
          randomOperations: []
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
            serverDecisions: [],
            randomOperations: []
          };
        }

        return {
          accepted: true,
          game: revealBattlefieldChoices(lockedGame, now),
          serverDecisions: [
            {
              type: "setup.revealBattlefieldChoices"
            }
          ],
          randomOperations: []
        };
      }

      case "setup.commitMulligan": {
        const intent = commitMulliganIntentSchema.parse(input.intent);
        const committedGame = commitMulligan(game, {
          actorPlayerId,
          selectedCardInstanceIds: intent.payload.selectedCardInstanceIds,
          now
        });
        const shouldStart = committedGame.canonicalState.setup.playerIds.every(
          (playerId) =>
            committedGame.canonicalState.setup.mulliganChoices[playerId]?.status ===
            "locked"
        );

        if (!shouldStart) {
          return {
            accepted: true,
            game: committedGame,
            serverDecisions: [],
            randomOperations: []
          };
        }

        return {
          accepted: true,
          game: startGame(committedGame, { now }),
          serverDecisions: [
            {
              type: "game.start"
            }
          ],
          randomOperations: []
        };
      }

      case "game.draw": {
        const intent = drawCardsIntentSchema.parse(input.intent);

        return {
          accepted: true,
          game: drawCards(game, {
            actorPlayerId,
            count: intent.payload?.count,
            now
          }),
          serverDecisions: [],
          randomOperations: []
        };
      }

      case "game.channel": {
        const intent = channelRunesIntentSchema.parse(input.intent);

        return {
          accepted: true,
          game: channelRunes(game, {
            actorPlayerId,
            count: intent.payload?.count,
            now
          }),
          serverDecisions: [],
          randomOperations: []
        };
      }

      case "game.recycle": {
        const intent = recycleCardsIntentSchema.parse(input.intent);
        const result = recycleCards(game, {
          actorPlayerId,
          ownerPlayerId: intent.payload.ownerPlayerId,
          cardInstanceIds: intent.payload.cardInstanceIds,
          sourceZone: intent.payload.sourceZone,
          destinationDeck: intent.payload.destinationDeck,
          now
        });

        return {
          accepted: true,
          game: result.game,
          serverDecisions: [],
          randomOperations: result.randomOperations
        };
      }

      case "game.addRuneResource": {
        const intent = addRuneResourceIntentSchema.parse(input.intent);

        return {
          accepted: true,
          game: addRuneResource(
            game,
            {
              actorPlayerId,
              runeCardInstanceId: intent.payload.runeCardInstanceId,
              resourceType: intent.payload.resourceType,
              now
            },
            cardsByInstanceId
          ),
          serverDecisions: [],
          randomOperations: []
        };
      }

      case "game.playCard": {
        const intent = playCardIntentSchema.parse(input.intent);

        if (game.canonicalState.showdown !== null) {
          return reject(
            "unsupported_intent",
            "Action/Reaction play during showdown is not implemented.",
            input.intent.type
          );
        }

        const result = playCard(
          game,
          {
            actorPlayerId,
            cardInstanceId: intent.payload.cardInstanceId,
            selectedModeId: intent.payload.selectedModeId,
            destination: intent.payload.destination,
            now
          },
          cardsByInstanceId
        );

        return {
          accepted: true,
          game: result.game,
          serverDecisions: [
            {
              type: "game.payCosts",
              payload: {
                energyCost: result.payment.resourceCosts.energy,
                powerCost: result.payment.resourceCosts.power.reduce(
                  (total, requirement) => total + requirement.amount,
                  0
                ),
                exhaustedRuneCount:
                  result.payment.resourcePayments.filter(
                    (payment) => payment.type === "exhaustRuneForEnergy"
                  ).length,
                recycledRuneCount:
                  result.payment.resourcePayments.filter(
                    (payment) => payment.type === "recycleRuneForPower"
                  ).length
              }
            }
          ],
          randomOperations: result.randomOperations
        };
      }

      case "game.pass": {
        passPriorityIntentSchema.parse(input.intent);
        const passedGame =
          game.canonicalState.showdown === null
            ? passPriority(game, {
                actorPlayerId,
                now
              })
            : passShowdown(game, {
                actorPlayerId,
                now
              });
        const closedShowdown =
          game.canonicalState.showdown !== null &&
          passedGame.canonicalState.showdown === null;

        return {
          accepted: true,
          game: passedGame,
          serverDecisions: closedShowdown
            ? [
                {
                  type: "showdown.close"
                }
              ]
            : [],
          randomOperations: []
        };
      }

      case "game.endTurn": {
        endTurnIntentSchema.parse(input.intent);

        return {
          accepted: true,
          game: endTurn(game, {
            actorPlayerId,
            now
          }),
          serverDecisions: [],
          randomOperations: []
        };
      }

      case "game.moveUnitToBattlefield": {
        const intent = moveUnitToBattlefieldIntentSchema.parse(input.intent);
        const movedGame = moveUnitToBattlefield(game, {
          actorPlayerId,
          unitCardInstanceId: intent.payload.unitCardInstanceId,
          battlefieldId: intent.payload.battlefieldId,
          now
        });

        return {
          accepted: true,
          game: movedGame,
          serverDecisions:
            game.canonicalState.showdown === null &&
            movedGame.canonicalState.showdown !== null
              ? [
                  {
                    type: "showdown.enter",
                    payload: {
                      battlefieldId: intent.payload.battlefieldId
                    }
                  }
                ]
              : [],
          randomOperations: []
        };
      }

      case "game.activateAbility":
        if (game.canonicalState.showdown !== null) {
          return reject(
            "unsupported_intent",
            "Action/Reaction play during showdown is not implemented.",
            input.intent.type
          );
        }

        return reject(
          "unsupported_intent",
          `Intent type is not supported: ${input.intent.type}`,
          input.intent.type
        );

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

async function loadCardsByInstanceIdForMatch(
  repositories: Partial<Pick<Repositories, "deckSnapshots">>,
  match: MatchDocument
): Promise<CardLookup> {
  if (!repositories.deckSnapshots) {
    return {};
  }

  const deckSnapshots = await Promise.all(
    match.playerSeats.map((seat) =>
      seat.deckSnapshotId
        ? repositories.deckSnapshots!.findById(seat.deckSnapshotId)
        : Promise.resolve(null)
    )
  );

  return Object.fromEntries(
    deckSnapshots.flatMap((document) =>
      document?.snapshot.instances.map((instance) => [
        instance.instanceId,
        instance.card
      ]) ?? []
    )
  ) satisfies Record<string, Card>;
}

function createEventId(
  gameId: string,
  sequence: number,
  options: IntentServiceOptions
): string {
  return options.createEventId?.({ gameId, sequence }) ?? `${gameId}:event:${sequence}`;
}
