import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GAME__RUNTIME_COVERAGE,
  createBehaviorContext,
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  gameplayActions,
  performGameplayAction,
  performGameplayTransition,
  applyStartOfTurn,
  dispatchBehaviorEvent,
  effectiveEnergyCost,
  type BehaviorEvent,
  type BehaviorBinding,
  type GameCardDefinition,
  type GameDocument,
  gameDocumentSchema,
} from "../src/server/game";
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

test("a Legion enter-ready effect is consumed by the next Unit play", () => {
  const source = card("SOURCE", "Gear");
  source.behaviorModel.clauses = [{
    id: "ready-next-unit",
    sequence: 0,
    sourceText: "Exhaust: Legion — The next Unit you play this turn enters ready.",
    normalizedText: "Exhaust: Legion — The next Unit you play this turn enters ready.",
    abilities: [binding("ability.activate")],
    triggers: [],
    conditions: [],
    selectors: [],
    choices: [],
    costs: [binding("cost.exhaust_source")],
    timings: [],
    effects: [binding("modifier.enter_ready", {
      target: "controller_units",
      duration: "thisTurn",
    })],
    keywords: [binding("keyword.legion")],
  }];
  const { game, decks } = fixture([
    source,
    card("FIRST_UNIT", "Unit", 2),
    card("SECOND_UNIT", "Unit", 2),
  ], [
    instance("source", "p1", "SOURCE", "mainDeck"),
    instance("first-unit", "p1", "FIRST_UNIT", "mainDeck"),
    instance("second-unit", "p1", "SECOND_UNIT", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source"];
  game.state.players.p1!.zones.hand = ["first-unit", "second-unit"];
  game.state.players.p1!.playedCardIdsThisTurn = ["earlier-card"];

  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: gameplayActions(game, "p1", decks).find(
      (action) => action.sourceCardInstanceId === "source" && action.enabled,
    )!.id,
    selectedIds: [],
    decks,
    now: "activate-legion",
  });

  for (const actorPlayerId of ["p1", "p2"] as const) {
    next = performGameplayAction({
      game: next,
      actorPlayerId,
      actionId: gameplayActions(next, actorPlayerId, decks).find(
        (action) => action.label === "Pass priority",
      )!.id,
      selectedIds: [],
      decks,
      now: `pass-${actorPlayerId}`,
    });
  }

  const play = gameplayActions(next, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "first-unit" && action.enabled,
  );
  assert.ok(play, "Synthetic Unit should be playable after resolving Legion.");
  next = performGameplayAction({
    game: next,
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
    sourceText: "When a friendly Unit readies, it gets +1 Might this turn.",
    normalizedText: "When a friendly Unit readies, it gets +1 Might this turn.",
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
    effects: [binding("modifier.modify_numeric_value", {
      attribute: "might",
      operation: "increase",
      operand: "constant",
      amount: 1,
      target: "event_subject",
      duration: "thisTurn",
    })],
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

test("a typed ready event routes its subject through the complete trigger contract", () => {
  const trigger = card("SYN-READY-TRIGGER", "Gear");
  trigger.behaviorModel.clauses = [{
    id: "modify-readied-subject",
    sequence: 0,
    sourceText: "When a friendly Unit readies, it gets +1 Might this turn.",
    normalizedText: "When a friendly Unit readies, it gets +1 Might this turn.",
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
    effects: [binding("modifier.modify_numeric_value", {
      attribute: "might",
      operation: "increase",
      operand: "constant",
      amount: 1,
      target: "event_subject",
      duration: "thisTurn",
    })],
    keywords: [],
  }];
  const { game, decks } = fixture([
    trigger,
    card("SYN-READIED-UNIT", "Unit", 3),
    card("SYN-UNCHANGED-UNIT", "Unit", 5),
  ], [
    instance("trigger", "p1", "SYN-READY-TRIGGER", "mainDeck"),
    instance("readied-unit", "p1", "SYN-READIED-UNIT", "mainDeck"),
    instance("unchanged-unit", "p1", "SYN-UNCHANGED-UNIT", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = [
    "trigger",
    "readied-unit",
    "unchanged-unit",
  ];
  game.state.cardStates["readied-unit"]!.exhausted = true;
  game.state.turn!.phase = "awaken";

  applyStartOfTurn(game, decks);

  assert.equal(game.state.chain?.items.length, 1);
  assert.equal(game.state.chain?.priorityPlayerId, "p1");
  assert.equal(
    game.state.chain?.items[0]?.behaviorEvent?.subjectCardInstanceId,
    "readied-unit",
  );

  let next = game;
  for (const actorPlayerId of ["p1", "p2"] as const) {
    const pass = gameplayActions(next, actorPlayerId, decks).find(
      (action) => action.label === "Pass priority" && action.enabled,
    );
    assert.ok(pass, `Expected ${actorPlayerId} to receive chain priority.`);
    next = performGameplayTransition({
      game: next,
      actorPlayerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `pass-${actorPlayerId}`,
    }).game;
  }

  assert.equal(next.state.chain, null);
  assert.deepEqual(
    next.state.modifiers.map((modifier) => modifier.targetCardInstanceId),
    ["readied-unit"],
  );
  assert.equal(next.state.cardStates["readied-unit"]!.computedMight, 4);
  assert.equal(next.state.cardStates["unchanged-unit"]!.computedMight, 5);
  gameDocumentSchema.parse(next);
});

test("a moved event preserves its origin for source-location trigger routing", () => {
  for (const example of [
    { origin: "source-location", expectedMight: 4 },
    { origin: "other-location", expectedMight: 3 },
  ] as const) {
    const source = card("SYN-MOVE-TRIGGER", "Battlefield");
    source.behaviorModel.clauses = [{
      id: "modify-unit-moved-from-here",
      sequence: 0,
      sourceText: "When a Unit moves from here, give it +1 Might this turn.",
      normalizedText: "When a Unit moves from here, give it +1 Might this turn.",
      abilities: [],
      triggers: [binding("trigger.event", {
        eventType: "unit.moved",
        subject: "any_unit",
      })],
      conditions: [binding("condition.event_origin_source_location")],
      selectors: [],
      choices: [],
      costs: [],
      timings: [],
      effects: [binding("modifier.modify_numeric_value", {
        attribute: "might",
        operation: "increase",
        operand: "constant",
        amount: 1,
        target: "event_subject",
        duration: "thisTurn",
      })],
      keywords: [],
    }];
    const { game, decks } = fixture([
      source,
      card("SYN-OTHER-BATTLEFIELD", "Battlefield"),
      card("SYN-MOVING-UNIT", "Unit", 3),
    ], [
      instance("source", "p1", "SYN-MOVE-TRIGGER", "battlefield"),
      instance("other", "p2", "SYN-OTHER-BATTLEFIELD", "battlefield"),
      instance("moving-unit", "p1", "SYN-MOVING-UNIT", "mainDeck"),
    ]);
    game.state.battlefields = [
      {
        battlefieldId: "source-location",
        cardInstanceId: "source",
        selectedByPlayerId: "p1",
        controllerPlayerId: "p1",
        contestedByPlayerId: null,
        units: example.origin === "source-location" ? ["moving-unit"] : [],
      },
      {
        battlefieldId: "other-location",
        cardInstanceId: "other",
        selectedByPlayerId: "p2",
        controllerPlayerId: "p2",
        contestedByPlayerId: null,
        units: example.origin === "other-location" ? ["moving-unit"] : [],
      },
    ];

    const move = gameplayActions(game, "p1", decks).find(
      (action) =>
        action.sourceCardInstanceId === "moving-unit" &&
        action.label === "Move to Base" &&
        action.enabled,
    );
    assert.ok(move, `Expected a move action for ${example.origin}.`);
    let next = performGameplayTransition({
      game,
      actorPlayerId: "p1",
      actionId: move.id,
      selectedIds: [],
      decks,
      now: `move-${example.origin}`,
    }).game;

    if (example.origin === "source-location") {
      assert.equal(next.state.chain?.items.length, 1);
      assert.equal(next.state.chain?.priorityPlayerId, "p1");
      assert.equal(
        next.state.chain?.items[0]?.behaviorEvent?.values.originBattlefieldId,
        "source-location",
      );
      next = passCurrentChain(next, decks);
    } else {
      assert.equal(next.state.chain, null);
    }

    assert.deepEqual(next.state.players.p1!.zones.base, ["moving-unit"]);
    assert.equal(
      next.state.cardStates["moving-unit"]!.computedMight,
      example.expectedMight,
    );
    assert.deepEqual(next.state.turnHistory.movedCardIdsByPlayerId, {
      p1: ["moving-unit"],
    });
    assert.equal(next.state.modifiers.length, example.expectedMight === 4 ? 1 : 0);
    gameDocumentSchema.parse(next);
  }
});

test("a stun effect emits a typed event that reaches only matching triggers", () => {
  const producer = card("SYN-STUN-PRODUCER", "Gear");
  producer.behaviorModel.clauses = [{
    id: "stun-selected-unit",
    sequence: 0,
    sourceText: "Stun an enemy Unit.",
    normalizedText: "Stun an enemy Unit.",
    abilities: [binding("ability.activate")],
    triggers: [],
    conditions: [],
    selectors: [binding("selector.enemy_unit", {
      minimumCount: 1,
      maximumCount: 1,
      selectionKey: "target",
    })],
    choices: [],
    costs: [],
    timings: [],
    effects: [binding("action.stun_card", {
      target: "enemy_unit",
      selectionKey: "target",
    })],
    keywords: [],
  }];
  const matchingTrigger = typedEventCounter(
    "SYN-STUN-TRIGGER",
    "unit.stunned",
    "enemy_unit",
  );
  const nonmatchingTrigger = typedEventCounter(
    "SYN-DISCARD-TRIGGER",
    "card.discarded",
    "enemy_card",
  );
  const { game, decks } = fixture([
    producer,
    matchingTrigger,
    nonmatchingTrigger,
    card("SYN-STUN-TARGET", "Unit", 4),
  ], [
    instance("producer", "p1", "SYN-STUN-PRODUCER", "mainDeck"),
    instance("matching-trigger", "p1", "SYN-STUN-TRIGGER", "mainDeck"),
    instance("nonmatching-trigger", "p1", "SYN-DISCARD-TRIGGER", "mainDeck"),
    instance("target", "p2", "SYN-STUN-TARGET", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = [
    "producer",
    "matching-trigger",
    "nonmatching-trigger",
  ];
  game.state.players.p2!.zones.base = ["target"];

  const activate = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "producer" && action.enabled,
  );
  assert.ok(activate, "Expected the synthetic stun ability to be available.");
  let next = performGameplayTransition({
    game,
    actorPlayerId: "p1",
    actionId: activate.id,
    selectedIds: ["target"],
    decks,
    now: "activate-stun",
  }).game;
  next = passCurrentChain(next, decks);

  assert.equal(next.state.cardStates.target!.stunned, true);
  assert.equal(next.state.cardStates["matching-trigger"]!.computedMight, 1);
  assert.equal(next.state.cardStates["nonmatching-trigger"]!.computedMight, 0);
  assert.deepEqual(
    next.state.modifiers.map((modifier) => modifier.targetCardInstanceId),
    ["matching-trigger"],
  );
  gameDocumentSchema.parse(next);
});

test("discard and recycle effects route distinct typed card events", () => {
  for (const example of [
    {
      label: "discard",
      eventType: "card.discarded",
      originZone: "hand",
      destinationZone: "trash",
      effect: binding("action.discard_cards", {
        count: 1,
        selectionKey: "target",
      }),
    },
    {
      label: "recycle",
      eventType: "card.recycled",
      originZone: "trash",
      destinationZone: "mainDeck",
      effect: binding("action.recycle_cards", {
        target: "selected_card",
        count: 1,
        selectionKey: "target",
      }),
    },
  ] as const) {
    const producer = card(`SYN-${example.label.toUpperCase()}-PRODUCER`, "Gear");
    producer.behaviorModel.clauses = [{
      id: `produce-${example.label}-event`,
      sequence: 0,
      sourceText: `Move a selected card from ${example.originZone}.`,
      normalizedText: `Move a selected card from ${example.originZone}.`,
      abilities: [binding("ability.activate")],
      triggers: [],
      conditions: [],
      selectors: [binding("selector.card", {
        owner: "controller",
        zone: example.originZone,
        cardType: "any",
        minimumCount: 1,
        maximumCount: 1,
        selectionKey: "target",
      })],
      choices: [],
      costs: [],
      timings: [],
      effects: [example.effect],
      keywords: [],
    }];
    const matchingTrigger = typedEventCounter(
      "SYN-MATCHING-CARD-EVENT",
      example.eventType,
      "friendly_card",
    );
    const otherEventType = example.eventType === "card.discarded"
      ? "card.recycled"
      : "card.discarded";
    const nonmatchingTrigger = typedEventCounter(
      "SYN-NONMATCHING-CARD-EVENT",
      otherEventType,
      "friendly_card",
    );
    const targetCode = `SYN-${example.label.toUpperCase()}-TARGET`;
    const { game, decks } = fixture([
      producer,
      matchingTrigger,
      nonmatchingTrigger,
      card(targetCode, "Spell"),
    ], [
      instance("producer", "p1", producer.cardCode, "mainDeck"),
      instance("matching-trigger", "p1", matchingTrigger.cardCode, "mainDeck"),
      instance("nonmatching-trigger", "p1", nonmatchingTrigger.cardCode, "mainDeck"),
      instance("target", "p1", targetCode, "mainDeck"),
    ]);
    game.state.players.p1!.zones.base = [
      "producer",
      "matching-trigger",
      "nonmatching-trigger",
    ];
    game.state.players.p1!.zones[example.originZone] = ["target"];

    const activate = gameplayActions(game, "p1", decks).find(
      (action) => action.sourceCardInstanceId === "producer" && action.enabled,
    );
    assert.ok(activate, `Expected the synthetic ${example.label} ability.`);
    let next = performGameplayTransition({
      game,
      actorPlayerId: "p1",
      actionId: activate.id,
      selectedIds: ["target"],
      decks,
      now: `activate-${example.label}`,
    }).game;
    next = passCurrentChain(next, decks);

    assert.deepEqual(next.state.players.p1!.zones[example.originZone], []);
    assert.deepEqual(next.state.players.p1!.zones[example.destinationZone], ["target"]);
    assert.deepEqual(
      example.eventType === "card.discarded"
        ? next.state.turnHistory.discardedCardIdsByPlayerId
        : next.state.turnHistory.recycledCardIdsByPlayerId,
      { p1: ["target"] },
    );
    assert.equal(next.state.cardStates["matching-trigger"]!.computedMight, 1);
    assert.equal(next.state.cardStates["nonmatching-trigger"]!.computedMight, 0);
    assert.deepEqual(
      next.state.modifiers.map((modifier) => modifier.targetCardInstanceId),
      ["matching-trigger"],
    );
    gameDocumentSchema.parse(next);
  }
});

test("typed death events satisfy opponent this-turn cost conditions", () => {
  const spell = card("CONDITIONAL_SPELL", "Spell");
  spell.card.attributes.energy = 4;
  spell.behaviorModel.clauses = [{
    id: "opponent-death-discount",
    sequence: 0,
    sourceText: "If an opponent Unit died this turn, this costs 2 less.",
    normalizedText: "If an opponent Unit died this turn, this costs 2 less.",
    abilities: [],
    triggers: [],
    conditions: [binding("condition.turn_event_count", {
      eventType: "died",
      subject: "opponent",
      operator: "greaterThanOrEqual",
      comparisonValue: 1,
    })],
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
  const { game, decks } = fixture([
    spell,
    card("OPPONENT_UNIT", "Unit", 2),
  ], [
    instance("spell", "p1", "CONDITIONAL_SPELL", "mainDeck"),
    instance("opponent-unit", "p2", "OPPONENT_UNIT", "mainDeck"),
  ]);
  game.state.players.p1!.zones.hand = ["spell"];
  game.state.players.p2!.zones.base = ["opponent-unit"];
  game.state.turnHistory = {
    discardedCardIdsByPlayerId: {},
    diedCardIdsByPlayerId: {},
    movedCardIdsByPlayerId: {},
    readiedCardIdsByPlayerId: {},
    recycledCardIdsByPlayerId: {},
  };

  dispatchBehaviorEvent(game, {
    type: "unit.died",
    actorPlayerId: "p1",
    subjectCardInstanceId: "opponent-unit",
    values: {},
  }, decks);

  const index = createRuntimeCardIndex(decks, game);
  assert.deepEqual(game.state.turnHistory.diedCardIdsByPlayerId, {
    p2: ["opponent-unit"],
  });
  assert.equal(effectiveEnergyCost(game, "p1", spell, index), 2);
});

test("an optional targeted effect lets the player choose a target or decline", () => {
  const source = card("SYN-OPTIONAL-SOURCE", "Unit", 2);
  source.behaviorModel.clauses = [{
    id: "optional-followup",
    sequence: 0,
    sourceText: "You may ready another exhausted friendly card.",
    normalizedText: "You may ready another exhausted friendly card.",
    abilities: [],
    triggers: [binding("trigger.event", {
      eventType: "card.played",
      subject: "friendly_card",
    })],
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
      player: "controller",
      target: "friendly_card",
      selectionKey: "target",
      requiresChoiceKey: "useEffect",
    })],
    keywords: [],
  }];
  function scenario() {
    const result = fixture([
      source,
      card("SYN-OPTIONAL-TARGET", "Gear"),
      card("SYN-EVENT-PRODUCER", "Spell"),
    ], [
      instance("source", "p1", "SYN-OPTIONAL-SOURCE", "mainDeck"),
      instance("target", "p1", "SYN-OPTIONAL-TARGET", "mainDeck"),
      instance("event-producer", "p1", "SYN-EVENT-PRODUCER", "mainDeck"),
    ]);
    result.game.state.players.p1!.energy = 1;
    result.game.state.players.p1!.zones.hand = ["event-producer"];
    result.game.state.players.p1!.zones.base = ["source", "target"];
    result.game.state.cardStates.target!.exhausted = true;
    return result;
  }

  function reachChoice() {
    const { game, decks } = scenario();
    const play = gameplayActions(game, "p1", decks).filter(
      (action) =>
        action.sourceCardInstanceId === "event-producer" && action.enabled,
    );
    assert.equal(play.length, 1, "Expected one enabled source play action.");
    let next = performGameplayTransition({
      game,
      actorPlayerId: "p1",
      actionId: play[0]!.id,
      selectedIds: [],
      decks,
      now: "activate",
    }).game;

    for (let passCount = 0; passCount < 8 && !next.state.pendingChoice; passCount += 1) {
      const availablePasses = (["p1", "p2"] as const).flatMap(
        (actorPlayerId) =>
          gameplayActions(next, actorPlayerId, decks)
            .filter((action) => action.label === "Pass priority" && action.enabled)
            .map((action) => ({ action, actorPlayerId })),
      );
      assert.equal(availablePasses.length, 1, "Expected exactly one priority pass.");
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

    assert.equal(
      next.state.pendingChoice?.type,
      "effectSelection",
      JSON.stringify({
        chain: next.state.chain,
        pendingChoice: next.state.pendingChoice,
        target: next.state.cardStates.target,
      }),
    );
    assert.equal(
      next.state.pendingChoice?.type === "effectSelection" &&
        next.state.pendingChoice.allowDecline,
      true,
    );
    assert.deepEqual(
      next.state.pendingChoice?.type === "effectSelection"
        ? next.state.pendingChoice.legalCardIds
        : [],
      ["target"],
    );
    return { game: next, decks };
  }

  for (const example of [
    { label: "accept", selectedIds: ["target"], expectedExhausted: false },
    { label: "decline", selectedIds: [], expectedExhausted: true },
  ]) {
    const { game, decks } = reachChoice();
    const choices = gameplayActions(game, "p1", decks).filter(
      (action) => action.choice?.kind === "effectSelection" && action.enabled,
    );
    assert.equal(choices.length, 1, `Expected one ${example.label} choice action.`);
    const resolved = performGameplayTransition({
      game,
      actorPlayerId: "p1",
      actionId: choices[0]!.id,
      selectedIds: example.selectedIds,
      decks,
      now: example.label,
    }).game;

    assert.equal(resolved.state.cardStates.target!.exhausted, example.expectedExhausted);
    assert.deepEqual(resolved.state.players.p1!.zones.trash, ["event-producer"]);
    assert.equal(resolved.state.pendingChoice, null);
    assert.deepEqual(resolved.state.effectResolutions, []);
    gameDocumentSchema.parse(resolved);
  }
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

test("source-location unit presence counts units at a battlefield source", () => {
  const unitIds = Array.from({ length: 7 }, (_, index) => `unit-${index + 1}`);
  const { game, handlers } = fixture(
    [card("SOURCE", "Battlefield"), card("UNIT", "Unit", 1)],
    [
      instance("source", "p1", "SOURCE", "battlefield"),
      ...unitIds.map((id) => instance(id, "p1", "UNIT", "mainDeck")),
    ],
  );
  game.state.battlefields = [{
    battlefieldId: "source-battlefield",
    cardInstanceId: "source",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    contestedByPlayerId: null,
    units: unitIds,
  }];

  const context = createBehaviorContext(game, "p1", "source", {
    type: "battlefield.held",
    actorPlayerId: "p1",
    subjectCardInstanceId: "source",
    values: {},
  }, []);
  assert.equal(
    handlers.get("condition.unit_presence")!.matches!(
      bindingFor("condition.unit_presence", {
        controller: "controller",
        locationRelation: "sourceLocation",
        minimumCount: 7,
      }),
      context,
    ),
    true,
  );
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

function typedEventCounter(
  cardCode: string,
  eventType: string,
  subject: string,
): GameCardDefinition {
  const definition = card(cardCode, "Unit", 0);
  definition.behaviorModel.clauses = [{
    id: "count-matching-event",
    sequence: 0,
    sourceText: "When the matching event occurs, this gets +1 Might this turn.",
    normalizedText: "When the matching event occurs, this gets +1 Might this turn.",
    abilities: [],
    triggers: [binding("trigger.event", { eventType, subject })],
    conditions: [],
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
      duration: "thisTurn",
    })],
    keywords: [],
  }];
  return definition;
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

function passCurrentChain(
  game: GameDocument,
  decks: DeckSnapshotDocument[],
): GameDocument {
  let next = game;
  for (let passCount = 0; next.state.chain && passCount < 8; passCount += 1) {
    const availablePasses = next.state.setup.playerIds.flatMap(
      (actorPlayerId) =>
        gameplayActions(next, actorPlayerId, decks)
          .filter((action) => action.label === "Pass priority" && action.enabled)
          .map((action) => ({ action, actorPlayerId })),
    );
    assert.equal(availablePasses.length, 1, "Expected exactly one priority pass.");
    const { action, actorPlayerId } = availablePasses[0]!;
    next = performGameplayTransition({
      game: next,
      actorPlayerId,
      actionId: action.id,
      selectedIds: [],
      decks,
      now: `pass-chain-${passCount}`,
    }).game;
  }
  assert.equal(next.state.chain, null, "Expected the chain to resolve.");
  return next;
}
