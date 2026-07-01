import type { ProjectedAction } from "../../shared/game-v2";
import {
  compileBehaviorModelV2,
  createBehaviorContext,
  executeBehaviorClauseV2,
  submitTriggerOrderV2,
  targetRequirementsForClauseV2
} from "./behavior-runtime";
import {
  cleanupTurnModifiersV2,
  createPrimitiveHandlersV2,
  createRuntimeCardIndexV2,
  definitionForInstanceV2,
  effectiveEnergyCostV2,
  type RuntimeCardIndexV2
} from "./primitive-handlers";
import { dispatchBehaviorEventV2, resolveDelayedEffectsV2 } from "./triggers";
import type { DeckSnapshotDocumentV2 } from "./repositories";
import type { GameCardDefinition } from "./schemas";
import type { GameDocumentV2 } from "./state";

export function gameplayActionsV2(
  game: GameDocumentV2,
  actorPlayerId: string,
  decks: readonly DeckSnapshotDocumentV2[]
): ProjectedAction[] {
  if (game.status !== "in_progress") return [];
  const index = createRuntimeCardIndexV2(decks);
  const handlers = createPrimitiveHandlersV2(index);
  const player = game.state.players[actorPlayerId];
  if (!player) return [];
  const actions: ProjectedAction[] = [];
  if (game.state.pendingChoice) {
    if (game.state.pendingChoice.playerId !== actorPlayerId) return [];
    for (const order of permutations(game.state.pendingChoice.optionIds)) {
      const labels = order.map((id) => game.state.pendingChoice!.pendingItems.find((item) => item.id === id)?.label ?? id);
      actions.push(action(game, "orderTriggers", `Resolve ${labels.join(" → ")}`, null, true, null, JSON.stringify(order)));
    }
    return actions;
  }
  const hasPriority = game.state.chain
    ? game.state.chain.priorityPlayerId === actorPlayerId
    : game.state.showdown
      ? game.state.showdown.priorityPlayerId === actorPlayerId
      : game.state.turn?.activePlayerId === actorPlayerId;

  if (game.state.chain || game.state.showdown) {
    if (hasPriority) actions.push(action(game, "pass", "Pass priority", null));
    if (hasPriority && game.state.chain) {
      addPlayableCardActions(actions, game, actorPlayerId, decks, index, true);
      addAbilityActions(actions, game, actorPlayerId, index, handlers);
    }
    return actions;
  }
  if (!hasPriority) return actions;

  actions.push(action(game, "endTurn", "End turn", null));

  addPlayableCardActions(actions, game, actorPlayerId, decks, index, false);
  addAbilityActions(actions, game, actorPlayerId, index, handlers);
  for (const cardId of player.zones.base) {
    const definition = definitionForInstanceV2(cardId, index);
    const state = game.state.cardStates[cardId]!;
    if (definition.card.classification.type === "Unit" && !state.exhausted) {
      for (const battlefield of game.state.battlefields.filter((candidate) => candidate.units.length === 0)) {
        actions.push(action(game, "move", `Move to ${definitionForInstanceV2(battlefield.cardInstanceId, index).card.name}`, cardId, true, null, battlefield.battlefieldId));
      }
    }
  }
  return actions;
}

