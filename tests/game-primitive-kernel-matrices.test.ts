import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyStartOfTurn,
  createBehaviorContext,
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  dispatchBehaviorEvent,
  type BehaviorBinding,
  type GameCardDefinition,
  type GameDocument,
} from "../src/server/game";
import type { DeckSnapshotDocument } from "../src/server/game/repositories";
import type { CardInstance } from "../src/server/game/state";

test("selectors cover unit ownership, zones, readiness, exclusions, and counts", () => {
  const { game, handlers } = matrixFixture([
    card("SOURCE", "Unit", 4),
    card("FRIEND", "Unit", 2),
    card("FRIEND_READY", "Unit", 3),
    card("ENEMY", "Unit", 2),
    card("ENEMY_BOARD", "Unit", 5),
    card("OPPONENT_SPELL", "Spell"),
    card("BATTLEFIELD", "Battlefield"),
  ], [
    instance("source", "p1", "SOURCE", "mainDeck"),
    instance("friend", "p1", "FRIEND", "mainDeck"),
    instance("friend-ready", "p1", "FRIEND_READY", "mainDeck"),
    instance("enemy", "p2", "ENEMY", "mainDeck"),
    instance("enemy-board", "p2", "ENEMY_BOARD", "mainDeck"),
    instance("opponent-spell", "p2", "OPPONENT_SPELL", "mainDeck"),
    instance("battlefield-card", "p1", "BATTLEFIELD", "battlefield"),
  ]);
  game.state.players.p1!.zones.base = ["source", "friend", "friend-ready"];
  game.state.players.p2!.zones.base = ["enemy"];
  game.state.players.p2!.zones.hand = ["opponent-spell"];
  game.state.cardStates["friend"]!.exhausted = true;
  game.state.battlefields = [{
    battlefieldId: "middle",
    cardInstanceId: "battlefield-card",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p2",
    contestedByPlayerId: null,
    units: ["enemy-board"],
  }];

  const context = createBehaviorContext(game, "p1", "source", null, []);
  const unit = handlers.get("selector.unit")!.targets!;
  const friendly = handlers.get("selector.friendly_unit")!.targets!;
  const enemy = handlers.get("selector.enemy_unit")!.targets!;

  assert.deepEqual(
    unit(binding("selector.unit", {
      area: "any",
      locationRelation: "any",
      minimumCount: 1,
      maximumCount: 3,
      excludesSource: true,
    }), context).legalIds,
    ["friend", "friend-ready", "enemy", "enemy-board"],
  );
  assert.deepEqual(
    friendly(binding("selector.friendly_unit", {
      area: "any",
      locationRelation: "any",
      minimumCount: 1,
      maximumCount: 2,
    }), context).legalIds,
    ["source", "friend", "friend-ready"],
  );
  assert.deepEqual(
    enemy(binding("selector.enemy_unit", {
      area: "any",
      locationRelation: "any",
      minimumCount: 1,
      maximumCount: 2,
      readyOnly: true,
    }), context).legalIds,
    ["enemy", "enemy-board"],
  );
  assert.deepEqual(
    unit(binding("selector.unit", {
      area: "base",
      locationRelation: "any",
      minimumCount: 1,
      maximumCount: 2,
      readyOnly: true,
    }), context).legalIds,
    ["source", "friend-ready", "enemy"],
  );

  const cards = handlers.get("selector.card")!.targets!;
  const cardRequirement = cards(binding("selector.card", {
    zone: "hand",
    cardType: "nonUnit",
    owner: "opponent",
    minimumCount: 1,
    maximumCount: 1,
    revealZone: true,
  }), context);
  assert.deepEqual(cardRequirement.legalIds, ["opponent-spell"]);
  assert.equal(cardRequirement.sourceZone, "hand");
  assert.equal(cardRequirement.revealZone, true);

  const battlefieldRequirement = handlers.get("selector.battlefield")!.targets!(
    binding("selector.battlefield", { minimumCount: 1, maximumCount: 1 }),
    context,
  );
  assert.deepEqual(battlefieldRequirement.legalIds, ["middle"]);
});

