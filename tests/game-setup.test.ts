import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createInitialGame,
  createRuntimeDeckSnapshot,
  performSetupAction,
  projectGame,
  setupActions,
  type DeckSnapshot,
  type GameCardDefinition,
} from "../src/server/game";

test("completes setup through projected opaque actions", async () => {
  const template = await fixtureSnapshot();
  const decks = [createRuntimeDeckSnapshot(template, "p1"), createRuntimeDeckSnapshot(template, "p2")] as const;
  const documents = decks.map((deck, index) => ({ id: `d${index}`, createdAt: "a", updatedAt: "a", matchId: "m", playerId: index ? "p2" : "p1", snapshot: deck.template, instances: deck.instances }));
  let game = createInitialGame({ matchId: "m", gameId: "g", now: "2026-01-01T00:00:00.000Z", rngSeed: "seed", playerIds: ["p1", "p2"], decks: [decks[0], decks[1]] });
  const byPlayer = { p1: decks[0], p2: decks[1] };
  const initialProjection = projectGame({ game, viewerPlayerId: "p1", decks: documents });
  assert.equal(initialProjection.setup.battlefieldPool.length, game.state.setup.battlefieldPools.p1?.length);
  assert.ok(initialProjection.actions.every((action) => action.presentation.surface === "setup-dialog"));
  for (const playerId of ["p1", "p2"]) {
    const action = setupActions(game, playerId)[0]!;
    game = performSetupAction({ game, actorPlayerId: playerId, actionId: action.id, selectedIds: [], decksByPlayerId: byPlayer, now: "2026-01-01T00:00:01.000Z" });
    if (playerId === "p1") {
      const waiting = projectGame({ game, viewerPlayerId: "p1", decks: documents });
      assert.equal(waiting.setup.waitingReason, "Waiting for the other player to choose a battlefield.");
      assert.equal(projectGame({ game, viewerPlayerId: "p2", decks: documents }).setup.battlefieldChoices.p1?.cardInstanceId, null);
    }
  }
  const chooser = game.state.setup.startingPlayerChooserId;
  const choose = setupActions(game, chooser)[0]!;
  game = performSetupAction({ game, actorPlayerId: chooser, actionId: choose.id, selectedIds: ["p1"], decksByPlayerId: byPlayer, now: "2026-01-01T00:00:02.000Z" });
  assert.equal(game.state.players.p1?.zones.hand.length, 4);
  assert.equal(game.state.battlefields.length, 2);
  for (const playerId of ["p1", "p2"]) {
    const mulligan = setupActions(game, playerId)[0]!;
    game = performSetupAction({ game, actorPlayerId: playerId, actionId: mulligan.id, selectedIds: [], decksByPlayerId: byPlayer, now: "2026-01-01T00:00:03.000Z" });
  }
  assert.equal(game.status, "in_progress");
  const projection = projectGame({ game, viewerPlayerId: "p1", decks: documents });
  assert.equal(projection.players.find((player) => !player.isViewer)?.zones.find((zone) => zone.kind === "hand")?.cards.length, 0);
});

async function fixtureSnapshot() {
  const cards = [
    syntheticCard("LEGEND", "Synthetic Legend", "Legend", 0, 0),
    syntheticCard("CHAMPION", "Synthetic Champion", "Unit", 3, 3),
    syntheticCard("UNIT", "Synthetic Unit", "Unit", 1, 1),
    syntheticCard("RUNE", "Synthetic Rune", "Rune", 0, 0),
    syntheticCard("BATTLEFIELD", "Synthetic Battlefield", "Battlefield", 0, 0),
  ];
  const entries: DeckSnapshot["entries"] = [
    { section: "Legend", quantity: 1, cardCode: "LEGEND" },
    { section: "Champion", quantity: 1, cardCode: "CHAMPION" },
    { section: "MainDeck", quantity: 8, cardCode: "UNIT" },
    { section: "Runes", quantity: 8, cardCode: "RUNE" },
    { section: "Battlefields", quantity: 2, cardCode: "BATTLEFIELD" },
  ];
  return {
    sourceText: "synthetic setup deck",
    catalogDigest: "synthetic-setup",
    entries,
    cards,
  };
}

function syntheticCard(
  code: string,
  name: string,
  type: GameCardDefinition["card"]["classification"]["type"],
  energy: number,
  might: number,
): GameCardDefinition {
  return {
    cardCode: code,
    sourceTextHash: `${code}:hash`,
    behaviorModel: { playTimings: [], clauses: [] },
    card: {
      id: code,
      name,
      public_code: `${code}/1`,
      attributes: { energy, might, power: null },
      classification: {
        type,
        supertype: type === "Rune" ? "Basic" : null,
        domain: ["Mind"],
      },
      text: { plain: "" },
      set: { set_id: "SYNTHETIC", label: "Synthetic" },
      media: {},
      tags: [],
      metadata: {},
    },
  };
}
