import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  BehaviorBinding,
  BehaviorClause,
  DeckSnapshotDocument,
} from "../src/server/game";
import {
  createBehaviorContext,
  effectiveEnergyCost,
  applyHoldScoring,
  dispatchBehaviorEvent,
  gameplayActions,
  performGameplayAction,
  projectGame,
  scoreBattlefield,
  type GameDocument,
} from "../src/server/game";
import type { GameCardDefinition } from "../src/server/game/schemas";
import { cleanupBoard } from "../src/server/game/board-rules";
import { beginEffectResolution } from "../src/server/game/effect-resolution";
import {
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  moveUnitToTrash,
  recomputeMight,
} from "../src/server/game/primitive-handlers";

test("generates and validates generic turn, resource, movement, and priority actions", () => {
  const { game: initial, decks } = fixture();
  let game = initial;
  assert.equal(gameplayActions(game, "p1", decks).some((action) => action.label === "Draw a card" || action.label === "Channel a rune"), false);

  const rune = gameplayActions(game, "p1", decks).find((action) => action.label === "Add Energy")!;
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: rune.id, selectedIds: [], decks, now: "c" });
  assert.equal(game.state.players.p1?.energy, 1);

  const move = gameplayActions(game, "p1", decks).find((action) => action.label.startsWith("Move to"))!;
  assert.deepEqual(move.presentation.boardLocation, {
    kind: "battlefield",
    battlefieldId: game.state.battlefields[0]!.battlefieldId,
  });
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: move.id, selectedIds: [], decks, now: "d" });
  assert.ok(game.state.showdown);
  assert.equal(game.state.battlefields[0]!.contestedByPlayerId, "p1");
  assert.throws(() => performGameplayAction({ game, actorPlayerId: "p1", actionId: move.id, selectedIds: [], decks, now: "e" }), /not legal/);
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(game, playerId, decks).find(
      (candidate) => candidate.label === "Pass focus"
    )!;
    game = performGameplayAction({
      game,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: "f"
    });
  }
  assert.equal(game.state.showdown, null);
  assert.equal(game.state.battlefields[0]!.controllerPlayerId, "p1");
  assert.equal(game.state.battlefields[0]!.contestedByPlayerId, null);
  assert.equal(game.state.players.p1!.points, 1);
});

test("triggered abilities of permanents are inactive in the chosen-champion zone", () => {
  const { game, decks } = fixture();
  const source = definition("ZONE_SOURCE", "Zone Source", "Unit", 0, 1) as GameCardDefinition;
  source.behaviorModel.clauses.push(clause("on-play", {
    triggers: [binding("trigger.on_play", 0, { actor: "controller", subject: "spell" })],
  }));
  decks[0]!.snapshot.cards.push(source);
  decks[0]!.instances.push({
    instanceId: "p1:zone-source",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "ZONE_SOURCE",
  });
  game.state.players.p1!.zones.champion = "p1:zone-source";
  game.state.cardStates["p1:zone-source"] = {
    exhausted: false,
    damage: 0,
    computedMight: 1,
  };

  const event = {
    type: "card.played" as const,
    actorPlayerId: "p1",
    subjectCardInstanceId: "p1:spell",
    values: {},
  };
  dispatchBehaviorEvent(game, event, decks);
  assert.equal(game.state.chain, null);

  game.state.players.p1!.zones.champion = null;
  game.state.players.p1!.zones.base.push("p1:zone-source");
  dispatchBehaviorEvent(game, event, decks);
  const boardTriggerChain = game.state.chain as NonNullable<GameDocument["state"]["chain"]> | null;
  assert.equal(boardTriggerChain?.items.length, 1);
  assert.equal(boardTriggerChain?.items[0]?.sourceCardInstanceId, "p1:zone-source");
});

test("stored death triggers retain their effect controller after the source leaves play", () => {
  const { game, decks } = fixture();
  const delayedSource = definition("DELAYED_SOURCE", "Delayed Source", "Gear", 0, 0) as GameCardDefinition;
  delayedSource.behaviorModel.clauses = [clause("stored-death", {
    triggers: [binding("trigger.stored_target_death", 0, {})],
    effects: [binding("action.play_token", 1, {
      tokenName: "Recruit",
      count: 1,
      placement: "base",
    })],
  })];
  const target = definition("TARGET_UNIT", "Target Unit", "Unit", 0, 1) as GameCardDefinition;
  decks[1]!.snapshot.cards.push(delayedSource);
  decks[0]!.snapshot.cards.push(target);
  decks[1]!.instances.push({ instanceId: "p2:source", ownerPlayerId: "p2", source: "mainDeck", cardCode: "DELAYED_SOURCE" });
  decks[0]!.instances.push({ instanceId: "p1:target", ownerPlayerId: "p1", source: "mainDeck", cardCode: "TARGET_UNIT" });
  game.state.players.p2!.zones.trash.push("p2:source");
  game.state.players.p1!.zones.base.push("p1:target");
  game.state.cardStates["p2:source"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.cardStates["p1:target"] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.ongoingEffects.push({
    id: "ongoing:stored-death",
    behaviorId: "action.play_token_on_next_death",
    controllerPlayerId: "p2",
    sourceCardInstanceId: "p2:source",
    targetCardInstanceIds: ["p1:target"],
    parameters: { tokenName: "Recruit" },
    duration: "thisTurn",
    createdAtTurn: 1,
  });

  moveUnitToTrash(game, "p1:target", createRuntimeCardIndex(decks, game));
  assert.equal(game.state.chain?.items[0]?.controllerPlayerId, "p2");
  assert.equal(game.state.ongoingEffects.some((effect) => effect.id === "ongoing:stored-death"), false);
  let next = game;
  for (const playerId of [next.state.chain!.priorityPlayerId, next.state.chain!.priorityPlayerId === "p1" ? "p2" : "p1"] as const) {
    const pass = gameplayActions(next, playerId, decks).find((action) => action.label === "Pass priority")!;
    next = performGameplayAction({ game: next, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks, now: `stored-death-${playerId}` });
  }
  assert.ok(next.state.createdCardInstances?.some((instance) => instance.ownerPlayerId === "p2"));
  assert.equal(next.state.players.p2!.zones.base.some((id) => next.state.createdCardInstances?.some((instance) => instance.instanceId === id)), true);
});

test("activated action labels describe a selected gear action", () => {
  const { game, decks } = fixture();
  const source = definition("ACTION_SOURCE", "Action Source", "Gear", 0, 0) as GameCardDefinition;
  source.behaviorModel.clauses.push(clause("ready-gear", {
    abilities: [binding("ability.activated_effect", 0, {})],
    selectors: [binding("selector.gear", 1, {
      controller: "controller",
      minimumCount: 1,
      maximumCount: 1,
      selectionKey: "gear",
    })],
    effects: [binding("action.ready_cards", 2, {
      player: "controller",
      target: "card",
      selectionKey: "gear",
      count: 1,
    })],
  }));
  decks[0]!.snapshot.cards.push(source, definition("TARGET_GEAR", "Target Gear", "Gear", 0, 0));
  decks[0]!.instances.push(
    { instanceId: "p1:action-source", ownerPlayerId: "p1", source: "mainDeck", cardCode: "ACTION_SOURCE" },
    { instanceId: "p1:target-gear", ownerPlayerId: "p1", source: "mainDeck", cardCode: "TARGET_GEAR" },
  );
  game.state.players.p1!.zones.base.push("p1:action-source", "p1:target-gear");
  game.state.cardStates["p1:action-source"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.cardStates["p1:target-gear"] = { exhausted: true, damage: 0, computedMight: null };

  const actions = gameplayActions(game, "p1", decks).filter(
    (action) => action.sourceCardInstanceId === "p1:action-source",
  );
  assert.equal(actions.length, 1);
  assert.equal(actions[0]?.label, "Ready a Gear");
});

test.skip("plays a spell through priority resolution and advances the turn", () => {
  const { game: initial, decks } = fixture();
  let game = initial;
  const play = gameplayActions(game, "p1", decks).find((action) => action.label === "Play Spell")!;
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "b" });
  assert.equal(game.state.chain?.items.length, 1);
  assert.equal(game.state.chain?.priorityPlayerId, "p1");
  game.state.chain!.passedPlayerIds = ["p2"];
  const addEnergy = gameplayActions(game, "p1", decks).find(
    (action) =>
      action.sourceCardInstanceId === "p1:rune" &&
      action.label === "Add Energy"
  );
  assert.ok(addEnergy, "feature override must expose Add abilities during Priority");
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: addEnergy.id,
    selectedIds: [],
    decks,
    now: "bb"
  });
  assert.equal(game.state.players.p1!.energy, 1);
  assert.equal(game.state.cardStates["p1:rune"]!.exhausted, true);
  assert.equal(game.state.chain?.items.length, 1);
  assert.equal(game.state.chain?.priorityPlayerId, "p1");
  assert.deepEqual(game.state.chain?.passedPlayerIds, []);
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(game, playerId, decks)[0]!;
    game = performGameplayAction({ game, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks, now: "c" });
  }
  assert.equal(game.state.chain, null);
  assert.ok(game.state.players.p1?.zones.trash.includes("p1:spell"));
  const end = gameplayActions(game, "p1", decks).find((action) => action.label === "End turn")!;
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: end.id, selectedIds: [], decks, now: "d" });
  assert.equal(game.state.turn?.activePlayerId, "p2");
});

test("awakening readies only the new turn player's battlefield units", () => {
  const { game: initial, decks } = fixture();
  const game = structuredClone(initial);
  decks[1]!.instances.push({
    instanceId: "p2:unit",
    ownerPlayerId: "p2",
    source: "mainDeck",
    cardCode: "UNIT"
  });
  game.state.battlefields[0]!.units = ["p1:mover", "p2:unit"];
  game.state.players.p1!.zones.base =
    game.state.players.p1!.zones.base.filter((id) => id !== "p1:mover");
  game.state.cardStates["p1:mover"]!.exhausted = true;
  game.state.cardStates["p2:unit"] = {
    exhausted: true,
    damage: 0,
    computedMight: 1
  };

  const end = gameplayActions(game, "p1", decks).find(
    (action) => action.label === "End turn"
  )!;
  const nextTurn = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: end.id,
    selectedIds: [],
    decks,
    now: "d"
  });

  assert.equal(nextTurn.state.turn?.activePlayerId, "p2");
  assert.equal(nextTurn.state.cardStates["p2:unit"]!.exhausted, false);
  assert.equal(nextTurn.state.cardStates["p1:mover"]!.exhausted, true);
});

test("resolves generic optional effect choices through the canonical pending-decision contract", () => {
  const { game, decks } = fixture();
  const battlefield = decks[0]!.snapshot.cards.find(
    (card) => card.cardCode === "BF",
  )!;
  battlefield.behaviorModel.clauses = [
    clause("optional", {
      effects: [
        binding("action.optional", 0, {
          effectKey: "ready-source",
          prompt: "Ready this card?",
        }),
        binding("action.ready_cards", 1, {
          player: "controller",
          target: "source",
        }),
      ],
    }),
  ];
  game.state.cardStates["p1:bf"]!.exhausted = true;

  assert.equal(
    beginEffectResolution({
      game,
      controllerPlayerId: "p1",
      sourceCardInstanceId: "p1:bf",
      clauseId: "optional",
      decks,
    }),
    false,
  );
  assert.equal(game.state.pendingChoice?.type, "effectOption");
  const ownerProjection = projectGame({ game, viewerPlayerId: "p1", decks });
  const opponentProjection = projectGame({ game, viewerPlayerId: "p2", decks });
  assert.equal(ownerProjection.pendingChoice?.type, "effectOption");
  assert.deepEqual(
    ownerProjection.pendingChoice?.type === "effectOption"
      ? ownerProjection.pendingChoice.options.map((option) => option.id)
      : [],
    ["yes", "no"],
  );
  assert.deepEqual(
    opponentProjection.pendingChoice?.type === "effectOption"
      ? opponentProjection.pendingChoice.options
      : [],
    [],
  );
  const submit = gameplayActions(game, "p1", decks).find(
    (action) => action.choice?.kind === "effectOption",
  )!;
  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: submit.id,
    selectedIds: ["yes"],
    decks,
    now: "effect-option",
  });
  assert.equal(next.state.pendingChoice, null);
  assert.equal(next.state.cardStates["p1:bf"]!.exhausted, false);
});

test("mandatory recycling chooses eligible board cards during effect resolution", () => {
  const { game, decks } = fixture();
  const source = definition("SOURCE", "Source", "Gear", 0, 0) as GameCardDefinition;
  source.behaviorModel.clauses.push(clause("recycle-effect", {
    triggers: [binding("trigger.on_play", 0, { actor: "controller", subject: "source" })],
    effects: [binding("action.recycle_cards", 1, {
      target: "card",
      selectFromZone: "base",
      owner: "controller",
      cardType: "Rune",
      minimumCount: 1,
      maximumCount: 1,
      count: 1,
      prompt: "Choose a Rune to recycle",
    })],
  }));
  decks[0]!.snapshot.cards.push(source);
  decks[0]!.instances.push({
    instanceId: "p1:source",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "SOURCE",
  });
  game.state.players.p1!.zones.base.push("p1:source");
  game.state.cardStates["p1:source"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };

  dispatchBehaviorEvent(game, {
    type: "card.played",
    actorPlayerId: "p1",
    subjectCardInstanceId: "p1:source",
    values: {},
  }, decks);

  assert.equal(game.state.pendingChoice, null);
  assert.deepEqual(game.state.chain?.items.at(-1)?.targetCardInstanceIds, []);
  assert.ok(game.state.chain?.items.at(-1));

  const recycleRuneForPower = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:rune" && action.label.startsWith("Add Power"),
  );
  assert.ok(recycleRuneForPower);
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: recycleRuneForPower.id,
    selectedIds: [],
    decks,
    now: "use-rune-before-resolution",
  });
  assert.ok(next.state.players.p1!.zones.runeDeck.includes("p1:rune"));

  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(next, playerId, decks).find(
      (action) => action.label === "Pass priority",
    );
    assert.ok(pass);
    next = performGameplayAction({
      game: next,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `resolve-recycle-${playerId}`,
    });
  }
  assert.equal(next.state.pendingChoice?.type, "effectSelection");
  assert.deepEqual(next.state.pendingChoice?.legalCardIds, ["p1:rune-b"]);
  assert.equal(next.state.pendingChoice?.sourceZone, "base");

  const chooseRune = gameplayActions(next, "p1", decks).find(
    (action) => action.choice?.kind === "effectSelection",
  );
  assert.ok(chooseRune);
  next = performGameplayAction({
    game: next,
    actorPlayerId: "p1",
    actionId: chooseRune.id,
    selectedIds: ["p1:rune-b"],
    decks,
    now: "choose-rune-on-resolution",
  });
  assert.ok(next.state.players.p1!.zones.runeDeck.includes("p1:rune-b"));
  assert.equal(next.state.pendingChoice, null);

  dispatchBehaviorEvent(next, {
    type: "card.played",
    actorPlayerId: "p1",
    subjectCardInstanceId: "p1:source",
    values: {},
  }, decks);
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(next, playerId, decks).find(
      (action) => action.label === "Pass priority",
    );
    assert.ok(pass);
    next = performGameplayAction({
      game: next,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `resolve-empty-recycle-${playerId}`,
    });
  }
  assert.equal(next.state.pendingChoice, null);
  assert.equal(next.state.chain, null);
});

test("replaces a non-final Conquer point with a draw, then awards the final point", () => {
  const { game, decks } = fixture();
  decks[0]!.instances.push({
    instanceId: "p1:bf-two",
    ownerPlayerId: "p1",
    source: "battlefield",
    cardCode: "BF",
  });
  game.state.cardStates["p1:bf-two"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };
  game.state.battlefields.push({
    battlefieldId: "p1:bf-two",
    cardInstanceId: "p1:bf-two",
    selectedByPlayerId: "p1",
    units: [],
  });
  game.state.players.p1!.points = 7;
  const handBefore = game.state.players.p1!.zones.hand.length;

  scoreBattlefield(game, "p1", "p1:bf", "conquer", decks);
  assert.equal(game.state.players.p1!.points, 7);
  assert.equal(game.state.players.p1!.zones.hand.length, handBefore + 1);

  scoreBattlefield(game, "p1", "p1:bf-two", "conquer", decks);
  assert.equal(game.state.players.p1!.points, 8);
  assert.equal(game.winnerPlayerId, "p1");
  assert.equal(game.status, "complete");
});

test("awards the final point through Hold and does not score a battlefield twice", () => {
  const { game, decks } = fixture();
  game.state.battlefields[0]!.controllerPlayerId = "p1";
  game.state.players.p1!.points = 7;

  applyHoldScoring(game, "p1", decks);
  assert.equal(game.state.players.p1!.points, 8);
  assert.equal(game.winnerPlayerId, "p1");

  const repeated = fixture();
  scoreBattlefield(repeated.game, "p1", "p1:bf", "conquer", repeated.decks);
  scoreBattlefield(repeated.game, "p1", "p1:bf", "conquer", repeated.decks);
  assert.equal(repeated.game.state.players.p1!.points, 1);
});

