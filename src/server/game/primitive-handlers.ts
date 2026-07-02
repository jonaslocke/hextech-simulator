import type { BehaviorHandler, BehaviorHandlerRegistry } from "./behavior-runtime";
import type { DeckSnapshotDocumentV2 } from "./repositories";
import type { BehaviorBindingV2, GameCardDefinition } from "./schemas";
import type { CardInstanceV2, GameDocumentV2 } from "./state";

export type RuntimeCardIndexV2 = {
  definitions: Map<string, GameCardDefinition>;
  instances: Map<string, CardInstanceV2>;
};

export function createRuntimeCardIndexV2(decks: readonly DeckSnapshotDocumentV2[]): RuntimeCardIndexV2 {
  return {
    definitions: new Map(decks.flatMap((deck) => deck.snapshot.cards.map((item) => [item.cardCode, item] as const))),
    instances: new Map(decks.flatMap((deck) => deck.instances.map((item) => [item.instanceId, item] as const)))
  };
}

export function definitionForInstanceV2(id: string, index: RuntimeCardIndexV2): GameCardDefinition {
  const instance = index.instances.get(id);
  const definition = instance && index.definitions.get(instance.cardCode);
  if (!definition) throw new Error(`Card definition unavailable: ${id}`);
  return definition;
}

