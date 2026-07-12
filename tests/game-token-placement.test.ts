import assert from "node:assert/strict";
import test from "node:test";
import {
  compileBehaviorModel,
  createBehaviorContext,
  executeBehaviorClause,
} from "../src/server/game/behavior-runtime";
import {
  beginEffectResolution,
  submitEffectSelection,
  submitTokenPlacement,
} from "../src/server/game/effect-resolution";
import {
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  cleanupTurnModifiers,
  effectiveEnergyCost,
  moveUnitToTrash,
  recomputeMight,
} from "../src/server/game/primitive-handlers";
import { getTokenCatalogDefinition } from "../src/server/game/token-catalog";
import {
  applyStartOfTurn,
  gameplayActions,
  performGameplayAction,
  startCombat,
} from "../src/server/game";
import {
  dispatchBehaviorEvent,
  dispatchSimultaneousBehaviorEvents,
} from "../src/server/game/triggers";
import { clearStunned } from "../src/server/game/board-rules";
import { buildPaymentPlan, payCardCost } from "../src/server/game/payment";
import type { BehaviorBinding, GameCardDefinition } from "../src/server/game";
import type { DeckSnapshotDocument } from "../src/server/game/repositories";
import type { GameDocument } from "../src/server/game/state";

const RECRUIT_TOKEN_CARD_CODE = "OGN-272";

test("unit selectors enforce excludesSource", () => {
  const { game, decks } = fixture([
    unit("SOURCE", "First Mate", [
      clause("ready-another", {
        selectors: [
          binding("selector.friendly_unit", 0, {
            area: "board",
            locationRelation: "any",
            minimumCount: 1,
            maximumCount: 1,
            excludesSource: true,
      }),
    ],
        abilities: [binding("action.ready_cards", 1, { target: "selected" })],
      }),
    ]),
    unit("ALLY", "Ally"),
  ]);
  game.state.players.p1!.zones.base.push("source", "ally");
  game.state.cardStates.source = cardState(1);
  game.state.cardStates.ally = cardState(1, true);
  decks[0]!.instances.push(instance("source", "p1", "SOURCE"));
  decks[0]!.instances.push(instance("ally", "p1", "ALLY"));

  const action = gameplayActions(game, "p1", decks).find(
    (candidate) => candidate.sourceCardInstanceId === "source",
  );

  assert.deepEqual(action?.targets[0]?.legalIds, ["ally"]);
});

test("token placement choice accepts counted destination allocations", () => {
  const source = unit("SOURCE", "Recruit the Vanguard", [
    clause("tokens", {
      effects: [
        binding("action.play_token", 0, {
          tokenCardCode: RECRUIT_TOKEN_CARD_CODE,
          tokenName: "Recruit",
          count: 4,
          placement: "chooseBaseOrControlledBattlefield",
        }),
      ],
    }),
  ]);
  const { game, decks } = fixture([source, battlefield("BF", "Training Yard")]);
  game.state.players.p1!.zones.base.push("source");
  game.state.cardStates.source = cardState(1);
  decks[0]!.instances.push(instance("source", "p1", "SOURCE"));
  game.state.battlefields.push({
    battlefieldId: "bf",
    cardInstanceId: "bf-card",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    units: [],
  });
  decks[0]!.instances.push(instance("bf-card", "p1", "BF", "battlefield"));
  game.state.cardStates["bf-card"] = cardState(null);

  const started = beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "tokens",
    decks,
  });

  assert.equal(started, false);
  assert.equal(game.state.pendingChoice?.type, "tokenPlacement");
  const action = gameplayActions(game, "p1", decks).find(
    (candidate) => candidate.choice?.kind === "tokenPlacement",
  );
  assert.ok(action);
  assert.deepEqual(
    action.choice?.kind === "tokenPlacement"
      ? action.choice.destinations.map((destination) => destination.id)
      : [],
    ["base", "bf"],
  );

  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: action.id,
    selectedIds: [],
    tokenPlacements: [
      { destinationId: "base", count: 2 },
      { destinationId: "bf", count: 2 },
    ],
    decks,
    now: "b",
  });

  assert.equal(next.state.pendingChoice, null);
  assert.equal(next.state.createdCardInstances?.length, 4);
  assert.equal(next.state.players.p1!.zones.base.length, 3);
  assert.equal(next.state.battlefields[0]!.units.length, 2);
  assert.equal(
    next.state.createdCardInstances?.every(
      (created) => next.state.cardStates[created.instanceId]?.computedMight === 1,
    ),
    true,
  );
});

test("tokens cease to exist instead of remaining in non-board zones", () => {
  const source = unit("SOURCE", "Recruit the Vanguard", [
    clause("tokens", {
      effects: [
        binding("action.play_token", 0, {
          tokenCardCode: RECRUIT_TOKEN_CARD_CODE,
          tokenName: "Recruit",
          count: 1,
          placement: "sourceLocation",
        }),
      ],
    }),
  ]);
  const { game, decks } = fixture([source]);
  game.state.players.p1!.zones.base.push("source");
  game.state.cardStates.source = cardState(1);
  decks[0]!.instances.push(instance("source", "p1", "SOURCE"));

  const completed = beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "tokens",
    decks,
  });
  assert.equal(completed, true);
  const tokenId = game.state.createdCardInstances?.[0]?.instanceId;
  assert.ok(tokenId);

  moveUnitToTrash(game, tokenId, createRuntimeCardIndex(decks, game));

  assert.equal(game.state.players.p1!.zones.trash.includes(tokenId), false);
  assert.equal(game.state.players.p1!.zones.base.includes(tokenId), false);
  assert.equal(game.state.cardStates[tokenId], undefined);
});

test("fixed-location token creation plays token at source location", () => {
  const source = unit("SOURCE", "Faithful Manufactor", [
    clause("token-here", {
      effects: [
        binding("action.play_token", 0, {
          tokenCardCode: RECRUIT_TOKEN_CARD_CODE,
          tokenName: "Recruit",
          count: 1,
          placement: "sourceLocation",
        }),
      ],
    }),
  ]);
  const { game, decks } = fixture([source, battlefield("BF", "Training Yard")]);
  decks[0]!.instances.push(instance("source", "p1", "SOURCE"));
  decks[0]!.instances.push(instance("bf-card", "p1", "BF", "battlefield"));
  game.state.cardStates.source = cardState(1);
  game.state.cardStates["bf-card"] = cardState(null);
  game.state.battlefields.push({
    battlefieldId: "bf",
    cardInstanceId: "bf-card",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    units: ["source"],
  });

  const completed = beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "token-here",
    decks,
  });

  assert.equal(completed, true);
  assert.equal(game.state.createdCardInstances?.length, 1);
  assert.equal(game.state.battlefields[0]!.units.length, 2);
  assert.equal(
    createRuntimeCardIndex(decks, game).definitions.get(RECRUIT_TOKEN_CARD_CODE)
      ?.card.media.image_url,
    "https://cmsassets.rgpub.io/sanity/images/dsfx7636/game_data_live/c168ca334739090a060710dfc440982c3462ac8c-744x1039.png",
  );
});

test("fixed-location token creation can use an uncontrolled source battlefield", () => {
  const source = unit("SOURCE", "Noxian Drummer", [
    clause("token-here", {
      effects: [
        binding("action.play_token", 0, {
          tokenCardCode: RECRUIT_TOKEN_CARD_CODE,
          tokenName: "1 :rb_might: Recruit unit",
          count: 1,
          placement: "sourceLocation",
        }),
      ],
    }),
  ]);
  const { game, decks } = fixture([source, battlefield("BF", "Enemy Field")]);
  decks[0]!.instances.push(instance("source", "p1", "SOURCE"));
  decks[1]!.instances.push(instance("bf-card", "p2", "BF", "battlefield"));
  game.state.cardStates.source = cardState(1);
  game.state.cardStates["bf-card"] = cardState(null);
  game.state.battlefields.push({
    battlefieldId: "bf",
    cardInstanceId: "bf-card",
    selectedByPlayerId: "p2",
    controllerPlayerId: "p2",
    contestedByPlayerId: "p1",
    units: ["source"],
  });

  const completed = beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "token-here",
    decks,
  });

  assert.equal(completed, true);
  assert.equal(game.state.createdCardInstances?.length, 1);
  assert.equal(game.state.battlefields[0]!.units.length, 2);
});

test("move triggers can be limited to battlefield destinations", () => {
  const drummer = unit("DRUMMER", "Noxian Drummer", [
    clause("battlefield-move-token", {
      triggers: [
        binding("trigger.on_move", 0, {
          subject: "source",
          destination: "battlefield",
        }),
      ],
      effects: [
        binding("action.play_token", 1, {
          tokenCardCode: RECRUIT_TOKEN_CARD_CODE,
          tokenName: "1 :rb_might: Recruit unit",
          count: 1,
          placement: "sourceLocation",
        }),
      ],
    }),
  ]);
  const { game, decks } = fixture([drummer, battlefield("BF", "Field")]);
  decks[0]!.instances.push(instance("drummer", "p1", "DRUMMER"));
  decks[0]!.instances.push(instance("bf-card", "p1", "BF", "battlefield"));
  game.state.cardStates.drummer = cardState(1);
  game.state.cardStates["bf-card"] = cardState(null);
  game.state.battlefields.push({
    battlefieldId: "bf",
    cardInstanceId: "bf-card",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    units: ["drummer"],
  });

  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const compiled = compileBehaviorModel(drummer.behaviorModel, handlers);
  const baseMoveResult = executeBehaviorClause({
    clause: compiled.clauses[0]!,
    context: createBehaviorContext(
      game,
      "p1",
      "drummer",
      {
        type: "unit.moved",
        actorPlayerId: "p1",
        subjectCardInstanceId: "drummer",
        values: { destination: "base" },
      },
      [],
    ),
    handlers,
  });

  assert.equal(baseMoveResult.executed, false);
  assert.equal(game.state.createdCardInstances?.length ?? 0, 0);

  const battlefieldMoveResult = executeBehaviorClause({
    clause: compiled.clauses[0]!,
    context: createBehaviorContext(
      game,
      "p1",
      "drummer",
      {
        type: "unit.moved",
        actorPlayerId: "p1",
        subjectCardInstanceId: "drummer",
        values: { destination: "battlefield" },
      },
      [],
    ),
    handlers,
  });

  assert.equal(battlefieldMoveResult.executed, true);
  assert.equal(game.state.createdCardInstances?.length, 1);
  assert.equal(game.state.battlefields[0]!.units.length, 2);
  const tokenInstanceId = game.state.createdCardInstances?.[0]?.instanceId;
  assert.ok(tokenInstanceId);
  assert.equal(game.state.cardStates[tokenInstanceId]?.computedMight, 1);
  assert.equal(
    index.definitions.get(RECRUIT_TOKEN_CARD_CODE)?.card.name,
    "Recruit (NX)",
  );
});

test("a battlefield restriction removes moves to base from units there", () => {
  const lair = card("LAIR", "Vilemaw's Lair", "Battlefield", [
    clause("no-base-move", {
      effects: [
        binding("modifier.cannot_move_from_source_battlefield", 0, {
          destination: "base",
        }),
      ],
    }),
  ], null);
  const { game, decks } = fixture([unit("UNIT", "Trapped Unit"), lair]);
  decks[0]!.instances.push(
    instance("unit", "p1", "UNIT"),
    instance("lair", "p1", "LAIR", "battlefield"),
  );
  game.state.battlefields.push({
    battlefieldId: "lair-field",
    cardInstanceId: "lair",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    units: ["unit"],
  });
  game.state.cardStates.unit = cardState(1);
  game.state.cardStates.lair = cardState(null);

  const move = gameplayActions(game, "p1", decks).find(
    (action) =>
      action.label === "Move to Base" && action.sourceCardInstanceId === "unit",
  );

  assert.equal(move, undefined);
});

