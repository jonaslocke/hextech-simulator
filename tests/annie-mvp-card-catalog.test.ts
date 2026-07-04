import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  buildCanonicalCardDocument,
  buildBehaviorDefinitionDocument,
  buildCurrentBehaviorCatalog,
  hashCardRulesText,
  previewCardCatalogImport,
} from "../src/server/card-catalog";
import type { Card } from "../src/server/catalog";
import { parseDeckList } from "../src/server/deck";
import { buildDeckSnapshot } from "../src/server/game";

const EXPECTED_ANNIE_PRIMITIVES: Record<string, string[]> = {
  "Dark Child - Starter": ["action.ready_cards", "trigger.end_of_turn"],
  "Annie, Stubborn": ["action.return_to_hand", "selector.card", "trigger.on_play"],
  "Fury Rune": ["ability.exhaust_for_resource", "ability.recycle_for_power"],
  "Chaos Rune": ["ability.exhaust_for_resource", "ability.recycle_for_power"],
  Gust: ["action.return_to_hand", "selector.unit", "timing.reaction"],
  Flash: ["action.move_unit", "selector.friendly_unit", "timing.reaction"],
  Incinerate: ["action.deal_damage", "selector.unit", "timing.action"],
  "Morbid Return": ["action.return_to_hand", "selector.card", "timing.action"],
  "Mystic Poro": ["action.vision", "keyword.vision", "trigger.on_play"],
  "Pouty Poro": ["keyword.deflect"],
  "Traveling Merchant": ["action.discard_cards", "action.draw_cards", "trigger.on_move"],
  "Sneaky Deckhand": ["modifier.play_unit_destination"],
  Disintegrate: [
    "action.deal_damage",
    "action.draw_cards",
    "condition.effect_killed_target",
    "selector.unit",
    "timing.action",
  ],
  "Annie, Fiery": ["modifier.modify_numeric_value"],
  "Maddened Marauder": [
    "action.move_unit",
    "keyword.tank",
    "selector.unit",
    "trigger.on_play",
  ],
  Firestorm: ["action.deal_damage", "selector.battlefield", "selector.enemy_unit"],
  "Sai Scout": ["action.vision", "keyword.vision", "modifier.play_unit_destination", "trigger.on_play"],
  Tibbers: ["action.deal_damage", "selector.unit", "trigger.on_play"],
};

test("combined MVP preview produces publishable Annie behavior contracts", async () => {
  const rawJson = await readFile("data/catalog/mvp.json", "utf8");
  const behaviorCatalog = await buildCurrentBehaviorCatalog();
  const luxDeck = parseDeckList(await readFile("data/decks/lux.dec.txt", "utf8"));
  const luxNames = new Set(luxDeck.entries.map((entry) => entry.name));
  const uploaded = JSON.parse(rawJson) as Card[];
  const persistedLux = new Map(
    uploaded
      .filter((card) => luxNames.has(card.name))
      .map((card) => {
        const cardCode = card.public_code.split("/")[0]!;
        return [
          cardCode,
          {
            cardCode,
            modelingStatus: "approved" as const,
            runtimeSupportStatus: "supported" as const,
            sourceTextHash: hashCardRulesText(card),
            updatedAt: "existing",
          },
        ] as const;
      }),
  );
  const preview = await previewCardCatalogImport({
    sourceLabel: "data/catalog/mvp.json",
    rawJson,
    behaviorCatalog,
    existingCardLookup: async () => persistedLux,
  });

  assert.equal(preview.summary.uploadedCardCount, 39);
  assert.equal(preview.summary.alreadyPersistedCardCount, 21);
  assert.equal(preview.summary.newCardCount, 18);
  assert.equal(preview.summary.unsupportedCardCount, 0);
  assert.equal(preview.summary.ambiguousCardCount, 0);
  assert.equal(preview.summary.missingRequiredParameterCount, 0);

  for (const [name, expectedPrimitiveIds] of Object.entries(
    EXPECTED_ANNIE_PRIMITIVES,
  )) {
    const card = preview.cards.find((candidate) => candidate.name === name);
    assert.ok(card?.suggestion, `Missing Annie preview: ${name}`);
    assert.deepEqual(
      [...new Set(card.suggestion.primitiveIds)].sort(),
      [...expectedPrimitiveIds].sort(),
      `Unexpected behavior contract for ${name}`,
    );
    assert.doesNotThrow(() =>
      buildCanonicalCardDocument(
        {
          cardCode: card.cardCode,
          card: card.card,
          sourceTextHash: card.sourceTextHash,
          modelingStatus: "approved",
          adminNotes: "Annie MVP contract test",
          clauses: card.suggestion!.clauses.map((clause) => ({
            id: clause.id,
            sourceText: clause.sourceText,
            normalizedText: clause.normalizedText,
            unsupportedReason: clause.unsupportedReason,
            assignments: clause.assignments.map(({ assignment }) => assignment),
          })),
        },
        behaviorCatalog,
        "created",
        "updated",
      ),
    );
  }

  const approvedDocuments = preview.cards.map((card) => {
    assert.ok(card.suggestion, `Missing publication model: ${card.name}`);
    return buildCanonicalCardDocument(
      {
        cardCode: card.cardCode,
        card: card.card,
        sourceTextHash: card.sourceTextHash,
        modelingStatus: "approved",
        adminNotes: "Combined MVP publication certification",
        clauses: card.suggestion.clauses.map((clause) => ({
          id: clause.id,
          sourceText: clause.sourceText,
          normalizedText: clause.normalizedText,
          unsupportedReason: clause.unsupportedReason,
          assignments: clause.assignments.map(({ assignment }) => assignment),
        })),
      },
      behaviorCatalog,
      "created",
      "updated",
    );
  });
  const annieDeckText = await readFile("data/decks/annie.dec.txt", "utf8");
  const snapshot = buildDeckSnapshot(
    annieDeckText,
    approvedDocuments,
    behaviorCatalog.map((entry) =>
      buildBehaviorDefinitionDocument(entry, "updated"),
    ),
  );
  assert.equal(snapshot.cards.length, 21);
  assert.equal(snapshot.entries.length, parseDeckList(annieDeckText).entries.length);

  const reupload = await previewCardCatalogImport({
    sourceLabel: "data/catalog/mvp.json",
    rawJson,
    behaviorCatalog,
    existingCardLookup: async () =>
      new Map(
        approvedDocuments.map((document) => [
          document.cardCode,
          {
            cardCode: document.cardCode,
            modelingStatus: document.modelingStatus,
            runtimeSupportStatus: document.runtimeSupportStatus,
            sourceTextHash: document.sourceTextHash,
            updatedAt: document.updatedAt,
          },
        ]),
      ),
  });
  assert.equal(reupload.summary.alreadyPersistedCardCount, 39);
  assert.equal(reupload.summary.newCardCount, 0);
});
