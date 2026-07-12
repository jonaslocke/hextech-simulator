import assert from "node:assert/strict";
import test from "node:test";
import {
  compileBehaviorModel,
  createBehaviorContext,
  executeBehaviorClause,
} from "../src/server/game/behavior-runtime";
import { beginEffectResolution } from "../src/server/game/effect-resolution";
import {
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  moveUnitToTrash,
} from "../src/server/game/primitive-handlers";
import { getTokenCatalogDefinition } from "../src/server/game/token-catalog";
import { gameplayActions, performGameplayAction } from "../src/server/game";
import { dispatchBehaviorEvent } from "../src/server/game/triggers";
import { clearStunned } from "../src/server/game/board-rules";
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
  type: "Battlefield" | "Unit",
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
