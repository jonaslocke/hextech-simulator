import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createBehaviorContext,
  buildPaymentPlan,
  cleanupCombatModifiers,
  createPrimitiveHandlers,
  hasKeyword,
  keywordAmount,
  legalUnitDestinationIds,
  recomputeMight,
  type BehaviorBinding,
  type GameDocument,
  type RuntimeCardIndex,
  targetDeflectCost,
} from "../src/server/game";

test("returns selected trash cards and moves battlefield units generically", () => {
  const game = fixture();
  const index = cardIndex();
  const handlers = createPrimitiveHandlers(index);

  handlers.get("action.return_to_hand")!.execute!(
    binding("action.return_to_hand", { target: "card" }),
    createBehaviorContext(game, "p1", "source", null, ["spell"]),
  );
  assert.deepEqual(game.state.players.p1!.zones.trash, []);
  assert.deepEqual(game.state.players.p1!.zones.hand, ["spell"]);
  assert.equal(game.state.cardStates.spell!.objectVersion, 1);

  handlers.get("action.move_unit")!.execute!(
    binding("action.move_unit", { destination: "base", count: 1 }),
    createBehaviorContext(game, "p1", "source", null, ["unit"]),
  );
  assert.deepEqual(game.state.battlefields[0]!.units, []);
  assert.deepEqual(game.state.players.p2!.zones.base, ["unit"]);
  assert.equal(game.state.cardStates.unit!.exhausted, true);
});

test("looked-at card transfer and recycle-all preserve the private source group", () => {
  const game = fixture();
  const index = cardIndex();
  for (const id of ["top-a", "top-b", "top-c"]) {
    index.instances.set(id, {
      instanceId: id,
      ownerPlayerId: "p1",
      source: "mainDeck",
      cardCode: "SPELL",
    });
    game.state.cardStates[id] = {
      exhausted: false,
      damage: 0,
      computedMight: null,
      objectVersion: 0,
    };
  }
  game.state.players.p1!.zones.mainDeck.push("top-a", "top-b", "top-c", "top-d");
  const handlers = createPrimitiveHandlers(index);
  const takeContext = createBehaviorContext(game, "p1", "source", null, []);
  takeContext.selectedBySelector.lookedCards = ["top-a", "top-b", "top-c"];
  const takeBinding = binding("action.take_to_hand", {
    sourceSelectionKey: "lookedCards",
    count: 1,
    selectionKey: "cardToHand",
  });
  const takeRequirement = handlers.get("action.take_to_hand")!.choice!(takeBinding, takeContext);
  assert.deepEqual(takeRequirement?.legalIds, ["top-a", "top-b", "top-c"]);
  assert.equal(takeRequirement?.minimum, 1);
  takeContext.selectedBySelector.cardToHand = ["top-b"];
  handlers.get("action.take_to_hand")!.execute!(takeBinding, takeContext);
  assert.deepEqual(game.state.players.p1!.zones.hand, ["top-b"]);
  assert.deepEqual(game.state.players.p1!.zones.mainDeck, ["top-a", "top-c", "top-d"]);
  assert.equal(game.state.queuedBehaviorEvents?.at(-1)?.type, "card.addedToHand");

  const recycleContext = createBehaviorContext(game, "p1", "source", null, []);
  recycleContext.selectedBySelector.lookedCards = ["top-a", "top-b", "top-c"];
  const recycleBinding = binding("action.recycle_top_cards", {
    count: 3,
    sourceSelectionKey: "lookedCards",
    recycleAllRemaining: true,
  });
  const recycleRequirement = handlers.get("action.recycle_top_cards")!.choice!(recycleBinding, recycleContext);
  assert.equal(recycleRequirement, null);
  handlers.get("action.recycle_top_cards")!.execute!(recycleBinding, recycleContext);
  assert.deepEqual(game.state.players.p1!.zones.mainDeck, ["top-d", "top-a", "top-c"]);
});

