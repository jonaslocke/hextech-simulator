import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeCardBehaviorSuggestions,
  analyzeLocalCardSetBehaviorSuggestions,
  analyzeLocalCardSetCorpus,
  buildPrimitiveCatalog,
  costResourceTypes,
  deriveCardCode,
  discoverCardPrimitives,
  getPrimitiveCatalogEntry,
  gameEventKinds,
  playEventSubjectKinds,
  playerReferenceKinds,
  runeEntryStates,
  targetReferenceKinds,
  tokenKinds,
  unitLocationRelations,
  unitScopeKinds,
  unitTargetAreas,
  validatePrimitiveAssignmentParameters
} from "../src/server/card-catalog";
import {
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
    "action.draw_cards"
  ]);

  const modifyMight = discovery.clauses
    .flatMap((clause) => clause.assignments)
    .find((assignment) => assignment.primitiveId === "modifier.modify_might");
  const draw = discovery.clauses
    .flatMap((clause) => clause.assignments)
    .find((assignment) => assignment.primitiveId === "action.draw_cards");
  const selector = findAssignment(discovery, "selector.unit");

  assert.deepEqual(selector?.parameters, {
    scope: "any",
    minimumCount: 1,
    maximumCount: 1,
    area: "board",
    locationRelation: "any",
    excludesSource: false
  });

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
    minimumCount: 2,
    maximumCount: 2,
    area: "board",
    locationRelation: "any",
    controller: "player",
    excludesSource: false
  });
  assert.deepEqual(findAssignment(fallingComet, "selector.unit")?.parameters, {
    minimumCount: 1,
    maximumCount: 1,
    area: "battlefield",
    excludesSource: false,
    locationRelation: "any",
    scope: "any",
  });
  assert.deepEqual(findAssignment(singularity, "selector.unit")?.parameters, {
    scope: "each",
    minimumCount: 0,
    maximumCount: 2,
    area: "board",
    locationRelation: "any",
    excludesSource: false
  });
  assert.equal(findAssignment(singularity, "selector.up_to"), undefined);
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

test("catalogs strict Unit target areas and location relations", () => {
  const selectorUnit = buildPrimitiveCatalog().find(
    (entry) => entry.id === "selector.unit"
  );
  const areaParameter = selectorUnit?.parameters.find(
    (parameter) => parameter.name === "area"
  );
  const relationParameter = selectorUnit?.parameters.find(
    (parameter) => parameter.name === "locationRelation"
  );
  const invalidAreaValidation = validatePrimitiveAssignmentParameters(
    {
      primitiveId: "selector.unit",
      family: "selector",
      sourceText: "unit in trash",
      parameters: {
        area: "trash",
        locationRelation: "any"
      },
      confidence: "medium"
    },
    getPrimitiveCatalogEntry("selector.unit", "selector")
  );

  assert.equal(
    selectorUnit?.parameters.some((parameter) => parameter.name === "zone"),
    false
  );
  assert.deepEqual(areaParameter?.options, [...unitTargetAreas]);
  assert.deepEqual(relationParameter?.options, [...unitLocationRelations]);
  assert.equal(areaParameter?.required, true);
  assert.equal(relationParameter?.required, true);
  assert.equal(invalidAreaValidation.complete, false);
  assert.match(
    invalidAreaValidation.issues[0]?.message ?? "",
    /must be one of/
  );
});

test("rejects invalid Unit selector count bounds", () => {
  const validation = validatePrimitiveAssignmentParameters(
    {
      primitiveId: "selector.unit",
      family: "selector",
      sourceText: "choose units",
      parameters: {
        minimumCount: 3,
        maximumCount: 2,
        area: "board",
        locationRelation: "any"
      },
      confidence: "high"
    },
    getPrimitiveCatalogEntry("selector.unit", "selector")
  );

  assert.equal(validation.complete, false);
  assert.match(
    validation.issues.find((issue) => issue.parameterName === "maximumCount")
      ?.message ?? "",
    /cannot be less/
  );
});

test("uses selectors for explicit choice legality and count", () => {
  const discovery = discoverCardPrimitives(
    createTestCard({
      name: "Solari Chief",
      publicCode: "OGN-225/298",
      text: "When you play me, choose an enemy unit."
    })
  );
  const choice = findAssignment(discovery, "choice.choose_target");
  const selector = findAssignment(discovery, "selector.enemy_unit");

  assert.deepEqual(choice?.parameters, { player: "player" });
  assert.deepEqual(selector?.parameters, {
    minimumCount: 1,
    maximumCount: 1,
    area: "board",
    locationRelation: "any",
    controller: "opponent",
    excludesSource: false
  });
});