test("finalizes a spell's selected unit and legal move destination before it enters the Chain", () => {
  const { game: initial, decks } = fixture();
  let game = structuredClone(initial);
  const spell = decks[0]!.snapshot.cards.find((card) => card.cardCode === "SPELL")!;
  spell.behaviorModel.playTimings = [binding("timing.action", 0, {})];
  spell.behaviorModel.clauses = [
    clause("move", {
      selectors: [
        binding("selector.enemy_unit", 0, {
          area: "board",
          locationRelation: "any",
          minimumCount: 1,
          maximumCount: 1,
          selectionKey: "unit",
        }),
        binding("selector.move_destination", 1, {
          unitSelectionKey: "unit",
          minimumCount: 1,
          maximumCount: 1,
          selectionKey: "destination",
        }),
      ],
      effects: [
        binding("action.move_unit", 0, {
          selectionKey: "unit",
          destinationSelectionKey: "destination",
        }),
      ],
    }),
  ];
  decks[1]!.snapshot.cards = decks[0]!.snapshot.cards;
  decks[1]!.instances.push(
    {
      instanceId: "p2:unit",
      ownerPlayerId: "p2",
      source: "mainDeck",
      cardCode: "UNIT",
    },
    {
      instanceId: "p2:bf",
      ownerPlayerId: "p2",
      source: "battlefield",
      cardCode: "BF",
    },
  );
  game.state.battlefields[0]!.units.push("p2:unit");
  game.state.battlefields.push({
    battlefieldId: "p2:bf",
    cardInstanceId: "p2:bf",
    selectedByPlayerId: "p2",
    units: [],
  });
  game.state.cardStates["p2:unit"] = {
    exhausted: false,
    damage: 0,
    computedMight: 1,
  };
  game.state.cardStates["p2:bf"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };

  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:spell",
  )!;
  assert.deepEqual(
    play.targets.map((target) => target.kind),
    ["card", "location"],
  );
  assert.throws(
    () =>
      performGameplayAction({
        game,
        actorPlayerId: "p1",
        actionId: play.id,
        selectedIds: ["p2:unit", "p1:bf"],
        decks,
        now: "move-invalid",
      }),
    /Selected targets are not legal/,
  );

  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: ["p2:unit", "p2:bf"],
    decks,
    now: "move-played",
  });
  assert.deepEqual(game.state.chain?.items[0]?.targetCardInstanceIds, [
    "p2:unit",
    "p2:bf",
  ]);
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(game, playerId, decks).find(
      (action) => action.label === "Pass priority",
    )!;
    game = performGameplayAction({
      game,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `move-pass-${playerId}`,
    });
  }
  assert.deepEqual(game.state.battlefields[0]!.units, []);
  assert.deepEqual(game.state.battlefields[1]!.units, ["p2:unit"]);
  assert.equal(game.state.players.p2!.zones.base.includes("p2:unit"), false);
});

test("publicly reveals an opponent hand without creating an acknowledgement decision", () => {
  const { game, decks } = fixture();
  decks[1]!.instances.push({
    instanceId: "p2:hand-card",
    ownerPlayerId: "p2",
    source: "mainDeck",
    cardCode: "UNIT",
  }, {
    instanceId: "p2:facedown-card",
    ownerPlayerId: "p2",
    source: "mainDeck",
    cardCode: "UNIT",
  });
  game.state.players.p2!.zones.hand = ["p2:hand-card"];
  game.state.cardStates["p2:hand-card"] = {
    exhausted: false,
    damage: 0,
    computedMight: 1,
  };
  game.state.cardStates["p2:facedown-card"] = {
    exhausted: false,
    damage: 0,
    computedMight: 1,
  };
  game.state.battlefields[0]!.facedownCardInstanceId = "p2:facedown-card";
  const battlefield = decks[0]!.snapshot.cards.find(
    (card) => card.cardCode === "BF",
  )!;
  battlefield.behaviorModel.clauses = [
    clause("reveal", {
      effects: [
        binding("action.reveal_opponent_hand", 0, {}),
        binding("action.grant_facedown_vision", 1, {}),
      ],
    }),
  ];

  beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "p1:bf",
    clauseId: "reveal",
    decks,
  });
  assert.equal(game.state.pendingChoice, null);
  assert.deepEqual(game.state.publicReveals?.map((reveal) => reveal.cardInstanceIds), [
    ["p2:hand-card"],
  ]);
  for (const viewerPlayerId of ["p1", "p2"]) {
    assert.deepEqual(
      projectGame({ game, viewerPlayerId, decks }).publicReveals?.[0]?.cards.map(
        (card) => card.name,
      ),
      ["Unit"],
    );
  }
  assert.deepEqual(game.state.facedownVisibilityGrants, [
    { viewerPlayerId: "p1", ownerPlayerId: "p2", expiresAtTurnNumber: 1 },
  ]);
  assert.equal(
    projectGame({ game, viewerPlayerId: "p1", decks }).battlefields[0]
      ?.facedownCard?.instanceId,
    "p2:facedown-card",
  );
  assert.deepEqual(
    projectGame({ game, viewerPlayerId: "p1", decks }).players
      .find((player) => player.playerId === "p2")
      ?.zones.find((zone) => zone.kind === "hand")?.cards,
    [],
  );
});

test("publicly reveals a selected top-deck card without blocking its draw", () => {
  const { game, decks } = fixture();
  const snapshot = decks[0]!.snapshot;
  snapshot.cards.push(definition("GEAR", "Gear", "Gear", 0, 0));
  decks[0]!.instances.push({
    instanceId: "p1:gear",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "GEAR",
  });
  game.state.players.p1!.zones.mainDeck = ["p1:gear", "p1:draw"];
  game.state.cardStates["p1:gear"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };
  const battlefield = snapshot.cards.find((card) => card.cardCode === "BF")!;
  battlefield.behaviorModel.clauses = [
    clause("search", {
      effects: [
        binding("action.search_top_deck", 0, {
          count: 2,
          cardType: "Gear",
          maximumSelect: 1,
          revealSelected: true,
        }),
      ],
    }),
  ];

  assert.equal(
    beginEffectResolution({
      game,
      controllerPlayerId: "p1",
      sourceCardInstanceId: "p1:bf",
      clauseId: "search",
      decks,
    }),
    false,
  );
  const select = gameplayActions(game, "p1", decks).find(
    (action) => action.choice?.kind === "effectSelection",
  )!;
  const selectionProjection = projectGame({ game, viewerPlayerId: "p1", decks });
  assert.deepEqual(
    selectionProjection.pendingChoice?.type === "effectSelection"
      ? selectionProjection.pendingChoice.visibleCards?.map((card) => card.name)
      : [],
    ["Gear", "Unit"],
  );
  assert.deepEqual(select.targets[0]?.legalIds, ["p1:gear"]);
  const declined = performGameplayAction({
    game: structuredClone(game),
    actorPlayerId: "p1",
    actionId: select.id,
    selectedIds: [],
    decks,
    now: "search-decline",
  });
  assert.equal(declined.state.pendingChoice, null);
  assert.equal(declined.state.players.p1!.zones.hand.includes("p1:gear"), false);
  assert.deepEqual(
    [...declined.state.players.p1!.zones.mainDeck].sort(),
    ["p1:draw", "p1:gear"],
  );
  const revealed = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: select.id,
    selectedIds: ["p1:gear"],
    decks,
    now: "search-select",
  });
  assert.equal(revealed.state.pendingChoice, null);
  for (const viewerPlayerId of ["p1", "p2"]) {
    const projection = projectGame({ game: revealed, viewerPlayerId, decks });
    assert.deepEqual(
      projection.publicReveals?.[0]?.cards.map((card) => card.name),
      ["Gear"],
    );
  }
  assert.ok(revealed.state.players.p1!.zones.hand.includes("p1:gear"));
  assert.ok(revealed.state.players.p1!.zones.mainDeck.includes("p1:draw"));
});

test("automatically pays card costs with behavior-backed rune abilities", () => {
  const { game: initial, decks } = fixture();
  const play = gameplayActions(initial, "p1", decks).find(
    (action) => action.label === "Play Unit to Base"
  )!;
  const game = performGameplayAction({ game: initial, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "b" });
  assert.ok(game.state.players.p1!.zones.runeDeck.includes("p1:rune"));
  assert.equal(game.state.cardStates["p1:rune"]!.exhausted, false);
  assert.ok(game.state.players.p1!.zones.base.includes("p1:rune-b"));
  assert.equal(game.state.cardStates["p1:rune-b"]!.exhausted, false);
  assert.ok(game.state.players.p1!.zones.base.includes("p1:unit"));
});

test("projects printed and effective costs for generic Gear cost modifiers", () => {
  const { game, decks } = fixture();
  const snapshot = decks[0]!.snapshot;
  snapshot.cards.push(definition("GEAR_COST", "Costed Gear", "Gear", 3, 1));
  const battlefield = snapshot.cards.find(
    (card) => card.cardCode === "BF",
  )!;
  battlefield.behaviorModel.clauses = [clause("gear discount", {
    effects: [binding("modifier.modify_numeric_value", 0, {
      attribute: "energyCost",
      operation: "reduce",
      amount: 1,
      minimum: 0,
      target: "controller_card",
      cardType: "Gear",
      duration: "whileSourceAtBattlefield",
      condition: "firstCardOfTypePlayedThisTurn",
    })],
  })];
  decks[0]!.instances.push({
    instanceId: "p1:costed-gear",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "GEAR_COST",
  });
  game.state.players.p1!.zones.hand.push("p1:costed-gear");
  game.state.cardStates["p1:costed-gear"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };

  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:costed-gear",
  )!;
  assert.deepEqual(play.costPreview, {
    energy: 2,
    basePower: 0,
    effectivePower: 0,
    printedEnergy: 3,
    printedPower: 0,
    availableAnyPower: 0,
    targetAdditionalPower: [],
  });
});

test("control-dependent Battlefield discounts use the current controller and every predicate", () => {
  const { game, decks } = fixture();
  const snapshot = decks[0]!.snapshot;
  snapshot.cards.push(definition("GEAR_COST", "Costed Gear", "Gear", 3, 1));
  const battlefield = snapshot.cards.find(
    (card) => card.cardCode === "BF",
  )!;
  battlefield.behaviorModel.clauses = [clause("controlled gear discount", {
    effects: [binding("modifier.modify_numeric_value", 0, {
      attribute: "energyCost",
      operation: "reduce",
      amount: 1,
      minimum: 0,
      target: "controller_card",
      cardType: "Gear",
      excludeTokens: true,
      duration: "whileSourceAtBattlefield",
      condition: "firstCardOfTypePlayedThisTurn",
      conditions: "sourceControllerControlsBattlefield",
    })],
  })];
  for (const playerId of ["p1", "p2"] as const) {
    const instanceId = `${playerId}:costed-gear`;
    decks[playerId === "p1" ? 0 : 1]!.instances.push({
      instanceId,
      ownerPlayerId: playerId,
      source: "mainDeck",
      cardCode: "GEAR_COST",
    });
    game.state.players[playerId]!.zones.hand.push(instanceId);
    game.state.cardStates[instanceId] = {
      exhausted: false,
      damage: 0,
      computedMight: null,
    };
  }
  const index = createRuntimeCardIndex(decks, game);
  const gear = snapshot.cards.find((card) => card.cardCode === "GEAR_COST")!;

  game.state.battlefields[0]!.controllerPlayerId = "p1";
  assert.equal(effectiveEnergyCost(game, "p1", gear, index, "p1:costed-gear"), 2);
  assert.equal(effectiveEnergyCost(game, "p2", gear, index, "p2:costed-gear"), 3);

  game.state.battlefields[0]!.controllerPlayerId = "p2";
  assert.equal(effectiveEnergyCost(game, "p1", gear, index, "p1:costed-gear"), 3);
  assert.equal(effectiveEnergyCost(game, "p2", gear, index, "p2:costed-gear"), 2);

  game.state.turn!.playedCardInstanceIds = ["p2:costed-gear"];
  assert.equal(effectiveEnergyCost(game, "p2", gear, index, "p2:costed-gear"), 3);

  game.state.turn!.playedCardInstanceIds = [];
  game.state.battlefields[0]!.controllerPlayerId = null;
  assert.equal(effectiveEnergyCost(game, "p1", gear, index, "p1:costed-gear"), 3);
  assert.equal(effectiveEnergyCost(game, "p2", gear, index, "p2:costed-gear"), 3);
});

test("applies continuous opponent spell costs only to the opposing controller", () => {
  const { game, decks } = fixture();
  const snapshot = decks[0]!.snapshot;
  snapshot.cards.push(
    definition("SPELL_COST", "Costed Spell", "Spell", 1, 0),
    definition("SPELL_TAX", "Spell Tax", "Legend", 0, 0),
  );
  const spellTax = snapshot.cards.find((card) => card.cardCode === "SPELL_TAX")!;
  spellTax.behaviorModel.clauses = [clause("opponent spell tax", {
    effects: [binding("modifier.modify_numeric_value", 0, {
      attribute: "energyCost",
      operation: "increase",
      amount: 1,
      target: "opponent_spell",
      duration: "whileSourceOnBoard",
    })],
  })];
  decks[0]!.instances.push(
    { instanceId: "p1:spell-tax", ownerPlayerId: "p1", source: "mainDeck", cardCode: "SPELL_TAX" },
    { instanceId: "p1:costed-spell", ownerPlayerId: "p1", source: "mainDeck", cardCode: "SPELL_COST" },
  );
  decks[1]!.instances.push({
    instanceId: "p2:costed-spell",
    ownerPlayerId: "p2",
    source: "mainDeck",
    cardCode: "SPELL_COST",
  });
  game.state.players.p1!.zones.base.push("p1:spell-tax");
  game.state.players.p1!.zones.hand.push("p1:costed-spell");
  game.state.players.p2!.zones.hand.push("p2:costed-spell");
  game.state.cardStates["p1:spell-tax"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };
  game.state.cardStates["p1:costed-spell"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };
  game.state.cardStates["p2:costed-spell"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };

  const index = createRuntimeCardIndex(decks, game);
  const spell = snapshot.cards.find((card) => card.cardCode === "SPELL_COST")!;

  assert.equal(effectiveEnergyCost(game, "p1", spell, index, "p1:costed-spell"), 1);
  assert.equal(effectiveEnergyCost(game, "p2", spell, index, "p2:costed-spell"), 2);
});