test("zone operations move selected cards to their typed destinations and emit boundaries", () => {
  const { game, handlers } = matrixFixture([
    card("SOURCE", "Unit", 1),
    card("HAND", "Spell"),
    card("BANISH", "Spell"),
    card("BOARD", "Unit", 2),
    card("RUNE", "Rune"),
    card("TRASH_SPELL", "Spell"),
    card("DRAW", "Spell"),
    card("DRAW_OPPONENT", "Spell"),
  ], [
    instance("source", "p1", "SOURCE", "mainDeck"),
    instance("hand", "p1", "HAND", "mainDeck"),
    instance("banish", "p1", "BANISH", "mainDeck"),
    instance("board", "p1", "BOARD", "mainDeck"),
    instance("rune", "p1", "RUNE", "runeDeck"),
    instance("trash-spell", "p1", "TRASH_SPELL", "mainDeck"),
    instance("draw", "p1", "DRAW", "mainDeck"),
    instance("draw-opponent", "p2", "DRAW_OPPONENT", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["source", "board", "rune"];
  game.state.players.p1!.zones.hand = ["hand", "banish"];
  game.state.players.p1!.zones.trash = ["trash-spell"];
  game.state.players.p1!.zones.mainDeck = ["draw"];
  game.state.players.p2!.zones.mainDeck = ["draw-opponent"];

  const context = createBehaviorContext(game, "p1", "source", null, []);
  const select = (...ids: string[]) => {
    context.selectedIds.splice(0, context.selectedIds.length, ...ids);
  };

  select("hand");
  handlers.get("action.discard_cards")!.execute!(
    binding("action.discard_cards", { count: 1 }),
    context,
  );
  assert.deepEqual(game.state.players.p1!.zones.hand, ["banish"]);
  assert.deepEqual(game.state.players.p1!.zones.trash, ["trash-spell", "hand"]);
  assert.equal(game.state.cardStates.hand!.objectVersion, 1);

  select("board");
  handlers.get("action.return_to_hand")!.execute!(
    binding("action.return_to_hand"),
    context,
  );
  assert.deepEqual(game.state.players.p1!.zones.base, ["source", "rune"]);
  assert.deepEqual(game.state.players.p1!.zones.hand, ["banish", "board"]);

  select("rune", "trash-spell");
  handlers.get("action.recycle_cards")!.execute!(
    binding("action.recycle_cards"),
    context,
  );
  assert.deepEqual(game.state.players.p1!.zones.runeDeck, ["rune"]);
  assert.deepEqual(game.state.players.p1!.zones.mainDeck, ["draw", "trash-spell"]);
  assert.equal(game.state.queuedBehaviorEvents?.at(-1)?.type, "card.recycled");

  select("banish");
  handlers.get("action.banish_card")!.execute!(
    binding("action.banish_card"),
    context,
  );
  assert.deepEqual(game.state.players.p1!.zones.hand, ["board"]);
  assert.deepEqual(game.state.players.p1!.zones.banishment, ["banish"]);

  select("rune");
  handlers.get("action.channel_runes")!.execute!(
    binding("action.channel_runes", { count: 1, entryState: "ready" }),
    context,
  );
  assert.deepEqual(game.state.players.p1!.zones.base, ["source", "rune"]);
  select("board");
  handlers.get("action.exhaust_cards")!.execute!(
    binding("action.exhaust_cards"),
    context,
  );
  assert.equal(game.state.cardStates.board!.exhausted, true);
  assert.equal(game.state.queuedBehaviorEvents?.at(-1)?.type, "card.exhausted");

  game.state.cardStates.rune!.exhausted = true;
  select("rune");
  handlers.get("action.ready_cards")!.execute!(
    binding("action.ready_cards", { target: "runes", count: 1 }),
    context,
  );
  assert.equal(game.state.cardStates.rune!.exhausted, false);
  assert.equal(game.state.queuedBehaviorEvents?.at(-1)?.type, "card.readied");

  handlers.get("action.draw_cards")!.execute!(
    binding("action.draw_cards", { count: 1, player: "eachPlayer" }),
    context,
  );
  assert.deepEqual(game.state.players.p1!.zones.hand, ["board", "draw"]);
  assert.deepEqual(game.state.players.p2!.zones.hand, ["draw-opponent"]);
});

test("turn boundaries reset resources, ready owned cards, channel, draw, and score holds", () => {
  const { game, decks } = matrixFixture([
    card("BASE", "Unit", 1),
    card("BATTLEFIELD_UNIT", "Unit", 2),
    card("OPPONENT_UNIT", "Unit", 2),
    card("RUNE", "Rune"),
    card("DRAW", "Spell"),
    card("BATTLEFIELD", "Battlefield"),
  ], [
    instance("base", "p1", "BASE", "mainDeck"),
    instance("battlefield-unit", "p1", "BATTLEFIELD_UNIT", "mainDeck"),
    instance("opponent-unit", "p2", "OPPONENT_UNIT", "mainDeck"),
    instance("rune-a", "p1", "RUNE", "runeDeck"),
    instance("rune-b", "p1", "RUNE", "runeDeck"),
    instance("draw", "p1", "DRAW", "mainDeck"),
    instance("battlefield-card", "p1", "BATTLEFIELD", "battlefield"),
  ]);
  game.state.players.p1!.zones.base = ["base"];
  game.state.players.p1!.zones.runeDeck = ["rune-a", "rune-b"];
  game.state.players.p1!.zones.mainDeck = ["draw"];
  game.state.players.p1!.energy = 4;
  game.state.players.p1!.power = { Might: 2 };
  game.state.players.p1!.scoredBattlefieldIdsThisTurn = ["old"];
  game.state.players.p1!.conqueredBattlefieldIdsThisTurn = ["old"];
  game.state.battlefields = [{
    battlefieldId: "middle",
    cardInstanceId: "battlefield-card",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    contestedByPlayerId: null,
    units: ["battlefield-unit"],
  }];
  for (const id of ["base", "battlefield-unit"]) {
    game.state.cardStates[id]!.exhausted = true;
  }
  game.state.turn = {
    turnNumber: 1,
    activePlayerId: "p1",
    phase: "awaken",
  };

  applyStartOfTurn(game, decks);

  assert.equal(game.state.turn!.phase, "action");
  assert.equal(game.state.players.p1!.energy, 0);
  assert.deepEqual(game.state.players.p1!.power, {});
  assert.deepEqual(game.state.players.p1!.zones.base, ["base", "rune-a", "rune-b"]);
  assert.deepEqual(game.state.players.p1!.zones.hand, ["draw"]);
  assert.equal(game.state.cardStates.base!.exhausted, false);
  assert.equal(game.state.cardStates["battlefield-unit"]!.exhausted, false);
  assert.deepEqual(game.state.players.p1!.scoredBattlefieldIdsThisTurn, ["middle"]);
  assert.equal(game.state.players.p1!.points, 1);
});

test("the second starting cycle grants three Runes to the non-starting player", () => {
  const { game, decks } = matrixFixture([
    card("RUNE", "Rune"),
    card("DRAW", "Spell"),
  ], [
    instance("p2-rune-a", "p2", "RUNE", "runeDeck"),
    instance("p2-rune-b", "p2", "RUNE", "runeDeck"),
    instance("p2-rune-c", "p2", "RUNE", "runeDeck"),
    instance("p2-draw", "p2", "DRAW", "mainDeck"),
  ]);
  game.state.players.p2!.zones.runeDeck = ["p2-rune-a", "p2-rune-b", "p2-rune-c"];
  game.state.players.p2!.zones.mainDeck = ["p2-draw"];
  game.state.turn = { turnNumber: 2, activePlayerId: "p2", phase: "awaken" };

  applyStartOfTurn(game, decks);

  assert.deepEqual(game.state.players.p2!.zones.base, [
    "p2-rune-a",
    "p2-rune-b",
    "p2-rune-c",
  ]);
  assert.deepEqual(game.state.players.p2!.zones.hand, ["p2-draw"]);
});

test("trigger dispatch orders simultaneous sources and ignores sources that left play", () => {
  const first = triggerCard("TRIGGER_FIRST", "first");
  const second = triggerCard("TRIGGER_SECOND", "second");
  const { game, decks } = matrixFixture([
    first,
    second,
    card("TARGET", "Unit", 1),
  ], [
    instance("first", "p1", "TRIGGER_FIRST", "mainDeck"),
    instance("second", "p1", "TRIGGER_SECOND", "mainDeck"),
    instance("target", "p2", "TARGET", "mainDeck"),
  ]);
  game.state.players.p1!.zones.base = ["first", "second"];

  dispatchBehaviorEvent(game, {
    type: "unit.damaged",
    actorPlayerId: "p1",
    subjectCardInstanceId: "target",
    values: { amount: 1 },
  }, decks);

  assert.equal(game.state.pendingChoice?.type, "orderTriggers");
  assert.equal(game.state.pendingChoice?.optionIds.length, 2);
  assert.deepEqual(
    game.state.pendingChoice?.pendingItems.map((item) => item.sourceCardInstanceId),
    ["first", "second"],
  );

  game.state.pendingChoice = null;
  game.state.queuedTriggerChoices = [];
  game.state.queuedChainItems = [];
  game.state.chain = null;
  game.state.players.p1!.zones.base = [];
  game.state.players.p1!.zones.trash = ["first", "second"];

  dispatchBehaviorEvent(game, {
    type: "unit.damaged",
    actorPlayerId: "p1",
    subjectCardInstanceId: "target",
    values: { amount: 1 },
  }, decks);

  assert.equal(game.state.pendingChoice, null);
  assert.equal(game.state.chain, null);
  assert.deepEqual(game.state.queuedTriggerChoices, []);
});

function matrixFixture(
  definitions: GameCardDefinition[],
  instances: CardInstance[],
): { game: GameDocument; decks: DeckSnapshotDocument[]; handlers: ReturnType<typeof createPrimitiveHandlers> } {
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
      players: { p1: player("p1"), p2: player("p2") },
      battlefields: [],
      cardStates: Object.fromEntries(
        instances.map((item) => [item.instanceId, cardState(item, definitions)]),
      ),
      createdCardInstances: [],
      createdCardDefinitions: [],
      turn: { turnNumber: 1, activePlayerId: "p1", phase: "action" },
      chain: null,
      queuedChainItems: [],
      showdown: null,
      combat: null,
      modifiers: [],
      ongoingEffects: [],
      delayedEffects: [],
      effectResolutions: [],
      pendingChoice: null,
      queuedTriggerChoices: [],
      queuedBehaviorEvents: [],
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

function triggerCard(cardCode: string, clauseId: string): GameCardDefinition {
  const definition = card(cardCode, "Unit", 1);
  definition.behaviorModel = {
    playTimings: [],
    clauses: [{
      id: clauseId,
      sequence: 0,
      sourceText: "synthetic trigger",
      normalizedText: "synthetic trigger",
      abilities: [],
      triggers: [binding("trigger.on_damage", { subject: "enemy_unit" })],
      conditions: [],
      selectors: [],
      choices: [],
      costs: [],
      timings: [],
      effects: [],
      keywords: [],
    }],
  };
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

function cardState(instance: CardInstance, definitions: GameCardDefinition[]) {
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
