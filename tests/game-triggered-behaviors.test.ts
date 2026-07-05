import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyHoldScoring, applyStartOfTurn, createRuntimeCardIndex,
  dispatchBehaviorEvent, gameplayActions, performGameplayAction,
  projectGame, victoryRequirement, GAME__RUNTIME_COVERAGE,
  scoreBattlefield, stateChangeEvents,
  type DeckSnapshotDocument, type GameDocument
} from "../src/server/game";

test("orders and resolves event-conditioned play triggers without card identity branches", () => {
  const { game: initial, decks } = fixture();
  let game = initial;
  dispatchBehaviorEvent(game, {
    type: "card.played", actorPlayerId: "p1", subjectCardInstanceId: "spell",
    values: { "eventSubject.effectiveEnergyCost": 5 }
  }, decks);
  assert.equal(game.state.pendingChoice?.type, "orderTriggers");
  if (game.state.pendingChoice?.type !== "orderTriggers") {
    throw new Error("Expected trigger-order choice.");
  }
  assert.equal(game.state.pendingChoice.optionIds.length, 2);
  const choiceProjection = projectGame({ game, viewerPlayerId: "p1", decks });
  assert.equal(choiceProjection.pendingChoice?.type, "orderTriggers");
  if (choiceProjection.pendingChoice?.type !== "orderTriggers") {
    throw new Error("Expected projected trigger-order choice.");
  }
  assert.equal(choiceProjection.pendingChoice.pendingChainItems.length, 2);
  assert.ok(choiceProjection.pendingChoice.pendingChainItems.every((item) => item.card !== null));
  const waitingProjection = projectGame({
    game,
    viewerPlayerId: "p2",
    decks
  });
  assert.equal(waitingProjection.pendingChoice?.type, "orderTriggers");
  if (waitingProjection.pendingChoice?.type !== "orderTriggers") {
    throw new Error("Expected waiting trigger-order projection.");
  }
  assert.equal(waitingProjection.pendingChoice.playerId, "p1");
  assert.deepEqual(waitingProjection.pendingChoice.optionIds, []);
  assert.deepEqual(waitingProjection.pendingChoice.pendingChainItems, []);
  assert.deepEqual(waitingProjection.actions, []);
  const order = gameplayActions(game, "p1", decks)[0]!;
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: order.id, selectedIds: [...game.state.pendingChoice.optionIds].reverse(), decks, now: "b" });
  game = resolveAllChainItems(game, decks);
  assert.equal(game.state.players.p1!.zones.hand.length, 1);
  assert.equal(game.state.cardStates.raven!.computedMight, 2);
});

test("executes synthetic hold and conquer events, delayed readiness, and victory modifiers", () => {
  const { game: initial, decks } = fixture();
  let game = initial;
  dispatchBehaviorEvent(game, {
    type: "battlefield.held", actorPlayerId: "p1", subjectCardInstanceId: "paper", values: {}
  }, decks);
  game = resolveAllChainItems(game, decks);
  assert.equal(game.state.players.p1!.zones.base.length, 4);
  assert.equal(game.state.players.p2!.zones.base.length, 1);

  dispatchBehaviorEvent(game, {
    type: "battlefield.conquered", actorPlayerId: "p1", subjectCardInstanceId: "peak", values: {}
  }, decks);
  game = resolveAllChainItems(game, decks);
  assert.equal(game.state.delayedEffects.length, 1);
  const endTurn = gameplayActions(game, "p1", decks).find((action) => action.label === "End turn")!;
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: endTurn.id, selectedIds: [], decks, now: "z" });
  assert.equal(game.state.chain?.items.at(-1)?.label, "Peak");
  assert.equal(game.state.chain?.items.at(-1)?.controllerPlayerId, "p1");
  assert.equal(game.state.turn?.phase, "end");
  game = resolveTopChainItem(game, decks);
  assert.equal(game.state.pendingChoice?.type, "effectSelection");
  assert.equal(game.state.turn?.activePlayerId, "p1");
  const waitingProjection = projectGame({
    game,
    viewerPlayerId: "p2",
    decks
  });
  assert.equal(waitingProjection.actions.length, 0);
  assert.equal(waitingProjection.pendingChoice?.type, "effectSelection");
  assert.equal(waitingProjection.pendingChoice?.playerId, "p1");
  const ready = gameplayActions(game, "p1", decks)[0]!;
  assert.equal(ready.label, "Choose 2 runes to ready");
  assert.deepEqual(ready.targets[0]?.legalIds, ["rune1", "rune2", "rune3"]);
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: ready.id,
    selectedIds: ["rune2", "rune3"],
    decks,
    now: "zz"
  });
  assert.equal(game.state.cardStates.rune1!.exhausted, true);
  assert.equal(game.state.cardStates.rune2!.exhausted, false);
  assert.equal(game.state.cardStates.rune3!.exhausted, false);
  assert.equal(game.state.turn?.activePlayerId, "p2");
  assert.equal(victoryRequirement(game, decks), 9);
});