export function createPrimitiveHandlersV2(
  index: RuntimeCardIndexV2
): BehaviorHandlerRegistry {
  const handlers = new Map<string, BehaviorHandler>();
  const passive: BehaviorHandler = {};
  for (const id of [
    "timing.action", "timing.reaction", "timing.delayed", "keyword.assault", "keyword.tank"
  ]) handlers.set(id, passive);
  handlers.set("trigger.on_play", {
    matches(binding, context) {
      if (context.event?.type !== "card.played" || context.event.actorPlayerId !== context.controllerPlayerId) return false;
      if (binding.parameters.subject === "source") return context.event.subjectCardInstanceId === context.sourceCardInstanceId;
      if (binding.parameters.subject === "spell" && context.event.subjectCardInstanceId) {
        return definitionForInstanceV2(context.event.subjectCardInstanceId, index).card.classification.type === "Spell";
      }
      return false;
    }
  });
  handlers.set("trigger.conquer_battlefield", { matches: (_binding, context) => context.event?.type === "battlefield.conquered" && context.event.subjectCardInstanceId === context.sourceCardInstanceId });
  handlers.set("trigger.hold_battlefield", { matches: (_binding, context) => context.event?.type === "battlefield.held" && context.event.subjectCardInstanceId === context.sourceCardInstanceId });
  handlers.set("condition.compare_numeric_value", {
    matches(binding, context) {
      const source = binding.parameters.valueSource;
      const value = typeof source === "string" ? context.event?.values[source] : undefined;
      const comparison = binding.parameters.comparisonValue;
      if (typeof value !== "number" || typeof comparison !== "number") return false;
      switch (binding.parameters.operator) {
        case "greaterThanOrEqual": return value >= comparison;
        case "greaterThan": return value > comparison;
        case "equal": return value === comparison;
        case "lessThanOrEqual": return value <= comparison;
        case "lessThan": return value < comparison;
        default: return false;
      }
    }
  });

  handlers.set("selector.unit", {
    targets(binding, context) {
      return selectorTargets(binding, context.game, index, () => true);
    }
  });
  handlers.set("selector.friendly_unit", {
    targets(binding, context) {
      return selectorTargets(binding, context.game, index, (id) => index.instances.get(id)?.ownerPlayerId === context.controllerPlayerId);
    }
  });
  handlers.set("action.draw_cards", {
    execute(binding, context) {
      const playerId = binding.parameters.player === "eachPlayer" ? null : context.controllerPlayerId;
      const count = numberParam(binding, "count");
      const ids = playerId ? [playerId] : [...context.game.state.setup.playerIds];
      for (const id of ids) draw(context.game.state.players[id]!.zones.mainDeck, context.game.state.players[id]!.zones.hand, count);
    }
  });
  handlers.set("action.channel_runes", {
    execute(binding, context) {
      const count = numberParam(binding, "count");
      const ids = binding.parameters.player === "eachPlayer" ? [...context.game.state.setup.playerIds] : [context.controllerPlayerId];
      for (const id of ids) {
        const player = context.game.state.players[id]!;
        const moved = player.zones.runeDeck.splice(0, count);
        player.zones.base.push(...moved);
        if (binding.parameters.entryState === "exhausted") moved.forEach((cardId) => { context.game.state.cardStates[cardId]!.exhausted = true; });
      }
    }
  });
  handlers.set("action.ready_cards", {
    execute(binding, context) {
      const ids = binding.parameters.target === "runes"
        ? context.game.state.players[context.controllerPlayerId]!.zones.base.filter((id) => definitionForInstanceV2(id, index).card.classification.type === "Rune").slice(0, numberParam(binding, "count"))
        : context.selectedIds;
      ids.forEach((id) => { context.game.state.cardStates[id]!.exhausted = false; });
    }
  });
  handlers.set("action.deal_damage", {
    execute(binding, context) {
      const amount = numberParam(binding, "amount");
      for (const id of context.selectedIds) {
        const state = context.game.state.cardStates[id];
        if (!state) throw new Error(`Damage target is unavailable: ${id}`);
        state.damage += amount;
      }
      cleanupLethalDamage(context.game, context.selectedIds, index);
    }
  });
  handlers.set("action.kill_unit", {
    execute(_binding, context) {
      context.selectedIds.forEach((id) => moveUnitToTrash(context.game, id, index));
    }
  });
  handlers.set("modifier.enter_ready", {
    execute(_binding, context) {
      context.game.state.cardStates[context.sourceCardInstanceId]!.exhausted = false;
    }
  });
  handlers.set("modifier.modify_numeric_value", {
    execute(binding, context) {
      const attribute = stringParam(binding, "attribute");
      const targets = binding.parameters.target === "source"
        ? [context.sourceCardInstanceId]
        : binding.parameters.target === "game" || binding.parameters.target === "controller_spell"
          ? [null]
          : context.selectedIds;
      const mightTargets: string[] = [];
      for (const target of targets) {
        const modifier = {
          id: `modifier:${context.game.stateVersion}:${context.sourceCardInstanceId}:${context.game.state.modifiers.length}`,
          sourceCardInstanceId: context.sourceCardInstanceId,
          controllerPlayerId: context.controllerPlayerId,
          targetCardInstanceId: target,
          attribute,
          operation: stringParam(binding, "operation") as "increase" | "reduce" | "multiply" | "set",
          amount: numberParam(binding, "amount"),
          minimum: typeof binding.parameters.minimum === "number" ? binding.parameters.minimum : null,
          duration: stringParam(binding, "duration"),
          createdAtTurn: context.game.state.turn?.turnNumber ?? 0
        };
        context.game.state.modifiers.push(modifier);
        if (target && attribute === "might") {
          recomputeMight(context.game, target, index);
          mightTargets.push(target);
        }
      }
      cleanupLethalDamage(context.game, mightTargets, index);
    }
  });
  handlers.set("ability.exhaust_for_resource", {
    execute(binding, context) {
      const state = context.game.state.cardStates[context.sourceCardInstanceId]!;
      if (state.exhausted) throw new Error("Ability source is exhausted.");
      state.exhausted = true;
      const player = context.game.state.players[context.controllerPlayerId]!;
      const amount = numberParam(binding, "amount");
      if (binding.parameters.usage === "spellsOnly") player.conditionalEnergy += amount;
      else player.energy += amount;
    }
  });
  handlers.set("ability.recycle_for_power", {
    execute(_binding, context) {
      const player = context.game.state.players[context.controllerPlayerId]!;
      player.zones.base = player.zones.base.filter((id) => id !== context.sourceCardInstanceId);
      player.zones.runeDeck.push(context.sourceCardInstanceId);
      resetStateAfterLeavingBoard(context.game, context.sourceCardInstanceId);
      const domain = definitionForInstanceV2(context.sourceCardInstanceId, index).card.classification.domain[0] ?? "Rainbow";
      player.power[domain] = (player.power[domain] ?? 0) + 1;
    }
  });
  return handlers;
}

export function effectiveEnergyCostV2(
  game: GameDocumentV2,
  controllerPlayerId: string,
  definition: GameCardDefinition
): number {
  let value = definition.card.attributes.energy ?? 0;
  for (const modifier of game.state.modifiers) {
    if (modifier.attribute !== "energyCost" || !modifierIsActive(game, modifier.sourceCardInstanceId, modifier.duration)) continue;
    if (modifier.controllerPlayerId && modifier.controllerPlayerId !== controllerPlayerId) continue;
    if (modifier.operation === "reduce") value -= modifier.amount;
    if (modifier.operation === "increase") value += modifier.amount;
    if (modifier.operation === "multiply") value *= modifier.amount;
    if (modifier.operation === "set") value = modifier.amount;
    if (modifier.minimum !== null) value = Math.max(value, modifier.minimum);
  }
  return Math.max(0, value);
}

