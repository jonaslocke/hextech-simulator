import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeckSnapshotDocument } from "../src/server/game";
import {
  createRuntimeCardIndex,
  gameplayActions,
  performGameplayAction,
  scoreBattlefield,
  type GameDocument,
} from "../src/server/game";
import { availableAnyPowerAfterBaseCost, buildPaymentPlan } from "../src/server/game/payment";
import type { GameCardDefinition } from "../src/server/game/schemas";

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

test("replaces only the first final-point Conquer of a turn with a draw", () => {
  const { game, decks } = fixture();
  const secondBattlefieldId = "p1:bf-two";
  game.state.battlefields.push({
    battlefieldId: secondBattlefieldId,
    cardInstanceId: secondBattlefieldId,
    selectedByPlayerId: "p1",
    units: [],
  });
  decks[0]!.instances.push({
    instanceId: secondBattlefieldId,
    ownerPlayerId: "p1",
    source: "battlefield",
    cardCode: "BF",
  });
  game.state.cardStates[secondBattlefieldId] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };
  game.state.players.p1!.points = 7;
  const handBefore = game.state.players.p1!.zones.hand.length;

  scoreBattlefield(game, "p1", "p1:bf", "conquer", decks);

  assert.equal(game.state.players.p1!.points, 7);
  assert.equal(game.state.players.p1!.zones.hand.length, handBefore + 1);
  assert.deepEqual(game.state.players.p1!.conqueredBattlefieldIdsThisTurn, [
    "p1:bf",
  ]);
  assert.equal(game.status, "in_progress");

  scoreBattlefield(game, "p1", secondBattlefieldId, "conquer", decks);

  assert.equal(game.state.players.p1!.points, 8);
  assert.equal(game.state.players.p1!.zones.hand.length, handBefore + 1);
  assert.equal(game.winnerPlayerId, "p1");
  assert.equal(game.status, "complete");
});

test("exposes a ready Legend Add ability and grants spell-only Rainbow Power", () => {
  const { game, decks } = fixture();
  const baseLegend = definition("LEGEND", "Daughter of the Void", "Unit", 0, 0);
  const legend = {
    ...baseLegend,
    behaviorModel: {
      playTimings: [],
      clauses: [
        {
          id: "add-rainbow-power",
          sequence: 0,
          sourceText: "[Reaction] — [Add] [Rainbow]. Use only to play spells.",
          normalizedText:
            "reaction add rainbow power use only to play spells",
          abilities: [
            {
              behaviorId: "ability.exhaust_for_resource",
              parameters: {
                resourceType: "power",
                amount: 1,
                domain: "rainbow",
                usage: "spellsOnly",
              },
              confidence: "high" as const,
              order: 0,
            },
          ],
          triggers: [],
          conditions: [],
          selectors: [],
          choices: [],
          costs: [],
          timings: [
            {
              behaviorId: "timing.reaction",
              parameters: {},
              confidence: "high" as const,
              order: 0,
            },
          ],
          effects: [],
          keywords: [],
        },
      ],
    },
    card: {
      ...baseLegend.card,
      classification: {
        type: "Legend" as const,
        supertype: null,
        domain: ["Chaos"],
      },
    },
  } satisfies GameCardDefinition;
  decks[0]!.snapshot.cards.push(legend);
  decks[0]!.instances.push({
    instanceId: "p1:legend",
    ownerPlayerId: "p1",
    source: "legend",
    cardCode: "LEGEND",
  });
  game.state.players.p1!.zones.legend = "p1:legend";
  game.state.cardStates["p1:legend"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };

  const addPower = gameplayActions(game, "p1", decks).find(
    (action) => action.label === "Add spell Power [rainbow]",
  );
  assert.ok(addPower);
  assert.equal(addPower.enabled, true);

  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: addPower.id,
    selectedIds: [],
    decks,
    now: "legend-add",
  });
  assert.equal(next.state.cardStates["p1:legend"]!.exhausted, true);
  assert.deepEqual(next.state.players.p1!.conditionalPower, { Rainbow: 1 });
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