test("resolves Beginning Hold triggers before Channel and Draw", () => {
  const { game: initial, decks } = fixture();
  let game = initial;
  const papertree = game.state.battlefields.find(
    (battlefield) => battlefield.cardInstanceId === "paper",
  )!;
  papertree.controllerPlayerId = "p1";
  game.state.turn = {
    turnNumber: 3,
    activePlayerId: "p1",
    phase: "awaken",
  };
  const handBefore = game.state.players.p1!.zones.hand.length;

  applyStartOfTurn(game, decks, createRuntimeCardIndex(decks));

  assert.equal(game.state.turn!.phase, "channel");
  assert.equal(game.state.chain?.items.at(-1)?.label, "Paper");
  assert.deepEqual(game.state.players.p1!.zones.runeDeck, ["rune3"]);
  assert.deepEqual(game.state.players.p2!.zones.runeDeck, ["rune4"]);
  assert.equal(game.state.players.p1!.zones.hand.length, handBefore);

  game = resolveTopChainItem(game, decks);

  assert.equal(game.state.chain, null);
  assert.equal(game.state.turn!.phase, "action");
  assert.ok(game.state.players.p1!.zones.base.includes("rune3"));
  assert.ok(game.state.players.p2!.zones.base.includes("rune4"));
  assert.equal(game.state.cardStates.rune3!.exhausted, true);
  assert.equal(game.state.cardStates.rune4!.exhausted, true);
  assert.equal(game.state.players.p1!.zones.hand.length, handBefore + 1);
});

test("resolves end-of-turn triggers exactly once before advancing", () => {
  const { game, decks } = fixture();
  const dark = card("DARK", "Dark", "Legend", [clause("dark", {
    triggers: [binding("trigger.end_of_turn", 0, { player: "controller" })],
    effects: [binding("action.ready_cards", 1, { player: "controller", target: "runes", count: 2 })],
  })]);
  decks.forEach((deck) => deck.snapshot.cards.push(dark));
  decks[0]!.instances.push(instance("dark", "p1", "DARK"));
  game.state.players.p1!.zones.legend = "dark";
  game.state.cardStates.dark = { exhausted: false, damage: 0, computedMight: null };

  const end = gameplayActions(game, "p1", decks).find(
    (action) => action.label === "End turn",
  )!;
  let next = performGameplayAction({
    game, actorPlayerId: "p1", actionId: end.id, selectedIds: [], decks, now: "end",
  });
  assert.equal(next.state.turn?.phase, "end");
  assert.equal(next.state.turn?.endTriggersQueued, true);
  assert.equal(next.state.chain?.items.at(-1)?.label, "Dark");

  next = resolveTopChainItem(next, decks);
  const ready = gameplayActions(next, "p1", decks)[0]!;
  next = performGameplayAction({
    game: next,
    actorPlayerId: "p1",
    actionId: ready.id,
    selectedIds: ready.targets[0]!.legalIds.slice(0, 2),
    decks,
    now: "ready",
  });
  assert.equal(next.state.turn?.activePlayerId, "p2");
  assert.equal(next.state.chain, null);
});

