import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GAME__RUNTIME_COVERAGE,
  createBehaviorContext,
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  gameplayActions,
  performGameplayAction,
  applyStartOfTurn,
  dispatchBehaviorEvent,
  effectiveEnergyCost,
  type BehaviorEvent,
  type BehaviorBinding,
  type GameCardDefinition,
  type GameDocument,
} from "../src/server/game";
import type { DeckSnapshotDocument } from "../src/server/game/repositories";
import type { CardInstance } from "../src/server/game/state";
import {
  beginEffectResolution,
  submitEffectSelection,
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

test("a Legion activated ability makes the next Unit enter ready", () => {
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
    card("UNIT", "Unit", 2),
  ], [
    instance("source", "p1", "SOURCE", "mainDeck"),
    instance("unit", "p1", "UNIT", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source"];
  game.state.players.p1!.zones.hand = ["unit"];
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
    (action) => action.sourceCardInstanceId === "unit" && action.enabled,
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

  assert.equal(next.state.cardStates.unit!.exhausted, false);
});

test("Awakening emits a ready event for each exhausted controlled card", () => {
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
    card("EXHAUSTED_UNIT", "Unit", 2),
    card("READY_UNIT", "Unit", 2),
    card("EXHAUSTED_RUNE", "Rune"),
  ], [
    instance("trigger", "p1", "TRIGGER", "mainDeck"),
    instance("exhausted-unit", "p1", "EXHAUSTED_UNIT", "mainDeck"),
    instance("ready-unit", "p1", "READY_UNIT", "mainDeck"),
    instance("exhausted-rune", "p1", "EXHAUSTED_RUNE", "runeDeck"),
  ]);
  game.state.players.p1!.zones.base = [
    "trigger",
    "exhausted-unit",
    "ready-unit",
    "exhausted-rune",
  ];
  game.state.cardStates["exhausted-unit"]!.exhausted = true;
  game.state.cardStates["exhausted-rune"]!.exhausted = true;
  game.state.turn!.phase = "awaken";

  applyStartOfTurn(game, decks);

  assert.equal(game.state.cardStates["exhausted-unit"]!.exhausted, false);
  assert.equal(game.state.turn!.phase, "beginning");
  assert.equal(game.state.chain?.items.length, 1);
  assert.deepEqual(game.state.chain?.items[0]?.behaviorEvent, {
    type: "card.readied",
    actorPlayerId: "p1",
    subjectCardInstanceId: "exhausted-unit",
    values: {},
  });
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
  const source = card("SOURCE", "Unit", 2);
  source.behaviorModel.clauses = [{
    id: "optional-followup",
    sequence: 0,
    sourceText: "You may ready another exhausted friendly card.",
    normalizedText: "You may ready another exhausted friendly card.",
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
      player: "controller",
      target: "friendly_card",
      selectionKey: "target",
      requiresChoiceKey: "useEffect",
    })],
    keywords: [],
  }];
  const { game, decks } = fixture([
    source,
    card("EXHAUSTED_GEAR", "Gear"),
  ], [
    instance("source", "p1", "SOURCE", "mainDeck"),
    instance("exhausted-gear", "p1", "EXHAUSTED_GEAR", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source", "exhausted-gear"];
  game.state.cardStates["exhausted-gear"]!.exhausted = true;

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "optional-followup",
    decks,
  }), false);
  assert.equal(game.state.pendingChoice?.type, "effectSelection");
  assert.equal(
    game.state.pendingChoice?.type === "effectSelection" &&
      game.state.pendingChoice.allowDecline,
    true,
  );
  assert.deepEqual(
    game.state.pendingChoice?.type === "effectSelection"
      ? game.state.pendingChoice.legalCardIds
      : [],
    ["exhausted-gear"],
  );

  assert.equal(submitEffectSelection(game, "p1", ["exhausted-gear"], decks), true);
  assert.equal(game.state.cardStates["exhausted-gear"]!.exhausted, false);

  game.state.cardStates["exhausted-gear"]!.exhausted = true;
  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "optional-followup",
    decks,
  }), false);
  assert.equal(game.state.pendingChoice?.type, "effectSelection");
  const declineAction = gameplayActions(game, "p1", decks).find(
    (action) => action.choice?.kind === "effectSelection",
  );
  assert.ok(declineAction);
  const declined = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: declineAction.id,
    selectedIds: [],
    decks,
    now: "decline-optional-target",
  });
  assert.equal(declined.state.cardStates["exhausted-gear"]!.exhausted, true);
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
  const game = {
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
  } as unknown as GameDocument;
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
