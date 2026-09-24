import assert from "node:assert/strict";
import { test } from "node:test";
import type { Db } from "mongodb";
import {
  deckValidationRequestSchema, deckValidationResponseSchema, fingerprintDeckValidationRequest,
  type RegisteredDeckValidationRequest,
} from "../src/shared/deck-validation";
import { cardSchema, loadCardCatalog, type CardCatalog } from "../src/server/catalog";
import { deriveCardCodeFromCard } from "../src/server/card-catalog/identity";
import {
  buildBehaviorDefinitionDocument, buildCanonicalCardDocument, buildCurrentBehaviorCatalog,
  CANONICAL_CARDS_COLLECTION, BEHAVIORS_COLLECTION, hashCardRulesText,
  type CanonicalCardDocument,
} from "../src/server/card-catalog";
import {
  buildDeckValidationRequest, isEligibleChosenChampion, loadRegisteredDeckReadiness,
  validateDeckText, validateDeckTextCandidate, validateRegisteredDeckCandidate,
} from "../src/server/deck/deck-validation-service";
import { resolveDeckText } from "../src/server/deck/validator";
import { inspectCanonicalDeckReadiness } from "../src/server/game/catalog-readiness";
import type { DeckSnapshotDocument } from "../src/server/game/repositories";
import type { CardInstance } from "../src/server/game/state";
import { POST } from "../src/app/api/decks/validate/route";

test("construction enforces the tournament exact-40 Main Deck and shared Sideboard maximum", () => {
  for (const total of [39, 40, 41, 42]) {
    const fixture = deckFixture(total, 0);
    const text = validateDeckTextCandidate({ ...fixture, readinessReasons: [] });
    const registration = registeredFixture(fixture);
    const registered = validateRegisteredDeckCandidate(registration);
    assert.deepEqual(registered.reasons.map((reason) => reason.code), text.reasons.map((reason) => reason.code));
    assert.equal(text.legal, total === 40, JSON.stringify(text.reasons));
    assert.equal(registered.legal, total === 40, JSON.stringify(registered.reasons));
    assert.equal(text.summary.activeCardCount, total);
    assert.equal(text.summary.mainDeckCount, total - 1);
    assert.deepEqual(registered.summary, text.summary);
    assert.equal(text.constraints.mainDeck.exact, 40);
    assert.equal(text.constraints.mainDeck.includesChosenChampion, true);
    assert.equal(text.constraints.sideboard.exact, null);
    assert.equal(registered.constraints.sideboard.exact, 0);
  }
  for (const count of [0, 8, 9, 10, 11]) {
    const fixture = deckFixture(40, count);
    const text = validateDeckTextCandidate({ ...fixture, readinessReasons: [] });
    const registered = validateRegisteredDeckCandidate(registeredFixture(fixture));
    assert.equal(text.legal, count <= 10, JSON.stringify(text.reasons));
    assert.deepEqual(registered.reasons.map((reason) => reason.code), text.reasons.map((reason) => reason.code));
    assert.equal(text.summary.sideboardCount, count);
    assert.equal(text.constraints.sideboard.maximum, 10);
    assert.equal(text.constraints.sideboard.exact, null);
    assert.equal(registered.constraints.sideboard.exact, count);
  }
});

