import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  analyzeCardBehaviorSuggestions, buildBehaviorDefinitionDocument,
  buildCanonicalCardDocument, buildCurrentBehaviorCatalog, hashCardRulesText
} from "../src/server/card-catalog";
import { loadCardCatalog } from "../src/server/catalog";
import { parseDeckList } from "../src/server/deck";
import {
  buildDeckSnapshotV2, compileBehaviorModelV2, createInitialGameV2,
  createPrimitiveHandlersV2, createRuntimeCardIndexV2, createRuntimeDeckSnapshot,
  gameplayActionsV2, performGameplayActionV2, performSetupActionV2,
  projectGameV2, setupActionsV2, type DeckSnapshotDocumentV2
} from "../src/server/game-v2";

test("runs a Lux mirror through the complete game v2 launch acceptance flow", async () => {
  const template = await approvedDeckFixture();
  assert.equal(template.cards.length, 21);
  const runtime = [createRuntimeDeckSnapshot(template, "p1"), createRuntimeDeckSnapshot(template, "p2")] as const;
  const decks: DeckSnapshotDocumentV2[] = runtime.map((deck, index) => ({
    id: `d${index}`, createdAt: "a", updatedAt: "a", matchId: "m",
    playerId: index ? "p2" : "p1", snapshot: deck.template, instances: deck.instances
  }));
  const handlers = createPrimitiveHandlersV2(createRuntimeCardIndexV2(decks));
  template.cards.forEach((definition) => compileBehaviorModelV2(definition.behaviorModel, handlers));

  let game = createInitialGameV2({ matchId: "m", gameId: "g", now: "2026-01-01T00:00:00.000Z", rngSeed: "seed", playerIds: ["p1", "p2"], decks: [runtime[0], runtime[1]] });
  const byPlayer = { p1: runtime[0], p2: runtime[1] };
  for (const playerId of ["p1", "p2"]) {
    const chooseBattlefield = setupActionsV2(game, playerId)[0]!;
    game = performSetupActionV2({ game, actorPlayerId: playerId, actionId: chooseBattlefield.id, selectedIds: [], decksByPlayerId: byPlayer, now: "b" });
  }
  const chooser = game.state.setup.startingPlayerChooserId;
  const chooseStarting = setupActionsV2(game, chooser)[0]!;
  game = performSetupActionV2({ game, actorPlayerId: chooser, actionId: chooseStarting.id, selectedIds: ["p1"], decksByPlayerId: byPlayer, now: "c" });
  for (const playerId of ["p1", "p2"]) {
    const mulligan = setupActionsV2(game, playerId)[0]!;
    game = performSetupActionV2({ game, actorPlayerId: playerId, actionId: mulligan.id, selectedIds: [], decksByPlayerId: byPlayer, now: "d" });
  }
  assert.equal(game.status, "in_progress");
  assertPrivateProjection(game, decks, "p1", "p2");
  assertPrivateProjection(game, decks, "p2", "p1");

  const stupefy = instanceNamed(decks, "p1", "Stupefy");
  const ravenbloom = instanceNamed(decks, "p1", "Ravenbloom Student");
  const mover = instanceNamed(decks, "p1", "Vanguard Sergeant");
  const enemy = instanceNamed(decks, "p2", "Vanguard Sergeant");
  const p1Runes = decks.find((deck) => deck.playerId === "p1")!.instances
    .filter((instance) => instance.source === "runeDeck")
    .map((instance) => instance.instanceId);
  p1Runes.forEach((id) => relocate(game, "p1", id, "base"));
  relocate(game, "p1", stupefy, "hand");
  relocate(game, "p1", mover, "base");
  relocateToBattlefield(game, "p1", ravenbloom);
  relocateToBattlefield(game, "p2", enemy);

  const readyRunesBefore = p1Runes.filter((id) => !game.state.cardStates[id]!.exhausted).length;
  const runeDeckBefore = game.state.players.p1!.zones.runeDeck.length;
  const handBefore = game.state.players.p1!.zones.hand.length;
  const enemyMightBefore = game.state.cardStates[enemy]!.computedMight!;
  const ravenbloomMightBefore = game.state.cardStates[ravenbloom]!.computedMight!;
  const play = gameplayActionsV2(game, "p1", decks).find((action) => action.sourceCardInstanceId === stupefy)!;
  assert.ok(play, "Stupefy should be payable directly from ready Basic Runes");
  assert.ok(play.targets[0]!.legalIds.includes(enemy));
  game = performGameplayActionV2({ game, actorPlayerId: "p1", actionId: play.id, selectedIds: [enemy], decks, now: "e" });
  assert.ok(game.state.chain?.items.some((item) => item.sourceCardInstanceId === stupefy));
  assert.ok(
    p1Runes.some((id) => game.state.cardStates[id]!.exhausted) || game.state.players.p1!.zones.runeDeck.length > runeDeckBefore,
    "playing Stupefy should pay its costs from Rune abilities"
  );
  assert.ok(p1Runes.filter((id) => !game.state.cardStates[id]!.exhausted).length < readyRunesBefore);

  game = passUntilCurrentChainItemResolves(game, decks, "f");
  assert.equal(game.state.cardStates[enemy]!.computedMight, enemyMightBefore - 1);
  assert.ok(game.state.players.p1!.zones.trash.includes(stupefy));
  assert.equal(game.state.players.p1!.zones.hand.length, handBefore);
  assert.ok(game.state.chain?.items.some((item) => item.sourceCardInstanceId === ravenbloom));

  game = passUntilCurrentChainItemResolves(game, decks, "g");
  assert.equal(game.state.chain, null);
  assert.equal(game.state.cardStates[ravenbloom]!.computedMight, ravenbloomMightBefore + 1);

  const move = gameplayActionsV2(game, "p1", decks).find((action) => action.sourceCardInstanceId === mover && action.label.startsWith("Move to "))!;
  game = performGameplayActionV2({ game, actorPlayerId: "p1", actionId: move.id, selectedIds: [], decks, now: "h" });
  assert.ok(game.state.showdown);
  assert.ok(game.state.battlefields.some((battlefield) => battlefield.units.includes(mover)));
  game = passUntilShowdownCloses(game, decks, "i");

  const p1View = projectGameV2({ game, viewerPlayerId: "p1", decks });
  const p2View = projectGameV2({ game, viewerPlayerId: "p2", decks });
  assert.ok(p1View.battlefields.some((battlefield) => battlefield.units.some((unit) => unit.instanceId === mover)));
  assert.ok(p2View.battlefields.some((battlefield) => battlefield.units.some((unit) => unit.instanceId === mover)));
  assertPrivateProjection(game, decks, "p1", "p2");
  assertPrivateProjection(game, decks, "p2", "p1");

  const endTurn = gameplayActionsV2(game, "p1", decks).find((action) => action.label === "End turn")!;
  game = performGameplayActionV2({ game, actorPlayerId: "p1", actionId: endTurn.id, selectedIds: [], decks, now: "j" });
  assert.equal(game.state.turn?.activePlayerId, "p2");
  assert.equal(game.state.cardStates[enemy]!.computedMight, enemyMightBefore);
  assert.equal(game.state.cardStates[ravenbloom]!.computedMight, ravenbloomMightBefore);
});

