import {
  cleanupLethalDamage,
  type RuntimeCardIndex
} from "./primitive-handlers";
import type { DeckSnapshotDocument } from "./repositories";
import type { GameDocument } from "./state";
import { dispatchBehaviorEvent, victoryRequirement } from "./triggers";

export function cleanupBoard(
  game: GameDocument,
  index: RuntimeCardIndex
): void {
  cleanupLethalDamage(game, Object.keys(game.state.cardStates), index);
  for (const battlefield of game.state.battlefields) {
    const controllers = unitControllers(game, battlefield.units, index);
    if (controllers.length === 0 && !battlefield.contestedByPlayerId) {
      battlefield.controllerPlayerId = null;
    }
    if (
      controllers.length === 1 &&
      battlefield.controllerPlayerId === controllers[0] &&
      battlefield.contestedByPlayerId === controllers[0]
    ) {
      battlefield.contestedByPlayerId = null;
    }
  }
}

export function markBattlefieldContested(
  game: GameDocument,
  battlefieldId: string,
  actorPlayerId: string
): void {
  const battlefield = requireBattlefield(game, battlefieldId);
  if (battlefield.controllerPlayerId !== actorPlayerId) {
    battlefield.contestedByPlayerId = actorPlayerId;
  }
}

export function openNonCombatShowdown(
  game: GameDocument,
  battlefieldId: string,
  actorPlayerId: string
): void {
  game.state.showdown = {
    kind: "nonCombat",
    battlefieldId,
    relevantPlayerIds: [...game.state.setup.playerIds],
    focusPlayerId: actorPlayerId,
    passedPlayerIds: []
  };
}

export function resolveNonCombatShowdown(
  game: GameDocument,
  battlefieldId: string,
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[]
): void {
  cleanupBoard(game, index);
  const battlefield = requireBattlefield(game, battlefieldId);
  const actor = battlefield.contestedByPlayerId;
  if (!actor) return;
  const controllers = unitControllers(game, battlefield.units, index);
  if (controllers.length === 1 && controllers[0] === actor) {
    const changed = battlefield.controllerPlayerId !== actor;
    battlefield.controllerPlayerId = actor;
    battlefield.contestedByPlayerId = null;
    if (changed) scoreBattlefield(game, actor, battlefieldId, "conquer", decks);
  }
}

export function applyHoldScoring(
  game: GameDocument,
  playerId: string,
  decks: readonly DeckSnapshotDocument[]
): void {
  const player = game.state.players[playerId]!;
  player.scoredBattlefieldIdsThisTurn = [];
  for (const battlefield of game.state.battlefields) {
    if (battlefield.controllerPlayerId === playerId) {
      scoreBattlefield(game, playerId, battlefield.battlefieldId, "hold", decks);
    }
  }
}

export function scoreBattlefield(
  game: GameDocument,
  playerId: string,
  battlefieldId: string,
  method: "conquer" | "hold",
  decks: readonly DeckSnapshotDocument[]
): void {
  const player = game.state.players[playerId]!;
  const scored = player.scoredBattlefieldIdsThisTurn ?? [];
  if (scored.includes(battlefieldId)) return;
  player.scoredBattlefieldIdsThisTurn = [...scored, battlefieldId];
  const points = player.points ?? 0;
  const requirement = victoryRequirement(game, decks);
  const isFinalPoint = points === requirement - 1;
  const hasScoredEveryBattlefield = game.state.battlefields.every((battlefield) =>
    player.scoredBattlefieldIdsThisTurn!.includes(battlefield.battlefieldId)
  );
  if (isFinalPoint && method === "conquer" && !hasScoredEveryBattlefield) {
    drawOne(game, playerId);
  } else {
    player.points = points + 1;
  }
  const battlefield = requireBattlefield(game, battlefieldId);
  dispatchBehaviorEvent(game, {
    type: method === "conquer" ? "battlefield.conquered" : "battlefield.held",
    actorPlayerId: playerId,
    subjectCardInstanceId: battlefield.cardInstanceId,
    values: {}
  }, decks);
  if ((player.points ?? 0) >= requirement) {
    game.winnerPlayerId = playerId;
    game.status = "complete";
  }
}

export function unitControllers(
  game: GameDocument,
  unitIds: readonly string[],
  index: RuntimeCardIndex
): string[] {
  return [...new Set(unitIds.map((id) => index.instances.get(id)?.ownerPlayerId)
    .filter((id): id is string => Boolean(id && game.state.players[id])))];
}

function drawOne(game: GameDocument, playerId: string) {
  const player = game.state.players[playerId]!;
  const cardId = player.zones.mainDeck.shift();
  if (cardId) player.zones.hand.push(cardId);
}

function requireBattlefield(game: GameDocument, battlefieldId: string) {
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === battlefieldId
  );
  if (!battlefield) throw new Error("Battlefield is unavailable.");
  return battlefield;
}
