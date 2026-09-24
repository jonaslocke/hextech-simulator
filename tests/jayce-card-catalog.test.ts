import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCanonicalCardDocument,
  buildCurrentBehaviorCatalog,
} from "../src/server/card-catalog";
import { buildJayceCanonicalPublication } from "../src/server/card-catalog/jayce-canonical-publications";
import { loadCardCatalog } from "../src/server/catalog";
import { gameFixture } from "./helpers/game-fixture";
import {
  compileBehaviorModel,
  createBehaviorContext,
  targetRequirementsForClause,
} from "../src/server/game/behavior-runtime";
import { createPrimitiveHandlers, createRuntimeCardIndex } from "../src/server/game/primitive-handlers";
import { gameplayActions, performGameplayAction } from "../src/server/game/actions";

test("Jayce deck reusable publications compile their current supported cards", async () => {
  const [catalog, behaviors] = await Promise.all([
    loadCardCatalog(),
    buildCurrentBehaviorCatalog(),
  ]);

  for (const code of ["VEN-149/166", "VEN-068/166", "OGN-099/298", "OGN-138/298", "OGN-133/298", "OGN-156/298", "OGN-160/298", "OGN-115/298", "UNL-069/219", "UNL-088/219", "UNL-103/219", "UNL-106/219", "UNL-118/219", "VEN-049/166", "VEN-075/166", "VEN-085/166", "OGN-287/298", "VEN-066/166"]) {
    const card = catalog.byPublicCode.get(code);
    assert.ok(card, `Missing source card ${code}`);
    const publication = buildJayceCanonicalPublication(card);
    if (code === "UNL-103/219") {
      const assignments = publication.clauses.flatMap((clause) => clause.assignments);
      assert.equal(
        assignments.find((assignment) => assignment.primitiveId === "action.optional")?.parameters.commitAtPlay,
        true,
      );
      assert.ok(assignments.some((assignment) =>
        assignment.primitiveId === "selector.card" &&
        assignment.parameters.selectionKey === "recycledCards" &&
        assignment.parameters.onlyIfSelectionKey === "mode",
      ));
    }
    if (code === "UNL-118/219") {
      const selector = publication.clauses.flatMap((clause) => clause.assignments).find(
        (assignment) => assignment.primitiveId === "selector.enemy_unit",
      );
      const damage = publication.clauses.flatMap((clause) => clause.assignments).find(
        (assignment) => assignment.primitiveId === "action.deal_damage",
      );
      assert.equal(selector?.parameters.minimumCount, 0);
      assert.equal(selector?.parameters.maximumCount, 99);
      assert.equal(selector?.parameters.selectionKey, "units");
      assert.equal(damage?.parameters.selectionKey, "units");
      assert.equal(damage?.parameters.atMostOnePerLocation, true);
    }
    const document = buildCanonicalCardDocument(
      publication,
      behaviors,
      "created",
      "updated",
    );
    assert.equal(document.runtimeSupportStatus, "supported");
    if (code === "OGN-160/298") {
      assert.deepEqual(
        document.behaviorModel.clauses.map((clause) => ({
          triggers: clause.triggers.map((binding) => binding.behaviorId),
          effects: clause.effects.map((binding) => binding.behaviorId),
        })),
        [{
          triggers: ["trigger.end_of_turn"],
          effects: ["action.reveal_until_card_type_and_play"],
        }],
      );
    }
    if (code === "OGN-115/298") {
      assert.deepEqual(
        document.behaviorModel.clauses.map((clause) =>
          clause.effects.map((binding) => binding.behaviorId),
        ),
        [["action.each_player_choose_top_deck_card_and_play"]],
      );
    }
    if (code === "OGN-099/298") {
      const ability = document.behaviorModel.clauses[0]!;
      assert.ok(ability.selectors.some((binding) =>
        binding.behaviorId === "selector.card" &&
        binding.parameters.selectionKey === "recycledCards",
      ));
      assert.ok(ability.costs.some((binding) =>
        binding.behaviorId === "cost.recycle_selected_cards" &&
        binding.parameters.selectionKey === "recycledCards",
      ));
      assert.deepEqual(
        ability.effects.map((binding) => binding.behaviorId),
        ["action.draw_cards"],
      );
    }
    if (code === "UNL-088/219") {
      const ability = document.behaviorModel.clauses.find((clause) =>
        clause.abilities.some((binding) =>
          binding.behaviorId === "ability.activated_effect",
        ),
      );
      assert.ok(ability);
      assert.ok(ability.selectors.some((binding) =>
        binding.behaviorId === "selector.card" &&
        binding.parameters.selectionKey === "discard",
      ));
      assert.ok(ability.costs.some((binding) =>
        binding.behaviorId === "cost.discard_selected_cards" &&
        binding.parameters.selectionKey === "discard",
      ));
      assert.equal(ability.effects[0]?.behaviorId, "action.play_token");
    }
  }
});

