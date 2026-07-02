import type { ProjectedAction } from "../../shared/game";
import { createHash } from "node:crypto";
import type { DeckRuntimeSnapshot, GameDocument } from "./state";
import { applyStartOfTurn } from "./actions";

export function setupActions(game: GameDocument, actorPlayerId: string): ProjectedAction[] {
  if (game.status !== "setup_pending") return [];
  const setup = game.state.setup;
  const choice = setup.battlefieldChoices[actorPlayerId];
  if (choice?.status === "unlocked") {
    return (setup.battlefieldPools[actorPlayerId] ?? []).map((cardId) => ({
      id: actionId(game, "lockBattlefield", cardId), label: "Choose battlefield",
      sourceCardInstanceId: cardId, enabled: true, disabledReason: null, targets: [],
      presentation: { surface: "setup-dialog", style: "primary", prompt: "Choose a battlefield." }
    }));
  }
  const allRevealed = setup.playerIds.every((id) => setup.battlefieldChoices[id]?.status === "revealed");
  if (allRevealed && setup.startingPlayerId === null && setup.startingPlayerChooserId === actorPlayerId) {
    return [{
      id: actionId(game, "chooseStartingPlayer"), label: "Choose starting player",
      sourceCardInstanceId: null, enabled: true, disabledReason: null,
      targets: [{ kind: "player", label: "starting player", legalIds: [...setup.playerIds], minimum: 1, maximum: 1 }],
      presentation: { surface: "choice-dialog", style: "primary", prompt: "Choose the starting player." }
    }];
  }
  if (setup.startingPlayerId !== null && setup.mulligans[actorPlayerId]?.status === "unlocked") {
    return [{
      id: actionId(game, "commitMulligan"), label: "Keep opening hand",
      sourceCardInstanceId: null, enabled: true, disabledReason: null,
      targets: [{ kind: "card", label: "cards to mulligan", legalIds: [...game.state.players[actorPlayerId]!.zones.hand], minimum: 0, maximum: 2 }],
      presentation: { surface: "choice-dialog", style: "primary", prompt: "Choose up to two cards to mulligan." }
    }];
  }
  return [];
}

export function performSetupAction(input: {
  game: GameDocument; actorPlayerId: string; actionId: string; selectedIds: string[];
  decksByPlayerId: Record<string, DeckRuntimeSnapshot>; now: string;
}): GameDocument {
  const legal = setupActions(input.game, input.actorPlayerId);
  const action = legal.find((candidate) => candidate.id === input.actionId);
  if (!action) throw new Error("Action is not legal for the current game state.");
  validateTargets(action, input.selectedIds);
  const game = structuredClone(input.game);
  const parts = action.id.split(":");
  const kind = parts[3];
  if (kind === "lockBattlefield") {
    const cardId = parts.slice(4).join(":");
    game.state.setup.battlefieldChoices[input.actorPlayerId] = { status: "locked", cardInstanceId: cardId };
    if (game.state.setup.playerIds.every((id) => game.state.setup.battlefieldChoices[id]?.status === "locked")) {
      for (const id of game.state.setup.playerIds) game.state.setup.battlefieldChoices[id]!.status = "revealed";
    }
  } else if (kind === "chooseStartingPlayer") {
    game.state.setup.startingPlayerId = input.selectedIds[0]!;
    initializeBoardAndHands(game, input.decksByPlayerId);
  } else if (kind === "commitMulligan") {
    game.state.setup.mulligans[input.actorPlayerId] = { status: "locked", selectedCardInstanceIds: input.selectedIds };
    if (input.selectedIds.length > 0) applyMulligan(game, input.actorPlayerId, input.selectedIds);
    if (game.state.setup.playerIds.every((id) => game.state.setup.mulligans[id]?.status === "locked")) {
      game.status = "in_progress";
      game.state.turn = { turnNumber: 1, activePlayerId: game.state.setup.startingPlayerId!, phase: "action" };
      applyStartOfTurn(game);
    }
  }
  game.stateVersion += 1;
  game.updatedAt = input.now;
  return game;
}

function initializeBoardAndHands(game: GameDocument, decks: Record<string, DeckRuntimeSnapshot>) {
  for (const playerId of game.state.setup.playerIds) {
    const deck = decks[playerId]!;
    const player = game.state.players[playerId]!;
    const legend = deck.instances.find((item) => item.source === "legend")!;
    const champion = deck.instances.find((item) => item.source === "champion")!;
    player.zones.legend = legend.instanceId;
    player.zones.champion = champion.instanceId;
    player.zones.mainDeck = deterministicShuffle(player.zones.mainDeck, `${game.id}:${playerId}:main`);
    player.zones.runeDeck = deterministicShuffle(player.zones.runeDeck, `${game.id}:${playerId}:rune`);
    player.zones.hand = player.zones.mainDeck.splice(0, 4);
    const selected = game.state.setup.battlefieldChoices[playerId]!.cardInstanceId!;
    game.state.battlefields.push({
      battlefieldId: selected,
      cardInstanceId: selected,
      selectedByPlayerId: playerId,
      controllerPlayerId: null,
      contestedByPlayerId: null,
      units: []
    });
  }
}

function applyMulligan(game: GameDocument, playerId: string, selected: string[]) {
  const zones = game.state.players[playerId]!.zones;
  zones.hand = zones.hand.filter((id) => !selected.includes(id));
  zones.mainDeck.push(...selected);
  zones.hand.push(...zones.mainDeck.splice(0, selected.length));
}

function deterministicShuffle(values: string[], seed: string): string[] {
  const score = (value: string) => createHash("sha256").update(seed).update(value).digest("hex");
  return [...values].sort((left, right) => score(left).localeCompare(score(right)));
}
function actionId(game: GameDocument, kind: string, suffix?: string) {
  return ["game", game.stateVersion, "setup", kind, suffix].filter((value) => value !== undefined).join(":");
}
function validateTargets(action: ProjectedAction, selected: string[]) {
  const requirement = action.targets[0];
  if (!requirement) {
    if (selected.length) throw new Error("Action does not accept targets.");
    return;
  }
  if (selected.length < requirement.minimum || selected.length > requirement.maximum || selected.some((id) => !requirement.legalIds.includes(id))) {
    throw new Error("Selected targets are not legal for this action.");
  }
}
