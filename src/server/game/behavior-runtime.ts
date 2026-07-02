import type { ProjectedTargetRequirement } from "../../shared/game";
import type { BehaviorBinding, BehaviorClause, BehaviorModel } from "./schemas";
import type { GameDocument } from "./state";

export type BehaviorEvent = {
  type: string;
  actorPlayerId: string | null;
  subjectCardInstanceId: string | null;
  values: Record<string, string | number | boolean | null>;
};

export type BehaviorExecutionContext = {
  game: GameDocument;
  controllerPlayerId: string;
  sourceCardInstanceId: string;
  event: BehaviorEvent | null;
  selectedIds: string[];
  selectedBySelector: Record<string, string[]>;
};

export type BehaviorHandler = {
  validate?(binding: BehaviorBinding): void;
  matches?(binding: BehaviorBinding, context: BehaviorExecutionContext): boolean;
  targets?(binding: BehaviorBinding, context: BehaviorExecutionContext): ProjectedTargetRequirement;
  execute?(binding: BehaviorBinding, context: BehaviorExecutionContext): void;
};

export type BehaviorHandlerRegistry = ReadonlyMap<string, BehaviorHandler>;

export type CompiledBehaviorClause = BehaviorClause & {
  orderedEffects: BehaviorBinding[];
};

export type CompiledBehaviorModel = {
  playTimings: BehaviorBinding[];
  clauses: CompiledBehaviorClause[];
};

export function compileBehaviorModel(
  model: BehaviorModel,
  handlers: BehaviorHandlerRegistry
): CompiledBehaviorModel {
  validateOrders("playTimings", model.playTimings);
  model.playTimings.forEach((binding) => requireHandler(binding, handlers));
  const ids = new Set<string>();
  const clauses = model.clauses.map((clause, sequence) => {
    if (clause.sequence !== sequence) throw new Error(`Behavior clause sequence is invalid: ${clause.id}`);
    if (ids.has(clause.id)) throw new Error(`Duplicate behavior clause id: ${clause.id}`);
    ids.add(clause.id);
    const groups = bindingGroups(clause);
    for (const [name, bindings] of Object.entries(groups)) {
      validateOrders(`${clause.id}.${name}`, bindings);
      bindings.forEach((binding) => requireHandler(binding, handlers));
    }
    return { ...clause, orderedEffects: [...clause.effects].sort((a, b) => a.order - b.order) };
  });
  return { playTimings: [...model.playTimings].sort((a, b) => a.order - b.order), clauses };
}

export function playTimingIds(model: CompiledBehaviorModel): string[] {
  return model.playTimings.map((binding) => binding.behaviorId);
}

export function targetRequirementsForClause(
  clause: CompiledBehaviorClause,
  context: BehaviorExecutionContext,
  handlers: BehaviorHandlerRegistry
): ProjectedTargetRequirement[] {
  return clause.selectors.map((binding) => {
    const handler = requireHandler(binding, handlers);
    if (!handler.targets) throw new Error(`Behavior handler cannot project targets: ${binding.behaviorId}`);
    return handler.targets(binding, context);
  });
}

export function executeBehaviorClause(input: {
  clause: CompiledBehaviorClause;
  context: BehaviorExecutionContext;
  handlers: BehaviorHandlerRegistry;
}): { executed: boolean; delayed: boolean } {
  const { clause, context, handlers } = input;
  if (!clause.triggers.every((binding) => matches(binding, context, handlers))) {
    return { executed: false, delayed: false };
  }
  if (!clause.conditions.every((binding) => matches(binding, context, handlers))) {
    return { executed: false, delayed: false };
  }
  const requirements = targetRequirementsForClause(clause, context, handlers);
  validateSelections(requirements, context.selectedIds);
  clause.selectors.forEach((binding, index) => {
    context.selectedBySelector[binding.behaviorId] = selectedForRequirement(requirements[index]!, context.selectedIds);
  });
  const delayed = clause.timings.find((binding) => binding.behaviorId === "timing.delayed");
  if (delayed) {
    const point = delayed.parameters.point;
    if (typeof point !== "string") throw new Error("Delayed timing point is missing.");
    context.game.state.delayedEffects.push({
      id: `delayed:${context.game.stateVersion}:${context.sourceCardInstanceId}:${clause.id}`,
      point,
      controllerPlayerId: context.controllerPlayerId,
      sourceCardInstanceId: context.sourceCardInstanceId,
      clauseId: clause.id,
      selectedIds: [...context.selectedIds]
    });
    return { executed: true, delayed: true };
  }
  for (const binding of clause.orderedEffects) {
    const handler = requireHandler(binding, handlers);
    if (!handler.execute) throw new Error(`Behavior handler cannot execute: ${binding.behaviorId}`);
    handler.execute(binding, context);
  }
  return { executed: true, delayed: false };
}

export function executeBehaviorEffects(
  clause: CompiledBehaviorClause,
  context: BehaviorExecutionContext,
  handlers: BehaviorHandlerRegistry
): void {
  for (const binding of clause.orderedEffects) {
    const handler = requireHandler(binding, handlers);
    if (!handler.execute) throw new Error(`Behavior handler cannot execute: ${binding.behaviorId}`);
    handler.execute(binding, context);
  }
}

