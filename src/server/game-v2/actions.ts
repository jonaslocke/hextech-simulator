import type { ProjectedAction } from "../../shared/game-v2";
import {
  compileBehaviorModelV2,
  createBehaviorContext,
  executeBehaviorClauseV2,
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

  actions.push(action(game, "draw", "Draw a card", null));
  actions.push(action(game, "channel", "Channel a rune", null));
  actions.push(action(game, "endTurn", "End turn", null));

  addPlayableCardActions(actions, game, actorPlayerId, decks, index, false);
  addAbilityActions(actions, game, actorPlayerId, index, handlers);
  for (const cardId of player.zones.base) {
    const definition = definitionForInstanceV2(cardId, index);
    const state = game.state.cardStates[cardId]!;
    if (definition.card.classification.type === "Unit" && !state.exhausted) {
      for (const battlefield of game.state.battlefields) {
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
  const source = encodedSource ? decodeURIComponent(encodedSource) : "";
  const extra = encodedExtra ? decodeURIComponent(encodedExtra) : "";
  const player = game.state.players[input.actorPlayerId]!;

  switch (kind) {
    case "draw":
      draw(player.zones.mainDeck, player.zones.hand, 1);
      break;
    case "channel":
      draw(player.zones.runeDeck, player.zones.base, 1);
      break;
    case "play":
      playCard(game, input.actorPlayerId, source, input.selectedIds, index, handlers);
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
      battlefield.units.push(cardId);
      game.state.cardStates[cardId]!.exhausted = true;
      game.state.showdown = { battlefieldId, priorityPlayerId: input.actorPlayerId, passedPlayerIds: [] };
      break;
    }
    case "pass":
      passPriority(game, input.actorPlayerId, index, handlers);
      break;
    case "endTurn":
      endTurn(game, input.actorPlayerId, index);
      break;
    default:
      throw new Error("Action kind is not implemented.");
  }
  game.stateVersion += 1;
  game.updatedAt = input.now;
  return game;
}

function playCard(game: GameDocumentV2, playerId: string, cardId: string, selectedIds: string[], index: RuntimeCardIndexV2, handlers: ReturnType<typeof createPrimitiveHandlersV2>) {
  const player = game.state.players[playerId]!;
  const definition = definitionForInstanceV2(cardId, index);
  pay(player, definition, effectiveEnergyCostV2(game, playerId, definition));
  player.zones.hand = player.zones.hand.filter((id) => id !== cardId);
  if (player.zones.champion === cardId) player.zones.champion = null;
  if (definition.card.classification.type === "Unit") {
    player.zones.base.push(cardId);
    game.state.cardStates[cardId]!.exhausted = true;
    executeImmediateClauses(game, definition, playerId, cardId, selectedIds, handlers);
    return;
  }
  const item = { id: `chain:${game.stateVersion + 1}:${cardId}`, label: definition.card.name, controllerPlayerId: playerId, sourceCardInstanceId: cardId, targetCardInstanceIds: selectedIds, behaviorClauseId: null };
  if (game.state.chain) {
    game.state.chain.items.push(item);
    game.state.chain.priorityPlayerId = otherPlayer(game, playerId);
    game.state.chain.passedPlayerIds = [];
  } else {
    game.state.chain = { items: [item], priorityPlayerId: otherPlayer(game, playerId), passedPlayerIds: [] };
  }
}

function passPriority(game: GameDocumentV2, actor: string, index: RuntimeCardIndexV2, handlers: ReturnType<typeof createPrimitiveHandlersV2>) {
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
          if (clause) executeBehaviorClauseV2({ clause, context: createBehaviorContext(game, owner, item.sourceCardInstanceId, null, item.targetCardInstanceIds), handlers });
        } else {
          executeImmediateClauses(game, definition, owner, item.sourceCardInstanceId, item.targetCardInstanceIds, handlers);
          if (definition.card.classification.type === "Spell") game.state.players[owner]!.zones.trash.push(item.sourceCardInstanceId);
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

function endTurn(game: GameDocumentV2, actor: string, index: RuntimeCardIndexV2) {
  if (game.state.turn?.activePlayerId !== actor) throw new Error("Only the active player can end the turn.");
  const next = otherPlayer(game, actor);
  const player = game.state.players[next]!;
  for (const cardId of [...player.zones.base, ...game.state.battlefields.flatMap((battlefield) => battlefield.units)]) {
    if (game.state.cardStates[cardId]) game.state.cardStates[cardId]!.exhausted = false;
  }
  draw(player.zones.runeDeck, player.zones.base, game.state.turn.turnNumber === 1 ? 2 : 1);
  draw(player.zones.mainDeck, player.zones.hand, 1);
  cleanupTurnModifiersV2(game, index);
  for (const candidate of Object.values(game.state.players)) candidate.conditionalEnergy = 0;
  game.state.turn = { turnNumber: game.state.turn.turnNumber + 1, activePlayerId: next, phase: "action" };
}

function action(game: GameDocumentV2, kind: string, label: string, source: string | null, enabled = true, disabledReason: string | null = null, extra?: string, targets: ProjectedAction["targets"] = []): ProjectedAction {
  return { id: ["v2", game.stateVersion, "game", kind, source === null ? null : encodeURIComponent(source), extra === undefined ? undefined : encodeURIComponent(extra)].filter((value) => value !== null && value !== undefined).join(":"), label, sourceCardInstanceId: source, enabled, disabledReason, targets };
}
function canPay(player: GameDocumentV2["state"]["players"][string], definition: GameCardDefinition, energy: number) {
  const power = definition.card.attributes.power ?? 0;
  const availableEnergy = player.energy + (definition.card.classification.type === "Spell" ? player.conditionalEnergy : 0);
  return availableEnergy >= energy && Object.values(player.power).reduce((sum, value) => sum + value, 0) >= power;
}
function pay(player: GameDocumentV2["state"]["players"][string], definition: GameCardDefinition, energy: number) {
  const power = definition.card.attributes.power ?? 0;
  if (!canPay(player, definition, energy)) throw new Error("Card costs cannot be paid.");
  if (definition.card.classification.type === "Spell") {
    const conditional = Math.min(player.conditionalEnergy, energy);
    player.conditionalEnergy -= conditional;
    energy -= conditional;
  }
  player.energy -= energy;
  let remaining = power;
  for (const domain of definition.card.classification.domain) {
    const spend = Math.min(player.power[domain] ?? 0, remaining);
    player.power[domain] = (player.power[domain] ?? 0) - spend;
    remaining -= spend;
  }
  for (const domain of Object.keys(player.power)) {
    if (!remaining) break;
    const spend = Math.min(player.power[domain] ?? 0, remaining);
    player.power[domain] = (player.power[domain] ?? 0) - spend;
    remaining -= spend;
  }
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
    if (!canPay(player, definition, cost)) continue;
    const context = createBehaviorContext(game, playerId, cardId, null, []);
    const targets = compiled.clauses
      .filter((clause) => clause.triggers.length === 0)
      .flatMap((clause) => targetRequirementsForClauseV2(clause, context, handlers));
    actions.push(action(game, "play", `Play ${definition.card.name}`, cardId, true, null, undefined, targets));
  }
  void decks;
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