test("uses generic restricted Power for Gear cards and Gear Equip abilities", () => {
  const { game: initial, decks } = fixture();
  const game = structuredClone(initial);
  const snapshot = decks[0]!.snapshot;
  snapshot.cards.push(
    definition("RESOURCE_LEGEND", "Resource Legend", "Legend", 0, 0),
    definition("GEAR", "Test Gear", "Gear", 0, 0, 1),
    definition("POWER_UNIT", "Power Unit", "Unit", 0, 1, 1),
  );
  const resourceLegend = snapshot.cards.find((card) => card.cardCode === "RESOURCE_LEGEND")!;
  resourceLegend.behaviorModel.clauses = [clause("restricted-add", {
    abilities: [binding("ability.exhaust_for_resource", 0, {
      resourceType: "power",
      amountSource: "constant",
      amount: 1,
      domain: "rainbow",
      usage: "cardOrAbility:Gear",
    })],
  })];
  const gear = snapshot.cards.find((card) => card.cardCode === "GEAR")!;
  gear.card.tags = ["Equipment"];
  gear.card.attributes.might = 2;
  gear.effectText = {
    plain: "[Shield] 2. If this was attached to me this turn, I have an additional +2 Might.",
    sourceImageUrl: "https://example.test/test-gear.png",
  };
  gear.effectBehaviorModel = {
    playTimings: [],
    clauses: [clause("effect-shield", {
      keywords: [binding("keyword.shield", 0, { amount: 2 })],
      effects: [binding("modifier.modify_numeric_value", 1, {
        attribute: "might",
        operation: "increase",
        operand: "constant",
        amount: 2,
        target: "source",
        duration: "whileAttached",
        condition: "sourceAttachedThisTurn",
      })],
    })],
  };
  gear.behaviorModel.clauses = [clause("equip", {
    abilities: [binding("ability.equip", 0, {})],
    selectors: [binding("selector.friendly_unit", 0, {
      minimumCount: 1,
      maximumCount: 1,
      area: "board",
      locationRelation: "any",
      controller: "controller",
    })],
    costs: [binding("cost.pay", 0, { amount: 1, resource: "rune" })],
  })];
  decks[0]!.instances.push(
    { instanceId: "p1:resource-legend", ownerPlayerId: "p1", source: "legend", cardCode: "RESOURCE_LEGEND" },
    { instanceId: "p1:gear", ownerPlayerId: "p1", source: "mainDeck", cardCode: "GEAR" },
    { instanceId: "p1:power-unit", ownerPlayerId: "p1", source: "mainDeck", cardCode: "POWER_UNIT" },
  );
  decks[1]!.instances.push({
    instanceId: "p2:enemy",
    ownerPlayerId: "p2",
    source: "mainDeck",
    cardCode: "UNIT",
  });
  game.state.players.p1!.zones.legend = "p1:resource-legend";
  game.state.players.p1!.zones.hand.push("p1:gear", "p1:power-unit");
  game.state.players.p1!.zones.base = game.state.players.p1!.zones.base.filter(
    (id) => id !== "p1:rune" && id !== "p1:rune-b",
  );
  game.state.cardStates["p1:resource-legend"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.cardStates["p1:gear"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.cardStates["p1:power-unit"] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.players.p2!.zones.base.push("p2:enemy");
  game.state.cardStates["p2:enemy"] = { exhausted: false, damage: 0, computedMight: 1 };

  const autoPayGear = gameplayActions(game, "p1", decks).find(
    (action) => action.label === "Play Test Gear",
  )!;
  assert.equal(
    autoPayGear.enabled,
    true,
    "a ready Legend Add ability is an eligible automatic payment source",
  );
  const autoPaid = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: autoPayGear.id,
    selectedIds: [],
    decks,
    now: "restricted-auto-pay",
  });
  assert.equal(autoPaid.state.cardStates["p1:resource-legend"]?.exhausted, true);
  assert.ok(autoPaid.state.players.p1!.zones.base.includes("p1:gear"));
  assert.deepEqual(autoPaid.state.players.p1!.restrictedResources, undefined);
  assert.equal(
    gameplayActions(autoPaid, "p1", decks).find(
      (action) => action.label === "Play Power Unit to Base",
    ),
    undefined,
    "unpayable hand-card modes are not projected",
  );

  const addPower = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:resource-legend",
  )!;
  const afterAdd = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: addPower.id,
    selectedIds: [],
    decks,
    now: "restricted-add",
  });
  assert.deepEqual(afterAdd.state.players.p1!.restrictedResources, {
    energy: {},
    power: { "cardOrAbility:Gear": { Rainbow: 1 } },
  });
  assert.equal(
    gameplayActions(afterAdd, "p1", decks).find(
      (action) => action.label === "Play Power Unit to Base",
    ),
    undefined,
  );
  const playGear = gameplayActions(afterAdd, "p1", decks).find(
    (action) => action.label === "Play Test Gear",
  )!;
  const afterGear = performGameplayAction({
    game: afterAdd,
    actorPlayerId: "p1",
    actionId: playGear.id,
    selectedIds: [],
    decks,
    now: "play-gear",
  });
  assert.ok(afterGear.state.players.p1!.zones.base.includes("p1:gear"));
  assert.deepEqual(afterGear.state.players.p1!.restrictedResources, {
    energy: {},
    power: { "cardOrAbility:Gear": { Rainbow: 0 } },
  });

  afterGear.state.players.p1!.restrictedResources = {
    energy: {},
    power: { "cardOrAbility:Gear": { Mind: 1 } },
  };
  const equip = gameplayActions(afterGear, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:gear" && action.label === "Equip",
  )!;
  assert.equal(equip.targets[0]?.legalIds.includes("p1:mover"), true);
  assert.equal(equip.targets[0]?.legalIds.includes("p2:enemy"), false);
  assert.throws(
    () => performGameplayAction({
      game: afterGear,
      actorPlayerId: "p1",
      actionId: equip.id,
      selectedIds: ["p2:enemy"],
      decks,
      now: "forged-equip",
    }),
    /target/i,
  );
  let afterActivate = performGameplayAction({
    game: afterGear,
    actorPlayerId: "p1",
    actionId: equip.id,
    selectedIds: ["p1:mover"],
    decks,
    now: "activate-equip",
  });
  assert.equal(
    afterActivate.state.players.p1!.restrictedResources?.power["cardOrAbility:Gear"]?.Mind,
    0,
  );
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(afterActivate, playerId, decks).find(
      (action) => action.label === "Pass priority",
    )!;
    afterActivate = performGameplayAction({
      game: afterActivate,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `equip-pass-${playerId}`,
    });
  }
  assert.equal(
    afterActivate.state.cardStates["p1:gear"]!.attachedToCardInstanceId,
    "p1:mover",
  );
  assert.equal(afterActivate.state.cardStates["p1:gear"]!.attachedAtTurnNumber, 1);
  assert.equal(afterActivate.state.cardStates["p1:mover"]!.computedMight, 5);
  afterActivate.state.cardStates["p1:mover"]!.combatRole = "defender";
  recomputeMight(afterActivate, "p1:mover", createRuntimeCardIndex(decks, afterActivate));
  assert.equal(afterActivate.state.cardStates["p1:mover"]!.computedMight, 7);
  afterActivate.state.cardStates["p1:mover"]!.combatRole = null;
  recomputeMight(afterActivate, "p1:mover", createRuntimeCardIndex(decks, afterActivate));
  afterActivate.state.turn!.turnNumber = 2;
  recomputeMight(afterActivate, "p1:mover", createRuntimeCardIndex(decks, afterActivate));
  assert.equal(afterActivate.state.cardStates["p1:mover"]!.computedMight, 3);
  assert.equal(
    gameplayActions(afterActivate, "p1", decks).some(
      (action) => action.sourceCardInstanceId === "p1:gear" && action.label === "Equip",
    ),
    false,
  );

  const runtimeIndex = createRuntimeCardIndex(decks, afterActivate);
  createPrimitiveHandlers(runtimeIndex)
    .get("action.detach_equipment")!
    .execute!(
      binding("action.detach_equipment", 0, { target: "equipment" }),
      createBehaviorContext(
        afterActivate,
        "p1",
        "p1:bf",
        null,
        ["p1:gear"],
      ),
    );
  assert.equal(
    afterActivate.state.cardStates["p1:gear"]!.attachedToCardInstanceId,
    null,
  );
  assert.equal(afterActivate.state.cardStates["p1:mover"]!.computedMight, 1);

  createPrimitiveHandlers(runtimeIndex)
    .get("action.attach_equipment")!
    .execute!(
      binding("action.attach_equipment", 0, { target: "friendly_unit" }),
      createBehaviorContext(
        afterActivate,
        "p1",
        "p1:gear",
        null,
        ["p1:mover"],
      ),
    );

  const move = gameplayActions(afterActivate, "p1", decks).find(
    (action) =>
      action.sourceCardInstanceId === "p1:mover" &&
      action.label === "Move to Arena",
  )!;
  const atBattlefield = performGameplayAction({
    game: afterActivate,
    actorPlayerId: "p1",
    actionId: move.id,
    selectedIds: [],
    decks,
    now: "move-equipped-unit",
  });
  assert.equal(atBattlefield.state.players.p1!.zones.base.includes("p1:gear"), false);
  assert.deepEqual(
    atBattlefield.state.battlefields[0]!.attachedCardInstanceIds,
    ["p1:gear"],
  );
  assert.deepEqual(
    projectGame({
      game: atBattlefield,
      viewerPlayerId: "p1",
      decks,
    }).battlefields[0]!.attachedCards?.map((card) => card.instanceId),
    ["p1:gear"],
  );

  atBattlefield.state.cardStates["p1:mover"]!.damage = 5;
  cleanupBoard(atBattlefield, createRuntimeCardIndex(decks, atBattlefield));
  assert.ok(atBattlefield.state.players.p1!.zones.trash.includes("p1:mover"));
  assert.equal(
    atBattlefield.state.cardStates["p1:gear"]!.attachedToCardInstanceId,
    null,
  );
  assert.deepEqual(
    atBattlefield.state.battlefields[0]!.attachedCardInstanceIds,
    [],
  );
  assert.ok(atBattlefield.state.players.p1!.zones.base.includes("p1:gear"));
});

test("Quick-Draw Gear enters Base, then attaches through its triggered Chain item", () => {
  const { game, decks } = fixture();
  const snapshot = decks[0]!.snapshot;
  snapshot.cards.push(definition("QUICK_GEAR", "Quick Gear", "Gear", 0, 0));
  const quickGear = snapshot.cards.find(
    (card) => card.cardCode === "QUICK_GEAR",
  )!;
  quickGear.card.tags = ["Equipment"];
  quickGear.behaviorModel.clauses = [clause("quick-draw", {
    triggers: [binding("trigger.on_play", 0, {
      actor: "controller",
      subject: "source",
    })],
    selectors: [binding("selector.friendly_unit", 0, {
      minimumCount: 1,
      maximumCount: 1,
      area: "board",
      locationRelation: "any",
      controller: "controller",
      selectionKey: "unit",
    })],
    effects: [binding("action.attach_equipment", 0, {
      target: "friendly_unit",
      selectionKey: "unit",
    })],
    keywords: [binding("keyword.quick_draw", 0, {})],
  })];
  decks[0]!.instances.push({
    instanceId: "p1:quick-gear",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "QUICK_GEAR",
  });
  game.state.players.p1!.zones.hand.push("p1:quick-gear");
  game.state.cardStates["p1:quick-gear"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };

  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.label === "Play Quick Gear",
  )!;
  assert.deepEqual(play.targets, []);
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: [],
    decks,
    now: "quick-draw",
  });
  assert.ok(next.state.players.p1!.zones.base.includes("p1:quick-gear"));
  assert.equal(
    next.state.cardStates["p1:quick-gear"]!.attachedToCardInstanceId ?? null,
    null,
  );
  assert.equal(next.state.pendingChoice?.type, "effectSelection");
  const chooseTarget = gameplayActions(next, "p1", decks).find(
    (action) => action.choice?.kind === "effectSelection",
  )!;
  next = performGameplayAction({
    game: next,
    actorPlayerId: "p1",
    actionId: chooseTarget.id,
    selectedIds: ["p1:mover"],
    decks,
    now: "quick-draw-target",
  });
  assert.equal(next.state.chain?.items.at(-1)?.kind, "trigger");
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(next, playerId, decks).find(
      (action) => action.label === "Pass priority",
    )!;
    next = performGameplayAction({
      game: next,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `quick-draw-pass-${playerId}`,
    });
  }
  assert.equal(
    next.state.cardStates["p1:quick-gear"]!.attachedToCardInstanceId,
    "p1:mover",
  );
});

test("selector constraints survive projection, intent submission, and resolution", () => {
  const { game, decks } = fixture();
  const source = definition("CONSTRAINED_SOURCE", "Constrained Source", "Unit", 0, 1) as GameCardDefinition;
  source.behaviorModel.clauses = [clause("constrained-trigger", {
    triggers: [binding("trigger.on_play", 0, { actor: "controller", subject: "source" })],
    selectors: [binding("selector.enemy_unit", 0, {
      minimumCount: 0,
      maximumCount: 99,
      area: "board",
      locationRelation: "any",
      selectionKey: "units",
    })],
    effects: [binding("action.deal_damage", 0, {
      amount: 1,
      target: "enemy_unit",
      selectionKey: "units",
      atMostOnePerLocation: true,
    })],
  })];
  decks[0]!.snapshot.cards.push(source);
  for (const [id, zone] of [["p2:enemy-a", "base"], ["p2:enemy-b", "base"], ["p2:enemy-c", "battlefield"]] as const) {
    decks[1]!.instances.push({ instanceId: id, ownerPlayerId: "p2", source: "mainDeck", cardCode: "UNIT" });
    game.state.cardStates[id] = { exhausted: false, damage: 0, computedMight: 5 };
    if (zone === "base") game.state.players.p2!.zones.base.push(id);
    else game.state.battlefields[0]!.units.push(id);
  }
  decks[0]!.instances.push({ instanceId: "p1:constrained-source", ownerPlayerId: "p1", source: "mainDeck", cardCode: "CONSTRAINED_SOURCE" });
  game.state.players.p1!.zones.base.push("p1:constrained-source");
  game.state.cardStates["p1:constrained-source"] = { exhausted: false, damage: 0, computedMight: 1 };

  beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "p1:constrained-source",
    clauseId: "constrained-trigger",
    selectedIds: [],
    targetsLocked: false,
    decks,
    event: {
    type: "card.played",
    actorPlayerId: "p1",
    subjectCardInstanceId: "p1:constrained-source",
    values: {},
    },
  });
  const selectionAction = gameplayActions(game, "p1", decks).find(
    (action) => action.choice?.kind === "effectSelection",
  );
  assert.ok(selectionAction);
  assert.deepEqual(selectionAction.targets.map(({ kind, minimum, maximum }) => ({ kind, minimum, maximum })), [
    { kind: "card", minimum: 0, maximum: 2 },
  ]);
  assert.deepEqual(selectionAction.targets[0]?.locationKeysById, {
    "p2:enemy-a": "base:p2",
    "p2:enemy-b": "base:p2",
    "p2:enemy-c": `battlefield:${game.state.battlefields[0]!.battlefieldId}`,
  });
  assert.equal(selectionAction.targets[0]?.maximumPerLocation, 1);

  assert.throws(() => performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: selectionAction.id,
    selectedIds: ["p2:enemy-a", "p2:enemy-b"],
    decks,
    now: "same-location-rejected",
  }), /not legal/);

  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: selectionAction.id,
    selectedIds: ["p2:enemy-a", "p2:enemy-c"],
    decks,
    now: "distinct-locations-accepted",
  });
  assert.equal(next.state.cardStates["p2:enemy-a"]!.damage, 1);
  assert.equal(next.state.cardStates["p2:enemy-c"]!.damage, 1);
  assert.equal(next.state.cardStates["p2:enemy-b"]!.damage, 0);
});

test("optional selectors with no legal candidates continue without an empty prompt", () => {
  const { game, decks } = fixture();
  const source = definition("EMPTY_OPTION_SOURCE", "Empty Option Source", "Spell", 0, 0) as GameCardDefinition;
  source.behaviorModel.clauses = [clause("optional-recycle", {
    selectors: [binding("selector.card", 0, {
      zone: "mainDeck",
      owner: "controller",
      cardType: "any",
      topCount: 5,
      minimumCount: 0,
      maximumCount: 5,
      selectionKey: "selectedCards",
    })],
    effects: [binding("action.play_token", 1, {
      tokenName: "1 :rb_might: Recruit unit",
      count: 1,
      placement: "base",
    })],
  })];
  decks[0]!.snapshot.cards.push(source);
  decks[0]!.instances.push({
    instanceId: "p1:empty-option-source",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "EMPTY_OPTION_SOURCE",
  });
  game.state.players.p1!.zones.mainDeck = [];
  game.state.cardStates["p1:empty-option-source"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };

  beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "p1:empty-option-source",
    clauseId: "optional-recycle",
    decks,
  });

  assert.equal(game.state.pendingChoice, null);
  assert.equal(game.state.effectResolutions.length, 0);
  assert.equal(game.state.createdCardInstances?.length, 1);
  assert.ok(game.state.players.p1!.zones.base.includes(game.state.createdCardInstances![0]!.instanceId));
});

test("private-zone selections are offered on effect resolution, not as play targets", () => {
  const { game, decks } = fixture();
  const spell = decks[0]!.snapshot.cards.find((card) => card.cardCode === "SPELL")!;
  spell.behaviorModel.clauses = [clause("private-choice", {
    selectors: [binding("selector.card", 0, {
      zone: "mainDeck",
      owner: "controller",
      cardType: "any",
      topCount: 3,
      minimumCount: 0,
      maximumCount: 3,
      selectionKey: "chosenCards",
    })],
    effects: [binding("action.draw_cards", 1, { player: "controller", count: 1 })],
  })];

  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:spell" && action.label.startsWith("Play"),
  );
  assert.ok(play);
  assert.deepEqual(play.targets, []);
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: [],
    decks,
    now: "private-choice-play",
  });
  assert.equal(next.state.pendingChoice, null);
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(next, playerId, decks).find((action) => action.label === "Pass priority")!;
    next = performGameplayAction({
      game: next,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `private-choice-pass-${playerId}`,
    });
  }
  assert.equal(next.state.pendingChoice?.type, "effectSelection");
  assert.deepEqual(next.state.pendingChoice?.type === "effectSelection" ? next.state.pendingChoice.legalCardIds : [], ["p1:draw"]);
});

test("orders multiple attached death replacements through the canonical player decision", () => {
  const { game, decks } = fixture();
  const snapshot = decks[0]!.snapshot;
  for (const code of ["GUARDIAN_A", "GUARDIAN_B"]) {
    snapshot.cards.push(definition(code, "Test Guardian", "Gear", 0, 0));
    const guardian = snapshot.cards.find((card) => card.cardCode === code)!;
    guardian.card.tags = ["Equipment"];
    guardian.effectText = {
      plain: "If I would die, kill this instead. Heal me, exhaust me, and recall me.",
      sourceImageUrl: `https://example.test/${code}.png`,
    };
    guardian.effectBehaviorModel = {
      playTimings: [],
      clauses: [clause("guardian-replacement", {
        effects: [binding("replacement.recall_on_next_death", 0, {
          target: "attachedTopMost",
          duration: "whileAttached",
          exhausted: true,
          consumeSource: "kill",
        })],
      })],
    };
    decks[0]!.instances.push({
      instanceId: `p1:${code.toLowerCase()}`,
      ownerPlayerId: "p1",
      source: "mainDeck",
      cardCode: code,
    });
    game.state.players.p1!.zones.base.push(`p1:${code.toLowerCase()}`);
    game.state.cardStates[`p1:${code.toLowerCase()}`] = {
      exhausted: false,
      damage: 0,
      computedMight: null,
    };
  }
  const index = createRuntimeCardIndex(decks, game);
  for (const guardianId of ["p1:guardian_a", "p1:guardian_b"]) {
    createPrimitiveHandlers(index)
      .get("action.attach_equipment")!
      .execute!(
        binding("action.attach_equipment", 0, { target: "friendly_unit" }),
        createBehaviorContext(game, "p1", guardianId, null, ["p1:mover"]),
      );
  }

  game.state.cardStates["p1:mover"]!.damage = 1;
  cleanupBoard(game, index);
  assert.equal(game.state.pendingChoice?.type, "orderReplacements");
  if (game.state.pendingChoice?.type !== "orderReplacements") return;
  assert.equal(game.state.pendingChoice.playerId, "p1");
  assert.deepEqual(
    game.state.pendingChoice.options.map((option) => option.sourceCardInstanceId).sort(),
    ["p1:guardian_a", "p1:guardian_b"],
  );
  assert.equal(projectGame({ game, viewerPlayerId: "p1", decks }).pendingChoice?.type, "orderReplacements");

  const replacementOrder = gameplayActions(game, "p1", decks).find(
    (action) => action.choice?.kind === "orderedOptions",
  )!;
  const selectedOrder = [...game.state.pendingChoice.options]
    .reverse()
    .map((option) => option.id);
  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: replacementOrder.id,
    selectedIds: selectedOrder,
    decks,
    now: "choose-guardian-replacement",
  });
  assert.equal(next.state.pendingChoice, null);
  assert.ok(next.state.players.p1!.zones.base.includes("p1:mover"));
  assert.equal(next.state.cardStates["p1:mover"]!.damage, 0);
  assert.equal(next.state.cardStates["p1:mover"]!.exhausted, true);
  assert.ok(next.state.players.p1!.zones.trash.includes("p1:guardian_b"));
  assert.equal(next.state.cardStates["p1:guardian_a"]!.attachedToCardInstanceId, null);
});