test("registered pool identity, fixed sections, exact Main Deck, and 1-for-1 exchanges remain authoritative", () => {
  const fixture = registeredFixture(deckFixture(40, 10));
  for (const [code, mutate] of [
    ["deck.unknownRegisteredCard", (request: RegisteredDeckValidationRequest) => { request.deck.mainDeckRegisteredCardIds[0] = "foreign:player:copy"; }],
    ["deck.duplicateRegisteredCard", (request: RegisteredDeckValidationRequest) => { request.deck.mainDeckRegisteredCardIds.push(request.deck.mainDeckRegisteredCardIds[0]); }],
    ["deck.mutablePartition", (request: RegisteredDeckValidationRequest) => { request.deck.sideboardRegisteredCardIds.pop(); }],
    ["deck.fixedSectionChanged", (request: RegisteredDeckValidationRequest) => { request.deck.runeDeckRegisteredCardIds.pop(); }],
  ] as const) {
    const request = structuredClone(fixture.request);
    mutate(request);
    const response = validateRegisteredDeckCandidate({ ...fixture, request });
    assert.equal(response.legal, false);
    assert.ok(response.reasons.some((reason) => reason.code === code), JSON.stringify(response.reasons));
    assert.equal(response.constraints.mainDeck.exact, 40);
    assert.equal(response.constraints.sideboard.exact, 10);
  }

  const unpaired = structuredClone(fixture.request);
  unpaired.deck.mainDeckRegisteredCardIds.push(...unpaired.deck.sideboardRegisteredCardIds.splice(0, 2));
  const unpairedResponse = validateRegisteredDeckCandidate({ ...fixture, request: unpaired });
  assert.equal(unpairedResponse.legal, false);
  assert.ok(unpairedResponse.reasons.some((reason) => reason.code === "deck.mainDeckSize"));
  assert.ok(unpairedResponse.reasons.some((reason) => reason.code === "deck.sideboardExchange"));
  assert.equal(unpairedResponse.summary.activeCardCount, 42);
  assert.equal(unpairedResponse.summary.sideboardCount, 8);

  const exchanged = structuredClone(fixture.request);
  const incoming = exchanged.deck.sideboardRegisteredCardIds[0]!;
  const outgoing = exchanged.deck.mainDeckRegisteredCardIds[0]!;
  exchanged.deck.mainDeckRegisteredCardIds[0] = incoming;
  exchanged.deck.sideboardRegisteredCardIds[0] = outgoing;
  const exchangedResponse = validateRegisteredDeckCandidate({ ...fixture, request: exchanged });
  assert.equal(exchangedResponse.legal, true, JSON.stringify(exchangedResponse.reasons));
  assert.equal(exchangedResponse.summary.activeCardCount, 40);
  assert.equal(exchangedResponse.summary.sideboardCount, 10);
});

test("registered Sideboard cardinality follows the registered deck rather than the global maximum", () => {
  const fixture = registeredFixture(deckFixture(40, 9));
  const unchanged = validateRegisteredDeckCandidate(fixture);
  assert.equal(unchanged.legal, true, JSON.stringify(unchanged.reasons));
  assert.equal(unchanged.constraints.sideboard.maximum, 10);
  assert.equal(unchanged.constraints.sideboard.exact, 9);

  const unpaired = structuredClone(fixture.request);
  unpaired.deck.mainDeckRegisteredCardIds.push(unpaired.deck.sideboardRegisteredCardIds.shift()!);
  const response = validateRegisteredDeckCandidate({ ...fixture, request: unpaired });
  assert.equal(response.legal, false);
  assert.ok(response.reasons.some((reason) => reason.code === "deck.mainDeckSize"));
  assert.ok(response.reasons.some((reason) => reason.code === "deck.sideboardExchange"));
  assert.equal(response.constraints.sideboard.exact, 9);
});

test("independent reasons survive unresolved input and cover canonical copies, domains, Signature, and Battlefields", () => {
  const fixture = deckFixture(40, 0);
  const sourceText = fixture.sourceText
    .replace("3 Main 0", "4 Main 0")
    .replace("3 Main 1", "3 Missing fixture")
    .replace("1 Field 2", "1 Field 1")
    .replace("12 Rune", "11 Rune");
  const signature = fixture.catalog.byName.get("Main 0")!;
  signature.classification.supertype = "Signature";
  signature.tags = ["Other"];
  signature.classification.domain = ["Mind"];
  const response = validateDeckTextCandidate({ ...fixture, sourceText, readinessReasons: [] });
  for (const code of [
    "deck.unknownCard", "deck.mainDeckEntryCopies", "deck.copyLimit",
    "deck.domainIdentity", "deck.signatureTag", "deck.signatureLimit",
    "deck.battlefieldUnique", "deck.runeCount",
  ]) assert.ok(response.reasons.some((reason) => reason.code === code), `Missing ${code}`);
  const unknown = response.reasons.find((reason) => reason.code === "deck.unknownCard")!;
  assert.equal(unknown.sourceName, "Missing fixture");
  assert.equal(unknown.section, "mainDeck");
  assert.ok(unknown.line);
});