test("resolves a multi-step top-deck spell instead of dropping its Chain item", () => {
  const { game: initial, decks } = fixture();
  const spell = decks[0]!.snapshot.cards.find(
    (definition) => definition.cardCode === "SPELL",
  )!;
  spell.behaviorModel = {
    playTimings: [binding("timing.action", {}, 0)],
    clauses: [{
      id: "stacked-deck-effect",
      sequence: 0,
      sourceText: "Look at the top 3 cards. Put 1 into your hand and recycle the rest.",
      normalizedText: "look at the top 3 cards put 1 into your hand and recycle the rest",
      abilities: [],
      triggers: [],
      conditions: [],
      selectors: [],
      choices: [],
      costs: [],
      timings: [],
      effects: [
        binding("action.look", { count: 3, selectionKey: "lookedCards" }, 0),
        binding("action.take_to_hand", { sourceSelectionKey: "lookedCards", count: 1, selectionKey: "cardToHand" }, 1),
        binding("action.recycle_top_cards", { count: 3, sourceSelectionKey: "lookedCards", recycleAllRemaining: true }, 2),
      ],
      keywords: [],
    }],
  };

  for (const instanceId of ["p1:draw2", "p1:draw3", "p1:tail"]) {
    decks[0]!.instances.push({
      instanceId,
      ownerPlayerId: "p1",
      source: "mainDeck",
      cardCode: "UNIT",
    });
    initial.state.cardStates[instanceId] = {
      exhausted: false,
      damage: 0,
      computedMight: 1,
    };
  }
  initial.state.players.p1!.zones.mainDeck = [
    "p1:draw",
    "p1:draw2",
    "p1:draw3",
    "p1:tail",
  ];

  let game = initial;
  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.label === "Play Spell",
  );
  assert.ok(play);
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: [],
    decks,
    now: "stacked-deck-play",
  });
  assert.equal(game.state.chain?.items.at(-1)?.behaviorClauseId, "stacked-deck-effect");

  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(game, playerId, decks).find(
      (action) => action.label === "Pass priority",
    );
    assert.ok(pass);
    game = performGameplayAction({
      game,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: "stacked-deck-pass",
    });
  }

  assert.equal(game.state.pendingChoice?.type, "effectSelection");
  if (game.state.pendingChoice?.type !== "effectSelection") {
    throw new Error("Expected Stacked Deck to ask for a looked-at card.");
  }
  assert.deepEqual(game.state.pendingChoice.legalCardIds, [
    "p1:draw",
    "p1:draw2",
    "p1:draw3",
  ]);
  const choose = gameplayActions(game, "p1", decks).find(
    (action) => action.choice?.kind === "effectSelection",
  );
  assert.ok(choose);
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: choose.id,
    selectedIds: ["p1:draw2"],
    decks,
    now: "stacked-deck-choose",
  });

  assert.equal(game.state.pendingChoice, null);
  assert.ok(game.state.players.p1!.zones.hand.includes("p1:draw2"));
  assert.deepEqual(game.state.players.p1!.zones.mainDeck, [
    "p1:tail",
    "p1:draw",
    "p1:draw3",
  ]);
  assert.ok(game.state.players.p1!.zones.trash.includes("p1:spell"));
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
  const seal: GameCardDefinition = definition("SEAL", "Seal of Unity", "Gear", 0, 0);
  seal.behaviorModel.clauses.push({
    id: "add-power",
    sequence: 0,
    sourceText: "[Reaction] — [Add] Power.",
    normalizedText: "reaction add power",
    abilities: [{
      behaviorId: "ability.exhaust_for_resource",
      parameters: {
        resourceType: "power",
        amount: 1,
        domain: "Mind",
        usage: "unrestricted",
      },
      confidence: "high",
      order: 0,
    }],
    triggers: [],
    conditions: [],
    selectors: [],
    choices: [],
    costs: [],
    timings: [{
      behaviorId: "timing.reaction",
      parameters: {},
      confidence: "high",
      order: 0,
    }],
    effects: [],
    keywords: [],
  });
  decks[0]!.snapshot.cards.push(seal);
  decks[0]!.instances.push({
    instanceId: "p1:seal",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "SEAL",
  });
  game.state.players.p1!.zones.base.push("p1:seal");
  game.state.cardStates["p1:seal"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };

  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:spell",
  )!;
  assert.ok(play.targets[0]!.legalIds.includes("p2:deflect"));
  assert.deepEqual(play.costPreview, {
    energy: 0,
    basePower: 0,
    availableAnyPower: 0,
    reservedResourceSourceIds: [],
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

  const sealPayment = gameplayActions(game, "p1", decks).find(
    (action) =>
      action.sourceCardInstanceId === "p1:seal" &&
      action.label === "Add Power [Mind]",
  );
  assert.ok(sealPayment?.enabled);
  const afterSealPayment = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: sealPayment.id,
    selectedIds: [],
    decks,
    now: "deflect-seal-payment",
  });
  assert.equal(afterSealPayment.state.cardStates["p1:seal"]?.exhausted, true);
  const payablePlay = gameplayActions(afterSealPayment, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:spell",
  )!;
  assert.equal(payablePlay.costPreview?.availableAnyPower, 1);
  const next = performGameplayAction({
    game: afterSealPayment,
    actorPlayerId: "p1",
    actionId: payablePlay.id,
    selectedIds: ["p2:deflect"],
    decks,
    now: "deflect-paid",
  });
  assert.equal(next.state.players.p1!.power.Mind, 0);
  assert.equal(next.state.cardStates["p1:seal"]?.exhausted, true);
  assert.equal(next.state.chain?.items[0]?.sourceCardInstanceId, "p1:spell");
});

