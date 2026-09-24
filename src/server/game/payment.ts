import { normalizeResourceRestriction, resourceUsageAllowsPayment, type PaymentContext } from "./payment-restrictions";
import { candidateIsEligible, orderPaymentCandidates, type PaymentCandidate } from "./payment-candidates";
export { resourceUsageAllowsPayment, type PaymentContext } from "./payment-restrictions";
import type { GameCardDefinition } from "./schemas";
import type { GameDocument } from "./state";
import { effectiveKeywordAmount } from "./effective-keywords";
import { numericBindingMatchesCardType } from "./numeric-modifiers";
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
  generatedRestrictedEnergy: Record<string, number>;
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

type PaymentRequest = {
  energyCost: number;
  powerCost: number;
  allowedPowerDomains: string[];
  context: PaymentContext;
  additionalAnyPower: number;
  poolOnly?: boolean;
};

export function buildPaymentPlan(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  energyCost: number,
  index: RuntimeCardIndex,
  additionalAnyPower = 0,
  cardInstanceId?: string,
  basePowerOverride?: number,
): PaymentPlan | null {
  return buildPaymentPlanForRequest(game, playerId, definition, index, {
    energyCost,
    powerCost: effectivePowerCost(
      game,
      playerId,
      definition,
      index,
      cardInstanceId,
      undefined,
      basePowerOverride,
    ),
    allowedPowerDomains: definition.card.classification.domain.filter(
      (domain) => domain !== "Colorless",
    ),
    context: { kind: "card", cardType: definition.card.classification.type },
    additionalAnyPower,
  });
}

/** Rule 811.1.b: Hide costs one Power of any domain, payable through the
 * ordinary Power payment sources but under Hide's own resource restrictions. */
export function buildAnyPowerPaymentPlan(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  index: RuntimeCardIndex,
  options: { poolOnly?: boolean } = {},
): PaymentPlan | null {
  const player = game.state.players[playerId]!;
  const domains = anyPowerDomains(player, index);
  return buildPaymentPlanForRequest(game, playerId, definition, index, {
    energyCost: 0,
    powerCost: 1,
    allowedPowerDomains: [...domains],
    context: { kind: "hide" },
    additionalAnyPower: 0,
    poolOnly: options.poolOnly,
  });
}

function anyPowerDomains(player: GameDocument["state"]["players"][string], index: RuntimeCardIndex) {
  return new Set(
    [...index.definitions.values()]
      .flatMap((candidate) => candidate.card.classification.domain)
      .concat(
        Object.keys(player.power),
        ...Object.values(player.restrictedResources?.power ?? {}).map((power) => Object.keys(power)),
      )
      .filter((domain) => domain !== "Colorless"),
  );
}

export function canPayAnyPowerCost(game: GameDocument, playerId: string, definition: GameCardDefinition, index: RuntimeCardIndex) {
  return buildAnyPowerPaymentPlan(game, playerId, definition, index) !== null;
}

export function anyPowerPoolPaymentPreview(game: GameDocument, playerId: string, definition: GameCardDefinition, index: RuntimeCardIndex) {
  const player = game.state.players[playerId]!;
  const powerDomains = [...anyPowerDomains(player, index)];
  const context: PaymentContext = { kind: "hide" };
  const eligiblePower = pooledCandidates(player, powerDomains).filter((candidate) =>
    candidate.kind === "power" && candidateIsEligible(candidate, context, powerDomains));
  return {
    mode: "card" as const,
    energy: 0,
    power: 1,
    powerDomains,
    powerCosts: [{ amount: 1, domains: [] }],
    availableEnergy: 0,
    availablePower: eligiblePower.reduce((total, candidate) => total + candidate.amount, 0),
    canPay: buildAnyPowerPaymentPlan(game, playerId, definition, index, { poolOnly: true }) !== null,
  };
}