test("Gear plays ready to its controller's base and exposes its activated ability", () => {
  const seal = card("SEAL", "Seal of Unity", "Gear", [
    clause("add-order", {
      abilities: [
        binding("ability.exhaust_for_resource", 0, {
          resourceType: "power",
          amountSource: "constant",
          amount: 1,
          domain: "order",
          usage: "unrestricted",
        }),
      ],
      timings: [binding("timing.reaction", 1)],
    }),
  ], null);
  const { game, decks } = fixture([seal]);
  decks[0]!.instances.push(instance("seal", "p1", "SEAL"));
  game.state.players.p1!.zones.hand.push("seal");
  game.state.cardStates.seal = cardState(null);

  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.label === "Play Seal of Unity",
  );
  assert.ok(play);
  const played = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: [],
    decks,
    now: "play-gear",
  });
  assert.ok(played.state.players.p1!.zones.base.includes("seal"));
  assert.equal(played.state.cardStates.seal?.exhausted, false);

  const add = gameplayActions(played, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "seal" && action.enabled,
  );
  assert.ok(add);
  const activated = performGameplayAction({
    game: played,
    actorPlayerId: "p1",
    actionId: add.id,
    selectedIds: [],
    decks,
    now: "activate-gear",
  });
  assert.equal(activated.state.players.p1!.power.Order, 1);
  assert.equal(activated.state.cardStates.seal?.exhausted, true);
});

test("an optional Gear kill can target either player's Gear and still draws", () => {
  const salvage = unit("SALVAGE", "Salvage", [
    clause("salvage", {
      selectors: [
        binding("selector.gear", 0, {
          minimumCount: 0,
          maximumCount: 1,
          selectionKey: "targetGear",
        }),
      ],
      effects: [
        binding("action.kill_permanent", 1, { selectionKey: "targetGear" }),
        binding("action.draw_cards", 2, { player: "controller", count: 1 }),
      ],
    }),
  ]);
  const enemyGear = card("GEAR", "Enemy Gear", "Gear", [], null);
  const draw = unit("DRAW", "Draw");
  const { game, decks } = fixture([salvage, enemyGear, draw]);
  decks[0]!.instances.push(
    instance("salvage", "p1", "SALVAGE"),
    instance("gear", "p2", "GEAR"),
    instance("draw", "p1", "DRAW"),
  );
  game.state.players.p1!.zones.base.push("salvage");
  game.state.players.p2!.zones.base.push("gear");
  game.state.players.p1!.zones.mainDeck.push("draw");
  game.state.cardStates.salvage = cardState(1);
  game.state.cardStates.gear = cardState(null);
  game.state.cardStates.draw = cardState(1);

  const handlers = createPrimitiveHandlers(createRuntimeCardIndex(decks, game));
  executeBehaviorClause({
    clause: compileBehaviorModel(salvage.behaviorModel, handlers).clauses[0]!,
    context: createBehaviorContext(game, "p1", "salvage", null, ["gear"]),
    handlers,
  });

  assert.ok(game.state.players.p2!.zones.trash.includes("gear"));
  assert.deepEqual(game.state.players.p1!.zones.hand, ["draw"]);
});

test("a Buff adds one Might only once and clears when its Unit leaves the board", () => {
  const source = unit("SOURCE", "Trifarian Gloryseeker", [
    clause("buff", {
      effects: [binding("action.buff_unit", 0, { target: "source" })],
    }),
  ]);
  const { game, decks } = fixture([source]);
  decks[0]!.instances.push(instance("source", "p1", "SOURCE"));
  game.state.players.p1!.zones.base.push("source");
  game.state.cardStates.source = cardState(1);
  const handlers = createPrimitiveHandlers(createRuntimeCardIndex(decks, game));
  const clauseModel = compileBehaviorModel(source.behaviorModel, handlers).clauses[0]!;

  executeBehaviorClause({
    clause: clauseModel,
    context: createBehaviorContext(game, "p1", "source", null, []),
    handlers,
  });
  executeBehaviorClause({
    clause: clauseModel,
    context: createBehaviorContext(game, "p1", "source", null, []),
    handlers,
  });
  assert.equal(game.state.cardStates.source?.buffed, true);
  assert.equal(game.state.cardStates.source?.computedMight, 2);

  moveUnitToTrash(game, "source", createRuntimeCardIndex(decks, game));
  assert.equal(game.state.cardStates.source?.buffed, false);
});

test("optional choices branch effect resolution without exposing card targets", () => {
  const source = unit("SOURCE", "Optional Effect", [
    clause("optional", {
      choices: [binding("choice.optional", 0, {
        player: "controller", selectionKey: "optional", prompt: "Draw a card?",
      })],
      effects: [binding("action.draw_cards", 1, {
        player: "controller", count: 1, requiresChoiceKey: "optional:choices:0",
      })],
    }),
  ]);
  const draw = unit("DRAW", "Draw");
  const { game, decks } = fixture([source, draw]);
  decks[0]!.instances.push(instance("source", "p1", "SOURCE"));
  decks[0]!.instances.push(instance("draw", "p1", "DRAW"));
  game.state.players.p1!.zones.base.push("source");
  game.state.players.p1!.zones.mainDeck.push("draw");
  game.state.cardStates.source = cardState(1);
  game.state.cardStates.draw = cardState(1);

  assert.equal(beginEffectResolution({ game, controllerPlayerId: "p1", sourceCardInstanceId: "source", clauseId: "optional", decks }), false);
  const choice = gameplayActions(game, "p1", decks).find((action) => action.choice?.kind === "binary");
  assert.ok(choice);

  const declined = performGameplayAction({ game, actorPlayerId: "p1", actionId: choice.id, selectedIds: ["decline"], decks, now: "decline" });
  assert.deepEqual(declined.state.players.p1!.zones.hand, []);
});

test("accepted optional choices execute their gated effects", () => {
  const source = unit("SOURCE", "Optional Effect", [
    clause("optional", {
      choices: [binding("choice.optional", 0, {
        player: "controller", selectionKey: "optional", prompt: "Draw a card?",
      })],
      effects: [binding("action.draw_cards", 1, {
        player: "controller", count: 1, requiresChoiceKey: "optional:choices:0",
      })],
    }),
  ]);
  const draw = unit("DRAW", "Draw");
  const { game, decks } = fixture([source, draw]);
  decks[0]!.instances.push(instance("source", "p1", "SOURCE"));
  decks[0]!.instances.push(instance("draw", "p1", "DRAW"));
  game.state.players.p1!.zones.base.push("source");
  game.state.players.p1!.zones.mainDeck.push("draw");
  game.state.cardStates.source = cardState(1);
  game.state.cardStates.draw = cardState(1);

  beginEffectResolution({ game, controllerPlayerId: "p1", sourceCardInstanceId: "source", clauseId: "optional", decks });
  const choice = gameplayActions(game, "p1", decks).find((action) => action.choice?.kind === "binary");
  assert.ok(choice);

  const accepted = performGameplayAction({ game, actorPlayerId: "p1", actionId: choice.id, selectedIds: ["accept"], decks, now: "accept" });
  assert.deepEqual(accepted.state.players.p1!.zones.hand, ["draw"]);
});

test("activated abilities pay Energy and exhaust their source before resolving", () => {
  const source = unit("SOURCE", "Costed Ability", [
    clause("draw", {
      costs: [
        binding("cost.pay", 0, { amount: 2, resource: "energy" }),
        binding("cost.exhaust_source", 1),
      ],
      abilities: [binding("action.draw_cards", 2, { player: "controller", count: 1 })],
    }),
  ]);
  const { game, decks } = fixture([source]);
  decks[0]!.instances.push(instance("source", "p1", "SOURCE"));
  game.state.players.p1!.zones.base.push("source");
  game.state.players.p1!.energy = 2;
  game.state.cardStates.source = cardState(1);

  const activate = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === "source" && action.enabled,
  );
  assert.ok(activate);

  const activated = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: activate.id,
    selectedIds: [],
    decks,
    now: "activate-costed-ability",
  });

  assert.equal(activated.state.players.p1!.energy, 0);
  assert.equal(activated.state.cardStates.source?.exhausted, true);
  assert.equal(activated.state.chain?.items[0]?.kind, "activatedAbility");
});

test("own-death triggers resolve after their source leaves play", () => {
  const martyr = unit("MARTYR", "Machine Evangel", [
    clause("deathknell", {
      triggers: [binding("trigger.on_death", 0, { subject: "source" })],
      effects: [binding("action.draw_cards", 1, { player: "controller", count: 1 })],
    }),
  ]);
  const { game, decks } = fixture([martyr, unit("DRAW", "Draw Card")]);
  decks[0]!.instances.push(instance("martyr", "p1", "MARTYR"));
  decks[0]!.instances.push(instance("draw", "p1", "DRAW"));
  game.state.players.p1!.zones.base.push("martyr");
  game.state.players.p1!.zones.mainDeck.push("draw");
  game.state.cardStates.martyr = cardState(1);
  game.state.cardStates.draw = cardState(1);

  moveUnitToTrash(game, "martyr", createRuntimeCardIndex(decks, game));
  const deathEvent = game.state.queuedBehaviorEvents?.at(-1);
  assert.equal(deathEvent?.type, "unit.died");
  dispatchBehaviorEvent(game, deathEvent!, decks);
  assert.equal(game.state.chain?.items[0]?.sourceCardInstanceId, "martyr");

  let resolved = passPriority(game, "p1", decks);
  resolved = passPriority(resolved, "p2", decks);
  assert.deepEqual(resolved.state.players.p1!.zones.hand, ["draw"]);
});

test("a selected unit's controller can draw after that unit is killed", () => {
  const source = unit("SOURCE", "Hidden Blade", [
    clause("kill-and-draw", {
      selectors: [
        binding("selector.unit", 0, {
          scope: "any",
          area: "board",
          locationRelation: "any",
          minimumCount: 1,
          maximumCount: 1,
          selectionKey: "targetUnit",
        }),
      ],
      effects: [
        binding("action.kill_unit", 1, {
          target: "unit",
          selectionKey: "targetUnit",
        }),
        binding("action.draw_cards", 2, {
          player: "selectedCardOwner",
          count: 2,
          selectionKey: "targetUnit",
        }),
      ],
    }),
  ]);
  source.card.classification.type = "Spell";
  const target = unit("TARGET", "Target");
  const drawA = unit("DRAW_A", "Opponent Draw A");
  const drawB = unit("DRAW_B", "Opponent Draw B");
  const { game, decks } = fixture([source, target, drawA, drawB]);
  decks[0]!.instances.push(
    instance("source", "p1", "SOURCE"),
    instance("target", "p2", "TARGET"),
    instance("draw-a", "p2", "DRAW_A"),
    instance("draw-b", "p2", "DRAW_B"),
  );
  game.state.players.p1!.zones.base.push("source");
  game.state.players.p2!.zones.base.push("target");
  game.state.players.p2!.zones.mainDeck.push("draw-a", "draw-b");
  game.state.cardStates.source = cardState(null);
  game.state.cardStates.target = cardState(1);
  game.state.cardStates["draw-a"] = cardState(1);
  game.state.cardStates["draw-b"] = cardState(1);

  executeBehaviorClause({
    clause: compileBehaviorModel(
      source.behaviorModel,
      createPrimitiveHandlers(createRuntimeCardIndex(decks, game)),
    ).clauses[0]!,
    context: createBehaviorContext(game, "p1", "source", null, ["target"]),
    handlers: createPrimitiveHandlers(createRuntimeCardIndex(decks, game)),
  });

  assert.ok(game.state.players.p2!.zones.trash.includes("target"));
  assert.deepEqual(game.state.players.p2!.zones.hand, ["draw-a", "draw-b"]);
});

