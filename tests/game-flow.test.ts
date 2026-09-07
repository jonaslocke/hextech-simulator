import assert from "node:assert/strict";
import { test } from "node:test";
import type {
  BehaviorBinding,
  BehaviorClause,
  DeckSnapshotDocument,
} from "../src/server/game";
import {
  createBehaviorContext,
  gameplayActions,
  performGameplayAction,
  projectGame,
  type GameDocument,
} from "../src/server/game";
import { cleanupBoard } from "../src/server/game/board-rules";
import { beginEffectResolution } from "../src/server/game/effect-resolution";
import {
  createPrimitiveHandlers,
  createRuntimeCardIndex,
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

test("temporarily reveals an opponent hand only while its resolving effect is pending", () => {
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
  assert.equal(game.state.pendingChoice?.type, "effectOption");
  assert.deepEqual(
    projectGame({ game, viewerPlayerId: "p1", decks }).players
      .find((player) => player.playerId === "p2")
      ?.zones.find((zone) => zone.kind === "hand")?.cards.map((card) => card.name),
    ["Unit"],
  );
  const submit = gameplayActions(game, "p1", decks).find(
    (action) => action.choice?.kind === "effectOption",
  )!;
  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: submit.id,
    selectedIds: ["continue"],
    decks,
    now: "revealed-hand-continue",
  });
  assert.deepEqual(next.state.revealedCardInstanceIds, []);
  assert.deepEqual(next.state.facedownVisibilityGrants, [
    { viewerPlayerId: "p1", ownerPlayerId: "p2", expiresAtTurnNumber: 1 },
  ]);
  assert.equal(
    projectGame({ game: next, viewerPlayerId: "p1", decks }).battlefields[0]
      ?.facedownCard?.instanceId,
    "p2:facedown-card",
  );
  assert.deepEqual(
    projectGame({ game: next, viewerPlayerId: "p1", decks }).players
      .find((player) => player.playerId === "p2")
      ?.zones.find((zone) => zone.kind === "hand")?.cards,
    [],
  );
});

test("publicly reveals a selected top-deck card before drawing it", () => {
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
  const revealed = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: select.id,
    selectedIds: ["p1:gear"],
    decks,
    now: "search-select",
  });
  assert.equal(revealed.state.pendingChoice?.type, "effectOption");
  for (const viewerPlayerId of ["p1", "p2"]) {
    const projection = projectGame({ game: revealed, viewerPlayerId, decks });
    assert.deepEqual(
      projection.pendingChoice?.type === "effectOption"
        ? projection.pendingChoice.revealedCards.map((card) => card.name)
        : [],
      ["Gear"],
    );
  }
  const continueAction = gameplayActions(revealed, "p1", decks).find(
    (action) => action.choice?.kind === "effectOption",
  )!;
  const next = performGameplayAction({
    game: revealed,
    actorPlayerId: "p1",
    actionId: continueAction.id,
    selectedIds: ["continue"],
    decks,
    now: "search-reveal-continue",
  });
  assert.deepEqual(next.state.revealedCardInstanceIds, []);
  assert.ok(next.state.players.p1!.zones.hand.includes("p1:gear"));
  assert.ok(next.state.players.p1!.zones.mainDeck.includes("p1:draw"));
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

test("uses generic restricted Power for Gear cards and Gear Equip abilities", () => {
  const { game: initial, decks } = fixture();
  const game = structuredClone(initial);
  const snapshot = decks[0]!.snapshot;
  snapshot.cards.push(
    definition("ORNN", "Fire Below the Mountain", "Legend", 0, 0),
    definition("GEAR", "Test Gear", "Gear", 0, 0, 1),
    definition("POWER_UNIT", "Power Unit", "Unit", 0, 1, 1),
  );
  const ornn = snapshot.cards.find((card) => card.cardCode === "ORNN")!;
  ornn.behaviorModel.clauses = [clause("ornn-add", {
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
    { instanceId: "p1:ornn", ownerPlayerId: "p1", source: "legend", cardCode: "ORNN" },
    { instanceId: "p1:gear", ownerPlayerId: "p1", source: "mainDeck", cardCode: "GEAR" },
    { instanceId: "p1:power-unit", ownerPlayerId: "p1", source: "mainDeck", cardCode: "POWER_UNIT" },
  );
  decks[1]!.instances.push({
    instanceId: "p2:enemy",
    ownerPlayerId: "p2",
    source: "mainDeck",
    cardCode: "UNIT",
  });
  game.state.players.p1!.zones.legend = "p1:ornn";
  game.state.players.p1!.zones.hand.push("p1:gear", "p1:power-unit");
  game.state.players.p1!.zones.base = game.state.players.p1!.zones.base.filter(
    (id) => id !== "p1:rune" && id !== "p1:rune-b",
  );
  game.state.cardStates["p1:ornn"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.cardStates["p1:gear"] = { exhausted: false, damage: 0, computedMight: null };
  game.state.cardStates["p1:power-unit"] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.players.p2!.zones.base.push("p2:enemy");
  game.state.cardStates["p2:enemy"] = { exhausted: false, damage: 0, computedMight: 1 };

  const addPower = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:ornn",
  )!;
  const afterAdd = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: addPower.id,
    selectedIds: [],
    decks,
    now: "ornn-add",
  });
  assert.deepEqual(afterAdd.state.players.p1!.restrictedResources, {
    energy: {},
    power: { "cardOrAbility:Gear": { Rainbow: 1 } },
  });
  assert.equal(
    gameplayActions(afterAdd, "p1", decks).find(
      (action) => action.label === "Play Power Unit to Base",
    )?.enabled,
    false,
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

test("Quick-Draw Gear uses normal play target projection and attaches on play", () => {
  const { game, decks } = fixture();
  const snapshot = decks[0]!.snapshot;
  snapshot.cards.push(definition("QUICK_GEAR", "Quick Gear", "Gear", 0, 0));
  const quickGear = snapshot.cards.find(
    (card) => card.cardCode === "QUICK_GEAR",
  )!;
  quickGear.card.tags = ["Equipment"];
  quickGear.behaviorModel.clauses = [clause("quick-draw", {
    selectors: [binding("selector.friendly_unit", 0, {
      minimumCount: 1,
      maximumCount: 1,
      area: "board",
      locationRelation: "any",
      controller: "controller",
    })],
    effects: [binding("action.attach_equipment", 0, {
      target: "friendly_unit",
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
  assert.equal(play.targets[0]?.legalIds.includes("p1:mover"), true);
  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: ["p1:mover"],
    decks,
    now: "quick-draw",
  });
  assert.ok(next.state.players.p1!.zones.base.includes("p1:quick-gear"));
  assert.equal(
    next.state.cardStates["p1:quick-gear"]!.attachedToCardInstanceId,
    "p1:mover",
  );
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
