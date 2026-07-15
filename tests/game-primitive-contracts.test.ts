import assert from "node:assert/strict";
import { test } from "node:test";
import {
  GAME__RUNTIME_COVERAGE,
  createBehaviorContext,
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  type BehaviorEvent,
  type BehaviorBinding,
  type GameCardDefinition,
  type GameDocument,
} from "../src/server/game";
import type { DeckSnapshotDocument } from "../src/server/game/repositories";
import type { CardInstance } from "../src/server/game/state";

test("registers a handler for every executable behavior", () => {
  const { handlers } = fixture([]);

  for (const behaviorId of Object.keys(GAME__RUNTIME_COVERAGE)) {
    assert.ok(
      handlers.has(behaviorId),
      `Missing runtime handler for ${behaviorId}`,
    );
  }
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