test("Champion compatibility uses the verified Champion tag independently of the submitted choice", () => {
  const fixture = deckFixture(40, 0);
  const legend = fixture.catalog.byName.get("Test Legend")!;
  const chosen = fixture.catalog.byName.get("Test, Chosen")!;
  const verifiedChampion = structuredClone(chosen);
  verifiedChampion.name = "Test, Alternate";
  verifiedChampion.public_code = "TST-900";
  fixture.catalog.cards.push(verifiedChampion);
  fixture.catalog.byName.set(verifiedChampion.name, verifiedChampion);
  legend.tags = ["Creature", "Test"];
  chosen.tags = ["Creature", "Other"];
  const response = validateDeckTextCandidate({ ...fixture, readinessReasons: [] });
  assert.ok(response.reasons.some((reason) => reason.code === "deck.championTag"));
  assert.equal(isEligibleChosenChampion(chosen, legend, fixture.catalog), false);
  assert.equal(isEligibleChosenChampion(verifiedChampion, legend, fixture.catalog), true);
});

test("copy and uniqueness checks use gameplay identity instead of submitted labels", () => {
  const fixture = deckFixture(40, 0);
  fixture.catalog.byName.get("Main 0")!.metadata.clean_name = "Equivalent card";
  fixture.catalog.byName.get("Main 1")!.metadata.clean_name = "Equivalent card";
  fixture.catalog.byName.get("Field 0")!.metadata.clean_name = "Equivalent field";
  fixture.catalog.byName.get("Field 1")!.metadata.clean_name = "Equivalent field";
  const response = validateDeckTextCandidate({ ...fixture, readinessReasons: [] });
  assert.ok(response.reasons.some((reason) => reason.code === "deck.copyLimit" && reason.canonicalName === "Equivalent card"));
  assert.ok(response.reasons.some((reason) => reason.code === "deck.battlefieldUnique"));
});

test("text validation reads canonical evidence without saved decks, accounts, registry entries, or writes", async () => {
  const fixture = deckFixture(40, 2);
  const { db, reads } = await readOnlyDatabase(fixture.documents);
  const response = await validateDeckText({ db, ...fixture });
  assert.equal(response.legal, true, JSON.stringify(response.reasons));
  assert.deepEqual(new Set(reads), new Set([CANONICAL_CARDS_COLLECTION, BEHAVIORS_COLLECTION]));
  assert.equal(response.fingerprint, fingerprintDeckValidationRequest({
    input: "text", policy: "riftbound-1v1-match", sourceText: fixture.sourceText,
  }));
});

