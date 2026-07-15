import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CardCatalogImportPreviewError,
  buildPrimitiveCatalog,
  hashCardRulesText,
  previewCardCatalogImport,
  type PersistedCanonicalCardSummary
} from "../src/server/card-catalog";
import type { Card } from "../src/server/catalog";

test("previews admin-uploaded JSON without persisting suggestions", async () => {
  const reactionSpell = createTestCard({
    name: "Synthetic Reaction Spell",
    publicCode: "SYN-001/100",
    text: "[Reaction] (Play any time, even before spells and abilities resolve.)Give a unit -1 :rb_might: this turn, to a minimum of 1 :rb_might:. Draw 1."
  });
  const syntheticUnit = createTestCard({
    name: "Synthetic Unit",
    publicCode: "SYN-002/100",
    text: "",
    type: "Unit"
  });
  const lookupCalls: string[][] = [];

  const preview = await previewCardCatalogImport({
    behaviorCatalog: buildPrimitiveCatalog(),
    sourceLabel: "synthetic.json",
    rawJson: JSON.stringify([reactionSpell, syntheticUnit]),
    existingCardLookup: async (cardCodes) => {
      lookupCalls.push(cardCodes);
      return new Map();
    }
  });

  assert.deepEqual(lookupCalls, [["SYN-001", "SYN-002"]]);
  assert.equal(preview.sourceLabel, "synthetic.json");
  assert.equal(preview.summary.uploadedCardCount, 2);
  assert.equal(preview.summary.suggestedCardCount, 2);
  assert.equal(preview.summary.vanillaCardCount, 1);
  assert.equal(preview.summary.newCardCount, 2);

  const reactionPreview = preview.cards.find((card) => card.cardCode === "SYN-001");
  const unitPreview = preview.cards.find((card) => card.cardCode === "SYN-002");

  assert.equal(
    reactionPreview?.suggestion?.supportStatus,
    "supported"
  );
  assert.deepEqual(reactionPreview?.suggestion?.primitiveIds, [
    "action.draw_cards",
    "modifier.modify_numeric_value",
    "selector.unit",
    "timing.reaction"
  ]);
  assert.equal(unitPreview?.isVanilla, true);
  assert.deepEqual(unitPreview?.suggestion?.clauses, []);
});

test("previews textless Basic Runes as intrinsic behavior cards", async () => {
  const mindRune = createTestCard({
    name: "Synthetic Basic Rune",
    publicCode: "SYN-003/100",
    text: "",
    type: "Rune",
    supertype: "Basic",
    domain: ["Mind"]
  });

  const preview = await previewCardCatalogImport({
    behaviorCatalog: buildPrimitiveCatalog(),
    sourceLabel: "runes.json",
    rawJson: JSON.stringify([mindRune]),
    existingCardLookup: async () => new Map()
  });

  assert.equal(preview.summary.suggestedCardCount, 1);
  assert.equal(preview.summary.vanillaCardCount, 0);
  assert.equal(preview.cards[0]?.isVanilla, false);
  assert.deepEqual(preview.cards[0]?.suggestion?.primitiveIds, [
    "ability.exhaust_for_resource",
    "ability.recycle_for_power"
  ]);
});

test("marks uploaded cards that already exist in the persisted catalog", async () => {
  const card = createTestCard({
    name: "Synthetic Group Buff",
    publicCode: "SYN-004/100",
    text: "[Reaction] (Play any time, even before spells and abilities resolve.)Give two friendly units each +2 :rb_might: this turn."
  });
  const persisted: PersistedCanonicalCardSummary = {
    cardCode: "SYN-004",
    modelingStatus: "approved",
    runtimeSupportStatus: "requires_engine_support",
    sourceTextHash: hashCardRulesText(card),
    updatedAt: "2026-06-19T00:00:00.000Z"
  };

  const preview = await previewCardCatalogImport({
    behaviorCatalog: buildPrimitiveCatalog(),
    sourceLabel: "uploaded.json",
    rawJson: JSON.stringify([card]),
    existingCardLookup: async () => new Map([[persisted.cardCode, persisted]])
  });

  assert.equal(preview.summary.alreadyPersistedCardCount, 1);
  assert.equal(preview.summary.newCardCount, 0);
  assert.equal(preview.cards[0]?.existingCatalog.state, "already_persisted");
  assert.equal(
    preview.cards[0]?.existingCatalog.persisted?.modelingStatus,
    "approved"
  );
});

test("marks persisted cards as changed when the source text hash differs", async () => {
  const card = createTestCard({
    name: "Synthetic Battlefield Damage",
    publicCode: "SYN-005/100",
    text: "[Action] (Play on your turn or in showdowns.)Deal 6 to a unit at a battlefield."
  });

  const preview = await previewCardCatalogImport({
    behaviorCatalog: buildPrimitiveCatalog(),
    sourceLabel: "uploaded.json",
    rawJson: JSON.stringify([card]),
    existingCardLookup: async () =>
      new Map([
        [
          "SYN-005",
          {
            cardCode: "SYN-005",
            modelingStatus: "approved",
            runtimeSupportStatus: "supported",
            sourceTextHash: "different-hash",
            updatedAt: "2026-06-19T00:00:00.000Z"
          }
        ]
      ])
  });

  assert.equal(preview.summary.changedSincePersistedCardCount, 1);
  assert.equal(preview.cards[0]?.existingCatalog.state, "changed_since_persisted");
});

test("rejects invalid uploaded JSON before behavior discovery", async () => {
  await assert.rejects(
    () =>
      previewCardCatalogImport({
        behaviorCatalog: buildPrimitiveCatalog(),
        sourceLabel: "broken.json",
        rawJson: "{",
        existingCardLookup: async () => new Map()
      }),
    (caught) =>
      caught instanceof CardCatalogImportPreviewError &&
      caught.code === "invalid_json"
  );
});

function createTestCard(input: {
  name: string;
  publicCode: string;
  text: string;
  type?: Card["classification"]["type"];
  supertype?: Card["classification"]["supertype"];
  domain?: string[];
  metadata?: Partial<Card["metadata"]>;
}): Card {
  return {
    id: input.publicCode,
    name: input.name,
    riftbound_id: input.publicCode.toLowerCase(),
    public_code: input.publicCode,
    collector_number: input.publicCode.match(/\d+/)?.[0] ?? "1",
    attributes: {
      energy: input.type === "Rune" || input.type === "Battlefield" ? null : 1,
      might: input.type === "Unit" ? 1 : null,
      power: null
    },
    classification: {
      type: input.type ?? "Spell",
      supertype: input.supertype ?? null,
      rarity: "Common",
      domain: input.domain ?? ["Mind"]
    },
    text: {
      plain: input.text,
      rich: input.text
    },
    set: {
      set_id: input.publicCode.slice(0, 3),
      label: "Test Set"
    },
    media: {},
    tags: [],
    metadata: {
      clean_name: input.name,
      alternate_art: false,
      overnumbered: false,
      signature: false,
      ...input.metadata
    }
  };
}