test("projects Deflect before payment and requires its Power in the Rune Pool", () => {
  const { game, decks } = fixture();
  const spell = decks[0]!.snapshot.cards.find(
    (definition) => definition.cardCode === "SPELL",
  )!;
  spell.behaviorModel.clauses.push({
    id: "target-unit",
    sequence: 0,
    sourceText: "",
    normalizedText: "",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [{
      behaviorId: "selector.unit",
      parameters: {
        area: "board",
        scope: "any",
        minimumCount: 1,
        maximumCount: 1,
      },
      confidence: "high",
      order: 0,
    }],
    choices: [],
    costs: [],
    timings: [],
    effects: [],
    keywords: [],
  });
  const unit = decks[0]!.snapshot.cards.find(
    (definition) => definition.cardCode === "UNIT",
  )!;
  unit.behaviorModel.clauses.push({
    id: "deflect",
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
    effects: [],
    keywords: [{
      behaviorId: "keyword.deflect",
      parameters: { amount: 1 },
      confidence: "high",
      order: 0,
    }],
  });
  decks[1]!.instances.push({
    instanceId: "p2:deflect",
    ownerPlayerId: "p2",
    source: "mainDeck",
    cardCode: "UNIT",
  });
  game.state.battlefields[0]!.units.push("p2:deflect");
  game.state.cardStates["p2:deflect"] = {
    exhausted: true,
    damage: 0,
    computedMight: 1,
  };

  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:spell",
  )!;
  assert.ok(play.targets[0]!.legalIds.includes("p2:deflect"));
  assert.deepEqual(play.costPreview, {
    energy: 0,
    basePower: 0,
    effectivePower: 0,
    printedEnergy: 0,
    printedPower: 0,
    availableAnyPower: 0,
    targetAdditionalPower: [{ targetId: "p2:deflect", amount: 1 }],
  });
  assert.throws(
    () =>
      performGameplayAction({
        game,
        actorPlayerId: "p1",
        actionId: play.id,
        selectedIds: ["p2:deflect"],
        decks,
        now: "deflect-without-pool",
      }),
    /costs cannot be paid/i,
  );

  game.state.players.p1!.power.Mind = 1;
  const payablePlay = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:spell",
  )!;
  assert.equal(payablePlay.costPreview?.availableAnyPower, 1);
  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: payablePlay.id,
    selectedIds: ["p2:deflect"],
    decks,
    now: "deflect-paid",
  });
  assert.equal(next.state.players.p1!.power.Mind, 0);
  assert.equal(next.state.chain?.items[0]?.sourceCardInstanceId, "p1:spell");
});

test("requires pooled Deflect power when a triggered ability commits its target", () => {
  const { game, decks } = fixture();
  const source = decks[0]!.snapshot.cards.find((card) => card.cardCode === "UNIT")!;
  source.behaviorModel.clauses = [clause("targeted-trigger", {
    triggers: [binding("trigger.end_of_turn", 0, { player: "controller" })],
    selectors: [binding("selector.unit", 0, {
      area: "board", scope: "any", minimumCount: 1, maximumCount: 1,
    })],
  })];
  source.behaviorModel.clauses[0]!.keywords = [binding("keyword.deflect", 0, { amount: 1 })];
  decks[1]!.instances.push({
    instanceId: "p2:warded-unit", ownerPlayerId: "p2", source: "mainDeck", cardCode: "UNIT",
  });
  game.state.battlefields[0]!.units.push("p2:warded-unit");
  game.state.cardStates["p2:warded-unit"] = { exhausted: true, damage: 0, computedMight: 1 };
  dispatchBehaviorEvent(game, {
    type: "turn.ended", actorPlayerId: "p1", subjectCardInstanceId: null, values: {},
  }, decks);

  assert.equal(game.state.pendingChoice?.type, "effectSelection");
  const submit = () => gameplayActions(game, "p1", decks).find((action) => action.id.includes(":submitChoice:"))!;
  assert.throws(() => performGameplayAction({
    game, actorPlayerId: "p1", actionId: submit().id,
    selectedIds: ["p2:warded-unit"], decks, now: "triggered-deflect-unpaid",
  }), /cost cannot be paid/i);

  game.state.players.p1!.power.Mind = 1;
  const next = performGameplayAction({
    game, actorPlayerId: "p1", actionId: submit().id,
    selectedIds: ["p2:warded-unit"], decks, now: "triggered-deflect-paid",
  });
  assert.equal(next.state.players.p1!.power.Mind, 0);
  assert.deepEqual(next.state.chain?.items[0]?.targetCardInstanceIds, ["p2:warded-unit"]);
});

test("charges Deflect when an activated ability selects an enemy target", () => {
  const { game, decks } = fixture();
  const source = definition("TARGETED_ACTION", "Targeted Action", "Gear", 0, 0) as GameCardDefinition;
  source.behaviorModel.clauses = [clause("targeted-ability", {
    abilities: [binding("ability.activated_effect", 0, {})],
    selectors: [binding("selector.enemy_unit", 1, {
      area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1,
    })],
  })];
  const target = decks[0]!.snapshot.cards.find((card) => card.cardCode === "UNIT")!;
  target.behaviorModel.clauses = [clause("deflect", {
    keywords: [binding("keyword.deflect", 0, { amount: 1 })],
  })];
  decks[0]!.snapshot.cards.push(source);
  decks[0]!.instances.push({
    instanceId: "p1:targeted-action", ownerPlayerId: "p1", source: "mainDeck", cardCode: "TARGETED_ACTION",
  });
  decks[1]!.instances.push({
    instanceId: "p2:activated-warded-unit", ownerPlayerId: "p2", source: "mainDeck", cardCode: "UNIT",
  });
  game.state.players.p1!.zones.base.push("p1:targeted-action");
  game.state.battlefields[0]!.units.push("p2:activated-warded-unit");
  game.state.cardStates["p1:targeted-action"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.cardStates["p2:activated-warded-unit"] = { exhausted: true, damage: 0, computedMight: 1 };

  const activation = () => gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:targeted-action",
  )!;
  assert.throws(() => performGameplayAction({
    game, actorPlayerId: "p1", actionId: activation().id,
    selectedIds: ["p2:activated-warded-unit"], decks, now: "activated-deflect-unpaid",
  }), /Ability costs cannot be paid/i);

  game.state.players.p1!.power.Mind = 1;
  const next = performGameplayAction({
    game, actorPlayerId: "p1", actionId: activation().id,
    selectedIds: ["p2:activated-warded-unit"], decks, now: "activated-deflect-paid",
  });
  assert.equal(next.state.players.p1!.power.Mind, 0);
  assert.deepEqual(next.state.chain?.items[0]?.targetCardInstanceIds, ["p2:activated-warded-unit"]);
});

test("requires pooled Deflect power for a resolving spell target choice", () => {
  const { game, decks } = fixture();
  const spell = decks[0]!.snapshot.cards.find((card) => card.cardCode === "SPELL")!;
  spell.behaviorModel.clauses = [clause("resolution-target", {
    selectors: [binding("selector.unit", 0, {
      area: "board", scope: "any", minimumCount: 1, maximumCount: 1,
    })],
  })];
  const unit = decks[0]!.snapshot.cards.find((card) => card.cardCode === "UNIT")!;
  unit.behaviorModel.clauses = [clause("deflect", {
    keywords: [binding("keyword.deflect", 0, { amount: 1 })],
  })];
  decks[1]!.instances.push({
    instanceId: "p2:resolving-warded-unit", ownerPlayerId: "p2", source: "mainDeck", cardCode: "UNIT",
  });
  game.state.battlefields[0]!.units.push("p2:resolving-warded-unit");
  game.state.cardStates["p2:resolving-warded-unit"] = { exhausted: true, damage: 0, computedMight: 1 };

  assert.equal(beginEffectResolution({
    game, controllerPlayerId: "p1", sourceCardInstanceId: "p1:spell",
    clauseId: "resolution-target", decks,
  }), false);
  game.state.chain = {
    items: [{
      id: "resolving-spell", kind: "spell", label: "Spell", controllerPlayerId: "p1",
      sourceCardInstanceId: "p1:spell", targetCardInstanceIds: [], targetObjectVersions: {},
      behaviorClauseId: "resolution-target", activatedBehaviorId: null, behaviorEvent: null,
    }],
    relevantPlayerIds: ["p1", "p2"], priorityPlayerId: "p1", passedPlayerIds: [],
    openedBy: "cardPlay", resolvingItemId: "resolving-spell",
  };
  const submit = () => gameplayActions(game, "p1", decks).find((action) => action.id.includes(":submitChoice:"))!;
  assert.throws(() => performGameplayAction({
    game, actorPlayerId: "p1", actionId: submit().id,
    selectedIds: ["p2:resolving-warded-unit"], decks, now: "resolution-deflect-unpaid",
  }), /cost cannot be paid/i);

  game.state.players.p1!.power.Mind = 1;
  const next = performGameplayAction({
    game, actorPlayerId: "p1", actionId: submit().id,
    selectedIds: ["p2:resolving-warded-unit"], decks, now: "resolution-deflect-paid",
  });
  assert.equal(next.state.players.p1!.power.Mind, 0);
  assert.equal(next.state.pendingChoice, null);
});

test("resolution-time Deflect payment applies to triggered and activated effects", () => {
  for (const kind of ["trigger", "activatedAbility"] as const) {
    const { game, decks } = fixture();
    const source = decks[0]!.snapshot.cards.find((card) => card.cardCode === "SPELL")!;
    source.behaviorModel.clauses = [clause("resolving-target", {
      selectors: [binding("selector.unit", 0, {
        area: "board", scope: "any", minimumCount: 1, maximumCount: 1,
      })],
    })];
    const unit = decks[0]!.snapshot.cards.find((card) => card.cardCode === "UNIT")!;
    unit.behaviorModel.clauses = [clause("deflect", {
      keywords: [binding("keyword.deflect", 0, { amount: 1 })],
    })];
    decks[1]!.instances.push({
      instanceId: `p2:${kind}-warded-unit`, ownerPlayerId: "p2", source: "mainDeck", cardCode: "UNIT",
    });
    const targetId = `p2:${kind}-warded-unit`;
    game.state.battlefields[0]!.units.push(targetId);
    game.state.cardStates[targetId] = { exhausted: true, damage: 0, computedMight: 1 };

    const itemId = `resolving-${kind}`;
    game.state.chain = {
      items: [{
        id: itemId,
        kind,
        label: "Resolving effect",
        controllerPlayerId: "p1",
        sourceCardInstanceId: "p1:spell",
        targetCardInstanceIds: [],
        targetObjectVersions: {},
        behaviorClauseId: "resolving-target",
        activatedBehaviorId: kind === "activatedAbility" ? "ability.activated_effect" : null,
        behaviorEvent: null,
      }],
      relevantPlayerIds: ["p1", "p2"],
      priorityPlayerId: "p1",
      passedPlayerIds: [],
      openedBy: "cardPlay",
      resolvingItemId: itemId,
    };
    assert.equal(beginEffectResolution({
      game,
      controllerPlayerId: "p1",
      sourceCardInstanceId: "p1:spell",
      clauseId: "resolving-target",
      decks,
    }), false);
    const submit = () => gameplayActions(game, "p1", decks).find((action) =>
      action.id.includes(":submitChoice:"),
    )!;
    assert.throws(() => performGameplayAction({
      game, actorPlayerId: "p1", actionId: submit().id,
      selectedIds: [targetId], decks, now: `resolving-deflect-unpaid-${kind}`,
    }), /cost cannot be paid/i);

    game.state.players.p1!.power.Mind = 1;
    const next = performGameplayAction({
      game, actorPlayerId: "p1", actionId: submit().id,
      selectedIds: [targetId], decks, now: `resolving-deflect-paid-${kind}`,
    });
    assert.equal(next.state.players.p1!.power.Mind, 0);
    assert.equal(next.state.pendingChoice, null);
    assert.equal(next.state.effectResolutions.length, 0);
  }
});

test("counters a qualifying chain spell through the generic chain-target primitive", () => {
  const { game: initial, decks } = fixture();
  let game = initial;
  const snapshot = decks[0]!.snapshot;
  const defy = definition("DEFY", "Defy", "Spell", 0, 0) as DeckSnapshotDocument["snapshot"]["cards"][number];
  defy.behaviorModel.playTimings = [binding("timing.reaction", 0, {})];
  defy.behaviorModel.clauses = [clause("counter", {
    selectors: [binding("selector.chain_item", 0, {
      itemKind: "spell",
      controller: "opponent",
      maximumEnergyCost: 4,
      maximumPowerCost: 1,
      minimumCount: 1,
      maximumCount: 1,
      selectionKey: "counterTarget",
    })],
    effects: [binding("action.counter_chain_item", 0, {
      selectionKey: "counterTarget",
    })],
  })];
  const lowCostSpell = definition("LOW", "Low Cost Spell", "Spell", 4, 0, 1) as DeckSnapshotDocument["snapshot"]["cards"][number];
  lowCostSpell.behaviorModel.clauses = [clause("draw", {
    effects: [binding("action.draw_cards", 0, { player: "controller", count: 1 })],
  })];
  const highCostSpell = definition("HIGH", "High Cost Spell", "Spell", 5, 0, 0) as DeckSnapshotDocument["snapshot"]["cards"][number];
  highCostSpell.behaviorModel.clauses = [clause("draw", {
    effects: [binding("action.draw_cards", 0, { player: "controller", count: 1 })],
  })];
  snapshot.cards.push(defy, lowCostSpell, highCostSpell);
  decks[0]!.instances.push({
    instanceId: "p1:defy",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "DEFY",
  });
  decks[1]!.instances.push(
    {
      instanceId: "p2:low",
      ownerPlayerId: "p2",
      source: "mainDeck",
      cardCode: "LOW",
    },
    {
      instanceId: "p2:high",
      ownerPlayerId: "p2",
      source: "mainDeck",
      cardCode: "HIGH",
    },
  );
  game.state.players.p1!.zones.hand.push("p1:defy");
  game.state.cardStates["p1:defy"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.cardStates["p2:low"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.cardStates["p2:high"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.chain = {
    items: [
      {
        id: "chain:low",
        kind: "spell",
        label: "Low Cost Spell",
        controllerPlayerId: "p2",
        sourceCardInstanceId: "p2:low",
        targetCardInstanceIds: [],
        targetObjectVersions: {},
        behaviorClauseId: "draw",
        activatedBehaviorId: null,
        behaviorEvent: null,
      },
      {
        id: "chain:high",
        kind: "spell",
        label: "High Cost Spell",
        controllerPlayerId: "p2",
        sourceCardInstanceId: "p2:high",
        targetCardInstanceIds: [],
        targetObjectVersions: {},
        behaviorClauseId: "draw",
        activatedBehaviorId: null,
        behaviorEvent: null,
      },
    ],
    relevantPlayerIds: ["p1", "p2"],
    priorityPlayerId: "p1",
    passedPlayerIds: [],
  };

  const counter = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:defy",
  )!;
  assert.deepEqual(counter.targets, [{
    kind: "chainItem",
    label: "spell on the chain",
    selectionKey: "counterTarget",
    legalIds: ["chain:low"],
    minimum: 1,
    maximum: 1,
  }]);
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: counter.id,
    selectedIds: ["chain:low"],
    decks,
    now: "play-defy",
  });
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(game, playerId, decks).find(
      (action) => action.label === "Pass priority",
    )!;
    game = performGameplayAction({
      game,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `pass-${playerId}`,
    });
  }
  assert.deepEqual(game.state.chain?.items.map((item) => item.id), ["chain:high"]);
  assert.ok(game.state.players.p1!.zones.trash.includes("p1:defy"));
  assert.ok(game.state.players.p2!.zones.trash.includes("p2:low"));
  assert.equal(game.state.players.p2!.zones.trash.includes("p2:high"), false);
  assert.equal(game.state.players.p2!.zones.hand.length, 0);
});

