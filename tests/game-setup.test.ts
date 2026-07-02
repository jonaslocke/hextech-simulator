import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { loadCardCatalog } from "../src/server/catalog";
import { analyzeCardBehaviorSuggestions, buildBehaviorDefinitionDocument, buildCanonicalCardDocument, buildCurrentBehaviorCatalog, hashCardRulesText } from "../src/server/card-catalog";
import { parseDeckList } from "../src/server/deck";
import { buildDeckSnapshotV2, createInitialGameV2, createRuntimeDeckSnapshot, performSetupActionV2, projectGameV2, setupActionsV2 } from "../src/server/game-v2";

test("completes v2 setup through projected opaque actions", async () => {
  const template = await fixtureSnapshot();
  const decks = [createRuntimeDeckSnapshot(template, "p1"), createRuntimeDeckSnapshot(template, "p2")] as const;
  const documents = decks.map((deck, index) => ({ id: `d${index}`, createdAt: "a", updatedAt: "a", matchId: "m", playerId: index ? "p2" : "p1", snapshot: deck.template, instances: deck.instances }));
  let game = createInitialGameV2({ matchId: "m", gameId: "g", now: "2026-01-01T00:00:00.000Z", rngSeed: "seed", playerIds: ["p1", "p2"], decks: [decks[0], decks[1]] });
  const byPlayer = { p1: decks[0], p2: decks[1] };
  const initialProjection = projectGameV2({ game, viewerPlayerId: "p1", decks: documents });
  assert.equal(initialProjection.setup.battlefieldPool.length, game.state.setup.battlefieldPools.p1?.length);
  assert.ok(initialProjection.actions.every((action) => action.presentation.surface === "setup-dialog"));
  for (const playerId of ["p1", "p2"]) {
    const action = setupActionsV2(game, playerId)[0]!;
    game = performSetupActionV2({ game, actorPlayerId: playerId, actionId: action.id, selectedIds: [], decksByPlayerId: byPlayer, now: "2026-01-01T00:00:01.000Z" });
    if (playerId === "p1") {
      const waiting = projectGameV2({ game, viewerPlayerId: "p1", decks: documents });
      assert.equal(waiting.setup.waitingReason, "Waiting for the other player to choose a battlefield.");
      assert.equal(projectGameV2({ game, viewerPlayerId: "p2", decks: documents }).setup.battlefieldChoices.p1?.cardInstanceId, null);
    }
  }
  const chooser = game.state.setup.startingPlayerChooserId;
  const choose = setupActionsV2(game, chooser)[0]!;
  game = performSetupActionV2({ game, actorPlayerId: chooser, actionId: choose.id, selectedIds: ["p1"], decksByPlayerId: byPlayer, now: "2026-01-01T00:00:02.000Z" });
  assert.equal(game.state.players.p1?.zones.hand.length, 4);
  assert.equal(game.state.battlefields.length, 2);
  for (const playerId of ["p1", "p2"]) {
    const mulligan = setupActionsV2(game, playerId)[0]!;
    game = performSetupActionV2({ game, actorPlayerId: playerId, actionId: mulligan.id, selectedIds: [], decksByPlayerId: byPlayer, now: "2026-01-01T00:00:03.000Z" });
  }
  assert.equal(game.status, "in_progress");
  const projection = projectGameV2({ game, viewerPlayerId: "p1", decks: documents });
  assert.equal(projection.players.find((player) => !player.isViewer)?.zones.find((zone) => zone.kind === "hand")?.cards.length, 0);
});

async function fixtureSnapshot() {
  const sourceText = await readFile("data/decks/lux.dec.txt", "utf8");
  const catalog = await loadCardCatalog();
  const cards = [...new Set(parseDeckList(sourceText).entries.map((entry) => entry.name))].map((name) => catalog.byName.get(name)!);
  const primitives = await buildCurrentBehaviorCatalog();
  const report = analyzeCardBehaviorSuggestions(cards, [], primitives);
  const docs = cards.map((card) => {
    const code = card.public_code.split("/")[0]!;
    const suggestion = report.cards.find((item) => item.cardCode === code)!;
    return buildCanonicalCardDocument({ cardCode: code, card, sourceTextHash: hashCardRulesText(card), modelingStatus: "approved", adminNotes: "", clauses: suggestion.clauses.map((clause) => ({ id: clause.id, sourceText: clause.sourceText, normalizedText: clause.normalizedText, unsupportedReason: clause.unsupportedReason, assignments: clause.assignments.map((item) => item.assignment) })) }, primitives, "a", "b");
  });
  return buildDeckSnapshotV2(sourceText, docs, primitives.map((item) => buildBehaviorDefinitionDocument(item, "a")));
}