export function performGameplayActionV2(input: {
  game: GameDocumentV2; actorPlayerId: string; actionId: string;
  selectedIds: string[]; decks: readonly DeckSnapshotDocumentV2[]; now: string;
}): GameDocumentV2 {
  const legal = gameplayActionsV2(input.game, input.actorPlayerId, input.decks);
  const projected = legal.find((candidate) => candidate.id === input.actionId);
  if (!projected || !projected.enabled) throw new Error("Action is not legal for the current game state.");
  validateActionTargets(projected, input.selectedIds);
  const game = structuredClone(input.game);
  const index = createRuntimeCardIndexV2(input.decks);
  const handlers = createPrimitiveHandlersV2(index);
  const [, , , kind, encodedSource, encodedExtra] = input.actionId.split(":");
  const source = encodedSource && encodedSource !== "_" ? decodeURIComponent(encodedSource) : "";
  const extra = encodedExtra ? decodeURIComponent(encodedExtra) : "";
  const player = game.state.players[input.actorPlayerId]!;

  switch (kind) {
    case "play":
      playCard(game, input.actorPlayerId, source, input.selectedIds, index, handlers, input.decks);
      break;
    case "orderTriggers":
      submitTriggerOrderV2(game, input.actorPlayerId, JSON.parse(extra) as string[]);
      break;
    case "activate": {
      const [clauseId, behaviorId] = extra.split("|");
      const definition = definitionForInstanceV2(source, index);
      const clause = definition.behaviorModel.clauses.find((item) => item.id === clauseId);
      const binding = clause?.abilities.find((item) => item.behaviorId === behaviorId);
      if (!binding) throw new Error("Activated ability is unavailable.");
      const handler = handlers.get(binding.behaviorId);
      if (!handler?.execute) throw new Error(`Behavior handler cannot execute: ${binding.behaviorId}`);
      handler.execute(binding, createBehaviorContext(game, input.actorPlayerId, source, null, input.selectedIds));
      break;
    }
    case "move": {
      const cardId = source;
      const battlefieldId = extra;
      player.zones.base = player.zones.base.filter((id) => id !== cardId);
      const battlefield = game.state.battlefields.find((item) => item.battlefieldId === battlefieldId);
      if (!battlefield) throw new Error("Battlefield is unavailable.");
      if (battlefield.units.length > 0) throw new Error("Only movement to an empty battlefield is supported.");
      battlefield.units.push(cardId);
      game.state.cardStates[cardId]!.exhausted = true;
      game.state.showdown = { battlefieldId, priorityPlayerId: input.actorPlayerId, passedPlayerIds: [] };
      break;
    }
    case "pass":
      passPriority(game, input.actorPlayerId, index, handlers, input.decks);
      break;
    case "endTurn":
      endTurn(game, input.actorPlayerId, index, input.decks);
      break;
    default:
      throw new Error("Action kind is not implemented.");
  }
  game.stateVersion += 1;
  game.updatedAt = input.now;
  return game;
}

function playCard(game: GameDocumentV2, playerId: string, cardId: string, selectedIds: string[], index: RuntimeCardIndexV2, handlers: ReturnType<typeof createPrimitiveHandlersV2>, decks: readonly DeckSnapshotDocumentV2[]) {
  const player = game.state.players[playerId]!;
  const definition = definitionForInstanceV2(cardId, index);
  const effectiveEnergyCost = effectiveEnergyCostV2(game, playerId, definition);
  pay(game, playerId, definition, effectiveEnergyCost, index);
  player.zones.hand = player.zones.hand.filter((id) => id !== cardId);
  if (player.zones.champion === cardId) player.zones.champion = null;
  if (definition.card.classification.type === "Unit") {
    player.zones.base.push(cardId);
    game.state.cardStates[cardId]!.exhausted = true;
    executeImmediateClauses(game, definition, playerId, cardId, selectedIds, handlers);
    dispatchBehaviorEventV2(game, {
      type: "card.played", actorPlayerId: playerId, subjectCardInstanceId: cardId,
      values: { "eventSubject.effectiveEnergyCost": effectiveEnergyCost }
    }, decks);
    return;
  }
  const item = { id: `chain:${game.stateVersion + 1}:${cardId}`, label: definition.card.name, controllerPlayerId: playerId, sourceCardInstanceId: cardId, targetCardInstanceIds: selectedIds, behaviorClauseId: null, behaviorEvent: null };
  if (game.state.chain) {
    game.state.chain.items.push(item);
    game.state.chain.priorityPlayerId = playerId;
    game.state.chain.passedPlayerIds = [];
  } else {
    game.state.chain = { items: [item], priorityPlayerId: playerId, passedPlayerIds: [] };
  }
}