export function cleanupTurnModifiersV2(game: GameDocumentV2, index: RuntimeCardIndexV2) {
  const affected = game.state.modifiers.filter((item) => item.duration === "thisTurn" && item.targetCardInstanceId).map((item) => item.targetCardInstanceId!);
  game.state.modifiers = game.state.modifiers.filter((item) => item.duration !== "thisTurn");
  affected.forEach((id) => recomputeMight(game, id, index));
  cleanupLethalDamage(game, [...new Set(affected)], index);
}

function selectorTargets(binding: BehaviorBindingV2, game: GameDocumentV2, index: RuntimeCardIndexV2, predicate: (id: string) => boolean) {
  const baseUnits = game.state.setup.playerIds.flatMap(
    (playerId) => game.state.players[playerId]?.zones.base ?? []
  );
  const battlefieldUnits = game.state.battlefields.flatMap((battlefield) => battlefield.units);
  const candidates = binding.parameters.area === "battlefield"
    ? battlefieldUnits
    : binding.parameters.area === "base"
      ? baseUnits
      : [...baseUnits, ...battlefieldUnits];
  const legalIds = candidates
    .filter((id) => definitionForInstanceV2(id, index).card.classification.type === "Unit")
    .filter(predicate);
  return {
    kind: "card" as const,
    legalIds,
    minimum: typeof binding.parameters.minimumCount === "number" ? binding.parameters.minimumCount : 1,
    maximum: typeof binding.parameters.maximumCount === "number" ? binding.parameters.maximumCount : 1
  };
}
function modifierIsActive(game: GameDocumentV2, sourceId: string | null, duration: string) {
  if (!sourceId) return true;
  if (duration === "whileSourceAtBattlefield") return game.state.battlefields.some((battlefield) => battlefield.units.includes(sourceId));
  if (duration === "whileSourceOnBoard") return game.state.battlefields.some((battlefield) => battlefield.cardInstanceId === sourceId || battlefield.units.includes(sourceId));
  return true;
}
function recomputeMight(game: GameDocumentV2, id: string, index: RuntimeCardIndexV2) {
  let value = definitionForInstanceV2(id, index).card.attributes.might ?? 0;
  for (const modifier of game.state.modifiers.filter((item) => item.attribute === "might" && item.targetCardInstanceId === id && modifierIsActive(game, item.sourceCardInstanceId, item.duration))) {
    if (modifier.operation === "increase") value += modifier.amount;
    if (modifier.operation === "reduce") value -= modifier.amount;
    if (modifier.operation === "multiply") value *= modifier.amount;
    if (modifier.operation === "set") value = modifier.amount;
    if (modifier.minimum !== null) value = Math.max(value, modifier.minimum);
  }
  game.state.cardStates[id]!.computedMight = Math.max(0, value);
}
function cleanupLethalDamage(game: GameDocumentV2, ids: string[], index: RuntimeCardIndexV2) {
  for (const id of ids) {
    const state = game.state.cardStates[id];
    if (state && state.damage > 0 && state.damage >= (state.computedMight ?? definitionForInstanceV2(id, index).card.attributes.might ?? Infinity)) {
      moveUnitToTrash(game, id, index);
    }
  }
}
function moveUnitToTrash(game: GameDocumentV2, id: string, index: RuntimeCardIndexV2) {
  const owner = index.instances.get(id)?.ownerPlayerId;
  if (!owner) throw new Error(`Unit owner is unavailable: ${id}`);
  const zones = game.state.players[owner]!.zones;
  for (const zone of [
    "mainDeck",
    "runeDeck",
    "hand",
    "trash",
    "banishment",
    "base"
  ] as const) {
    zones[zone] = zones[zone].filter((item) => item !== id);
  }
  if (zones.legend === id) zones.legend = null;
  if (zones.champion === id) zones.champion = null;
  game.state.battlefields.forEach((battlefield) => {
    battlefield.units = battlefield.units.filter((item) => item !== id);
  });
  zones.trash.push(id);
  resetStateAfterLeavingBoard(game, id);
}
function resetStateAfterLeavingBoard(game: GameDocumentV2, id: string) {
  const state = game.state.cardStates[id];
  if (!state) return;
  state.damage = 0;
  state.exhausted = false;
}
function numberParam(binding: BehaviorBindingV2, key: string) {
  const value = binding.parameters[key];
  if (typeof value !== "number") throw new Error(`Behavior parameter ${key} must be numeric.`);
  return value;
}
function stringParam(binding: BehaviorBindingV2, key: string) {
  const value = binding.parameters[key];
  if (typeof value !== "string") throw new Error(`Behavior parameter ${key} must be text.`);
  return value;
}
function draw(source: string[], destination: string[], count: number) { destination.push(...source.splice(0, Math.min(count, source.length))); }
