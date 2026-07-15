import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeCardBehaviorSuggestions,
  behaviorDurationKinds,
  buildPrimitiveCatalog,
  costResourceTypes,
  deriveCardCode,
  discoverCardPrimitives,
  getPrimitiveCatalogEntry,
  gameEventKinds,
  numericModifierOperations,
  numericOperandKinds,
  numericValueKinds,
  playEventSubjectKinds,
  playerReferenceKinds,
  runeEntryStates,
  resourceAmountSources,
  resourceDomainKinds,
  resourceUsageKinds,
  targetReferenceKinds,
  tokenKinds,
  unitLocationRelations,
  unitScopeKinds,
  unitTargetAreas,
  unitTargetReferenceKinds,
  validatePrimitiveAssignmentParameters
} from "../src/server/card-catalog";
import { runeResourceTypes } from "../src/shared/game";
import type { Card } from "../src/server/catalog";

test("derives stable card identity from public code variants", () => {
  assert.equal(deriveCardCode("SYN-027/100"), "SYN-027");
  assert.equal(deriveCardCode("SYN-027a/100"), "SYN-027");
  assert.equal(deriveCardCode("SYN-307*/100"), "SYN-307");
});

test("discovers primitive assignments without behavior templates", () => {
  const discovery = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Reaction Spell",
      publicCode: "SYN-001/100",
      text: "[Reaction] (Play any time, even before spells and abilities resolve.)Give a unit -1 :rb_might: this turn, to a minimum of 1 :rb_might:. Draw 1."
    })
  );
  const primitiveIds = discovery.clauses.flatMap((clause) =>
    clause.assignments.map((assignment) => assignment.primitiveId)
  );

  assert.equal(discovery.cardCode, "SYN-001");
  assert.deepEqual(primitiveIds, [
    "timing.reaction",
    "selector.unit",
    "modifier.modify_numeric_value",
    "action.draw_cards"
  ]);

  const numericModifier = discovery.clauses
    .flatMap((clause) => clause.assignments)
    .find(
      (assignment) =>
        assignment.primitiveId === "modifier.modify_numeric_value"
    );
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

  assert.deepEqual(numericModifier?.parameters, {
    attribute: "might",
    operation: "reduce",
    operand: "constant",
    amount: 1,
    duration: "thisTurn",
    minimum: 1,
    target: "unit"
  });
  assert.deepEqual(draw?.parameters, {
    player: "controller",
    count: 1
  });
});

test("discovers selector constraints for target legality from card text", () => {
  const backToBack = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Group Buff",
      publicCode: "SYN-002/100",
      text: "[Reaction] (Play any time, even before spells and abilities resolve.)Give two friendly units each +2 :rb_might: this turn."
    })
  );
  const fallingComet = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Battlefield Damage",
      publicCode: "SYN-003/100",
      text: "[Action] (Play on your turn or in showdowns.)Deal 6 to a unit at a battlefield."
    })
  );
  const optionalDamage = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Optional Damage",
      publicCode: "SYN-004/100",
      text: "Deal 6 to each of up to two units."
    })
  );

  assert.deepEqual(findAssignment(backToBack, "selector.friendly_unit")?.parameters, {
    minimumCount: 2,
    maximumCount: 2,
    area: "board",
    locationRelation: "any",
    controller: "controller",
    excludesSource: false
  });
  assert.equal(findAssignment(backToBack, "selector.unit"), undefined);
  assert.deepEqual(findAssignment(fallingComet, "selector.unit")?.parameters, {
    minimumCount: 1,
    maximumCount: 1,
    area: "battlefield",
    excludesSource: false,
    locationRelation: "any",
    scope: "any",
  });
  assert.deepEqual(findAssignment(optionalDamage, "selector.unit")?.parameters, {
    scope: "any",
    minimumCount: 0,
    maximumCount: 2,
    area: "board",
    locationRelation: "any",
    excludesSource: false
  });
  assert.equal(findAssignment(optionalDamage, "selector.up_to"), undefined);
});