test("recycle effects return selected cards to the matching deck", () => {
  const source = unit("SOURCE", "Recycler", [
    clause("recycle", {
      selectors: [
        binding("selector.card", 0, {
          zone: "trash",
          cardType: "any",
          minimumCount: 1,
          maximumCount: 1,
        }),
      ],
      effects: [binding("action.recycle_cards", 1, { target: "selected", count: 1 })],
    }),
  ]);
  const { game, decks } = fixture([source, unit("CARD", "Discarded Card")]);
  decks[0]!.instances.push(instance("source", "p1", "SOURCE"));
  decks[0]!.instances.push(instance("recycled", "p1", "CARD"));
  game.state.players.p1!.zones.base.push("source");
  game.state.players.p1!.zones.trash.push("recycled");
  game.state.cardStates.source = cardState(1);
  game.state.cardStates.recycled = cardState(1);

  const completed = beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "recycle",
    selectedIds: ["recycled"],
    decks,
  });

  assert.equal(completed, true);
  assert.deepEqual(game.state.players.p1!.zones.trash, []);
  assert.deepEqual(game.state.players.p1!.zones.mainDeck, ["recycled"]);
  assert.equal(game.state.queuedBehaviorEvents?.at(-1)?.type, "card.recycled");
});

test("banish effects move selected cards to their owner's Banishment", () => {
  const source = unit("SOURCE", "Banisher", [
    clause("banish", {
      selectors: [
        binding("selector.card", 0, {
          zone: "trash",
          cardType: "any",
          minimumCount: 1,
          maximumCount: 1,
        }),
      ],
      effects: [binding("action.banish_card", 1, { target: "selected" })],
    }),
  ]);
  const { game, decks } = fixture([source, unit("CARD", "Discarded Card")]);
  decks[0]!.instances.push(instance("source", "p1", "SOURCE"));
  decks[0]!.instances.push(instance("banished", "p1", "CARD"));
  game.state.players.p1!.zones.base.push("source");
  game.state.players.p1!.zones.trash.push("banished");
  game.state.cardStates.source = cardState(1);
  game.state.cardStates.banished = cardState(1);

  const completed = beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "banish",
    selectedIds: ["banished"],
    decks,
  });

  assert.equal(completed, true);
  assert.deepEqual(game.state.players.p1!.zones.trash, []);
  assert.deepEqual(game.state.players.p1!.zones.banishment, ["banished"]);
  assert.equal(game.state.queuedBehaviorEvents?.at(-1)?.type, "card.banished");
});

test("ready and exhaust effects update selected cards and emit events", () => {
  const source = unit("SOURCE", "Status Changer", [
    clause("exhaust", {
      selectors: [
        binding("selector.friendly_unit", 0, {
          area: "board",
          locationRelation: "any",
          minimumCount: 1,
          maximumCount: 1,
          excludesSource: true,
        }),
      ],
      effects: [binding("action.exhaust_cards", 1, { target: "selected", count: 1 })],
    }),
    { ...clause("ready", {
      selectors: [
        binding("selector.friendly_unit", 0, {
          area: "board",
          locationRelation: "any",
          minimumCount: 1,
          maximumCount: 1,
          excludesSource: true,
        }),
      ],
      effects: [
        binding("action.ready_cards", 1, {
          player: "controller",
          target: "selected",
          count: 1,
        }),
      ],
    }), sequence: 1 },
  ]);
  const { game, decks } = fixture([source, unit("ALLY", "Ally")]);
  decks[0]!.instances.push(instance("source", "p1", "SOURCE"));
  decks[0]!.instances.push(instance("ally", "p1", "ALLY"));
  game.state.players.p1!.zones.base.push("source", "ally");
  game.state.cardStates.source = cardState(1);
  game.state.cardStates.ally = cardState(1);

  beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "exhaust",
    selectedIds: ["ally"],
    decks,
  });
  assert.equal(game.state.cardStates.ally?.exhausted, true);
  assert.equal(game.state.queuedBehaviorEvents?.at(-1)?.type, "card.exhausted");

  beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "ready",
    selectedIds: ["ally"],
    decks,
  });
  assert.equal(game.state.cardStates.ally?.exhausted, false);
  assert.equal(game.state.queuedBehaviorEvents?.at(-1)?.type, "card.readied");
});

test("stun marks a unit once and clears at the next Ending Step", () => {
  const source = unit("SOURCE", "Stunner", [
    clause("stun", {
      selectors: [
        binding("selector.enemy_unit", 0, {
          area: "board",
          locationRelation: "any",
          minimumCount: 1,
          maximumCount: 1,
        }),
      ],
      effects: [binding("action.stun_card", 1, { target: "selected" })],
    }),
  ]);
  const { game, decks } = fixture([source, unit("ENEMY", "Enemy")]);
  decks[0]!.instances.push(instance("source", "p1", "SOURCE"));
  decks[1]!.instances.push(instance("enemy", "p2", "ENEMY"));
  game.state.players.p1!.zones.base.push("source");
  game.state.players.p2!.zones.base.push("enemy");
  game.state.cardStates.source = cardState(1);
  game.state.cardStates.enemy = cardState(2);

  beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "stun",
    selectedIds: ["enemy"],
    decks,
  });
  assert.equal(game.state.cardStates.enemy?.stunned, true);
  assert.equal(game.state.queuedBehaviorEvents?.at(-1)?.type, "unit.stunned");

  clearStunned(game);
  assert.equal(game.state.cardStates.enemy?.stunned, false);
});

test("dependent deferred unit selectors constrain the second target to the first target's battlefield", () => {
  const facebreaker = unit("FACEBREAKER", "Facebreaker", [
    clause("stun-pair", {
      selectors: [
        binding("selector.friendly_unit", 0, {
          area: "battlefield",
          locationRelation: "any",
          minimumCount: 1,
          maximumCount: 1,
          deferred: true,
          selectionKey: "friendlyTarget",
        }),
        binding("selector.enemy_unit", 1, {
          area: "battlefield",
          locationRelation: "selectedTargetLocation",
          minimumCount: 1,
          maximumCount: 1,
          deferred: true,
          selectionKey: "enemyTarget",
          referenceSelectionKey: "friendlyTarget",
        }),
      ],
      effects: [binding("action.stun_card", 2, { target: "unit" })],
    }),
  ]);
  facebreaker.card.classification.type = "Spell";
  const { game, decks } = fixture([
    facebreaker,
    unit("FRIENDLY", "Friendly"),
    unit("ENEMY_SAME", "Enemy at same battlefield"),
    unit("ENEMY_OTHER", "Enemy at other battlefield"),
    battlefield("FIELD_ONE", "Field one"),
    battlefield("FIELD_TWO", "Field two"),
  ]);
  decks[0]!.instances.push(
    instance("facebreaker", "p1", "FACEBREAKER"),
    instance("friendly", "p1", "FRIENDLY"),
    instance("field-one", "p1", "FIELD_ONE", "battlefield"),
    instance("field-two", "p1", "FIELD_TWO", "battlefield"),
  );
  decks[1]!.instances.push(
    instance("enemy-same", "p2", "ENEMY_SAME"),
    instance("enemy-other", "p2", "ENEMY_OTHER"),
  );
  game.state.cardStates.facebreaker = cardState(null);
  game.state.cardStates.friendly = cardState(1);
  game.state.cardStates["enemy-same"] = cardState(1);
  game.state.cardStates["enemy-other"] = cardState(1);
  game.state.cardStates["field-one"] = cardState(null);
  game.state.cardStates["field-two"] = cardState(null);
  game.state.battlefields.push(
    {
      battlefieldId: "field-one",
      cardInstanceId: "field-one",
      selectedByPlayerId: "p1",
      controllerPlayerId: "p1",
      units: ["friendly", "enemy-same"],
    },
    {
      battlefieldId: "field-two",
      cardInstanceId: "field-two",
      selectedByPlayerId: "p2",
      controllerPlayerId: "p2",
      units: ["enemy-other"],
    },
  );

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "facebreaker",
    clauseId: "stun-pair",
    decks,
  }), false);
  assert.equal(game.state.pendingChoice?.type, "effectSelection");
  if (game.state.pendingChoice?.type !== "effectSelection") {
    throw new Error("Expected the friendly target selection.");
  }
  assert.deepEqual(game.state.pendingChoice.legalCardIds, ["friendly"]);

  submitEffectSelection(game, "p1", ["friendly"], decks);
  assert.equal(game.state.pendingChoice?.type, "effectSelection");
  if (game.state.pendingChoice?.type !== "effectSelection") {
    throw new Error("Expected the enemy target selection.");
  }
  assert.deepEqual(game.state.pendingChoice.legalCardIds, ["enemy-same"]);

  submitEffectSelection(game, "p1", ["enemy-same"], decks);
  assert.equal(game.state.pendingChoice, null);
  assert.equal(game.state.cardStates.friendly?.stunned, true);
  assert.equal(game.state.cardStates["enemy-same"]?.stunned, true);
  assert.notEqual(game.state.cardStates["enemy-other"]?.stunned, true);
});

test("an optional Buff cost can replace a spell's normal cost before its deferred target is chosen", () => {
  const callToGlory = unit("CALL_TO_GLORY", "Call to Glory", [
    clause("call-to-glory", {
      timings: [binding("timing.reaction", 0)],
      selectors: [
        binding("selector.friendly_unit", 1, {
          area: "board",
          locationRelation: "any",
          minimumCount: 0,
          maximumCount: 1,
          buffedOnly: true,
          selectionKey: "spentBuff",
          selectionPurpose: "optionalCost",
        }),
        binding("selector.unit", 3, {
          scope: "any",
          area: "board",
          locationRelation: "any",
          minimumCount: 1,
          maximumCount: 1,
          deferred: true,
          selectionKey: "targetUnit",
        }),
      ],
      costs: [binding("cost.spend_buff", 2, {
        selectionKey: "spentBuff",
        optional: true,
        ignoreBaseCost: true,
      })],
      effects: [binding("modifier.modify_numeric_value", 4, {
        attribute: "might",
        operation: "increase",
        operand: "constant",
        amount: 3,
        target: "unit",
        selectionKey: "targetUnit",
        duration: "thisTurn",
      })],
    }),
  ]);
  callToGlory.card.classification.type = "Spell";
  callToGlory.card.attributes.energy = 5;
  callToGlory.card.attributes.power = 1;
  const { game, decks } = fixture([
    callToGlory,
    unit("BUFFED", "Buffed ally"),
    unit("TARGET", "Target"),
  ]);
  decks[0]!.instances.push(
    instance("call-to-glory", "p1", "CALL_TO_GLORY"),
    instance("buffed", "p1", "BUFFED"),
  );
  decks[1]!.instances.push(instance("target", "p2", "TARGET"));
  game.state.players.p1!.zones.hand.push("call-to-glory");
  game.state.players.p1!.zones.base.push("buffed");
  game.state.players.p2!.zones.base.push("target");
  game.state.cardStates["call-to-glory"] = cardState(null);
  game.state.cardStates.buffed = { ...cardState(2), buffed: true };
  game.state.cardStates.target = cardState(2);

  const action = gameplayActions(game, "p1", decks).find(
    (candidate) => candidate.sourceCardInstanceId === "call-to-glory",
  );
  assert.ok(action?.enabled);
  assert.deepEqual(action?.targets.map((target) => target.legalIds), [["buffed"]]);

  const played = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: action.id,
    selectedIds: ["buffed"],
    decks,
    now: "call-to-glory",
  });
  assert.equal(played.state.cardStates.buffed?.buffed, false);
  assert.equal(played.state.cardStates.buffed?.computedMight, 1);
  assert.equal(played.state.players.p1!.energy, 0);
  assert.deepEqual(played.state.chain?.items.at(-1)?.targetCardInstanceIds, ["buffed"]);

  assert.equal(beginEffectResolution({
    game: played,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "call-to-glory",
    clauseId: "call-to-glory",
    selectedIds: ["buffed"],
    targetsLocked: false,
    decks,
  }), false);
  assert.equal(played.state.pendingChoice?.type, "effectSelection");
  if (played.state.pendingChoice?.type !== "effectSelection") {
    throw new Error("Expected a deferred target choice.");
  }
  assert.deepEqual(played.state.pendingChoice.legalCardIds, ["buffed", "target"]);
  submitEffectSelection(played, "p1", ["target"], decks);
  assert.equal(played.state.cardStates.target?.computedMight, 4);
});