test("batches normal and delayed end-of-turn triggers before creating a Chain", () => {
  const { game, decks } = fixture();
  const dark = card("DARK", "Dark", "Legend", [clause("dark", {
    triggers: [binding("trigger.end_of_turn", 0, { player: "controller" })],
    effects: [
      binding("action.ready_cards", 1, {
        player: "controller",
        target: "runes",
        count: 2,
      }),
    ],
  })]);
  decks.forEach((deck) => deck.snapshot.cards.push(dark));
  decks[0]!.instances.push(instance("dark", "p1", "DARK"));
  game.state.players.p1!.zones.legend = "dark";
  game.state.cardStates.dark = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };
  game.state.delayedEffects.push({
    id: "peak-at-end",
    point: "endOfThisTurn",
    controllerPlayerId: "p1",
    sourceCardInstanceId: "peak",
    clauseId: "peak",
    selectedIds: [],
  });

  const end = gameplayActions(game, "p1", decks).find(
    (action) => action.label === "End turn",
  )!;
  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: end.id,
    selectedIds: [],
    decks,
    now: "batch-end-triggers",
  });

  assert.equal(next.state.chain, null);
  assert.equal(next.state.pendingChoice?.type, "orderTriggers");
  if (next.state.pendingChoice?.type !== "orderTriggers") {
    throw new Error("Expected one end-of-turn ordering choice.");
  }
  assert.deepEqual(
    next.state.pendingChoice.pendingItems.map((item) => item.label).sort(),
    ["Dark", "Peak"],
  );
});

test("moves trigger private discard before draw", () => {
  const { game, decks } = fixture();
  const merchant = card("MERCHANT", "Merchant", "Unit", [clause("merchant", {
    triggers: [binding("trigger.on_move", 0, { subject: "source" })],
    effects: [
      binding("action.discard_cards", 1, { player: "controller", count: 1 }),
      binding("action.draw_cards", 2, { player: "controller", count: 1 }),
    ],
  })], 2);
  decks.forEach((deck) => deck.snapshot.cards.push(merchant));
  decks[0]!.instances.push(instance("merchant", "p1", "MERCHANT"));
  game.state.players.p1!.zones.base.push("merchant");
  game.state.players.p1!.zones.hand.push("spell");
  game.state.cardStates.merchant = { exhausted: false, damage: 0, computedMight: 2 };
  const handBefore = game.state.players.p1!.zones.hand.length;
  const move = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "merchant" && action.label.startsWith("Move to"),
  )!;
  let next = performGameplayAction({
    game, actorPlayerId: "p1", actionId: move.id, selectedIds: [], decks, now: "move",
  });
  assert.equal(next.state.chain?.items.at(-1)?.label, "Merchant");
  next = resolveTopChainItem(next, decks);
  const discard = gameplayActions(next, "p1", decks)[0]!;
  assert.equal(discard.label, "Choose 1 card to discard");
  assert.equal(discard.targets[0]?.sourceZone, "hand");
  const discardProjection = projectGame({
    game: next,
    viewerPlayerId: "p1",
    decks,
  });
  assert.equal(
    discardProjection.pendingChoice?.type === "effectSelection"
      ? discardProjection.pendingChoice.sourceZone
      : null,
    "hand",
  );
  next = performGameplayAction({
    game: next,
    actorPlayerId: "p1",
    actionId: discard.id,
    selectedIds: [discard.targets[0]!.legalIds[0]!],
    decks,
    now: "discard",
  });
  assert.equal(next.state.players.p1!.zones.hand.length, handBefore);
});