test("builds typed card behavior suggestions with parameter validation", () => {
  const report = analyzeCardBehaviorSuggestions([
    createTestCard({
      name: "Synthetic Reaction Spell",
      publicCode: "SYN-001/100",
      text: "[Reaction] (Play any time, even before spells and abilities resolve.)Give a unit -1 :rb_might: this turn, to a minimum of 1 :rb_might:. Draw 1."
    })
  ]);
  const suggestion = report.cards[0]!;
  const modifier = suggestion.clauses
    .flatMap((clause) => clause.assignments)
    .find(
      (assignment) =>
        assignment.assignment.primitiveId === "modifier.modify_numeric_value"
    );

  assert.equal(suggestion.supportStatus, "supported");
  assert.equal(suggestion.missingRequiredParameterCount, 0);
  assert.equal(suggestion.unsupportedClauseCount, 0);
  assert.equal(modifier?.parameterValidation.complete, true);
  assert.equal(
    modifier?.catalogEntry.parameters.some((parameter) => parameter.name === "target"),
    true
  );
});

test("discovers corpus-backed numeric modifier operations", () => {
  const victoryModifier = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Victory Modifier",
      publicCode: "SYN-005/100",
      text: "Increase the points needed to win the game by 1."
    })
  );
  const doubler = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Doubler",
      publicCode: "SYN-006/100",
      text: "When I attack or defend one on one, double my Might this combat."
    })
  );
  const setModifier = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Set Modifier",
      publicCode: "SYN-007/100",
      text: "Choose a friendly unit. Its Might becomes the Might of another friendly unit this turn."
    })
  );
  const resourceModifier = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Resource Modifier",
      publicCode: "SYN-008/100",
      text: "While your score is within 3 points of the Victory Score, your Gold [Add] an additional :rb_energy_1:."
    })
  );

  assert.deepEqual(
    findAssignment(victoryModifier, "modifier.modify_numeric_value")?.parameters,
    {
      attribute: "victoryRequirement",
      operation: "increase",
      operand: "constant",
      amount: 1,
      target: "game",
      duration: "whileSourceOnBoard"
    }
  );
  assert.deepEqual(
    findAssignment(doubler, "modifier.modify_numeric_value")?.parameters,
    {
      attribute: "might",
      operation: "multiply",
      operand: "constant",
      amount: 2,
      target: "source"
    }
  );
  assert.deepEqual(
    findAssignment(setModifier, "modifier.modify_numeric_value")?.parameters,
    {
      attribute: "might",
      operation: "set",
      operand: "selectedUnitMight",
      target: "friendly_unit",
      duration: "thisTurn"
    }
  );
  assert.deepEqual(
    findAssignment(resourceModifier, "modifier.modify_numeric_value")?.parameters,
    {
      attribute: "resourceAmount",
      operation: "increase",
      operand: "constant",
      amount: 1,
      target: "event_subject",
      duration: "whileSourceOnBoard"
    }
  );
  assert.deepEqual(findAssignment(resourceModifier, "selector.token")?.parameters, {
    tokenName: "Gold gear",
    controller: "controller"
  });
});

test("models controller, card type, location, and cost floor", () => {
  const discovery = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Spell Cost Modifier",
      publicCode: "SYN-009/100",
      text: "While I'm at a battlefield, the Energy costs for spells you play is reduced by :rb_energy_1:, to a minimum of :rb_energy_1:."
    })
  );

  assert.deepEqual(
    findAssignment(discovery, "modifier.modify_numeric_value")?.parameters,
    {
      attribute: "energyCost",
      operation: "reduce",
      operand: "constant",
      amount: 1,
      target: "controller_spell",
      duration: "whileSourceAtBattlefield",
      minimum: 1
    }
  );
  assert.equal(findAssignment(discovery, "condition.while"), undefined);
});