test("applies controller Bonus Damage and records whether it killed", () => {
  const game = fixture();
  const index = cardIndex();
  const bonusDefinition = structuredClone(index.definitions.get("UNIT")!);
  bonusDefinition.cardCode = "BONUS";
  bonusDefinition.behaviorModel.clauses.push({
    id: "bonus-damage",
    sequence: 0,
    sourceText: "",
    normalizedText: "",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [],
    choices: [],
    costs: [],
    timings: [],
    effects: [binding("modifier.modify_numeric_value", {
      attribute: "damage",
      operation: "increase",
      amount: 1,
      target: "controller_effect",
      duration: "whileSourceOnBoard",
    })],
    keywords: [],
  });
  index.definitions.set("BONUS", bonusDefinition);
  index.instances.set("bonus", {
    instanceId: "bonus",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "BONUS",
  });
  game.state.players.p1!.zones.base.push("bonus");
  game.state.cardStates.bonus = {
    exhausted: true,
    damage: 0,
    computedMight: 2,
  };
  const context = createBehaviorContext(game, "p1", "source", null, ["unit"]);

  createPrimitiveHandlers(index).get("action.deal_damage")!.execute!(
    binding("action.deal_damage", { amount: 1, target: "unit" }),
    context,
  );

  assert.ok(game.state.players.p2!.zones.trash.includes("unit"));
  assert.equal(context.effectOutcomes.lastDamageKilled, true);
});

test("derives Deflect as an atomic any-domain Power cost", () => {
  const game = fixture();
  const index = cardIndex();
  const targetDefinition = index.definitions.get("UNIT")!;
  targetDefinition.behaviorModel.clauses.push({
    id: "deflect", sequence: 0, sourceText: "", normalizedText: "",
    abilities: [], triggers: [], conditions: [], selectors: [], choices: [],
    costs: [], timings: [], effects: [],
    keywords: [binding("keyword.deflect", { amount: 1 })],
  });
  game.state.players.p1!.power = { Fury: 1 };
  const cost = targetDeflectCost(game, "p1", ["unit"], index);

  assert.equal(cost, 1);
  assert.equal(targetDeflectCost(game, "p1", ["unit", "unit"], index), 2);
  assert.ok(
    buildPaymentPlan(
      game,
      "p1",
      index.definitions.get("SPELL")!,
      0,
      index,
      cost,
    ),
  );
  game.state.players.p1!.power = {};
  const runeDefinition = structuredClone(index.definitions.get("UNIT")!);
  runeDefinition.cardCode = "RUNE";
  runeDefinition.behaviorModel.clauses.push({
    id: "recycle", sequence: 0, sourceText: "", normalizedText: "",
    abilities: [
      binding("ability.recycle_for_power", {
        amount: 1,
        resourceType: "power",
      }),
    ],
    triggers: [], conditions: [], selectors: [], choices: [], costs: [],
    timings: [], effects: [], keywords: [],
  });
  index.definitions.set("RUNE", runeDefinition);
  index.instances.set("rune", {
    instanceId: "rune",
    ownerPlayerId: "p1",
    source: "runeDeck",
    cardCode: "RUNE",
  });
  game.state.players.p1!.zones.base.push("rune");
  game.state.cardStates.rune = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };
  assert.equal(
    buildPaymentPlan(
      game,
      "p1",
      index.definitions.get("SPELL")!,
      0,
      index,
      cost,
    ),
    null,
    "Deflect cannot auto-recycle a rune that was not manually added to the pool",
  );
});

test("temporary keyword grants affect combat values and targeting costs until combat ends", () => {
  const game = fixture();
  const index = cardIndex();
  const handlers = createPrimitiveHandlers(index);
  game.state.cardStates.unit!.combatRole = "defender";

  handlers.get("modifier.grant_keyword")!.execute!(
    binding("modifier.grant_keyword", {
      keywordId: "keyword.shield",
      amount: 3,
      target: "unit",
      duration: "thisCombat",
    }),
    createBehaviorContext(game, "p1", "spell", null, ["unit"]),
  );
  handlers.get("modifier.grant_keyword")!.execute!(
    binding("modifier.grant_keyword", {
      keywordId: "keyword.deflect",
      amount: 2,
      target: "unit",
      duration: "thisCombat",
    }),
    createBehaviorContext(game, "p1", "spell", null, ["unit"]),
  );
  handlers.get("modifier.grant_keyword")!.execute!(
    binding("modifier.grant_keyword", {
      keywordId: "keyword.tank",
      target: "unit",
      duration: "thisCombat",
    }),
    createBehaviorContext(game, "p1", "spell", null, ["unit"]),
  );

  assert.equal(game.state.cardStates.unit?.computedMight, 5);
  assert.equal(keywordAmount(game, "unit", "keyword.deflect", index), 2);
  assert.equal(targetDeflectCost(game, "p1", ["unit"], index), 2);
  assert.equal(hasKeyword(game, "unit", "keyword.tank", index), true);

  cleanupCombatModifiers(game, index);

  assert.equal(game.state.cardStates.unit?.computedMight, 2);
  assert.equal(keywordAmount(game, "unit", "keyword.deflect", index), 0);
  assert.equal(hasKeyword(game, "unit", "keyword.tank", index), false);
});

