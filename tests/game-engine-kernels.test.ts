import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptedActionEvent,
  addConsecutivePass,
  currentTiming,
  nextRelevantPlayer,
  relevantPlayers,
  applyHoldScoring,
  scoreBattlefield,
  stateChangeEvents,
  victoryRequirement,
  type GameDocument,
} from "../src/server/game";
import { effectiveNumericValue } from "../src/server/game/numeric-modifiers";
import { numericConditionMatches } from "../src/server/game/numeric-condition";

test("timing derives the active priority window and rotates relevant players", () => {
  const game = engineGame();

  assert.equal(currentTiming(game), "neutralOpen");
  assert.deepEqual(relevantPlayers(game), ["p1", "p2"]);
  assert.equal(nextRelevantPlayer(game, "p1"), "p2");

  game.state.showdown = {
    kind: "nonCombat",
    battlefieldId: "battlefield",
    relevantPlayerIds: ["p1", "p2"],
    focusPlayerId: "p1",
    passedPlayerIds: [],
  };
  assert.equal(currentTiming(game), "showdownOpen");

  game.state.chain = {
    items: [],
    relevantPlayerIds: ["p2", "p1"],
    priorityPlayerId: "p2",
    passedPlayerIds: [],
  };
  assert.equal(currentTiming(game), "showdownClosed");
  assert.deepEqual(relevantPlayers(game), ["p2", "p1"]);
  assert.equal(nextRelevantPlayer(game, "p2"), "p1");
  assert.deepEqual(addConsecutivePass([], "p2"), ["p2"]);
  assert.throws(() => addConsecutivePass(["p2"], "p2"), /pass twice/);
});

test("numeric conditions compare event values and numeric modifiers compose", () => {
  const game = engineGame();
  const index = {
    definitions: new Map(),
    instances: new Map(),
  };
  const condition = {
    behaviorId: "condition.compare_numeric_value",
    parameters: {
      valueSource: "eventSubject.effectiveEnergyCost",
      operator: "greaterThanOrEqual",
      comparisonValue: 5,
    },
    confidence: "high" as const,
    order: 0,
  };

  assert.equal(
    numericConditionMatches({
      binding: condition,
      controllerPlayerId: "p1",
      eventValues: { "eventSubject.printedEnergyCost": 5 },
      game,
      index,
    }),
    true,
  );
  assert.equal(
    numericConditionMatches({
      binding: { ...condition, parameters: { ...condition.parameters, operator: "lessThan" } },
      controllerPlayerId: "p1",
      eventValues: { "eventSubject.printedEnergyCost": 5 },
      game,
      index,
    }),
    false,
  );

  game.state.modifiers = [
    {
      id: "modifier-1",
      sourceCardInstanceId: null,
      controllerPlayerId: "p1",
      targetCardInstanceId: null,
      attribute: "might",
      targetScope: "unit",
      operation: "increase",
      amount: 2,
      minimum: null,
      duration: "thisTurn",
      createdAtTurn: 1,
    },
    {
      id: "modifier-2",
      sourceCardInstanceId: null,
      controllerPlayerId: "p1",
      targetCardInstanceId: null,
      attribute: "might",
      targetScope: "unit",
      operation: "reduce",
      amount: 1,
      minimum: 1,
      duration: "thisTurn",
      createdAtTurn: 1,
    },
  ];
  assert.equal(effectiveNumericValue({
    attribute: "might",
    baseValue: 3,
    controllerPlayerId: "p1",
    game,
    targetScope: "unit",
  }), 4);
});

test("numeric conditions cover every comparison operator and value source", () => {
  const game = engineGame();
  const rune = {
    instanceId: "rune",
    ownerPlayerId: "p1",
    source: "runeDeck" as const,
    cardCode: "RUNE",
  };
  const index = {
    definitions: new Map([[
      "RUNE",
      {
        ...scoreDeck().snapshot.cards[0]!,
        cardCode: "RUNE",
        card: {
          ...scoreDeck().snapshot.cards[0]!.card,
          id: "RUNE",
          public_code: "RUNE",
          classification: {
            ...scoreDeck().snapshot.cards[0]!.card.classification,
            type: "Rune" as const,
          },
        },
      },
    ]]),
    instances: new Map([[rune.instanceId, rune]]),
  };
  game.state.players.p1!.zones.base = [rune.instanceId];

  const operators = [
    ["equal", true],
    ["notEqual", false],
    ["greaterThan", false],
    ["greaterThanOrEqual", true],
    ["lessThan", false],
    ["lessThanOrEqual", true],
  ] as const;
  for (const [operator, expected] of operators) {
    assert.equal(
      numericConditionMatches({
        binding: {
          behaviorId: "condition.compare_numeric_value",
          parameters: {
            valueSource: "event.value",
            operator,
            comparisonValue: 5,
          },
          confidence: "high",
          order: 0,
        },
        controllerPlayerId: "p1",
        eventValues: { "event.value": 5 },
        game,
        index: index as never,
      }),
      expected,
      operator,
    );
  }

  assert.equal(
    numericConditionMatches({
      binding: {
        behaviorId: "condition.compare_numeric_value",
        parameters: {
          valueSource: "controller.boardRuneCount",
          operator: "equal",
          comparisonValue: 1,
        },
        confidence: "high",
        order: 0,
      },
      controllerPlayerId: "p1",
      game,
      index: index as never,
    }),
    true,
  );
  assert.equal(
    numericConditionMatches({
      binding: {
        behaviorId: "condition.compare_numeric_value",
        parameters: {
          valueSource: "event.value",
          operator: "equal",
          comparisonValue: 5,
        },
        confidence: "high",
        order: 0,
      },
      controllerPlayerId: "p1",
      eventValues: { "event.value": "not-a-number" },
      game,
      index: index as never,
    }),
    false,
  );
});