test("each player can make their own deferred unit selection before both units are killed", () => {
  const cullTheWeak = unit("CULL_THE_WEAK", "Cull the Weak", [
    clause("cull", {
      selectors: [
        binding("selector.friendly_unit", 0, {
          area: "board",
          locationRelation: "any",
          minimumCount: 1,
          maximumCount: 1,
          deferred: true,
          selectionKey: "controllerUnit",
          selectionPlayer: "controller",
        }),
        binding("selector.enemy_unit", 1, {
          area: "board",
          locationRelation: "any",
          minimumCount: 1,
          maximumCount: 1,
          deferred: true,
          selectionKey: "opponentUnit",
          selectionPlayer: "opponent",
        }),
      ],
      effects: [binding("action.kill_unit", 2, { target: "unit" })],
    }),
  ]);
  cullTheWeak.card.classification.type = "Spell";
  const { game, decks } = fixture([
    cullTheWeak,
    unit("CONTROLLER_UNIT", "Controller unit"),
    unit("OPPONENT_UNIT", "Opponent unit"),
  ]);
  decks[0]!.instances.push(
    instance("cull", "p1", "CULL_THE_WEAK"),
    instance("controller-unit", "p1", "CONTROLLER_UNIT"),
  );
  decks[1]!.instances.push(instance("opponent-unit", "p2", "OPPONENT_UNIT"));
  game.state.players.p1!.zones.base.push("controller-unit");
  game.state.players.p2!.zones.base.push("opponent-unit");
  game.state.cardStates.cull = cardState(null);
  game.state.cardStates["controller-unit"] = cardState(1);
  game.state.cardStates["opponent-unit"] = cardState(1);

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "cull",
    clauseId: "cull",
    decks,
  }), false);
  assert.equal(game.state.pendingChoice?.playerId, "p1");
  submitEffectSelection(game, "p1", ["controller-unit"], decks);
  assert.equal(game.state.pendingChoice?.playerId, "p2");
  if (game.state.pendingChoice?.type !== "effectSelection") {
    throw new Error("Expected the opponent's unit choice.");
  }
  assert.deepEqual(game.state.pendingChoice.legalCardIds, ["opponent-unit"]);

  submitEffectSelection(game, "p2", ["opponent-unit"], decks);
  assert.equal(game.state.players.p1!.zones.trash.includes("controller-unit"), true);
  assert.equal(game.state.players.p2!.zones.trash.includes("opponent-unit"), true);
});

test("a turn-scoped ongoing trigger remains active after its source spell is in Trash", () => {
  const imperialDecree = unit("IMPERIAL_DECREE", "Imperial Decree", [
    clause("activate-decree", {
      timings: [binding("timing.action", 0)],
      effects: [binding("modifier.enable_source_triggers", 1, {
        duration: "thisTurn",
      })],
    }),
    clause("kill-damaged-unit", {
      triggers: [binding("trigger.on_damage", 0, { subject: "any_unit" })],
      effects: [binding("action.kill_unit", 1, { target: "event_subject" })],
    }),
  ]);
  imperialDecree.card.classification.type = "Spell";
  imperialDecree.behaviorModel.clauses[1]!.sequence = 1;
  const damageSource = unit("DAMAGE_SOURCE", "Damage source", [
    clause("damage", {
      selectors: [binding("selector.unit", 0, {
        scope: "any",
        area: "board",
        locationRelation: "any",
        minimumCount: 1,
        maximumCount: 1,
      })],
      effects: [binding("action.deal_damage", 1, {
        amount: 1,
        target: "unit",
      })],
    }),
  ]);
  const { game, decks } = fixture([
    imperialDecree,
    damageSource,
    unit("TARGET", "Target"),
  ]);
  decks[0]!.instances.push(instance("decree", "p1", "IMPERIAL_DECREE"));
  decks[1]!.instances.push(
    instance("damage-source", "p2", "DAMAGE_SOURCE"),
    instance("target", "p2", "TARGET"),
  );
  game.state.players.p1!.zones.trash.push("decree");
  game.state.players.p2!.zones.base.push("damage-source", "target");
  game.state.cardStates.decree = cardState(null);
  game.state.cardStates["damage-source"] = cardState(1);
  game.state.cardStates.target = cardState(2);

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "decree",
    clauseId: "activate-decree",
    decks,
  }), true);
  assert.equal(game.state.ongoingEffects.length, 1);

  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const damageClause = compileBehaviorModel(
    damageSource.behaviorModel,
    handlers,
  ).clauses[0]!;
  executeBehaviorClause({
    clause: damageClause,
    context: createBehaviorContext(game, "p2", "damage-source", null, ["target"]),
    handlers,
  });
  const damageEvent = game.state.queuedBehaviorEvents?.shift();
  assert.ok(damageEvent);
  dispatchBehaviorEvent(game, damageEvent, decks);
  const trigger = game.state.chain?.items.at(-1);
  assert.equal(trigger?.sourceCardInstanceId, "decree");
  assert.equal(trigger?.behaviorClauseId, "kill-damaged-unit");

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "decree",
    clauseId: "kill-damaged-unit",
    behaviorEvent: damageEvent,
    decks,
  }), true);
  assert.equal(game.state.players.p2!.zones.trash.includes("target"), true);
});

test("a selected eligible Unit can be played from Trash to a chosen controlled battlefield", () => {
  const spectralMatron = unit("SPECTRAL_MATRON", "Spectral Matron", [
    clause("play-from-trash", {
      triggers: [binding("trigger.on_play", 0, {
        actor: "controller",
        subject: "source",
      })],
      selectors: [binding("selector.card", 1, {
        zone: "trash",
        cardType: "Unit",
        owner: "controller",
        minimumCount: 0,
        maximumCount: 1,
        maximumEnergy: 3,
        maximumPower: 1,
        deferred: true,
        selectionKey: "unitToPlay",
      })],
      effects: [binding("action.play_selected_unit", 2, {
        sourceSelectionKey: "unitToPlay",
        selectionKey: "destination",
      })],
    }),
  ]);
  const eligible = unit("ELIGIBLE", "Eligible Unit");
  eligible.card.attributes.energy = 3;
  eligible.card.attributes.power = 1;
  const expensive = unit("EXPENSIVE", "Expensive Unit");
  expensive.card.attributes.energy = 4;
  const { game, decks } = fixture([
    spectralMatron,
    eligible,
    expensive,
    battlefield("FIELD", "Controlled field"),
  ]);
  decks[0]!.instances.push(
    instance("matron", "p1", "SPECTRAL_MATRON"),
    instance("eligible", "p1", "ELIGIBLE"),
    instance("expensive", "p1", "EXPENSIVE"),
    instance("field", "p1", "FIELD", "battlefield"),
  );
  game.state.players.p1!.zones.base.push("matron");
  game.state.players.p1!.zones.trash.push("eligible", "expensive");
  game.state.cardStates.matron = cardState(1);
  game.state.cardStates.eligible = cardState(1);
  game.state.cardStates.expensive = cardState(1);
  game.state.cardStates.field = cardState(null);
  game.state.battlefields.push({
    battlefieldId: "field",
    cardInstanceId: "field",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    units: [],
  });

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "matron",
    clauseId: "play-from-trash",
    decks,
  }), false);
  assert.equal(game.state.pendingChoice?.type, "effectSelection");
  if (game.state.pendingChoice?.type !== "effectSelection") {
    throw new Error("Expected the Unit selection from Trash.");
  }
  assert.deepEqual(game.state.pendingChoice.legalCardIds, ["eligible"]);
  submitEffectSelection(game, "p1", ["eligible"], decks);
  const destinationChoice = game.state.pendingChoice as GameDocument["state"]["pendingChoice"];
  assert.equal(destinationChoice?.type, "tokenPlacement");
  if (destinationChoice?.type !== "tokenPlacement") {
    throw new Error("Expected the Unit destination choice.");
  }
  assert.deepEqual(destinationChoice.legalDestinationIds, ["base", "field"]);

  submitTokenPlacement(game, "p1", [{ destinationId: "field", count: 1 }], decks);
  assert.equal(game.state.players.p1!.zones.trash.includes("eligible"), false);
  assert.deepEqual(game.state.battlefields[0]?.units, ["eligible"]);
  assert.equal(game.state.cardStates.eligible?.exhausted, true);
});

test("Hidden cards use an empty controlled facedown slot and play free next turn", () => {
  const hiddenUnit = unit("HIDDEN", "Hidden Unit", [
    clause("hidden", { keywords: [binding("keyword.hidden", 0)] }),
  ]);
  const { game, decks } = fixture([hiddenUnit, battlefield("BF", "Field")]);
  decks[0]!.instances.push(instance("hidden", "p1", "HIDDEN"));
  decks[0]!.instances.push(instance("bf-card", "p1", "BF", "battlefield"));
  game.state.players.p1!.zones.hand.push("hidden");
  game.state.players.p1!.power.Rainbow = 1;
  game.state.cardStates.hidden = cardState(1);
  game.state.cardStates["bf-card"] = cardState(null);
  game.state.battlefields.push({
    battlefieldId: "bf",
    cardInstanceId: "bf-card",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    units: [],
  });

  const hide = gameplayActions(game, "p1", decks).find(
    (action) => action.label.startsWith("Hide Hidden Unit"),
  );
  assert.ok(hide);
  const hidden = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: hide.id,
    selectedIds: [],
    decks,
    now: "hide",
  });
  assert.equal(hidden.state.battlefields[0]?.facedownCardInstanceId, "hidden");
  assert.equal(hidden.state.players.p1!.power.Rainbow, 0);

  hidden.state.turn = { turnNumber: 2, activePlayerId: "p2", phase: "action" };
  const playHidden = gameplayActions(hidden, "p1", decks).find(
    (action) => action.label === "Play Hidden Hidden Unit",
  );
  assert.ok(playHidden);
  const played = performGameplayAction({
    game: hidden,
    actorPlayerId: "p1",
    actionId: playHidden.id,
    selectedIds: [],
    decks,
    now: "play-hidden",
  });
  assert.deepEqual(played.state.battlefields[0]?.units, ["hidden"]);
  assert.equal(played.state.battlefields[0]?.facedownCardInstanceId, null);
});

test("automatic enemy-unit modifiers affect every enemy without a target choice", () => {
  const watcher = unit("WATCHER", "Thousand-Tailed Watcher", [
    clause("play", {
      triggers: [
        binding("trigger.on_play", 0, { actor: "controller", subject: "source" }),
      ],
      selectors: [
        binding("selector.enemy_unit", 1, {
          area: "board",
          locationRelation: "any",
          minimumCount: 0,
          automatic: true,
        }),
      ],
      effects: [
        binding("modifier.modify_numeric_value", 2, {
          attribute: "might",
          operation: "reduce",
          operand: "constant",
          amount: 3,
          target: "enemy_unit",
          duration: "thisTurn",
          minimum: 1,
        }),
      ],
    }),
  ]);
  const enemyBase = unit("ENEMY_BASE", "Enemy Base");
  enemyBase.card.attributes.might = 2;
  const enemyField = unit("ENEMY_FIELD", "Enemy Field");
  enemyField.card.attributes.might = 6;
  const { game, decks } = fixture([watcher, unit("ALLY", "Ally"), enemyBase, enemyField]);
  decks[0]!.instances.push(instance("watcher", "p1", "WATCHER"), instance("ally", "p1", "ALLY"));
  decks[1]!.instances.push(instance("enemy-base", "p2", "ENEMY_BASE"), instance("enemy-field", "p2", "ENEMY_FIELD"));
  game.state.players.p1!.zones.base.push("watcher", "ally");
  game.state.players.p2!.zones.base.push("enemy-base");
  game.state.battlefields.push({
    battlefieldId: "field",
    cardInstanceId: "field-card",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    units: ["enemy-field"],
  });
  game.state.cardStates.watcher = cardState(7);
  game.state.cardStates.ally = cardState(4);
  game.state.cardStates["enemy-base"] = cardState(2);
  game.state.cardStates["enemy-field"] = cardState(6);

  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const compiledClause = compileBehaviorModel(watcher.behaviorModel, handlers).clauses[0]!;
  const result = executeBehaviorClause({
    clause: compiledClause,
    context: createBehaviorContext(game, "p1", "watcher", {
      type: "card.played",
      actorPlayerId: "p1",
      subjectCardInstanceId: "watcher",
      values: {},
    }, []),
    handlers,
  });

  assert.equal(result.executed, true);
  assert.equal(game.state.cardStates.ally?.computedMight, 4);
  assert.equal(game.state.cardStates["enemy-base"]?.computedMight, 1);
  assert.equal(game.state.cardStates["enemy-field"]?.computedMight, 3);
});