function assertPrivateProjection(
  game: Parameters<typeof projectGameV2>[0]["game"],
  decks: DeckSnapshotDocumentV2[],
  viewerPlayerId: string,
  opponentPlayerId: string
) {
  const projection = projectGameV2({ game, viewerPlayerId, decks });
  const viewer = projection.players.find((player) => player.playerId === viewerPlayerId)!;
  const opponent = projection.players.find((player) => player.playerId === opponentPlayerId)!;
  assert.equal(viewer.zones.find((zone) => zone.kind === "hand")!.cards.length, game.state.players[viewerPlayerId]!.zones.hand.length);
  assert.equal(opponent.zones.find((zone) => zone.kind === "hand")!.cards.length, 0);
  assert.equal(opponent.zones.find((zone) => zone.kind === "mainDeck")!.cards.length, 0);
  assert.equal(opponent.zones.find((zone) => zone.kind === "runeDeck")!.cards.length, 0);
}

function passUntilCurrentChainItemResolves(
  initial: Parameters<typeof gameplayActionsV2>[0],
  decks: DeckSnapshotDocumentV2[],
  now: string
) {
  let game = initial;
  for (let passIndex = 0; passIndex < 2; passIndex += 1) {
    assert.ok(game.state.chain, "The chain closed before both players passed");
    const actor = game.state.chain.priorityPlayerId;
    const pass = gameplayActionsV2(game, actor, decks).find((action) => action.label === "Pass priority")!;
    game = performGameplayActionV2({ game, actorPlayerId: actor, actionId: pass.id, selectedIds: [], decks, now });
  }
  return game;
}