test("models play, choose, and ready clauses as event listeners", () => {
  const ravenbloom = discoverCardPrimitives(
    createTestCard({
      name: "Ravenbloom Student",
      publicCode: "OGN-103/298",
      text: "When you play a spell, give me +1 :rb_might: this turn."
    })
  );
  const bladeDancer = discoverCardPrimitives(
    createTestCard({
      name: "Blade Dancer",
      publicCode: "SFD-216/221",
      text: "When you choose a friendly unit, you may exhaust me and pay :rb_rune_rainbow: to ready it."
    })
  );
  const irelia = discoverCardPrimitives(
    createTestCard({
      name: "Irelia, Fervent",
      publicCode: "SFD-153/221",
      text: "When you choose or ready me, give me +1 :rb_might: this turn."
    })
  );

  assert.deepEqual(
    findAssignment(ravenbloom, "trigger.on_play")?.parameters,
    { actor: "player", subject: "spell" }
  );
  assert.deepEqual(
    findAssignment(bladeDancer, "trigger.on_choose")?.parameters,
    { actor: "player", subject: "event_subject" }
  );
  assert.equal(findAssignment(bladeDancer, "choice.choose_target"), undefined);
  assert.deepEqual(findAssignment(irelia, "trigger.on_choose")?.parameters, {
    actor: "player",
    subject: "source"
  });
  assert.deepEqual(findAssignment(irelia, "trigger.on_ready")?.parameters, {
    actor: "player",
    subject: "source"
  });
  assert.equal(findAssignment(irelia, "action.ready_cards"), undefined);
});

test("models Targon's Peak as a conquer listener with delayed resolution", () => {
  const discovery = discoverCardPrimitives(
    createTestCard({
      name: "Targon's Peak",
      publicCode: "OGN-289/298",
      text: "When you conquer here, ready 2 runes at the end of this turn."
    })
  );

  assert.deepEqual(
    findAssignment(discovery, "timing.delayed")?.parameters,
    { point: "endOfThisTurn" }
  );
  assert.notEqual(
    findAssignment(discovery, "trigger.conquer_battlefield"),
    undefined
  );
  assert.equal(findAssignment(discovery, "trigger.end_of_turn"), undefined);
  assert.deepEqual(
    getPrimitiveCatalogEntry("trigger.conquer_battlefield", "trigger")
      .listensToEvents,
    ["battlefield.conquered"]
  );
});

test("declares emitted events for reusable action primitives", () => {
  assert.equal(gameEventKinds.includes("turn.awaken"), true);
  assert.equal(gameEventKinds.includes("turn.beginning"), true);
  assert.equal(gameEventKinds.includes("turn.channel"), true);
  assert.equal(gameEventKinds.includes("turn.draw"), true);
  assert.deepEqual(
    getPrimitiveCatalogEntry("action.move_unit", "action").emitsEvents,
    ["unit.moved"]
  );
  assert.deepEqual(
    getPrimitiveCatalogEntry("action.ready_cards", "action").emitsEvents,
    ["card.readied"]
  );
});

test("discovers Base, source-location, and shared-location Unit constraints", () => {
  const baseTarget = discoverCardPrimitives(
    createTestCard({
      name: "Yone, Blademaster",
      publicCode: "SFD-116/221",
      text: "Deal damage equal to my Might to an enemy unit in a base."
    })
  );
  const hereTarget = discoverCardPrimitives(
    createTestCard({
      name: "Taric, Protector",
      publicCode: "OGN-074/298",
      text: "Other friendly units here have [Shield]."
    })
  );
  const sameBattlefield = discoverCardPrimitives(
    createTestCard({
      name: "Facebreaker",
      publicCode: "OGN-220/298",
      text: "Stun a friendly unit and an enemy unit at the same battlefield."
    })
  );
  const sameLocation = discoverCardPrimitives(
    createTestCard({
      name: "Bellows Breath",
      publicCode: "SFD-080/221",
      text: "Deal 1 to up to three units at the same location."
    })
  );

  assert.equal(
    findAssignment(baseTarget, "selector.enemy_unit")?.parameters.area,
    "base"
  );
  assert.deepEqual(
    pickLocation(findAssignment(hereTarget, "selector.friendly_unit")?.parameters),
    { area: "board", locationRelation: "sourceLocation" }
  );
  assert.deepEqual(
    pickLocation(
      findAssignment(sameBattlefield, "selector.friendly_unit")?.parameters
    ),
    { area: "battlefield", locationRelation: "sharedLocation" }
  );
  assert.deepEqual(
    pickLocation(findAssignment(sameLocation, "selector.unit")?.parameters),
    { area: "board", locationRelation: "sharedLocation" }
  );
});

