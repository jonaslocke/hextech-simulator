import {
  clearMarkedDamage,
  cleanupBoard,
  unitControllers
} from "./board-rules";
import { scoreBattlefield } from "./scoring";
import {
  cleanupCombatModifiers,
  definitionForInstance,
  hasKeyword,
  killUnitsMarkedForNextDamage,
  recomputeMight,
  type RuntimeCardIndex
} from "./primitive-handlers";
import type { DeckSnapshotDocument } from "./repositories";
import type { GameDocument } from "./state";
import { dispatchSimultaneousBehaviorEvents } from "./triggers";

export type DamageAssignment = {
  targetUnitId: string;
  amount: number;
};

export function startCombat(
  game: GameDocument,
  battlefieldId: string,
  attackerPlayerId: string,
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[]
): boolean {
  cleanupBoard(game, index);
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === battlefieldId
  );
  if (!battlefield) throw new Error("Battlefield is unavailable.");
  const controllers = unitControllers(game, battlefield.units, index);
  if (controllers.length !== 2) return false;
  const defenderPlayerId = battlefield.controllerPlayerId
    && battlefield.controllerPlayerId !== attackerPlayerId
    ? battlefield.controllerPlayerId
    : controllers.find((id) => id !== attackerPlayerId);
  if (!defenderPlayerId) return false;
  const attackerUnitIds = controlledUnits(
    battlefield.units,
    attackerPlayerId,
    index
  );
  const defenderUnitIds = controlledUnits(
    battlefield.units,
    defenderPlayerId,
    index
  );
  attackerUnitIds.forEach((id) => {
    game.state.cardStates[id]!.combatRole = "attacker";
  });
  defenderUnitIds.forEach((id) => {
    game.state.cardStates[id]!.combatRole = "defender";
  });
  game.state.combat = {
    battlefieldId,
    stage: "showdown",
    attackerPlayerId,
    defenderPlayerId,
    attackerUnitIds,
    defenderUnitIds,
    attackerMight: null,
    defenderMight: null,
    attackerAssignments: [],
    defenderAssignments: []
  };
  [...attackerUnitIds, ...defenderUnitIds].forEach((id) =>
    recomputeMight(game, id, index),
  );
  game.state.showdown = {
    kind: "combat",
    battlefieldId,
    relevantPlayerIds: [attackerPlayerId, defenderPlayerId],
    focusPlayerId: attackerPlayerId,
    passedPlayerIds: []
  };
  dispatchSimultaneousBehaviorEvents(
    game,
    attackerUnitIds.map((id) => ({
      type: "unit.attacks",
      actorPlayerId: attackerPlayerId,
      subjectCardInstanceId: id,
      values: { battlefieldId }
    })),
    decks,
  );
  dispatchSimultaneousBehaviorEvents(
    game,
    defenderUnitIds.map((id) => ({
      type: "unit.defends",
      actorPlayerId: defenderPlayerId,
      subjectCardInstanceId: id,
      values: { battlefieldId }
    })),
    decks,
  );
  return true;
}

export function beginCombatDamage(
  game: GameDocument,
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[]
): void {
  const combat = game.state.combat;
  if (!combat) return;
  cleanupBoard(game, index);
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === combat.battlefieldId
  );
  if (!battlefield) throw new Error("Combat battlefield is unavailable.");
  combat.attackerUnitIds = controlledUnits(
    battlefield.units,
    combat.attackerPlayerId,
    index
  );
  combat.defenderUnitIds = controlledUnits(
    battlefield.units,
    combat.defenderPlayerId,
    index
  );
  if (!combat.attackerUnitIds.length || !combat.defenderUnitIds.length) {
    resolveCombat(game, index, decks);
    return;
  }
  combat.attackerMight = totalCombatMight(
    game,
    combat.attackerUnitIds,
    index
  );
  combat.defenderMight = totalCombatMight(
    game,
    combat.defenderUnitIds,
    index
  );
  combat.stage = "attackerAssignment";
  requestOrApplyAssignment(
    game,
    combat.attackerPlayerId,
    combat.attackerMight,
    combat.defenderUnitIds,
    index,
    decks
  );
}