test("known sideboard dependencies report missing, unapproved, stale, and nonexecutable models separately from unknown input", async () => {
  const fixture = deckFixture(40, 2);
  const sideboardCode = fixture.catalog.byName.get("Reserve 0")!.public_code;
  const missing = await readOnlyDatabase(fixture.documents.filter((document) => document.cardCode !== sideboardCode));
  const response = await validateDeckText({ ...fixture, db: missing.db });
  assert.equal(response.legal, false);
  const reason = response.reasons.find((item) => item.code === "deck.canonicalModelMissing")!;
  assert.equal(reason.section, "sideboard");
  assert.equal(reason.sourceName, "Reserve 0");
  assert.equal(response.reasons.some((item) => item.code === "deck.unknownCard"), false);
  const documents = structuredClone(fixture.documents);
  const unsupported = documents.find((document) => document.cardCode === sideboardCode)!;
  // Persisted input is untrusted; model publication status must be checked at runtime.
  Object.assign(unsupported, { modelingStatus: "draft", sourceTextHash: "stale" });
  unsupported.behaviorModel.playTimings.push({
    behaviorId: "timing.unimplemented_fixture", parameters: {}, confidence: "high", order: 0,
  });
  const readiness = inspectCanonicalDeckReadiness({ cards: documents, behaviorDefinitions: [] });
  const text = validateDeckTextCandidate({ ...fixture, readinessReasons: readiness.reasons });
  const registered = validateRegisteredDeckCandidate({
    ...registeredFixture(fixture), readinessReasons: readiness.reasons,
  });
  for (const code of ["deck.canonicalModelUnapproved", "deck.canonicalRulesStale", "deck.behaviorNotExecutable"]) {
    assert.ok(text.reasons.some((item) => item.code === code && item.section === "sideboard"), code);
    assert.ok(registered.reasons.some((item) => item.code === code && item.section === "sideboard"), code);
  }
});

test("canonical models must match current local source rules even when their stored card and hash agree", async () => {
  const fixture = deckFixture(40, 2);
  const currentCard = fixture.catalog.byName.get("Reserve 0")!;
  currentCard.text.plain = "Updated local source rules.";
  const stored = fixture.documents.find((document) => document.cardCode === currentCard.public_code)!;
  assert.equal(stored.sourceTextHash, hashCardRulesText(stored.card), "Stored model is internally consistent");
  assert.notEqual(stored.sourceTextHash, hashCardRulesText(currentCard));
  const { db } = await readOnlyDatabase(fixture.documents);
  const response = await validateDeckText({ ...fixture, db });
  assert.equal(response.legal, false);
  const reason = response.reasons.find((item) => item.code === "deck.canonicalRulesStale");
  assert.equal(reason?.cardCode, currentCard.public_code);
  assert.equal(reason?.section, "sideboard");
  assert.equal(reason?.sourceName, "Reserve 0");
  assert.equal(response.reasons.some((item) => item.code === "deck.unknownCard"), false);
});

test("registered readiness checks both current publication and registered runtime source freshness", async () => {
  const source = (await loadCardCatalog()).byName.get("Gust")!;
  const current = buildCanonicalCardDocument({
    cardCode: deriveCardCodeFromCard(source), card: source, sourceTextHash: hashCardRulesText(source),
    modelingStatus: "approved", adminNotes: "Readiness fixture", clauses: [],
  }, [], "2026-09-16T00:00:00.000Z", "2026-09-16T00:00:00.000Z");
  const stale = structuredClone(current);
  stale.card.text.plain = "Previous source rules.";
  stale.sourceTextHash = hashCardRulesText(stale.card);
  const registeredDeck: DeckSnapshotDocument = {
    id: "freshness:deck:player1", playerId: "player1", matchId: "freshness", instances: [],
    createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z",
    snapshot: { sourceText: "", catalogDigest: "fixture", entries: [], cards: [stale] },
  };
  for (const documents of [[stale], [current]]) {
    const { db } = await readOnlyDatabase(documents);
    const reasons = await loadRegisteredDeckReadiness(db, registeredDeck);
    const staleReasons = reasons.filter((reason) => reason.code === "deck.canonicalRulesStale");
    assert.equal(staleReasons.length, 1, "The same stale source failure is deduplicated");
    assert.equal(staleReasons[0].cardCode, current.cardCode);
  }
});

