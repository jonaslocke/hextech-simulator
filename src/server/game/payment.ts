import type { GameCardDefinition } from "./schemas";
import type { GameDocument } from "./state";
import {
  definitionForInstance,
  effectivePowerCost,
  recomputeAllMight,
  type RuntimeCardIndex,
} from "./primitive-handlers";

export type PaymentPlan = {
  conditionalEnergy: number;
  restrictedEnergy: Record<string, number>;
  pooledEnergy: number;
  energySourceIds: string[];
  generatedConditionalEnergy: number;
  generatedPooledEnergy: number;
  powerFromPool: Record<string, number>;
  restrictedPower: Record<string, Record<string, number>>;
  powerRuneIds: string[];
};

export type PaymentContext =
  | { kind: "card"; cardType: string }
  | { kind: "ability"; sourceCardType: string };

type PaymentRequest = {
  energyCost: number;
  powerCost: number;
  allowedPowerDomains: string[];
  context: PaymentContext;
  additionalAnyPower: number;
};

export function buildPaymentPlan(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  energyCost: number,
  index: RuntimeCardIndex,
  additionalAnyPower = 0,
  cardInstanceId?: string,
): PaymentPlan | null {
  return buildPaymentPlanForRequest(game, playerId, definition, index, {
    energyCost,
    powerCost: effectivePowerCost(
      game,
      playerId,
      definition,
      index,
      cardInstanceId,
    ),
    allowedPowerDomains: definition.card.classification.domain.filter(
      (domain) => domain !== "Colorless",
    ),
    context: { kind: "card", cardType: definition.card.classification.type },
    additionalAnyPower,
  });
}

export function buildAbilityPaymentPlan(
  game: GameDocument,
  playerId: string,
  sourceDefinition: GameCardDefinition,
  costs: { energy: number; power: number },
  index: RuntimeCardIndex,
): PaymentPlan | null {
  return buildPaymentPlanForRequest(game, playerId, sourceDefinition, index, {
    energyCost: costs.energy,
    powerCost: costs.power,
    allowedPowerDomains: sourceDefinition.card.classification.domain.filter(
      (domain) => domain !== "Colorless",
    ),
    context: {
      kind: "ability",
      sourceCardType: sourceDefinition.card.classification.type,
    },
    additionalAnyPower: 0,
  });
}

function buildPaymentPlanForRequest(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  index: RuntimeCardIndex,
  request: PaymentRequest,
): PaymentPlan | null {
  const player = game.state.players[playerId]!;
  let remainingEnergy = request.energyCost;
  const conditionalEnergy = resourceUsageAllowsPayment(
    "spellsOnly",
    request.context,
  )
    ? Math.min(player.conditionalEnergy, remainingEnergy)
    : 0;
  remainingEnergy -= conditionalEnergy;
  const restrictedEnergy: Record<string, number> = {};
  for (const [usage, available] of Object.entries(
    player.restrictedResources?.energy ?? {},
  ).sort(([left], [right]) => left.localeCompare(right))) {
    if (!resourceUsageAllowsPayment(usage, request.context)) continue;
    const spend = Math.min(available, remainingEnergy);
    if (spend > 0) restrictedEnergy[usage] = spend;
    remainingEnergy -= spend;
  }
  const pooledEnergy = Math.min(player.energy, remainingEnergy);
  remainingEnergy -= pooledEnergy;
  let remainingPower = request.powerCost;
  const allowedDomains = request.allowedPowerDomains;
  if (remainingPower > 0 && allowedDomains.length === 0) return null;
  const powerFromPool: Record<string, number> = {};
  const restrictedPower: Record<string, Record<string, number>> = {};
  for (const [usage, domains] of Object.entries(
    player.restrictedResources?.power ?? {},
  ).sort(([left], [right]) => left.localeCompare(right))) {
    if (!resourceUsageAllowsPayment(usage, request.context)) continue;
    for (const domain of [...allowedDomains, "Rainbow"]) {
      const spend = Math.min(domains[domain] ?? 0, remainingPower);
      if (spend > 0) {
        restrictedPower[usage] = {
          ...(restrictedPower[usage] ?? {}),
          [domain]: spend,
        };
      }
      remainingPower -= spend;
    }
  }
  for (const domain of [...allowedDomains, "Rainbow"]) {
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
  let remainingAnyPower = request.additionalAnyPower;
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
      request.context,
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
      request.context,
      index,
    );
    if (ability?.usage === "spellsOnly") consumeEnergySource(id);
  }
  powerRuneIds.forEach(consumeEnergySource);
  player.zones.base.forEach(consumeEnergySource);
  if (remainingEnergy > 0) return null;

  return {
    conditionalEnergy,
    restrictedEnergy,
    pooledEnergy,
    energySourceIds,
    generatedConditionalEnergy,
    generatedPooledEnergy,
    powerFromPool,
    restrictedPower,
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
  cardInstanceId?: string,
) {
  const plan = buildPaymentPlan(
    game,
    playerId,
    definition,
    energyCost,
    index,
    additionalAnyPower,
    cardInstanceId,
  );
  if (!plan) throw new Error("Card costs cannot be paid.");
  applyPaymentPlan(game, playerId, plan, index);
}