function passPriority(game: GameDocumentV2, actor: string, index: RuntimeCardIndexV2, handlers: ReturnType<typeof createPrimitiveHandlersV2>, decks: readonly DeckSnapshotDocumentV2[]) {
  if (game.state.chain) {
    const passed = [...new Set([...game.state.chain.passedPlayerIds, actor])];
    if (passed.length === 2) {
      const item = game.state.chain.items.pop();
      if (item?.sourceCardInstanceId) {
        const owner = index.instances.get(item.sourceCardInstanceId)!.ownerPlayerId;
        const definition = definitionForInstanceV2(item.sourceCardInstanceId, index);
        if (item.behaviorClauseId) {
          const compiled = compileBehaviorModelV2(definition.behaviorModel, handlers);
          const clause = compiled.clauses.find((candidate) => candidate.id === item.behaviorClauseId);
          if (clause) executeBehaviorClauseV2({ clause, context: createBehaviorContext(game, owner, item.sourceCardInstanceId, item.behaviorEvent, item.targetCardInstanceIds), handlers });
        } else {
          executeImmediateClauses(game, definition, owner, item.sourceCardInstanceId, item.targetCardInstanceIds, handlers);
          if (definition.card.classification.type === "Spell") {
            game.state.players[owner]!.zones.trash.push(item.sourceCardInstanceId);
            dispatchBehaviorEventV2(game, {
              type: "card.played", actorPlayerId: owner, subjectCardInstanceId: item.sourceCardInstanceId,
              values: { "eventSubject.effectiveEnergyCost": effectiveEnergyCostV2(game, owner, definition) }
            }, decks);
          }
        }
      }
      game.state.chain = game.state.chain.items.length
        ? { ...game.state.chain, priorityPlayerId: item?.controllerPlayerId ?? actor, passedPlayerIds: [] }
        : null;
    } else {
      game.state.chain.passedPlayerIds = passed;
      game.state.chain.priorityPlayerId = otherPlayer(game, actor);
    }
    return;
  }
  if (game.state.showdown) {
    const passed = [...new Set([...game.state.showdown.passedPlayerIds, actor])];
    if (passed.length === 2) game.state.showdown = null;
    else {
      game.state.showdown.passedPlayerIds = passed;
      game.state.showdown.priorityPlayerId = otherPlayer(game, actor);
    }
  }
}

function endTurn(game: GameDocumentV2, actor: string, index: RuntimeCardIndexV2, decks: readonly DeckSnapshotDocumentV2[]) {
  if (game.state.turn?.activePlayerId !== actor) throw new Error("Only the active player can end the turn.");
  const next = otherPlayer(game, actor);
  resolveDelayedEffectsV2(game, "endOfThisTurn", decks);
  cleanupTurnModifiersV2(game, index);
  game.state.turn = { turnNumber: game.state.turn.turnNumber + 1, activePlayerId: next, phase: "action" };
  applyStartOfTurnV2(game);
}

export function applyStartOfTurnV2(game: GameDocumentV2) {
  const turn = game.state.turn;
  if (!turn) throw new Error("A turn is required to apply start-of-turn steps.");
  for (const candidate of Object.values(game.state.players)) {
    candidate.energy = 0;
    candidate.power = {};
    candidate.conditionalEnergy = 0;
  }
  for (const state of Object.values(game.state.cardStates)) state.damage = 0;
  const player = game.state.players[turn.activePlayerId]!;
  for (const cardId of [...player.zones.base, ...game.state.battlefields.flatMap((battlefield) => battlefield.units)]) {
    if (game.state.cardStates[cardId]) game.state.cardStates[cardId]!.exhausted = false;
  }
  const isNonStartingPlayersFirstTurn = turn.turnNumber === 2 && turn.activePlayerId !== game.state.setup.startingPlayerId;
  draw(player.zones.runeDeck, player.zones.base, isNonStartingPlayersFirstTurn ? 3 : 2);
  draw(player.zones.mainDeck, player.zones.hand, 1);
}

function action(game: GameDocumentV2, kind: string, label: string, source: string | null, enabled = true, disabledReason: string | null = null, extra?: string, targets: ProjectedAction["targets"] = []): ProjectedAction {
  const parts = ["v2", String(game.stateVersion), "game", kind, source === null ? "_" : encodeURIComponent(source)];
  if (extra !== undefined) parts.push(encodeURIComponent(extra));
  const surface = kind === "orderTriggers"
    ? "choice-dialog"
    : source
      ? "card-menu"
      : "action-rail";
  return {
    id: parts.join(":"), label, sourceCardInstanceId: source, enabled, disabledReason, targets,
    presentation: {
      surface,
      style: kind === "endTurn" || kind === "pass" ? "secondary" : "primary",
      prompt: kind === "orderTriggers" ? "Choose the order for triggered abilities." : null
    }
  };
}
type PaymentPlanV2 = {
  conditionalEnergy: number;
  pooledEnergy: number;
  energySourceIds: string[];
  generatedConditionalEnergy: number;
  generatedPooledEnergy: number;
  powerFromPool: Record<string, number>;
  powerRuneIds: string[];
};

