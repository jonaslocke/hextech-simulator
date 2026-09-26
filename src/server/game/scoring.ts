import type { DeckSnapshotDocument } from "./repositories";
import type { GameDocument } from "./state";
import { dispatchBehaviorEvent } from "./triggers";
import { victoryRequirement } from "./victory";
import { advanceGameObjectIncarnation, createRuntimeCardIndex, definitionForInstance } from "./primitive-handlers";

export function applyHoldScoring(
  game: GameDocument,
  playerId: string,
  decks: readonly DeckSnapshotDocument[],
): void {
  const player = game.state.players[playerId]!;
  player.scoredBattlefieldIdsThisTurn = [];
  for (const battlefield of game.state.battlefields) {
    if (battlefield.controllerPlayerId === playerId) {
      scoreBattlefield(game, playerId, battlefield.battlefieldId, "hold", decks);
      if (game.status === "complete") return;
    }
  }
}

export function scoreBattlefield(
  game: GameDocument,
  playerId: string,
  battlefieldId: string,
  method: "conquer" | "hold",
  decks: readonly DeckSnapshotDocument[],
): void {
  const player = game.state.players[playerId]!;
  if (scoringBlockedByBattlefield(game, playerId, battlefieldId, decks)) return;
  const scored = player.scoredBattlefieldIdsThisTurn ?? [];
  if (scored.includes(battlefieldId)) return;
  player.scoredBattlefieldIdsThisTurn = [...scored, battlefieldId];
  const points = player.points ?? 0;
  const requirement = victoryRequirement(game, decks);
  const isFinalPoint = points === requirement - 1;
  const hasScoredEveryBattlefield = game.state.battlefields.every(
    (battlefield) =>
      player.scoredBattlefieldIdsThisTurn!.includes(battlefield.battlefieldId),
  );
  if (isFinalPoint && method === "conquer" && !hasScoredEveryBattlefield) {
    drawOne(game, playerId);
  } else {
    player.points = points + 1;
  }
  const battlefield = requireBattlefield(game, battlefieldId);
  dispatchBehaviorEvent(
    game,
    {
      type:
        method === "conquer" ? "battlefield.conquered" : "battlefield.held",
      actorPlayerId: playerId,
      subjectCardInstanceId: battlefield.cardInstanceId,
      values: {},
    },
    decks,
  );
  if (!game.winnerPlayerId && (player.points ?? 0) >= requirement) {
    game.winnerPlayerId = playerId;
    game.status = "complete";
  }
}

function scoringBlockedByBattlefield(
  game: GameDocument,
  playerId: string,
  battlefieldId: string,
  decks: readonly DeckSnapshotDocument[],
) {
  const battlefield = requireBattlefield(game, battlefieldId);
  const index = createRuntimeCardIndex(decks, game);
  const requiredTurn = definitionForInstance(battlefield.cardInstanceId, index)
    .behaviorModel.clauses
    .flatMap((clause) => clause.effects)
    .find((binding) => binding.behaviorId === "modifier.prevent_scoring_until_turn")
    ?.parameters.turn;
  if (typeof requiredTurn !== "number") return false;
  const turn = game.state.turn;
  if (!turn) return true;
  const position = game.state.setup.playerIds.indexOf(playerId);
  if (position < 0) return true;
  const playerTurn = Math.floor((turn.turnNumber - 1 - position) / game.state.setup.playerIds.length) + 1;
  return playerTurn < requiredTurn;
}

function drawOne(game: GameDocument, playerId: string) {
  const player = game.state.players[playerId]!;
  const cardId = player.zones.mainDeck.shift();
  if (cardId) {
    player.zones.hand.push(cardId);
    advanceGameObjectIncarnation(game, cardId);
  }
}

function requireBattlefield(game: GameDocument, battlefieldId: string) {
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === battlefieldId,
  );
  if (!battlefield) throw new Error("Battlefield is unavailable.");
  return battlefield;
}