test("static source-location keyword grants apply without a selection", () => {
  const game = fixture();
  const index = cardIndex();
  const battlefield = index.definitions.get("BF")!;
  battlefield.behaviorModel.clauses.push({
    id: "ganking-location",
    sequence: 0,
    sourceText: "Units here have [Ganking].",
    normalizedText: "Units here have ganking",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [],
    choices: [],
    costs: [],
    timings: [],
    keywords: [],
    effects: [binding("modifier.grant_keyword", {
      keywordId: "keyword.ganking",
      target: "unit",
      locationRelation: "sourceLocation",
      duration: "whileSourceAtBattlefield",
    })],
  });

  assert.equal(hasKeyword(game, "unit", "keyword.ganking", index), true);
  game.state.players.p2!.zones.base.push("unit");
  game.state.battlefields[0]!.units = [];
  assert.equal(hasKeyword(game, "unit", "keyword.ganking", index), false);
});

test("adds open battlefields only through a card destination permission", () => {
  const game = fixture();
  const definition = cardIndex().definitions.get("UNIT")!;
  game.state.battlefields[0]!.controllerPlayerId = null;
  game.state.battlefields[0]!.units = [];

  assert.deepEqual(legalUnitDestinationIds(game, "p1", definition), ["base"]);

  definition.behaviorModel.clauses.push({
    id: "destination", sequence: 0, sourceText: "", normalizedText: "",
    abilities: [], triggers: [], conditions: [], selectors: [], choices: [],
    costs: [], timings: [], keywords: [],
    effects: [
      binding("modifier.play_unit_destination", {
        destination: "openBattlefield",
      }),
    ],
  });
  assert.deepEqual(
    legalUnitDestinationIds(game, "p1", definition),
    ["base", "bf"],
  );
});

test("battlefield cards can apply continuous Might to units here", () => {
  const game = fixture();
  const index = cardIndex();
  const battlefieldDefinition = index.definitions.get("BF")!;
  battlefieldDefinition.behaviorModel.clauses.push({
    id: "war-camp",
    sequence: 0,
    sourceText: "",
    normalizedText: "",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [],
    choices: [],
    costs: [],
    timings: [],
    keywords: [],
    effects: [
      binding("modifier.modify_numeric_value", {
        attribute: "might",
        operation: "increase",
        operand: "constant",
        amount: 1,
        target: "unit",
        locationRelation: "sourceLocation",
        duration: "whileSourceAtBattlefield",
      }),
    ],
  });

  recomputeMight(game, "unit", index);

  assert.equal(game.state.cardStates.unit?.computedMight, 3);
});

test("stale static source-location models still apply as continuous Might", () => {
  const game = fixture();
  const index = cardIndex();
  const battlefieldDefinition = index.definitions.get("BF")!;
  battlefieldDefinition.behaviorModel.clauses.push({
    id: "war-camp",
    sequence: 0,
    sourceText: "Units here have +1 :rb_might: (This includes attackers.)",
    normalizedText: "Units here have +1 :rb_might: (This includes attackers.)",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [
      binding("selector.unit", {
        scope: "any",
        area: "board",
        locationRelation: "sourceLocation",
        excludesSource: false,
      }),
    ],
    choices: [],
    costs: [],
    timings: [],
    keywords: [],
    effects: [
      binding("modifier.modify_numeric_value", {
        attribute: "might",
        operation: "increase",
        operand: "constant",
        amount: 1,
        target: "unit",
      }),
    ],
  });

  recomputeMight(game, "unit", index);

  assert.equal(game.state.cardStates.unit?.computedMight, 3);
});