export function submitCombatDamage(
  game: GameDocument,
  playerId: string,
  assignments: DamageAssignment[],
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[]
): void {
  const combat = game.state.combat;
  const choice = game.state.pendingChoice;
  if (!combat || !choice || choice.type !== "assignCombatDamage") {
    throw new Error("No combat damage assignment is pending.");
  }
  if (choice.playerId !== playerId) {
    throw new Error("Combat damage must be assigned by the prompted player.");
  }
  validateDamageAssignments(
    game,
    assignments,
    choice.totalDamage,
    choice.targetUnitIds,
    index
  );
  game.state.pendingChoice = null;
  applyAssignment(game, playerId, assignments, index, decks);
}

export function combatChoiceTargets(
  game: GameDocument,
  index: RuntimeCardIndex
) {
  const choice = game.state.pendingChoice;
  if (!choice || choice.type !== "assignCombatDamage") return [];
  return choice.targetUnitIds.map((unitId) => ({
    unitId,
    lethalAmount: lethalAmount(game, unitId),
    hasTank: hasKeyword(game, unitId, "keyword.tank", index)
  }));
}

function requestOrApplyAssignment(
  game: GameDocument,
  playerId: string,
  totalDamage: number,
  targetUnitIds: string[],
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[]
) {
  if (totalDamage === 0 || targetUnitIds.length === 0) {
    applyAssignment(game, playerId, [], index, decks);
    return;
  }
  if (targetUnitIds.length === 1) {
    applyAssignment(
      game,
      playerId,
      [{ targetUnitId: targetUnitIds[0]!, amount: totalDamage }],
      index,
      decks
    );
    return;
  }
  game.state.pendingChoice = {
    id: `combat:${game.stateVersion}:${playerId}:damage`,
    playerId,
    type: "assignCombatDamage",
    totalDamage,
    targetUnitIds
  };
}

function applyAssignment(
  game: GameDocument,
  playerId: string,
  assignments: DamageAssignment[],
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[]
) {
  const combat = game.state.combat!;
  if (playerId === combat.attackerPlayerId) {
    combat.attackerAssignments = assignments;
    combat.stage = "defenderAssignment";
    requestOrApplyAssignment(
      game,
      combat.defenderPlayerId,
      combat.defenderMight ?? 0,
      combat.attackerUnitIds,
      index,
      decks
    );
    return;
  }
  if (playerId !== combat.defenderPlayerId) {
    throw new Error("Player is not a participant in this combat.");
  }
  combat.defenderAssignments = assignments;
  const resolvedAssignments = [
    ...combat.attackerAssignments.map((assignment) => ({
      ...assignment,
      actorPlayerId: combat.attackerPlayerId,
    })),
    ...combat.defenderAssignments.map((assignment) => ({
      ...assignment,
      actorPlayerId: combat.defenderPlayerId,
    })),
  ];
  for (const assignment of resolvedAssignments) {
    game.state.cardStates[assignment.targetUnitId]!.damage += assignment.amount;
  }
  (game.state.queuedBehaviorEvents ??= []).push(
    ...resolvedAssignments.map((assignment) => ({
      type: "unit.damaged" as const,
      actorPlayerId: assignment.actorPlayerId,
      subjectCardInstanceId: assignment.targetUnitId,
      values: { amount: assignment.amount },
    })),
  );
  killUnitsMarkedForNextDamage(
    game,
    resolvedAssignments.map((assignment) => assignment.targetUnitId),
    index,
  );
  resolveCombat(game, index, decks);
}