test("battlefield defend triggers can optionally move a friendly defender to base", () => {
  const reaversRow = battlefield("REAVERS_ROW", "Reaver's Row");
  reaversRow.behaviorModel.clauses = [
    clause("defend-here", {
      triggers: [binding("trigger.defend_at_source_battlefield", 0)],
      selectors: [
        binding("selector.friendly_unit", 1, {
          area: "battlefield",
          locationRelation: "sourceBattlefield",
          controller: "controller",
          minimumCount: 0,
          maximumCount: 1,
        }),
      ],
      effects: [binding("action.move_unit", 2, { destination: "base", count: 1 })],
    }),
  ];
  const { game, decks } = fixture([reaversRow, unit("DEFENDER", "Defender")]);
  decks[0]!.instances.push(instance("reavers-row", "p1", "REAVERS_ROW", "battlefield"), instance("defender", "p1", "DEFENDER"));
  game.state.battlefields.push({
    battlefieldId: "row",
    cardInstanceId: "reavers-row",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    units: ["defender"],
  });
  game.state.cardStates["reavers-row"] = cardState(null);
  game.state.cardStates.defender = cardState(1);

  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const compiledClause = compileBehaviorModel(reaversRow.behaviorModel, handlers).clauses[0]!;
  const result = executeBehaviorClause({
    clause: compiledClause,
    context: createBehaviorContext(game, "p1", "reavers-row", {
      type: "unit.defends",
      actorPlayerId: "p1",
      subjectCardInstanceId: "defender",
      values: { battlefieldId: "row" },
    }, ["defender"]),
    handlers,
  });

  assert.equal(result.executed, true);
  assert.deepEqual(game.state.battlefields[0]?.units, []);
  assert.deepEqual(game.state.players.p1!.zones.base, ["defender"]);
});

test("a battlefield defend trigger is queued once for multiple defenders", () => {
  const reaversRow = battlefield("REAVERS_ROW", "Reaver's Row");
  reaversRow.behaviorModel.clauses = [
    clause("defend-here", {
      triggers: [binding("trigger.defend_at_source_battlefield", 0)],
      effects: [binding("action.draw_cards", 1, { player: "controller", count: 0 })],
    }),
  ];
  const { game, decks } = fixture([
    reaversRow,
    unit("DEFENDER_A", "Defender A"),
    unit("DEFENDER_B", "Defender B"),
  ]);
  decks[0]!.instances.push(
    instance("reavers-row", "p1", "REAVERS_ROW", "battlefield"),
    instance("defender-a", "p1", "DEFENDER_A"),
    instance("defender-b", "p1", "DEFENDER_B"),
  );
  game.state.cardStates["reavers-row"] = cardState(null);
  game.state.cardStates["defender-a"] = cardState(1);
  game.state.cardStates["defender-b"] = cardState(1);
  game.state.battlefields.push({
    battlefieldId: "row",
    cardInstanceId: "reavers-row",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    units: ["defender-a", "defender-b"],
  });

  dispatchSimultaneousBehaviorEvents(game, [
    {
      type: "unit.defends",
      actorPlayerId: "p1",
      subjectCardInstanceId: "defender-a",
      values: { battlefieldId: "row" },
    },
    {
      type: "unit.defends",
      actorPlayerId: "p1",
      subjectCardInstanceId: "defender-b",
      values: { battlefieldId: "row" },
    },
  ], decks);

  assert.equal(game.state.chain?.items.length, 1);
  assert.equal(game.state.chain?.items[0]?.sourceCardInstanceId, "reavers-row");
});

test("a defender's battlefield trigger restores focus to the attacker", () => {
  const reaversRow = battlefield("REAVERS_ROW", "Reaver's Row");
  reaversRow.behaviorModel.clauses = [
    clause("defend-here", {
      triggers: [binding("trigger.defend_at_source_battlefield", 0)],
      effects: [binding("action.draw_cards", 1, { player: "controller", count: 0 })],
    }),
  ];
  const { game, decks } = fixture([reaversRow, unit("DEFENDER", "Defender")]);
  decks[1]!.instances.push(
    instance("reavers-row", "p2", "REAVERS_ROW", "battlefield"),
    instance("defender", "p2", "DEFENDER"),
  );
  game.state.cardStates["reavers-row"] = cardState(null);
  game.state.cardStates.defender = cardState(1);
  game.state.battlefields.push({
    battlefieldId: "row",
    cardInstanceId: "reavers-row",
    selectedByPlayerId: "p2",
    controllerPlayerId: "p2",
    units: ["defender"],
  });
  game.state.showdown = {
    kind: "combat",
    battlefieldId: "row",
    relevantPlayerIds: ["p1", "p2"],
    focusPlayerId: "p1",
    passedPlayerIds: [],
  };

  dispatchBehaviorEvent(game, {
    type: "unit.defends",
    actorPlayerId: "p2",
    subjectCardInstanceId: "defender",
    values: { battlefieldId: "row" },
  }, decks);
  let next = passPriority(game, "p2", decks);
  next = passPriority(next, "p1", decks);

  assert.equal(next.state.chain, null);
  assert.equal(next.state.showdown?.focusPlayerId, "p1");
});

test("declining Reaver's Row selection resumes the trigger chain", () => {
  const reaversRow = battlefield("REAVERS_ROW", "Reaver's Row");
  reaversRow.behaviorModel.clauses = [
    clause("defend-here", {
      triggers: [binding("trigger.defend_at_source_battlefield", 0)],
      selectors: [
        binding("selector.friendly_unit", 1, {
          area: "battlefield",
          locationRelation: "sourceBattlefield",
          controller: "controller",
          minimumCount: 0,
          maximumCount: 1,
        }),
      ],
      effects: [binding("action.move_unit", 2, { destination: "base", count: 1 })],
    }),
  ];
  const { game, decks } = fixture([reaversRow, unit("DEFENDER", "Defender")]);
  decks[0]!.instances.push(
    instance("reavers-row", "p1", "REAVERS_ROW", "battlefield"),
    instance("defender", "p1", "DEFENDER"),
  );
  game.state.cardStates["reavers-row"] = cardState(null);
  game.state.cardStates.defender = cardState(1);
  game.state.battlefields.push({
    battlefieldId: "row",
    cardInstanceId: "reavers-row",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    units: ["defender"],
  });

  dispatchBehaviorEvent(game, {
    type: "unit.defends",
    actorPlayerId: "p1",
    subjectCardInstanceId: "defender",
    values: { battlefieldId: "row" },
  }, decks);
  const choice = gameplayActions(game, "p1", decks).find(
    (action) => action.choice?.kind === "effectSelection",
  );
  assert.ok(choice);
  let next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: choice.id,
    selectedIds: [],
    decks,
    now: "decline-reaver",
  });
  assert.equal(next.state.pendingChoice, null);
  assert.equal(next.state.chain?.items.length, 1);
  assert.deepEqual(next.state.battlefields[0]?.units, ["defender"]);

  next = passPriority(next, "p1", decks);
  next = passPriority(next, "p2", decks);
  assert.equal(next.state.chain, null);
});

test("Candlelit Sanctum recycles and orders only its original looked-at cards", () => {
  const sanctum = battlefield("SANCTUM", "The Candlelit Sanctum");
  sanctum.behaviorModel.clauses = [
    clause("conquer", {
      effects: [
        binding("action.look", 0, { count: 2, selectionKey: "lookedCards" }),
        binding("action.recycle_top_cards", 1, {
          count: 2,
          sourceSelectionKey: "lookedCards",
          selectionKey: "recycledCards",
        }),
        binding("action.order_top_cards", 2, {
          count: 2,
          sourceSelectionKey: "lookedCards",
          recycledSelectionKey: "recycledCards",
        }),
      ],
    }),
  ];
  const { game, decks } = fixture([
    sanctum,
    unit("TOP_A", "Top A"),
    unit("TOP_B", "Top B"),
    unit("TOP_C", "Top C"),
  ]);
  decks[0]!.instances.push(
    instance("sanctum", "p1", "SANCTUM", "battlefield"),
    instance("top-a", "p1", "TOP_A"),
    instance("top-b", "p1", "TOP_B"),
    instance("top-c", "p1", "TOP_C"),
  );
  game.state.players.p1!.zones.mainDeck.push("top-a", "top-b", "top-c");
  game.state.cardStates.sanctum = cardState(null);
  game.state.cardStates["top-a"] = cardState(1);
  game.state.cardStates["top-b"] = cardState(1);
  game.state.cardStates["top-c"] = cardState(1);

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "sanctum",
    clauseId: "conquer",
    decks,
  }), false);
  assert.equal(game.state.pendingChoice?.type, "effectSelection");
  assert.deepEqual(
    game.state.pendingChoice?.type === "effectSelection"
      ? game.state.pendingChoice.legalCardIds
      : [],
    ["top-a", "top-b"],
  );
  submitEffectSelection(game, "p1", ["top-a"], decks);

  assert.equal(game.state.pendingChoice, null);
  assert.deepEqual(game.state.players.p1!.zones.mainDeck, ["top-b", "top-c", "top-a"]);
});

test("Candlelit Sanctum persists a submitted order when no cards are recycled", () => {
  const sanctum = battlefield("SANCTUM", "The Candlelit Sanctum");
  sanctum.behaviorModel.clauses = [
    clause("conquer", {
      effects: [
        binding("action.look", 0, { count: 2, selectionKey: "lookedCards" }),
        binding("action.recycle_top_cards", 1, {
          count: 2,
          sourceSelectionKey: "lookedCards",
          selectionKey: "recycledCards",
        }),
        binding("action.order_top_cards", 2, {
          count: 2,
          sourceSelectionKey: "lookedCards",
          recycledSelectionKey: "recycledCards",
        }),
      ],
    }),
  ];
  const { game, decks } = fixture([
    sanctum,
    unit("TOP_A", "Top A"),
    unit("TOP_B", "Top B"),
    unit("TOP_C", "Top C"),
  ]);
  decks[0]!.instances.push(
    instance("sanctum", "p1", "SANCTUM", "battlefield"),
    instance("top-a", "p1", "TOP_A"),
    instance("top-b", "p1", "TOP_B"),
    instance("top-c", "p1", "TOP_C"),
  );
  game.state.players.p1!.zones.mainDeck.push("top-a", "top-b", "top-c");
  game.state.cardStates.sanctum = cardState(null);
  game.state.cardStates["top-a"] = cardState(1);
  game.state.cardStates["top-b"] = cardState(1);
  game.state.cardStates["top-c"] = cardState(1);

  beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "sanctum",
    clauseId: "conquer",
    decks,
  });
  submitEffectSelection(game, "p1", [], decks);
  assert.equal(game.state.pendingChoice?.type, "effectSelection");
  assert.deepEqual(
    game.state.pendingChoice?.type === "effectSelection"
      ? game.state.pendingChoice.legalCardIds
      : [],
    ["top-a", "top-b"],
  );
  submitEffectSelection(game, "p1", ["top-b", "top-a"], decks);

  assert.equal(game.state.pendingChoice, null);
  assert.deepEqual(game.state.players.p1!.zones.mainDeck, ["top-b", "top-a", "top-c"]);
});