export function payAnyPowerCost(game: GameDocument, playerId: string, definition: GameCardDefinition, index: RuntimeCardIndex, options: { poolOnly?: boolean } = {}) {
  const plan = buildAnyPowerPaymentPlan(game, playerId, definition, index, options);
  if (!plan) throw new Error("Any-Power cost cannot be paid.");
  applyPaymentPlan(game, playerId, plan, index);
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
  const eligible = pooledCandidates(player, powerDomains).filter((candidate) =>
    candidateIsEligible(candidate, context, powerDomains));
  const availableEnergy = eligible.filter((candidate) => candidate.kind === "energy")
    .reduce((sum, candidate) => sum + candidate.amount, 0);
  const availablePower = eligible.filter((candidate) => candidate.kind === "power")
    .reduce((sum, candidate) => sum + candidate.amount, 0);
  return {
    ...costs,
    powerDomains,
    availableEnergy,
    availablePower,
    canPay: buildAbilityPaymentPlan(game, playerId, sourceDefinition, costs, index, { poolOnly: true }) !== null,
  };
}

function emptyPaymentPlan(): PaymentPlan {
  return {
    conditionalEnergy: 0, restrictedEnergy: {}, pooledEnergy: 0,
    energySourceIds: [], generatedConditionalEnergy: 0, generatedPooledEnergy: 0,
    generatedRestrictedEnergy: {}, powerFromPool: {}, restrictedPower: {},
    powerSourceUses: [], generatedRestrictedPower: {}, generatedPooledPower: {}, powerRuneIds: [],
  };
}

function pooledCandidates(player: GameDocument["state"]["players"][string], domains: readonly string[]): PaymentCandidate[] {
  const candidates: PaymentCandidate[] = [];
  const add = (kind: PaymentCandidate["kind"], usage: string, amount: number, pool: PaymentCandidate["pool"], domain?: string) => {
    candidates.push({ kind, usage, amount, pool, domain, acquisition: "pool",
      restriction: normalizeResourceRestriction(usage), order: candidates.length });
  };
  add("energy", "spellsOnly", player.conditionalEnergy, "conditional");
  for (const [usage, amount] of Object.entries(player.restrictedResources?.energy ?? {})) add("energy", usage, amount, "restricted");
  add("energy", "unrestricted", player.energy, "ordinary");
  const addPower = (usage: string, power: Record<string, number>, pool: PaymentCandidate["pool"]) => {
    for (const domain of new Set([...domains, ...Object.keys(power)])) add("power", usage, power[domain] ?? 0, pool, domain);
  };
  for (const [usage, power] of Object.entries(player.restrictedResources?.power ?? {})) addPower(usage, power, "restricted");
  addPower("unrestricted", player.power, "ordinary");
  return candidates;
}

function recordPoolSpend(plan: PaymentPlan, source: PaymentCandidate, amount: number) {
  if (source.kind === "energy") {
    if (source.pool === "conditional") plan.conditionalEnergy += amount;
    else if (source.pool === "ordinary") plan.pooledEnergy += amount;
    else plan.restrictedEnergy[source.usage] = (plan.restrictedEnergy[source.usage] ?? 0) + amount;
  } else if (source.pool === "ordinary") {
    plan.powerFromPool[source.domain!] = (plan.powerFromPool[source.domain!] ?? 0) + amount;
  } else {
    const power = plan.restrictedPower[source.usage] ??= {};
    power[source.domain!] = (power[source.domain!] ?? 0) + amount;
  }
}

function poolSpent(plan: PaymentPlan, source: PaymentCandidate) {
  if (source.kind === "energy") {
    return source.pool === "conditional" ? plan.conditionalEnergy : source.pool === "ordinary"
      ? plan.pooledEnergy : plan.restrictedEnergy[source.usage] ?? 0;
  }
  return source.pool === "ordinary" ? plan.powerFromPool[source.domain!] ?? 0
    : plan.restrictedPower[source.usage]?.[source.domain!] ?? 0;
}