test("does not treat numeric comparisons as modifiers", () => {
  const discovery = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Numeric Reference",
      publicCode: "SYN-010/100",
      text: "Deal damage equal to my Might to an enemy unit here."
    })
  );

  assert.equal(
    findAssignment(discovery, "modifier.modify_numeric_value"),
    undefined
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
      name: "Synthetic Choice Unit",
      publicCode: "SYN-011/100",
      text: "When you play me, choose an enemy unit."
    })
  );
  const choice = findAssignment(discovery, "choice.choose_target");
  const selector = findAssignment(discovery, "selector.enemy_unit");

  assert.deepEqual(choice?.parameters, { player: "controller" });
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
  const spellTrigger = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Spell Trigger",
      publicCode: "SYN-012/100",
      text: "When you play a spell, give me +1 :rb_might: this turn."
    })
  );
  const chooseTrigger = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Choose Trigger",
      publicCode: "SYN-013/100",
      text: "When you choose a friendly unit, you may exhaust me and pay :rb_rune_rainbow: to ready it."
    })
  );
  const readyTrigger = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Ready Trigger",
      publicCode: "SYN-014/100",
      text: "When you choose or ready me, give me +1 :rb_might: this turn."
    })
  );

  assert.deepEqual(
    findAssignment(spellTrigger, "trigger.on_play")?.parameters,
    { actor: "controller", subject: "spell" }
  );
  assert.deepEqual(
    findAssignment(chooseTrigger, "trigger.on_choose")?.parameters,
    { actor: "controller", subject: "event_subject" }
  );
  assert.equal(findAssignment(chooseTrigger, "choice.choose_target"), undefined);
  assert.deepEqual(findAssignment(readyTrigger, "trigger.on_choose")?.parameters, {
    actor: "controller",
    subject: "source"
  });
  assert.deepEqual(findAssignment(readyTrigger, "trigger.on_ready")?.parameters, {
    actor: "controller",
    subject: "source"
  });
  assert.equal(findAssignment(readyTrigger, "action.ready_cards"), undefined);
});

test("models a played spell Energy-cost threshold as a typed condition", () => {
  const discovery = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Spell Threshold",
      publicCode: "SYN-015/100",
      text: "When you play a spell that costs :rb_energy_5: or more, give me +3 :rb_might: this turn."
    })
  );

  assert.deepEqual(findAssignment(discovery, "trigger.on_play")?.parameters, {
    actor: "controller",
    subject: "spell"
  });
  assert.deepEqual(
    findAssignment(discovery, "condition.compare_numeric_value")?.parameters,
    {
      valueSource: "eventSubject.printedEnergyCost",
      operator: "greaterThanOrEqual",
      comparisonValue: 5
    }
  );
});

test("validates numeric comparison sources, operators, and values", () => {
  const condition = getPrimitiveCatalogEntry(
    "condition.compare_numeric_value",
    "condition"
  );
  const valid = validatePrimitiveAssignmentParameters(
    {
      primitiveId: condition.id,
      family: condition.family,
      sourceText: "spell that costs 5 or more",
      parameters: {
        valueSource: "eventSubject.effectiveEnergyCost",
        operator: "greaterThanOrEqual",
        comparisonValue: 5
      },
      confidence: "high"
    },
    condition
  );
  const invalid = validatePrimitiveAssignmentParameters(
    {
      primitiveId: condition.id,
      family: condition.family,
      sourceText: "spell that costs 5 or more",
      parameters: {
        valueSource: "unknown.value",
        operator: "approximately",
        comparisonValue: "5"
      },
      confidence: "high"
    },
    condition
  );

  assert.equal(valid.complete, true);
  assert.equal(invalid.complete, false);
  assert.deepEqual(
    invalid.issues.map((issue) => issue.parameterName),
    ["valueSource", "operator", "comparisonValue"]
  );
});