test("combat deaths immediately queue their own Deathknell trigger", () => {
  const sentry = unit("SENTRY", "Watchful Sentry", [
    clause("deathknell", {
      triggers: [binding("trigger.on_death", 0, { subject: "source" })],
      effects: [binding("action.draw_cards", 1, { player: "controller", count: 1 })],
    }),
  ]);
  const { game, decks } = fixture([
    sentry,
    unit("DEFENDER", "Defender"),
    battlefield("BF", "Battlefield"),
  ]);
  decks[0]!.instances.push(instance("sentry", "p1", "SENTRY"));
  decks[1]!.instances.push(
    instance("defender", "p2", "DEFENDER"),
    instance("bf-card", "p2", "BF", "battlefield"),
  );
  game.state.cardStates.sentry = cardState(1);
  game.state.cardStates.defender = cardState(2);
  game.state.cardStates["bf-card"] = cardState(null);
  game.state.battlefields.push({
    battlefieldId: "bf",
    cardInstanceId: "bf-card",
    selectedByPlayerId: "p2",
    controllerPlayerId: "p2",
    units: ["sentry", "defender"],
  });

  const index = createRuntimeCardIndex(decks, game);
  assert.equal(startCombat(game, "bf", "p1", index, decks), true);
  let next = passFocus(game, "p1", decks);
  next = passFocus(next, "p2", decks);

  assert.ok(next.state.players.p1!.zones.trash.includes("sentry"));
  assert.equal(next.state.chain?.items.length, 1);
  assert.equal(next.state.chain?.items[0]?.sourceCardInstanceId, "sentry");
});

test("the first-beginning trigger awards the active player once", () => {
  const arena = battlefield("ARENA", "The Arena's Greatest");
  arena.behaviorModel.clauses = [
    clause("first-beginning", {
      triggers: [binding("trigger.first_beginning", 0)],
      effects: [binding("action.gain_points", 1)],
    }),
  ];
  const { game, decks } = fixture([arena]);
  decks[0]!.instances.push(instance("arena", "p1", "ARENA", "battlefield"));
  game.state.cardStates.arena = cardState(null);
  game.state.battlefields.push({
    battlefieldId: "arena-field",
    cardInstanceId: "arena",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    units: [],
  });
  game.state.turn = { turnNumber: 1, activePlayerId: "p1", phase: "beginning" };

  applyStartOfTurn(game, decks);
  let next = passPriority(game, "p1", decks);
  next = passPriority(next, "p2", decks);

  assert.equal(next.state.players.p1!.points, 1);
  assert.equal(next.state.players.p2!.points ?? 0, 0);
  assert.equal(next.state.players.p1!.hasTakenBeginningPhase, true);
});

test("Legion cost reduction needs a previously played Main Deck card", () => {
  const hopeful = unit("HOPEFUL", "Noxus Hopeful", [
    clause("legion-discount", {
      keywords: [binding("keyword.legion", 0)],
      effects: [binding("modifier.legion_energy_discount", 1, { amount: 2 })],
    }),
  ]);
  hopeful.card.attributes.energy = 3;
  const { game, decks } = fixture([hopeful]);
  const index = createRuntimeCardIndex(decks, game);

  assert.equal(effectiveEnergyCost(game, "p1", hopeful, index), 3);
  game.state.players.p1!.playedMainDeckCardIdsThisTurn = ["earlier-card"];
  assert.equal(effectiveEnergyCost(game, "p1", hopeful, index), 1);
});

test("Darius triggers after a second Unit card is played", () => {
  const darius = unit("DARIUS", "Darius, Trifarian", [
    clause("second-card", {
      triggers: [binding("trigger.second_card_played", 0)],
      effects: [
        binding("modifier.modify_numeric_value", 1, {
          attribute: "might",
          operation: "increase",
          operand: "constant",
          amount: 2,
          target: "source",
          duration: "thisTurn",
        }),
        binding("action.ready_cards", 2, { player: "controller", target: "source", count: 1 }),
      ],
    }),
  ]);
  const first = unit("FIRST", "First Unit");
  const second = unit("SECOND", "Second Unit");
  first.card.attributes.energy = 0;
  second.card.attributes.energy = 0;
  const { game, decks } = fixture([darius, first, second]);
  decks[0]!.instances.push(
    instance("darius", "p1", "DARIUS"),
    instance("first", "p1", "FIRST"),
    instance("second", "p1", "SECOND"),
  );
  game.state.players.p1!.zones.base.push("darius");
  game.state.players.p1!.zones.hand.push("first", "second");
  game.state.cardStates.darius = cardState(1, true);
  game.state.cardStates.first = cardState(1);
  game.state.cardStates.second = cardState(1);

  let next = playToBase(game, "p1", "first", decks);
  next = playToBase(next, "p1", "second", decks);
  assert.equal(next.state.chain?.items.length, 1);

  next = passPriority(next, "p1", decks);
  next = passPriority(next, "p2", decks);

  assert.equal(next.state.cardStates.darius?.exhausted, false);
  assert.equal(next.state.cardStates.darius?.computedMight, 3);
});

test("automatic friendly-unit exhaustion resolves before battlefield-wide damage", () => {
  const uncheckedPower = unit("UNCHECKED_POWER", "Unchecked Power", [
    clause("resolve", {
      selectors: [
        binding("selector.friendly_unit", 0, {
          area: "board",
          locationRelation: "any",
          controller: "controller",
          minimumCount: 0,
          automatic: true,
        }),
        binding("selector.unit", 1, {
          scope: "each",
          area: "battlefield",
          locationRelation: "any",
          minimumCount: 0,
          automatic: true,
        }),
      ],
      effects: [
        binding("action.exhaust_cards", 2, { target: "friendly_unit" }),
        binding("action.deal_damage", 3, { amount: 12, target: "unit" }),
      ],
    }),
  ]);
  uncheckedPower.card.classification.type = "Spell";
  uncheckedPower.card.attributes.might = null;
  const friendlyField = unit("FRIENDLY_FIELD", "Friendly Field");
  const enemyField = unit("ENEMY_FIELD", "Enemy Field");
  const { game, decks } = fixture([uncheckedPower, unit("FRIENDLY_BASE", "Friendly Base"), friendlyField, enemyField]);
  decks[0]!.instances.push(
    instance("unchecked-power", "p1", "UNCHECKED_POWER"),
    instance("friendly-base", "p1", "FRIENDLY_BASE"),
    instance("friendly-field", "p1", "FRIENDLY_FIELD"),
  );
  decks[1]!.instances.push(instance("enemy-field", "p2", "ENEMY_FIELD"));
  game.state.players.p1!.zones.base.push("friendly-base");
  game.state.battlefields.push({
    battlefieldId: "field",
    cardInstanceId: "field-card",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    units: ["friendly-field", "enemy-field"],
  });
  game.state.cardStates["friendly-base"] = cardState(1);
  game.state.cardStates["friendly-field"] = cardState(1);
  game.state.cardStates["enemy-field"] = cardState(1);

  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const compiledClause = compileBehaviorModel(uncheckedPower.behaviorModel, handlers).clauses[0]!;
  const result = executeBehaviorClause({
    clause: compiledClause,
    context: createBehaviorContext(game, "p1", "unchecked-power", null, []),
    handlers,
  });

  assert.equal(result.executed, true);
  assert.deepEqual(
    game.state.queuedBehaviorEvents?.map(
      (event) => `${event.type}:${event.subjectCardInstanceId}`,
    ),
    [
      "card.exhausted:friendly-base",
      "card.exhausted:friendly-field",
      "unit.damaged:friendly-field",
      "unit.damaged:enemy-field",
      "unit.died:friendly-field",
      "unit.died:enemy-field",
    ],
  );
  assert.equal(game.state.cardStates["friendly-base"]?.exhausted, true);
  assert.ok(game.state.players.p1!.zones.trash.includes("friendly-field"));
  assert.ok(game.state.players.p2!.zones.trash.includes("enemy-field"));
});

test("spell-only Power pays spells but not units", () => {
  const legend = unit("LEGEND", "Kai'Sa - Daughter of the Void", [
    clause("add-rainbow", {
      abilities: [
        binding("ability.exhaust_for_resource", 0, {
          resourceType: "power",
          amountSource: "constant",
          amount: 1,
          domain: "Rainbow",
          usage: "spellsOnly",
        }),
      ],
    }),
  ]);
  legend.card.classification.type = "Legend";
  const spell = unit("SPELL", "Spell");
  spell.card.classification.type = "Spell";
  spell.card.classification.domain = ["Mind"];
  spell.card.attributes.power = 1;
  spell.card.attributes.might = null;
  const unitCard = unit("UNIT", "Unit");
  unitCard.card.classification.domain = ["Mind"];
  unitCard.card.attributes.power = 1;
  const { game, decks } = fixture([legend, spell, unitCard]);
  decks[0]!.instances.push(instance("legend", "p1", "LEGEND", "legend"));
  game.state.players.p1!.zones.legend = "legend";
  game.state.cardStates.legend = cardState(null);

  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const ability = legend.behaviorModel.clauses[0]!.abilities[0]!;
  handlers.get(ability.behaviorId)?.execute?.(
    ability,
    createBehaviorContext(game, "p1", "legend", null, []),
  );

  assert.deepEqual(game.state.players.p1!.conditionalPower, { Rainbow: 1 });
  assert.ok(buildPaymentPlan(game, "p1", spell, 0, index));
  assert.equal(buildPaymentPlan(game, "p1", unitCard, 0, index), null);
  payCardCost(game, "p1", spell, 0, index);
  assert.deepEqual(game.state.players.p1!.conditionalPower, { Rainbow: 0 });
});

test("temporary Assault grants Might only while the selected unit attacks", () => {
  const cleave = unit("CLEAVE", "Cleave", [
    clause("grant-assault", {
      selectors: [
        binding("selector.unit", 0, {
          scope: "any",
          area: "board",
          locationRelation: "any",
          minimumCount: 1,
          maximumCount: 1,
        }),
      ],
      effects: [
        binding("modifier.grant_keyword", 1, {
          keywordId: "keyword.assault",
          amount: 3,
          target: "unit",
          duration: "thisTurn",
        }),
      ],
    }),
  ]);
  cleave.card.classification.type = "Spell";
  const target = unit("TARGET", "Target");
  target.card.attributes.might = 4;
  const { game, decks } = fixture([cleave, target]);
  decks[0]!.instances.push(instance("cleave", "p1", "CLEAVE"), instance("target", "p1", "TARGET"));
  game.state.players.p1!.zones.base.push("target");
  game.state.cardStates.target = { ...cardState(4), combatRole: "attacker" };

  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const compiledClause = compileBehaviorModel(cleave.behaviorModel, handlers).clauses[0]!;
  executeBehaviorClause({
    clause: compiledClause,
    context: createBehaviorContext(game, "p1", "cleave", null, ["target"]),
    handlers,
  });
  assert.equal(game.state.cardStates.target?.computedMight, 7);

  cleanupTurnModifiers(game, index);
  assert.equal(game.state.cardStates.target?.computedMight, 4);
});

