import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeCardBehaviorSuggestions,
  analyzeLocalCardSetBehaviorSuggestions,
  analyzeLocalCardSetCorpus,
  buildPrimitiveCatalog,
  deriveCardCode,
  discoverCardPrimitives,
  getPrimitiveCatalogEntry,
  playerReferenceKinds,
  validatePrimitiveAssignmentParameters
} from "../src/server/card-catalog";
import {
  gameZoneKinds,
  modifierDurations,
  runeResourceTypes
} from "../src/server/match/game";
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
    duration: "thisTurn",
    minimum: 1,
    target: "unit"
  });
  assert.deepEqual(draw?.parameters, {
    player: "player",
    count: 1
  });
});

test("discovers selector constraints for target legality from card text", () => {
  const backToBack = discoverCardPrimitives(
    createTestCard({
      name: "Back to Back",
      publicCode: "OGN-206/298",
      text: "[Reaction] (Play any time, even before spells and abilities resolve.)Give two friendly units each +2 :rb_might: this turn."
    })
  );
  const fallingComet = discoverCardPrimitives(
    createTestCard({
      name: "Falling Comet",
      publicCode: "OGN-087/298",
      text: "[Action] (Play on your turn or in showdowns.)Deal 6 to a unit at a battlefield."
    })
  );
  const singularity = discoverCardPrimitives(
    createTestCard({
      name: "Singularity",
      publicCode: "OGN-105/298",
      text: "Deal 6 to each of up to two units."
    })
  );

  assert.deepEqual(findAssignment(backToBack, "selector.friendly_unit")?.parameters, {
    count: 2,
    controller: "player",
    excludesSource: false
  });
  assert.deepEqual(findAssignment(fallingComet, "selector.unit")?.parameters, {
    count: 1,
    excludesSource: false,
    scope: "any",
    zone: "battlefield"
  });
  assert.deepEqual(findAssignment(singularity, "selector.up_to")?.parameters, {
    count: 2
  });
});

test("builds typed card behavior suggestions with parameter validation", () => {
  const report = analyzeCardBehaviorSuggestions([
    createTestCard({
      name: "Stupefy",
      publicCode: "OGN-095/298",
      text: "[Reaction] (Play any time, even before spells and abilities resolve.)Give a unit -1 :rb_might: this turn, to a minimum of 1 :rb_might:. Draw 1."
    })
  ]);
  const suggestion = report.cards[0]!;
  const modifier = suggestion.clauses
    .flatMap((clause) => clause.assignments)
    .find((assignment) => assignment.assignment.primitiveId === "modifier.modify_might");

  assert.equal(suggestion.supportStatus, "supported");
  assert.equal(suggestion.missingRequiredParameterCount, 0);
  assert.equal(suggestion.unsupportedClauseCount, 0);
  assert.equal(modifier?.parameterValidation.complete, true);
  assert.equal(
    modifier?.catalogEntry.parameters.some((parameter) => parameter.name === "target"),
    true
  );
});

test("catalogs selector unit zone as a known game zone enum", () => {
  const selectorUnit = buildPrimitiveCatalog().find(
    (entry) => entry.id === "selector.unit"
  );
  const zoneParameter = selectorUnit?.parameters.find(
    (parameter) => parameter.name === "zone"
  );
  const invalidZoneValidation = validatePrimitiveAssignmentParameters(
    {
      primitiveId: "selector.unit",
      family: "selector",
      sourceText: "unit in a fake zone",
      parameters: {
        zone: "fake_zone"
      },
      confidence: "medium"
    },
    getPrimitiveCatalogEntry("selector.unit", "selector")
  );

  assert.deepEqual(zoneParameter?.options, [...gameZoneKinds]);
  assert.equal(invalidZoneValidation.complete, false);
  assert.match(
    invalidZoneValidation.issues[0]?.message ?? "",
    /must be one of/
  );
});