test("models a conquer listener with delayed resolution", () => {
  const discovery = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Delayed Battlefield",
      publicCode: "SYN-016/100",
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
  assert.deepEqual(findAssignment(discovery, "action.ready_cards")?.parameters, {
    player: "controller",
    target: "runes",
    count: 2
  });
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
      name: "Synthetic Location Unit",
      publicCode: "SYN-017/100",
      text: "Deal damage equal to my Might to an enemy unit in a base."
    })
  );
  const hereTarget = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Shared Location Unit",
      publicCode: "SYN-018/100",
      text: "Other friendly units here have [Shield]."
    })
  );
  const sameBattlefield = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Source Location Unit",
      publicCode: "SYN-019/100",
      text: "Stun a friendly unit and an enemy unit at the same battlefield."
    })
  );
  const sameLocation = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Move Spell",
      publicCode: "SYN-020/100",
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

test("discovers static source-location unit modifiers as automatic continuous effects", () => {
  const discovery = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Battlefield Modifier",
      publicCode: "SYN-021/100",
      text: "Units here have +1 :rb_might:. (This includes attackers.)",
      type: "Battlefield"
    })
  );

  assert.deepEqual(
    findAssignment(discovery, "selector.unit")?.parameters,
    {
      scope: "any",
      area: "board",
      locationRelation: "sourceLocation",
      excludesSource: false,
      automatic: true
    }
  );
  assert.deepEqual(
    findAssignment(discovery, "modifier.modify_numeric_value")?.parameters,
    {
      attribute: "might",
      operation: "increase",
      operand: "constant",
      amount: 1,
      target: "unit",
      locationRelation: "sourceLocation",
      duration: "whileSourceOnBoard"
    }
  );
});

test("does not confuse a move destination with the selected Unit area", () => {
  const discovery = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Move Destination",
      publicCode: "SYN-022/100",
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
      name: "Synthetic Hidden Unit",
      publicCode: "SYN-023/100",
      text: "[Hidden] (Hide now for :rb_rune_rainbow: to react with later for :rb_energy_0:.)[Action] (Play on your turn or in showdowns.)Buff a friendly unit."
    })
  );
  const hiddenReference = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Hidden Reference",
      publicCode: "SYN-024/100",
      text: "Hidden (Hide now for :rb_rune_rainbow: to react with later for :rb_energy_0:.)When you play me, return another unit at a battlefield."
    })
  );

  assert.equal(findAssignments(standUnited, "keyword.hidden").length, 1);
  assert.deepEqual(
    findAssignment(standUnited, "keyword.hidden")?.parameters,
    {}
  );
  assert.equal(findAssignments(hiddenReference, "keyword.hidden").length, 1);
  assert.deepEqual(catalogEntry.parameters, []);
  assert.equal(catalogEntry.fixedRules.length, 6);
  assert.equal(catalogEntry.engineSupport.status, "supported");
});