test("numeric modifiers apply every operation, floors, and target ownership", () => {
  const operations = [
    ["increase", 7],
    ["reduce", 3],
    ["multiply", 10],
    ["set", 4],
  ] as const;
  for (const [operation, expected] of operations) {
    const game = engineGame();
    game.state.modifiers = [{
      id: "modifier",
      sourceCardInstanceId: null,
      controllerPlayerId: "p1",
      targetCardInstanceId: null,
      attribute: "might",
      targetScope: "unit",
      operation,
      amount: operation === "multiply" ? 2 : operation === "set" ? 4 : 2,
      minimum: null,
      duration: "thisTurn",
      createdAtTurn: 1,
    }];
    assert.equal(effectiveNumericValue({
      attribute: "might",
      baseValue: 5,
      controllerPlayerId: "p1",
      game,
      targetScope: "unit",
    }), expected, operation);
  }

  const floored = engineGame();
  floored.state.modifiers = [{
    id: "floor",
    sourceCardInstanceId: null,
    controllerPlayerId: "p1",
    targetCardInstanceId: null,
    attribute: "might",
    targetScope: "unit",
    operation: "reduce",
    amount: 10,
    minimum: 2,
    duration: "thisTurn",
    createdAtTurn: 1,
  }];
  assert.equal(effectiveNumericValue({
    attribute: "might",
    baseValue: 5,
    controllerPlayerId: "p1",
    game: floored,
    targetScope: "unit",
  }), 2);

  floored.state.modifiers.push({
    id: "other-controller",
    sourceCardInstanceId: null,
    controllerPlayerId: "p2",
    targetCardInstanceId: null,
    attribute: "might",
    targetScope: "unit",
    operation: "increase",
    amount: 20,
    minimum: null,
    duration: "thisTurn",
    createdAtTurn: 1,
  });
  assert.equal(effectiveNumericValue({
    attribute: "might",
    baseValue: 5,
    controllerPlayerId: "p1",
    game: floored,
    targetScope: "unit",
  }), 2);
});

test("transition events describe action acceptance and state boundaries", () => {
  const before = engineGame();
  before.state.battlefields = [{
    battlefieldId: "battlefield",
    cardInstanceId: "battlefield-card",
    selectedByPlayerId: "p1",
    controllerPlayerId: null,
    contestedByPlayerId: null,
    units: [],
  }];
  const after = structuredClone(before);
  after.state.showdown = {
    kind: "combat",
    battlefieldId: "battlefield",
    relevantPlayerIds: ["p1", "p2"],
    focusPlayerId: "p1",
    passedPlayerIds: [],
  };
  after.state.combat = {
    battlefieldId: "battlefield",
    stage: "showdown",
    attackerPlayerId: "p1",
    defenderPlayerId: "p2",
    attackerUnitIds: ["attacker"],
    defenderUnitIds: ["defender"],
    attackerMight: 2,
    defenderMight: 1,
    attackerAssignments: [],
    defenderAssignments: [],
  };

  const accepted = acceptedActionEvent("p1", {
    id: "game:1:action:move",
    label: "Move",
  } as never);
  assert.deepEqual(accepted, {
    type: "game.action.accepted",
    actorPlayerId: "p1",
    message: "p1: Move",
    payload: { actionId: "game:1:action:move" },
  });
  assert.deepEqual(
    stateChangeEvents(before, after).map((event) => event.type),
    ["showdown.started", "combat.started"],
  );

  const completed = structuredClone(after);
  completed.state.showdown = null;
  completed.state.combat = null;
  completed.state.battlefields[0]!.controllerPlayerId = "p1";
  completed.state.players.p1!.points = 1;
  completed.winnerPlayerId = "p1";
  completed.status = "complete";
  assert.deepEqual(
    stateChangeEvents(after, completed).map((event) => event.type),
    ["showdown.ended", "combat.resolved", "battlefield.controlChanged", "player.scored", "game.won"],
  );
});