function passUntilShowdownCloses(
  initial: Parameters<typeof gameplayActionsV2>[0],
  decks: DeckSnapshotDocumentV2[],
  now: string
) {
  let game = initial;
  for (let passIndex = 0; passIndex < 2; passIndex += 1) {
    assert.ok(game.state.showdown, "The showdown closed before both players passed");
    const actor = game.state.showdown.priorityPlayerId;
    const pass = gameplayActionsV2(game, actor, decks).find((action) => action.label === "Pass priority")!;
    game = performGameplayActionV2({ game, actorPlayerId: actor, actionId: pass.id, selectedIds: [], decks, now });
  }
  return game;
}

function instanceNamed(decks: DeckSnapshotDocumentV2[], playerId: string, name: string) {
  const deck = decks.find((item) => item.playerId === playerId)!;
  const cardCode = deck.snapshot.cards.find((definition) => definition.card.name === name)!.cardCode;
  return deck.instances.find((instance) => instance.cardCode === cardCode)!.instanceId;
}

function relocate(
  game: Parameters<typeof gameplayActionsV2>[0],
  playerId: string,
  cardId: string,
  destination: "base" | "hand"
) {
  const player = game.state.players[playerId]!;
  for (const [key, value] of Object.entries(player.zones)) {
    if (Array.isArray(value)) {
      (player.zones as unknown as Record<string, string[]>)[key] = value.filter((id) => id !== cardId);
    }
  }
  game.state.battlefields.forEach((battlefield) => {
    battlefield.units = battlefield.units.filter((id) => id !== cardId);
  });
  player.zones[destination].push(cardId);
  game.state.cardStates[cardId]!.exhausted = false;
}

function relocateToBattlefield(
  game: Parameters<typeof gameplayActionsV2>[0],
  playerId: string,
  cardId: string
) {
  relocate(game, playerId, cardId, "base");
  const battlefield = game.state.battlefields.find((candidate) => candidate.selectedByPlayerId === playerId)!;
  game.state.players[playerId]!.zones.base = game.state.players[playerId]!.zones.base.filter((id) => id !== cardId);
  battlefield.units.push(cardId);
}

async function approvedDeckFixture() {
  const sourceText = await readFile("data/decks/lux.dec.txt", "utf8");
  const catalog = await loadCardCatalog();
  const cards = [...new Set(parseDeckList(sourceText).entries.map((entry) => entry.name))].map((name) => catalog.byName.get(name)!);
  const primitives = await buildCurrentBehaviorCatalog();
  const report = analyzeCardBehaviorSuggestions(cards, [], primitives);
  const documents = cards.map((card) => {
    const cardCode = card.public_code.split("/")[0]!;
    const suggestion = report.cards.find((item) => item.cardCode === cardCode)!;
    return buildCanonicalCardDocument({ cardCode, card, sourceTextHash: hashCardRulesText(card), modelingStatus: "approved", adminNotes: "", clauses: suggestion.clauses.map((clause) => ({ id: clause.id, sourceText: clause.sourceText, normalizedText: clause.normalizedText, unsupportedReason: clause.unsupportedReason, assignments: clause.assignments.map((item) => item.assignment) })) }, primitives, "a", "b");
  });
  return buildDeckSnapshotV2(sourceText, documents, primitives.map((entry) => buildBehaviorDefinitionDocument(entry, "a")));
}
