import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  analyzeCardBehaviorSuggestions,
  buildBehaviorDefinitionDocument,
  buildCanonicalCardDocument,
  buildCurrentBehaviorCatalog,
  hashCardRulesText,
} from "../src/server/card-catalog";
import { cardSetFileSchema } from "../src/server/catalog";
import { parseDeckList } from "../src/server/deck";
import { buildDeckSnapshot } from "../src/server/game";

const EXPECTED_COMPLEX_PRIMITIVES: Record<string, string[]> = {
  "Wuju Bladesman - Starter": [
    "modifier.modify_numeric_value",
    "selector.friendly_unit",
  ],
  "Yi, Meditative": [
    "condition.compare_numeric_value",
    "modifier.modify_numeric_value",
  ],
  "Yi, Honed": ["keyword.ganking", "modifier.enter_ready"],
  "Wielder of Water": ["modifier.modify_numeric_value"],
  "En Garde": [
    "modifier.modify_numeric_value",
    "selector.friendly_unit",
    "timing.reaction",
  ],
  "Cannon Barrage": [
    "action.deal_damage",
    "selector.enemy_unit",
    "timing.reaction",
  ],
  Confront: ["action.draw_cards", "modifier.enter_ready", "timing.action"],
  Meditation: [
    "action.draw_by_optional_cost",
    "cost.exhaust_selected_unit",
    "selector.friendly_unit",
    "timing.reaction",
  ],
  Mobilize: ["action.channel_or_draw"],
  Highlander: [
    "replacement.recall_on_next_death",
    "selector.friendly_unit",
    "timing.reaction",
  ],
  "Gentlemen's Duel": [
    "action.fight",
    "modifier.modify_numeric_value",
    "selector.enemy_unit",
    "selector.friendly_unit",
    "timing.action",
  ],
};

test("Master Yi deck has exact publishable executable behavior models", async () => {
  const [rawCatalog, deckText, behaviorCatalog] = await Promise.all([
    readFile("data/catalog/mvp.json", "utf8"),
    readFile("data/decks/masteryi.dec.txt", "utf8"),
    buildCurrentBehaviorCatalog(),
  ]);
  const allCards = cardSetFileSchema.parse(JSON.parse(rawCatalog));
  const names = new Set(parseDeckList(deckText).entries.map((entry) => entry.name));
  const cards = allCards.filter((card) => names.has(card.name));
  const report = analyzeCardBehaviorSuggestions(
    cards,
    ["data/decks/masteryi.dec.txt"],
    behaviorCatalog,
  );

  assert.equal(cards.length, 21);
  assert.equal(report.summary.completeSuggestionCount, 21);
  assert.equal(report.summary.unsupportedCardCount, 0);
  assert.equal(report.summary.ambiguousCardCount, 0);
  assert.equal(report.summary.requiresEngineSupportCardCount, 0);

  for (const [name, expected] of Object.entries(EXPECTED_COMPLEX_PRIMITIVES)) {
    const suggestion = report.cards.find((card) => card.cardName === name);
    assert.ok(suggestion, `Missing Master Yi behavior model: ${name}`);
    assert.deepEqual([...new Set(suggestion.primitiveIds)].sort(), expected.sort());
  }

  const meditative = report.cards.find(
    (card) => card.cardName === "Yi, Meditative",
  );
  assert.ok(meditative);
  const meditativeAssignments = meditative.clauses.flatMap(
    (clause) => clause.assignments,
  );
  assert.deepEqual(
    meditativeAssignments.find(
      ({ assignment }) =>
        assignment.primitiveId === "condition.compare_numeric_value",
    )?.assignment.parameters,
    {
      valueSource: "controller.boardRuneCount",
      operator: "greaterThanOrEqual",
      comparisonValue: 8,
    },
  );
  assert.equal(
    meditativeAssignments.find(
      ({ assignment }) =>
        assignment.primitiveId === "modifier.modify_numeric_value",
    )?.assignment.parameters.condition,
    undefined,
  );

  const documents = report.cards.map((suggestion) => {
    const card = cards.find((candidate) =>
      candidate.public_code.startsWith(`${suggestion.cardCode}/`),
    );
    assert.ok(card, `Missing Master Yi card ${suggestion.cardCode}`);
    const document = buildCanonicalCardDocument(
      {
        cardCode: suggestion.cardCode,
        card,
        sourceTextHash: hashCardRulesText(card),
        modelingStatus: "approved",
        adminNotes: "Master Yi runtime certification",
        clauses: suggestion.clauses.map((clause) => ({
          id: clause.id,
          sourceText: clause.sourceText,
          normalizedText: clause.normalizedText,
          unsupportedReason: clause.unsupportedReason,
          assignments: clause.assignments.map((item) => item.assignment),
        })),
      },
      behaviorCatalog,
      "created",
      "updated",
    );
    assert.equal(document.runtimeSupportStatus, "supported");
    return document;
  });

  const snapshot = buildDeckSnapshot(
    deckText,
    documents,
    behaviorCatalog.map((entry) =>
      buildBehaviorDefinitionDocument(entry, "updated"),
    ),
  );
  assert.equal(snapshot.cards.length, 21);
  assert.equal(snapshot.entries.length, 22);
});
