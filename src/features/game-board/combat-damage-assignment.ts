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

export function autoAssignCombatDamage(
  totalDamage: number,
  targets: readonly CombatDamageAssignmentTarget[],
): CombatDamageAllocation[] {
  let remainingDamage = totalDamage;
  const allocations: CombatDamageAllocation[] = [];
  const orderedTargets = [...targets].sort(
    (left, right) => left.priorityOrder - right.priorityOrder,
  );

  while (remainingDamage > 0 && orderedTargets.length > 0) {
    const priorityOrder = orderedTargets[0]!.priorityOrder;
    // Keep the historical recipient order, but do not spend the remainder on
    // a nonlethal target when a lethal assignment exists in this priority group.
    // Never skip an incomplete Tank/standard group to reach a later group.
    const lethalIndex = orderedTargets.findIndex(
      (target) => target.priorityOrder === priorityOrder &&
        target.lethalAmount <= remainingDamage,
    );
    const [target] = orderedTargets.splice(lethalIndex < 0 ? 0 : lethalIndex, 1);
    if (!target) break;
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