test("spell-only Power remains available for a Deflect surcharge after a Legend adds it", () => {
  const { game, decks } = fixture();
  const daughter: GameCardDefinition = definition("DAUGHTER", "Kai'Sa - Daughter of the Void", "Legend", 0, 0);
  daughter.behaviorModel.clauses.push({
    id: "add-rainbow-power",
    sequence: 0,
    sourceText: "[Reaction] — [Add] Rainbow Power. Use only to play spells.",
    normalizedText: "reaction add rainbow power use only to play spells",
    abilities: [{
      behaviorId: "ability.exhaust_for_resource",
      parameters: {
        resourceType: "power",
        amount: 1,
        domain: "Rainbow",
        usage: "spellsOnly",
      },
      confidence: "high",
      order: 0,
    }],
    triggers: [],
    conditions: [],
    selectors: [],
    choices: [],
    costs: [],
    timings: [{
      behaviorId: "timing.reaction",
      parameters: {},
      confidence: "high",
      order: 0,
    }],
    effects: [],
    keywords: [],
  });
  decks[0]!.snapshot.cards.push(daughter);
  decks[0]!.instances.push({
    instanceId: "p1:daughter",
    ownerPlayerId: "p1",
    source: "legend",
    cardCode: "DAUGHTER",
  });
  game.state.players.p1!.zones.legend = "p1:daughter";
  game.state.cardStates["p1:daughter"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };

  const addPower = gameplayActions(game, "p1", decks).find(
    (action) =>
      action.sourceCardInstanceId === "p1:daughter" &&
      action.label === "Add spell Power [Rainbow]",
  );
  assert.ok(addPower?.enabled);
  const afterPower = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: addPower.id,
    selectedIds: [],
    decks,
    now: "deflect-daughter-payment",
  });
  const spell = decks[0]!.snapshot.cards.find(
    (definition) => definition.cardCode === "SPELL"
  )!;
  const plan = buildPaymentPlan(
    afterPower,
    "p1",
    spell,
    0,
    createRuntimeCardIndex(decks, afterPower),
  );
  assert.equal(availableAnyPowerAfterBaseCost(afterPower, "p1", plan!), 1);
});

test("a resolving Time Warp is banished instead of also entering Trash", () => {
  const { game: initial, decks } = fixture();
  const timeWarp = decks[0]!.snapshot.cards.find(
    (definition) => definition.cardCode === "SPELL",
  )!;
  timeWarp.behaviorModel.playTimings = [{
    behaviorId: "timing.action",
    parameters: {},
    confidence: "high",
    order: 0,
  }];
  timeWarp.behaviorModel.clauses.push({
    id: "time-warp",
    sequence: 0,
    sourceText: "Take a turn after this one. Banish this.",
    normalizedText: "Take a turn after this one. Banish this.",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [],
    choices: [],
    costs: [],
    timings: [],
    effects: [
      {
        behaviorId: "action.take_extra_turn",
        parameters: {},
        confidence: "high",
        order: 0,
      },
      {
        behaviorId: "action.banish_card",
        parameters: { target: "source" },
        confidence: "high",
        order: 1,
      },
    ],
    keywords: [],
  });
  const play = gameplayActions(initial, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:spell",
  )!;
  let game = performGameplayAction({
    game: initial,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: [],
    decks,
    now: "play-time-warp",
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
      now: `resolve-time-warp-${playerId}`,
    });
  }

  assert.deepEqual(game.state.extraTurnPlayerIds, ["p1"]);
  assert.equal(game.state.players.p1!.zones.banishment.includes("p1:spell"), true);
  assert.equal(game.state.players.p1!.zones.trash.includes("p1:spell"), false);
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

function binding(
  behaviorId: string,
  parameters: Record<string, string | number | boolean | null>,
  order: number,
) {
  return {
    behaviorId,
    parameters,
    confidence: "high" as const,
    order,
  };
}

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

function definition(
  code: string,
  name: string,
  type: "Rune" | "Unit" | "Spell" | "Battlefield" | "Gear" | "Legend",
  energy: number,
  might: number,
  power = 0,
) {
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
