import type { GameCardDefinition } from "./schemas";
import type { GameDocument } from "./state";
import {
  definitionForInstance,
  type RuntimeCardIndex,
} from "./primitive-handlers";

export type PaymentPlan = {
  conditionalEnergy: number;
  pooledEnergy: number;
  energySourceIds: string[];
  generatedConditionalEnergy: number;
  generatedPooledEnergy: number;
  powerFromPool: Record<string, number>;
  powerRuneIds: string[];
};

export function buildPaymentPlan(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  energyCost: number,
  index: RuntimeCardIndex,
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
  let remainingPower = definition.card.attributes.power ?? 0;
  const allowedDomains = definition.card.classification.domain.filter(
    (domain) => domain !== "Colorless",
  );
  if (remainingPower > 0 && allowedDomains.length === 0) return null;
  const powerFromPool: Record<string, number> = {};
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
) {
  const plan = buildPaymentPlan(
    game,
    playerId,
    definition,
    energyCost,
    index,
  );
  if (!plan) throw new Error("Card costs cannot be paid.");
  const player = game.state.players[playerId]!;
  player.conditionalEnergy -= plan.conditionalEnergy;
  player.energy -= plan.pooledEnergy;
  player.conditionalEnergy += plan.generatedConditionalEnergy;
  player.energy += plan.generatedPooledEnergy;
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