test("friendly unit group modifiers can resolve without interactive targets", () => {
  const game = fixture();
  const index = cardIndex();
  index.instances.set("ally", {
    instanceId: "ally",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "UNIT",
  });
  game.state.players.p1!.zones.base.push("ally");
  game.state.cardStates.ally = {
    exhausted: false,
    damage: 0,
    computedMight: 2,
    objectVersion: 0,
  };
  const handlers = createPrimitiveHandlers(index);

  handlers.get("modifier.modify_numeric_value")!.execute!(
    binding("modifier.modify_numeric_value", {
      attribute: "might",
      operation: "increase",
      operand: "constant",
      amount: 2,
      target: "friendly_unit",
      duration: "thisTurn",
    }),
    createBehaviorContext(game, "p1", "spell", null, []),
  );

  assert.equal(game.state.cardStates.ally?.computedMight, 4);
  assert.equal(game.state.cardStates.unit?.computedMight, 2);
});

test("keeps legacy bounded each-unit selectors interactive", () => {
  const game = fixture();
  const handlers = createPrimitiveHandlers(cardIndex());
  const requirement = handlers.get("selector.unit")!.targets!(
    binding("selector.unit", {
      scope: "each",
      minimumCount: 0,
      maximumCount: 2,
      area: "board",
    }),
    createBehaviorContext(game, "p1", "source", null, []),
  );

  assert.equal(requirement.minimum, 0);
  assert.equal(requirement.maximum, 2);
  assert.deepEqual(requirement.legalIds, ["unit"]);
});

test("selects every eligible card from unordered non-board zones", () => {
  const game = fixture();
  const index = cardIndex();
  for (const id of ["trash-unit-a", "trash-unit-b"]) {
    index.instances.set(id, {
      instanceId: id,
      ownerPlayerId: "p1",
      source: "mainDeck",
      cardCode: "UNIT",
    });
    game.state.cardStates[id] = {
      exhausted: false,
      damage: 0,
      computedMight: 2,
    };
  }
  game.state.players.p1!.zones.trash.push(
    "trash-unit-a",
    "trash-unit-b",
  );
  const requirement = createPrimitiveHandlers(index)
    .get("selector.card")!
    .targets!(
      binding("selector.card", {
        zone: "trash",
        cardType: "Unit",
        minimumCount: 1,
        maximumCount: 1,
      }),
      createBehaviorContext(game, "p1", "source", null, []),
    );

  assert.equal(requirement.sourceZone, "trash");
  assert.deepEqual(requirement.legalIds, ["trash-unit-a", "trash-unit-b"]);
});

test("linked battlefield movement records endpoints and atomic swaps exchange locations", () => {
  const game = fixture();
  const index = cardIndex();
  for (const [id, owner] of [["source", "p1"], ["ally", "p1"]] as const) {
    index.instances.set(id, {
      instanceId: id,
      ownerPlayerId: owner,
      source: "mainDeck",
      cardCode: "UNIT",
    });
    game.state.cardStates[id] = {
      exhausted: true,
      damage: 0,
      computedMight: 2,
      objectVersion: 0,
    };
  }
  index.instances.set("bf-two-card", {
    instanceId: "bf-two-card",
    ownerPlayerId: "p2",
    source: "battlefield",
    cardCode: "BF",
  });
  game.state.cardStates["bf-two-card"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
    objectVersion: 0,
  };
  game.state.battlefields[0]!.units.push("source");
  game.state.battlefields.push({
    battlefieldId: "bf-two",
    cardInstanceId: "bf-two-card",
    selectedByPlayerId: "p2",
    units: ["ally"],
  });
  const handlers = createPrimitiveHandlers(index);
  const moveContext = createBehaviorContext(game, "p1", "source", {
    type: "unit.moved",
    actorPlayerId: "p1",
    subjectCardInstanceId: "ally",
    values: { destinationBattlefieldId: "bf-two" },
  }, []);

  handlers.get("action.move_unit")!.execute!(
    binding("action.move_unit", { target: "source", destination: "eventDestination" }),
    moveContext,
  );
  assert.ok(game.state.battlefields[1]!.units.includes("source"));
  assert.equal(game.state.queuedBehaviorEvents?.at(-1)?.values.originBattlefieldId, "bf");
  assert.equal(game.state.queuedBehaviorEvents?.at(-1)?.values.destinationBattlefieldId, "bf-two");

  game.state.battlefields[0]!.units.push("source");
  game.state.battlefields[1]!.units = game.state.battlefields[1]!.units.filter(
    (id) => id !== "source",
  );

  const swapContext = createBehaviorContext(game, "p1", "source", null, []);
  swapContext.selectedBySelector.swap = ["ally"];
  handlers.get("action.swap_unit_locations")!.execute!(
    binding("action.swap_unit_locations", { selectionKey: "swap" }),
    swapContext,
  );
  assert.ok(game.state.battlefields[0]!.units.includes("ally"));
  assert.ok(game.state.battlefields[1]!.units.includes("source"));
  assert.deepEqual(
    game.state.queuedBehaviorEvents?.slice(-2).map((event) => [
      event.values.originBattlefieldId,
      event.values.destinationBattlefieldId,
    ]),
    [["bf", "bf-two"], ["bf-two", "bf"]],
  );
});