test("resolves move triggers before opening combat with attacker Focus", () => {
  const { game, decks } = fixture();
  const merchant = card("MERCHANT", "Merchant", "Unit", [clause("merchant", {
    triggers: [binding("trigger.on_move", 0, { subject: "source" })],
    effects: [
      binding("action.discard_cards", 1, { player: "controller", count: 1 }),
      binding("action.draw_cards", 2, { player: "controller", count: 1 }),
    ],
  })], 2);
  decks.forEach((deck) => deck.snapshot.cards.push(merchant));
  decks[0]!.instances.push(instance("merchant", "p1", "MERCHANT"));
  decks[1]!.instances.push(instance("defender", "p2", "MERCHANT"));
  game.state.players.p1!.zones.base.push("merchant");
  game.state.players.p1!.zones.hand.push("spell");
  game.state.battlefields[0]!.controllerPlayerId = "p2";
  game.state.battlefields[0]!.units = ["defender"];
  game.state.cardStates.merchant = {
    exhausted: false,
    damage: 0,
    computedMight: 2,
  };
  game.state.cardStates.defender = {
    exhausted: true,
    damage: 0,
    computedMight: 2,
  };
  const move = gameplayActions(game, "p1", decks).find(
    (action) =>
      action.sourceCardInstanceId === "merchant" &&
      action.label === "Move to Paper",
  )!;

  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: move.id,
    selectedIds: [],
    decks,
    now: "move-before-combat",
  });

  assert.equal(next.state.showdown, null);
  assert.equal(next.state.combat, null);
  assert.equal(next.state.chain?.items.at(-1)?.label, "Merchant");

  next = resolveTopChainItem(next, decks);
  const discard = gameplayActions(next, "p1", decks)[0]!;
  next = performGameplayAction({
    game: next,
    actorPlayerId: "p1",
    actionId: discard.id,
    selectedIds: [discard.targets[0]!.legalIds[0]!],
    decks,
    now: "finish-move-trigger",
  });

  assert.equal(next.state.showdown?.kind, "combat");
  assert.equal(next.state.showdown?.focusPlayerId, "p1");
  assert.deepEqual(next.state.showdown?.passedPlayerIds, []);
  assert.equal(next.state.combat?.attackerPlayerId, "p1");
  assert.equal(next.state.combat?.defenderPlayerId, "p2");
});

test("resolves persisted Vision triggers as a private recycle choice", () => {
  const { game, decks } = fixture();
  const vision = card("VISION", "Vision Unit", "Unit", [clause("vision", {
    triggers: [
      binding("trigger.on_play", 0, {
        actor: "controller",
        subject: "card",
      }),
    ],
    effects: [binding("action.vision", 1)],
  })], 2);
  decks.forEach((deck) => deck.snapshot.cards.push(vision));
  decks[0]!.instances.push(instance("vision", "p1", "VISION"));
  game.state.players.p1!.zones.base.push("vision");
  game.state.cardStates.vision = {
    exhausted: true,
    damage: 0,
    computedMight: 2,
  };

  dispatchBehaviorEvent(game, {
    type: "card.played",
    actorPlayerId: "p1",
    subjectCardInstanceId: "vision",
    values: {},
  }, decks);
  let next = resolveTopChainItem(game, decks);
  assert.equal(next.state.pendingChoice?.type, "effectSelection");
  if (next.state.pendingChoice?.type !== "effectSelection") {
    throw new Error("Expected a Vision choice.");
  }
  assert.equal(next.state.pendingChoice.presentation, "vision");
  assert.equal(next.state.pendingChoice.sourceZone, "mainDeck");

  const controllerProjection = projectGame({
    game: next,
    viewerPlayerId: "p1",
    decks,
  });
  const opponentProjection = projectGame({
    game: next,
    viewerPlayerId: "p2",
    decks,
  });
  assert.equal(
    controllerProjection.pendingChoice?.type === "effectSelection"
      ? controllerProjection.pendingChoice.revealedCards[0]?.instanceId
      : null,
    "draw1",
  );
  assert.deepEqual(
    opponentProjection.pendingChoice?.type === "effectSelection"
      ? opponentProjection.pendingChoice.revealedCards
      : null,
    [],
  );

  const keep = gameplayActions(next, "p1", decks)[0]!;
  next = performGameplayAction({
    game: next,
    actorPlayerId: "p1",
    actionId: keep.id,
    selectedIds: [],
    decks,
    now: "keep-vision-card",
  });
  assert.equal(next.state.players.p1!.zones.mainDeck[0], "draw1");
  assert.equal(next.state.pendingChoice, null);
});