test("plays battlefield-scoped group damage with only the location selected", () => {
  const { game, decks } = fixture();
  const spell = decks[0]!.snapshot.cards.find(
    (definition) => definition.cardCode === "SPELL",
  )!;
  spell.behaviorModel.clauses.push({
    id: "battlefield-group",
    sequence: 0,
    sourceText: "",
    normalizedText: "",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [
      {
        behaviorId: "selector.enemy_unit",
        parameters: {
          area: "battlefield",
          scope: "each",
          locationRelation: "any",
        },
        confidence: "high",
        order: 0,
      },
      {
        behaviorId: "selector.battlefield",
        parameters: { minimumCount: 1, maximumCount: 1 },
        confidence: "high",
        order: 1,
      },
    ],
    choices: [],
    costs: [],
    timings: [],
    effects: [{
      behaviorId: "action.deal_damage",
      parameters: { amount: 3, target: "enemy_unit" },
      confidence: "high",
      order: 2,
    }],
    keywords: [],
  });
  const unit = decks[0]!.snapshot.cards.find(
    (definition) => definition.cardCode === "UNIT",
  )!;
  unit.card.attributes.might = 5;
  decks[1]!.instances.push({
    instanceId: "p2:group-target",
    ownerPlayerId: "p2",
    source: "mainDeck",
    cardCode: "UNIT",
  });
  game.state.players.p1!.zones.base =
    game.state.players.p1!.zones.base.filter((id) => id !== "p1:mover");
  game.state.battlefields[0]!.units = ["p1:mover", "p2:group-target"];
  game.state.cardStates["p1:mover"]!.computedMight = 5;
  game.state.cardStates["p2:group-target"] = {
    exhausted: true,
    damage: 0,
    computedMight: 5,
  };
  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:spell",
  )!;

  assert.deepEqual(play.targets, [{
    kind: "battlefield",
    label: "battlefield",
    legalIds: ["p1:bf"],
    minimum: 1,
    maximum: 1,
  }]);

  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: ["p1:bf"],
    decks,
    now: "play-battlefield-group",
  });
  while (next.state.chain) {
    const actorPlayerId = next.state.chain.priorityPlayerId;
    const pass = gameplayActions(next, actorPlayerId, decks).find(
      (action) => action.label === "Pass priority",
    )!;
    next = performGameplayAction({
      game: next,
      actorPlayerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: "resolve-battlefield-group",
    });
  }

  assert.equal(next.state.cardStates["p2:group-target"]!.damage, 3);
  assert.equal(next.state.cardStates["p1:mover"]!.damage, 0);
});

test("plays Units to Base or a controlled battlefield and rejects forged destinations", () => {
  const { game, decks } = fixture();
  game.state.battlefields[0]!.controllerPlayerId = "p1";

  const actions = gameplayActions(game, "p1", decks).filter(
    (action) => action.sourceCardInstanceId === "p1:unit"
  );
  assert.deepEqual(
    actions.map((action) => action.label),
    ["Play Unit to Base", "Play Unit to Arena"]
  );
  assert.deepEqual(
    actions.map((action) => action.presentation.boardLocation),
    [
      { kind: "base" },
      { kind: "battlefield", battlefieldId: "p1:bf" },
    ],
  );

  const battlefieldPlay = actions.find(
    (action) => action.label === "Play Unit to Arena"
  )!;
  assert.throws(
    () => performGameplayAction({
      game,
      actorPlayerId: "p1",
      actionId: battlefieldPlay.id.replace(
        encodeURIComponent("p1:bf"),
        encodeURIComponent("forged-battlefield")
      ),
      selectedIds: [],
      decks,
      now: "forged"
    }),
    /Action is not legal/
  );

  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: battlefieldPlay.id,
    selectedIds: [],
    decks,
    now: "battlefield-play"
  });
  assert.ok(next.state.battlefields[0]!.units.includes("p1:unit"));
  assert.equal(next.state.players.p1!.zones.base.includes("p1:unit"), false);
  assert.equal(next.state.cardStates["p1:unit"]!.exhausted, true);
});

test("stale triggered and passive Unit clauses do not block playing the Unit", () => {
  const { game, decks } = fixture();
  const unitDefinition = decks[0]!.snapshot.cards.find(
    (card) => card.cardCode === "UNIT",
  )!;
  unitDefinition.behaviorModel.clauses.push({
    id: "stale-triggered-target",
    sequence: 0,
    sourceText: "When I attack, deal 1 to an enemy unit here",
    normalizedText: "When I attack, deal 1 to an enemy unit here",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [
      {
        behaviorId: "selector.enemy_unit",
        parameters: {
          minimumCount: 1,
          maximumCount: 1,
          area: "board",
          locationRelation: "sourceLocation",
          controller: "opponent",
        },
        confidence: "high",
        order: 0,
      },
    ],
    choices: [],
    costs: [],
    timings: [],
    keywords: [],
    effects: [
      {
        behaviorId: "action.deal_damage",
        parameters: { amount: 1, target: "enemy_unit" },
        confidence: "high",
        order: 1,
      },
    ],
  });

  const play = gameplayActions(game, "p1", decks).find(
    (action) =>
      action.sourceCardInstanceId === "p1:unit" &&
      action.label === "Play Unit to Base",
  );

  assert.equal(play?.enabled, true);
  assert.deepEqual(play?.targets, []);
});

test("playing a permitted Unit to an open battlefield starts a Showdown before Conquer", () => {
  const { game, decks } = fixture();
  const definition = decks[0]!.snapshot.cards.find(
    (card) => card.cardCode === "UNIT",
  )!;
  definition.behaviorModel.clauses.push({
    id: "open-battlefield",
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
    effects: [{
      behaviorId: "modifier.play_unit_destination",
      parameters: { destination: "openBattlefield" },
      confidence: "high",
      order: 0,
    }],
    keywords: [],
  });

  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.label === "Play Unit to Arena",
  );
  assert.ok(play);
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: [],
    decks,
    now: "open-battlefield-play",
  });

  assert.ok(next.state.battlefields[0]!.units.includes("p1:unit"));
  assert.equal(next.state.battlefields[0]!.controllerPlayerId ?? null, null);
  assert.equal(next.state.battlefields[0]!.contestedByPlayerId, "p1");
  assert.equal(next.state.showdown?.kind, "nonCombat");
  assert.equal(next.state.showdown?.focusPlayerId, "p1");
  assert.equal(next.state.players.p1!.points ?? 0, 0);

  const firstPass = gameplayActions(next, "p1", decks).find(
    (action) => action.label === "Pass focus",
  );
  assert.ok(firstPass);
  next = performGameplayAction({
    game: next,
    actorPlayerId: "p1",
    actionId: firstPass.id,
    selectedIds: [],
    decks,
    now: "first-pass",
  });
  assert.equal(next.state.showdown?.focusPlayerId, "p2");
  assert.equal(next.state.players.p1!.points ?? 0, 0);

  const secondPass = gameplayActions(next, "p2", decks).find(
    (action) => action.label === "Pass focus",
  );
  assert.ok(secondPass);
  next = performGameplayAction({
    game: next,
    actorPlayerId: "p2",
    actionId: secondPass.id,
    selectedIds: [],
    decks,
    now: "second-pass",
  });
  assert.equal(next.state.showdown, null);
  assert.equal(next.state.battlefields[0]!.controllerPlayerId, "p1");
  assert.equal(next.state.battlefields[0]!.contestedByPlayerId, null);
  assert.equal(next.state.players.p1!.points, 1);
});

test("development debug draw moves only the actor's top card without advancing the turn", () => {
  withNodeEnvironment("development", () => {
    const { game, decks } = fixture();
    game.state.turn!.activePlayerId = "p2";
    game.state.players.p1!.zones.hand = ["p1:spell"];
    game.state.players.p1!.zones.mainDeck.push("p1:unit");
    const before = structuredClone(game);
    const draw = gameplayActions(game, "p1", decks).find((action) => action.id.includes(":debugDraw:"));
    assert.ok(draw?.enabled);
    const next = performGameplayAction({ game, actorPlayerId: "p1", actionId: draw.id, selectedIds: [], decks, now: "debug-draw" });
    assert.deepEqual(next.state.players.p1!.zones.hand, [...game.state.players.p1!.zones.hand, "p1:draw"]);
    assert.deepEqual(next.state.players.p1!.zones.mainDeck, ["p1:unit"]);
    assert.equal(next.state.cardStates["p1:draw"]!.gameObjectIncarnation, 1);
    assert.deepEqual(next.state.players.p2, game.state.players.p2);
    assert.deepEqual(next.state.turn, game.state.turn);
    assert.equal(next.stateVersion, game.stateVersion + 1);
    assert.equal(next.updatedAt, "debug-draw");
    assert.deepEqual(game, before);
    assert.throws(() => performGameplayAction({ game: next, actorPlayerId: "p1", actionId: draw.id, selectedIds: [], decks, now: "stale" }), /not legal/);
    next.state.players.p1!.zones.mainDeck = [];
    const emptyDraw = gameplayActions(next, "p1", decks).find((action) => action.id.includes(":debugDraw:"));
    assert.equal(emptyDraw?.enabled, false);
    assert.throws(() => performGameplayAction({ game: next, actorPlayerId: "p1", actionId: emptyDraw!.id, selectedIds: [], decks, now: "empty" }), /not legal/);
  });
});

test("debug draw is rejected outside development even with a previously issued action ID", () => {
  const { game, decks } = fixture();
  const actionId = withNodeEnvironment("development", () => {
    const draw = gameplayActions(game, "p1", decks).find((action) => action.id.includes(":debugDraw:"));
    assert.ok(draw);
    return draw.id;
  });
  for (const environment of ["production", "test", undefined]) {
    withNodeEnvironment(environment, () => {
      assert.equal(gameplayActions(game, "p1", decks).some((action) => action.id === actionId), false);
      assert.throws(() => performGameplayAction({ game, actorPlayerId: "p1", actionId, selectedIds: [], decks, now: "rejected" }), /not legal/);
    });
  }
});

test("debug draw cannot bypass player membership, setup, or completed games", () => {
  withNodeEnvironment("development", () => {
    const { game, decks } = fixture();
    const actionId = `game:${game.stateVersion}:action:debugDraw:_`;
    assert.throws(() => performGameplayAction({ game, actorPlayerId: "spectator", actionId, selectedIds: [], decks, now: "rejected" }), /not legal/);
    for (const status of ["setup_pending", "complete"] as const) {
      game.status = status;
      assert.equal(gameplayActions(game, "p1", decks).length, 0);
      assert.throws(() => performGameplayAction({ game, actorPlayerId: "p1", actionId, selectedIds: [], decks, now: "rejected" }), /not legal/);
    }
  });
});

test("debug draw waits for pending choices to finish", () => {
  withNodeEnvironment("development", () => {
    const { game, decks } = fixture();
    game.state.pendingChoice = {
      id: "pending", type: "orderTriggers", playerId: "p1", optionIds: [], pendingItems: [],
    };
    const draw = gameplayActions(game, "p1", decks).find((action) => action.id.includes(":debugDraw:"));
    assert.equal(draw?.enabled, false);
    assert.throws(() => performGameplayAction({ game, actorPlayerId: "p1", actionId: draw!.id, selectedIds: [], decks, now: "rejected" }), /not legal/);
  });
});

function withNodeEnvironment<T>(environment: string | undefined, run: () => T): T {
  const variables: Record<string, string | undefined> = process.env;
  const previous = variables.NODE_ENV;
  try {
    if (environment === undefined) delete variables.NODE_ENV;
    else variables.NODE_ENV = environment;
    return run();
  } finally {
    if (previous === undefined) delete variables.NODE_ENV;
    else variables.NODE_ENV = previous;
  }
}

test("Flow plays a spell from Trash at its alternate cost and banishes it after resolution", () => {
  const { game, decks } = fixture();
  const spell = decks[0]!.snapshot.cards.find((card) => card.cardCode === "SPELL")!;
  spell.behaviorModel.clauses.push(
    clause("flow", {
      keywords: [binding("keyword.flow", 0, { energyCost: 2 })],
      effects: [binding("action.draw_cards", 1, { player: "controller", count: 1 })],
    }),
  );
  game.state.players.p1!.zones.hand = game.state.players.p1!.zones.hand.filter(
    (id) => id !== "p1:spell",
  );
  game.state.players.p1!.zones.trash.push("p1:spell");
  game.state.players.p1!.energy = 1;
  game.state.modifiers.push({
    id: "generic-flow-cost-reduction",
    sourceCardInstanceId: null,
    controllerPlayerId: "p1",
    targetCardInstanceId: null,
    attribute: "energyCost",
    targetScope: "controller_spell",
    operation: "reduce",
    amount: 1,
    minimum: 0,
    duration: "continuous",
    createdAtTurn: 1,
  });

  const flow = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:spell" && action.label.startsWith("[Flow]"),
  );
  assert.ok(flow?.enabled);
  assert.equal(flow.costPreview?.energy, 1);
  assert.equal(flow.presentation.playCost?.label, "[Flow] Play Spell");
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: flow.id,
    selectedIds: [],
    decks,
    now: "flow-play",
  });
  assert.equal(next.state.chain?.items.at(-1)?.flowPlayed, true);
  assert.equal(next.state.players.p1!.zones.trash.includes("p1:spell"), false);
  assert.equal(next.state.players.p1!.energy, 0);

  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(next, playerId, decks).find(
      (action) => action.label === "Pass priority",
    );
    assert.ok(pass);
    next = performGameplayAction({
      game: next,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `flow-pass-${playerId}`,
    });
  }
  assert.ok(next.state.players.p1!.zones.banishment.includes("p1:spell"));
  assert.ok(next.state.players.p1!.zones.hand.includes("p1:draw"));
});

test("Repeat commits independent execution targets before priority and resolves both executions", () => {
  const { game, decks } = fixture();
  const spell = decks[0]!.snapshot.cards.find((card) => card.cardCode === "SPELL")!;
  spell.behaviorModel.clauses.push(
    clause("repeat", {
      keywords: [binding("keyword.repeat", 0, { energyCost: 1, powerCost: 1 })],
      selectors: [binding("selector.card", 1, {
        player: "opponent", zone: "board", cardType: "Unit", minimumCount: 1,
        maximumCount: 1, selectionKey: "repeat-target",
      })],
      effects: [binding("action.draw_cards", 2, { player: "controller", count: 1 })],
    }),
  );
  game.state.players.p1!.energy = 2;
  game.state.players.p1!.power.Mind = 2;
  decks[1]!.snapshot.cards.push(definition("OPP", "Opponent", "Unit", 0, 3));
  decks[1]!.instances.push({
    instanceId: "p2:mover", ownerPlayerId: "p2", source: "mainDeck", cardCode: "OPP",
  });
  game.state.battlefields[0]!.units.push("p2:mover");
  game.state.cardStates["p2:mover"] = { exhausted: false, damage: 0, computedMight: 3 };
  decks[0]!.instances.push({
    instanceId: "p1:draw-two", ownerPlayerId: "p1", source: "mainDeck", cardCode: "UNIT",
  });
  game.state.players.p1!.zones.mainDeck.push("p1:draw-two");
  game.state.cardStates["p1:draw-two"] = { exhausted: false, damage: 0, computedMight: 1 };

  const repeat = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:spell" && action.label.startsWith("[Repeat]"),
  );
  assert.ok(repeat?.enabled, JSON.stringify(gameplayActions(game, "p1", decks).filter((action) => action.sourceCardInstanceId === "p1:spell")));
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: repeat.id,
    selectedIds: [],
    targetSelections: {
      "repeat:0": ["p2:mover"],
      "repeat:1": ["p2:mover"],
    },
    decks,
    now: "repeat-play",
  });
  assert.equal(next.state.pendingChoice, null);
  assert.equal(next.state.chain?.items.at(-1)?.repeatTargetSelections?.length, 2);
  assert.equal(next.state.players.p1!.energy, 1);
  assert.equal(next.state.players.p1!.power.Mind, 1);
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(next, playerId, decks).find((action) => action.label === "Pass priority")!;
    next = performGameplayAction({ game: next, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks, now: `repeat-pass-${playerId}` });
  }
  assert.equal(next.state.players.p1!.zones.hand.includes("p1:draw"), true);
  assert.equal(next.state.players.p1!.zones.hand.includes("p1:draw-two"), true);
});

