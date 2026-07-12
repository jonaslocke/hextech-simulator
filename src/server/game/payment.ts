import type { GameCardDefinition } from "./schemas";
import type { GameDocument } from "./state";
import {
  definitionForInstance,
  recomputeAllMight,
  type RuntimeCardIndex,
} from "./primitive-handlers";

export type PaymentPlan = {
  conditionalEnergy: number;
  pooledEnergy: number;
  energySourceIds: string[];
  generatedConditionalEnergy: number;
  generatedPooledEnergy: number;
  conditionalPowerFromPool: Record<string, number>;
  powerFromPool: Record<string, number>;
  powerRuneIds: string[];
};

export function buildPaymentPlan(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  energyCost: number,
  index: RuntimeCardIndex,
  additionalAnyPower = 0,
  additionalDomainPower = 0,
): PaymentPlan | null {
  const player = game.state.players[playerId]!;
  let remainingEnergy = energyCost;
  const conditionalEnergy =
    definition.card.classification.type === "Spell"
      ? Math.min(player.conditionalEnergy, remainingEnergy)
      : 0;
  remainingEnergy -= conditionalEnergy;
  const pooledEnergy = Math.min(player.energy, remainingEnergy);
  remainingEnergy -= pooledEnergy;
  let remainingPower =
    (definition.card.attributes.power ?? 0) + additionalDomainPower;
  const allowedDomains = definition.card.classification.domain.filter(
    (domain) => domain !== "Colorless",
  );
  if (remainingPower > 0 && allowedDomains.length === 0) return null;
  const conditionalPowerFromPool: Record<string, number> = {};
  const powerFromPool: Record<string, number> = {};
  for (const domain of [...allowedDomains, "Rainbow"]) {
    const conditionalSpend =
      definition.card.classification.type === "Spell"
        ? Math.min(player.conditionalPower?.[domain] ?? 0, remainingPower)
        : 0;
    if (conditionalSpend > 0) conditionalPowerFromPool[domain] = conditionalSpend;
    remainingPower -= conditionalSpend;
    const spend = Math.min(player.power[domain] ?? 0, remainingPower);
    if (spend > 0) powerFromPool[domain] = spend;
    remainingPower -= spend;
  }
  const powerRuneIds: string[] = [];
  for (const id of player.zones.base) {
    if (remainingPower === 0) break;
    if (!hasAbility(id, "ability.recycle_for_power", index)) continue;
    const runeDomain = definitionForInstance(id, index).card.classification
      .domain[0];
    if (!runeDomain || !allowedDomains.includes(runeDomain)) continue;
    powerRuneIds.push(id);
    remainingPower -= 1;
  }
  if (remainingPower > 0) return null;
  let remainingAnyPower = additionalAnyPower;
  const poolDomains = Object.keys(player.power).sort((left, right) => {
    if (left === "Rainbow") return 1;
    if (right === "Rainbow") return -1;
    return left.localeCompare(right);
  });
  for (const domain of poolDomains) {
    const available =
      (player.power[domain] ?? 0) - (powerFromPool[domain] ?? 0);
    const spend = Math.min(available, remainingAnyPower);
    if (spend > 0) {
      powerFromPool[domain] = (powerFromPool[domain] ?? 0) + spend;
      remainingAnyPower -= spend;
    }
  }
  if (definition.card.classification.type === "Spell") {
    for (const domain of Object.keys(player.conditionalPower ?? {}).sort()) {
      const available =
        (player.conditionalPower?.[domain] ?? 0) -
        (conditionalPowerFromPool[domain] ?? 0);
      const spend = Math.min(available, remainingAnyPower);
      if (spend > 0) {
        conditionalPowerFromPool[domain] =
          (conditionalPowerFromPool[domain] ?? 0) + spend;
        remainingAnyPower -= spend;
      }
    }
  }
  if (remainingAnyPower > 0) return null;

  const energySourceIds: string[] = [];
  let generatedConditionalEnergy = 0;
  let generatedPooledEnergy = 0;
  const consumeEnergySource = (id: string) => {
    if (
      remainingEnergy === 0 ||
      energySourceIds.includes(id) ||
      game.state.cardStates[id]?.exhausted
    ) {
      return;
    }
    const ability = exhaustForEnergyAbility(
      id,
      definition.card.classification.type,
      index,
    );
    if (!ability) return;
    energySourceIds.push(id);
    const unusedEnergy = Math.max(0, ability.amount - remainingEnergy);
    remainingEnergy = Math.max(0, remainingEnergy - ability.amount);
    if (ability.usage === "spellsOnly")
      generatedConditionalEnergy += unusedEnergy;
    else generatedPooledEnergy += unusedEnergy;
  };
  for (const id of player.zones.base) {
    const ability = exhaustForEnergyAbility(
      id,
      definition.card.classification.type,
      index,
    );
    if (ability?.usage === "spellsOnly") consumeEnergySource(id);
  }
  powerRuneIds.forEach(consumeEnergySource);
  player.zones.base.forEach(consumeEnergySource);
  if (remainingEnergy > 0) return null;

  return {
    conditionalEnergy,
    pooledEnergy,
    energySourceIds,
    generatedConditionalEnergy,
    generatedPooledEnergy,
    conditionalPowerFromPool,
    powerFromPool,
    powerRuneIds,
  };
}

