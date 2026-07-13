import type { DeckSnapshotDocument } from "./repositories";
import type { GameDocument } from "./state";
import { dispatchBehaviorEvent } from "./triggers";
import { victoryRequirement } from "./victory";

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
  const scored = player.scoredBattlefieldIdsThisTurn ?? [];
  if (scored.includes(battlefieldId)) return;
  player.scoredBattlefieldIdsThisTurn = [...scored, battlefieldId];
  const conquered = player.conqueredBattlefieldIdsThisTurn ?? [];
  const isFirstConquerThisTurn =
    method === "conquer" && conquered.length === 0;
  if (method === "conquer") {
    player.conqueredBattlefieldIdsThisTurn = [...conquered, battlefieldId];
  }
  const points = player.points ?? 0;
  const requirement = victoryRequirement(game, decks);
  const isFinalPoint = points === requirement - 1;
  if (isFinalPoint && isFirstConquerThisTurn) {
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

function drawOne(game: GameDocument, playerId: string) {
  const player = game.state.players[playerId]!;
  const cardId = player.zones.mainDeck.shift();
  if (cardId) player.zones.hand.push(cardId);
}

function requireBattlefield(game: GameDocument, battlefieldId: string) {
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === battlefieldId,
  );
  if (!battlefield) throw new Error("Battlefield is unavailable.");
  return battlefield;
}