test("trash-count Might updates and Beginning triggers recycle selected trash cards", () => {
  const mundo = unit("MUNDO", "Dr. Mundo, Expert", [
    clause("trash-might", {
      effects: [
        binding("modifier.modify_numeric_value", 0, {
          attribute: "might",
          operation: "increase",
          operand: "controllerTrashCount",
          target: "source",
          duration: "whileSourceOnBoard",
        }),
      ],
    }),
    { ...clause("beginning-recycle", {
      triggers: [binding("trigger.beginning", 0, { player: "controller" })],
      selectors: [
        binding("selector.card", 1, {
          zone: "trash",
          cardType: "any",
          owner: "controller",
          minimumCount: 0,
          maximumCount: 3,
          requireMaximumAvailable: true,
        }),
      ],
      effects: [binding("action.recycle_cards", 2, { target: "card", count: 3 })],
    }), sequence: 1 },
  ]);
  mundo.card.attributes.might = 3;
  const { game, decks } = fixture([mundo, unit("TRASH", "Trash")]);
  decks[0]!.instances.push(
    instance("mundo", "p1", "MUNDO"),
    instance("trash-a", "p1", "TRASH"),
    instance("trash-b", "p1", "TRASH"),
  );
  game.state.players.p1!.zones.base.push("mundo");
  game.state.players.p1!.zones.trash.push("trash-a", "trash-b");
  game.state.cardStates.mundo = cardState(3);
  game.state.cardStates["trash-a"] = cardState(1);
  game.state.cardStates["trash-b"] = cardState(1);

  const index = createRuntimeCardIndex(decks, game);
  recomputeMight(game, "mundo", index);
  assert.equal(game.state.cardStates.mundo?.computedMight, 5);

  const started = beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "mundo",
    clauseId: "beginning-recycle",
    selectedIds: ["trash-a", "trash-b"],
    decks,
  });
  assert.equal(started, true);
  assert.deepEqual(game.state.players.p1!.zones.trash, []);
  assert.deepEqual(game.state.players.p1!.zones.mainDeck, ["trash-a", "trash-b"]);
  assert.equal(game.state.cardStates.mundo?.computedMight, 3);
});

test("Dr. Mundo requires every available trash card up to three", () => {
  const mundo = unit("MUNDO", "Dr. Mundo, Expert", [
    clause("beginning-recycle", {
      selectors: [
        binding("selector.card", 0, {
          zone: "trash",
          cardType: "any",
          owner: "controller",
          minimumCount: 0,
          maximumCount: 3,
          requireMaximumAvailable: true,
        }),
      ],
      effects: [binding("action.recycle_cards", 1, { target: "card", count: 3 })],
    }),
  ]);
  const { game, decks } = fixture([mundo, unit("TRASH", "Trash")]);
  decks[0]!.instances.push(
    instance("mundo", "p1", "MUNDO"),
    instance("trash-a", "p1", "TRASH"),
    instance("trash-b", "p1", "TRASH"),
  );
  game.state.players.p1!.zones.trash.push("trash-a", "trash-b");
  game.state.cardStates.mundo = cardState(1);
  game.state.cardStates["trash-a"] = cardState(1);
  game.state.cardStates["trash-b"] = cardState(1);

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "mundo",
    clauseId: "beginning-recycle",
    decks,
  }), false);
  assert.equal(game.state.pendingChoice?.type, "effectSelection");
  assert.equal(
    game.state.pendingChoice?.type === "effectSelection"
      ? game.state.pendingChoice.minimum
      : null,
    2,
  );
  assert.throws(
    () => submitEffectSelection(game, "p1", [], decks),
    /does not satisfy its requirements/,
  );
});

test("turn-scoped card-play restrictions remove an opponent's play actions", () => {
  const brynhir = unit("BRYNHIR", "Brynhir Thundersong", [
    clause("restrict", {
      triggers: [
        binding("trigger.on_play", 0, { actor: "controller", subject: "source" }),
      ],
      effects: [
        binding("modifier.cannot_play_cards", 1, { duration: "thisTurn" }),
      ],
    }),
  ]);
  const spell = unit("SPELL", "Spell");
  spell.card.classification.type = "Spell";
  const { game, decks } = fixture([brynhir, spell]);
  decks[0]!.instances.push(instance("brynhir", "p1", "BRYNHIR"));
  decks[1]!.instances.push(instance("spell", "p2", "SPELL"));
  game.state.players.p1!.zones.base.push("brynhir");
  game.state.players.p2!.zones.hand.push("spell");
  game.state.cardStates.brynhir = cardState(1);
  game.state.cardStates.spell = cardState(null);
  game.state.turn = { turnNumber: 1, activePlayerId: "p2", phase: "action" };

  assert.ok(
    gameplayActions(game, "p2", decks).some(
      (action) => action.sourceCardInstanceId === "spell",
    ),
  );
  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const compiledClause = compileBehaviorModel(brynhir.behaviorModel, handlers).clauses[0]!;
  executeBehaviorClause({
    clause: compiledClause,
    context: createBehaviorContext(game, "p1", "brynhir", {
      type: "card.played",
      actorPlayerId: "p1",
      subjectCardInstanceId: "brynhir",
      values: {},
    }, []),
    handlers,
  });

  assert.equal(
    gameplayActions(game, "p2", decks).some(
      (action) => action.sourceCardInstanceId === "spell",
    ),
    false,
  );
});

test("deferred repeated targets can select the same unit for each hit", () => {
  const fallingStar = unit("FALLING_STAR", "Falling Star", [
    clause("repeat-damage", {
      selectors: [
        binding("selector.unit", 0, { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "firstTarget", deferred: true }),
        binding("selector.unit", 1, { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "secondTarget", deferred: true }),
      ],
      effects: [
        binding("action.deal_damage", 2, { amount: 3, target: "unit", selectionKey: "firstTarget" }),
        binding("action.deal_damage", 3, { amount: 3, target: "unit", selectionKey: "secondTarget" }),
      ],
    }),
  ]);
  fallingStar.card.classification.type = "Spell";
  const target = unit("TARGET", "Target");
  target.card.attributes.might = 10;
  const { game, decks } = fixture([fallingStar, target]);
  decks[0]!.instances.push(instance("falling-star", "p1", "FALLING_STAR"), instance("target", "p2", "TARGET"));
  game.state.players.p2!.zones.base.push("target");
  game.state.cardStates.target = cardState(10);

  assert.equal(beginEffectResolution({ game, controllerPlayerId: "p1", sourceCardInstanceId: "falling-star", clauseId: "repeat-damage", decks }), false);
  let action = gameplayActions(game, "p1", decks).find((candidate) => candidate.choice?.kind === "effectSelection");
  assert.ok(action);
  let next = performGameplayAction({ game, actorPlayerId: "p1", actionId: action.id, selectedIds: ["target"], decks, now: "first-hit" });
  action = gameplayActions(next, "p1", decks).find((candidate) => candidate.choice?.kind === "effectSelection");
  assert.ok(action);
  next = performGameplayAction({ game: next, actorPlayerId: "p1", actionId: action.id, selectedIds: ["target"], decks, now: "second-hit" });

  assert.equal(next.state.cardStates.target?.damage, 6);
});

test("a repeated lethal target emits one death event", () => {
  const sentry = unit("SENTRY", "Watchful Sentry");
  sentry.card.attributes.might = 1;
  const { game, decks } = fixture([sentry]);
  decks[1]!.instances.push(instance("sentry", "p2", "SENTRY"));
  game.state.players.p2!.zones.base.push("sentry");
  game.state.cardStates.sentry = cardState(1);
  const index = createRuntimeCardIndex(decks, game);

  moveUnitToTrash(game, "sentry", index);
  moveUnitToTrash(game, "sentry", index);

  assert.deepEqual(game.state.queuedBehaviorEvents, [
    {
      type: "unit.died",
      actorPlayerId: "p2",
      subjectCardInstanceId: "sentry",
      values: {},
    },
  ]);
});

test("repeated damage skips a target after its first lethal hit", () => {
  const spell = unit("SPELL", "Repeated damage", [
    clause("repeat-damage", {
      selectors: [
        binding("selector.unit", 0, { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "firstTarget" }),
        binding("selector.unit", 1, { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "secondTarget" }),
      ],
      effects: [
        binding("action.deal_damage", 2, { amount: 2, target: "unit", selectionKey: "firstTarget" }),
        binding("action.deal_damage", 3, { amount: 2, target: "unit", selectionKey: "secondTarget" }),
      ],
    }),
  ]);
  const sentry = unit("SENTRY", "Watchful Sentry");
  sentry.card.attributes.might = 1;
  const { game, decks } = fixture([spell, sentry]);
  decks[0]!.instances.push(instance("spell", "p1", "SPELL"));
  decks[1]!.instances.push(instance("sentry", "p2", "SENTRY"));
  game.state.players.p2!.zones.base.push("sentry");
  game.state.cardStates.sentry = cardState(1);
  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const compiledClause = compileBehaviorModel(spell.behaviorModel, handlers).clauses[0]!;

  executeBehaviorClause({
    clause: compiledClause,
    context: createBehaviorContext(game, "p1", "spell", null, ["sentry", "sentry"]),
    handlers,
  });

  assert.equal(game.state.cardStates.sentry?.damage, 0);
  assert.equal(game.state.players.p2!.zones.trash.includes("sentry"), true);
  assert.equal(game.state.queuedBehaviorEvents?.filter((event) => event.type === "unit.died").length, 1);
});

test("six two-damage assignments deal six to each target chosen three times", () => {
  const selectors = Array.from({ length: 6 }, (_, order) =>
    binding("selector.unit", order, {
      scope: "any",
      area: "board",
      locationRelation: "any",
      minimumCount: 1,
      maximumCount: 1,
      selectionKey: `target-${order}`,
    }),
  );
  const effects = Array.from({ length: 6 }, (_, index) =>
    binding("action.deal_damage", index + 6, {
      amount: 2,
      target: "unit",
      selectionKey: `target-${index}`,
    }),
  );
  const spell = unit("RAIN", "Icathian Rain", [
    clause("repeat-damage", { selectors, effects }),
  ]);
  const first = unit("FIRST", "First target");
  first.card.attributes.might = 7;
  const second = unit("SECOND", "Second target");
  second.card.attributes.might = 7;
  const { game, decks } = fixture([spell, first, second]);
  decks[0]!.instances.push(instance("rain", "p1", "RAIN"));
  decks[1]!.instances.push(
    instance("first", "p2", "FIRST"),
    instance("second", "p2", "SECOND"),
  );
  game.state.players.p2!.zones.base.push("first", "second");
  game.state.cardStates.first = cardState(7);
  game.state.cardStates.second = cardState(7);
  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const compiledClause = compileBehaviorModel(spell.behaviorModel, handlers).clauses[0]!;

  executeBehaviorClause({
    clause: compiledClause,
    context: createBehaviorContext(
      game,
      "p1",
      "rain",
      null,
      ["first", "first", "first", "second", "second", "second"],
    ),
    handlers,
  });

  assert.equal(game.state.cardStates.first?.damage, 6);
  assert.equal(game.state.cardStates.second?.damage, 6);
});

test("locked repeated targets route each damage instruction to its selected unit", () => {
  const fallingStar = unit("FALLING_STAR", "Falling Star", [
    clause("repeat-damage", {
      selectors: [
        binding("selector.unit", 0, { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "firstTarget" }),
        binding("selector.unit", 1, { scope: "any", area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, selectionKey: "secondTarget" }),
      ],
      effects: [
        binding("action.deal_damage", 2, { amount: 3, target: "unit", selectionKey: "firstTarget" }),
        binding("action.deal_damage", 3, { amount: 3, target: "unit", selectionKey: "secondTarget" }),
      ],
    }),
  ]);
  fallingStar.card.classification.type = "Spell";
  const poro = unit("PORO", "Pouty Poro");
  poro.card.attributes.might = 2;
  const kaisa = unit("KAISA", "Kai'Sa");
  kaisa.card.attributes.might = 4;
  const { game, decks } = fixture([fallingStar, poro, kaisa]);
  decks[0]!.instances.push(instance("falling-star", "p1", "FALLING_STAR"));
  decks[1]!.instances.push(
    instance("poro", "p2", "PORO"),
    instance("kaisa", "p2", "KAISA"),
  );
  game.state.players.p2!.zones.base.push("poro", "kaisa");
  game.state.cardStates.poro = cardState(2);
  game.state.cardStates.kaisa = cardState(4);

  assert.equal(beginEffectResolution({
    game,
    controllerPlayerId: "p1",
    sourceCardInstanceId: "falling-star",
    clauseId: "repeat-damage",
    selectedIds: ["poro", "kaisa"],
    targetsLocked: true,
    decks,
  }), true);

  assert.equal(game.state.players.p2!.zones.trash.includes("poro"), true);
  assert.equal(game.state.players.p2!.zones.base.includes("kaisa"), true);
  assert.equal(game.state.cardStates.kaisa?.damage, 3);
});

