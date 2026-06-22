import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCanonicalCardDocument,
  buildPrimitiveCatalog,
  canonicalCardPublicationInputSchema,
  hashCardRulesText,
  type CanonicalCardPublicationInput
} from "../src/server/card-catalog";
import type { Card } from "../src/server/catalog";

test("builds an approved canonical card with reusable behavior bindings", () => {
  const input = createPublicationInput();
  const document = buildCanonicalCardDocument(
    input,
    buildPrimitiveCatalog(),
    "2026-06-20T00:00:00.000Z",
    "2026-06-20T01:00:00.000Z"
  );

  assert.equal(document.id, "OGN-095");
  assert.equal(document.card.name, "Stupefy");
  assert.equal(document.status, "approved");
  assert.equal(document.behaviorBindings[0]?.behaviorId, "timing.reaction");
  assert.equal(
    document.behaviorBindings.find(
      (binding) => binding.behaviorId === "modifier.modify_numeric_value"
    )?.parameters.amount,
    1
  );
});

test("rejects non-approved canonical publication", () => {
  assert.throws(() =>
    canonicalCardPublicationInputSchema.parse({
      ...createPublicationInput(),
      status: "requires_engine_support"
    })
  );
});

test("allows multiple canonical cards to reference one reusable behavior", () => {
  const firstInput = createPublicationInput();
  const secondCard = {
    ...createCard(),
    id: "TST-096/100",
    name: "Second Reaction",
    public_code: "TST-096/100"
  };
  const secondInput: CanonicalCardPublicationInput = {
    ...createPublicationInput(),
    cardCode: "TST-096",
    card: secondCard,
    sourceTextHash: hashCardRulesText(secondCard)
  };
  const catalog = buildPrimitiveCatalog();
  const first = buildCanonicalCardDocument(firstInput, catalog, "a", "b");
  const second = buildCanonicalCardDocument(secondInput, catalog, "a", "b");

  assert.equal(first.behaviorBindings[0]?.behaviorId, "timing.reaction");
  assert.equal(second.behaviorBindings[0]?.behaviorId, "timing.reaction");
});

test("rejects unknown and invalid behavior bindings", () => {
  const input = createPublicationInput();
  const unknown = structuredClone(input);
  unknown.clauses[0]!.assignments[0]!.primitiveId = "action.not_real";

  assert.throws(
    () => buildCanonicalCardDocument(unknown, buildPrimitiveCatalog(), "a", "b"),
    /Unknown behavior definition/
  );

  const invalid = structuredClone(input);
  const modifier = invalid.clauses[0]!.assignments.find(
    (assignment) => assignment.primitiveId === "modifier.modify_numeric_value"
  )!;
  modifier.parameters.amount = -1;

  assert.throws(
    () => buildCanonicalCardDocument(invalid, buildPrimitiveCatalog(), "a", "b"),
    /Invalid behavior binding/
  );
});

function createPublicationInput(): CanonicalCardPublicationInput {
  const card = createCard();

  return {
    cardCode: "OGN-095",
    card,
    sourceTextHash: hashCardRulesText(card),
    status: "approved",
    adminNotes: "Validated from uploaded set.",
    clauses: [
      {
        id: "clause-1",
        sourceText: card.text.plain,
        normalizedText: card.text.plain,
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
            primitiveId: "modifier.modify_numeric_value",
            family: "modifier",
            sourceText: "Give a unit -1 :rb_might:",
            parameters: {
              attribute: "might",
              operation: "reduce",
              operand: "constant",
              amount: 1,
              duration: "thisTurn",
              target: "unit",
              minimum: 1
            },
            confidence: "high"
          }
        ]
      }
    ]
  };
}

function createCard(): Card {
  return {
    id: "OGN-095/298",
    name: "Stupefy",
    public_code: "OGN-095/298",
    attributes: { energy: 1, might: null, power: null },
    classification: {
      type: "Spell",
      supertype: null,
      rarity: "Common",
      domain: ["Mind"]
    },
    text: {
      plain:
        "[Reaction] Give a unit -1 :rb_might: this turn, to a minimum of 1 :rb_might:."
    },
    set: { set_id: "OGN", label: "Origins" },
    media: {},
    tags: [],
    metadata: { clean_name: "Stupefy" }
  };
}