test("canonical selector publications project compiled target constraints", async () => {
  const [catalog, behaviors, fixture] = await Promise.all([
    loadCardCatalog(),
    buildCurrentBehaviorCatalog(),
    gameFixture(),
  ]);
  const card = catalog.byPublicCode.get("UNL-118/219");
  assert.ok(card, "Missing source card UNL-118/219");
  const model = buildCanonicalCardDocument(
    buildJayceCanonicalPublication(card),
    behaviors,
    "created",
    "updated",
  );
  const { game, decks } = fixture;
  decks[0]!.snapshot.cards.push(model);
  decks[0]!.instances.push({
    instanceId: "p1:canonical-selector-source",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: model.cardCode,
  });
  game.state.players.p1!.zones.base.push("p1:canonical-selector-source");
  game.state.cardStates["p1:canonical-selector-source"] = {
    exhausted: false,
    damage: 0,
    computedMight: 5,
  };
  const battlefieldInstance = decks[0]!.instances.find(
    (instance) => instance.source === "battlefield",
  );
  assert.ok(battlefieldInstance);
  game.state.battlefields.push({
    battlefieldId: "p1:canonical-arena",
    cardInstanceId: battlefieldInstance.instanceId,
    selectedByPlayerId: "p1",
    units: [],
  });
  const unitCode = decks[0]!.snapshot.cards.find(
    (candidate) => candidate.card.classification.type === "Unit",
  )!.cardCode;
  for (const [id, zone] of [["p2:canonical-unit-a", "base"], ["p2:canonical-unit-b", "base"], ["p2:canonical-unit-c", "battlefield"]] as const) {
    decks[1]!.instances.push({
      instanceId: id,
      ownerPlayerId: "p2",
      source: "mainDeck",
      cardCode: unitCode,
    });
    game.state.cardStates[id] = { exhausted: false, damage: 0, computedMight: 5 };
    if (zone === "base") game.state.players.p2!.zones.base.push(id);
    else game.state.battlefields[0]!.units.push(id);
  }

  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const clause = compileBehaviorModel(model.behaviorModel, handlers).clauses.find(
    (candidate) => candidate.triggers.some((trigger) => trigger.behaviorId === "trigger.on_play"),
  );
  assert.ok(clause);
  const requirements = targetRequirementsForClause(
    clause,
    createBehaviorContext(game, "p1", "p1:canonical-selector-source", null, []),
    handlers,
  );
  assert.deepEqual(requirements.map(({ kind, minimum, maximum, maximumPerLocation }) => ({
    kind,
    minimum,
    maximum,
    maximumPerLocation,
  })), [{ kind: "card", minimum: 0, maximum: 2, maximumPerLocation: 1 }]);
  assert.deepEqual(requirements[0]?.locationKeysById, {
    "p2:canonical-unit-a": "base:p2",
    "p2:canonical-unit-b": "base:p2",
    "p2:canonical-unit-c": `battlefield:${game.state.battlefields[0]!.battlefieldId}`,
  });
});

test("canonical modal publication commits its play choice before Chain entry", async () => {
  const [catalog, behaviors, fixture] = await Promise.all([
    loadCardCatalog(),
    buildCurrentBehaviorCatalog(),
    gameFixture(),
  ]);
  const card = catalog.byPublicCode.get("UNL-103/219");
  assert.ok(card, "Missing source card UNL-103/219");
  const model = buildCanonicalCardDocument(
    buildJayceCanonicalPublication(card),
    behaviors,
    "created",
    "updated",
  );
  const { game, decks } = fixture;
  decks[0]!.snapshot.cards.push(model);
  decks[0]!.instances.push({
    instanceId: "p1:canonical-modal-spell",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: model.cardCode,
  });
  game.state.players.p1!.zones.hand.push("p1:canonical-modal-spell");
  game.state.players.p1!.energy = 2;
  game.state.cardStates["p1:canonical-modal-spell"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };

  const actions = gameplayActions(game, "p1", decks).filter(
    (action) => action.sourceCardInstanceId === "p1:canonical-modal-spell",
  );
  assert.deepEqual(actions.map((action) => action.presentation.playCost?.declarationLabel).sort(), [
    "Draw 1",
    "Recycle up to 3 cards from opponents' trashes",
  ]);
  const drawMode = actions.find(
    (action) => action.presentation.playCost?.declarationLabel === "Draw 1",
  );
  assert.ok(drawMode);
  const played = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: drawMode.id,
    selectedIds: [],
    decks,
    now: "canonical-modal-play",
  });
  assert.equal(played.state.pendingChoice, null);
  assert.deepEqual(played.state.chain?.items.at(-1)?.initialSelectionOverrides, {
    mode: ["no"],
  });
});