test("each player selects then banishes in turn order and finalizes plays in next-player order", () => {
  const { game, decks } = fixture();
  const source = decks[0]!.snapshot.cards.find((card) => card.cardCode === "SPELL")!;
  source.behaviorModel.clauses = [
    clause("each-player-top-deck", {
      effects: [binding("action.each_player_choose_top_deck_card_and_play", 0, { count: 2 })],
    }),
  ];
  for (const [playerId, selected, recycled] of [
    ["p1", "p1:draw", "p1:unit"],
    ["p2", "p2:draw", "p2:recycle"],
  ] as const) {
    if (playerId === "p2") {
      decks[1]!.instances.push(
        { instanceId: selected, ownerPlayerId: playerId, source: "mainDeck", cardCode: "UNIT" },
        { instanceId: recycled, ownerPlayerId: playerId, source: "mainDeck", cardCode: "UNIT" },
        { instanceId: "p2:rune", ownerPlayerId: playerId, source: "runeDeck", cardCode: "RUNE" },
      );
      game.state.cardStates[selected] = { exhausted: false, damage: 0, computedMight: 1 };
      game.state.cardStates[recycled] = { exhausted: false, damage: 0, computedMight: 1 };
      game.state.cardStates["p2:rune"] = { exhausted: false, damage: 0, computedMight: null };
      game.state.players.p2!.zones.base.push("p2:rune");
    }
    game.state.players[playerId]!.zones.mainDeck = [selected, recycled];
    game.state.players[playerId]!.power.Mind = playerId === "p1" ? 1 : 0;
  }

  game.state.players.p1!.zones.hand = game.state.players.p1!.zones.hand.filter((id) => id !== "p1:spell");
  game.state.chain = {
    items: [{
      id: "chain:parent-effect",
      kind: "spell",
      label: source.card.name,
      controllerPlayerId: "p1",
      sourceCardInstanceId: "p1:spell",
      targetCardInstanceIds: [],
      targetObjectVersions: {},
      behaviorClauseId: "each-player-top-deck",
      activatedBehaviorId: null,
      behaviorEvent: null,
    }],
    relevantPlayerIds: ["p1", "p2"],
    priorityPlayerId: "p1",
    passedPlayerIds: [],
    resolvingItemId: "chain:parent-effect",
  };

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "p1:spell",
    clauseId: "each-player-top-deck",
    decks,
  }), false);
  assert.equal(game.state.pendingChoice?.playerId, "p1");
  const spectatorChoice = projectGame({ game, viewerPlayerId: "p2", decks }).pendingChoice;
  assert.deepEqual(
    spectatorChoice?.type === "effectSelection" ? spectatorChoice.visibleCards : [],
    [],
  );
  let choose = gameplayActions(game, "p1", decks).find((action) => action.choice?.kind === "effectSelection")!;
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: choose.id,
    selectedIds: ["p1:draw"],
    decks,
    now: "each-player-choose-p1",
  });
  assert.equal(next.state.pendingChoice?.playerId, "p2");
  assert.ok(next.state.players.p1!.zones.banishment.includes("p1:draw"));
  assert.equal(projectGame({ game: next, viewerPlayerId: "p2", decks }).players.find((p) => p.playerId === "p1")?.zones.find((zone) => zone.kind === "banishment")?.cards.some((card) => card.instanceId === "p1:draw"), true);
  choose = gameplayActions(next, "p2", decks).find((action) => action.choice?.kind === "effectSelection")!;
  next = performGameplayAction({
    game: next,
    actorPlayerId: "p2",
    actionId: choose.id,
    selectedIds: ["p2:draw"],
    decks,
    now: "each-player-choose-p2",
  });
  assert.equal(next.state.effectResolutions.length, 0, "the parent resolution finishes before the staged play decision");
  assert.ok(next.state.players.p1!.zones.trash.includes("p1:spell"));
  assert.equal(next.state.chain, null);
  assert.ok(next.state.players.p1!.zones.banishment.includes("p1:draw"));
  assert.equal(next.state.effectPlayQueue?.[0]?.playerId, "p2");
  assert.deepEqual(next.state.players.p1!.zones.mainDeck, ["p1:unit"]);
  assert.deepEqual(next.state.players.p2!.zones.mainDeck, ["p2:recycle"]);
  assert.deepEqual(projectGame({ game: next, viewerPlayerId: "p2", decks }).effectPlayDecision, {
    playerId: "p2",
    stagedCardInstanceId: "p2:draw",
    canDecline: false,
  });
  assert.deepEqual(projectGame({ game: next, viewerPlayerId: "p1", decks }).effectPlayDecision, {
    playerId: "p2",
    stagedCardInstanceId: null,
    canDecline: false,
  });

  const addPower = gameplayActions(next, "p2", decks).find((action) =>
    action.sourceCardInstanceId === "p2:rune" && action.label === "Add Power [Mind]",
  );
  assert.ok(addPower, "a waived-Energy card can prepare its remaining Power cost");
  let play = gameplayActions(next, "p2", decks).find((action) => action.sourceCardInstanceId === "p2:draw")!;
  assert.equal(play.costPreview?.energy, 0);
  assert.equal(play.costPreview?.effectivePower, 1);
  next = performGameplayAction({ game: next, actorPlayerId: "p2", actionId: addPower.id, selectedIds: [], decks, now: "each-player-add-p2" });
  play = gameplayActions(next, "p2", decks).find((action) => action.sourceCardInstanceId === "p2:draw")!;
  next = performGameplayAction({ game: next, actorPlayerId: "p2", actionId: play.id, selectedIds: [], decks, now: "each-player-play-p2" });
  assert.ok(next.state.players.p2!.zones.base.includes("p2:draw"));
  assert.equal(next.state.players.p2!.power.Mind, 0, "Power is paid during finalization");
  assert.equal(next.state.effectPlayQueue?.[0]?.playerId, "p1");
  play = gameplayActions(next, "p1", decks).find((action) => action.sourceCardInstanceId === "p1:draw")!;
  assert.equal(play.costPreview?.energy, 0);
  next = performGameplayAction({ game: next, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "each-player-play-p1" });
  assert.equal(next.state.chain, null);
  assert.equal(next.state.effectPlayQueue?.length, 0);
  assert.equal(next.state.effectResolutions.length, 0);
  assert.ok(next.state.players.p1!.zones.base.includes("p1:draw"));
  assert.ok(next.state.players.p2!.zones.base.includes("p2:draw"));
  assert.equal(next.state.players.p1!.power.Mind, 0);
  assert.equal(next.state.players.p2!.power.Mind, 0);
});

test("an unavailable effect-driven play remains banished and continues the resolution", () => {
  const { game, decks } = fixture();
  const cards = decks[0]!.snapshot.cards as GameCardDefinition[];
  const source = cards.find((card) => card.cardCode === "SPELL")!;
  source.behaviorModel.clauses = [
    clause("each-player-top-deck", {
      effects: [binding("action.each_player_choose_top_deck_card_and_play", 0, { count: 2 })],
    }),
  ];
  const targetSpell = definition("TARGET_SPELL", "Target Spell", "Spell", 0, 0) as GameCardDefinition;
  targetSpell.behaviorModel.clauses = [clause("requires-enemy-unit", {
    selectors: [binding("selector.enemy_unit", 0, {
      area: "battlefield",
      locationRelation: "any",
      minimumCount: 1,
      maximumCount: 1,
    })],
  })];
  cards.push(targetSpell);
  decks[1]!.instances.push(
    { instanceId: "p2:blocked", ownerPlayerId: "p2", source: "mainDeck", cardCode: "TARGET_SPELL" },
    { instanceId: "p2:recycle", ownerPlayerId: "p2", source: "mainDeck", cardCode: "UNIT" },
  );
  game.state.cardStates["p2:blocked"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.cardStates["p2:recycle"] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.players.p1!.zones.mainDeck = ["p1:draw", "p1:unit"];
  game.state.players.p2!.zones.mainDeck = ["p2:blocked", "p2:recycle"];
  game.state.players.p1!.power.Mind = 1;

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "p1:spell",
    clauseId: "each-player-top-deck",
    decks,
  }), false);
  let choice = gameplayActions(game, "p1", decks).find((action) => action.choice?.kind === "effectSelection")!;
  let next = performGameplayAction({
    game, actorPlayerId: "p1", actionId: choice.id, selectedIds: ["p1:draw"], decks, now: "blocked-choose-p1",
  });
  choice = gameplayActions(next, "p2", decks).find((action) => action.choice?.kind === "effectSelection")!;
  next = performGameplayAction({
    game: next, actorPlayerId: "p2", actionId: choice.id, selectedIds: ["p2:blocked"], decks, now: "blocked-choose-p2",
  });
  const p2Actions = gameplayActions(next, "p2", decks);
  assert.equal(p2Actions.some((action) => action.sourceCardInstanceId === "p2:blocked"), false);
  const continueAction = p2Actions.find((action) => action.label === "Continue");
  assert.ok(continueAction);
  next = performGameplayAction({
    game: next, actorPlayerId: "p2", actionId: continueAction.id, selectedIds: [], decks, now: "blocked-continue",
  });
  assert.ok(next.state.players.p2!.zones.banishment.includes("p2:blocked"));
  assert.deepEqual(next.state.players.p2!.zones.mainDeck, ["p2:recycle"]);
  assert.equal(next.state.effectPlayQueue?.[0]?.playerId, "p1");
  const play = gameplayActions(next, "p1", decks).find((action) => action.sourceCardInstanceId === "p1:draw")!;
  next = performGameplayAction({
    game: next, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "blocked-play-p1",
  });
  assert.equal(next.state.effectPlayQueue?.length, 0);
  assert.equal(next.state.effectResolutions.length, 0);
});

test("effect-driven spells enter the Chain in next-player play order", () => {
  const { game, decks } = fixture();
  const cards = decks[0]!.snapshot.cards as GameCardDefinition[];
  const source = cards.find((card) => card.cardCode === "SPELL")!;
  source.behaviorModel.clauses = [
    clause("each-player-top-deck", {
      effects: [binding("action.each_player_choose_top_deck_card_and_play", 0, { count: 1 })],
    }),
  ];
  cards.push(definition("STAGED_SPELL", "Staged Spell", "Spell", 0, 0) as GameCardDefinition);
  decks[0]!.instances.push({
    instanceId: "p1:staged-spell", ownerPlayerId: "p1", source: "mainDeck", cardCode: "STAGED_SPELL",
  });
  decks[1]!.instances.push({
    instanceId: "p2:staged-spell", ownerPlayerId: "p2", source: "mainDeck", cardCode: "STAGED_SPELL",
  });
  game.state.cardStates["p1:staged-spell"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.cardStates["p2:staged-spell"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.players.p1!.zones.mainDeck = ["p1:staged-spell"];
  game.state.players.p2!.zones.mainDeck = ["p2:staged-spell"];
  game.state.players.p1!.zones.hand = game.state.players.p1!.zones.hand.filter((id) => id !== "p1:spell");
  game.state.chain = {
    items: [{
      id: "chain:parent-effect", kind: "spell", label: source.card.name,
      controllerPlayerId: "p1", sourceCardInstanceId: "p1:spell",
      targetCardInstanceIds: [], targetObjectVersions: {},
      behaviorClauseId: "each-player-top-deck", activatedBehaviorId: null,
      behaviorEvent: null,
    }],
    relevantPlayerIds: ["p1", "p2"], priorityPlayerId: "p1",
    passedPlayerIds: [], resolvingItemId: "chain:parent-effect",
  };

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "p1:spell",
    clauseId: "each-player-top-deck",
    decks,
  }), false);
  let choice = gameplayActions(game, "p1", decks).find((action) => action.choice?.kind === "effectSelection")!;
  let next = performGameplayAction({
    game, actorPlayerId: "p1", actionId: choice.id, selectedIds: ["p1:staged-spell"], decks, now: "staged-spell-choose-p1",
  });
  choice = gameplayActions(next, "p2", decks).find((action) => action.choice?.kind === "effectSelection")!;
  next = performGameplayAction({
    game: next, actorPlayerId: "p2", actionId: choice.id, selectedIds: ["p2:staged-spell"], decks, now: "staged-spell-choose-p2",
  });
  assert.equal(next.state.players.p1!.zones.trash.includes("p1:spell"), true);
  assert.equal(next.state.chain, null);
  for (const playerId of ["p2", "p1"] as const) {
    const play = gameplayActions(next, playerId, decks).find((action) =>
      action.sourceCardInstanceId === `${playerId}:staged-spell`,
    )!;
    next = performGameplayAction({
      game: next, actorPlayerId: playerId, actionId: play.id, selectedIds: [], decks, now: `staged-spell-play-${playerId}`,
    });
  }
  assert.deepEqual(
    next.state.chain?.items.map((item) => item.sourceCardInstanceId),
    ["p2:staged-spell", "p1:staged-spell"],
  );
  assert.equal(next.state.chain?.priorityPlayerId, "p1");
  assert.equal(next.state.effectPlayQueue?.length, 0);
});

test("a public reveal-until instruction plays the first matching card with both base costs ignored", () => {
  const { game, decks } = fixture();
  const unit = decks[0]!.snapshot.cards.find((card) => card.cardCode === "UNIT")!;
  unit.card.attributes.energy = 2;
  unit.card.attributes.power = 1;
  const source = decks[0]!.snapshot.cards.find((card) => card.cardCode === "BF")!;
  source.behaviorModel.clauses = [
    clause("reveal-until-unit", {
      effects: [binding("action.reveal_until_card_type_and_play", 0, {
        cardType: "Unit",
        ignoreBaseCosts: true,
      })],
    }),
    clause("cost-increase", {
      sequence: 1,
      effects: [binding("modifier.modify_numeric_value", 0, {
        attribute: "energyCost",
        operation: "increase",
        amount: 1,
        target: "controller_card",
        duration: "whileSourceAtBattlefield",
      }), binding("modifier.modify_numeric_value", 1, {
        attribute: "powerCost",
        operation: "increase",
        amount: 1,
        target: "controller_card",
        duration: "whileSourceAtBattlefield",
      })],
    }),
  ];
  decks[0]!.instances.push({
    instanceId: "p1:revealed-unit", ownerPlayerId: "p1", source: "mainDeck", cardCode: "UNIT",
  });
  game.state.cardStates["p1:revealed-unit"] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.players.p1!.energy = 1;
  game.state.players.p1!.power.Mind = 1;
  game.state.players.p1!.zones.mainDeck = ["p1:spell", "p1:revealed-unit", "p1:unit"];
  game.state.players.p1!.zones.hand = game.state.players.p1!.zones.hand.filter((id) => id !== "p1:spell");

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "p1:bf",
    clauseId: "reveal-until-unit",
    decks,
  }), false);
  assert.deepEqual(
    game.state.publicReveals?.[0]?.cardInstanceIds,
    ["p1:spell", "p1:revealed-unit"],
  );
  const play = gameplayActions(game, "p1", decks).find((action) =>
    action.sourceCardInstanceId === "p1:revealed-unit",
  )!;
  assert.equal(play.costPreview?.energy, 1, "the Energy increase applies after the waived printed Energy cost");
  assert.equal(play.costPreview?.effectivePower, 1, "the Power increase applies after the waived printed Power cost");
  const next = performGameplayAction({
    game, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "reveal-until-play",
  });
  assert.ok(next.state.players.p1!.zones.base.includes("p1:revealed-unit"));
  assert.equal(next.state.players.p1!.energy, 0);
  assert.equal(next.state.players.p1!.power.Mind, 0);
  assert.deepEqual(next.state.players.p1!.zones.mainDeck, ["p1:unit", "p1:spell"]);
  assert.equal(next.state.effectPlayQueue?.length, 0);
  assert.equal(next.state.effectResolutions.length, 0);
});

test("effect-driven play resumes a resolving end-of-turn trigger exactly once", () => {
  const { game, decks } = fixture();
  const unit = decks[0]!.snapshot.cards.find((card) => card.cardCode === "UNIT")!;
  unit.behaviorModel.clauses = [
    clause("end-of-turn-effect-play", {
      triggers: [binding("trigger.end_of_turn", 0, { player: "controller" })],
      effects: [binding("action.reveal_until_card_type_and_play", 1, {
        cardType: "Unit",
        ignoreBaseCosts: true,
      })],
    }),
  ];
  decks[0]!.instances.push(
    { instanceId: "p1:effect-play-unit", ownerPlayerId: "p1", source: "mainDeck", cardCode: "UNIT" },
  );
  game.state.players.p1!.zones.mainDeck = ["p1:effect-play-unit"];
  game.state.cardStates["p1:effect-play-unit"] = { exhausted: false, damage: 0, computedMight: 1 };

  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: gameplayActions(game, "p1", decks).find((action) => action.id.split(":")[3] === "endTurn")!.id,
    selectedIds: [],
    decks,
    now: "effect-play-end-turn",
  });
  assert.equal(next.state.chain?.items.length, 1);
  for (const playerId of ["p1", "p2"] as const) {
    const pass = gameplayActions(next, playerId, decks).find((action) => action.label === "Pass priority")!;
    next = performGameplayAction({
      game: next,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `effect-play-end-trigger-pass-${playerId}`,
    });
  }

  assert.equal(next.state.effectPlayQueue?.[0]?.cardInstanceId, "p1:effect-play-unit");
  const stagedPlay = projectGame({ game: next, viewerPlayerId: "p1", decks }).effectPlayDecision;
  assert.equal(stagedPlay?.stagedCardInstanceId, "p1:effect-play-unit");
  assert.equal(stagedPlay?.canDecline, false, "a publicly revealed required play cannot be declined");
  const play = gameplayActions(next, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:effect-play-unit" && action.id.split(":")[3] === "play",
  )!;
  next = performGameplayAction({
    game: next,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: [],
    decks,
    now: "effect-play-end-trigger-play",
  });

  assert.equal(next.state.effectPlayQueue?.length, 0);
  assert.equal(next.state.effectResolutions.length, 0);
  assert.equal(next.state.chain, null);
  assert.equal(next.state.turn?.activePlayerId, "p2");
  assert.equal(next.state.turn?.phase, "action");
  assert.ok(next.state.players.p1!.zones.base.includes("p1:effect-play-unit"));
});

test("effect-driven permanent play pauses its parent for the normal on-play trigger Chain", () => {
  const { game, decks } = fixture();
  const source = definition("PLAY_SOURCE", "Effect Source", "Unit", 0, 1) as GameCardDefinition;
  source.behaviorModel.clauses = [clause("end-effect-play", {
    triggers: [binding("trigger.end_of_turn", 0, { player: "controller" })],
    effects: [binding("action.reveal_until_card_type_and_play", 1, {
      cardType: "Unit", ignoreBaseCosts: true,
    })],
  })];
  const target = definition("PLAY_TARGET", "Effect Target", "Unit", 0, 1) as GameCardDefinition;
  target.behaviorModel.clauses = [clause("on-play-target", {
    triggers: [binding("trigger.on_play", 0, { actor: "controller", subject: "source" })],
    selectors: [binding("selector.enemy_unit", 1, {
      area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1,
      selectionKey: "target",
    })],
    effects: [binding("action.deal_damage", 2, {
      amount: 1, selectionKey: "target",
    })],
  })];
  decks[0]!.snapshot.cards.push(source, target);
  decks[0]!.instances.push(
    { instanceId: "p1:effect-source", ownerPlayerId: "p1", source: "mainDeck", cardCode: "PLAY_SOURCE" },
    { instanceId: "p1:effect-target", ownerPlayerId: "p1", source: "mainDeck", cardCode: "PLAY_TARGET" },
  );
  decks[1]!.instances.push({
    instanceId: "p2:trigger-target", ownerPlayerId: "p2", source: "mainDeck", cardCode: "UNIT",
  });
  game.state.players.p1!.zones.base.push("p1:effect-source");
  game.state.players.p1!.zones.mainDeck = ["p1:effect-target"];
  game.state.battlefields[0]!.units.push("p2:trigger-target");
  game.state.cardStates["p1:effect-source"] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.cardStates["p1:effect-target"] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.cardStates["p2:trigger-target"] = { exhausted: true, damage: 0, computedMight: 1 };

  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: gameplayActions(game, "p1", decks).find((action) => action.id.split(":")[3] === "endTurn")!.id,
    selectedIds: [], decks, now: "effect-play-onplay-end-turn",
  });
  for (const playerId of ["p1", "p2"] as const) {
    const pass = gameplayActions(next, playerId, decks).find((action) => action.label === "Pass priority")!;
    next = performGameplayAction({
      game: next, actorPlayerId: playerId, actionId: pass.id,
      selectedIds: [], decks, now: `effect-play-onplay-pass-${playerId}`,
    });
  }
  const play = gameplayActions(next, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:effect-target",
  )!;
  next = performGameplayAction({
    game: next, actorPlayerId: "p1", actionId: play.id,
    selectedIds: [], decks, now: "effect-play-onplay-play",
  });

  assert.equal(next.state.effectPlayQueue?.length, 0);
  assert.equal(next.state.effectResolutions.length, 0);
  assert.equal(next.state.pendingChoice?.type, "effectSelection");
  assert.ok(next.state.pendingChoice?.type === "effectSelection" && next.state.pendingChoice.chainItem);
  const targetChoice = gameplayActions(next, "p1", decks).find((action) =>
    action.id.includes(":submitChoice:"),
  )!;
  next = performGameplayAction({
    game: next, actorPlayerId: "p1", actionId: targetChoice.id,
    selectedIds: ["p2:trigger-target"], decks, now: "effect-play-onplay-target",
  });
  assert.equal(next.state.chain?.items.filter((item) => item.sourceCardInstanceId === "p1:effect-source").length, 0);
  assert.equal(next.state.chain?.items.length, 1);
  assert.equal(next.state.chain?.items[0]?.sourceCardInstanceId, "p1:effect-target");
  assert.deepEqual(next.state.chain?.items[0]?.targetCardInstanceIds, ["p2:trigger-target"]);
});