test("does not grant Hidden behavior to cards that only reference Hidden", () => {
  const references = [
    "Put a unit you own into your hand from your Champion Zone or the board if it has [Hidden].",
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

test("catalogs numeric modifier duration as a known duration enum", () => {
  const numericModifier = buildPrimitiveCatalog().find(
    (entry) => entry.id === "modifier.modify_numeric_value"
  );
  const durationParameter = numericModifier?.parameters.find(
    (parameter) => parameter.name === "duration"
  );
  const invalidDurationValidation = validatePrimitiveAssignmentParameters(
    {
      primitiveId: "modifier.modify_numeric_value",
      family: "modifier",
      sourceText: "give a unit +1 :rb_might: for a weird duration",
      parameters: {
        attribute: "might",
        operation: "increase",
        operand: "constant",
        amount: 1,
        target: "unit",
        duration: "weird_duration"
      },
      confidence: "medium"
    },
    getPrimitiveCatalogEntry("modifier.modify_numeric_value", "modifier")
  );

  assert.deepEqual(durationParameter?.options, [...behaviorDurationKinds]);
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

test("limits deal damage targets to unit references", () => {
  const dealDamage = getPrimitiveCatalogEntry("action.deal_damage", "action");
  const targetParameter = dealDamage.parameters.find(
    (parameter) => parameter.name === "target"
  );
  const invalidTarget = validatePrimitiveAssignmentParameters(
    {
      primitiveId: "action.deal_damage",
      family: "action",
      sourceText: "Deal 2 to an equipment.",
      parameters: { amount: 2, target: "equipment" },
      confidence: "low"
    },
    dealDamage
  );

  assert.equal(targetParameter?.type, "unitTarget");
  assert.deepEqual(targetParameter?.options, [...unitTargetReferenceKinds]);
  assert.equal(invalidTarget.complete, false);
  assert.match(invalidTarget.issues[0]?.message ?? "", /must be one of/);
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

test("discovers separate intrinsic Basic Rune resource abilities", () => {
  const mindRune = createTestCard({
    name: "Synthetic Basic Rune",
    publicCode: "SYN-025/100",
    text: "",
    type: "Rune",
    supertype: "Basic",
    domain: ["Mind"]
  });
  const discovery = discoverCardPrimitives(mindRune);
  const report = analyzeCardBehaviorSuggestions([mindRune]);
  const exhaustAbility = findAssignment(
    discovery,
    "ability.exhaust_for_resource"
  );
  const recycleAbility = findAssignment(
    discovery,
    "ability.recycle_for_power"
  );

  assert.equal(discovery.rulesText, "");
  assert.deepEqual(discovery.primitiveIds, [
    "ability.exhaust_for_resource",
    "ability.recycle_for_power"
  ]);
  assert.equal(discovery.clauses[0]?.id, "intrinsic-exhaust-for-energy");
  assert.equal(discovery.clauses[1]?.id, "intrinsic-recycle-for-power");
  assert.deepEqual(exhaustAbility?.parameters, {
    resourceType: "energy",
    amountSource: "constant",
    amount: 1,
    usage: "unrestricted"
  });
  assert.deepEqual(recycleAbility?.parameters, {
    amount: 1,
    domain: "sourceDomain",
    usage: "unrestricted"
  });
  assert.equal(report.summary.cardsWithRulesText, 0);
  assert.equal(report.summary.suggestedCardCount, 1);
  assert.equal(report.cards[0]?.supportStatus, "supported");
});

test("reuses exhaust-for-resource behavior for variable converters", () => {
  const exhaustConverter = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Exhaust Unit",
      publicCode: "SYN-026/100",
      text: ":rb_exhaust:: [Reaction] - [Add] :rb_energy_2:. Use only to play spells. (Abilities that add resources can't be reacted to.)",
      type: "Unit"
    })
  );
  const paidConverter = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Paid Converter",
      publicCode: "SYN-027/100",
      text: ":rb_exhaust:: [Reaction] - Pay any amount of Energy to [Add] that much :rb_rune_rainbow:. (Abilities that add resources can't be reacted to.)",
      type: "Gear"
    })
  );
  const variableConverter = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Variable Converter",
      publicCode: "SYN-028/100",
      text: ":rb_exhaust:: [Reaction] - Pay any amount of :rb_rune_rainbow: to [Add] that much Energy. (Abilities that add resources can't be reacted to.)",
      type: "Gear"
    })
  );

  assert.deepEqual(
    findAssignment(exhaustConverter, "ability.exhaust_for_resource")?.parameters,
    {
      resourceType: "energy",
      amountSource: "constant",
      amount: 2,
      usage: "spellsOnly"
    }
  );
  assert.deepEqual(
    findAssignment(paidConverter, "ability.exhaust_for_resource")?.parameters,
    {
      resourceType: "power",
      amountSource: "paidAmount",
      domain: "rainbow",
      usage: "unrestricted"
    }
  );
  assert.deepEqual(
    findAssignment(variableConverter, "ability.exhaust_for_resource")?.parameters,
    {
      resourceType: "energy",
      amountSource: "paidAmount",
      usage: "unrestricted"
    }
  );
  assert.equal(findAssignment(exhaustConverter, "action.exhaust_cards"), undefined);
  assert.equal(findAssignment(exhaustConverter, "cost.exhaust_source"), undefined);
  assert.equal(findAssignment(exhaustConverter, "timing.reaction"), undefined);
  assert.equal(findAssignment(exhaustConverter, "keyword.add"), undefined);
  assert.equal(exhaustConverter.clauses.length, 1);
});