test("transport distinguishes explicit input modes, preserves source correlation, and accepts future reasons", async () => {
  assert.equal(deckValidationRequestSchema.safeParse({
    policy: "riftbound-1v1-match", sourceText: "",
  }).success, false);
  const fixture = deckFixture(40, 0);
  const request = { input: "text" as const, policy: "riftbound-1v1-match" as const, sourceText: fixture.sourceText };
  assert.equal(deckValidationRequestSchema.safeParse(request).success, true);
  assert.notEqual(fingerprintDeckValidationRequest(request), fingerprintDeckValidationRequest({
    ...request, sourceText: `${request.sourceText}\n`,
  }));
  const response = validateDeckTextCandidate({
    ...fixture, readinessReasons: [{ code: "deck.futureRequirement", message: "A future requirement was not met." }],
  });
  assert.equal(deckValidationResponseSchema.parse(response).legal, false);
  assert.equal(response.reasons[0].message, "A future requirement was not met.");
  const malformedJson = await POST(new Request("http://localhost/api/decks/validate", { method: "POST", body: "{" }));
  assert.equal(malformedJson.status, 400);
  const malformedEnvelope = await POST(new Request("http://localhost/api/decks/validate", { method: "POST", body: "{}" }));
  assert.equal(malformedEnvelope.status, 400);
  const malformedText = await POST(new Request("http://localhost/api/decks/validate", {
    method: "POST", body: JSON.stringify({ input: "text", policy: "riftbound-1v1-match", sourceText: "Main Deck:\n1 Example" }),
  }));
  assert.equal(malformedText.status, 200);
  assert.equal((await malformedText.json()).reasons[0].code, "deck.parse");
  const parseFailure = await validateDeckText({ ...fixture, db: {} as Db, sourceText: "Main Deck:\n1 Example" });
  assert.equal(parseFailure.legal, false);
  assert.equal(parseFailure.reasons[0].code, "deck.parse");
  assert.equal(parseFailure.constraints.mainDeck.exact, 40);
  assert.equal(parseFailure.constraints.sideboard.maximum, 10);
  assert.equal(parseFailure.constraints.sideboard.exact, null);
  assert.equal(parseFailure.reasons.length, 1, "Unparseable input has no independently established section counts");
});