test("spell control transfers choice ownership and replaces locked targets", () => {
  const game = fixture();
  const index = cardIndex();
  index.definitions.get("SPELL")!.behaviorModel.clauses = [{
    id: "resolve",
    sequence: 0,
    sourceText: "Choose a Unit.",
    normalizedText: "Choose a Unit.",
    abilities: [], triggers: [], conditions: [], choices: [], costs: [], timings: [], effects: [], keywords: [],
    selectors: [binding("selector.unit", {
      area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "target",
    })],
  }];
  game.state.players.p1!.zones.trash = [];
  game.state.chain = {
    items: [{
      id: "pending-spell",
      kind: "spell",
      label: "Synthetic Spell",
      controllerPlayerId: "p2",
      sourceCardInstanceId: "spell",
      targetCardInstanceIds: [],
      targetObjectVersions: {},
      lockedSelectionsByBinding: {},
      behaviorClauseId: "resolve",
      activatedBehaviorId: null,
      behaviorEvent: null,
    }],
    relevantPlayerIds: ["p1", "p2"],
    priorityPlayerId: "p1",
    passedPlayerIds: [],
    resumeFocusPlayerId: null,
  };
  const handlers = createPrimitiveHandlers(index);
  const context = createBehaviorContext(game, "p1", "source", null, []);
  context.selectedBySelector.spell = ["pending-spell"];
  handlers.get("action.gain_spell_control")!.execute!(
    binding("action.gain_spell_control", { selectionKey: "spell" }),
    context,
  );
  assert.equal(game.state.chain.items[0]!.controllerPlayerId, "p1");

  const choices = binding("action.make_new_spell_choices", {
    spellSelectionKey: "spell", selectionKey: "newChoices",
  });
  assert.deepEqual(handlers.get("action.make_new_spell_choices")!.choice!(choices, context)?.legalIds, ["unit"]);
  context.selectedBySelector.newChoices = ["unit"];
  handlers.get("action.make_new_spell_choices")!.execute!(choices, context);
  assert.deepEqual(game.state.chain.items[0]!.targetCardInstanceIds, ["unit"]);
  assert.equal(game.state.queuedBehaviorEvents?.at(-1)?.type, "card.chosen");
});