test("Temporary token dies at its controller's Beginning Phase", () => {
  const sprite = getTokenCatalogDefinition("OGN-274");
  assert.ok(sprite);
  const { game, decks } = fixture([]);
  game.state.createdCardInstances = [instance("sprite", "p1", "OGN-274", "token")];
  game.state.players.p1!.zones.base.push("sprite");
  game.state.cardStates.sprite = cardState(3);

  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const clause = compileBehaviorModel(sprite.behaviorModel, handlers).clauses[0]!;
  const result = executeBehaviorClause({
    clause,
    context: createBehaviorContext(game, "p1", "sprite", {
      type: "turn.beginning", actorPlayerId: "p1", subjectCardInstanceId: null, values: {},
    }, []),
    handlers,
  });

  assert.equal(result.executed, true);
  assert.equal(game.state.players.p1!.zones.base.includes("sprite"), false);
  assert.equal(game.state.cardStates.sprite, undefined);
});

test("global conquer trigger can be gated by units at conquered battlefield", () => {
  const legend = unit("LEGEND", "Might of Demacia", [
    clause("conquer-four", {
      triggers: [binding("trigger.conquer", 0, {})],
      conditions: [
        binding("condition.unit_presence", 1, {
          controller: "controller",
          locationRelation: "eventBattlefield",
          minimumCount: 4,
        }),
      ],
      effects: [binding("action.draw_cards", 2, { player: "controller", count: 1 })],
    }),
  ]);
  const { game, decks } = fixture([legend, unit("ALLY", "Ally"), battlefield("BF", "Field")]);
  decks[0]!.instances.push(instance("legend", "p1", "LEGEND", "legend"));
  decks[0]!.instances.push(instance("bf-card", "p1", "BF", "battlefield"));
  game.state.players.p1!.zones.legend = "legend";
  game.state.players.p1!.zones.mainDeck.push("draw");
  game.state.cardStates.legend = cardState(null);
  game.state.cardStates["bf-card"] = cardState(null);
  decks[0]!.instances.push(instance("draw", "p1", "ALLY"));
  game.state.cardStates.draw = cardState(1);
  for (let index = 0; index < 4; index += 1) {
    const id = `ally-${index}`;
    decks[0]!.instances.push(instance(id, "p1", "ALLY"));
    game.state.cardStates[id] = cardState(1);
  }
  game.state.battlefields.push({
    battlefieldId: "bf",
    cardInstanceId: "bf-card",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    units: ["ally-0", "ally-1", "ally-2", "ally-3"],
  });

  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const compiled = compileBehaviorModel(legend.behaviorModel, handlers);
  const result = executeBehaviorClause({
    clause: compiled.clauses[0]!,
    context: createBehaviorContext(
      game,
      "p1",
      "legend",
      {
        type: "battlefield.conquered",
        actorPlayerId: "p1",
        subjectCardInstanceId: "bf-card",
        values: {},
      },
      [],
    ),
    handlers,
  });

  assert.equal(result.executed, true);
  assert.deepEqual(game.state.players.p1!.zones.hand, ["draw"]);
});

test("unit presence condition detects ready enemy units at source location", () => {
  const drake = unit("DRAKE", "Dune Drake", [
    clause("attack-ready-enemy", {
      triggers: [binding("trigger.attack", 0, {})],
      conditions: [
        binding("condition.unit_presence", 1, {
          controller: "enemy",
          locationRelation: "sourceLocation",
          readyState: "ready",
          minimumCount: 1,
        }),
      ],
      effects: [
        binding("modifier.modify_numeric_value", 2, {
          attribute: "might",
          operation: "increase",
          operand: "constant",
          amount: 2,
          target: "source",
          duration: "thisTurn",
        }),
      ],
    }),
  ]);
  const { game, decks } = fixture([drake, unit("ENEMY", "Enemy"), battlefield("BF", "Field")]);
  decks[0]!.instances.push(instance("drake", "p1", "DRAKE"));
  decks[1]!.instances.push(instance("enemy", "p2", "ENEMY"));
  decks[0]!.instances.push(instance("bf-card", "p1", "BF", "battlefield"));
  game.state.cardStates.drake = cardState(2);
  game.state.cardStates.enemy = cardState(1);
  game.state.cardStates["bf-card"] = cardState(null);
  game.state.battlefields.push({
    battlefieldId: "bf",
    cardInstanceId: "bf-card",
    selectedByPlayerId: "p1",
    units: ["drake", "enemy"],
  });

  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const compiled = compileBehaviorModel(drake.behaviorModel, handlers);
  const result = executeBehaviorClause({
    clause: compiled.clauses[0]!,
    context: createBehaviorContext(
      game,
      "p1",
      "drake",
      {
        type: "unit.attacks",
        actorPlayerId: "p1",
        subjectCardInstanceId: "drake",
        values: { battlefieldId: "bf" },
      },
      [],
    ),
    handlers,
  });

  assert.equal(result.executed, true);
  assert.equal(game.state.cardStates.drake?.computedMight, 3);
});

test("attack triggers return showdown focus to the trigger controller", () => {
  const drake = unit("DRAKE", "Dune Drake", [
    clause("attack-ready-enemy", {
      triggers: [binding("trigger.attack", 0, {})],
      effects: [
        binding("modifier.modify_numeric_value", 1, {
          attribute: "might",
          operation: "increase",
          operand: "constant",
          amount: 2,
          target: "source",
          duration: "thisTurn",
        }),
      ],
    }),
  ]);
  const { game, decks } = fixture([drake, battlefield("BF", "Field")]);
  decks[0]!.instances.push(instance("drake", "p1", "DRAKE"));
  decks[0]!.instances.push(instance("bf-card", "p1", "BF", "battlefield"));
  game.state.cardStates.drake = cardState(2);
  game.state.cardStates["bf-card"] = cardState(null);
  game.state.battlefields.push({
    battlefieldId: "bf",
    cardInstanceId: "bf-card",
    selectedByPlayerId: "p1",
    units: ["drake"],
  });
  game.state.showdown = {
    kind: "combat",
    battlefieldId: "bf",
    relevantPlayerIds: ["p1", "p2"],
    focusPlayerId: "p1",
    passedPlayerIds: [],
  };
  game.state.chain = {
    items: [
      {
        id: "trigger:dune",
        kind: "trigger",
        label: "Dune Drake",
        controllerPlayerId: "p1",
        sourceCardInstanceId: "drake",
        targetCardInstanceIds: [],
        targetObjectVersions: {},
        behaviorClauseId: "attack-ready-enemy",
        activatedBehaviorId: null,
        behaviorEvent: {
          type: "unit.attacks",
          actorPlayerId: "p1",
          subjectCardInstanceId: "drake",
          values: { battlefieldId: "bf" },
        },
      },
    ],
    relevantPlayerIds: ["p1", "p2"],
    priorityPlayerId: "p1",
    passedPlayerIds: [],
  };

  let next = passPriority(game, "p1", decks);
  next = passPriority(next, "p2", decks);

  assert.equal(next.state.chain, null);
  assert.equal(next.state.showdown?.focusPlayerId, "p1");
  assert.deepEqual(next.state.showdown?.passedPlayerIds, []);
});

function fixture(cards: GameCardDefinition[]): {
  game: GameDocument;
  decks: DeckSnapshotDocument[];
} {
  const snapshot = {
    sourceText: "",
    catalogDigest: "test",
    entries: [],
    cards,
  };
  const decks: DeckSnapshotDocument[] = [
    {
      id: "d1",
      createdAt: "a",
      updatedAt: "a",
      matchId: "m",
      playerId: "p1",
      snapshot,
      instances: [],
    },
    {
      id: "d2",
      createdAt: "a",
      updatedAt: "a",
      matchId: "m",
      playerId: "p2",
      snapshot,
      instances: [],
    },
  ];
  return {
    decks,
    game: {
      id: "g",
      matchId: "m",
      createdAt: "a",
      updatedAt: "a",
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
        cardStates: {},
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
    },
  };
}

function passPriority(
  game: GameDocument,
  playerId: string,
  decks: DeckSnapshotDocument[],
) {
  const pass = gameplayActions(game, playerId, decks).find(
    (action) => action.label === "Pass priority",
  );
  assert.ok(pass);
  return performGameplayAction({
    game,
    actorPlayerId: playerId,
    actionId: pass.id,
    selectedIds: [],
    decks,
    now: `pass-${playerId}`,
  });
}

function passFocus(
  game: GameDocument,
  playerId: string,
  decks: DeckSnapshotDocument[],
) {
  const pass = gameplayActions(game, playerId, decks).find(
    (action) => action.label === "Pass focus",
  );
  assert.ok(pass);
  return performGameplayAction({
    game,
    actorPlayerId: playerId,
    actionId: pass.id,
    selectedIds: [],
    decks,
    now: `focus-${playerId}`,
  });
}

function playToBase(
  game: GameDocument,
  playerId: string,
  cardId: string,
  decks: DeckSnapshotDocument[],
) {
  const play = gameplayActions(game, playerId, decks).find(
    (action) =>
      action.sourceCardInstanceId === cardId &&
      action.presentation.boardLocation?.kind === "base",
  );
  assert.ok(play);
  return performGameplayAction({
    game,
    actorPlayerId: playerId,
    actionId: play.id,
    selectedIds: [],
    decks,
    now: `play-${cardId}`,
  });
}

function player(playerId: string) {
  return {
    playerId,
    energy: 0,
    conditionalEnergy: 0,
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

function unit(
  cardCode: string,
  name: string,
  clauses: GameCardDefinition["behaviorModel"]["clauses"] = [],
): GameCardDefinition {
  return card(cardCode, name, "Unit", clauses, 1);
}

function battlefield(cardCode: string, name: string): GameCardDefinition {
  return card(cardCode, name, "Battlefield", [], null);
}

function card(
  cardCode: string,
  name: string,
  type: "Battlefield" | "Gear" | "Unit",
  clauses: GameCardDefinition["behaviorModel"]["clauses"],
  might: number | null,
): GameCardDefinition {
  return {
    cardCode,
    sourceTextHash: `hash:${cardCode}`,
    card: {
      id: cardCode,
      name,
      public_code: cardCode,
      attributes: { energy: null, might, power: null },
      classification: {
        type,
        supertype: null,
        rarity: null,
        domain: ["Colorless"],
      },
      text: { plain: "" },
      set: { set_id: "test", label: "Test" },
      media: {},
      tags: [],
      metadata: {},
    },
    behaviorModel: { playTimings: [], clauses },
  };
}

function clause(
  id: string,
  input: Partial<
    Pick<
      GameCardDefinition["behaviorModel"]["clauses"][number],
      | "abilities"
      | "triggers"
      | "conditions"
      | "selectors"
      | "effects"
      | "timings"
      | "keywords"
      | "costs"
      | "choices"
    >
  >,
) {
  return {
    id,
    sequence: 0,
    sourceText: "",
    normalizedText: "",
    abilities: input.abilities ?? [],
    triggers: input.triggers ?? [],
    conditions: input.conditions ?? [],
    selectors: input.selectors ?? [],
    choices: input.choices ?? [],
    costs: input.costs ?? [],
    timings: input.timings ?? [],
    effects: input.effects ?? [],
    keywords: input.keywords ?? [],
  };
}

function binding(
  behaviorId: string,
  order: number,
  parameters: Record<string, string | number | boolean | null> = {},
): BehaviorBinding {
  return { behaviorId, order, parameters, confidence: "high" };
}

function instance(
  instanceId: string,
  ownerPlayerId: string,
  cardCode: string,
  source: "mainDeck" | "legend" | "battlefield" | "token" = "mainDeck",
) {
  return { instanceId, ownerPlayerId, cardCode, source };
}

function cardState(might: number | null, exhausted = false) {
  return {
    exhausted,
    damage: 0,
    computedMight: might,
    objectVersion: 0,
  };
}
