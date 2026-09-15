import { createHash } from "node:crypto";
import type { GameCardDefinition } from "./schemas";
import type { GameDocument } from "./state";
import {
  advanceGameObjectIncarnation,
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
  powerSourceUses: PowerSourceUse[];
  generatedRestrictedPower: Record<string, Record<string, number>>;
  generatedPooledPower: Record<string, number>;
  powerRuneIds: string[];
};

export type AdditionalCardCost = {
  energy: number;
  power: number;
  powerDomain?: string;
};

type PowerSourceUse = {
  id: string;
  amount: number;
  domain: string;
  usage: string;
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
  poolOnly?: boolean;
  sourceChoices?: PowerSourceChoices;
};

type PowerSourceKind = "restricted" | "unrestricted";
type PowerSourceChoices = { values: PowerSourceKind[]; cursor: number; stage: number };
class PowerSourceChoiceRequired extends Error {
  constructor(readonly first: PowerSourceKind, readonly stateKey: string) {
    super("Material Power source choice required.");
  }
}

export function buildPaymentPlan(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  energyCost: number,
  index: RuntimeCardIndex,
  additionalAnyPower = 0,
  cardInstanceId?: string,
  sourceChoices?: PowerSourceChoices,
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
    sourceChoices,
  });
}

export function buildAbilityPaymentPlan(
  game: GameDocument,
  playerId: string,
  sourceDefinition: GameCardDefinition,
  costs: { energy: number; power: number },
  index: RuntimeCardIndex,
  options: { poolOnly?: boolean } = {},
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
    poolOnly: options.poolOnly,
  });
}

