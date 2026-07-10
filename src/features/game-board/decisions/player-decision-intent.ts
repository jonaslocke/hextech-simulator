import type { PlayerDecisionIntent } from "./player-decision-types";

export function createSelectionIntent(
  actionId: string,
  selectedIds: string[],
): PlayerDecisionIntent {
  return { actionId, selectedIds };
}

export function createCombatDamageIntent(
  actionId: string,
  allocations: Array<{ targetUnitId: string; amount: number }>,
): PlayerDecisionIntent {
  return { actionId, selectedIds: [], allocations };
}

export function createTokenPlacementIntent(
  actionId: string,
  tokenPlacements: Array<{ destinationId: string; count: number }>,
): PlayerDecisionIntent {
  return { actionId, selectedIds: [], tokenPlacements };
}