test("operational failure is an unavailable response rather than a deck rejection or unknown name", async () => {
  const uri = process.env.MONGODB_URI;
  delete process.env.MONGODB_URI;
  try {
    const response = await POST(new Request("http://localhost/api/decks/validate", {
      method: "POST", body: JSON.stringify({
        input: "text", policy: "riftbound-1v1-match", sourceText: "MainDeck:\n1 Gust",
      }),
    }));
    assert.equal(response.status, 503);
    const payload = await response.json();
    assert.equal(payload.error.code, "deck.validationUnavailable");
    assert.equal("legal" in payload, false);
  } finally {
    if (uri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = uri;
  }
});

function deckFixture(activeCount: number, sideboardCount: number) {
  const specifications = [
    { name: "Test Legend", type: "Legend", supertype: null, tags: ["Test"] },
    { name: "Test, Chosen", type: "Unit", supertype: "Champion", tags: ["Test"] },
    { name: "Rune", type: "Rune", supertype: "Basic", tags: [] },
    ...Array.from({ length: 3 }, (_, index) => ({ name: `Field ${index}`, type: "Battlefield", supertype: null, tags: [] })),
    ...Array.from({ length: 14 }, (_, index) => ({ name: `Main ${index}`, type: "Spell", supertype: null, tags: [] })),
    ...Array.from({ length: 4 }, (_, index) => ({ name: `Reserve ${index}`, type: "Spell", supertype: null, tags: [] })),
  ];
  const cards = specifications.map((specification, index) => cardSchema.parse({
    id: `fixture-${index}`, public_code: `TST-${index.toString().padStart(3, "0")}`,
    name: specification.name, classification: { ...specification, domain: ["Fury"] },
    attributes: { energy: null, might: null, power: null }, text: { plain: "" },
    set: { set_id: "TST", label: "Validation fixture" }, media: {}, tags: specification.tags, metadata: {},
  }));
  const catalog: CardCatalog = {
    cards, byName: new Map(cards.map((card) => [card.name, card])),
    byPublicCode: new Map(cards.map((card) => [card.public_code, card])),
    setFiles: [], versionHash: "fixture",
  };
  const quantities = (count: number, label: string) => Array.from({ length: Math.ceil(count / 3) }, (_, index) =>
    `${Math.min(3, count - index * 3)} ${label} ${index}`).join("\n");
  const sourceText = `Legend:\n1 Test, Test Legend\nChampion:\n1 Test, Chosen\nRunes:\n12 Rune\nBattlefields:\n1 Field 0\n1 Field 1\n1 Field 2\nMainDeck:\n${quantities(activeCount - 1, "Main")}\nSideboard:\n${quantities(sideboardCount, "Reserve")}`;
  const resolved = resolveDeckText(sourceText, catalog);
  assert.deepEqual(resolved.issues, []);
  const usedCodes = new Set(resolved.entries.map((entry) => entry.cardCode));
  const documents = cards.filter((card) => usedCodes.has(card.public_code)).map((card) => buildCanonicalCardDocument({
    cardCode: card.public_code, card, sourceTextHash: hashCardRulesText(card),
    modelingStatus: "approved", adminNotes: "Synthetic construction fixture", clauses: [],
  }, [], "2026-09-16T00:00:00.000Z", "2026-09-16T00:00:00.000Z"));
  return { sourceText, catalog, documents };
}

function registeredFixture(fixture: ReturnType<typeof deckFixture>) {
  const sources = {
    legend: "legend", chosenChampion: "champion", mainDeck: "mainDeck",
    runeDeck: "runeDeck", battlefields: "battlefield", sideboard: "sideboard",
  } as const;
  const instances = resolveDeckText(fixture.sourceText, fixture.catalog).entries.flatMap((entry, entryIndex) =>
    Array.from({ length: entry.quantity }, (_, copyIndex): CardInstance => ({
      instanceId: `instance:${entryIndex}:${copyIndex}`,
      registeredCardId: `fixture:player1:${entryIndex}:${copyIndex}`, ownerPlayerId: "player1",
      cardCode: entry.cardCode!, source: sources[entry.section],
    })));
  const registeredDeck: DeckSnapshotDocument = {
    id: "fixture:deck:player1", playerId: "player1", matchId: "fixture",
    createdAt: "2026-09-16T00:00:00.000Z", updatedAt: "2026-09-16T00:00:00.000Z", instances,
    snapshot: {
      sourceText: fixture.sourceText, catalogDigest: "fixture", entries: [],
      cards: fixture.documents.map(({ cardCode, card, sourceTextHash, behaviorModel }) => ({
        cardCode, card, sourceTextHash, behaviorModel,
      })),
    },
  };
  const ids = (source: CardInstance["source"]) => instances.filter((copy) => copy.source === source).map((copy) => copy.registeredCardId!);
  return { registeredDeck, request: buildDeckValidationRequest({
    registeredDeck, configuration: {
      chosenChampionRegisteredCardId: ids("champion")[0],
      mainDeckRegisteredCardIds: ids("mainDeck"), sideboardRegisteredCardIds: ids("sideboard"),
    },
  }) };
}

async function readOnlyDatabase(documents: CanonicalCardDocument[]) {
  const definitions = (await buildCurrentBehaviorCatalog()).map((entry) => buildBehaviorDefinitionDocument(entry));
  const reads: string[] = [];
  const db = {
    collection(name: string) {
      reads.push(name);
      assert.ok([CANONICAL_CARDS_COLLECTION, BEHAVIORS_COLLECTION].includes(name));
      return {
        find(filter: { cardCode?: { $in: string[] } }) {
          const values = name === CANONICAL_CARDS_COLLECTION
            ? documents.filter((document) => filter.cardCode?.$in.includes(document.cardCode)) : definitions;
          return { sort() { return this; }, async toArray() { return values; } };
        },
      };
    },
  } as unknown as Db;
  return { db, reads };
}