export function payAbilityCost(
  game: GameDocument,
  playerId: string,
  sourceDefinition: GameCardDefinition,
  costs: { energy: number; power: number },
  index: RuntimeCardIndex,
) {
  const plan = buildAbilityPaymentPlan(
    game,
    playerId,
    sourceDefinition,
    costs,
    index,
  );
  if (!plan) throw new Error("Ability costs cannot be paid.");
  applyPaymentPlan(game, playerId, plan, index);
}

export function canPayAdditionalCost(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  costs: { energy: number; power: number; powerDomain?: string },
  index: RuntimeCardIndex,
) {
  return (
    buildPaymentPlanForRequest(game, playerId, definition, index, {
      energyCost: costs.energy,
      powerCost: costs.power,
      allowedPowerDomains: costs.powerDomain
        ? [normalizedDomain(costs.powerDomain)]
        : definition.card.classification.domain.filter(
            (domain) => domain !== "Colorless",
          ),
      context: { kind: "card", cardType: definition.card.classification.type },
      additionalAnyPower: 0,
    }) !== null
  );
}

export function payAdditionalCost(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  costs: { energy: number; power: number; powerDomain?: string },
  index: RuntimeCardIndex,
) {
  const plan = buildPaymentPlanForRequest(game, playerId, definition, index, {
    energyCost: costs.energy,
    powerCost: costs.power,
    allowedPowerDomains: costs.powerDomain
      ? [normalizedDomain(costs.powerDomain)]
      : definition.card.classification.domain.filter(
          (domain) => domain !== "Colorless",
        ),
    context: { kind: "card", cardType: definition.card.classification.type },
    additionalAnyPower: 0,
  });
  if (!plan) throw new Error("Additional card cost cannot be paid.");
  applyPaymentPlan(game, playerId, plan, index);
}

function applyPaymentPlan(
  game: GameDocument,
  playerId: string,
  plan: PaymentPlan,
  index: RuntimeCardIndex,
) {
  const player = game.state.players[playerId]!;
  player.conditionalEnergy -= plan.conditionalEnergy;
  for (const [usage, amount] of Object.entries(plan.restrictedEnergy)) {
    const resources = player.restrictedResources?.energy;
    if (!resources || (resources[usage] ?? 0) < amount) {
      throw new Error("Restricted Energy payment is unavailable.");
    }
    resources[usage] -= amount;
  }
  player.energy -= plan.pooledEnergy;
  player.conditionalEnergy += plan.generatedConditionalEnergy;
  player.energy += plan.generatedPooledEnergy;
  plan.energySourceIds.forEach((id) => {
    game.state.cardStates[id]!.exhausted = true;
  });
  for (const [domain, amount] of Object.entries(plan.powerFromPool))
    player.power[domain] = (player.power[domain] ?? 0) - amount;
  for (const [usage, domains] of Object.entries(plan.restrictedPower)) {
    const resources = player.restrictedResources?.power[usage];
    for (const [domain, amount] of Object.entries(domains)) {
      if (!resources || (resources[domain] ?? 0) < amount) {
        throw new Error("Restricted Power payment is unavailable.");
      }
      resources[domain] -= amount;
    }
  }
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

function normalizedDomain(domain: string) {
  return domain === "rainbow"
    ? "Rainbow"
    : `${domain.slice(0, 1).toUpperCase()}${domain.slice(1).toLowerCase()}`;
}

export function resourceUsageAllowsPayment(
  usage: string,
  context: PaymentContext,
) {
  if (usage === "unrestricted") return true;
  if (usage === "spellsOnly") {
    return context.kind === "card" && context.cardType === "Spell";
  }
  if (usage === "gearAndGearAbilitiesOnly") {
    return (
      (context.kind === "card" && context.cardType === "Gear") ||
      (context.kind === "ability" && context.sourceCardType === "Gear")
    );
  }
  const match = usage.match(/^(card|cardOrAbility):(Unit|Gear|Spell)$/);
  if (!match) return false;
  const [, scope, cardType] = match;
  return (
    (context.kind === "card" && context.cardType === cardType) ||
    (scope === "cardOrAbility" &&
      context.kind === "ability" &&
      context.sourceCardType === cardType)
  );
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

export function targetDeflectCost(
  playerId: string,
  selectedIds: readonly string[],
  index: RuntimeCardIndex,
  ignoreDeflect = false,
) {
  if (ignoreDeflect) return 0;
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
  paymentContext: PaymentContext,
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
        !resourceUsageAllowsPayment(usage, paymentContext)
      ) {
        continue;
      }
      return { amount, usage };
    }
  }
  return null;
}