test("banishment effect-play uses the target owner and captured location", () => {
  const { game, decks } = fixture();
  const source = decks[0]!.snapshot.cards.find((card) => card.cardCode === "SPELL")!;
  source.behaviorModel.clauses = [
    clause("banish-and-return-play", {
      selectors: [binding("selector.unit", 0, {
        area: "board",
        locationRelation: "any",
        minimumCount: 1,
        maximumCount: 1,
        selectionKey: "target",
      })],
      effects: [
        binding("action.banish_card", 1, {
          target: "unit",
          selectionKey: "target",
          captureLocationAs: "capturedLocations",
        }),
        binding("action.play_banished_card", 2, {
          selectionKey: "target",
          capturedLocationsKey: "capturedLocations",
          ignoreBaseCosts: true,
        }),
      ],
    }),
  ];
  const unit = decks[0]!.snapshot.cards.find((card) => card.cardCode === "UNIT")!;
  unit.card.attributes.energy = 2;
  unit.card.attributes.power = 1;
  decks[1]!.instances.push({
    instanceId: "p2:target",
    ownerPlayerId: "p2",
    source: "mainDeck",
    cardCode: "UNIT",
  });
  game.state.cardStates["p2:target"] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.players.p1!.zones.base = game.state.players.p1!.zones.base.filter((id) => id !== "p1:mover");
  game.state.battlefields[0]!.controllerPlayerId = "p1";
  game.state.battlefields[0]!.units = ["p2:target"];
  game.state.players.p2!.energy = 2;
  game.state.players.p2!.power = { Mind: 1 };

  const declaration = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:spell",
  )!;
  assert.deepEqual(declaration.targets.map((target) => target.legalIds), [["p2:target"]]);
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: declaration.id,
    selectedIds: ["p2:target"],
    decks,
    now: "banishment-declaration",
  });
  assert.deepEqual(next.state.chain?.items[0]?.targetCardInstanceIds, ["p2:target"]);
  assert.deepEqual(next.state.battlefields[0]!.units, ["p2:target"]);
  for (const playerId of ["p1", "p2"] as const) {
    const pass = gameplayActions(next, playerId, decks).find(
      (action) => action.label === "Pass priority",
    )!;
    next = performGameplayAction({
      game: next, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks,
      now: `banishment-priority-${playerId}`,
    });
  }
  assert.equal(next.state.effectPlayQueue?.[0]?.playerId, "p2");
  assert.equal(next.state.effectPlayQueue?.[0]?.forcedDestinationId, "p1:bf");
  assert.equal(next.state.players.p2!.zones.banishment.includes("p2:target"), false);
  assert.equal(next.state.players.p2!.zones.hand.includes("p2:target"), true);

  const play = gameplayActions(next, "p2", decks).find(
    (action) => action.sourceCardInstanceId === "p2:target",
  )!;
  assert.equal(play.costPreview?.energy, 0);
  assert.equal(play.costPreview?.effectivePower, 0);
  assert.match(play.label, /Arena/);
  next = performGameplayAction({
    game: next,
    actorPlayerId: "p2",
    actionId: play.id,
    selectedIds: [],
    decks,
    now: "banishment-play",
  });
  assert.deepEqual(next.state.battlefields[0]!.units, ["p2:target"]);
  assert.equal(next.state.players.p2!.zones.base.includes("p2:target"), false);
  assert.equal(next.state.players.p2!.zones.banishment.includes("p2:target"), false);
  assert.equal(next.state.effectPlayQueue?.length, 0);
  assert.equal(next.state.effectResolutions.length, 0);
  assert.equal(next.state.players.p2!.energy, 2);
  assert.deepEqual(next.state.players.p2!.power, { Mind: 1 });
});

test("an ineligible banishment effect-play stays banished and continues resolution", () => {
  const { game, decks } = fixture();
  const source = decks[0]!.snapshot.cards.find((card) => card.cardCode === "BF")!;
  source.behaviorModel.clauses = [
    clause("banish-and-play", {
      selectors: [binding("selector.unit", 0, {
        area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1,
        selectionKey: "target",
      })],
      effects: [
        binding("action.banish_card", 1, {
          target: "unit", selectionKey: "target", captureLocationAs: "locations",
        }),
        binding("action.play_banished_card", 2, {
          selectionKey: "target", capturedLocationsKey: "locations", ignoreBaseCosts: true,
        }),
        binding("action.gain_xp", 3, { amount: 1 }),
      ],
    }),
  ];
  const unit = decks[0]!.snapshot.cards.find((card) => card.cardCode === "UNIT")!;
  unit.behaviorModel.clauses = [clause("needs-play-target", {
    selectors: [binding("selector.enemy_unit", 0, {
      area: "battlefield", locationRelation: "any", minimumCount: 1, maximumCount: 1,
    })],
  })];
  decks[1]!.instances.push({
    instanceId: "p2:target", ownerPlayerId: "p2", source: "mainDeck", cardCode: "UNIT",
  });
  game.state.cardStates["p2:target"] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.battlefields[0]!.controllerPlayerId = "p1";
  game.state.battlefields[0]!.units = ["p2:target"];

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "p1:bf",
    clauseId: "banish-and-play",
    selectedIds: ["p2:target"],
    decks,
  }), false);
  assert.equal(gameplayActions(game, "p1", decks).some(
    (action) => action.sourceCardInstanceId === "p2:target",
  ), false);
  const p2Actions = gameplayActions(game, "p2", decks);
  assert.equal(p2Actions.some((action) => action.id.split(":")[3] === "play"), false);
  const continueAction = p2Actions.find((action) => action.label === "Continue")!;
  const next = performGameplayAction({
    game,
    actorPlayerId: "p2",
    actionId: continueAction.id,
    selectedIds: [],
    decks,
    now: "banishment-continue",
  });
  assert.deepEqual(next.state.players.p2!.zones.banishment, ["p2:target"]);
  assert.equal(next.state.players.p2!.zones.hand.includes("p2:target"), false);
  assert.equal(next.state.players.p1!.xp, 1);
  assert.equal(next.state.effectPlayQueue?.length, 0);
  assert.equal(next.state.effectResolutions.length, 0);
});

test("banishment effect-play preserves the identity of a Base destination", () => {
  const { game, decks } = fixture();
  const source = decks[0]!.snapshot.cards.find((card) => card.cardCode === "BF")!;
  source.behaviorModel.clauses = [
    clause("banish-and-return-play", {
      selectors: [binding("selector.unit", 0, {
        area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1,
        selectionKey: "target",
      })],
      effects: [
        binding("action.banish_card", 1, {
          target: "unit", selectionKey: "target", captureLocationAs: "locations",
        }),
        binding("action.play_banished_card", 2, {
          selectionKey: "target", capturedLocationsKey: "locations", ignoreBaseCosts: true,
        }),
      ],
    }),
  ];
  decks[1]!.instances.push({
    instanceId: "p2:target", ownerPlayerId: "p2", source: "mainDeck", cardCode: "UNIT",
  });
  game.state.cardStates["p2:target"] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.players.p1!.zones.base.push("p2:target");

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "p1:bf",
    clauseId: "banish-and-return-play",
    selectedIds: ["p2:target"],
    decks,
  }), false);
  assert.equal(game.state.effectPlayQueue?.[0]?.forcedDestinationId, "base");
  assert.equal(game.state.effectPlayQueue?.[0]?.destinationBasePlayerId, "p1");
  const play = gameplayActions(game, "p2", decks).find(
    (action) => action.sourceCardInstanceId === "p2:target",
  )!;
  const next = performGameplayAction({
    game, actorPlayerId: "p2", actionId: play.id, selectedIds: [], decks, now: "base-return-play",
  });
  assert.ok(next.state.players.p1!.zones.base.includes("p2:target"));
  assert.equal(next.state.players.p2!.zones.base.includes("p2:target"), false);
});

test("a banished Unit token ceases to exist before a linked effect-play", () => {
  const { game, decks } = fixture();
  const source = decks[0]!.snapshot.cards.find((card) => card.cardCode === "BF")!;
  source.behaviorModel.clauses = [
    clause("banish-and-return-play", {
      selectors: [binding("selector.unit", 0, {
        area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1,
        selectionKey: "target",
      })],
      effects: [
        binding("action.banish_card", 1, {
          target: "unit", selectionKey: "target", captureLocationAs: "locations",
        }),
        binding("action.play_banished_card", 2, {
          selectionKey: "target", capturedLocationsKey: "locations", ignoreBaseCosts: true,
        }),
      ],
    }),
  ];
  decks[1]!.instances.push({
    instanceId: "p2:token", ownerPlayerId: "p2", source: "token", cardCode: "UNIT",
  });
  game.state.cardStates["p2:token"] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.battlefields[0]!.units = ["p2:token"];

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "p1:bf",
    clauseId: "banish-and-return-play",
    selectedIds: ["p2:token"],
    decks,
  }), true);
  assert.equal(game.state.cardStates["p2:token"], undefined);
  assert.equal(decks[1]!.instances.some((instance) => instance.instanceId === "p2:token"), true);
  assert.equal(game.state.players.p2!.zones.banishment.includes("p2:token"), false);
  assert.equal(game.state.players.p2!.zones.hand.includes("p2:token"), false);
  assert.equal(game.state.effectPlayQueue?.length, 0);
});

test("committed modal Repeat declarations project only legal mode-target combinations", () => {
  const { game, decks } = fixture();
  const spell = decks[0]!.snapshot.cards.find((card) => card.cardCode === "SPELL")!;
  spell.card.attributes.energy = 1;
  spell.behaviorModel.clauses = [
    clause("modal-repeat", {
      keywords: [binding("keyword.repeat", 0, { energyCost: 1, powerCost: 1 })],
      selectors: [
        binding("selector.unit", 1, {
          area: "base", locationRelation: "any", minimumCount: 1, maximumCount: 1,
          selectionKey: "target", onlyIfSelectionKey: "mode", onlyIfSelectionValue: "yes",
        }),
        binding("selector.gear", 2, {
          minimumCount: 1, maximumCount: 1,
          selectionKey: "target", onlyIfSelectionKey: "mode", onlyIfSelectionValue: "no",
        }),
      ],
      effects: [
        binding("action.optional", 3, {
          effectKey: "damage", prompt: "Choose one", yesLabel: "Damage", noLabel: "Destroy",
          selectionKey: "mode", commitAtPlay: true,
        }),
        binding("action.deal_damage", 4, {
          amount: 4, target: "unit", selectionKey: "target",
          onlyIfEffectKey: "damage", onlyIfEffectValue: true,
        }),
        binding("action.kill_card", 5, {
          selectionKey: "target", onlyIfEffectKey: "damage", onlyIfEffectValue: false,
        }),
      ],
    }),
  ];
  decks[0]!.snapshot.cards.push(
    definition("MODAL_UNIT", "Modal unit", "Unit", 0, 5),
    definition("MODAL_GEAR", "Modal gear", "Gear", 0, 0),
  );
  decks[1]!.instances.push(
    { instanceId: "p2:modal-unit", ownerPlayerId: "p2", source: "mainDeck", cardCode: "MODAL_UNIT" },
    { instanceId: "p2:modal-gear", ownerPlayerId: "p2", source: "mainDeck", cardCode: "MODAL_GEAR" },
  );
  game.state.players.p2!.zones.base.push("p2:modal-unit", "p2:modal-gear");
  game.state.cardStates["p2:modal-unit"] = { exhausted: false, damage: 0, computedMight: 5 };
  game.state.cardStates["p2:modal-gear"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.players.p1!.energy = 2;
  game.state.players.p1!.power.Mind = 2;

  const modes = gameplayActions(game, "p1", decks).filter(
    (action) => action.sourceCardInstanceId === "p1:spell",
  );
  const normal = modes.filter((action) => !action.label.startsWith("[Repeat]"));
  const repeated = modes.filter((action) => action.label.startsWith("[Repeat]"));
  assert.equal(normal.length, 2);
  assert.equal(repeated.length, 4);
  assert.ok(repeated.every((action) => action.presentation.playCost?.label.startsWith("[Repeat] Play")));
  assert.ok(normal.some((action) => action.targets.some((target) =>
    target.legalIds.includes("p2:modal-unit"),
  )));
  assert.ok(normal.some((action) => action.targets.some((target) =>
    target.legalIds.includes("p2:modal-gear"),
  )));
  assert.deepEqual(
    new Set(repeated.map((action) => action.targets.filter((target) => target.maximum > 0)
      .map((target) => target.legalIds.includes("p2:modal-unit") ? "unit" : "gear").join("->"))),
    new Set([
      "unit->unit",
      "unit->gear",
      "gear->unit",
      "gear->gear",
    ]),
  );

  const withoutUnit = structuredClone(game);
  withoutUnit.state.players.p1!.zones.base = withoutUnit.state.players.p1!.zones.base.filter(
    (id) => id !== "p1:mover",
  );
  withoutUnit.state.players.p2!.zones.base = withoutUnit.state.players.p2!.zones.base.filter(
    (id) => id !== "p2:modal-unit",
  );
  const noUnitModes = gameplayActions(withoutUnit, "p1", decks).filter(
    (action) => action.sourceCardInstanceId === "p1:spell",
  );
  assert.equal(noUnitModes.filter((action) => !action.label.startsWith("[Repeat]")).length, 1);
  assert.equal(noUnitModes.filter((action) => action.label.startsWith("[Repeat]")).length, 1);

  const normalOnly = structuredClone(game);
  normalOnly.state.players.p1!.energy = 1;
  normalOnly.state.players.p1!.power = {};
  normalOnly.state.players.p1!.zones.base = normalOnly.state.players.p1!.zones.base.filter(
    (id) => id !== "p1:rune" && id !== "p1:rune-b",
  );
  assert.equal(
    gameplayActions(normalOnly, "p1", decks).filter(
      (action) => action.sourceCardInstanceId === "p1:spell" && action.label.startsWith("[Repeat]"),
    ).length,
    0,
  );
  const unaffordable = structuredClone(normalOnly);
  unaffordable.state.players.p1!.energy = 0;
  assert.equal(
    gameplayActions(unaffordable, "p1", decks).filter(
      (action) => action.sourceCardInstanceId === "p1:spell",
    ).length,
    0,
  );

  const repeat = repeated.find((action) => action.targets.filter((target) => target.maximum > 0)
    .map((target) => target.legalIds.includes("p2:modal-unit") ? "unit" : "gear").join("->") === "unit->gear")!;
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: repeat.id,
    selectedIds: [],
    targetSelections: {
      "repeat:0": ["p2:modal-unit"],
      "repeat:1": ["p2:modal-gear"],
    },
    decks,
    now: "modal-repeat-play",
  });
  assert.equal(next.state.pendingChoice, null);
  assert.deepEqual(next.state.chain?.items.at(-1)?.preplayOptionSelections, [
    { mode: ["yes"] },
    { mode: ["no"] },
  ]);
  assert.deepEqual(next.state.chain?.items.at(-1)?.initialSelectionOverrides, {
    mode: ["yes"],
    target: ["p2:modal-unit"],
  });
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(next, playerId, decks).find((action) => action.label === "Pass priority")!;
    next = performGameplayAction({ game: next, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks, now: `modal-repeat-pass-${playerId}` });
  }
  assert.equal(next.state.cardStates["p2:modal-unit"]!.damage, 4);
  assert.ok(next.state.players.p2!.zones.trash.includes("p2:modal-gear"));
});

