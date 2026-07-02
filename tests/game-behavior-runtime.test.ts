import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compileBehaviorModel, createBehaviorContext, executeBehaviorClause,
  queueTriggeredClauses, submitTriggerOrder,
  type BehaviorHandler, type BehaviorHandlerRegistry, type BehaviorModel,
  type GameDocument
} from "../src/server/game";

test("guards clauses, validates selectors, and executes effects by canonical order", () => {
  const effects: string[] = [];
  const handlers: BehaviorHandlerRegistry = new Map<string, BehaviorHandler>([
    ["trigger.event", { matches: (_binding, context) => context.event?.type === "event" }],
    ["condition.allowed", { matches: (_binding, context) => context.event?.values.allowed === true }],
    ["selector.cards", { targets: () => ({ kind: "card", legalIds: ["a", "b"], minimum: 1, maximum: 1 }) }],
    ["effect.first", { execute: () => { effects.push("first"); } }],
    ["effect.second", { execute: () => { effects.push("second"); } }]
  ]);
  const compiled = compileBehaviorModel(model(), handlers);
  const game = gameFixture();
  const context = createBehaviorContext(game, "p1", "source", { type: "event", actorPlayerId: "p1", subjectCardInstanceId: null, values: { allowed: true } }, ["a"]);
  assert.deepEqual(executeBehaviorClause({ clause: compiled.clauses[0]!, context, handlers }), { executed: true, delayed: false });
  assert.deepEqual(effects, ["first", "second"]);
  assert.throws(() => executeBehaviorClause({ clause: compiled.clauses[0]!, context: { ...context, selectedIds: ["bad"] }, handlers }), /selector requirements/);
});

test("schedules delayed clauses and requires explicit trigger ordering", () => {
  const handlers: BehaviorHandlerRegistry = new Map<string, BehaviorHandler>([
    ["trigger.event", { matches: () => true }], ["condition.allowed", { matches: () => true }],
    ["selector.cards", { targets: () => ({ kind: "card", legalIds: ["a"], minimum: 1, maximum: 1 }) }],
    ["effect.first", { execute() {} }], ["effect.second", { execute() {} }],
    ["timing.delayed", {}]
  ]);
  const delayedModel: BehaviorModel = model();
  delayedModel.clauses[0]!.timings.push(binding("timing.delayed", 4, { point: "endOfThisTurn" }));
  const compiled = compileBehaviorModel(delayedModel, handlers);
  const game = gameFixture();
  const context = createBehaviorContext(game, "p1", "source", { type: "event", actorPlayerId: "p1", subjectCardInstanceId: null, values: { allowed: true } }, ["a"]);
  assert.equal(executeBehaviorClause({ clause: compiled.clauses[0]!, context, handlers }).delayed, true);
  assert.equal(game.state.delayedEffects.length, 1);

  queueTriggeredClauses({ game, controllerPlayerId: "p1", event: context.event!, handlers, sources: [
    { sourceCardInstanceId: "one", label: "One", model: compiled },
    { sourceCardInstanceId: "two", label: "Two", model: compiled }
  ] });
  const pending = game.state.pendingChoice;
  assert.equal(pending?.type, "orderTriggers");
  if (!pending || pending.type !== "orderTriggers") {
    throw new Error("Expected trigger-order choice.");
  }
  assert.equal(pending.optionIds.length, 2);
  assert.throws(() => submitTriggerOrder(game, "p1", [pending.optionIds[0]!]), /every pending trigger/);
  submitTriggerOrder(game, "p1", [...pending.optionIds].reverse());
  assert.equal(game.state.chain?.items.length, 2);
});

test("rejects unknown handlers and duplicate canonical ordering", () => {
  const handlers: BehaviorHandlerRegistry = new Map();
  assert.throws(() => compileBehaviorModel(model(), handlers), /Unknown game behavior handler/);
  const duplicate = model();
  duplicate.clauses[0]!.effects[1]!.order = duplicate.clauses[0]!.effects[0]!.order;
  const complete = new Map<string, object>([
    ["trigger.event", {}], ["condition.allowed", {}], ["selector.cards", {}], ["effect.first", {}], ["effect.second", {}]
  ]) as BehaviorHandlerRegistry;
  assert.throws(() => compileBehaviorModel(duplicate, complete), /Duplicate behavior order/);
});

function model(): BehaviorModel {
  return { playTimings: [], clauses: [{
    id: "clause", sequence: 0, sourceText: "", normalizedText: "",
    abilities: [], triggers: [binding("trigger.event", 0)], conditions: [binding("condition.allowed", 1)],
    selectors: [binding("selector.cards", 2)], choices: [], costs: [], timings: [],
    effects: [binding("effect.second", 5), binding("effect.first", 3)], keywords: []
  }] };
}
function binding(behaviorId: string, order: number, parameters: Record<string, string> = {}) {
  return { behaviorId, parameters, confidence: "high" as const, order };
}
function gameFixture(): GameDocument {
  return {
    id: "g", matchId: "m", createdAt: "a", updatedAt: "a", stateVersion: 1,
    status: "in_progress", winnerPlayerId: null,
    state: {
      setup: { playerIds: ["p1", "p2"], startingPlayerChooserId: "p1", startingPlayerId: "p1", battlefieldPools: {}, battlefieldChoices: {}, mulligans: {} },
      players: {}, battlefields: [], cardStates: {}, turn: { turnNumber: 1, activePlayerId: "p1", phase: "action" },
      chain: null, showdown: null, combat: null, modifiers: [], delayedEffects: [], pendingChoice: null,
      queuedTriggerChoices: []
    }
  };
}
