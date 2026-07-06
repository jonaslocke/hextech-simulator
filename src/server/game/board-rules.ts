import {
  cleanupLethalDamage,
  type RuntimeCardIndex
} from "./primitive-handlers";
import type { DeckSnapshotDocument } from "./repositories";
import type { GameDocument } from "./state";
import { scoreBattlefield } from "./scoring";

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

export function clearMarkedDamage(game: GameDocument): void {
  for (const state of Object.values(game.state.cardStates)) {
    state.damage = 0;
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

export function openPendingNonCombatShowdown(
  game: GameDocument,
  index: RuntimeCardIndex,
): boolean {
  if (
    game.state.chain ||
    game.state.pendingChoice ||
    game.state.showdown ||
    game.state.combat
  ) {
    return false;
  }
  const battlefield = game.state.battlefields.find((candidate) => {
    const actor = candidate.contestedByPlayerId;
    if (!actor || candidate.controllerPlayerId != null) return false;
    const controllers = unitControllers(game, candidate.units, index);
    return controllers.length === 1 && controllers[0] === actor;
  });
  if (!battlefield?.contestedByPlayerId) return false;
  openNonCombatShowdown(
    game,
    battlefield.battlefieldId,
    battlefield.contestedByPlayerId,
  );
  return true;
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

export function unitControllers(
  game: GameDocument,
  unitIds: readonly string[],
  index: RuntimeCardIndex
): string[] {
  return [...new Set(unitIds.map((id) => index.instances.get(id)?.ownerPlayerId)
    .filter((id): id is string => Boolean(id && game.state.players[id])))];
}

function requireBattlefield(game: GameDocument, battlefieldId: string) {
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === battlefieldId
  );
  if (!battlefield) throw new Error("Battlefield is unavailable.");
  return battlefield;
}