test("modal recycle-or-draw effects use the server-authorized option and card-selection decisions", () => {
  const { game, decks } = fixture();
  const modalSpell = definition("MODAL_RECYCLER", "Modal recycler spell", "Spell", 0, 0) as GameCardDefinition;
  modalSpell.behaviorModel.clauses.push(
    clause("dispose", {
      timings: [binding("timing.reaction", 0, {})],
      effects: [
        binding("action.optional", 1, {
          effectKey: "recycle",
          prompt: "Choose an effect",
          yesLabel: "Recycle up to 3 cards from opponents' trashes",
          noLabel: "Draw 1",
        }),
        binding("action.recycle_cards", 2, {
          target: "card",
          selectFromZone: "trash",
          owner: "opponent",
          cardType: "any",
          minimumCount: 0,
          maximumCount: 3,
          prompt: "Choose up to 3 cards to recycle",
          onlyIfEffectKey: "recycle",
          onlyIfEffectValue: true,
        }),
        binding("action.draw_cards", 3, {
          player: "controller",
          count: 1,
          onlyIfEffectKey: "recycle",
          onlyIfEffectValue: false,
        }),
      ],
    }),
  );
  decks[0]!.snapshot.cards.push(modalSpell);
  decks[0]!.instances.push({
    instanceId: "p1:modal-recycler",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "MODAL_RECYCLER",
  });
  decks[1]!.instances.push(
    { instanceId: "p2:unit", ownerPlayerId: "p2", source: "mainDeck", cardCode: "UNIT" },
    { instanceId: "p2:spell", ownerPlayerId: "p2", source: "mainDeck", cardCode: "SPELL" },
  );
  game.state.cardStates["p1:modal-recycler"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.cardStates["p2:unit"] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.cardStates["p2:spell"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.players.p2!.zones.trash.push("p2:unit", "p2:spell");

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "p1:modal-recycler",
    clauseId: "dispose",
    decks,
  }), false);
  assert.equal(game.state.pendingChoice?.type, "effectOption");
  const chooseMode = gameplayActions(game, "p1", decks).find(
    (action) => action.choice?.kind === "effectOption",
  );
  assert.ok(chooseMode);
  let resolved = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: chooseMode.id,
    selectedIds: ["yes"],
    decks,
    now: "choose-recycle",
  });
  assert.equal(resolved.state.pendingChoice?.type, "effectSelection");
  assert.deepEqual(resolved.state.pendingChoice?.legalCardIds.sort(), ["p2:spell", "p2:unit"]);
  const chooseCards = gameplayActions(resolved, "p1", decks).find(
    (action) => action.choice?.kind === "effectSelection",
  );
  assert.ok(chooseCards);
  resolved = performGameplayAction({
    game: resolved,
    actorPlayerId: "p1",
    actionId: chooseCards.id,
    selectedIds: ["p2:unit", "p2:spell"],
    decks,
    now: "choose-recycled-cards",
  });

  assert.deepEqual(resolved.state.players.p2!.zones.trash, []);
  assert.deepEqual(resolved.state.players.p2!.zones.mainDeck.sort(), ["p2:spell", "p2:unit"]);
  assert.equal(resolved.state.players.p1!.zones.hand.includes("p1:draw"), false);
});

test("committed modal play declarations capture their mode and public targets before the Chain", () => {
  const { game, decks } = fixture();
  const modalSpell = definition("MODAL_SPELL", "Modal Spell", "Spell", 0, 0) as GameCardDefinition;
  modalSpell.behaviorModel.clauses.push(clause("modal", {
    timings: [binding("timing.action", 0, {})],
    selectors: [binding("selector.card", 1, {
      zone: "trash",
      owner: "opponent",
      cardType: "any",
      minimumCount: 0,
      maximumCount: 3,
      selectionKey: "recycledCards",
      onlyIfSelectionKey: "mode",
      onlyIfSelectionValue: "yes",
    })],
    effects: [
      binding("action.optional", 1, {
        effectKey: "recycle",
        prompt: "Choose an effect",
        yesLabel: "Recycle up to 3 cards from opponents' trashes",
        noLabel: "Draw 1",
        selectionKey: "mode",
        commitAtPlay: true,
      }),
      binding("action.recycle_cards", 2, {
        target: "card",
        selectFromZone: "trash",
        owner: "opponent",
        cardType: "any",
        minimumCount: 0,
        maximumCount: 3,
        selectionKey: "recycledCards",
        onlyIfEffectKey: "recycle",
        onlyIfEffectValue: true,
        onlyIfSelectionKey: "mode",
        onlyIfSelectionValue: "yes",
      }),
      binding("action.draw_cards", 3, {
        player: "controller",
        count: 1,
        onlyIfEffectKey: "recycle",
        onlyIfEffectValue: false,
      }),
    ],
  }));
  decks[0]!.snapshot.cards.push(modalSpell);
  decks[0]!.instances.push({
    instanceId: "p1:modal-spell",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "MODAL_SPELL",
  });
  game.state.players.p1!.zones.hand.push("p1:modal-spell");
  game.state.players.p2!.zones.trash.push("p2:unit", "p2:spell");
  decks[1]!.instances.push(
    { instanceId: "p2:unit", ownerPlayerId: "p2", source: "mainDeck", cardCode: "UNIT" },
    { instanceId: "p2:spell", ownerPlayerId: "p2", source: "mainDeck", cardCode: "SPELL" },
  );
  game.state.cardStates["p1:modal-spell"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.cardStates["p2:unit"] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.cardStates["p2:spell"] = { exhausted: false, damage: 0, computedMight: null };

  const modes = gameplayActions(game, "p1", decks).filter(
    (action) => action.sourceCardInstanceId === "p1:modal-spell",
  );
  assert.equal(modes.length, 2);
  const recycleMode = modes.find((action) => action.targets.length > 0)!;
  const drawMode = modes.find((action) => action.targets.length === 0)!;
  assert.deepEqual(recycleMode.targets[0]?.legalIds, ["p2:unit", "p2:spell"]);
  assert.equal(recycleMode.presentation.playCost?.declarationLabel, "Recycle up to 3 cards from opponents' trashes");
  assert.equal(drawMode.presentation.playCost?.declarationLabel, "Draw 1");

  const played = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: recycleMode.id,
    selectedIds: ["p2:unit"],
    decks,
    now: "declare-modal-play",
  });
  assert.equal(played.state.pendingChoice, null);
  assert.deepEqual(played.state.chain?.items[0]?.initialSelectionOverrides, {
    mode: ["yes"],
    recycledCards: ["p2:unit"],
  });

  const resolving = structuredClone(played);
  const completed = beginEffectResolution({
    game: resolving,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "p1:modal-spell",
    clauseId: "modal",
    selectedIds: ["p2:unit"],
    selectionOverrides: played.state.chain!.items[0]!.initialSelectionOverrides,
    decks,
  });
  assert.equal(completed, true);
  assert.equal(resolving.state.pendingChoice, null);
  assert.equal(resolving.state.players.p2!.zones.trash.includes("p2:unit"), false);
  assert.equal(resolving.state.players.p2!.zones.mainDeck.includes("p2:unit"), true);
  assert.equal(drawMode.targets.length, 0);
});

test("activated recycle selections are paid before the ability enters the Chain", () => {
  const { game, decks } = fixture();
  const source = definition("ACTIVATED_SOURCE", "Activated Source", "Gear", 0, 0) as GameCardDefinition;
  source.behaviorModel.clauses.push(
    clause("recycle-for-draw", {
      abilities: [binding("ability.activated_effect", 0, {})],
      selectors: [
        binding("selector.card", 1, {
          zone: "trash",
          cardType: "any",
          owner: "controller",
          minimumCount: 3,
          maximumCount: 3,
          selectionKey: "recycledCards",
        }),
      ],
      costs: [
        binding("cost.recycle_selected_cards", 2, {
          count: 3,
          selectionKey: "recycledCards",
        }),
        binding("cost.pay", 3, { amount: 1, resource: "energy" }),
        binding("cost.exhaust_source", 4, {}),
      ],
      effects: [binding("action.draw_cards", 5, { count: 1 })],
    }),
  );
  decks[0]!.snapshot.cards.push(source);
  decks[0]!.instances.push({
    instanceId: "p1:activated-source",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "ACTIVATED_SOURCE",
  });
  game.state.players.p1!.zones.base.push("p1:activated-source");
  game.state.players.p1!.zones.trash.push("p1:unit", "p1:spell", "p1:mover");
  game.state.players.p1!.zones.hand = [];
  game.state.players.p1!.energy = 1;
  game.state.cardStates["p1:activated-source"] = {
    exhausted: false,
    damage: 0,
    computedMight: 1,
  };

  const ability = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:activated-source",
  );
  assert.ok(ability?.enabled);
  assert.deepEqual(ability.targets[0]?.legalIds.sort(), [
    "p1:mover",
    "p1:spell",
    "p1:unit",
  ]);

  const activated = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: ability.id,
    selectedIds: ["p1:unit", "p1:spell", "p1:mover"],
    decks,
    now: "recycle-cost",
  });

  assert.deepEqual(activated.state.players.p1!.zones.trash, []);
  assert.deepEqual(
    activated.state.players.p1!.zones.mainDeck.slice(-3).sort(),
    ["p1:mover", "p1:spell", "p1:unit"],
  );
  assert.equal(activated.state.players.p1!.energy, 0);
  assert.equal(activated.state.cardStates["p1:activated-source"]!.exhausted, true);
  assert.equal(activated.state.chain?.items.at(-1)?.kind, "activatedAbility");

  let resolved = activated;
  for (const playerId of ["p1", "p2"] as const) {
    const pass = gameplayActions(resolved, playerId, decks).find(
      (action) => action.label === "Pass priority",
    )!;
    resolved = performGameplayAction({
      game: resolved,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `recycle-resolve-${playerId}`,
    });
  }
  assert.ok(resolved.state.players.p1!.zones.hand.includes("p1:draw"));
});

test("activated cost selections survive resolution suspension and resume later effects", () => {
  const { game, decks } = fixture();
  const source = definition("CHOICE_SOURCE", "Choice Source", "Gear", 0, 0) as GameCardDefinition;
  source.behaviorModel.clauses.push(clause("activated-effect", {
    abilities: [binding("ability.activated_effect", 0, {})],
    selectors: [binding("selector.card", 1, {
      zone: "hand",
      cardType: "any",
      owner: "controller",
      minimumCount: 1,
      maximumCount: 1,
      selectionKey: "discardedCard",
    })],
    costs: [
      binding("cost.discard_selected_cards", 2, {
        count: 1,
        selectionKey: "discardedCard",
      }),
      binding("cost.exhaust_source", 3, {}),
    ],
    effects: [
      binding("action.play_token", 4, {
        tokenName: "Test Unit",
        count: 1,
        placement: "chooseBaseOrControlledBattlefield",
      }),
      binding("action.draw_cards", 5, { player: "controller", count: 1 }),
    ],
  }));
  decks[0]!.snapshot.cards.push(source);
  decks[0]!.instances.push({
    instanceId: "p1:choice-source",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "CHOICE_SOURCE",
  });
  game.state.players.p1!.zones.base.push("p1:choice-source");
  game.state.players.p1!.zones.mainDeck = ["p1:draw"];
  game.state.cardStates["p1:choice-source"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };

  const ability = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:choice-source",
  )!;
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: ability.id,
    selectedIds: ["p1:unit"],
    decks,
    now: "choice-cost",
  });
  for (const playerId of ["p1", "p2"] as const) {
    const pass = gameplayActions(next, playerId, decks).find(
      (action) => action.label === "Pass priority",
    )!;
    next = performGameplayAction({
      game: next,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `choice-resolve-${playerId}`,
    });
  }

  assert.equal(next.state.pendingChoice?.type, "tokenPlacement");
  const placement = gameplayActions(next, "p1", decks).find(
    (action) => action.choice?.kind === "tokenPlacement",
  )!;
  next = performGameplayAction({
    game: next,
    actorPlayerId: "p1",
    actionId: placement.id,
    selectedIds: [],
    tokenPlacements: [{ destinationId: "base", count: 1 }],
    decks,
    now: "choice-place-token",
  });

  assert.equal(next.state.createdCardInstances?.length, 1);
  assert.ok(next.state.players.p1!.zones.base.includes(
    next.state.createdCardInstances![0]!.instanceId,
  ));
  assert.ok(next.state.players.p1!.zones.hand.includes("p1:draw"));
  assert.equal(next.state.pendingChoice, null);
  assert.equal(next.state.effectResolutions.length, 0);
});

function fixture(): { game: GameDocument; decks: DeckSnapshotDocument[] } {
  const cards = [
    definition("RUNE", "Rune", "Rune", 0, 0),
    definition("UNIT", "Unit", "Unit", 1, 1, 1),
    definition("SPELL", "Spell", "Spell", 0, 0),
    definition("BF", "Arena", "Battlefield", 0, 0)
  ];
  const instances = [
    { instanceId: "p1:rune", ownerPlayerId: "p1", source: "runeDeck" as const, cardCode: "RUNE" },
    { instanceId: "p1:rune-b", ownerPlayerId: "p1", source: "runeDeck" as const, cardCode: "RUNE" },
    { instanceId: "p1:unit", ownerPlayerId: "p1", source: "mainDeck" as const, cardCode: "UNIT" },
    { instanceId: "p1:mover", ownerPlayerId: "p1", source: "mainDeck" as const, cardCode: "UNIT" },
    { instanceId: "p1:spell", ownerPlayerId: "p1", source: "mainDeck" as const, cardCode: "SPELL" },
    { instanceId: "p1:draw", ownerPlayerId: "p1", source: "mainDeck" as const, cardCode: "UNIT" },
    { instanceId: "p1:bf", ownerPlayerId: "p1", source: "battlefield" as const, cardCode: "BF" }
  ];
  const snapshot = { sourceText: "", catalogDigest: "x", entries: [], cards };
  const decks = [{ id: "d1", createdAt: "a", updatedAt: "a", matchId: "m", playerId: "p1", snapshot, instances }, { id: "d2", createdAt: "a", updatedAt: "a", matchId: "m", playerId: "p2", snapshot, instances: [] }];
  const zones = (base: string[], mainDeck: string[], hand: string[]) => ({ legend: null, champion: null, mainDeck, runeDeck: [], hand, trash: [], banishment: [], base });
  const game: GameDocument = {
    id: "g", matchId: "m", createdAt: "a", updatedAt: "a", gameNumber: 1, stateVersion: 0,
    status: "in_progress", winnerPlayerId: null, completionReason: null,
    state: {
      setup: { playerIds: ["p1", "p2"], startingPlayerChooserId: "p1", startingPlayerId: "p1", battlefieldPools: {}, battlefieldChoices: {}, mulligans: {} },
      players: { p1: { playerId: "p1", energy: 0, conditionalEnergy: 0, power: {}, zones: zones(["p1:rune", "p1:rune-b", "p1:mover"], ["p1:draw"], ["p1:unit", "p1:spell"]) }, p2: { playerId: "p2", energy: 0, conditionalEnergy: 0, power: {}, zones: zones([], [], []) } },
      battlefields: [{ battlefieldId: "p1:bf", cardInstanceId: "p1:bf", selectedByPlayerId: "p1", units: [] }],
      cardStates: { "p1:rune": { exhausted: false, damage: 0, computedMight: null }, "p1:rune-b": { exhausted: false, damage: 0, computedMight: null }, "p1:unit": { exhausted: false, damage: 0, computedMight: 1 }, "p1:mover": { exhausted: false, damage: 0, computedMight: 1 }, "p1:spell": { exhausted: false, damage: 0, computedMight: null }, "p1:draw": { exhausted: false, damage: 0, computedMight: 1 }, "p1:bf": { exhausted: false, damage: 0, computedMight: null } },
      turn: { turnNumber: 1, activePlayerId: "p1", phase: "action" }, chain: null, showdown: null, combat: null,
      modifiers: [], ongoingEffects: [], delayedEffects: [], effectResolutions: [], pendingChoice: null, queuedTriggerChoices: []
    }
  };
  return { game, decks };
}

function definition(code: string, name: string, type: "Rune" | "Unit" | "Spell" | "Gear" | "Legend" | "Battlefield", energy: number, might: number, power = 0) {
  const runeClauses = type === "Rune" ? [{
    id: "energy", sequence: 0, sourceText: "", normalizedText: "",
    abilities: [{ behaviorId: "ability.exhaust_for_resource", parameters: { resourceType: "energy", amountSource: "constant", amount: 1, usage: "unrestricted" }, confidence: "high" as const, order: 0 }],
    triggers: [], conditions: [], selectors: [], choices: [], costs: [], timings: [], effects: [], keywords: []
  }, {
    id: "power", sequence: 1, sourceText: "", normalizedText: "",
    abilities: [{ behaviorId: "ability.recycle_for_power", parameters: { amount: 1, domain: "sourceDomain", usage: "unrestricted" }, confidence: "high" as const, order: 0 }],
    triggers: [], conditions: [], selectors: [], choices: [], costs: [], timings: [], effects: [], keywords: []
  }] : [];
  return { cardCode: code, sourceTextHash: "h", behaviorModel: { playTimings: [], clauses: runeClauses }, card: { id: code, name, public_code: `${code}/1`, attributes: { energy, might, power }, classification: { type, supertype: type === "Rune" ? "Basic" as const : null, domain: ["Mind"] }, text: { plain: "" }, set: { set_id: "T", label: "Test" }, media: {}, tags: [], metadata: {} } };
}

function binding(
  behaviorId: string,
  order: number,
  parameters: Record<string, string | number | boolean | null>,
): BehaviorBinding {
  return { behaviorId, parameters, confidence: "high" as const, order };
}

function clause(
  id: string,
  input: Partial<BehaviorClause>,
): BehaviorClause {
  return { ...emptyClause(id), ...input };
}

function emptyClause(id: string): BehaviorClause {
  return {
    id,
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
    effects: [],
    keywords: [],
  };
}