function buildPaymentPlanV2(game: GameDocumentV2, playerId: string, definition: GameCardDefinition, energyCost: number, index: RuntimeCardIndexV2): PaymentPlanV2 | null {
  const player = game.state.players[playerId]!;
  let remainingEnergy = energyCost;
  const conditionalEnergy = definition.card.classification.type === "Spell" ? Math.min(player.conditionalEnergy, remainingEnergy) : 0;
  remainingEnergy -= conditionalEnergy;
  const pooledEnergy = Math.min(player.energy, remainingEnergy);
  remainingEnergy -= pooledEnergy;
  let remainingPower = definition.card.attributes.power ?? 0;
  const allowedDomains = definition.card.classification.domain.filter((domain) => domain !== "Colorless");
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
    const runeDomain = definitionForInstanceV2(id, index).card.classification.domain[0];
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
      index
    );
    if (!ability) return;
    energySourceIds.push(id);
    const unusedEnergy = Math.max(0, ability.amount - remainingEnergy);
    remainingEnergy = Math.max(0, remainingEnergy - ability.amount);
    if (ability.usage === "spellsOnly") generatedConditionalEnergy += unusedEnergy;
    else generatedPooledEnergy += unusedEnergy;
  };
  powerRuneIds.forEach(consumeEnergySource);
  player.zones.base.forEach(consumeEnergySource);
  if (remainingEnergy > 0) return null;

  return remainingPower === 0 ? {
    conditionalEnergy,
    pooledEnergy,
    energySourceIds,
    generatedConditionalEnergy,
    generatedPooledEnergy,
    powerFromPool,
    powerRuneIds
  } : null;
}

function pay(game: GameDocumentV2, playerId: string, definition: GameCardDefinition, energyCost: number, index: RuntimeCardIndexV2) {
  const plan = buildPaymentPlanV2(game, playerId, definition, energyCost, index);
  if (!plan) throw new Error("Card costs cannot be paid.");
  const player = game.state.players[playerId]!;
  player.conditionalEnergy -= plan.conditionalEnergy;
  player.energy -= plan.pooledEnergy;
  player.conditionalEnergy += plan.generatedConditionalEnergy;
  player.energy += plan.generatedPooledEnergy;
  plan.energySourceIds.forEach((id) => { game.state.cardStates[id]!.exhausted = true; });
  for (const [domain, amount] of Object.entries(plan.powerFromPool)) player.power[domain] = (player.power[domain] ?? 0) - amount;
  for (const id of plan.powerRuneIds) {
    player.zones.base = player.zones.base.filter((candidate) => candidate !== id);
    player.zones.runeDeck.push(id);
    const state = game.state.cardStates[id];
    if (state) {
      state.damage = 0;
      state.exhausted = false;
    }
  }
}

function hasAbility(id: string, behaviorId: string, index: RuntimeCardIndexV2) {
  return definitionForInstanceV2(id, index).behaviorModel.clauses.some((clause) => clause.abilities.some((ability) => ability.behaviorId === behaviorId));
}