export function abilityPoolPaymentPreview(
  game: GameDocument,
  playerId: string,
  sourceDefinition: GameCardDefinition,
  costs: { energy: number; power: number },
  index: RuntimeCardIndex,
) {
  const player = game.state.players[playerId]!;
  const context: PaymentContext = {
    kind: "ability",
    sourceCardType: sourceDefinition.card.classification.type,
  };
  const powerDomains = sourceDefinition.card.classification.domain.filter(
    (domain) => domain !== "Colorless",
  );
  const availableEnergy = player.energy + Object.entries(
    player.restrictedResources?.energy ?? {},
  ).reduce((sum, [usage, amount]) =>
    sum + (resourceUsageAllowsPayment(usage, context) ? amount : 0), 0);
  const eligiblePower = (power: Record<string, number>) => Object.entries(power)
    .reduce((sum, [domain, amount]) =>
      sum + (powerDomainCanPay(domain, powerDomains) ? amount : 0), 0);
  const availablePower = eligiblePower(player.power) + Object.entries(
    player.restrictedResources?.power ?? {},
  ).reduce((sum, [usage, power]) =>
    sum + (resourceUsageAllowsPayment(usage, context) ? eligiblePower(power) : 0), 0);
  return {
    ...costs,
    powerDomains,
    availableEnergy,
    availablePower,
    canPay: buildAbilityPaymentPlan(game, playerId, sourceDefinition, costs, index, { poolOnly: true }) !== null,
  };
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
    const ability = exhaustForEnergyAbility(id, request.context, index);
    if (!ability) return;
    energySourceIds.push(id);
    const unusedEnergy = Math.max(0, ability.amount - remainingEnergy);
    remainingEnergy = Math.max(0, remainingEnergy - ability.amount);
    if (ability.usage === "spellsOnly")
      generatedConditionalEnergy += unusedEnergy;
    else generatedPooledEnergy += unusedEnergy;
  };
  const sourceIds = request.poolOnly ? [] : paymentResourceSourceIds(game, playerId, index);
  for (const id of sourceIds) {
    const ability = exhaustForEnergyAbility(id, request.context, index);
    if (ability?.usage === "spellsOnly") consumeEnergySource(id);
  }
  sourceIds.forEach(consumeEnergySource);
  if (remainingEnergy > 0) return null;

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
  const powerSourceUses: PowerSourceUse[] = [];
  const generatedRestrictedPower: Record<string, Record<string, number>> = {};
  const generatedPooledPower: Record<string, number> = {};
  const powerRuneIds: string[] = [];
  const candidates: Array<PowerSourceUse & { recycle?: boolean }> = sourceIds.flatMap((id) => {
    if (energySourceIds.includes(id) || game.state.cardStates[id]?.exhausted) return [];
    const ability = exhaustForPowerAbility(id, request.context, index);
    return ability && powerDomainCanPay(ability.domain, allowedDomains) ? [{ id, ...ability }] : [];
  });
  for (const id of request.poolOnly ? [] : player.zones.base) {
    if (!hasAbility(id, "ability.recycle_for_power", index)) continue;
    const domain = definitionForInstance(id, index).card.classification.domain[0];
    if (domain && allowedDomains.includes(domain)) {
      candidates.push({ id, amount: 1, domain, usage: "unrestricted", recycle: true });
    }
  }
  if (candidates.reduce((sum, source) => sum + source.amount, 0) < remainingPower) return null;
  while (remainingPower > 0 && candidates.length > 0) {
    let position = 0;
    if (request.sourceChoices) {
      const restricted = candidates.findIndex((source) => source.usage !== "unrestricted");
      const unrestricted = candidates.findIndex((source) => source.usage === "unrestricted");
      if (restricted >= 0 && unrestricted >= 0) {
        const choice = request.sourceChoices.values[request.sourceChoices.cursor++];
        if (!choice) throw new PowerSourceChoiceRequired(
          restricted < unrestricted ? "restricted" : "unrestricted",
          JSON.stringify({ stage: request.sourceChoices.stage, remainingPower, candidates,
            used: powerSourceUses.map((source) => source.id).sort(), runes: [...powerRuneIds].sort(),
            energySourceIds, player, exhausted: sourceIds.filter((id) => game.state.cardStates[id]?.exhausted) }),
        );
        position = choice === "restricted" ? restricted : unrestricted;
      }
    }
    const source = candidates.splice(position, 1)[0]!;
    const { id, recycle, ...ability } = source;
    if (recycle) powerRuneIds.push(id);
    else powerSourceUses.push({ id, ...ability });
    const unusedPower = Math.max(0, ability.amount - remainingPower);
    remainingPower = Math.max(0, remainingPower - ability.amount);
    if (unusedPower > 0) {
      if (ability.usage === "unrestricted") {
        generatedPooledPower[ability.domain] =
          (generatedPooledPower[ability.domain] ?? 0) + unusedPower;
      } else {
        generatedRestrictedPower[ability.usage] = {
          ...(generatedRestrictedPower[ability.usage] ?? {}),
          [ability.domain]:
            (generatedRestrictedPower[ability.usage]?.[ability.domain] ?? 0) +
            unusedPower,
        };
      }
    }
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

  return {
    conditionalEnergy,
    restrictedEnergy,
    pooledEnergy,
    energySourceIds,
    generatedConditionalEnergy,
    generatedPooledEnergy,
    powerFromPool,
    restrictedPower,
    powerSourceUses,
    generatedRestrictedPower,
    generatedPooledPower,
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

/**
 * Optional play costs are a single payment commitment. Validate the complete
 * sequence on an isolated state before mutating the authoritative game so a
 * later additional cost can never leave a partially-paid card play behind.
 */
export function canPayCardCosts(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  energyCost: number,
  index: RuntimeCardIndex,
  additionalAnyPower: number,
  additionalCosts: readonly AdditionalCardCost[],
  cardInstanceId?: string,
) {
  return cardPaymentPlans(game, playerId, definition, energyCost, index,
    additionalAnyPower, additionalCosts, cardInstanceId) !== null;
}

function cardPaymentPlans(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  energyCost: number,
  index: RuntimeCardIndex,
  additionalAnyPower: number,
  additionalCosts: readonly AdditionalCardCost[],
  cardInstanceId?: string,
  sourceChoices?: PowerSourceChoices,
): PaymentPlan[] | null {
  const preview = structuredClone(game);
  const plans: PaymentPlan[] = [];
  try {
    const base = buildPaymentPlan(preview, playerId, definition, energyCost, index,
      additionalAnyPower, cardInstanceId, sourceChoices);
    if (!base) return null;
    plans.push(base);
    applyPaymentPlan(preview, playerId, base, index);
    for (const cost of additionalCosts) {
      if (sourceChoices) sourceChoices.stage++;
      const plan = buildPaymentPlanForRequest(preview, playerId, definition, index, {
        energyCost: cost.energy, powerCost: cost.power,
        allowedPowerDomains: cost.powerDomain ? [normalizedDomain(cost.powerDomain)]
          : definition.card.classification.domain.filter((domain) => domain !== "Colorless"),
        context: { kind: "card", cardType: definition.card.classification.type },
        additionalAnyPower: 0, sourceChoices,
      });
      if (!plan) return null;
      plans.push(plan);
      applyPaymentPlan(preview, playerId, plan, index);
    }
    return plans;
  } catch (error) {
    if (error instanceof PowerSourceChoiceRequired) throw error;
    return null;
  }
}

/** Server-owned alternatives only at restricted/unrestricted Power decisions.
 * Within each category retain the existing source/Rune order; equivalent
 * permutations across base and optional payments collapse into one mode. */
export function cardPaymentVariants(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  energyCost: number,
  index: RuntimeCardIndex,
  additionalAnyPower: number,
  additionalCosts: readonly AdditionalCardCost[],
  cardInstanceId?: string,
) {
  const variants = new Map<string, { key: string; label: string; plans: PaymentPlan[]; automatic: boolean }>();
  const visited = new Set<string>();
  const pending: PowerSourceKind[][] = [[]];
  while (pending.length > 0) {
    const values = pending.pop()!;
    try {
      const plans = cardPaymentPlans(game, playerId, definition, energyCost, index,
        additionalAnyPower, additionalCosts, cardInstanceId, { values, cursor: 0, stage: 0 });
      if (!plans) continue;
      const uses = plans.flatMap((plan) => [
        ...plan.powerSourceUses.map((source) => ({ ...source, recycle: false })),
        ...plan.powerRuneIds.map((id) => ({ id, usage: "unrestricted", amount: 1,
          domain: definitionForInstance(id, index).card.classification.domain[0]!, recycle: true })),
      ]);
      const material = uses.map(({ id: _id, ...source }) => JSON.stringify(source)).sort();
      const materialKey = JSON.stringify(material);
      if (variants.has(materialKey)) continue;
      const identity = uses.map((source) => JSON.stringify(source)).sort();
      const key = createHash("sha256").update(JSON.stringify(identity)).digest("hex");
      const label = "Use " + [true, false].flatMap((restricted) => {
        const sources = uses.filter((source) => (source.usage !== "unrestricted") === restricted);
        if (sources.length === 0) return [];
        const amount = sources.reduce((total, source) => total + source.amount, 0);
        const domains = [...new Set(sources.map((source) => source.domain))].sort().join(" / ");
        const names = [...new Set(sources.map((source) => definitionForInstance(source.id, index).card.name))].join(", ");
        return [`${amount} ${restricted ? `${definition.card.classification.type}-restricted` : "unrestricted"} Power (${domains}) from ${names}`];
      }).join(" + ");
      variants.set(materialKey, { key, label, plans, automatic: values.length === 0 });
    } catch (error) {
      if (!(error instanceof PowerSourceChoiceRequired)) throw error;
      if (visited.has(error.stateKey)) continue;
      visited.add(error.stateKey);
      pending.push([...values, error.first === "restricted" ? "unrestricted" : "restricted"], [...values, error.first]);
    }
  }
  return [...variants.values()];
}

export function payCardCosts(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  energyCost: number,
  index: RuntimeCardIndex,
  additionalAnyPower: number,
  additionalCosts: readonly AdditionalCardCost[],
  cardInstanceId?: string,
  sourceVariant?: string,
) {
  const plans = sourceVariant
    ? cardPaymentVariants(game, playerId, definition, energyCost, index,
      additionalAnyPower, additionalCosts, cardInstanceId).find((variant) => variant.key === sourceVariant)?.plans
    : cardPaymentPlans(game, playerId, definition, energyCost, index,
      additionalAnyPower, additionalCosts, cardInstanceId);
  if (!plans) {
    throw new Error("Card costs cannot be paid.");
  }
  plans.forEach((plan) => applyPaymentPlan(game, playerId, plan, index));
}

export function payAbilityCost(
  game: GameDocument,
  playerId: string,
  sourceDefinition: GameCardDefinition,
  costs: { energy: number; power: number },
  index: RuntimeCardIndex,
  options: { poolOnly?: boolean } = {},
) {
  const plan = buildAbilityPaymentPlan(
    game,
    playerId,
    sourceDefinition,
    costs,
    index,
    options,
  );
  if (!plan) throw new Error(options.poolOnly
    ? "Add enough eligible Energy and Power to the Rune Pool before confirming."
    : "Ability costs cannot be paid.");
  applyPaymentPlan(game, playerId, plan, index);
}

export function canPayAdditionalCost(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  costs: AdditionalCardCost,
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
  costs: AdditionalCardCost,
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
  for (const source of plan.powerSourceUses) {
    game.state.cardStates[source.id]!.exhausted = true;
  }
  for (const [usage, domains] of Object.entries(plan.generatedRestrictedPower)) {
    player.restrictedResources ??= { energy: {}, power: {} };
    const resources = player.restrictedResources.power[usage] ??= {};
    for (const [domain, amount] of Object.entries(domains)) {
      resources[domain] = (resources[domain] ?? 0) + amount;
    }
  }
  for (const [domain, amount] of Object.entries(plan.generatedPooledPower)) {
    player.power[domain] = (player.power[domain] ?? 0) + amount;
  }
  for (const id of plan.powerRuneIds) {
    player.zones.base = player.zones.base.filter(
      (candidate) => candidate !== id,
    );
    player.zones.runeDeck.push(id);
    advanceGameObjectIncarnation(game, id);
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

function exhaustForPowerAbility(
  id: string,
  paymentContext: PaymentContext,
  index: RuntimeCardIndex,
): Omit<PowerSourceUse, "id"> | null {
  const definition = definitionForInstance(id, index);
  for (const clause of definition.behaviorModel.clauses) {
    for (const ability of clause.abilities) {
      if (
        ability.behaviorId !== "ability.exhaust_for_resource" ||
        ability.parameters.resourceType !== "power"
      ) {
        continue;
      }
      const amount = ability.parameters.amount;
      const usage = ability.parameters.usage;
      const requestedDomain = ability.parameters.domain;
      const domain =
        requestedDomain === "sourceDomain"
          ? definition.card.classification.domain.find(
              (candidate) => candidate !== "Colorless",
            )
          : typeof requestedDomain === "string"
            ? normalizedDomain(requestedDomain)
            : null;
      if (
        typeof amount !== "number" ||
        amount <= 0 ||
        typeof usage !== "string" ||
        !domain ||
        !resourceUsageAllowsPayment(usage, paymentContext)
      ) {
        continue;
      }
      return { amount, domain, usage };
    }
  }
  return null;
}

function powerDomainCanPay(domain: string, allowedDomains: readonly string[]) {
  return domain === "Rainbow" || allowedDomains.includes(domain);
}

function paymentResourceSourceIds(
  game: GameDocument,
  playerId: string,
  index: RuntimeCardIndex,
) {
  const player = game.state.players[playerId]!;
  return [
    ...player.zones.base,
    ...(player.zones.legend ? [player.zones.legend] : []),
    ...game.state.battlefields.flatMap((battlefield) =>
      battlefield.units.filter(
        (id) => index.instances.get(id)?.ownerPlayerId === playerId,
      ),
    ),
  ].filter((id) => !game.state.cardStates[id]?.attachedToCardInstanceId);
}