function resolveCombat(
  game: GameDocument,
  index: RuntimeCardIndex,
  decks: readonly DeckSnapshotDocument[]
) {
  const combat = game.state.combat!;
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.battlefieldId === combat.battlefieldId
  )!;
  cleanupBoard(game, index);
  const attackers = controlledUnits(
    battlefield.units,
    combat.attackerPlayerId,
    index
  );
  const defenders = controlledUnits(
    battlefield.units,
    combat.defenderPlayerId,
    index
  );
  let conqueredByAttacker = false;
  if (attackers.length && defenders.length) {
    battlefield.units = battlefield.units.filter(
      (id) => !attackers.includes(id)
    );
    game.state.players[combat.attackerPlayerId]!.zones.base.push(...attackers);
    battlefield.controllerPlayerId = combat.defenderPlayerId;
  } else if (attackers.length) {
    const changed =
      battlefield.controllerPlayerId !== combat.attackerPlayerId;
    battlefield.controllerPlayerId = combat.attackerPlayerId;
    conqueredByAttacker = changed;
  } else if (defenders.length) {
    battlefield.controllerPlayerId = combat.defenderPlayerId;
  } else {
    battlefield.controllerPlayerId = null;
  }
  battlefield.contestedByPlayerId = null;
  for (const state of Object.values(game.state.cardStates)) {
    state.combatRole = null;
  }
  clearMarkedDamage(game);
  cleanupCombatModifiers(game, index);
  for (const id of [
    ...combat.attackerUnitIds,
    ...combat.defenderUnitIds,
  ]) {
    if (
      game.state.cardStates[id] &&
      definitionForInstance(id, index).card.classification.type === "Unit"
    ) {
      recomputeMight(game, id, index);
    }
  }
  game.state.pendingChoice = null;
  game.state.showdown = null;
  game.state.combat = null;
  cleanupBoard(game, index);
  if (conqueredByAttacker) {
    scoreBattlefield(
      game,
      combat.attackerPlayerId,
      battlefield.battlefieldId,
      "conquer",
      decks,
    );
  }
}

function validateDamageAssignments(
  game: GameDocument,
  assignments: DamageAssignment[],
  totalDamage: number,
  targetUnitIds: string[],
  index: RuntimeCardIndex
) {
  if (assignments.some((entry) =>
    !Number.isInteger(entry.amount) ||
    entry.amount <= 0 ||
    !targetUnitIds.includes(entry.targetUnitId)
  )) {
    throw new Error("Combat damage assignments contain an invalid target or amount.");
  }
  if (new Set(assignments.map((entry) => entry.targetUnitId)).size !== assignments.length) {
    throw new Error("A unit may appear only once in combat damage assignments.");
  }
  if (assignments.reduce((sum, entry) => sum + entry.amount, 0) !== totalDamage) {
    throw new Error("All available combat damage must be assigned.");
  }
  const unassignedTargetIds = targetUnitIds.filter((id) =>
    !assignments.some((entry) => entry.targetUnitId === id)
  );
  if (
    unassignedTargetIds.length > 0 &&
    assignments.some((entry) =>
      entry.amount > lethalAmount(game, entry.targetUnitId)
    )
  ) {
    throw new Error(
      "A unit cannot be assigned more than lethal damage while another unit can receive combat damage."
    );
  }
  const tankIds = targetUnitIds.filter((id) =>
    hasKeyword(game, id, "keyword.tank", index)
  );
  const firstNonTank = assignments.findIndex(
    (entry) => !tankIds.includes(entry.targetUnitId)
  );
  if (firstNonTank >= 0) {
    const tankAfterNonTank = assignments
      .slice(firstNonTank + 1)
      .some((entry) => tankIds.includes(entry.targetUnitId));
    const incompleteTank = tankIds.some((id) =>
      (assignments.find((entry) => entry.targetUnitId === id)?.amount ?? 0)
        < lethalAmount(game, id)
    );
    if (tankAfterNonTank || incompleteTank) {
      throw new Error("Tank units must be assigned lethal damage first.");
    }
  }
  for (let indexPosition = 0; indexPosition < assignments.length - 1; indexPosition += 1) {
    const entry = assignments[indexPosition]!;
    if (entry.amount < lethalAmount(game, entry.targetUnitId)) {
      throw new Error("A unit must be assigned lethal damage before assigning another unit.");
    }
  }
}

function totalCombatMight(
  game: GameDocument,
  unitIds: string[],
  index: RuntimeCardIndex
) {
  return unitIds.reduce((sum, id) => {
    if (game.state.cardStates[id]?.stunned) return sum;
    const base = game.state.cardStates[id]?.computedMight
      ?? definitionForInstance(id, index).card.attributes.might
      ?? 0;
    return sum + base;
  }, 0);
}

function lethalAmount(game: GameDocument, unitId: string) {
  const state = game.state.cardStates[unitId]!;
  return Math.max(1, (state.computedMight ?? 0) - state.damage);
}

function controlledUnits(
  unitIds: string[],
  playerId: string,
  index: RuntimeCardIndex
) {
  return unitIds.filter(
    (id) => index.instances.get(id)?.ownerPlayerId === playerId
  );
}