function exhaustForEnergyAbility(
  id: string,
  cardType: string,
  index: RuntimeCardIndexV2
): { amount: number; usage: string } | null {
  for (const clause of definitionForInstanceV2(id, index).behaviorModel.clauses) {
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
function addPlayableCardActions(
  actions: ProjectedAction[], game: GameDocumentV2, playerId: string,
  decks: readonly DeckSnapshotDocumentV2[], index: RuntimeCardIndexV2,
  reactionOnly: boolean
) {
  const player = game.state.players[playerId]!;
  const handlers = createPrimitiveHandlersV2(index);
  for (const cardId of [...player.zones.hand, ...(player.zones.champion ? [player.zones.champion] : [])]) {
    const definition = definitionForInstanceV2(cardId, index);
    if (!["Unit", "Spell"].includes(definition.card.classification.type)) continue;
    const compiled = compileBehaviorModelV2(definition.behaviorModel, handlers);
    const timings = compiled.playTimings.map((binding) => binding.behaviorId);
    if (reactionOnly && !timings.includes("timing.reaction")) continue;
    if (!reactionOnly && game.state.chain && !timings.includes("timing.reaction")) continue;
    const cost = effectiveEnergyCostV2(game, playerId, definition);
    if (!buildPaymentPlanV2(game, playerId, definition, cost, index)) continue;
    const context = createBehaviorContext(game, playerId, cardId, null, []);
    const targets = compiled.clauses
      .filter((clause) => clause.triggers.length === 0)
      .flatMap((clause) => targetRequirementsForClauseV2(clause, context, handlers));
    if (!canSatisfyTargetRequirements(targets)) continue;
    actions.push(action(game, "play", `Play ${definition.card.name}`, cardId, true, null, undefined, targets));
  }
  void decks;
}

function canSatisfyTargetRequirements(
  requirements: ProjectedAction["targets"]
): boolean {
  if (
    requirements.some(
      (requirement) =>
        new Set(requirement.legalIds).size < requirement.minimum
    )
  ) {
    return false;
  }
  const minimumSelections = requirements.reduce(
    (total, requirement) => total + requirement.minimum,
    0
  );
  const legalSelections = new Set(
    requirements.flatMap((requirement) => requirement.legalIds)
  );
  return legalSelections.size >= minimumSelections;
}

function addAbilityActions(
  actions: ProjectedAction[], game: GameDocumentV2, playerId: string,
  index: RuntimeCardIndexV2, handlers: ReturnType<typeof createPrimitiveHandlersV2>
) {
  const player = game.state.players[playerId]!;
  const controlled = [
    ...player.zones.base,
    ...(player.zones.legend ? [player.zones.legend] : []),
    ...game.state.battlefields.flatMap((battlefield) => battlefield.units.filter((id) => index.instances.get(id)?.ownerPlayerId === playerId))
  ];
  for (const sourceId of controlled) {
    const definition = definitionForInstanceV2(sourceId, index);
    const compiled = compileBehaviorModelV2(definition.behaviorModel, handlers);
    for (const clause of compiled.clauses) {
      for (const ability of clause.abilities) {
        const enabled = ability.behaviorId === "ability.recycle_for_power" || !game.state.cardStates[sourceId]!.exhausted;
        const label = ability.behaviorId === "ability.recycle_for_power"
          ? "Add Power"
          : ability.parameters.usage === "spellsOnly" ? "Add spell Energy" : "Add Energy";
        actions.push(action(game, "activate", label, sourceId, enabled, enabled ? null : "Source is exhausted.", `${clause.id}|${ability.behaviorId}`));
      }
    }
  }
}

function executeImmediateClauses(
  game: GameDocumentV2, definition: GameCardDefinition, controllerId: string,
  sourceId: string, selectedIds: string[], handlers: ReturnType<typeof createPrimitiveHandlersV2>
) {
  const compiled = compileBehaviorModelV2(definition.behaviorModel, handlers);
  for (const clause of compiled.clauses.filter((item) => item.triggers.length === 0 && item.abilities.length === 0)) {
    const clauseSelections = clause.selectors.length ? selectedIds : [];
    executeBehaviorClauseV2({
      clause,
      context: createBehaviorContext(game, controllerId, sourceId, null, clauseSelections),
      handlers
    });
  }
}

function validateActionTargets(action: ProjectedAction, selectedIds: string[]) {
  if (action.targets.length === 0) {
    if (selectedIds.length) throw new Error("This action does not accept selected targets.");
    return;
  }
  const legal = new Set(action.targets.flatMap((target) => target.legalIds));
  const minimum = action.targets.reduce((sum, target) => sum + target.minimum, 0);
  const maximum = action.targets.reduce((sum, target) => sum + target.maximum, 0);
  if (selectedIds.length < minimum || selectedIds.length > maximum || selectedIds.some((id) => !legal.has(id)) || new Set(selectedIds).size !== selectedIds.length) {
    throw new Error("Selected targets are not legal for this action.");
  }
}
function draw(source: string[], destination: string[], count: number) {
  destination.push(...source.splice(0, Math.min(count, source.length)));
}
function otherPlayer(game: GameDocumentV2, playerId: string) {
  return game.state.setup.playerIds.find((id) => id !== playerId)!;
}

function permutations(values: string[]): string[][] {
  if (values.length <= 1) return [[...values]];
  return values.flatMap((value, index) =>
    permutations([...values.slice(0, index), ...values.slice(index + 1)])
      .map((rest) => [value, ...rest])
  );
}
