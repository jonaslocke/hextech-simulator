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
  assert.equal(document.schemaVersion, 1);
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
              count: 1,
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
              player: "controller",
              count: 1
            },
            confidence: "high"
          }
        ]
      }
    ]
  };
}