test("looked-at Unit comparison uses a recorded value and recycles every remainder", () => {
  const game = fixture();
  const index = cardIndex();
  for (const [id, might] of [["small", 3], ["large", 4], ["other", 0]] as const) {
    const definition = structuredClone(index.definitions.get(id === "other" ? "SPELL" : "UNIT")!);
    definition.cardCode = id.toUpperCase();
    definition.card.attributes.might = id === "other" ? null : might;
    index.definitions.set(definition.cardCode, definition);
    index.instances.set(id, {
      instanceId: id,
      ownerPlayerId: "p1",
      source: "mainDeck",
      cardCode: definition.cardCode,
    });
    game.state.cardStates[id] = {
      exhausted: false,
      damage: 0,
      computedMight: id === "other" ? null : might,
      objectVersion: 0,
    };
  }
  game.state.players.p1!.zones.mainDeck = ["small", "large", "other"];
  const handlers = createPrimitiveHandlers(index);
  const context = createBehaviorContext(game, "p1", "source", null, []);
  context.effectOutcomes.killedMight = 2;
  context.selectedBySelector.looked = ["small", "large", "other"];
  const choose = binding("action.select_looked_unit", {
    sourceSelectionKey: "looked",
    comparisonOutcomeKey: "killedMight",
    maximumOffset: 1,
    selectionKey: "chosen",
    banishSelected: true,
  });
  assert.deepEqual(handlers.get("action.select_looked_unit")!.choice!(choose, context)?.legalIds, ["small"]);
  context.selectedBySelector.chosen = ["small"];
  handlers.get("action.select_looked_unit")!.execute!(choose, context);
  assert.deepEqual(game.state.players.p1!.zones.banishment, ["small"]);

  handlers.get("action.recycle_top_cards")!.execute!(
    binding("action.recycle_top_cards", {
      count: 3,
      sourceSelectionKey: "looked",
      recycleAllRemaining: true,
    }),
    context,
  );
  assert.deepEqual(game.state.players.p1!.zones.mainDeck, ["large", "other"]);
});

test("repeatable Buff payments ready only independently selected eligible Units", () => {
  const game = fixture();
  const index = cardIndex();
  for (const [id, exhausted, buffed] of [
    ["eligible-a", true, true],
    ["eligible-b", true, true],
    ["already-ready", false, true],
  ] as const) {
    index.instances.set(id, { instanceId: id, ownerPlayerId: "p1", source: "mainDeck", cardCode: "UNIT" });
    game.state.players.p1!.zones.base.push(id);
    game.state.cardStates[id] = { exhausted, buffed, damage: 0, computedMight: 3, objectVersion: 0 };
  }
  const handlers = createPrimitiveHandlers(index);
  const context = createBehaviorContext(game, "p1", "source", null, []);
  const ready = binding("action.ready_by_spending_buffs", { selectionKey: "paid" });
  assert.deepEqual(handlers.get("action.ready_by_spending_buffs")!.choice!(ready, context)?.legalIds, ["eligible-a", "eligible-b"]);
  context.selectedBySelector.paid = ["eligible-b"];
  handlers.get("action.ready_by_spending_buffs")!.execute!(ready, context);
  assert.equal(game.state.cardStates["eligible-a"]!.exhausted, true);
  assert.equal(game.state.cardStates["eligible-a"]!.buffed, true);
  assert.equal(game.state.cardStates["eligible-b"]!.exhausted, false);
  assert.equal(game.state.cardStates["eligible-b"]!.buffed, false);
  assert.equal(game.state.cardStates["already-ready"]!.buffed, true);
});

test("Champion-zone return validates original source and empty destination", () => {
  const game = fixture();
  const index = cardIndex();
  index.instances.set("champion", {
    instanceId: "champion",
    ownerPlayerId: "p1",
    source: "champion",
    cardCode: "UNIT",
  });
  game.state.players.p1!.zones.trash.push("champion");
  game.state.cardStates.champion = {
    exhausted: true,
    buffed: true,
    damage: 2,
    computedMight: 3,
    objectVersion: 0,
  };
  const handlers = createPrimitiveHandlers(index);
  const context = createBehaviorContext(game, "p1", "bf", null, []);
  context.selectedBySelector.champion = ["champion"];
  handlers.get("action.return_to_champion_zone")!.execute!(
    binding("action.return_to_champion_zone", { selectionKey: "champion" }),
    context,
  );
  assert.equal(game.state.players.p1!.zones.champion, "champion");
  assert.ok(!game.state.players.p1!.zones.trash.includes("champion"));
  assert.equal(game.state.cardStates.champion!.damage, 0);
  assert.equal(game.state.cardStates.champion!.buffed, false);
});