function recordGeneratedSpend(plan: PaymentPlan, source: PaymentCandidate, spend: number) {
  const unused = source.amount - spend;
  if (source.kind === "energy") {
    plan.energySourceIds.push(source.sourceId!);
    // These are storage destinations, not eligibility or priority decisions.
    if (source.usage === "unrestricted") plan.generatedPooledEnergy += unused;
    else if (source.usage === "spellsOnly") plan.generatedConditionalEnergy += unused;
    else if (unused > 0) plan.generatedRestrictedEnergy[source.usage] = (plan.generatedRestrictedEnergy[source.usage] ?? 0) + unused;
  } else {
    if (source.acquisition === "recycle") plan.powerRuneIds.push(source.sourceId!);
    else plan.powerSourceUses.push({ id: source.sourceId!, amount: source.amount, usage: source.usage, domain: source.domain! });
    if (unused > 0) {
      const power = source.usage === "unrestricted" ? plan.generatedPooledPower
        : plan.generatedRestrictedPower[source.usage] ??= {};
      power[source.domain!] = (power[source.domain!] ?? 0) + unused;
    }
  }
}

function buildPaymentPlanForRequest(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  index: RuntimeCardIndex,
  request: PaymentRequest,
): PaymentPlan | null {
  const player = game.state.players[playerId]!;
  const plan = emptyPaymentPlan();
  const pool = pooledCandidates(player, request.allowedPowerDomains);
  const sourceIds = request.poolOnly ? [] : paymentResourceSourceIds(game, playerId, index);
  const generated: PaymentCandidate[] = [];
  for (const id of sourceIds) {
    if (game.state.cardStates[id]?.exhausted) continue;
    for (const kind of ["energy", "power"] as const) {
      const ability = kind === "energy" ? exhaustForEnergyAbility(id, request.context, index) : exhaustForPowerAbility(id, request.context, index);
      if (!ability) continue;
      generated.push({ ...ability, kind, sourceId: id, acquisition: "exhaust",
        restriction: normalizeResourceRestriction(ability.usage), order: generated.length });
    }
  }
  const energy = orderPaymentCandidates([...pool, ...generated].filter((source) =>
    source.kind === "energy" && candidateIsEligible(source, request.context)));
  let remainingEnergy = request.energyCost;
  for (const source of energy.filter((candidate) => candidate.acquisition === "pool")) {
    const spend = Math.min(source.amount, remainingEnergy);
    if (spend > 0) recordPoolSpend(plan, source, spend);
    remainingEnergy -= spend;
  }

  const finishPower = (energyPlan: PaymentPlan): PaymentPlan | null => {
    const result = structuredClone(energyPlan);
    const candidates = [...pool, ...generated].filter((source) => source.kind === "power" &&
      !result.energySourceIds.includes(source.sourceId!));
    if (!request.poolOnly) for (const id of player.zones.base) {
      if (!hasAbility(id, "ability.recycle_for_power", index) || game.state.cardStates[id]?.attachedToCardInstanceId) continue;
      const domain = definitionForInstance(id, index).card.classification.domain[0];
      candidates.push({ kind: "power", amount: 1, usage: "unrestricted", restriction: {}, domain,
        sourceId: id, acquisition: "recycle", order: pool.length + generated.length + candidates.length,
        runeState: game.state.cardStates[id]?.exhausted ? "exhausted" : result.energySourceIds.includes(id) ? "exhausted-by-plan" : "ready" });
    }
    let remainingPower = request.powerCost;
    for (const source of orderPaymentCandidates(candidates.filter((candidate) => candidateIsEligible(candidate, request.context, request.allowedPowerDomains)))) {
      if (remainingPower === 0) break;
      const spend = Math.min(source.amount, remainingPower);
      if (source.acquisition === "pool") recordPoolSpend(result, source, spend);
      else recordGeneratedSpend(result, source, spend);
      remainingPower -= spend;
    }
    if (remainingPower > 0) return null;
    // Deflect still requires manually prepared Power, not automatic Add/recycle.
    let remainingAnyPower = request.additionalAnyPower;
    for (const source of orderPaymentCandidates(pool.filter((candidate) => candidate.kind === "power" && candidateIsEligible(candidate, request.context)))) {
      const spend = Math.min(source.amount - poolSpent(result, source), remainingAnyPower);
      if (spend > 0) recordPoolSpend(result, source, spend);
      remainingAnyPower -= spend;
    }
    return remainingAnyPower > 0 ? null : result;
  };

  const energySources = energy.filter((candidate) => candidate.acquisition !== "pool");
  // Prefer the semantic order, but only accept an Energy allocation that also
  // completes Power without sacrificing a ready Rune. Search only this plan's
  // Energy sources; this is not a global card/resource optimizer.
  const chooseEnergy = (position: number, remaining: number, current: PaymentPlan): PaymentPlan | null => {
    if (remaining === 0) return finishPower(current);
    if (energySources.slice(position).reduce((sum, source) => sum + source.amount, 0) < remaining) return null;
    for (let next = position; next < energySources.length; next++) {
      const source = energySources[next]!;
      const selected = structuredClone(current);
      const spend = Math.min(source.amount, remaining);
      recordGeneratedSpend(selected, source, spend);
      const complete = chooseEnergy(next + 1, remaining - spend, selected);
      if (complete) return complete;
    }
    return null;
  };
  return chooseEnergy(0, remainingEnergy, plan);
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
  basePowerOverride?: number,
) {
  return cardPaymentPlans(game, playerId, definition, energyCost, index,
    additionalAnyPower, additionalCosts, cardInstanceId, basePowerOverride) !== null;
}