test("does not confuse a move destination with the selected Unit area", () => {
  const discovery = discoverCardPrimitives(
    createTestCard({
      name: "Fight or Flight",
      publicCode: "OGN-168/298",
      text: "Move a unit from a battlefield to its base."
    })
  );

  assert.deepEqual(
    pickLocation(findAssignment(discovery, "selector.unit")?.parameters),
    { area: "battlefield", locationRelation: "any" }
  );
});

test("catalogs Hidden as one fixed parameterless behavior", () => {
  const catalogEntry = getPrimitiveCatalogEntry("keyword.hidden", "keyword");
  const standUnited = discoverCardPrimitives(
    createTestCard({
      name: "Stand United",
      publicCode: "OGN-053/298",
      text: "[Hidden] (Hide now for :rb_rune_rainbow: to react with later for :rb_energy_0:.)[Action] (Play on your turn or in showdowns.)Buff a friendly unit."
    })
  );
  const windsinger = discoverCardPrimitives(
    createTestCard({
      name: "Windsinger",
      publicCode: "SFD-138/221",
      text: "Hidden (Hide now for :rb_rune_rainbow: to react with later for :rb_energy_0:.)When you play me, return another unit at a battlefield."
    })
  );

  assert.equal(findAssignments(standUnited, "keyword.hidden").length, 1);
  assert.deepEqual(
    findAssignment(standUnited, "keyword.hidden")?.parameters,
    {}
  );
  assert.equal(findAssignments(windsinger, "keyword.hidden").length, 1);
  assert.deepEqual(catalogEntry.parameters, []);
  assert.equal(catalogEntry.fixedRules.length, 6);
  assert.equal(catalogEntry.engineSupport.status, "requires_engine_support");
});

