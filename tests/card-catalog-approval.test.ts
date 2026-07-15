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

test("builds an approved catalog card with a structured behavior model", () => {
  const input = createPublicationInput();
  const document = buildCanonicalCardDocument(
    input,
    buildPrimitiveCatalog(),
    "2026-06-20T00:00:00.000Z",
    "2026-06-20T01:00:00.000Z"
  );

  assert.equal(document.id, "SYN-001");
  assert.equal(document.card.name, "Synthetic Reaction Spell");
  assert.equal(document.modelingStatus, "approved");
  assert.equal(document.runtimeSupportStatus, "supported");
  assert.equal(document.behaviorModel.playTimings[0]?.behaviorId, "timing.reaction");
  assert.equal(
    document.behaviorModel.clauses[0]?.effects.find(
      (binding) => binding.behaviorId === "modifier.modify_numeric_value"
    )?.parameters.amount,
    1
  );
  assert.equal(document.behaviorModel.clauses[0]?.sequence, 0);
  assert.equal(document.behaviorModel.clauses[0]?.selectors[0]?.order, 1);
});

test("rejects non-approved catalog publication", () => {
  assert.throws(() =>
    canonicalCardPublicationInputSchema.parse({
      ...createPublicationInput(),
      modelingStatus: "requires_engine_support"
    })
  );
});

test("publishes executable and vanilla behavior models", () => {
  const runtimePending = buildCanonicalCardDocument(
    createPublicationInput(),
    buildPrimitiveCatalog(),
    "a",
    "b"
  );
  const vanillaCard = {
    ...createCard(),
    id: "TST-001/100",
    name: "Vanilla Unit",
    public_code: "TST-001/100",
    text: { plain: "" }
  };
  const vanilla = buildCanonicalCardDocument(
    {
      cardCode: "TST-001",
      card: vanillaCard,
      sourceTextHash: hashCardRulesText(vanillaCard),
      modelingStatus: "approved",
      adminNotes: "Confirmed vanilla.",
      clauses: []
    },
    buildPrimitiveCatalog(),
    "a",
    "b"
  );

  assert.equal(runtimePending.modelingStatus, "approved");
  assert.equal(runtimePending.runtimeSupportStatus, "supported");
  assert.equal(vanilla.modelingStatus, "approved");
  assert.equal(vanilla.runtimeSupportStatus, "supported");
  assert.deepEqual(vanilla.behaviorModel, { playTimings: [], clauses: [] });
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

  assert.equal(first.behaviorModel.playTimings[0]?.behaviorId, "timing.reaction");
  assert.equal(second.behaviorModel.playTimings[0]?.behaviorId, "timing.reaction");
});

test("publishes a Unit Reaction as a card play timing", () => {
  const input = createPublicationInput();
  input.card = {
    ...input.card,
    classification: {
      ...input.card.classification,
      type: "Unit",
      supertype: "Champion",
    },
  };
  input.sourceTextHash = hashCardRulesText(input.card);

  const document = buildCanonicalCardDocument(
    input,
    buildPrimitiveCatalog(),
    "a",
    "b",
  );

  assert.deepEqual(
    document.behaviorModel.playTimings.map((binding) => binding.behaviorId),
    ["timing.reaction"],
  );
  assert.deepEqual(document.behaviorModel.clauses[0]?.timings, []);
});

test("rejects unsupported and ambiguous clauses before publication", () => {
  const unsupported = structuredClone(createPublicationInput());
  unsupported.clauses[0]!.unsupportedReason = "Manual behavior is incomplete.";

  assert.throws(
    () => buildCanonicalCardDocument(unsupported, buildPrimitiveCatalog(), "a", "b"),
    /Unsupported behavior clause/
  );

  const ambiguous = structuredClone(createPublicationInput());
  ambiguous.clauses[0]!.assignments.push({
    primitiveId: "condition.if",
    family: "condition",
    sourceText: "if something happens",
    parameters: {},
    confidence: "low"
  });

  assert.throws(
    () => buildCanonicalCardDocument(ambiguous, buildPrimitiveCatalog(), "a", "b"),
    /Ambiguous behavior condition/
  );
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
    cardCode: "SYN-001",
    card,
    sourceTextHash: hashCardRulesText(card),
    modelingStatus: "approved",
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
    id: "SYN-001/100",
    name: "Synthetic Reaction Spell",
    public_code: "SYN-001/100",
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
    set: { set_id: "SYN", label: "Synthetic Set" },
    media: {},
    tags: [],
    metadata: { clean_name: "Synthetic Reaction Spell" }
  };
}