export function payCardCost(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  energyCost: number,
  index: RuntimeCardIndex,
  additionalAnyPower = 0,
  additionalDomainPower = 0,
) {
  const plan = buildPaymentPlan(
    game,
    playerId,
    definition,
    energyCost,
    index,
    additionalAnyPower,
    additionalDomainPower,
  );
  if (!plan) throw new Error("Card costs cannot be paid.");
  const player = game.state.players[playerId]!;
  player.conditionalEnergy -= plan.conditionalEnergy;
  player.energy -= plan.pooledEnergy;
  player.conditionalEnergy += plan.generatedConditionalEnergy;
  player.energy += plan.generatedPooledEnergy;
  for (const [domain, amount] of Object.entries(plan.conditionalPowerFromPool)) {
    const conditionalPower = (player.conditionalPower ??= {});
    conditionalPower[domain] = (conditionalPower[domain] ?? 0) - amount;
  }
  plan.energySourceIds.forEach((id) => {
    game.state.cardStates[id]!.exhausted = true;
  });
  for (const [domain, amount] of Object.entries(plan.powerFromPool))
    player.power[domain] = (player.power[domain] ?? 0) - amount;
  for (const id of plan.powerRuneIds) {
    player.zones.base = player.zones.base.filter(
      (candidate) => candidate !== id,
    );
    player.zones.runeDeck.push(id);
    const state = game.state.cardStates[id];
    if (state) {
      state.damage = 0;
      state.exhausted = false;
    }
  }
  if (plan.powerRuneIds.length > 0) {
    recomputeAllMight(game, index);
  }
}

export function availableAnyPowerAfterBaseCost(
  game: GameDocument,
  playerId: string,
  plan: PaymentPlan,
) {
  const player = game.state.players[playerId]!;
  const pooledPower = Object.values(player.power).reduce(
    (total, amount) => total + amount,
    0,
  );
  const basePowerFromPool = Object.values(plan.powerFromPool).reduce(
    (total, amount) => total + amount,
    0,
  );
  return Math.max(0, pooledPower - basePowerFromPool);
}

export function canPayAnyPower(
  game: GameDocument,
  playerId: string,
  index: RuntimeCardIndex,
) {
  const player = game.state.players[playerId]!;
  if (Object.values(player.power).some((amount) => amount > 0)) return true;
  return player.zones.base.some((id) =>
    definitionForInstance(id, index).behaviorModel.clauses.some((clause) =>
      clause.abilities.some(
        (ability) => ability.behaviorId === "ability.recycle_for_power",
      ),
    ),
  );
}

export function payAnyPower(
  game: GameDocument,
  playerId: string,
  index: RuntimeCardIndex,
) {
  const player = game.state.players[playerId]!;
  const domain = Object.keys(player.power)
    .filter((candidate) => (player.power[candidate] ?? 0) > 0)
    .sort()[0];
  if (domain) {
    player.power[domain]! -= 1;
    return;
  }
  const runeId = player.zones.base.find((id) =>
    definitionForInstance(id, index).behaviorModel.clauses.some((clause) =>
      clause.abilities.some(
        (ability) => ability.behaviorId === "ability.recycle_for_power",
      ),
    ),
  );
  if (!runeId) throw new Error("A Power cost cannot be paid.");
  player.zones.base = player.zones.base.filter((id) => id !== runeId);
  player.zones.runeDeck.push(runeId);
  const state = game.state.cardStates[runeId];
  if (state) {
    state.damage = 0;
    state.exhausted = false;
  }
  recomputeAllMight(game, index);
}

export function targetDeflectCost(
  playerId: string,
  selectedIds: readonly string[],
  index: RuntimeCardIndex,
) {
  return selectedIds.reduce((total, id) => {
    const instance = index.instances.get(id);
    if (!instance || instance.ownerPlayerId === playerId) return total;
    const amount = definitionForInstance(id, index).behaviorModel.clauses
      .flatMap((clause) => clause.keywords)
      .filter((binding) => binding.behaviorId === "keyword.deflect")
      .reduce(
        (sum, binding) =>
          sum +
          (typeof binding.parameters.amount === "number"
            ? binding.parameters.amount
            : 1),
        0,
      );
    return total + amount;
  }, 0);
}

function hasAbility(id: string, behaviorId: string, index: RuntimeCardIndex) {
  return definitionForInstance(id, index).behaviorModel.clauses.some((clause) =>
    clause.abilities.some((ability) => ability.behaviorId === behaviorId),
  );
}

function exhaustForEnergyAbility(
  id: string,
  cardType: string,
  index: RuntimeCardIndex,
): { amount: number; usage: string } | null {
  for (const clause of definitionForInstance(id, index).behaviorModel.clauses) {
    for (const ability of clause.abilities) {
      if (
        ability.behaviorId !== "ability.exhaust_for_resource" ||
        ability.parameters.resourceType !== "energy"
      ) {
        continue;
      }
      const amount = ability.parameters.amount;
      const usage = ability.parameters.usage;
      if (
        typeof amount !== "number" ||
        amount <= 0 ||
        typeof usage !== "string" ||
        (usage === "spellsOnly" && cardType !== "Spell")
      ) {
        continue;
      }
      return { amount, usage };
    }
  }
  return null;
}
