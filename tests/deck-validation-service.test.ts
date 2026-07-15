import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildDeckValidationRequest,
  fingerprintDeckValidationRequest,
  validateRegisteredDeckCandidate,
} from "../src/server/deck/deck-validation-service";
import { deckValidationRequestSchema } from "../src/shared/deck-validation";
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

test("reports every deck count boundary independently", () => {
  const cases = [
    ["deck.mainDeckSize", (request: ReturnType<typeof buildDeckValidationRequest>) => { request.deck.mainDeckRegisteredCardIds.pop(); }],
    ["deck.activeDeckSize", (request: ReturnType<typeof buildDeckValidationRequest>) => { request.deck.mainDeckRegisteredCardIds.pop(); }],
    ["deck.runeCount", (request: ReturnType<typeof buildDeckValidationRequest>) => { request.deck.runeDeckRegisteredCardIds.pop(); }],
    ["deck.battlefieldCount", (request: ReturnType<typeof buildDeckValidationRequest>) => { request.deck.battlefieldRegisteredCardIds.pop(); }],
    ["deck.sideboardSize", (request: ReturnType<typeof buildDeckValidationRequest>) => {
      request.deck.sideboardRegisteredCardIds.push(...Array.from({ length: 7 }, (_, index) => `side-${index % 2}`));
    }],
  ] as const;

  for (const [code, mutate] of cases) {
    const fixture = buildFixture();
    const request = buildDeckValidationRequest(fixture);
    mutate(request);
    assert.equal(
      validateRegisteredDeckCandidate({ registeredDeck: fixture.registeredDeck, request }).reasons.some(
        (reason) => reason.code === code,
      ),
      true,
      code,
    );
  }
});

test("rejects empty legend and champion identifiers at the request boundary", () => {
  const request = buildDeckValidationRequest(buildFixture());
  const emptyLegend = structuredClone(request);
  emptyLegend.deck.legendRegisteredCardId = "";
  assert.throws(() => deckValidationRequestSchema.parse(emptyLegend));

  const emptyChampion = structuredClone(request);
  emptyChampion.deck.chosenChampionRegisteredCardId = "";
  assert.throws(() => deckValidationRequestSchema.parse(emptyChampion));
});

test("reports duplicate and mutable-partition violations", () => {
  const fixture = buildFixture();
  const duplicate = buildDeckValidationRequest(fixture);
  duplicate.deck.mainDeckRegisteredCardIds[1] = duplicate.deck.mainDeckRegisteredCardIds[0]!;
  const duplicateResult = validateRegisteredDeckCandidate({
    registeredDeck: fixture.registeredDeck,
    request: duplicate,
  });
  assert.equal(duplicateResult.reasons.some((reason) => reason.code === "deck.duplicateRegisteredCard"), true);

  const partition = buildDeckValidationRequest(fixture);
  partition.deck.sideboardRegisteredCardIds = [];
  const partitionResult = validateRegisteredDeckCandidate({
    registeredDeck: fixture.registeredDeck,
    request: partition,
  });
  assert.equal(partitionResult.reasons.some((reason) => reason.code === "deck.mutablePartition"), true);
});

test("reports type placement and champion compatibility violations", () => {
  const fixture = buildFixture();
  const typeRequest = buildDeckValidationRequest(fixture);
  typeRequest.deck.chosenChampionRegisteredCardId = "main-0";
  typeRequest.deck.mainDeckRegisteredCardIds = [
    ...typeRequest.deck.mainDeckRegisteredCardIds.slice(1),
    "champion",
  ];
  const typeReasons = validateRegisteredDeckCandidate({
    registeredDeck: fixture.registeredDeck,
    request: typeRequest,
  }).reasons;
  assert.equal(typeReasons.some((reason) => reason.code === "deck.typePlacement"), true);

  const compatibility = buildFixture();
  compatibility.registeredDeck.snapshot.cards.find((card) => card.cardCode === "champion")!.card.tags = ["OtherLegend"];
  const compatibilityReasons = validateRegisteredDeckCandidate({
    registeredDeck: compatibility.registeredDeck,
    request: buildDeckValidationRequest(compatibility),
  }).reasons;
  assert.equal(compatibilityReasons.some((reason) => reason.code === "deck.championTag"), true);
});