test("first spell-choice trigger is scoped by source and choosing player each turn", () => {
  const game = fixture();
  const index = cardIndex();
  const handlers = createPrimitiveHandlers(index);
  const event = {
    type: "card.chosen",
    actorPlayerId: "p2",
    subjectCardInstanceId: "unit",
    values: { method: "spell", targetBattlefieldId: "bf" },
  };
  const trigger = binding("trigger.on_choose", {
    actor: "anyPlayer",
    subject: "friendly_unit_at_source_battlefield",
    firstPerSourcePerTurn: true,
  });
  assert.equal(
    handlers.get("trigger.on_choose")!.matches!(
      trigger,
      createBehaviorContext(game, "p1", "bf", event, []),
    ),
    true,
  );
  assert.equal(
    handlers.get("trigger.on_choose")!.matches!(
      trigger,
      createBehaviorContext(game, "p1", "bf", event, []),
    ),
    false,
  );
  assert.equal(game.state.players.p2!.triggerMemoryKeysThisTurn?.length, 1);
});

function binding(
  behaviorId: string,
  parameters: Record<string, string | number | boolean>,
): BehaviorBinding {
  return { behaviorId, parameters, confidence: "high", order: 0 };
}

function cardIndex(): RuntimeCardIndex {
  const definition = (
    cardCode: string,
    type: "Battlefield" | "Spell" | "Unit",
  ) => ({
    cardCode,
    sourceTextHash: "hash",
    behaviorModel: { playTimings: [], clauses: [] },
    card: {
      id: cardCode,
      name: cardCode,
      public_code: `${cardCode}/1`,
      attributes: {
        energy: type === "Battlefield" ? null : 0,
        might: type === "Unit" ? 2 : null,
        power: type === "Battlefield" ? null : 0,
      },
      classification: { type, supertype: null, domain: ["Fury"] },
      text: { plain: "" },
      set: { set_id: "TEST", label: "Test" },
      media: {},
      tags: [],
      metadata: {},
    },
  });
  return {
    definitions: new Map([
      ["SPELL", definition("SPELL", "Spell")],
      ["UNIT", definition("UNIT", "Unit")],
      ["BF", definition("BF", "Battlefield")],
    ]) as RuntimeCardIndex["definitions"],
    instances: new Map([
      ["spell", { instanceId: "spell", ownerPlayerId: "p1", source: "mainDeck", cardCode: "SPELL" }],
      ["unit", { instanceId: "unit", ownerPlayerId: "p2", source: "mainDeck", cardCode: "UNIT" }],
      ["bf", { instanceId: "bf", ownerPlayerId: "p1", source: "battlefield", cardCode: "BF" }],
    ]),
  };
}

function fixture(): GameDocument {
  const zones = (): GameDocument["state"]["players"][string]["zones"] => ({
    legend: null,
    champion: null,
    mainDeck: [],
    runeDeck: [],
    hand: [],
    trash: [],
    banishment: [],
    base: [],
  });
  const p1 = zones();
  const p2 = zones();
  p1.trash.push("spell");
  return {
    id: "g", matchId: "m", createdAt: "a", updatedAt: "a", gameNumber: 1, stateVersion: 1,
    status: "in_progress", winnerPlayerId: null, completionReason: null,
    state: {
      setup: { playerIds: ["p1", "p2"], startingPlayerChooserId: "p1", startingPlayerId: "p1", battlefieldPools: {}, battlefieldChoices: {}, mulligans: {} },
      players: {
        p1: { playerId: "p1", energy: 0, conditionalEnergy: 0, power: {}, zones: p1 },
        p2: { playerId: "p2", energy: 0, conditionalEnergy: 0, power: {}, zones: p2 },
      },
      battlefields: [{ battlefieldId: "bf", cardInstanceId: "bf", selectedByPlayerId: "p1", units: ["unit"] }],
      cardStates: {
        spell: { exhausted: false, damage: 0, computedMight: null, objectVersion: 0 },
        unit: { exhausted: true, damage: 0, computedMight: 2, objectVersion: 0 },
        bf: { exhausted: false, damage: 0, computedMight: null, objectVersion: 0 },
      },
      turn: { turnNumber: 1, activePlayerId: "p1", phase: "action" },
      chain: null, showdown: null, combat: null, modifiers: [], ongoingEffects: [], delayedEffects: [],
      effectResolutions: [], pendingChoice: null, queuedTriggerChoices: [],
    },
  };
}