test("each conquered Targon's Peak readies two independently chosen runes", () => {
  const { game: initial, decks } = fixture();
  let game = initial;
  const extraInstances = [
    instance("peak2", "p2", "PEAK"),
    instance("rune5", "p1", "RUNE"),
    instance("rune6", "p1", "RUNE")
  ];
  decks[0]!.instances.push(...extraInstances.filter(
    (card) => card.ownerPlayerId === "p1"
  ));
  decks[1]!.instances.push(...extraInstances.filter(
    (card) => card.ownerPlayerId === "p2"
  ));
  game.state.battlefields.push({
    battlefieldId: "peak2",
    cardInstanceId: "peak2",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    contestedByPlayerId: null,
    units: []
  });
  game.state.players.p1!.zones.base.push("rune5", "rune6");
  for (const card of extraInstances) {
    game.state.cardStates[card.instanceId] = {
      exhausted: card.cardCode === "RUNE",
      damage: 0,
      computedMight: null
    };
  }

  for (const peakId of ["peak", "peak2"]) {
    dispatchBehaviorEvent(game, {
      type: "battlefield.conquered",
      actorPlayerId: "p1",
      subjectCardInstanceId: peakId,
      values: {}
    }, decks);
    game = resolveAllChainItems(game, decks);
  }
  assert.equal(game.state.delayedEffects.length, 2);

  const endTurn = gameplayActions(game, "p1", decks).find(
    (action) => action.label === "End turn"
  )!;
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: endTurn.id,
    selectedIds: [],
    decks,
    now: "end"
  });
  assert.equal(game.state.pendingChoice?.type, "orderTriggers");
  const order = gameplayActions(game, "p1", decks)[0]!;
  if (game.state.pendingChoice?.type !== "orderTriggers") {
    throw new Error("Expected trigger-order choice.");
  }
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: order.id,
    selectedIds: [...game.state.pendingChoice.optionIds].reverse(),
    decks,
    now: "order"
  });
  assert.equal(game.state.chain?.items.length, 2);
  assert.ok(game.state.chain?.items.every(
    (item) => item.controllerPlayerId === "p1"
  ));
  game = resolveTopChainItem(game, decks);

  const firstReady = gameplayActions(game, "p1", decks)[0]!;
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: firstReady.id,
    selectedIds: ["rune1", "rune2"],
    decks,
    now: "ready-1"
  });
  assert.equal(game.state.pendingChoice, null);
  assert.equal(game.state.chain?.items.length, 1);
  assert.equal(game.state.turn?.activePlayerId, "p1");

  game = resolveTopChainItem(game, decks);
  assert.equal(game.state.pendingChoice?.type, "effectSelection");
  const secondReady = gameplayActions(game, "p1", decks)[0]!;
  assert.deepEqual(secondReady.targets[0]?.legalIds, ["rune5", "rune6"]);
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: secondReady.id,
    selectedIds: ["rune5", "rune6"],
    decks,
    now: "ready-2"
  });

  for (const runeId of ["rune1", "rune2", "rune5", "rune6"]) {
    assert.equal(game.state.cardStates[runeId]!.exhausted, false);
  }
  assert.equal(game.state.delayedEffects.length, 0);
  assert.equal(game.state.pendingChoice, null);
  assert.equal(game.state.turn?.activePlayerId, "p2");
});

test("classifies every initial runtime primitive without planned placeholders", () => {
  assert.ok(Object.values(GAME__RUNTIME_COVERAGE).every((status) => status === "executable" || status === "deferred"));
  assert.equal(GAME__RUNTIME_COVERAGE["keyword.assault"], "executable");
  assert.equal(GAME__RUNTIME_COVERAGE["keyword.shield"], "executable");
  assert.equal(GAME__RUNTIME_COVERAGE["keyword.tank"], "executable");
});

test("completes victory through Hold and emits one winner transition", () => {
  const { game, decks } = fixture();
  game.state.battlefields = game.state.battlefields.filter(
    (battlefield) => battlefield.cardInstanceId !== "climb",
  );
  game.state.battlefields[0]!.controllerPlayerId = "p1";
  game.state.players.p1!.points = 7;
  const before = structuredClone(game);

  applyHoldScoring(game, "p1", decks);

  assert.equal(game.state.players.p1!.points, 8);
  assert.equal(game.winnerPlayerId, "p1");
  assert.equal(game.status, "complete");
  assert.equal(gameplayActions(game, "p1", decks).length, 0);
  assert.deepEqual(
    stateChangeEvents(before, game).map((event) => event.type),
    ["player.scored", "game.won"],
  );
});

