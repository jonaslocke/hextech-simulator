import type { ProjectedAction } from "../../shared/game-v2";
import type { DeckSnapshotDocumentV2 } from "./repositories";
import type { GameCardDefinition } from "./schemas";
import type { CardInstanceV2, GameDocumentV2 } from "./state";

type RuntimeIndex = {
  definitions: Map<string, GameCardDefinition>;
  instances: Map<string, CardInstanceV2>;
};

export function gameplayActionsV2(
  game: GameDocumentV2,
  actorPlayerId: string,
  decks: readonly DeckSnapshotDocumentV2[]
): ProjectedAction[] {
  if (game.status !== "in_progress") return [];
  const index = runtimeIndex(decks);
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
    return actions;
  }
  if (!hasPriority) return actions;

  actions.push(action(game, "draw", "Draw a card", null));
  actions.push(action(game, "channel", "Channel a rune", null));
  actions.push(action(game, "endTurn", "End turn", null));

  for (const cardId of [...player.zones.hand, ...(player.zones.champion ? [player.zones.champion] : [])]) {
    const definition = definitionFor(cardId, index);
    if (["Unit", "Spell"].includes(definition.card.classification.type) && canPay(player, definition)) {
      actions.push(action(game, "play", `Play ${definition.card.name}`, cardId));
    }
  }
  for (const cardId of player.zones.base) {
    const definition = definitionFor(cardId, index);
    const state = game.state.cardStates[cardId]!;
    if (definition.card.classification.type === "Rune") {
      actions.push(action(game, "runeEnergy", "Add Energy", cardId, !state.exhausted, state.exhausted ? "Rune is exhausted." : null));
      actions.push(action(game, "runePower", "Add Power", cardId));
    }
    if (definition.card.classification.type === "Unit" && !state.exhausted) {
      for (const battlefield of game.state.battlefields) {
        actions.push(action(game, "move", `Move to ${definitionFor(battlefield.cardInstanceId, index).card.name}`, cardId, true, null, battlefield.battlefieldId));
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
  if (input.selectedIds.length) throw new Error("This action does not accept selected targets.");
  const game = structuredClone(input.game);
  const index = runtimeIndex(input.decks);
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
    case "runeEnergy": {
      game.state.cardStates[source]!.exhausted = true;
      player.energy += 1;
      break;
    }
    case "runePower": {
      const definition = definitionFor(source, index);
      player.zones.base = player.zones.base.filter((id) => id !== source);
      player.zones.runeDeck.push(source);
      const domain = definition.card.classification.domain[0] ?? "Rainbow";
      player.power[domain] = (player.power[domain] ?? 0) + 1;
      game.state.cardStates[source]!.exhausted = false;
      break;
    }
    case "play":
      playCard(game, input.actorPlayerId, source, index);
      break;
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
      passPriority(game, input.actorPlayerId, index);
      break;
    case "endTurn":
      endTurn(game, input.actorPlayerId);
      break;
    default:
      throw new Error("Action kind is not implemented.");
  }
  game.stateVersion += 1;
  game.updatedAt = input.now;
  return game;
}

function playCard(game: GameDocumentV2, playerId: string, cardId: string, index: RuntimeIndex) {
  const player = game.state.players[playerId]!;
  const definition = definitionFor(cardId, index);
  pay(player, definition);
  player.zones.hand = player.zones.hand.filter((id) => id !== cardId);
  if (player.zones.champion === cardId) player.zones.champion = null;
  if (definition.card.classification.type === "Unit") {
    player.zones.base.push(cardId);
    game.state.cardStates[cardId]!.exhausted = true;
    return;
  }
  game.state.chain = {
    items: [{ id: `chain:${game.stateVersion + 1}:${cardId}`, label: definition.card.name, controllerPlayerId: playerId, sourceCardInstanceId: cardId, targetCardInstanceIds: [], behaviorClauseId: null }],
    priorityPlayerId: otherPlayer(game, playerId),
    passedPlayerIds: []
  };
}

function passPriority(game: GameDocumentV2, actor: string, index: RuntimeIndex) {
  if (game.state.chain) {
    const passed = [...new Set([...game.state.chain.passedPlayerIds, actor])];
    if (passed.length === 2) {
      const item = game.state.chain.items.pop();
      if (item?.sourceCardInstanceId) {
        const owner = index.instances.get(item.sourceCardInstanceId)!.ownerPlayerId;
        game.state.players[owner]!.zones.trash.push(item.sourceCardInstanceId);
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

function endTurn(game: GameDocumentV2, actor: string) {
  if (game.state.turn?.activePlayerId !== actor) throw new Error("Only the active player can end the turn.");
  const next = otherPlayer(game, actor);
  const player = game.state.players[next]!;
  for (const cardId of [...player.zones.base, ...game.state.battlefields.flatMap((battlefield) => battlefield.units)]) {
    if (game.state.cardStates[cardId]) game.state.cardStates[cardId]!.exhausted = false;
  }
  draw(player.zones.runeDeck, player.zones.base, game.state.turn.turnNumber === 1 ? 2 : 1);
  draw(player.zones.mainDeck, player.zones.hand, 1);
  game.state.turn = { turnNumber: game.state.turn.turnNumber + 1, activePlayerId: next, phase: "action" };
}

function action(game: GameDocumentV2, kind: string, label: string, source: string | null, enabled = true, disabledReason: string | null = null, extra?: string): ProjectedAction {
  return { id: ["v2", game.stateVersion, "game", kind, source === null ? null : encodeURIComponent(source), extra === undefined ? undefined : encodeURIComponent(extra)].filter((value) => value !== null && value !== undefined).join(":"), label, sourceCardInstanceId: source, enabled, disabledReason, targets: [] };
}
function runtimeIndex(decks: readonly DeckSnapshotDocumentV2[]): RuntimeIndex {
  return {
    definitions: new Map(decks.flatMap((deck) => deck.snapshot.cards.map((definition) => [definition.cardCode, definition] as const))),
    instances: new Map(decks.flatMap((deck) => deck.instances.map((instance) => [instance.instanceId, instance] as const)))
  };
}
function definitionFor(id: string, index: RuntimeIndex): GameCardDefinition {
  const instance = index.instances.get(id);
  const definition = instance && index.definitions.get(instance.cardCode);
  if (!definition) throw new Error(`Card definition unavailable: ${id}`);
  return definition;
}
function canPay(player: GameDocumentV2["state"]["players"][string], definition: GameCardDefinition) {
  const energy = definition.card.attributes.energy ?? 0;
  const power = definition.card.attributes.power ?? 0;
  return player.energy >= energy && Object.values(player.power).reduce((sum, value) => sum + value, 0) >= power;
}
function pay(player: GameDocumentV2["state"]["players"][string], definition: GameCardDefinition) {
  const energy = definition.card.attributes.energy ?? 0;
  const power = definition.card.attributes.power ?? 0;
  if (!canPay(player, definition)) throw new Error("Card costs cannot be paid.");
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
function draw(source: string[], destination: string[], count: number) {
  destination.push(...source.splice(0, Math.min(count, source.length)));
}
function otherPlayer(game: GameDocumentV2, playerId: string) {
  return game.state.setup.playerIds.find((id) => id !== playerId)!;
}
