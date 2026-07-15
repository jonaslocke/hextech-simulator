import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptedActionEvent,
  addConsecutivePass,
  currentTiming,
  nextRelevantPlayer,
  relevantPlayers,
  scoreBattlefield,
  stateChangeEvents,
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
