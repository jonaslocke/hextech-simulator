import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  buildCanonicalCardDocument,
  buildCurrentBehaviorCatalog,
} from "../src/server/card-catalog";
import { buildOrnnCanonicalPublication } from "../src/server/card-catalog/ornn-canonical-publications";
import { loadCardCatalog } from "../src/server/catalog";
import { parseDeckList, resolveDeckCard } from "../src/server/deck";
import {
  buildDeckSnapshot,
  createInitialGame,
  createRuntimeDeckSnapshot,
} from "../src/server/game";

const sourcePath =
  "data/decks/Ornn, Fire Below the Mountain , a deck by MICE TheMаnLаnd.txt";

test("Ornn's exact Main Deck and Sideboard compile as approved executable canonical cards", async () => {
  const [catalog, source, behaviorCatalog] = await Promise.all([
    loadCardCatalog(),
    readFile(sourcePath, "utf8"),
    buildCurrentBehaviorCatalog(),
  ]);
  const deck = parseDeckList(source);
  const cards = [
    ...new Map(
      deck.entries.map((entry) => {
        const card = resolveDeckCard(catalog, entry.name);
        assert.ok(card, `Missing source card: ${entry.name}`);
        return [card.public_code.split("/")[0]!, card];
      }),
    ).values(),
  ];
  const canonicalCards = cards.map((card) =>
    buildCanonicalCardDocument(
      buildOrnnCanonicalPublication(card),
      behaviorCatalog,
      "2026-09-07T00:00:00.000Z",
      "2026-09-07T00:00:00.000Z",
    ),
  );

  assert.equal(canonicalCards.length, 29);
  assert.ok(
    canonicalCards.every((card) => card.runtimeSupportStatus === "supported"),
  );
  const canonicalByCode = new Map(
    canonicalCards.map((card) => [card.cardCode, card]),
  );
  const sterak = canonicalByCode.get("SFD-056");
  assert.equal(sterak?.card.attributes.might, 3);
  assert.ok(
    sterak?.behaviorModel.clauses.some((clause) =>
      clause.keywords.some(
        (binding) => binding.behaviorId === "keyword.quick_draw",
      ),
    ),
    "Sterak's Gage retains its inherent Quick-Draw keyword",
  );
  assert.ok(
    sterak?.behaviorModel.clauses.some((clause) =>
      clause.triggers.some(
        (binding) => binding.behaviorId === "trigger.on_play",
      ) &&
      clause.effects.some(
        (binding) => binding.behaviorId === "action.attach_equipment",
      ),
    ),
    "Sterak's Gage attaches through its on-play triggered ability",
  );
  const defy = canonicalByCode.get("OGN-045");
  const defySelector = defy?.behaviorModel.clauses
    .flatMap((clause) => clause.selectors)
    .find((binding) => binding.behaviorId === "selector.chain_item");
  assert.deepEqual(defySelector?.parameters, {
    itemKind: "spell",
    controller: "opponent",
    maximumEnergyCost: 4,
    maximumPowerCost: 1,
    minimumCount: 1,
    maximumCount: 1,
    selectionKey: "spell",
  });
  const blacksmith = canonicalByCode.get("SFD-058");
  assert.ok(
    blacksmith?.behaviorModel.clauses.every((clause) =>
      clause.effects.some(
        (binding) =>
          binding.behaviorId === "action.search_top_deck" &&
          binding.parameters.maximumSelect === 1,
      ),
    ),
    "Ornn, Blacksmith uses the generic optional one-Gear selection effect",
  );
  const snapshot = buildDeckSnapshot(source, canonicalCards, behaviorCatalog);
  assert.equal(snapshot.cards.length, 29);
  assert.equal(
    snapshot.entries.filter((entry) => entry.section === "Sideboard").length,
    6,
  );
  assert.equal(
    snapshot.entries
      .filter((entry) => entry.section === "Sideboard")
      .reduce((total, entry) => total + entry.quantity, 0),
    10,
  );
  const firstDeck = createRuntimeDeckSnapshot(snapshot, "p1");
  const secondDeck = createRuntimeDeckSnapshot(snapshot, "p2");
  const game = createInitialGame({
    matchId: "ornn-fresh-match",
    gameId: "ornn-fresh-game",
    now: "2026-09-07T00:00:00.000Z",
    rngSeed: "ornn-fresh-seed",
    playerIds: ["p1", "p2"],
    decks: [firstDeck, secondDeck],
  });
  assert.equal(game.status, "setup_pending");
  assert.equal(game.state.setup.battlefieldPools.p1?.length, 3);
  assert.equal(game.state.players.p1?.zones.runeDeck.length, 12);
});