export function queueTriggeredClauses(input: {
  game: GameDocument;
  controllerPlayerId: string;
  sources: Array<{ sourceCardInstanceId: string; label: string; model: CompiledBehaviorModel }>;
  event: BehaviorEvent;
  handlers: BehaviorHandlerRegistry;
}): void {
  const items = input.sources.flatMap((source) => source.model.clauses.flatMap((clause) => {
    if (clause.triggers.length === 0) return [];
    const context = createBehaviorContext(input.game, input.controllerPlayerId, source.sourceCardInstanceId, input.event, []);
    if (!clause.triggers.every((binding) => matches(binding, context, input.handlers))) return [];
    if (!clause.conditions.every((binding) => matches(binding, context, input.handlers))) return [];
    return [{
      id: `trigger:${input.game.stateVersion}:${source.sourceCardInstanceId}:${clause.id}`,
      label: source.label,
      controllerPlayerId: input.controllerPlayerId,
      sourceCardInstanceId: source.sourceCardInstanceId,
      targetCardInstanceIds: [],
      behaviorClauseId: clause.id,
      behaviorEvent: input.event
    }];
  }));
  if (items.length === 0) return;
  if (items.length > 1) {
    input.game.state.pendingChoice = {
      id: `choice:${input.game.stateVersion}:${input.controllerPlayerId}:triggers`,
      playerId: input.controllerPlayerId,
      type: "orderTriggers",
      optionIds: items.map((item) => item.id),
      pendingItems: items
    };
    return;
  }
  const chain = input.game.state.chain ?? {
    items: [], priorityPlayerId: input.controllerPlayerId, passedPlayerIds: []
  };
  chain.items.push(...items);
  input.game.state.chain = chain;
}

export function submitTriggerOrder(game: GameDocument, playerId: string, orderedIds: string[]): void {
  const pending = game.state.pendingChoice;
  if (!pending || pending.playerId !== playerId) throw new Error("No trigger-order choice is pending.");
  if (orderedIds.length !== pending.optionIds.length || new Set(orderedIds).size !== orderedIds.length || orderedIds.some((id) => !pending.optionIds.includes(id))) {
    throw new Error("Trigger ordering must contain every pending trigger exactly once.");
  }
  const byId = new Map(pending.pendingItems.map((item) => [item.id, item]));
  const chain = game.state.chain ?? { items: [], priorityPlayerId: playerId, passedPlayerIds: [] };
  chain.items.push(...orderedIds.map((id) => byId.get(id)!));
  game.state.chain = chain;
  game.state.pendingChoice = null;
}

export function createBehaviorContext(
  game: GameDocument,
  controllerPlayerId: string,
  sourceCardInstanceId: string,
  event: BehaviorEvent | null,
  selectedIds: string[]
): BehaviorExecutionContext {
  return { game, controllerPlayerId, sourceCardInstanceId, event, selectedIds, selectedBySelector: {} };
}

function matches(binding: BehaviorBinding, context: BehaviorExecutionContext, handlers: BehaviorHandlerRegistry): boolean {
  const handler = requireHandler(binding, handlers);
  if (!handler.matches) throw new Error(`Behavior handler cannot evaluate: ${binding.behaviorId}`);
  return handler.matches(binding, context);
}
function requireHandler(binding: BehaviorBinding, handlers: BehaviorHandlerRegistry): BehaviorHandler {
  const handler = handlers.get(binding.behaviorId);
  if (!handler) throw new Error(`Unknown game behavior handler: ${binding.behaviorId}`);
  handler.validate?.(binding);
  return handler;
}
function validateOrders(group: string, bindings: readonly BehaviorBinding[]) {
  const orders = new Set(bindings.map((binding) => binding.order));
  if (orders.size !== bindings.length) throw new Error(`Duplicate behavior order: ${group}`);
}
function bindingGroups(clause: BehaviorClause) {
  return {
    abilities: clause.abilities, triggers: clause.triggers, conditions: clause.conditions,
    selectors: clause.selectors, choices: clause.choices, costs: clause.costs,
    timings: clause.timings, effects: clause.effects, keywords: clause.keywords
  };
}
function validateSelections(requirements: ProjectedTargetRequirement[], selectedIds: string[]) {
  if (requirements.length === 0) {
    if (selectedIds.length) throw new Error("Behavior clause does not accept selected targets.");
    return;
  }
  const legal = new Set(requirements.flatMap((requirement) => requirement.legalIds));
  const minimum = requirements.reduce((sum, requirement) => sum + requirement.minimum, 0);
  const maximum = requirements.reduce((sum, requirement) => sum + requirement.maximum, 0);
  if (selectedIds.length < minimum || selectedIds.length > maximum || selectedIds.some((id) => !legal.has(id)) || new Set(selectedIds).size !== selectedIds.length) {
    throw new Error("Behavior selections do not satisfy selector requirements.");
  }
}
function selectedForRequirement(requirement: ProjectedTargetRequirement, selectedIds: string[]) {
  return selectedIds.filter((id) => requirement.legalIds.includes(id)).slice(0, requirement.maximum);
}
