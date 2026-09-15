export type CombatDamageAllocation = {
  targetUnitId: string;
  amount: number;
};

export type CombatDamageAssignmentTarget = {
  unitId: string;
  // Supplied by server combat projection; includes effective Might and damage.
  lethalAmount: number;
  // Existing prompt priority: Tank, standard, then Backline.
  priorityOrder: number;
};

// Shared by the display and suggestion so both use the same weakest-first order.
// Equal lethal thresholds retain input order through stable Array.sort.
export function compareCombatDamageTargets(
  left: CombatDamageAssignmentTarget,
  right: CombatDamageAssignmentTarget,
): number {
  return left.priorityOrder - right.priorityOrder ||
    left.lethalAmount - right.lethalAmount;
}

export function autoAssignCombatDamage(
  totalDamage: number,
  targets: readonly CombatDamageAssignmentTarget[],
): CombatDamageAllocation[] {
  let remainingDamage = totalDamage;
  const allocations: CombatDamageAllocation[] = [];
  const orderedTargets = [...targets].sort(compareCombatDamageTargets);

  for (const target of orderedTargets) {
    if (remainingDamage <= 0) break;
    const amount = Math.min(target.lethalAmount, remainingDamage);
    if (amount <= 0) continue;
    allocations.push({ targetUnitId: target.unitId, amount });
    remainingDamage -= amount;
  }

  const lastAllocation = allocations.at(-1);
  if (remainingDamage > 0 && lastAllocation) {
    lastAllocation.amount += remainingDamage;
  }
  return allocations;
}
