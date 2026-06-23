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

test("runs the approved 21-card deck through v2 setup and catalog-driven resource actions", async () => {
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
  const p1View = projectGameV2({ game, viewerPlayerId: "p1", decks });
  const p2Hand = p1View.players.find((player) => player.playerId === "p2")!.zones.find((zone) => zone.kind === "hand")!;
  assert.equal(p2Hand.cards.length, 0);

  const channel = gameplayActionsV2(game, "p1", decks).find((action) => action.label === "Channel a rune")!;
  game = performGameplayActionV2({ game, actorPlayerId: "p1", actionId: channel.id, selectedIds: [], decks, now: "e" });
  const addEnergy = gameplayActionsV2(game, "p1", decks).find((action) => action.label === "Add Energy")!;
  game = performGameplayActionV2({ game, actorPlayerId: "p1", actionId: addEnergy.id, selectedIds: [], decks, now: "f" });
  assert.equal(game.state.players.p1!.energy, 1);
});

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