test("does not grant Hidden behavior to cards that only reference Hidden", () => {
  const references = [
    "Put a Teemo unit you own into your hand from your Champion Zone or the board if it has [Hidden].",
    "When you play a card from [Hidden], give me +2 :rb_might: this turn.",
    "Return another friendly gear, unit, or [Hidden] card to its owner's hand."
  ];

  for (const [index, text] of references.entries()) {
    const discovery = discoverCardPrimitives(
      createTestCard({
        name: `Hidden Reference ${index}`,
        publicCode: `TST-10${index}/200`,
        text
      })
    );

    assert.equal(findAssignments(discovery, "keyword.hidden").length, 0);
  }
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

test("discovers intrinsic Basic Rune resource abilities without rules text", () => {
  const mindRune = createTestCard({
    name: "Mind Rune",
    publicCode: "OGN-089/298",
    text: "",
    type: "Rune",
    supertype: "Basic",
    domain: ["Mind"]
  });
  const discovery = discoverCardPrimitives(mindRune);
  const report = analyzeCardBehaviorSuggestions([mindRune]);
  const assignment = discovery.clauses[0]?.assignments[0];
  const catalogEntry = report.primitiveCatalog.find(
    (entry) => entry.id === "ability.basic_rune_resources"
  );

  assert.equal(discovery.rulesText, "");
  assert.deepEqual(discovery.primitiveIds, ["ability.basic_rune_resources"]);
  assert.equal(discovery.clauses[0]?.id, "intrinsic-basic-rune-resources");
  assert.equal(assignment?.family, "ability");
  assert.deepEqual(assignment?.parameters, {});
  assert.equal(report.summary.cardsWithRulesText, 0);
  assert.equal(report.summary.suggestedCardCount, 1);
  assert.equal(report.cards[0]?.supportStatus, "supported");
  assert.deepEqual(catalogEntry?.parameters, []);
});

test("does not grant Basic Rune abilities to non-Basic Runes", () => {
  const nonBasicRune = createTestCard({
    name: "Special Rune",
    publicCode: "TST-004/001",
    text: "",
    type: "Rune",
    supertype: null,
    domain: ["Mind"]
  });

  assert.deepEqual(discoverCardPrimitives(nonBasicRune).clauses, []);
  assert.equal(analyzeCardBehaviorSuggestions([nonBasicRune]).cards.length, 0);
});

test("catalogs corpus-backed primitive text parameters as enums", () => {
  const catalog = buildPrimitiveCatalog();
  const onPlay = catalog.find((entry) => entry.id === "trigger.on_play");
  const selectorUnit = catalog.find((entry) => entry.id === "selector.unit");
  const channelRunes = catalog.find((entry) => entry.id === "action.channel_runes");
  const playToken = catalog.find((entry) => entry.id === "action.play_token");
  const payCost = catalog.find((entry) => entry.id === "cost.pay");

  assert.deepEqual(
    onPlay?.parameters.find((parameter) => parameter.name === "subject")?.options,
    [...playEventSubjectKinds]
  );
  assert.deepEqual(
    selectorUnit?.parameters.find((parameter) => parameter.name === "scope")?.options,
    [...unitScopeKinds]
  );
  assert.deepEqual(
    channelRunes?.parameters.find((parameter) => parameter.name === "entryState")?.options,
    [...runeEntryStates]
  );
  assert.deepEqual(
    playToken?.parameters.find((parameter) => parameter.name === "tokenName")?.options,
    [...tokenKinds]
  );
  assert.deepEqual(
    payCost?.parameters.find((parameter) => parameter.name === "resource")?.options,
    [...costResourceTypes]
  );
});

test("catalogs target parameters as known target references", () => {
  const modifyMight = buildPrimitiveCatalog().find(
    (entry) => entry.id === "modifier.modify_might"
  );
  const targetParameter = modifyMight?.parameters.find(
    (parameter) => parameter.name === "target"
  );
  const invalidTargetValidation = validatePrimitiveAssignmentParameters(
    {
      primitiveId: "modifier.modify_might",
      family: "modifier",
      sourceText: "give something +1 :rb_might:",
      parameters: {
        amount: 1,
        target: "unspecified"
      },
      confidence: "low"
    },
    getPrimitiveCatalogEntry("modifier.modify_might", "modifier")
  );

  assert.deepEqual(targetParameter?.options, [...targetReferenceKinds]);
  assert.equal(invalidTargetValidation.complete, false);
  assert.match(
    invalidTargetValidation.issues[0]?.message ?? "",
    /must be one of/
  );
});

test("discovers exact token names from token creation text", () => {
  const recruit = discoverCardPrimitives(
    createTestCard({
      name: "Recruit Maker",
      publicCode: "TST-002/001",
      text: "When you play me, play a 1 :rb_might: Recruit unit token in your base."
    })
  );
  const gold = discoverCardPrimitives(
    createTestCard({
      name: "Gold Maker",
      publicCode: "TST-003/001",
      text: "When I move, play four Gold gear tokens exhausted."
    })
  );

  assert.equal(
    findAssignment(recruit, "action.play_token")?.parameters.tokenName,
    "1 :rb_might: Recruit unit"
  );
  assert.equal(
    findAssignment(gold, "action.play_token")?.parameters.tokenName,
    "Gold gear"
  );
});

test("discovers reusable primitives from the full local card corpus", async () => {
  const report = await analyzeLocalCardSetCorpus();
  const catalog = buildPrimitiveCatalog(report.primitives);
  const primitiveIds = new Set(
    report.primitives.map((entry) => entry.primitive.id)
  );
  const tankKeyword = catalog.find((entry) => entry.id === "keyword.tank");
  const tankParameter = tankKeyword?.parameters.find(
    (parameter) => parameter.name === "keyword"
  );
  const hiddenCards = report.cards.filter((card) =>
    card.primitiveIds.includes("keyword.hidden")
  );
  const hiddenReferenceNames = new Set([
    "Swift Scout",
    "Ember Monk",
    "Ava Achiever",
    "Pack of Wonders",
    "Noxus Saboteur",
    "Guerilla Warfare"
  ]);
  const hiddenReferences = report.cards.filter((card) =>
    hiddenReferenceNames.has(card.cardName)
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
  assert.equal(primitiveIds.has("ability.basic_rune_resources"), true);
  assert.equal(primitiveIds.has("modifier.modify_might"), true);
  assert.equal(primitiveIds.has("trigger.end_of_turn"), true);
  assert.equal(primitiveIds.has("selector.unit"), true);
  assert.equal(hiddenCards.length, 26);
  assert.equal(hiddenReferences.length, 8);
  assert.equal(
    hiddenReferences.every(
      (card) => !card.primitiveIds.includes("keyword.hidden")
    ),
    true
  );
  assert.equal(report.summary.discoveredPrimitiveCount > 20, true);
  assert.deepEqual(tankParameter?.options, ["Tank"]);
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
  assert.equal(report.summary.suggestedCardCount, 648);
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

function findAssignments(
  discovery: ReturnType<typeof discoverCardPrimitives>,
  primitiveId: string
) {
  return discovery.clauses
    .flatMap((clause) => clause.assignments)
    .filter((assignment) => assignment.primitiveId === primitiveId);
}

function pickLocation(
  parameters: Record<string, string | number | boolean | null> | undefined
) {
  return {
    area: parameters?.area,
    locationRelation: parameters?.locationRelation
  };
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
