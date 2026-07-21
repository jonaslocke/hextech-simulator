import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBehaviorDefinitionDocument,
  buildCanonicalCardDocument,
  buildCurrentBehaviorCatalog,
  hashCardRulesText,
  type CanonicalCardDocument,
} from "../src/server/card-catalog";
import type { Card } from "../src/server/catalog";
import { parseDeckList } from "../src/server/deck";
import {
  buildDeckSnapshot,
  GameCatalogError
} from "../src/server/game";

test("builds an immutable snapshot for every unique initial-deck card", async () => {
  const fixture = await buildFixture();
  const snapshot = buildDeckSnapshot(fixture.sourceText, fixture.documents, fixture.definitions);

  assert.equal(
    snapshot.cards.length,
    new Set(parseDeckList(fixture.sourceText).entries.map((entry) => entry.name)).size,
  );
  assert.equal(snapshot.entries.length, parseDeckList(fixture.sourceText).entries.length);
  assert.match(snapshot.catalogDigest, /^[a-f0-9]{64}$/);
  assert.ok(snapshot.cards.every((definition) => definition.behaviorModel));
});

test("does not impose a minimum unique-card count on deck snapshots", async () => {
  const fixture = await buildFixture();
  const sourceText = fixture.sourceText.replace(/^3 Synthetic Unit\r?\n/m, "");
  const snapshot = buildDeckSnapshot(sourceText, fixture.documents, fixture.definitions);

  assert.equal(snapshot.cards.length, 5);
});

test("stores the selected standard printing in deck snapshots independent of document order", async () => {
  const fixture = await buildFixture();
  const standard = fixture.documents.find(
    (document) => document.card.name === "Synthetic Unit",
  )!;
  const alternate = structuredClone(standard);
  alternate.card = {
    ...alternate.card,
    id: "SYN-003a/001",
    riftbound_id: "syn-003a-001",
    public_code: "SYN-003a/001",
    metadata: { ...alternate.card.metadata, alternate_art: true },
  };

  for (const candidates of [[standard, alternate], [alternate, standard]]) {
    const documents = fixture.documents.filter((document) => document !== standard);
    const snapshot = buildDeckSnapshot(
      fixture.sourceText,
      [...documents, ...candidates],
      fixture.definitions,
    );
    const selected = snapshot.cards.find((card) => card.cardCode === "SYN-003");

    assert.equal(selected?.card.public_code, "SYN-003/001");
    assert.equal(selected?.card.metadata.alternate_art, undefined);
  }
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

async function buildFixture() {
  const sourceText = [
    "Legend:",
    "1 Synthetic Legend",
    "Champion:",
    "1 Synthetic Champion",
    "MainDeck:",
    "3 Synthetic Unit",
    "1 Synthetic Spell",
    "Runes:",
    "2 Synthetic Rune",
    "Battlefields:",
    "2 Synthetic Battlefield",
    "",
  ].join("\n");
  const cards = [
    syntheticCard("SYN-001", "Synthetic Legend", "Legend"),
    syntheticCard("SYN-002", "Synthetic Champion", "Unit"),
    syntheticCard("SYN-003", "Synthetic Unit", "Unit"),
    syntheticCard("SYN-004", "Synthetic Spell", "Spell"),
    syntheticCard("SYN-005", "Synthetic Rune", "Rune"),
    syntheticCard("SYN-006", "Synthetic Battlefield", "Battlefield"),
  ];
  const behaviorCatalog = await buildCurrentBehaviorCatalog();
  const documents: CanonicalCardDocument[] = cards.map((card) =>
    buildCanonicalCardDocument({
      cardCode: card.public_code.split("/")[0]!,
      card,
      printingCandidates: [card],
      sourceTextHash: hashCardRulesText(card),
      modelingStatus: "approved",
      adminNotes: "fixture",
      clauses: card.name === "Synthetic Spell"
        ? [{
            id: "synthetic-draw",
            sourceText: "Draw 1.",
            normalizedText: "draw 1",
            unsupportedReason: null,
            assignments: [
              {
                primitiveId: "trigger.on_play",
                family: "trigger" as const,
                sourceText: "When played, draw 1.",
                parameters: { actor: "controller", subject: "spell" },
                confidence: "high" as const,
              },
              {
                primitiveId: "action.draw_cards",
                family: "action" as const,
                sourceText: "Draw 1.",
                parameters: { player: "controller", count: 1 },
                confidence: "high" as const,
              },
            ],
          }]
        : [],
    }, behaviorCatalog, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z"),
  );
  const definitions = behaviorCatalog.map((entry) =>
    buildBehaviorDefinitionDocument(entry, "2026-01-01T00:00:00.000Z")
  );
  return { sourceText, documents, definitions };
}

function syntheticCard(
  code: string,
  name: string,
  type: Card["classification"]["type"],
): Card {
  return {
    id: code,
    name,
    public_code: `${code}/001`,
    attributes: { energy: 0, might: 0, power: null },
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
  };
}
