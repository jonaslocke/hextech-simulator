import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDeckValidationRequest,
  fingerprintDeckValidationRequest,
  validateRegisteredDeckCandidate,
} from "../src/server/deck/deck-validation-service";
import type { DeckSnapshotDocument } from "../src/server/game/repositories";
import type { CardInstance, DeckConfiguration } from "../src/server/game/state";
import type { GameCardDefinition } from "../src/server/game/schemas";

test("accepts a legal registered deck configuration and produces a stable fingerprint", () => {
  const fixture = buildFixture();
  const request = buildDeckValidationRequest(fixture);
  const result = validateRegisteredDeckCandidate({
    registeredDeck: fixture.registeredDeck,
    request,
  });

  assert.equal(result.legal, true);
  assert.deepEqual(result.summary, {
    activeCardCount: 40,
    mainDeckCount: 39,
    sideboardCount: 2,
    signatureCount: 0,
  });
  assert.equal(result.fingerprint, fingerprintDeckValidationRequest(request));
});

test("reports registered-card identity and fixed-section violations", () => {
  const fixture = buildFixture();
  const request = buildDeckValidationRequest(fixture);
  request.deck.mainDeckRegisteredCardIds = [
    ...request.deck.mainDeckRegisteredCardIds.slice(0, 38),
    "missing-registered-card",
  ];
  request.deck.runeDeckRegisteredCardIds = [];

  const result = validateRegisteredDeckCandidate({
    registeredDeck: fixture.registeredDeck,
    request,
  });
  const reasons = new Set(result.reasons.map((reason) => reason.code));

  assert.equal(result.legal, false);
  assert.equal(reasons.has("deck.unknownRegisteredCard"), true);
  assert.equal(reasons.has("deck.runeCount"), true);
  assert.equal(reasons.has("deck.fixedSectionChanged"), true);
});

function buildFixture(): {
  registeredDeck: DeckSnapshotDocument;
  configuration: DeckConfiguration;
} {
  const copies: CardInstance[] = [];
  const cards: GameCardDefinition[] = [];

  add("legend", "legend", "Legend", ["TestLegend"]);
  add("champion", "champion", "Unit", ["TestLegend"], "Champion");
  for (let index = 0; index < 39; index += 1) {
    add(`main-${index}`, "mainDeck", "Spell", ["Colorless"]);
  }
  for (let index = 0; index < 12; index += 1) {
    add(`rune-${index}`, "runeDeck", "Rune", ["Colorless"]);
  }
  for (let index = 0; index < 3; index += 1) {
    add(`battlefield-${index}`, "battlefield", "Battlefield", ["Colorless"]);
  }
  for (let index = 0; index < 2; index += 1) {
    add(`side-${index}`, "sideboard", "Spell", ["Colorless"]);
  }

  const registeredDeck: DeckSnapshotDocument = {
    id: "registered-deck",
    createdAt: "now",
    updatedAt: "now",
    matchId: "match",
    playerId: "p1",
    snapshot: {
      sourceText: "synthetic",
      catalogDigest: "synthetic",
      entries: [],
      cards,
    },
    instances: copies,
  };
  const configuration: DeckConfiguration = {
    chosenChampionRegisteredCardId: "champion",
    mainDeckRegisteredCardIds: copies
      .filter((copy) => copy.source === "mainDeck")
      .map((copy) => copy.registeredCardId!),
    sideboardRegisteredCardIds: copies
      .filter((copy) => copy.source === "sideboard")
      .map((copy) => copy.registeredCardId!),
  };
  return { registeredDeck, configuration };

  function add(
    id: string,
    source: CardInstance["source"],
    type: "Battlefield" | "Legend" | "Rune" | "Spell" | "Unit",
    domains: string[],
    supertype: string | null = null,
  ) {
    copies.push({
      instanceId: id,
      registeredCardId: id,
      ownerPlayerId: "p1",
      source,
      cardCode: id,
    });
    cards.push({
      cardCode: id,
      sourceTextHash: `hash:${id}`,
      card: {
        id,
        name: `Synthetic ${id}`,
        public_code: id,
        attributes: { energy: type === "Spell" ? 1 : null, might: type === "Unit" ? 1 : null, power: null },
        classification: {
          type,
          supertype,
          rarity: null,
          domain: domains,
        },
        text: { plain: "" },
        set: { set_id: "synthetic", label: "Synthetic" },
        media: {},
        tags: domains,
        metadata: {},
      },
      behaviorModel: { playTimings: [], clauses: [] },
    } as GameCardDefinition);
  }
}
