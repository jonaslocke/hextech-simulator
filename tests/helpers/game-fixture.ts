import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildCanonicalCardDocument, buildCurrentBehaviorCatalog } from "../../src/server/card-catalog";
import { buildOrnnCanonicalPublication } from "../../src/server/card-catalog/ornn-canonical-publications";
import { loadCardCatalog } from "../../src/server/catalog";
import { parseDeckList, resolveDeckCard } from "../../src/server/deck";
import { buildDeckSnapshot, createInitialGame, createRuntimeDeckSnapshot, type DeckSnapshotDocument } from "../../src/server/game";

// Real source list and publication path: regressions must exercise the canonical
// models that fresh matches receive, not substitute implementations of the cards.
export async function gameFixture() {
  const [catalog, source, behaviors] = await Promise.all([
    loadCardCatalog(),
    readFile("data/decks/Ornn, Fire Below the Mountain , a deck by MICE TheMаnLаnd.txt", "utf8"),
    buildCurrentBehaviorCatalog(),
  ]);
  const cards = [...new Map(parseDeckList(source).entries.map((entry) => {
    const card = resolveDeckCard(catalog, entry.name);
    assert.ok(card, `Missing source card: ${entry.name}`);
    return [card.public_code.split("/")[0]!, card] as const;
  })).values()];
  const now = "2026-09-09T00:00:00.000Z";
  const snapshot = buildDeckSnapshot(source, cards.map((card) =>
    buildCanonicalCardDocument(buildOrnnCanonicalPublication(card), behaviors, now, now),
  ), behaviors);
  const runtime = [createRuntimeDeckSnapshot(snapshot, "p1"), createRuntimeDeckSnapshot(snapshot, "p2")] as const;
  const decks: DeckSnapshotDocument[] = runtime.map((deck, i) => ({
    id: `deck-${i}`, createdAt: now, updatedAt: now, matchId: "game-fixture", playerId: `p${i + 1}`,
    snapshot, instances: deck.instances,
  }));
  const game = createInitialGame({ matchId: "game-fixture", now, rngSeed: "game-fixture", playerIds: ["p1", "p2"], decks: [...runtime] });
  game.status = "in_progress";
  game.state.setup.startingPlayerId = "p1";
  game.state.turn = { activePlayerId: "p1", turnNumber: 3, phase: "action" };
  for (const deck of decks) {
    game.state.players[deck.playerId]!.zones.legend = deck.instances.find((instance) => instance.source === "legend")!.instanceId;
  }
  function id(code: string, playerId = "p1", copy = 0) {
    const instance = decks.find((deck) => deck.playerId === playerId)!.instances.filter((instance) => instance.cardCode === code)[copy];
    assert.ok(instance, `Missing ${playerId} copy ${copy} of ${code}`);
    return instance.instanceId;
  }
  function place(code: string, zone: "base" | "hand", playerId = "p1", copy = 0) {
    const instanceId = id(code, playerId, copy);
    const zones = game.state.players[playerId]!.zones;
    for (const name of ["mainDeck", "runeDeck", "hand", "base", "trash", "banishment"] as const) {
      zones[name] = zones[name].filter((candidate) => candidate !== instanceId);
    }
    zones[zone].push(instanceId);
    return instanceId;
  }
  return { game, decks, id, place };
}