test("requires every battlefield for a final-point Conquer", () => {
  const { game, decks } = fixture();
  game.state.battlefields = game.state.battlefields.filter(
    (battlefield) => battlefield.cardInstanceId !== "climb",
  );
  game.state.players.p1!.points = 7;
  const handBefore = game.state.players.p1!.zones.hand.length;

  scoreBattlefield(game, "p1", "paper", "conquer", decks);

  assert.equal(game.state.players.p1!.points, 7);
  assert.equal(game.state.players.p1!.zones.hand.length, handBefore + 1);
  assert.equal(game.winnerPlayerId, null);
});

test("combines active Victory Score modifiers without card identity logic", () => {
  const { game, decks } = fixture();
  const secondClimb = instance("climb2", "p2", "CLIMB");
  decks[1]!.instances.push(secondClimb);
  game.state.cardStates.climb2 = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };
  game.state.battlefields.push({
    battlefieldId: "climb2",
    cardInstanceId: "climb2",
    selectedByPlayerId: "p2",
    units: [],
  });

  assert.equal(victoryRequirement(game, decks), 10);
});

function resolveAllChainItems(game: GameDocument, decks: DeckSnapshotDocument[]) {
  let current = game;
  while (current.state.chain) {
    for (let count = 0; count < 2 && current.state.chain; count += 1) {
      const actor = current.state.chain.priorityPlayerId;
      const pass = gameplayActions(current, actor, decks).find((action) => action.label === "Pass priority")!;
      current = performGameplayAction({ game: current, actorPlayerId: actor, actionId: pass.id, selectedIds: [], decks, now: "r" });
    }
  }
  return current;
}

function resolveTopChainItem(
  initial: GameDocument,
  decks: DeckSnapshotDocument[]
) {
  let game = initial;
  const itemCount = game.state.chain?.items.length;
  if (!itemCount) throw new Error("Expected a chain item.");
  while (game.state.chain?.items.length === itemCount) {
    const actor = game.state.chain.priorityPlayerId;
    const pass = gameplayActions(game, actor, decks).find(
      (action) => action.label === "Pass priority"
    )!;
    game = performGameplayAction({
      game,
      actorPlayerId: actor,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: "resolve-delayed"
    });
  }
  return game;
}

