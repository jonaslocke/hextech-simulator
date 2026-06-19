import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeLocalCardSetCorpus,
  deriveCardCode,
  discoverCardPrimitives
} from "../src/server/card-catalog";
import type { Card } from "../src/server/catalog";

test("derives stable card identity from public code variants", () => {
  assert.equal(deriveCardCode("OGN-027/298"), "OGN-027");
  assert.equal(deriveCardCode("OGN-027a/298"), "OGN-027");
  assert.equal(deriveCardCode("OGN-307*/298"), "OGN-307");
});

test("discovers primitive assignments for Stupefy without behavior templates", () => {
  const discovery = discoverCardPrimitives(
    createTestCard({
      name: "Stupefy",
      publicCode: "OGN-095/298",
      text: "[Reaction] (Play any time, even before spells and abilities resolve.)Give a unit -1 :rb_might: this turn, to a minimum of 1 :rb_might:. Draw 1."
    })
  );
  const primitiveIds = discovery.clauses.flatMap((clause) =>
    clause.assignments.map((assignment) => assignment.primitiveId)
  );

  assert.equal(discovery.cardCode, "OGN-095");
  assert.deepEqual(primitiveIds, [
    "timing.reaction",
    "selector.unit",
    "modifier.modify_might",
    "condition.minimum",
    "action.draw_cards"
  ]);

  const modifyMight = discovery.clauses
    .flatMap((clause) => clause.assignments)
    .find((assignment) => assignment.primitiveId === "modifier.modify_might");
  const draw = discovery.clauses
    .flatMap((clause) => clause.assignments)
    .find((assignment) => assignment.primitiveId === "action.draw_cards");

  assert.deepEqual(modifyMight?.parameters, {
    amount: -1,
    duration: "this_turn",
    minimum: 1,
    target: "unit"
  });
  assert.deepEqual(draw?.parameters, {
    player: "controller",
    count: 1
  });
});

test("discovers reusable primitives from the full local card corpus", async () => {
  const report = await analyzeLocalCardSetCorpus();
  const primitiveIds = new Set(
    report.primitives.map((entry) => entry.primitive.id)
  );

  assert.deepEqual(report.summary.sourceFiles, [
    "ogn.json",
    "ogs.json",
    "sfd.json"
  ]);
  assert.equal(report.summary.totalCards, 656);
  assert.equal(report.summary.cardsWithRulesText, 636);
  assert.equal(primitiveIds.has("action.draw_cards"), true);
  assert.equal(primitiveIds.has("action.kill_unit"), true);
  assert.equal(primitiveIds.has("action.ready_cards"), true);
  assert.equal(primitiveIds.has("action.exhaust_cards"), true);
  assert.equal(primitiveIds.has("action.deal_damage"), true);
  assert.equal(primitiveIds.has("action.channel_runes"), true);
  assert.equal(primitiveIds.has("modifier.modify_might"), true);
  assert.equal(primitiveIds.has("trigger.end_of_turn"), true);
  assert.equal(primitiveIds.has("selector.unit"), true);
  assert.equal(report.summary.discoveredPrimitiveCount > 20, true);
});

test("reports unsupported clauses without inventing behavior", () => {
  const discovery = discoverCardPrimitives(
    createTestCard({
      name: "Mystery Spell",
      publicCode: "TST-001/001",
      text: "Transform fate into a hidden lesson."
    })
  );

  assert.equal(discovery.clauses.length, 1);
  assert.equal(discovery.clauses[0]?.assignments.length, 0);
  assert.match(discovery.clauses[0]?.unsupportedReason ?? "", /No action/);
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
