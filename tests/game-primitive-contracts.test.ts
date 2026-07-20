import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GAME__RUNTIME_COVERAGE,
  createBehaviorContext,
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  gameplayActions,
  hasKeyword,
  performGameplayAction,
  performGameplayTransition,
  applyStartOfTurn,
  bindingChoiceGateMatches,
  dispatchBehaviorEvent,
  effectiveEnergyCost,
  type BehaviorEvent,
  type BehaviorBinding,
  type GameCardDefinition,
  type GameDocument,
  gameDocumentSchema,
} from "../src/server/game";
import { effectiveNumericValue } from "../src/server/game/numeric-modifiers";
import type { DeckSnapshotDocument } from "../src/server/game/repositories";
import type { CardInstance } from "../src/server/game/state";
import {
  beginEffectResolution,
} from "../src/server/game/effect-resolution";

test("registers a handler for every executable behavior", () => {
  const { handlers } = fixture([]);

  for (const behaviorId of Object.keys(GAME__RUNTIME_COVERAGE)) {
    assert.ok(
      handlers.has(behaviorId),
      `Missing runtime handler for ${behaviorId}`,
    );
  }
});

test("unit play consumes one matching enter-ready permission", () => {
  const { game, decks } = fixture([
    card("FIRST_UNIT", "Unit", 2),
    card("SECOND_UNIT", "Unit", 2),
  ], [
    instance("first-unit", "p1", "FIRST_UNIT", "mainDeck"),
    instance("second-unit", "p1", "SECOND_UNIT", "mainDeck"),
  ]);
  game.state.players.p1!.zones.hand = ["first-unit", "second-unit"];
  game.state.ongoingEffects = [{
    id: "permission:enter-ready",
    behaviorId: "modifier.enter_ready",
    controllerPlayerId: "p1",
    sourceCardInstanceId: "permission-source",
    targetCardInstanceIds: [],
    duration: "thisTurn",
    createdAtTurn: 1,
  }];

  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "first-unit" && action.enabled,
  );
  assert.ok(play, "Synthetic Unit should be playable with a seeded permission.");
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: [],
    decks,
    now: "play-unit",
  });

  assert.equal(next.state.cardStates["first-unit"]!.exhausted, false);
  assert.deepEqual(next.state.ongoingEffects, []);

  const secondPlay = gameplayActions(next, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "second-unit" && action.enabled,
  );
  assert.ok(secondPlay, "A second synthetic Unit should remain playable.");
  next = performGameplayAction({
    game: next,
    actorPlayerId: "p1",
    actionId: secondPlay.id,
    selectedIds: [],
    decks,
    now: "play-second-unit",
  });

  assert.equal(next.state.cardStates["second-unit"]!.exhausted, true);
});

test("Awakening batches ready events into one trigger-order decision", () => {
  const trigger = card("TRIGGER", "Gear");
  trigger.behaviorModel.clauses = [{
    id: "friendly-card-readied",
    sequence: 0,
    sourceText: "Observe each friendly Unit ready event.",
    normalizedText: "Observe each friendly Unit ready event.",
    abilities: [],
    triggers: [binding("trigger.event", {
      eventType: "card.readied",
      subject: "friendly_unit",
    })],
    conditions: [],
    selectors: [],
    choices: [],
    costs: [],
    timings: [],
    effects: [],
    keywords: [],
  }];
  const { game, decks } = fixture([
    trigger,
    card("EXHAUSTED_UNIT_A", "Unit", 2),
    card("EXHAUSTED_UNIT_B", "Unit", 2),
    card("EXHAUSTED_RUNE", "Rune"),
  ], [
    instance("trigger-a", "p1", "TRIGGER", "mainDeck"),
    instance("trigger-b", "p1", "TRIGGER", "mainDeck"),
    instance("exhausted-unit-a", "p1", "EXHAUSTED_UNIT_A", "mainDeck"),
    instance("exhausted-unit-b", "p1", "EXHAUSTED_UNIT_B", "mainDeck"),
    instance("exhausted-rune", "p1", "EXHAUSTED_RUNE", "runeDeck"),
  ]);
  game.state.players.p1!.zones.base = [
    "trigger-a",
    "trigger-b",
    "exhausted-unit-a",
    "exhausted-unit-b",
    "exhausted-rune",
  ];
  game.state.cardStates["exhausted-unit-a"]!.exhausted = true;
  game.state.cardStates["exhausted-unit-b"]!.exhausted = true;
  game.state.cardStates["exhausted-rune"]!.exhausted = true;
  game.state.turn!.phase = "awaken";

  applyStartOfTurn(game, decks);

  assert.equal(game.state.cardStates["exhausted-unit-a"]!.exhausted, false);
  assert.equal(game.state.cardStates["exhausted-unit-b"]!.exhausted, false);
  assert.equal(game.state.turn!.phase, "beginning");
  assert.equal(game.state.chain, null);
  assert.equal(game.state.pendingChoice?.type, "orderTriggers");
  assert.equal(game.state.pendingChoice?.optionIds.length, 4);
  assert.deepEqual(
    game.state.pendingChoice?.pendingItems.map((item) =>
      item.behaviorEvent?.subjectCardInstanceId,
    ),
    [
      "exhausted-unit-a",
      "exhausted-unit-a",
      "exhausted-unit-b",
      "exhausted-unit-b",
    ],
  );
  assert.deepEqual(game.state.queuedTriggerChoices, []);
  assert.deepEqual(game.state.queuedChainItems, []);
});

test("trigger.event routes by event type and subject relationship", () => {
  const { game, handlers } = fixture([
    card("SYN-TRIGGER-SOURCE", "Gear"),
    card("SYN-FRIENDLY-UNIT", "Unit", 1),
    card("SYN-ENEMY-UNIT", "Unit", 1),
    card("SYN-FRIENDLY-CARD", "Spell"),
  ], [
    instance("source", "p1", "SYN-TRIGGER-SOURCE", "mainDeck"),
    instance("friendly-unit", "p1", "SYN-FRIENDLY-UNIT", "mainDeck"),
    instance("enemy-unit", "p2", "SYN-ENEMY-UNIT", "mainDeck"),
    instance("friendly-card", "p1", "SYN-FRIENDLY-CARD", "mainDeck"),
  ]);
  const matches = handlers.get("trigger.event")!.matches!;
  for (const example of [
    { eventType: "unit.stunned", subject: "enemy_unit", eventSubject: "enemy-unit", expected: true },
    { eventType: "unit.stunned", subject: "friendly_unit", eventSubject: "enemy-unit", expected: false },
    { eventType: "unit.stunned", subject: "any_unit", eventSubject: "friendly-unit", expected: true },
    { eventType: "card.discarded", subject: "friendly_card", eventSubject: "friendly-card", expected: true },
    { eventType: "card.recycled", actualEventType: "card.discarded", subject: "friendly_card", eventSubject: "friendly-card", expected: false },
    { eventType: "card.played", subject: "source", eventSubject: "source", expected: true },
    { eventType: "card.played", subject: "any_unit", eventSubject: "friendly-card", expected: false },
  ] as const) {
    const context = createBehaviorContext(game, "p1", "source", {
      type: "actualEventType" in example
        ? example.actualEventType
        : example.eventType,
      actorPlayerId: "p1",
      subjectCardInstanceId: example.eventSubject,
      values: {},
    }, []);
    assert.equal(matches(bindingFor("trigger.event", {
      eventType: example.eventType,
      subject: example.subject,
    }), context), example.expected, JSON.stringify(example));
  }
});