test("catalogs modify might duration as a known modifier duration enum", () => {
  const modifyMight = buildPrimitiveCatalog().find(
    (entry) => entry.id === "modifier.modify_might"
  );
  const durationParameter = modifyMight?.parameters.find(
    (parameter) => parameter.name === "duration"
  );
  const invalidDurationValidation = validatePrimitiveAssignmentParameters(
    {
      primitiveId: "modifier.modify_might",
      family: "modifier",
      sourceText: "give a unit +1 :rb_might: for a weird duration",
      parameters: {
        amount: 1,
        target: "unit",
        duration: "weird_duration"
      },
      confidence: "medium"
    },
    getPrimitiveCatalogEntry("modifier.modify_might", "modifier")
  );

  assert.deepEqual(durationParameter?.options, [...modifierDurations]);
  assert.equal(invalidDurationValidation.complete, false);
  assert.match(
    invalidDurationValidation.issues[0]?.message ?? "",
    /must be one of/
  );
});

test("catalogs rune resource behavior with known resource type enum", () => {
  const addRuneResource = buildPrimitiveCatalog().find(
    (entry) => entry.id === "action.add_rune_resource"
  );
  const resourceTypeParameter = addRuneResource?.parameters.find(
    (parameter) => parameter.name === "resourceType"
  );
  const invalidResourceValidation = validatePrimitiveAssignmentParameters(
    {
      primitiveId: "action.add_rune_resource",
      family: "action",
      sourceText: "add a rune resource",
      parameters: {
        player: "player",
        resourceType: "mana",
        amount: 1
      },
      confidence: "medium"
    },
    getPrimitiveCatalogEntry("action.add_rune_resource", "action")
  );

  assert.deepEqual(resourceTypeParameter?.options, [...runeResourceTypes]);
  assert.equal(invalidResourceValidation.complete, false);
  assert.match(
    invalidResourceValidation.issues[0]?.message ?? "",
    /must be one of/
  );
});

test("catalogs player parameters as known player reference enum", () => {
  const drawCards = buildPrimitiveCatalog().find(
    (entry) => entry.id === "action.draw_cards"
  );
  const playerParameter = drawCards?.parameters.find(
    (parameter) => parameter.name === "player"
  );
  const invalidPlayerValidation = validatePrimitiveAssignmentParameters(
    {
      primitiveId: "action.draw_cards",
      family: "action",
      sourceText: "draw 1",
      parameters: {
        player: "teammate",
        count: 1
      },
      confidence: "medium"
    },
    getPrimitiveCatalogEntry("action.draw_cards", "action")
  );

  assert.deepEqual(playerParameter?.options, [...playerReferenceKinds]);
  assert.equal(invalidPlayerValidation.complete, false);
  assert.match(
    invalidPlayerValidation.issues[0]?.message ?? "",
    /must be one of/
  );
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

test("builds a corpus behavior suggestion report without behavior templates", async () => {
  const report = await analyzeLocalCardSetBehaviorSuggestions();
  const primitiveIds = new Set(report.primitiveCatalog.map((entry) => entry.id));
  const chooseTarget = report.primitiveCatalog.find(
    (entry) => entry.id === "choice.choose_target"
  );

  assert.deepEqual(report.summary.sourceFiles, [
    "ogn.json",
    "ogs.json",
    "sfd.json"
  ]);
  assert.equal(report.summary.totalCards, 656);
  assert.equal(report.summary.cardsWithRulesText, 636);
  assert.equal(report.summary.suggestedCardCount, 636);
  assert.equal(report.summary.completeSuggestionCount > 0, true);
  assert.equal(primitiveIds.has("choice.choose_target"), true);
  assert.equal(primitiveIds.has("selector.friendly_unit"), true);
  assert.equal(primitiveIds.has("selector.enemy_unit"), true);
  assert.equal((chooseTarget?.examples.length ?? 0) > 0, true);
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

test("rolls unsupported text into behavior suggestion status", () => {
  const report = analyzeCardBehaviorSuggestions([
    createTestCard({
      name: "Mystery Spell",
      publicCode: "TST-001/001",
      text: "Transform fate into a hidden lesson."
    })
  ]);

  assert.equal(report.cards[0]?.supportStatus, "unsupported");
  assert.equal(report.cards[0]?.unsupportedClauseCount, 1);
});

function findAssignment(
  discovery: ReturnType<typeof discoverCardPrimitives>,
  primitiveId: string
) {
  return discovery.clauses
    .flatMap((clause) => clause.assignments)
    .find((assignment) => assignment.primitiveId === primitiveId);
}

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