/** A necessary capacity check, never a payment plan or a proof of legality.
 * Count every resource alternative independently, including manually recycled
 * ready Runes. Ignoring activation costs/timing and conflicting alternatives
 * deliberately overestimates supply: only a shortage can prune preparation. */
export function cardPaymentExceedsResourceCapacity(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  index: RuntimeCardIndex,
  energyCost: number,
  additionalCosts: readonly AdditionalCardCost[],
  cardInstanceId: string,
  basePowerOverride?: number,
) {
  const context: PaymentContext = { kind: "card", cardType: definition.card.classification.type };
  const domains = definition.card.classification.domain.filter((domain) => domain !== "Colorless");
  const sources = new Set(paymentResourceSourceIds(game, playerId, index));
  // Only cards whose state or attachment can change through the acting
  // player's supported Add actions can change a continuous cost modifier.
  // Keep attached descendants conservative: removing their Top-Most resource
  // source detaches them and may end a whileAttached modifier.
  const mutableSourceIds = new Set([...sources].filter((id) =>
    definitionForInstance(id, index).behaviorModel.clauses.some((clause) =>
      clause.abilities.some((ability) =>
        ability.behaviorId === "ability.exhaust_for_resource" ||
        ability.behaviorId === "ability.recycle_for_power"))));
  let addedAttachedSource = true;
  while (addedAttachedSource) {
    addedAttachedSource = false;
    for (const [id, state] of Object.entries(game.state.cardStates)) {
      if (!state.attachedToCardInstanceId ||
        !mutableSourceIds.has(state.attachedToCardInstanceId) ||
        mutableSourceIds.has(id)) continue;
      mutableSourceIds.add(id);
      addedAttachedSource = true;
    }
  }
  // Add can remove a reachable continuous modifier or change its condition.
  // Optional resource commitments are fixed by the selected play mode.
  const mutableDefinitions = [...mutableSourceIds].map((id) => definitionForInstance(id, index));
  const mutableCost = (attribute: string) => game.state.modifiers.some((modifier) =>
    modifier.attribute === attribute &&
    modifier.sourceCardInstanceId !== null &&
    mutableSourceIds.has(modifier.sourceCardInstanceId)) ||
    mutableDefinitions.some((card) => [card.behaviorModel, card.effectBehaviorModel].some((model) =>
      model?.clauses.some((clause) => clause.effects.some((effect) => effect.parameters.attribute === attribute &&
        numericBindingMatchesCardType(effect, {
          cardType: definition.card.classification.type, targetScope: "controller_spell",
          targetCardInstanceId: cardInstanceId, index,
        })))));
  const minimumEnergy = (mutableCost("energyCost") ? 0 : energyCost) + additionalCosts.reduce((sum, cost) => sum + cost.energy, 0);
  const powerCosts = [
    { amount: mutableCost("powerCost") ? 0 : effectivePowerCost(game, playerId, definition, index, cardInstanceId, undefined, basePowerOverride), domains },
    ...additionalCosts.map((cost) => ({ amount: cost.power, domains: cost.powerDomain ? [normalizedDomain(cost.powerDomain)] : domains })),
  ].filter((cost) => cost.amount > 0);
  const capacity = pooledCandidates(game.state.players[playerId]!, []);
  const add = (kind: PaymentCandidate["kind"], amount: number, usage: string, domain?: string) => {
    capacity.push({ kind, amount, usage, domain, restriction: normalizeResourceRestriction(usage), acquisition: "pool", order: capacity.length });
  };
  // Removing a host can expose an attached resource source. Count it too,
  // regardless of whether a legal preparation sequence actually exposes it.
  for (const [id, state] of Object.entries(game.state.cardStates)) {
    if (state.attachedToCardInstanceId && index.instances.get(id)?.ownerPlayerId === playerId) sources.add(id);
  }
  for (const id of sources) {
    const source = definitionForInstance(id, index);
    for (const ability of source.behaviorModel.clauses.flatMap((clause) => clause.abilities)) {
      if (ability.behaviorId === "ability.recycle_for_power") {
        add("power", 1, "unrestricted", source.card.classification.domain[0] ?? "Rainbow");
      }
      if (ability.behaviorId !== "ability.exhaust_for_resource" || game.state.cardStates[id]?.exhausted) continue;
      const { amount, usage, resourceType, domain, poolResource } = ability.parameters;
      if (typeof amount !== "number" || amount <= 0 || typeof usage !== "string") continue;
      if (resourceType !== "power") add("energy", amount, usage);
      else {
        const producedDomain = domain === "sourceDomain"
          ? source.card.classification.domain.find((value) => value !== "Colorless") ?? "Rainbow"
          : typeof domain === "string" ? domain.slice(0, 1).toUpperCase() + domain.slice(1) : "Rainbow";
        add("power", amount, poolResource === true ? "unrestricted" : usage, producedDomain);
        // The automatic planner normalizes domain casing; counting its form
        // too keeps this an upper bound for both manual and automatic paths.
        if (normalizedDomain(producedDomain) !== producedDomain) add("power", amount, usage, normalizedDomain(producedDomain));
      }
    }
  }
  const available = (kind: PaymentCandidate["kind"], allowedDomains?: readonly string[]) => capacity
    .filter((candidate) => candidate.kind === kind && candidateIsEligible(candidate, context, allowedDomains))
    .reduce((sum, candidate) => sum + candidate.amount, 0);
  return available("energy") < minimumEnergy ||
    powerCosts.some((cost) => available("power", cost.domains) < cost.amount) ||
    available("power", [...new Set(powerCosts.flatMap((cost) => cost.domains))]) < powerCosts.reduce((sum, cost) => sum + cost.amount, 0);
}

