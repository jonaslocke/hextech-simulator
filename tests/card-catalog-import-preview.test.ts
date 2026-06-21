import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CardCatalogImportPreviewError,
  previewCardCatalogImport,
  type PersistedCardValidationSummary
} from "../src/server/card-catalog";
import type { Card } from "../src/server/catalog";

test("previews admin-uploaded JSON without persisting suggestions", async () => {
  const stupefy = createTestCard({
    name: "Stupefy",
    publicCode: "OGN-095/298",
    text: "[Reaction] (Play any time, even before spells and abilities resolve.)Give a unit -1 :rb_might: this turn, to a minimum of 1 :rb_might:. Draw 1."
  });
  const megaMech = createTestCard({
    name: "Mega-Mech",
    publicCode: "OGN-088/298",
    text: "",
    type: "Unit"
  });
  const lookupCalls: string[][] = [];

  const preview = await previewCardCatalogImport({
    sourceLabel: "mvp.json",
    rawJson: JSON.stringify([stupefy, megaMech]),
    existingCardLookup: async (cardCodes) => {
      lookupCalls.push(cardCodes);
      return new Map();
    }
  });

  assert.deepEqual(lookupCalls, [["OGN-095", "OGN-088"]]);
  assert.equal(preview.sourceLabel, "mvp.json");
  assert.equal(preview.summary.uploadedCardCount, 2);
  assert.equal(preview.summary.suggestedCardCount, 1);
  assert.equal(preview.summary.vanillaCardCount, 1);
  assert.equal(preview.summary.newCardCount, 2);

  const stupefyPreview = preview.cards.find((card) => card.cardCode === "OGN-095");
  const megaMechPreview = preview.cards.find((card) => card.cardCode === "OGN-088");

  assert.equal(
    stupefyPreview?.suggestion?.supportStatus,
    "requires_engine_support"
  );
  assert.deepEqual(stupefyPreview?.suggestion?.primitiveIds, [
    "action.draw_cards",
    "modifier.modify_numeric_value",
    "selector.unit",
    "timing.reaction"
  ]);
  assert.equal(megaMechPreview?.isVanilla, true);
  assert.equal(megaMechPreview?.suggestion, null);
});

test("previews textless Basic Runes as intrinsic behavior cards", async () => {
  const mindRune = createTestCard({
    name: "Mind Rune",
    publicCode: "OGN-089/298",
    text: "",
    type: "Rune",
    supertype: "Basic",
    domain: ["Mind"]
  });

  const preview = await previewCardCatalogImport({
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
    name: "Back to Back",
    publicCode: "OGN-206/298",
    text: "[Reaction] (Play any time, even before spells and abilities resolve.)Give two friendly units each +2 :rb_might: this turn."
  });
  const persisted: PersistedCardValidationSummary = {
    cardCode: "OGN-206",
    status: "approved",
    sourceTextHash: null,
    updatedAt: "2026-06-19T00:00:00.000Z"
  };

  const preview = await previewCardCatalogImport({
    sourceLabel: "uploaded.json",
    rawJson: JSON.stringify([card]),
    existingCardLookup: async () => new Map([[persisted.cardCode, persisted]])
  });

  assert.equal(preview.summary.alreadyPersistedCardCount, 1);
  assert.equal(preview.summary.newCardCount, 0);
  assert.equal(preview.cards[0]?.existingCatalog.state, "already_persisted");
  assert.equal(preview.cards[0]?.existingCatalog.persisted?.status, "approved");
});

test("marks persisted cards as changed when the source text hash differs", async () => {
  const card = createTestCard({
    name: "Falling Comet",
    publicCode: "OGN-087/298",
    text: "[Action] (Play on your turn or in showdowns.)Deal 6 to a unit at a battlefield."
  });

  const preview = await previewCardCatalogImport({
    sourceLabel: "uploaded.json",
    rawJson: JSON.stringify([card]),
    existingCardLookup: async () =>
      new Map([
        [
          "OGN-087",
          {
            cardCode: "OGN-087",
            status: "approved",
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