test("reports domain identity violations for active and Rune sections", () => {
  const mainFixture = buildFixture();
  mainFixture.registeredDeck.snapshot.cards.find((card) => card.cardCode === "main-0")!.card.classification.domain = ["Other"];
  const mainReasons = validateRegisteredDeckCandidate({
    registeredDeck: mainFixture.registeredDeck,
    request: buildDeckValidationRequest(mainFixture),
  }).reasons;
  assert.equal(mainReasons.some((reason) => reason.code === "deck.domainIdentity"), true);

  const runeFixture = buildFixture();
  runeFixture.registeredDeck.snapshot.cards.find((card) => card.cardCode === "rune-0")!.card.classification.domain = ["Other"];
  const runeReasons = validateRegisteredDeckCandidate({
    registeredDeck: runeFixture.registeredDeck,
    request: buildDeckValidationRequest(runeFixture),
  }).reasons;
  assert.equal(runeReasons.some((reason) => reason.code === "deck.runeDomainIdentity"), true);
});

test("reports signature tag and signature-count limits", () => {
  const tagFixture = buildFixture();
  const tagCard = tagFixture.registeredDeck.snapshot.cards.find((card) => card.cardCode === "main-0")!;
  tagCard.card.classification.supertype = "Signature";
  tagCard.card.metadata.signature = true;
  tagCard.card.tags = ["OtherLegend"];
  const tagReasons = validateRegisteredDeckCandidate({
    registeredDeck: tagFixture.registeredDeck,
    request: buildDeckValidationRequest(tagFixture),
  }).reasons;
  assert.equal(tagReasons.some((reason) => reason.code === "deck.signatureTag"), true);

  const limitFixture = buildFixture();
  for (let index = 0; index < 4; index += 1) {
    const signature = limitFixture.registeredDeck.snapshot.cards.find((card) => card.cardCode === `main-${index}`)!;
    signature.card.classification.supertype = "Signature";
    signature.card.metadata.signature = true;
    signature.card.tags = ["TestLegend"];
  }
  const limitResult = validateRegisteredDeckCandidate({
    registeredDeck: limitFixture.registeredDeck,
    request: buildDeckValidationRequest(limitFixture),
  });
  assert.equal(limitResult.summary.signatureCount, 4);
  assert.equal(limitResult.reasons.some((reason) => reason.code === "deck.signatureLimit"), true);
});

test("reports canonical copy limits and missing definitions", () => {
  const copyFixture = buildFixture();
  for (let index = 0; index < 4; index += 1) {
    const card = copyFixture.registeredDeck.snapshot.cards.find((item) => item.cardCode === `main-${index}`)!;
    card.card.name = "Synthetic Repeated Card";
  }
  const copyReasons = validateRegisteredDeckCandidate({
    registeredDeck: copyFixture.registeredDeck,
    request: buildDeckValidationRequest(copyFixture),
  }).reasons;
  assert.equal(copyReasons.some((reason) => reason.code === "deck.copyLimit"), true);

  const missingFixture = buildFixture();
  missingFixture.registeredDeck.snapshot.cards = missingFixture.registeredDeck.snapshot.cards.filter(
    (card) => card.cardCode !== "main-0",
  );
  const missingReasons = validateRegisteredDeckCandidate({
    registeredDeck: missingFixture.registeredDeck,
    request: buildDeckValidationRequest(missingFixture),
  }).reasons;
  assert.equal(missingReasons.some((reason) => reason.code === "deck.cardDefinitionMissing"), true);
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