test("canonical Flow publication is playable from Trash with modified alternate cost", async () => {
  const [catalog, behaviors, fixture] = await Promise.all([
    loadCardCatalog(),
    buildCurrentBehaviorCatalog(),
    gameFixture(),
  ]);
  const card = catalog.byPublicCode.get("VEN-049/166");
  assert.ok(card, "Missing source card VEN-049/166");
  const model = buildCanonicalCardDocument(
    buildJayceCanonicalPublication(card),
    behaviors,
    "created",
    "updated",
  );
  const { game, decks } = fixture;
  decks[0]!.snapshot.cards.push(model);
  decks[0]!.instances.push({
    instanceId: "p1:canonical-flow-spell",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: model.cardCode,
  });
  game.state.players.p1!.zones.mainDeck = game.state.players.p1!.zones.mainDeck.filter(
    (id) => id !== "p1:canonical-flow-spell",
  );
  game.state.players.p1!.zones.trash.push("p1:canonical-flow-spell");
  game.state.players.p1!.energy = 1;
  const handSizeBefore = game.state.players.p1!.zones.hand.length;
  game.state.cardStates["p1:canonical-flow-spell"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };
  game.state.modifiers.push({
    id: "canonical-flow-cost-reduction",
    sourceCardInstanceId: null,
    controllerPlayerId: "p1",
    targetCardInstanceId: null,
    attribute: "energyCost",
    targetScope: "controller_spell",
    operation: "reduce",
    amount: 1,
    minimum: 0,
    duration: "continuous",
    createdAtTurn: 3,
  });

  const flow = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:canonical-flow-spell" && action.label.startsWith("[Flow]"),
  );
  assert.ok(flow?.enabled);
  assert.equal(flow.costPreview?.energy, 1);
  assert.equal(flow.presentation.playCost?.label, "[Flow] Play Dredge Up");
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: flow.id,
    selectedIds: [],
    decks,
    now: "canonical-flow-play",
  });
  assert.equal(next.state.players.p1!.energy, 0);
  assert.equal(next.state.players.p1!.zones.trash.includes("p1:canonical-flow-spell"), false);
  assert.equal(next.state.chain?.items.at(-1)?.flowPlayed, true);
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(next, playerId, decks).find((action) => action.label === "Pass priority");
    assert.ok(pass);
    next = performGameplayAction({
      game: next,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `canonical-flow-pass-${playerId}`,
    });
  }
  assert.equal(next.state.players.p1!.zones.banishment.includes("p1:canonical-flow-spell"), true);
  assert.equal(next.state.players.p1!.zones.hand.length, handSizeBefore + 1);
});

test("canonical top-deck selection waits for resolution and skips an empty choice", async () => {
  const [catalog, behaviors, fixture] = await Promise.all([
    loadCardCatalog(),
    buildCurrentBehaviorCatalog(),
    gameFixture(),
  ]);
  const card = catalog.byPublicCode.get("VEN-056/166");
  assert.ok(card, "Missing source card VEN-056/166");
  const model = buildCanonicalCardDocument(
    buildJayceCanonicalPublication(card),
    behaviors,
    "created",
    "updated",
  );
  const { game, decks } = fixture;
  decks[0]!.snapshot.cards.push(model);
  decks[0]!.instances.push({
    instanceId: "p1:canonical-private-choice-spell",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: model.cardCode,
  });
  game.state.players.p1!.zones.hand.push("p1:canonical-private-choice-spell");
  game.state.players.p1!.zones.mainDeck = [];
  game.state.players.p1!.energy = 7;
  game.state.cardStates["p1:canonical-private-choice-spell"] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };

  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "p1:canonical-private-choice-spell",
  );
  assert.ok(play);
  assert.deepEqual(play.targets, []);
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: [],
    decks,
    now: "canonical-private-choice-play",
  });
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(next, playerId, decks).find((action) => action.label === "Pass priority");
    assert.ok(pass);
    next = performGameplayAction({
      game: next,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `canonical-private-choice-pass-${playerId}`,
    });
  }
  assert.equal(next.state.pendingChoice, null);
  assert.equal(next.state.effectResolutions.length, 0);
  assert.ok(next.state.players.p1!.zones.trash.includes("p1:canonical-private-choice-spell"));
});
