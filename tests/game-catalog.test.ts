import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  analyzeCardBehaviorSuggestions,
  buildBehaviorDefinitionDocument,
  buildCanonicalCardDocument,
  buildCurrentBehaviorCatalog,
  hashCardRulesText,
  type CanonicalCardDocument
} from "../src/server/card-catalog";
import { loadCardCatalog } from "../src/server/catalog";
import { parseDeckList, resolveDeckCard } from "../src/server/deck";
import {
  buildDeckSnapshot,
  GameCatalogError,
} from "../src/server/game";

test("builds an immutable snapshot for every unique initial-deck card", async () => {
  const fixture = await buildFixture();
  const snapshot = buildDeckSnapshot(fixture.sourceText, fixture.documents, fixture.definitions);

  assert.equal(snapshot.cards.length, new Set(fixture.documents.map((document) => document.cardCode)).size);
  assert.equal(snapshot.entries.length, parseDeckList(fixture.sourceText).entries.length);
  assert.match(snapshot.catalogDigest, /^[a-f0-9]{64}$/);
  assert.ok(snapshot.cards.every((definition) => definition.behaviorModel));
});

test("rejects missing, stale, unsynchronized, and uncovered canonical cards", async () => {
  const fixture = await buildFixture();
  assert.throws(
    () => buildDeckSnapshot(fixture.sourceText, fixture.documents.slice(1), fixture.definitions),
    GameCatalogError
  );

  const stale = structuredClone(fixture.documents);
  stale[0]!.sourceTextHash = "stale";
  assert.throws(
    () => buildDeckSnapshot(fixture.sourceText, stale, fixture.definitions),
    /Stale canonical rules text/
  );

  const missingDefinition = fixture.definitions.filter(
    (definition) => definition.id !== "trigger.on_play"
  );
  assert.throws(
    () => buildDeckSnapshot(fixture.sourceText, fixture.documents, missingDefinition),
    /Missing synchronized behavior definition/
  );

  const uncovered = structuredClone(fixture.documents);
  const binding = uncovered.flatMap((document) => document.behaviorModel.clauses)
    .flatMap((clause) => clause.effects)[0]!;
  binding.behaviorId = "action.future_behavior";
  assert.throws(
    () => buildDeckSnapshot(fixture.sourceText, uncovered, fixture.definitions),
    /Behavior is not executable/
  );
});

test("snapshot resolution does not impose a fixture-specific unique-card minimum", async () => {
  const fixture = await buildFixture();
  const entry = parseDeckList(fixture.sourceText).entries.find((item) => item.section === "MainDeck")!;
  // Snapshot construction is an intermediate catalog stage, not deck legality.
  const snapshot = buildDeckSnapshot(`MainDeck:\n1 ${entry.name}`, fixture.documents, fixture.definitions);
  assert.equal(snapshot.cards.length, 1);
});

test("deck snapshots carry source-corpus Token printings separately from deck cards", async () => {
  const fixture = await buildFixture();
  const sourceToken = structuredClone(fixture.localCatalog.cards.find(
    (card) => card.classification.type === "Unit" && card.classification.supertype === null,
  )!);
  sourceToken.id = "synthetic-token";
  sourceToken.name = "Scout";
  sourceToken.public_code = "TST-T01";
  sourceToken.classification.type = "Unit";
  sourceToken.classification.supertype = "Token";
  sourceToken.media.image_url = "https://assets.example.test/scout-token.png";
  const sourceCatalog = {
    cards: [...fixture.localCatalog.cards, sourceToken],
    byName: fixture.localCatalog.byName,
    canonicalByName: fixture.localCatalog.canonicalByName,
  };

  const snapshot = buildDeckSnapshot(
    fixture.sourceText,
    fixture.documents,
    fixture.definitions,
    sourceCatalog,
  );

  assert.ok(snapshot.tokenCards?.some((card) => card.public_code === "TST-T01"));
  assert.equal(snapshot.cards.some((definition) => definition.cardCode === "TST-T01"), false);
});

async function buildFixture() {
  const sourceText = await readFile("data/decks/lux.dec.txt", "utf8");
  const localCatalog = await loadCardCatalog();
  const parsed = parseDeckList(sourceText);
  const cards = [...new Map(parsed.entries.map((entry) => {
    const card = resolveDeckCard(localCatalog, entry)!;
    return [card.public_code, card] as const;
  })).values()];
  const behaviorCatalog = await buildCurrentBehaviorCatalog();
  const suggestions = analyzeCardBehaviorSuggestions(cards, [], behaviorCatalog);
  const suggestionByCode = new Map(suggestions.cards.map((item) => [item.cardCode, item]));
  const documents: CanonicalCardDocument[] = cards.map((card) => {
    const cardCode = card.public_code.split("/")[0]!;
    const suggestion = suggestionByCode.get(cardCode)!;
    return buildCanonicalCardDocument({
      cardCode,
      card,
      sourceTextHash: hashCardRulesText(card),
      modelingStatus: "approved",
      adminNotes: "fixture",
      clauses: suggestion.clauses.map((clause) => ({
        id: clause.id,
        sourceText: clause.sourceText,
        normalizedText: clause.normalizedText,
        unsupportedReason: clause.unsupportedReason,
        assignments: clause.assignments.map(({ assignment }) => assignment)
      }))
    }, behaviorCatalog, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
  });
  const definitions = behaviorCatalog.map((entry) =>
    buildBehaviorDefinitionDocument(entry, "2026-01-01T00:00:00.000Z")
  );
  return { sourceText, documents, definitions, localCatalog };
}