test("does not grant Basic Rune abilities to non-Basic Runes", () => {
  const nonBasicRune = createTestCard({
    name: "Synthetic Special Rune",
    publicCode: "SYN-029/100",
    text: "",
    type: "Rune",
    supertype: null,
    domain: ["Mind"]
  });

  assert.deepEqual(discoverCardPrimitives(nonBasicRune).clauses, []);
  assert.equal(analyzeCardBehaviorSuggestions([nonBasicRune]).cards.length, 1);
  assert.deepEqual(analyzeCardBehaviorSuggestions([nonBasicRune]).cards[0]?.clauses, []);
});

test("catalogs corpus-backed primitive text parameters as enums", () => {
  const catalog = buildPrimitiveCatalog();
  const onPlay = catalog.find((entry) => entry.id === "trigger.on_play");
  const selectorUnit = catalog.find((entry) => entry.id === "selector.unit");
  const channelRunes = catalog.find((entry) => entry.id === "action.channel_runes");
  const playToken = catalog.find((entry) => entry.id === "action.play_token");
  const payCost = catalog.find((entry) => entry.id === "cost.pay");
  const exhaustForResource = catalog.find(
    (entry) => entry.id === "ability.exhaust_for_resource"
  );
  const numericModifier = catalog.find(
    (entry) => entry.id === "modifier.modify_numeric_value"
  );

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
  assert.deepEqual(
    numericModifier?.parameters.find((parameter) => parameter.name === "attribute")
      ?.options,
    [...numericValueKinds]
  );
  assert.deepEqual(
    numericModifier?.parameters.find((parameter) => parameter.name === "operation")
      ?.options,
    [...numericModifierOperations]
  );
  assert.deepEqual(
    numericModifier?.parameters.find((parameter) => parameter.name === "operand")
      ?.options,
    [...numericOperandKinds]
  );
  assert.deepEqual(
    exhaustForResource?.parameters.find(
      (parameter) => parameter.name === "amountSource"
    )?.options,
    [...resourceAmountSources]
  );
  assert.deepEqual(
    exhaustForResource?.parameters.find((parameter) => parameter.name === "domain")
      ?.options,
    [...resourceDomainKinds]
  );
  assert.deepEqual(
    exhaustForResource?.parameters.find((parameter) => parameter.name === "usage")
      ?.options,
    [...resourceUsageKinds]
  );
});

test("catalogs target parameters as known target references", () => {
  const numericModifier = buildPrimitiveCatalog().find(
    (entry) => entry.id === "modifier.modify_numeric_value"
  );
  const targetParameter = numericModifier?.parameters.find(
    (parameter) => parameter.name === "target"
  );
  const invalidTargetValidation = validatePrimitiveAssignmentParameters(
    {
      primitiveId: "modifier.modify_numeric_value",
      family: "modifier",
      sourceText: "give something +1 :rb_might:",
      parameters: {
        attribute: "might",
        operation: "increase",
        operand: "constant",
        amount: 1,
        target: "unspecified"
      },
      confidence: "low"
    },
    getPrimitiveCatalogEntry("modifier.modify_numeric_value", "modifier")
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
      name: "Synthetic Recruit Maker",
      publicCode: "TST-002/001",
      text: "When you play me, play a 1 :rb_might: Recruit unit token in your base."
    })
  );
  const gold = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Gold Maker",
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

test("reports unsupported clauses without inventing behavior", () => {
  const discovery = discoverCardPrimitives(
    createTestCard({
      name: "Synthetic Unsupported Spell",
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
      name: "Synthetic Unsupported Spell",
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