test("scoring is once per battlefield per turn", () => {
  const game = engineGame();
  game.state.battlefields = [{
    battlefieldId: "battlefield",
    cardInstanceId: "battlefield-card",
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    contestedByPlayerId: null,
    units: [],
  }];
  scoreBattlefield(game, "p1", "battlefield", "hold", [scoreDeck()]);
  scoreBattlefield(game, "p1", "battlefield", "hold", [scoreDeck()]);

  assert.equal(game.state.players.p1!.points, 1);
  assert.deepEqual(game.state.players.p1!.scoredBattlefieldIdsThisTurn, ["battlefield"]);
});

test("hold scoring scores every controlled battlefield once", () => {
  const game = engineGame();
  game.state.battlefields = [
    battlefield("one", "p1"),
    battlefield("two", "p1"),
    battlefield("three", "p2"),
  ];
  game.state.players.p1!.points = 0;

  applyHoldScoring(game, "p1", [scoreDeck()]);

  assert.equal(game.state.players.p1!.points, 2);
  assert.equal(game.winnerPlayerId, null);
  assert.deepEqual(game.state.players.p1!.scoredBattlefieldIdsThisTurn, ["one", "two"]);
});

test("hold scoring completes on a final hold without drawing", () => {
  const game = engineGame();
  game.state.battlefields = [battlefield("one", "p1"), battlefield("other", "p2")];
  game.state.players.p1!.points = 7;
  game.state.players.p1!.zones.hand = ["existing-card"];
  game.state.modifiers = [{
    id: "victory-floor",
    sourceCardInstanceId: null,
    controllerPlayerId: "p1",
    targetCardInstanceId: null,
    attribute: "victoryRequirement",
    targetScope: "game",
    operation: "set",
    amount: 8,
    minimum: null,
    duration: "thisGame",
    createdAtTurn: 1,
  }];

  applyHoldScoring(game, "p1", [scoreDeck()]);

  assert.equal(game.state.players.p1!.points, 8);
  assert.equal(game.winnerPlayerId, "p1");
  assert.equal(game.status, "complete");
  assert.deepEqual(game.state.players.p1!.scoredBattlefieldIdsThisTurn, ["one"]);
  assert.deepEqual(game.state.players.p1!.zones.hand, ["existing-card"]);
  assert.equal(victoryRequirement(game, [scoreDeck()]), 8);
});

test("a final first Conquer replaces the point with a draw, while later Conquer wins", () => {
  const game = engineGame();
  game.state.battlefields = [battlefield("one", "p1"), battlefield("two", "p1")];
  game.state.players.p1!.points = 7;
  game.state.players.p1!.zones.mainDeck = ["draw-card"];

  scoreBattlefield(game, "p1", "one", "conquer", [scoreDeck()]);
  assert.equal(game.state.players.p1!.points, 7);
  assert.deepEqual(game.state.players.p1!.zones.hand, ["draw-card"]);
  assert.equal(game.winnerPlayerId, null);

  scoreBattlefield(game, "p1", "two", "conquer", [scoreDeck()]);
  assert.equal(game.state.players.p1!.points, 8);
  assert.equal(game.winnerPlayerId, "p1");
  assert.equal(game.status, "complete");
});

function engineGame(): GameDocument {
  return {
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
      cardStates: {},
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

function scoreDeck() {
  return {
    id: "score-deck",
    createdAt: "now",
    updatedAt: "now",
    matchId: "match",
    playerId: "p1",
    instances: [{
      instanceId: "battlefield-card",
      ownerPlayerId: "p1",
      source: "battlefield" as const,
      cardCode: "BATTLEFIELD",
    }],
    snapshot: {
      sourceText: "synthetic",
      catalogDigest: "synthetic",
      entries: [],
      cards: [{
        cardCode: "BATTLEFIELD",
        sourceTextHash: "synthetic",
        card: {
          id: "BATTLEFIELD",
          name: "Synthetic Battlefield",
          public_code: "BATTLEFIELD",
          attributes: { energy: null, might: null, power: null },
          classification: {
            type: "Battlefield" as const,
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
      }],
    },
  };
}

function battlefield(id: string, controllerPlayerId: string) {
  return {
    battlefieldId: id,
    cardInstanceId: "battlefield-card",
    selectedByPlayerId: controllerPlayerId,
    controllerPlayerId,
    contestedByPlayerId: null,
    units: [],
  };
}