function fixture(): { game: GameDocument; decks: DeckSnapshotDocument[] } {
  const definitions = [
    card("LADY", "Lady", "Legend", [clause("lady", {
      triggers: [binding("trigger.on_play", 0, { actor: "controller", subject: "spell" })],
      conditions: [binding("condition.compare_numeric_value", 2, { valueSource: "eventSubject.effectiveEnergyCost", operator: "greaterThanOrEqual", comparisonValue: 5 })],
      effects: [binding("action.draw_cards", 1, { player: "controller", count: 1 })]
    })]),
    card("RAVEN", "Raven", "Unit", [clause("raven", {
      triggers: [binding("trigger.on_play", 0, { actor: "controller", subject: "spell" })],
      effects: [binding("modifier.modify_numeric_value", 1, { attribute: "might", operation: "increase", operand: "constant", amount: 1, target: "source", duration: "thisTurn" })]
    })], 1),
    card("PAPER", "Paper", "Battlefield", [clause("paper", {
      triggers: [binding("trigger.hold_battlefield", 0)],
      effects: [binding("action.channel_runes", 1, { player: "eachPlayer", count: 1, entryState: "exhausted" })]
    })]),
    card("PEAK", "Peak", "Battlefield", [clause("peak", {
      triggers: [binding("trigger.conquer_battlefield", 1)], timings: [binding("timing.delayed", 0, { point: "endOfThisTurn" })],
      effects: [binding("action.ready_cards", 2, { player: "controller", target: "runes", count: 2 })]
    })]),
    card("CLIMB", "Climb", "Battlefield", [clause("climb", {
      effects: [binding("modifier.modify_numeric_value", 0, { attribute: "victoryRequirement", operation: "increase", operand: "constant", amount: 1, target: "game", duration: "whileSourceOnBoard" })]
    })]),
    card("SPELL", "Spell", "Spell", []), card("RUNE", "Rune", "Rune", [])
  ];
  const instances = [
    instance("lady", "p1", "LADY"), instance("raven", "p1", "RAVEN"),
    instance("paper", "p1", "PAPER"), instance("peak", "p1", "PEAK"), instance("climb", "p1", "CLIMB"),
    instance("spell", "p1", "SPELL"), instance("rune1", "p1", "RUNE"), instance("rune2", "p1", "RUNE"),
    instance("draw1", "p1", "SPELL"), instance("rune3", "p1", "RUNE"), instance("rune4", "p2", "RUNE")
  ];
  const snapshot = { sourceText: "", catalogDigest: "x", entries: [], cards: definitions };
  const decks = [
    { id: "d1", createdAt: "a", updatedAt: "a", matchId: "m", playerId: "p1", snapshot, instances: instances.filter((item) => item.ownerPlayerId === "p1") },
    { id: "d2", createdAt: "a", updatedAt: "a", matchId: "m", playerId: "p2", snapshot, instances: instances.filter((item) => item.ownerPlayerId === "p2") }
  ];
  const zones = (id: string) => ({ legend: id === "p1" ? "lady" : null, champion: null, mainDeck: id === "p1" ? ["draw1"] : [], runeDeck: id === "p1" ? ["rune3"] : ["rune4"], hand: [], trash: [], banishment: [], base: id === "p1" ? ["raven", "rune1", "rune2"] : [] });
  const states = Object.fromEntries(instances.map((item) => [item.instanceId, { exhausted: item.instanceId.startsWith("rune"), damage: 0, computedMight: item.instanceId === "raven" ? 1 : null }]));
  const game: GameDocument = {
    id: "g", matchId: "m", createdAt: "a", updatedAt: "a", stateVersion: 1, status: "in_progress", winnerPlayerId: null,
    state: {
      setup: { playerIds: ["p1", "p2"], startingPlayerChooserId: "p1", startingPlayerId: "p1", battlefieldPools: {}, battlefieldChoices: {}, mulligans: {} },
      players: { p1: { playerId: "p1", energy: 0, conditionalEnergy: 0, power: {}, zones: zones("p1") }, p2: { playerId: "p2", energy: 0, conditionalEnergy: 0, power: {}, zones: zones("p2") } },
      battlefields: ["paper", "peak", "climb"].map((id) => ({ battlefieldId: id, cardInstanceId: id, selectedByPlayerId: "p1", units: [] })),
      cardStates: states, turn: { turnNumber: 1, activePlayerId: "p1", phase: "action" }, chain: null, showdown: null, combat: null, modifiers: [], delayedEffects: [], effectResolutions: [], pendingChoice: null, queuedTriggerChoices: []
    }
  };
  return { game, decks };
}

function binding(behaviorId: string, order: number, parameters: Record<string, string | number> = {}) { return { behaviorId, order, parameters, confidence: "high" as const }; }
function clause(id: string, groups: Partial<Record<"triggers" | "conditions" | "timings" | "effects", ReturnType<typeof binding>[]>>) {
  return { id, sequence: 0, sourceText: "", normalizedText: "", abilities: [], triggers: groups.triggers ?? [], conditions: groups.conditions ?? [], selectors: [], choices: [], costs: [], timings: groups.timings ?? [], effects: groups.effects ?? [], keywords: [] };
}
function card(code: string, name: string, type: "Legend" | "Unit" | "Battlefield" | "Spell" | "Rune", clauses: ReturnType<typeof clause>[], might: number | null = null) {
  return { cardCode: code, sourceTextHash: "h", behaviorModel: { playTimings: [], clauses }, card: { id: code, name, public_code: `${code}/1`, attributes: { energy: 0, might, power: 0 }, classification: { type, supertype: type === "Rune" ? "Basic" as const : null, domain: ["Mind"] }, text: { plain: "" }, set: { set_id: "T", label: "Test" }, media: {}, tags: [], metadata: {} } };
}
function instance(instanceId: string, ownerPlayerId: string, cardCode: string) { return { instanceId, ownerPlayerId, source: "mainDeck" as const, cardCode }; }
