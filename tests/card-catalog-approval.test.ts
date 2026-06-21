import assert from "node:assert/strict";
import { test } from "node:test";
import {
  approvedCardBehaviorInputSchema,
  buildApprovedCardBehaviorDocument,
  type ApprovedCardBehaviorInput
} from "../src/server/card-catalog";

test("builds an approved card behavior document keyed by stable card code", () => {
  const input = createApprovedStupefyInput();
  const document = buildApprovedCardBehaviorDocument({
    input,
    createdAt: "2026-06-20T00:00:00.000Z",
    updatedAt: "2026-06-20T01:00:00.000Z"
  });

  assert.equal(document.id, "OGN-095");
  assert.equal(document.cardCode, "OGN-095");
  assert.equal(document.status, "approved");
  assert.equal("schemaVersion" in document, false);
  assert.equal(document.clauses[0]?.assignments[0]?.primitiveId, "timing.reaction");
  assert.equal(
    document.clauses[0]?.assignments.find(
      (assignment) => assignment.primitiveId === "modifier.modify_might"
    )?.parameters.amount,
    -1
  );
});

test("validates approved behavior payloads before persistence", () => {
  const parsed = approvedCardBehaviorInputSchema.parse(createApprovedStupefyInput());

  assert.equal(parsed.cardCode, "OGN-095");
  assert.equal(parsed.clauses.length, 2);
  assert.equal(parsed.adminNotes, "Validated from uploaded mvp.json.");
});

test("accepts approved intrinsic Basic Rune ability behavior", () => {
  const parsed = approvedCardBehaviorInputSchema.parse({
    cardCode: "OGN-089",
    publicCode: "OGN-089/298",
    name: "Mind Rune",
    setCode: "OGN",
    type: "Rune",
    sourceText: "",
    sourceTextHash: "mind-rune-hash",
    status: "approved",
    adminNotes: "Validated from Core Rules 157.2.",
    clauses: [
      {
        id: "intrinsic-basic-rune-resources",
        sourceText: "Basic Rune intrinsic abilities (Core Rules 157.2)",
        normalizedText: "Basic Rune intrinsic abilities (Core Rules 157.2)",
        unsupportedReason: null,
        assignments: [
          {
            primitiveId: "ability.basic_rune_resources",
            family: "ability",
            sourceText: "Basic Rune intrinsic abilities (Core Rules 157.2)",
            parameters: {},
            confidence: "high"
          }
        ]
      }
    ]
  });

  assert.equal(parsed.clauses[0]?.assignments[0]?.family, "ability");
});

function createApprovedStupefyInput(): ApprovedCardBehaviorInput {
  return {
    cardCode: "OGN-095",
    publicCode: "OGN-095/298",
    name: "Stupefy",
    setCode: "OGN",
    type: "Spell",
    sourceText:
      "[Reaction] (Play any time, even before spells and abilities resolve.)Give a unit -1 :rb_might: this turn, to a minimum of 1 :rb_might:. Draw 1.",
    sourceTextHash: "stupefy-hash",
    status: "approved",
    adminNotes: "Validated from uploaded mvp.json.",
    clauses: [
      {
        id: "clause-1",
        sourceText:
          "[Reaction] (Play any time, even before spells and abilities resolve.)Give a unit -1 :rb_might: this turn, to a minimum of 1 :rb_might:",
        normalizedText:
          "[Reaction] (Play any time, even before spells and abilities resolve.)Give a unit -1 :rb_might: this turn, to a minimum of 1 :rb_might:",
        unsupportedReason: null,
        assignments: [
          {
            primitiveId: "timing.reaction",
            family: "timing",
            sourceText: "[Reaction]",
            parameters: {},
            confidence: "high"
          },
          {
            primitiveId: "selector.unit",
            family: "selector",
            sourceText: "Give a unit -1 :rb_might:",
            parameters: {
              scope: "any",
              minimumCount: 1,
              maximumCount: 1,
              area: "board",
              locationRelation: "any",
              excludesSource: false
            },
            confidence: "medium"
          },
          {
            primitiveId: "modifier.modify_might",
            family: "modifier",
            sourceText: "Give a unit -1 :rb_might:",
            parameters: {
              amount: -1,
              duration: "thisTurn",
              target: "unit",
              minimum: 1
            },
            confidence: "high"
          }
        ]
      },
      {
        id: "clause-2",
        sourceText: "Draw 1",
        normalizedText: "Draw 1",
        unsupportedReason: null,
        assignments: [
          {
            primitiveId: "action.draw_cards",
            family: "action",
            sourceText: "Draw 1",
            parameters: {
              player: "player",
              count: 1
            },
            confidence: "high"
          }
        ]
      }
    ]
  };
}