test("event-subject numeric modifiers mutate only the routed subject", () => {
  const { game, handlers } = fixture([
    card("SYN-MODIFIER-SOURCE", "Gear"),
    card("SYN-EVENT-SUBJECT", "Unit", 3),
    card("SYN-OTHER-UNIT", "Unit", 5),
  ], [
    instance("source", "p1", "SYN-MODIFIER-SOURCE", "mainDeck"),
    instance("subject", "p1", "SYN-EVENT-SUBJECT", "mainDeck"),
    instance("other", "p1", "SYN-OTHER-UNIT", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source", "subject", "other"];
  const context = createBehaviorContext(game, "p1", "source", {
    type: "synthetic.event",
    actorPlayerId: "p1",
    subjectCardInstanceId: "subject",
    values: {},
  }, []);
  handlers.get("modifier.modify_numeric_value")!.execute!(
    bindingFor("modifier.modify_numeric_value", {
      attribute: "might",
      operation: "increase",
      operand: "constant",
      amount: 1,
      target: "event_subject",
      duration: "thisTurn",
    }),
    context,
  );
  assert.deepEqual(game.state.modifiers.map((modifier) => modifier.targetCardInstanceId), ["subject"]);
  assert.equal(game.state.cardStates.subject!.computedMight, 4);
  assert.equal(game.state.cardStates.other!.computedMight, 5);
});
test("move-to-base emits subject and origin metadata", () => {
  const observer = card("SYN-MOVE-OBSERVER", "Gear");
  observer.behaviorModel.clauses = [{
    id: "observe-move",
    sequence: 0,
    sourceText: "Observe a move event.",
    normalizedText: "Observe a move event.",
    abilities: [],
    triggers: [binding("trigger.event", {
      eventType: "unit.moved",
      subject: "any_unit",
    })],
    conditions: [],
    selectors: [],
    choices: [],
    costs: [],
    timings: [],
    effects: [],
    keywords: [],
  }];
  const { game, decks } = fixture([
    observer,
    card("SYN-MOVE-BATTLEFIELD", "Battlefield"),
    card("SYN-MOVING-UNIT", "Unit", 3),
  ], [
    instance("observer", "p1", observer.cardCode, "mainDeck"),
    instance("battlefield", "p1", "SYN-MOVE-BATTLEFIELD", "battlefield"),
    instance("moving-unit", "p1", "SYN-MOVING-UNIT", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["observer"];
  game.state.battlefields = [{
    battlefieldId: "origin",
    cardInstanceId: "battlefield",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    contestedByPlayerId: null,
    units: ["moving-unit"],
  }];

  const move = gameplayActions(game, "p1", decks).find(
    (action) =>
      action.sourceCardInstanceId === "moving-unit" &&
      action.label === "Move to Base" &&
      action.enabled,
  );
  assert.ok(move);
  const next = performGameplayTransition({
    game,
    actorPlayerId: "p1",
    actionId: move.id,
    selectedIds: [],
    decks,
    now: "move",
  }).game;

  assert.deepEqual(next.state.players.p1!.zones.base, ["observer", "moving-unit"]);
  assert.equal(next.state.chain?.items.length, 1);
  assert.deepEqual(next.state.chain?.items[0]?.behaviorEvent, {
    type: "unit.moved",
    actorPlayerId: "p1",
    subjectCardInstanceId: "moving-unit",
    values: { destination: "base", originBattlefieldId: "origin" },
  });
  assert.deepEqual(next.state.turnHistory.movedCardIdsByPlayerId, {
    p1: ["moving-unit"],
  });
});

test("card play events distinguish hand and Facedown origins", () => {
  for (const fromFacedown of [false, true]) {
    const observer = card("SYN-PLAY-OBSERVER", "Gear");
    observer.behaviorModel.clauses = [{
      id: "observe-play",
      sequence: 0,
      sourceText: "Observe a friendly card play event.",
      normalizedText: "Observe a friendly card play event.",
      abilities: [],
      triggers: [binding("trigger.event", {
        eventType: "card.played",
        subject: "friendly_card",
      })],
      conditions: [],
      selectors: [],
      choices: [],
      costs: [],
      timings: [],
      effects: [],
      keywords: [],
    }];
    const played = card("SYN-PLAYED-CARD", "Gear");
    played.card.attributes.energy = 3;
    played.behaviorModel.clauses = [{
      id: "hidden-permission",
      sequence: 0,
      sourceText: "This card may be played from Facedown.",
      normalizedText: "This card may be played from Facedown.",
      abilities: [],
      triggers: [],
      conditions: [],
      selectors: [],
      choices: [],
      costs: [],
      timings: [],
      effects: [],
      keywords: [binding("keyword.hidden")],
    }];
    const { game, decks } = fixture([
      observer,
      played,
      card("SYN-HIDDEN-BATTLEFIELD", "Battlefield"),
    ], [
      instance("observer", "p1", observer.cardCode, "mainDeck"),
      instance("played", "p1", played.cardCode, "mainDeck"),
      instance("battlefield", "p1", "SYN-HIDDEN-BATTLEFIELD", "battlefield"),
    ]);
    game.state.players.p1!.zones.base = ["observer"];
    game.state.players.p1!.energy = 3;
    game.state.battlefields = [{
      battlefieldId: "hidden-location",
      cardInstanceId: "battlefield",
      selectedByPlayerId: "p1",
      controllerPlayerId: "p1",
      contestedByPlayerId: null,
      units: [],
      facedownCards: fromFacedown ? [{
        cardInstanceId: "played",
        controllerPlayerId: "p1",
        hiddenAtTurnNumber: 1,
      }] : [],
    }];
    if (fromFacedown) {
      game.state.turn = {
        turnNumber: 2,
        activePlayerId: "p2",
        phase: "action",
      };
    } else {
      game.state.players.p1!.zones.hand = ["played"];
    }

    const play = gameplayActions(game, "p1", decks).find(
      (action) =>
        action.sourceCardInstanceId === "played" &&
        action.label.includes(fromFacedown ? "Play Hidden" : "Play Synthetic") &&
        action.enabled,
    );
    assert.ok(play);
    const next = performGameplayTransition({
      game,
      actorPlayerId: "p1",
      actionId: play.id,
      selectedIds: [],
      decks,
      now: fromFacedown ? "play-facedown" : "play-hand",
    }).game;
    const event = next.state.chain?.items[0]?.behaviorEvent;

    assert.equal(event?.type, "card.played");
    assert.equal(event?.subjectCardInstanceId, "played");
    assert.equal(event?.values["eventSubject.wasHidden"], fromFacedown);
    assert.equal(event?.values["eventSubject.printedEnergyCost"], 3);
    assert.equal(
      event?.values["eventSubject.effectiveEnergyCost"],
      fromFacedown ? 0 : 3,
    );
  }
});

test("event-origin condition compares metadata with the source battlefield", () => {
  const { game, handlers } = fixture([
    card("SYN-ORIGIN-SOURCE", "Battlefield"),
    card("SYN-ORIGIN-UNIT", "Unit", 1),
  ], [
    instance("source", "p1", "SYN-ORIGIN-SOURCE", "battlefield"),
    instance("subject", "p1", "SYN-ORIGIN-UNIT", "mainDeck"),
  ]);
  game.state.battlefields = [{
    battlefieldId: "source-location",
    cardInstanceId: "source",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    contestedByPlayerId: null,
    units: [],
  }];
  const matches = handlers.get("condition.event_origin_source_location")!.matches!;

  for (const example of [
    { originBattlefieldId: "source-location", expected: true },
    { originBattlefieldId: "other-location", expected: false },
    { originBattlefieldId: null, expected: false },
  ] as const) {
    const context = createBehaviorContext(game, "p1", "source", {
      type: "unit.moved",
      actorPlayerId: "p1",
      subjectCardInstanceId: "subject",
      values: { originBattlefieldId: example.originBattlefieldId },
    }, []);
    assert.equal(
      matches(bindingFor("condition.event_origin_source_location"), context),
      example.expected,
    );
  }
});
test("stun mutates a new target and emits one typed event", () => {
  const { game, handlers } = fixture([
    card("SYN-STUN-SOURCE", "Gear"),
    card("SYN-STUN-TARGET", "Unit", 3),
  ], [
    instance("source", "p1", "SYN-STUN-SOURCE", "mainDeck"),
    instance("target", "p2", "SYN-STUN-TARGET", "mainDeck"),
  ]);
  const context = createBehaviorContext(game, "p1", "source", null, ["target"]);
  const stun = handlers.get("action.stun_card")!;

  stun.execute!(bindingFor("action.stun_card", { target: "selected" }), context);
  stun.execute!(bindingFor("action.stun_card", { target: "selected" }), context);

  assert.equal(game.state.cardStates.target!.stunned, true);
  assert.deepEqual(game.state.queuedBehaviorEvents, [{
    type: "unit.stunned",
    actorPlayerId: "p1",
    subjectCardInstanceId: "target",
    values: {},
  }]);
});

test("discard and recycle mutate zones and emit their own event types", () => {
  for (const example of [
    {
      behaviorId: "action.discard_cards",
      originZone: "hand",
      destinationZone: "trash",
      eventType: "card.discarded",
      parameters: { count: 1, selectionKey: "target" },
    },
    {
      behaviorId: "action.recycle_cards",
      originZone: "trash",
      destinationZone: "mainDeck",
      eventType: "card.recycled",
      parameters: { target: "selected_card", count: 1, selectionKey: "target" },
    },
  ] as const) {
    const { game, handlers } = fixture([
      card("SYN-ZONE-SOURCE", "Gear"),
      card("SYN-ZONE-TARGET", "Spell"),
    ], [
      instance("source", "p1", "SYN-ZONE-SOURCE", "mainDeck"),
      instance("target", "p1", "SYN-ZONE-TARGET", "mainDeck"),
    ]);
    game.state.players.p1!.zones[example.originZone] = ["target"];
    const context = createBehaviorContext(game, "p1", "source", null, []);
    context.selectedBySelector.target = ["target"];

    handlers.get(example.behaviorId)!.execute!(
      bindingFor(example.behaviorId, example.parameters),
      context,
    );

    assert.deepEqual(game.state.players.p1!.zones[example.originZone], []);
    assert.deepEqual(game.state.players.p1!.zones[example.destinationZone], ["target"]);
    assert.equal(game.state.queuedBehaviorEvents?.length, 1);
    assert.equal(game.state.queuedBehaviorEvents?.[0]?.type, example.eventType);
    assert.equal(
      game.state.queuedBehaviorEvents?.[0]?.subjectCardInstanceId,
      "target",
    );
  }
});

test("typed events record turn history under the subject owner", () => {
  for (const example of [
    { eventType: "card.discarded", record: "discardedCardIdsByPlayerId" },
    { eventType: "unit.died", record: "diedCardIdsByPlayerId" },
    { eventType: "unit.moved", record: "movedCardIdsByPlayerId" },
    { eventType: "card.readied", record: "readiedCardIdsByPlayerId" },
    { eventType: "card.recycled", record: "recycledCardIdsByPlayerId" },
  ] as const) {
    const { game, decks } = fixture([
      card("SYN-HISTORY-SUBJECT", "Unit", 1),
    ], [
      instance("subject", "p2", "SYN-HISTORY-SUBJECT", "mainDeck"),
    ]);

    dispatchBehaviorEvent(game, {
      type: example.eventType,
      actorPlayerId: "p1",
      subjectCardInstanceId: "subject",
      values: {},
    }, decks);

    assert.deepEqual(game.state.turnHistory[example.record], {
      p2: ["subject"],
    });
  }
});

test("turn-event count evaluates aliases, ownership, source, and thresholds", () => {
  const { game, handlers } = fixture([
    card("SYN-HISTORY-SOURCE", "Unit", 1),
    card("SYN-HISTORY-OTHER", "Unit", 1),
  ], [
    instance("source", "p1", "SYN-HISTORY-SOURCE", "mainDeck"),
    instance("friendly-other", "p1", "SYN-HISTORY-OTHER", "mainDeck"),
    instance("enemy", "p2", "SYN-HISTORY-OTHER", "mainDeck"),
  ]);
  game.state.turnHistory.diedCardIdsByPlayerId = {
    p1: ["source", "friendly-other"],
    p2: ["enemy"],
  };
  const context = createBehaviorContext(game, "p1", "source", null, []);
  const matches = handlers.get("condition.turn_event_count")!.matches!;

  for (const example of [
    { eventType: "unit.died", subject: "controller", operator: "equal", value: 2, expected: true },
    { eventType: "died", subject: "opponent", operator: "greaterThanOrEqual", value: 1, expected: true },
    { eventType: "died", subject: "source", operator: "equal", value: 1, expected: true },
    { eventType: "died", subject: "opponent", operator: "greaterThan", value: 1, expected: false },
  ] as const) {
    assert.equal(matches(bindingFor("condition.turn_event_count", {
      eventType: example.eventType,
      subject: example.subject,
      operator: example.operator,
      comparisonValue: example.value,
    }), context), example.expected, JSON.stringify(example));
  }
});

test("source-play numeric modifiers alter the source cost", () => {
  const spell = card("SYN-COST-SOURCE", "Spell");
  spell.card.attributes.energy = 4;
  spell.behaviorModel.clauses = [{
    id: "source-play-cost-modifier",
    sequence: 0,
    sourceText: "This synthetic source costs less.",
    normalizedText: "This synthetic source costs less.",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [],
    choices: [],
    costs: [],
    timings: [],
    effects: [binding("modifier.modify_numeric_value", {
      attribute: "energyCost",
      operation: "reduce",
      operand: "constant",
      amount: 2,
      target: "controller_spell",
      appliesToSourcePlay: true,
      duration: "thisTurn",
    })],
    keywords: [],
  }];
  const { game, decks } = fixture([spell], [
    instance("source", "p1", spell.cardCode, "mainDeck"),
  ]);
  const index = createRuntimeCardIndex(decks, game);

  assert.equal(effectiveEnergyCost(game, "p1", spell, index), 2);
});
test("state conditions gate continuous numeric effects across boundary states", () => {
  const examples = [
    {
      label: "low hand",
      parameters: {
        subject: "controller",
        property: "handCount",
        operator: "lessThanOrEqual",
        comparisonValue: 1,
      },
      arrangeTrue(game: GameDocument) {
        game.state.players.p1!.zones.hand = ["support-a"];
      },
      arrangeFalse(game: GameDocument) {
        game.state.players.p1!.zones.hand = ["support-a", "support-b"];
      },
    },
    {
      label: "facedown presence",
      parameters: {
        subject: "controller",
        property: "facedownCount",
        operator: "greaterThanOrEqual",
        comparisonValue: 1,
      },
      arrangeTrue(game: GameDocument) {
        game.state.battlefields[0]!.facedownCards = [{
          cardInstanceId: "support-a",
          controllerPlayerId: "p1",
          hiddenAtTurnNumber: 1,
        }];
      },
      arrangeFalse(game: GameDocument) {
        game.state.battlefields[0]!.facedownCards = [];
      },
    },
    {
      label: "tagged unit presence",
      parameters: {
        subject: "controller",
        property: "taggedUnitCount",
        tag: "SyntheticTag",
        operator: "greaterThanOrEqual",
        comparisonValue: 1,
      },
      arrangeTrue(game: GameDocument) {
        game.state.players.p1!.zones.base.push("tagged-unit");
      },
      arrangeFalse(game: GameDocument) {
        game.state.players.p1!.zones.base = ["source"];
      },
    },
    {
      label: "source buff state",
      parameters: {
        subject: "source",
        property: "buffed",
        operator: "equal",
        comparisonValue: 1,
      },
      arrangeTrue(game: GameDocument) {
        game.state.cardStates.source!.buffed = true;
      },
      arrangeFalse(game: GameDocument) {
        game.state.cardStates.source!.buffed = false;
      },
    },
    {
      label: "score distance",
      parameters: {
        subject: "opponent",
        property: "scoreDistanceToVictory",
        operator: "lessThanOrEqual",
        comparisonValue: 3,
      },
      arrangeTrue(game: GameDocument) {
        game.state.players.p2!.points = 5;
      },
      arrangeFalse(game: GameDocument) {
        game.state.players.p2!.points = 4;
      },
    },
    {
      label: "source battlefield presence",
      parameters: {
        subject: "source",
        property: "atBattlefield",
        operator: "equal",
        comparisonValue: 1,
      },
      arrangeTrue(game: GameDocument) {
        game.state.players.p1!.zones.base = [];
        game.state.battlefields[0]!.units = ["source"];
      },
      arrangeFalse(game: GameDocument) {
        game.state.battlefields[0]!.units = [];
        game.state.players.p1!.zones.base = ["source"];
      },
    },
  ];

  for (const example of examples) {
    const source = card("SYN-CONDITIONAL-SOURCE", "Unit", 2);
    source.behaviorModel.clauses = [{
      id: "conditional-continuous-might",
      sequence: 0,
      sourceText: `While the ${example.label} condition is true, this has +1 Might.`,
      normalizedText: `While the ${example.label} condition is true, this has +1 Might.`,
      abilities: [],
      triggers: [],
      conditions: [binding("condition.state", example.parameters)],
      selectors: [],
      choices: [],
      costs: [],
      timings: [],
      effects: [binding("modifier.modify_numeric_value", {
        attribute: "might",
        operation: "increase",
        operand: "constant",
        amount: 1,
        target: "source",
        duration: "whileSourceOnBoard",
      })],
      keywords: [],
    }];
    const taggedUnit = card("SYN-TAGGED-UNIT", "Unit", 1);
    taggedUnit.card.tags = ["SyntheticTag"];
    const { game, decks } = fixture([
      source,
      card("SYN-BATTLEFIELD", "Battlefield"),
      card("SYN-SUPPORT-A", "Spell"),
      card("SYN-SUPPORT-B", "Spell"),
      taggedUnit,
    ], [
      instance("source", "p1", "SYN-CONDITIONAL-SOURCE", "mainDeck"),
      instance("battlefield", "p1", "SYN-BATTLEFIELD", "battlefield"),
      instance("support-a", "p1", "SYN-SUPPORT-A", "mainDeck"),
      instance("support-b", "p1", "SYN-SUPPORT-B", "mainDeck"),
      instance("tagged-unit", "p1", "SYN-TAGGED-UNIT", "mainDeck"),
    ]);
    game.state.players.p1!.zones.base = ["source"];
    game.state.battlefields = [{
      battlefieldId: "battlefield",
      cardInstanceId: "battlefield",
      selectedByPlayerId: "p1",
      controllerPlayerId: "p1",
      contestedByPlayerId: null,
      units: [],
      facedownCards: [],
    }];
    const index = createRuntimeCardIndex(decks, game);
    const value = () => effectiveNumericValue({
      attribute: "might",
      baseValue: 2,
      controllerPlayerId: "p1",
      game,
      index,
      targetCardInstanceId: "source",
      targetScope: "source",
    });

    example.arrangeTrue(game);
    assert.equal(value(), 3, `${example.label} should enable the modifier.`);
    example.arrangeFalse(game);
    assert.equal(value(), 2, `${example.label} should disable the modifier.`);
  }
});

test("a state condition gates a continuous keyword grant", () => {
  const source = card("SYN-CONDITIONAL-KEYWORD", "Unit", 2);
  source.behaviorModel.clauses = [{
    id: "conditional-keyword",
    sequence: 0,
    sourceText: "While this is buffed, it has a synthetic keyword.",
    normalizedText: "While this is buffed, it has a synthetic keyword.",
    abilities: [],
    triggers: [],
    conditions: [binding("condition.state", {
      subject: "source",
      property: "buffed",
      operator: "equal",
      comparisonValue: 1,
    })],
    selectors: [],
    choices: [],
    costs: [],
    timings: [],
    effects: [binding("modifier.grant_keyword", {
      keywordId: "keyword.quick_action",
      amount: 1,
      target: "source",
      duration: "whileSourceOnBoard",
    })],
    keywords: [],
  }];
  const { game, decks } = fixture([source], [
    instance("source", "p1", source.cardCode, "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source"];
  const index = createRuntimeCardIndex(decks, game);

  assert.equal(hasKeyword(game, "source", "keyword.quick_action", index), false);
  game.state.cardStates.source!.buffed = true;
  assert.equal(hasKeyword(game, "source", "keyword.quick_action", index), true);
  game.state.cardStates.source!.buffed = false;
  assert.equal(hasKeyword(game, "source", "keyword.quick_action", index), false);
});

test("resolution-time mode choice executes only the selected branch", () => {
  for (const example of [
    { selectedMode: "small", expectedDrawCount: 1 },
    { selectedMode: "large", expectedDrawCount: 2 },
  ]) {
    const source = card("SYN-RESOLUTION-MODE", "Gear");
    source.behaviorModel.clauses = [{
      id: "resolution-mode",
      sequence: 0,
      sourceText: "Choose one synthetic branch.",
      normalizedText: "Choose one synthetic branch.",
      abilities: [],
      triggers: [],
      conditions: [],
      selectors: [],
      choices: [binding("choice.choose_mode", {
        selectionKey: "mode",
        optionIds: "small|large",
        optionLabels: "Small|Large",
      })],
      costs: [],
      timings: [],
      effects: [
        binding("action.draw_cards", {
          count: 1,
          player: "controller",
          requiresChoiceKey: "mode",
          requiresChoiceValue: "small",
        }),
        {
          ...binding("action.draw_cards", {
            count: 2,
            player: "controller",
            requiresChoiceKey: "mode",
            requiresChoiceValue: "large",
          }),
          order: 1,
        },
      ],
      keywords: [],
    }];
    const { game, decks } = fixture([
      source,
      card("SYN-DRAW", "Spell"),
    ], [
      instance("source", "p1", source.cardCode, "mainDeck"),
      instance("draw-a", "p1", "SYN-DRAW", "mainDeck"),
      instance("draw-b", "p1", "SYN-DRAW", "mainDeck"),
    ]);
    game.state.players.p1!.zones.base = ["source"];
    game.state.players.p1!.zones.mainDeck = ["draw-a", "draw-b"];

    assert.equal(beginEffectResolution({
      game,
      controllerPlayerId: "p1",
      sourceCardInstanceId: "source",
      clauseId: "resolution-mode",
      decks,
    }), false);
    assert.equal(game.state.pendingChoice?.type, "mode");
    const submit = gameplayActions(game, "p1", decks).find(
      (action) => action.choice?.kind === "mode" && action.enabled,
    );
    assert.ok(submit);
    const resolved = performGameplayTransition({
      game,
      actorPlayerId: "p1",
      actionId: submit.id,
      selectedIds: [example.selectedMode],
      decks,
      now: `mode-${example.selectedMode}`,
    }).game;

    assert.equal(
      resolved.state.players.p1!.zones.hand.length,
      example.expectedDrawCount,
    );
    assert.equal(resolved.state.pendingChoice, null);
    assert.deepEqual(resolved.state.effectResolutions, []);
  }
});

test("activated mode memory excludes choices already used by the source object", () => {
  const source = card("SYN-ACTIVATED-MODE", "Gear");
  source.behaviorModel.clauses = [{
    id: "remember-mode",
    sequence: 0,
    sourceText: "Activate and choose a synthetic mode.",
    normalizedText: "Activate and choose a synthetic mode.",
    abilities: [binding("ability.activate")],
    triggers: [],
    conditions: [],
    selectors: [],
    choices: [binding("choice.choose_mode", {
      selectionKey: "mode",
      optionIds: "alpha|beta",
      optionLabels: "Alpha|Beta",
    })],
    costs: [],
    timings: [],
    effects: [],
    keywords: [],
  }];
  const { game, decks } = fixture([source], [
    instance("source", "p1", source.cardCode, "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source"];

  const activate = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "source" && action.enabled,
  );
  assert.ok(activate);
  let next = performGameplayTransition({
    game,
    actorPlayerId: "p1",
    actionId: activate.id,
    selectedIds: [],
    decks,
    now: "activate-alpha",
  }).game;
  assert.deepEqual(
    next.state.pendingChoice?.type === "mode"
      ? next.state.pendingChoice.options.map((option) => option.id)
      : [],
    ["alpha", "beta"],
  );
  const chooseAlpha = gameplayActions(next, "p1", decks).find(
    (action) => action.choice?.kind === "mode" && action.enabled,
  );
  assert.ok(chooseAlpha);
  next = performGameplayTransition({
    game: next,
    actorPlayerId: "p1",
    actionId: chooseAlpha.id,
    selectedIds: ["alpha"],
    decks,
    now: "choose-alpha",
  }).game;
  next = resolveCurrentChain(next, decks);

  const activateAgain = gameplayActions(next, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "source" && action.enabled,
  );
  assert.ok(activateAgain);
  next = performGameplayTransition({
    game: next,
    actorPlayerId: "p1",
    actionId: activateAgain.id,
    selectedIds: [],
    decks,
    now: "activate-again",
  }).game;
  assert.deepEqual(
    next.state.pendingChoice?.type === "mode"
      ? next.state.pendingChoice.options.map((option) => option.id)
      : [],
    ["beta"],
  );
});

test("optional targeted resolution accepts a legal target or declines", () => {
  const source = card("SYN-OPTIONAL-SOURCE", "Unit", 2);
  source.behaviorModel.clauses = [{
    id: "optional-target-resolution",
    sequence: 0,
    sourceText: "Optionally apply an effect to one eligible object.",
    normalizedText: "Optionally apply an effect to one eligible object.",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [binding("selector.friendly_card", {
      minimumCount: 1,
      maximumCount: 1,
      excludesSource: true,
      exhaustedOnly: true,
      selectionKey: "target",
      requiresChoiceKey: "useEffect",
    })],
    choices: [binding("choice.optional", {
      selectionKey: "useEffect",
      prompt: "Use the optional effect?",
    })],
    costs: [],
    timings: [],
    effects: [binding("action.ready_cards", {
      target: "friendly_card",
      selectionKey: "target",
      requiresChoiceKey: "useEffect",
    })],
    keywords: [],
  }];

  for (const example of [
    { label: "accept", selectedIds: ["target"], expectedExhausted: false },
    { label: "decline", selectedIds: [], expectedExhausted: true },
  ]) {
    const { game, decks } = fixture([
      source,
      card("SYN-OPTIONAL-TARGET", "Gear"),
    ], [
      instance("source", "p1", source.cardCode, "mainDeck"),
      instance("target", "p1", "SYN-OPTIONAL-TARGET", "mainDeck"),
    ]);
    game.state.players.p1!.zones.base = ["source", "target"];
    game.state.cardStates.target!.exhausted = true;

    assert.equal(beginEffectResolution({
      game,
      controllerPlayerId: "p1",
      sourceCardInstanceId: "source",
      clauseId: "optional-target-resolution",
      decks,
    }), false);
    assert.equal(game.state.pendingChoice?.type, "effectSelection");
    if (game.state.pendingChoice?.type !== "effectSelection") {
      throw new Error("Expected an effect-selection decision.");
    }
    assert.equal(game.state.pendingChoice.allowDecline, true);
    assert.deepEqual(game.state.pendingChoice.legalCardIds, ["target"]);

    const submit = gameplayActions(game, "p1", decks).find(
      (action) => action.choice?.kind === "effectSelection" && action.enabled,
    );
    assert.ok(submit);
    const resolved = performGameplayTransition({
      game,
      actorPlayerId: "p1",
      actionId: submit.id,
      selectedIds: example.selectedIds,
      decks,
      now: example.label,
    }).game;

    assert.equal(
      resolved.state.cardStates.target!.exhausted,
      example.expectedExhausted,
    );
    assert.equal(resolved.state.pendingChoice, null);
    assert.deepEqual(resolved.state.effectResolutions, []);
    gameDocumentSchema.parse(resolved);
  }
});
test("Gear selector returns only base-zone Gear across players", () => {
  const { game, handlers } = fixture([
    card("SYN-GEAR-SOURCE", "Unit", 1),
    card("SYN-GEAR", "Gear"),
    card("SYN-NON-GEAR", "Unit", 1),
    card("SYN-BATTLEFIELD", "Battlefield"),
  ], [
    instance("source", "p1", "SYN-GEAR-SOURCE", "mainDeck"),
    instance("friendly-gear", "p1", "SYN-GEAR", "mainDeck"),
    instance("enemy-gear", "p2", "SYN-GEAR", "mainDeck"),
    instance("field-gear", "p1", "SYN-GEAR", "mainDeck"),
    instance("unit", "p1", "SYN-NON-GEAR", "mainDeck"),
    instance("battlefield", "p1", "SYN-BATTLEFIELD", "battlefield"),
  ]);
  game.state.players.p1!.zones.base = ["source", "friendly-gear", "unit"];
  game.state.players.p2!.zones.base = ["enemy-gear"];
  game.state.battlefields = [{
    battlefieldId: "location",
    cardInstanceId: "battlefield",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    contestedByPlayerId: null,
    units: ["field-gear"],
  }];
  const requirement = handlers.get("selector.gear")!.targets!(
    bindingFor("selector.gear", {
      minimumCount: 1,
      maximumCount: 1,
      selectionKey: "gear",
    }),
    createBehaviorContext(game, "p1", "source", null, []),
  );

  assert.deepEqual(requirement.legalIds, ["friendly-gear", "enemy-gear"]);
  assert.equal(requirement.minimum, 1);
  assert.equal(requirement.maximum, 1);
  assert.equal(requirement.selectionKey, "gear");
});

test("choice gates accept implicit and explicit branch values", () => {
  const { game } = fixture([]);
  const context = createBehaviorContext(game, "p1", "source", null, []);

  for (const example of [
    { selected: ["accept"], requiredValue: null, expected: true },
    { selected: ["decline"], requiredValue: null, expected: false },
    { selected: ["alpha"], requiredValue: "alpha", expected: true },
    { selected: ["beta"], requiredValue: "alpha", expected: false },
    { selected: [], requiredValue: "alpha", expected: false },
  ]) {
    context.selectedBySelector.branch = example.selected;
    assert.equal(
      bindingChoiceGateMatches(bindingFor("synthetic.effect", {
        requiresChoiceKey: "branch",
        ...(example.requiredValue
          ? { requiresChoiceValue: example.requiredValue }
          : {}),
      }), context),
      example.expected,
    );
  }
  assert.equal(
    bindingChoiceGateMatches(bindingFor("synthetic.effect"), context),
    true,
  );
});

test("deferred selectors choose from the legal set at effect resolution", () => {
  const source = card("SYN-DEFERRED-SOURCE", "Gear");
  source.behaviorModel.clauses = [{
    id: "deferred-selection",
    sequence: 0,
    sourceText: "After a synthetic event, choose a target during resolution.",
    normalizedText: "After a synthetic event, choose a target during resolution.",
    abilities: [],
    triggers: [binding("trigger.event", {
      eventType: "synthetic.deferred",
      subject: "friendly_card",
    })],
    conditions: [],
    selectors: [binding("selector.friendly_unit", {
      minimumCount: 1,
      maximumCount: 1,
      selectionKey: "target",
      deferred: true,
    })],
    choices: [],
    costs: [],
    timings: [],
    effects: [binding("action.buff_unit", {
      target: "friendly_unit",
      selectionKey: "target",
    })],
    keywords: [],
  }];
  const { game, decks } = fixture([
    source,
    card("SYN-DEFERRED-UNIT", "Unit", 2),
    card("SYN-DEFERRED-EVENT", "Spell"),
  ], [
    instance("source", "p1", source.cardCode, "mainDeck"),
    instance("initial-target", "p1", "SYN-DEFERRED-UNIT", "mainDeck"),
    instance("late-target", "p1", "SYN-DEFERRED-UNIT", "mainDeck"),
    instance("event-subject", "p1", "SYN-DEFERRED-EVENT", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source", "initial-target"];
  game.state.players.p1!.zones.hand = ["late-target"];

  dispatchBehaviorEvent(game, {
    type: "synthetic.deferred",
    actorPlayerId: "p1",
    subjectCardInstanceId: "event-subject",
    values: {},
  }, decks);

  assert.equal(game.state.pendingChoice, null);
  assert.equal(game.state.chain?.items.length, 1);
  assert.deepEqual(game.state.chain?.items[0]?.targetCardInstanceIds, []);
  game.state.players.p1!.zones.hand = [];
  game.state.players.p1!.zones.base.push("late-target");

  let next = game;
  for (const actorPlayerId of ["p1", "p2"] as const) {
    const pass = gameplayActions(next, actorPlayerId, decks).find(
      (action) => action.label === "Pass priority" && action.enabled,
    );
    assert.ok(pass);
    next = performGameplayTransition({
      game: next,
      actorPlayerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `deferred-pass-${actorPlayerId}`,
    }).game;
  }

  assert.equal(next.state.pendingChoice?.type, "effectSelection");
  assert.deepEqual(
    next.state.pendingChoice?.type === "effectSelection"
      ? next.state.pendingChoice.legalCardIds
      : [],
    ["initial-target", "late-target"],
  );
  const submit = gameplayActions(next, "p1", decks).find(
    (action) => action.choice?.kind === "effectSelection" && action.enabled,
  );
  assert.ok(submit);
  next = performGameplayTransition({
    game: next,
    actorPlayerId: "p1",
    actionId: submit.id,
    selectedIds: ["late-target"],
    decks,
    now: "select-late-target",
  }).game;

  assert.equal(next.state.cardStates["initial-target"]!.buffed, undefined);
  assert.equal(next.state.cardStates["late-target"]!.buffed, true);
  assert.equal(next.state.pendingChoice, null);
  assert.deepEqual(next.state.effectResolutions, []);
});

test("a targetless optional effect retains its accept or decline prompt", () => {
  const source = card("SOURCE", "Unit", 2);
  source.behaviorModel.clauses = [{
    id: "targetless-optional",
    sequence: 0,
    sourceText: "You may do a thing.",
    normalizedText: "You may do a thing.",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [],
    choices: [binding("choice.optional", {
      selectionKey: "doThing",
      prompt: "Do the thing?",
    })],
    costs: [],
    timings: [],
    effects: [],
    keywords: [],
  }];
  const { game, decks } = fixture([source], [
    instance("source", "p1", "SOURCE", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source"];

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "targetless-optional",
    decks,
  }), false);
  assert.equal(game.state.pendingChoice?.type, "binary");
});

test("unit presence evaluates threshold, ownership, readiness, and source location", () => {
  const { game, handlers } = fixture([
    card("SYN-PRESENCE-SOURCE", "Battlefield"),
    card("SYN-PRESENCE-OTHER", "Battlefield"),
    card("SYN-PRESENCE-UNIT", "Unit", 1),
  ], [
    instance("source", "p1", "SYN-PRESENCE-SOURCE", "battlefield"),
    instance("other", "p2", "SYN-PRESENCE-OTHER", "battlefield"),
    instance("friendly-ready", "p1", "SYN-PRESENCE-UNIT", "mainDeck"),
    instance("friendly-exhausted", "p1", "SYN-PRESENCE-UNIT", "mainDeck"),
    instance("friendly-elsewhere", "p1", "SYN-PRESENCE-UNIT", "mainDeck"),
    instance("enemy-ready", "p2", "SYN-PRESENCE-UNIT", "mainDeck"),
  ]);
  game.state.cardStates["friendly-exhausted"]!.exhausted = true;
  game.state.battlefields = [
    {
      battlefieldId: "source-location",
      cardInstanceId: "source",
      selectedByPlayerId: "p1",
      controllerPlayerId: "p1",
      contestedByPlayerId: null,
      units: ["friendly-ready", "friendly-exhausted", "enemy-ready"],
    },
    {
      battlefieldId: "other-location",
      cardInstanceId: "other",
      selectedByPlayerId: "p2",
      controllerPlayerId: "p2",
      contestedByPlayerId: null,
      units: ["friendly-elsewhere"],
    },
  ];
  const context = createBehaviorContext(game, "p1", "source", null, []);
  const matches = handlers.get("condition.unit_presence")!.matches!;

  for (const example of [
    { controller: "controller", readyState: null, minimumCount: 2, expected: true },
    { controller: "controller", readyState: null, minimumCount: 3, expected: false },
    { controller: "enemy", readyState: null, minimumCount: 1, expected: true },
    { controller: "enemy", readyState: null, minimumCount: 2, expected: false },
    { controller: "controller", readyState: "ready", minimumCount: 1, expected: true },
    { controller: "controller", readyState: "ready", minimumCount: 2, expected: false },
  ] as const) {
    assert.equal(
      matches(bindingFor("condition.unit_presence", {
        controller: example.controller,
        locationRelation: "sourceLocation",
        minimumCount: example.minimumCount,
        ...(example.readyState ? { readyState: example.readyState } : {}),
      }), context),
      example.expected,
      JSON.stringify(example),
    );
  }
});

test("an automatic source-location selector returns the complete eligible group", () => {
  const { game, handlers } = fixture([
    card("SYN-AUTOMATIC-GROUP-SOURCE", "Unit", 2),
    card("SYN-GROUP-BATTLEFIELD", "Battlefield"),
    card("SYN-OTHER-BATTLEFIELD", "Battlefield"),
    card("SYN-FRIENDLY-UNIT", "Unit", 1),
    card("SYN-ENEMY-UNIT", "Unit", 1),
  ], [
    instance("source", "p1", "SYN-AUTOMATIC-GROUP-SOURCE", "mainDeck"),
    instance("battlefield", "p1", "SYN-GROUP-BATTLEFIELD", "battlefield"),
    instance("other-battlefield", "p2", "SYN-OTHER-BATTLEFIELD", "battlefield"),
    instance("friendly-here", "p1", "SYN-FRIENDLY-UNIT", "mainDeck"),
    instance("friendly-elsewhere", "p1", "SYN-FRIENDLY-UNIT", "mainDeck"),
    instance("enemy-here", "p2", "SYN-ENEMY-UNIT", "mainDeck"),
  ]);
  game.state.battlefields = [
    {
      battlefieldId: "source-location",
      cardInstanceId: "battlefield",
      selectedByPlayerId: "p1",
      controllerPlayerId: "p1",
      contestedByPlayerId: null,
      units: ["source", "friendly-here", "enemy-here"],
    },
    {
      battlefieldId: "other-location",
      cardInstanceId: "other-battlefield",
      selectedByPlayerId: "p2",
      controllerPlayerId: "p2",
      contestedByPlayerId: null,
      units: ["friendly-elsewhere"],
    },
  ];
  const context = createBehaviorContext(game, "p1", "source", null, []);
  const requirement = handlers.get("selector.friendly_unit")!.targets!(
    bindingFor("selector.friendly_unit", {
      scope: "each",
      automatic: true,
      excludesSource: true,
      locationRelation: "sourceLocation",
      selectionKey: "group",
    }),
    context,
  );

  assert.deepEqual(requirement.legalIds, ["friendly-here"]);
  assert.equal(requirement.minimum, 0);
  assert.equal(requirement.maximum, 0);
});

test("buff unit mutates every target routed through a selector key", () => {
  const { game, handlers } = fixture([
    card("SYN-BUFF-SOURCE", "Gear"),
    card("SYN-BUFF-TARGET", "Unit", 2),
  ], [
    instance("source", "p1", "SYN-BUFF-SOURCE", "mainDeck"),
    instance("first", "p1", "SYN-BUFF-TARGET", "mainDeck"),
    instance("second", "p1", "SYN-BUFF-TARGET", "mainDeck"),
    instance("unselected", "p1", "SYN-BUFF-TARGET", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source", "first", "second", "unselected"];
  const context = createBehaviorContext(game, "p1", "source", null, []);
  context.selectedBySelector.group = ["first", "second"];

  handlers.get("action.buff_unit")!.execute!(
    bindingFor("action.buff_unit", {
      target: "friendly_unit",
      selectionKey: "group",
    }),
    context,
  );

  assert.equal(game.state.cardStates.first!.buffed, true);
  assert.equal(game.state.cardStates.second!.buffed, true);
  assert.notEqual(game.state.cardStates.unselected!.buffed, true);
  assert.equal(game.state.cardStates.first!.computedMight, 3);
  assert.equal(game.state.cardStates.second!.computedMight, 3);
});

test("win game completes the game for the effect controller", () => {
  const { game, handlers } = fixture([
    card("SYN-WIN-SOURCE", "Unit", 1),
  ], [
    instance("source", "p2", "SYN-WIN-SOURCE", "mainDeck"),
  ]);
  game.state.players.p2!.zones.base = ["source"];
  const context = createBehaviorContext(game, "p2", "source", null, []);

  handlers.get("action.win_game")!.execute!(
    bindingFor("action.win_game"),
    context,
  );

  assert.equal(game.winnerPlayerId, "p2");
  assert.equal(game.status, "complete");
  gameDocumentSchema.parse(game);
});

test("vision exposes only the top card and recycles the selected card", () => {
  const { game, handlers } = fixture([
    card("SOURCE", "Unit", 1),
    card("TOP", "Spell"),
    card("NEXT", "Spell"),
  ], [
    instance("source", "p1", "SOURCE", "mainDeck"),
    instance("top", "p1", "TOP", "mainDeck"),
    instance("next", "p1", "NEXT", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source"];
  game.state.players.p1!.zones.mainDeck = ["top", "next"];

  const context = createBehaviorContext(
    game,
    "p1",
    "source",
    null,
    [],
  );
  const binding = bindingFor("action.vision");
  const requirement = handlers.get("action.vision")!.choice!(binding, context);

  assert.deepEqual(requirement?.legalIds, ["top"]);
  assert.equal(requirement?.minimum, 0);
  assert.equal(requirement?.maximum, 1);

  context.selectedIds.push("top");
  handlers.get("action.vision")!.execute!(binding, context);
  assert.deepEqual(game.state.players.p1!.zones.mainDeck, ["next", "top"]);
});

test("reveal emits public behavior events without moving cards", () => {
  const { game, handlers } = fixture([
    card("SOURCE", "Unit", 1),
    card("TOP", "Spell"),
  ], [
    instance("source", "p1", "SOURCE", "mainDeck"),
    instance("top", "p1", "TOP", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source"];
  game.state.players.p1!.zones.mainDeck = ["top"];

  const context = createBehaviorContext(
    game,
    "p1",
    "source",
    null,
    [],
  );
  handlers.get("action.reveal")!.execute!(
    bindingFor("action.reveal", { count: 1 }),
    context,
  );

  assert.deepEqual(game.state.players.p1!.zones.mainDeck, ["top"]);
  assert.deepEqual(game.state.queuedBehaviorEvents, [{
    type: "card.revealed",
    actorPlayerId: "p1",
    subjectCardInstanceId: "top",
    values: {},
  }]);
});

test("channel-or-draw exhausts newly channelled Runes and draws when empty", () => {
  const { game, handlers } = fixture([
    card("SOURCE", "Unit", 1),
    card("RUNE", "Rune"),
    card("DRAW", "Spell"),
  ], [
    instance("source", "p1", "SOURCE", "mainDeck"),
    instance("rune", "p1", "RUNE", "runeDeck"),
    instance("draw", "p1", "DRAW", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source"];
  game.state.players.p1!.zones.runeDeck = ["rune"];
  game.state.players.p1!.zones.mainDeck = ["draw"];

  const context = createBehaviorContext(game, "p1", "source", null, []);
  handlers.get("action.channel_or_draw")!.execute!(
    bindingFor("action.channel_or_draw", {
      channelCount: 1,
      entryState: "exhausted",
      fallbackDrawCount: 1,
    }),
    context,
  );

  assert.deepEqual(game.state.players.p1!.zones.runeDeck, []);
  assert.deepEqual(game.state.players.p1!.zones.base, ["source", "rune"]);
  assert.equal(game.state.cardStates.rune!.exhausted, true);
  assert.deepEqual(game.state.players.p1!.zones.hand, []);

  game.state.players.p1!.zones.base = ["source"];
  game.state.players.p1!.zones.runeDeck = [];
  game.state.players.p1!.zones.mainDeck = ["draw"];
  handlers.get("action.channel_or_draw")!.execute!(
    bindingFor("action.channel_or_draw", {
      channelCount: 1,
      entryState: "exhausted",
      fallbackDrawCount: 1,
    }),
    context,
  );
  assert.deepEqual(game.state.players.p1!.zones.hand, ["draw"]);
});

test("fight applies simultaneous damage to both selected units", () => {
  const { game, handlers } = fixture([
    card("SOURCE", "Unit", 1),
    card("FIRST", "Unit", 2),
    card("SECOND", "Unit", 3),
  ], [
    instance("source", "p1", "SOURCE", "mainDeck"),
    instance("first", "p1", "FIRST", "mainDeck"),
    instance("second", "p2", "SECOND", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source", "first"];
  game.state.players.p2!.zones.base = ["second"];

  const context = createBehaviorContext(game, "p1", "source", null, []);
  context.selectedBySelector.first = ["first"];
  context.selectedBySelector.second = ["second"];
  handlers.get("action.fight")!.execute!(
    bindingFor("action.fight", {
      firstUnitSelectionKey: "first",
      secondUnitSelectionKey: "second",
    }),
    context,
  );

  assert.deepEqual(game.state.players.p1!.zones.trash, ["first"]);
  assert.deepEqual(game.state.players.p2!.zones.base, ["second"]);
  assert.equal(game.state.cardStates.second!.damage, 2);
  assert.deepEqual(
    game.state.queuedBehaviorEvents
      ?.filter((event) => event.type === "unit.damaged")
      .map((event) => event.values.amount),
    [3, 2],
  );
});

test("optional-cost draw branches on whether the optional selection was paid", () => {
  const { game, handlers } = fixture([
    card("SOURCE", "Spell"),
    card("UNIT", "Unit", 1),
    card("A", "Spell"),
    card("B", "Spell"),
    card("C", "Spell"),
  ], [
    instance("source", "p1", "SOURCE", "mainDeck"),
    instance("unit", "p1", "UNIT", "mainDeck"),
    instance("a", "p1", "A", "mainDeck"),
    instance("b", "p1", "B", "mainDeck"),
    instance("c", "p1", "C", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["unit"];
  game.state.players.p1!.zones.mainDeck = ["a", "b", "c"];
  const context = createBehaviorContext(game, "p1", "source", null, []);
  const binding = bindingFor("action.draw_by_optional_cost", {
    selectionKey: "optionalCost",
    paidCount: 2,
    unpaidCount: 1,
  });

  context.selectedBySelector.optionalCost = ["unit"];
  handlers.get("action.draw_by_optional_cost")!.execute!(binding, context);
  assert.deepEqual(game.state.players.p1!.zones.hand, ["a", "b"]);

  context.selectedBySelector.optionalCost = [];
  handlers.get("action.draw_by_optional_cost")!.execute!(binding, context);
  assert.deepEqual(game.state.players.p1!.zones.hand, ["a", "b", "c"]);
});

test("source and battlefield trigger contracts distinguish ownership and location", () => {
  const { game, handlers } = fixture([
    card("SOURCE", "Unit", 1),
    card("BATTLEFIELD", "Battlefield"),
  ], [
    instance("source", "p1", "SOURCE", "mainDeck"),
    instance("battlefield", "p1", "BATTLEFIELD", "battlefield"),
  ]);
  game.state.battlefields = [{
    battlefieldId: "battlefield",
    cardInstanceId: "battlefield",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    contestedByPlayerId: null,
    units: ["source"],
  }];
  const sourceContext = (event: BehaviorEvent) =>
    createBehaviorContext(game, "p1", "source", event, []);

  const conquerSource = handlers.get("trigger.conquer_source")!.matches!;
  assert.equal(conquerSource(bindingFor("trigger.conquer_source"), sourceContext({
    type: "battlefield.conquered",
    actorPlayerId: "p1",
    subjectCardInstanceId: "battlefield",
    values: {},
  })), true);
  assert.equal(conquerSource(bindingFor("trigger.conquer_source"), sourceContext({
    type: "battlefield.conquered",
    actorPlayerId: "p2",
    subjectCardInstanceId: "battlefield",
    values: {},
  })), false);

  const hold = handlers.get("trigger.hold_battlefield")!.matches!;
  assert.equal(hold(bindingFor("trigger.hold_battlefield"), sourceContext({
    type: "battlefield.held",
    actorPlayerId: "p1",
    subjectCardInstanceId: "source",
    values: {},
  })), true);
});

test("recall replacement registers a turn-scoped ongoing effect", () => {
  const { game, handlers } = fixture([
    card("SOURCE", "Unit", 1),
    card("TARGET", "Unit", 1),
  ], [
    instance("source", "p1", "SOURCE", "mainDeck"),
    instance("target", "p1", "TARGET", "mainDeck"),
  ]);
  const context = createBehaviorContext(game, "p1", "source", null, ["target"]);
  context.selectedBySelector.target = ["target"];

  handlers.get("replacement.recall_on_next_death")!.execute!(
    bindingFor("replacement.recall_on_next_death", {
      duration: "thisTurn",
      selectionKey: "target",
    }),
    context,
  );

  assert.deepEqual(game.state.ongoingEffects, [{
    id: "ongoing:1:source:0",
    behaviorId: "replacement.recall_on_next_death",
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    targetCardInstanceIds: ["target"],
    duration: "thisTurn",
    createdAtTurn: 1,
  }]);
});

function fixture(
  definitions: GameCardDefinition[],
  instances: CardInstance[] = [],
): {
  game: GameDocument;
  decks: DeckSnapshotDocument[];
  handlers: ReturnType<typeof createPrimitiveHandlers>;
} {
  const snapshot = {
    sourceText: "synthetic",
    catalogDigest: "synthetic",
    entries: [],
    cards: definitions,
  };
  const decks: DeckSnapshotDocument[] = [
    {
      id: "deck-p1",
      createdAt: "now",
      updatedAt: "now",
      matchId: "match",
      playerId: "p1",
      snapshot,
      instances: instances.filter((instance) => instance.ownerPlayerId === "p1"),
    },
    {
      id: "deck-p2",
      createdAt: "now",
      updatedAt: "now",
      matchId: "match",
      playerId: "p2",
      snapshot,
      instances: instances.filter((instance) => instance.ownerPlayerId === "p2"),
    },
  ];
  const game = gameDocumentSchema.parse({
    id: "game",
    matchId: "match",
    createdAt: "now",
    updatedAt: "now",
    gameNumber: 1,
    stateVersion: 1,
    status: "in_progress",
    winnerPlayerId: null,
    completionReason: null,
    state: {
      setup: {
        playerIds: ["p1", "p2"],
        startingPlayerChooserId: "p1",
        startingPlayerId: "p1",
        battlefieldPools: {},
        battlefieldChoices: {},
        mulligans: {},
      },
      players: {
        p1: player("p1"),
        p2: player("p2"),
      },
      battlefields: [],
      cardStates: Object.fromEntries(
        instances.map((instance) => [instance.instanceId, cardState(instance, definitions)]),
      ),
      turnHistory: {
        discardedCardIdsByPlayerId: {},
        diedCardIdsByPlayerId: {},
        movedCardIdsByPlayerId: {},
        readiedCardIdsByPlayerId: {},
        recycledCardIdsByPlayerId: {},
      },
      createdCardInstances: [],
      createdCardDefinitions: [],
      turn: { turnNumber: 1, activePlayerId: "p1", phase: "action" },
      chain: null,
      showdown: null,
      combat: null,
      modifiers: [],
      ongoingEffects: [],
      delayedEffects: [],
      effectResolutions: [],
      pendingChoice: null,
      queuedTriggerChoices: [],
    },
  });
  const index = createRuntimeCardIndex(decks, game);
  return { game, decks, handlers: createPrimitiveHandlers(index) };
}

function player(playerId: string) {
  return {
    playerId,
    points: 0,
    scoredBattlefieldIdsThisTurn: [],
    conqueredBattlefieldIdsThisTurn: [],
    energy: 0,
    conditionalEnergy: 0,
    conditionalPower: {},
    power: {},
    zones: {
      legend: null,
      champion: null,
      mainDeck: [],
      runeDeck: [],
      hand: [],
      trash: [],
      banishment: [],
      base: [],
    },
  };
}

function card(
  cardCode: string,
  type: "Battlefield" | "Gear" | "Rune" | "Spell" | "Unit",
  might: number | null = null,
): GameCardDefinition {
  return {
    cardCode,
    sourceTextHash: `hash:${cardCode}`,
    card: {
      id: cardCode,
      name: `Synthetic ${cardCode}`,
      public_code: cardCode,
      attributes: { energy: type === "Spell" ? 1 : null, might, power: null },
      classification: {
        type,
        supertype: null,
        rarity: null,
        domain: ["Colorless"],
      },
      text: { plain: "" },
      set: { set_id: "synthetic", label: "Synthetic" },
      media: {},
      tags: [],
      metadata: {},
    },
    behaviorModel: { playTimings: [], clauses: [] },
  };
}

function instance(
  instanceId: string,
  ownerPlayerId: string,
  cardCode: string,
  source: CardInstance["source"],
): CardInstance {
  return { instanceId, ownerPlayerId, cardCode, source };
}

function cardState(
  instance: CardInstance,
  definitions: GameCardDefinition[],
) {
  return {
    exhausted: false,
    damage: 0,
    computedMight:
      definitions.find((definition) => definition.cardCode === instance.cardCode)
        ?.card.attributes.might ?? null,
    objectVersion: 0,
  };
}

function binding(
  behaviorId: string,
  parameters: Record<string, string | number | boolean | null> = {},
): BehaviorBinding {
  return { behaviorId, parameters, confidence: "high", order: 0 };
}

function bindingFor(
  behaviorId: string,
  parameters: Record<string, string | number | boolean | null> = {},
) {
  return binding(behaviorId, parameters);
}

function resolveCurrentChain(
  game: GameDocument,
  decks: DeckSnapshotDocument[],
): GameDocument {
  let next = game;
  for (let passCount = 0; next.state.chain && passCount < 8; passCount += 1) {
    const availablePasses = next.state.setup.playerIds.flatMap(
      (actorPlayerId) => gameplayActions(next, actorPlayerId, decks)
        .filter((action) => action.label === "Pass priority" && action.enabled)
        .map((action) => ({ action, actorPlayerId })),
    );
    assert.equal(availablePasses.length, 1);
    const { action, actorPlayerId } = availablePasses[0]!;
    next = performGameplayTransition({
      game: next,
      actorPlayerId,
      actionId: action.id,
      selectedIds: [],
      decks,
      now: `pass-${passCount}`,
    }).game;
  }
  assert.equal(next.state.chain, null);
  return next;
}