/** Card preparation reports ordinary safe-plan readiness, never pool-only
 * readiness. Each optional Power cost keeps its own domain requirement. */
export function cardPaymentPreview(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  energyCost: number,
  index: RuntimeCardIndex,
  additionalCosts: readonly AdditionalCardCost[],
  cardInstanceId: string,
  basePowerOverride?: number,
) {
  const domains = definition.card.classification.domain.filter((domain) => domain !== "Colorless");
  const powerCosts = [
    { amount: effectivePowerCost(game, playerId, definition, index, cardInstanceId, undefined, basePowerOverride), domains },
    ...additionalCosts.map((cost) => ({ amount: cost.power, domains: cost.powerDomain ? [normalizedDomain(cost.powerDomain)] : domains })),
  ].filter((cost) => cost.amount > 0);
  const powerDomains = [...new Set(powerCosts.flatMap((cost) => cost.domains))];
  const eligible = pooledCandidates(game.state.players[playerId]!, powerDomains).filter((candidate) =>
    candidateIsEligible(candidate, { kind: "card", cardType: definition.card.classification.type }, powerDomains));
  const canPay = canPayCardCosts(game, playerId, definition, energyCost, index, 0, additionalCosts, cardInstanceId, basePowerOverride);
  let availableAnyPower = 0;
  let upper = pooledCandidates(game.state.players[playerId]!, []).filter((candidate) => candidate.kind === "power" &&
    candidateIsEligible(candidate, { kind: "card", cardType: definition.card.classification.type }))
    .reduce((sum, candidate) => sum + candidate.amount, 0);
  // Evaluate the whole chosen optional-cost commitment, not just its base cost,
  // before advertising how much additional target Power can safely be paid.
  if (canPay) while (availableAnyPower < upper) {
    const amount = Math.ceil((availableAnyPower + upper) / 2);
    if (canPayCardCosts(game, playerId, definition, energyCost, index, amount, additionalCosts, cardInstanceId, basePowerOverride)) availableAnyPower = amount;
    else upper = amount - 1;
  }
  return {
    availableAnyPower,
    mode: "card" as const,
    energy: energyCost + additionalCosts.reduce((sum, cost) => sum + cost.energy, 0),
    power: powerCosts.reduce((sum, cost) => sum + cost.amount, 0),
    powerDomains,
    powerCosts,
    availableEnergy: eligible.filter((candidate) => candidate.kind === "energy").reduce((sum, candidate) => sum + candidate.amount, 0),
    availablePower: eligible.filter((candidate) => candidate.kind === "power").reduce((sum, candidate) => sum + candidate.amount, 0),
    canPay,
  };
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
  basePowerOverride?: number,
): PaymentPlan[] | null {
  const preview = structuredClone(game);
  const plans: PaymentPlan[] = [];
  try {
    const base = buildPaymentPlan(preview, playerId, definition, energyCost, index,
      additionalAnyPower, cardInstanceId, basePowerOverride);
    if (!base) return null;
    plans.push(base);
    applyPaymentPlan(preview, playerId, base, index);
    for (const cost of additionalCosts) {
      const plan = buildPaymentPlanForRequest(preview, playerId, definition, index, {
        energyCost: cost.energy, powerCost: cost.power,
        allowedPowerDomains: cost.powerDomain ? [normalizedDomain(cost.powerDomain)]
          : definition.card.classification.domain.filter((domain) => domain !== "Colorless"),
        context: { kind: "card", cardType: definition.card.classification.type },
        additionalAnyPower: 0,
      });
      if (!plan) return null;
      plans.push(plan);
      applyPaymentPlan(preview, playerId, plan, index);
    }
    return plans;
  } catch {
    return null;
  }
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
  basePowerOverride?: number,
) {
  const plans = cardPaymentPlans(game, playerId, definition, energyCost, index,
    additionalAnyPower, additionalCosts, cardInstanceId, basePowerOverride);
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
  for (const [usage, amount] of Object.entries(plan.generatedRestrictedEnergy)) {
    player.restrictedResources ??= { energy: {}, power: {} };
    player.restrictedResources.energy[usage] = (player.restrictedResources.energy[usage] ?? 0) + amount;
  }
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

export function availableAnyPowerAfterBaseCost(
  game: GameDocument,
  playerId: string,
  plan: PaymentPlan,
  context: PaymentContext,
) {
  const player = game.state.players[playerId]!;
  return pooledCandidates(player, []).filter((candidate) => candidate.kind === "power" &&
    candidateIsEligible(candidate, context)).reduce((total, candidate) =>
    total + Math.max(0, candidate.amount - poolSpent(plan, candidate)), 0);
}

export function targetDeflectCost(
  playerId: string,
  selectedIds: readonly string[],
  index: RuntimeCardIndex,
  game: GameDocument,
  ignoreDeflect = false,
) {
  if (ignoreDeflect) return 0;
  return selectedIds.reduce((total, id) => {
    const instance = index.instances.get(id);
    if (!instance || instance.ownerPlayerId === playerId) return total;
    const amount = effectiveKeywordAmount(game, id, "keyword.deflect", index);
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
