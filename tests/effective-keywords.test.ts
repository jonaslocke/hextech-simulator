import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createRuntimeCardIndex,
  createBehaviorContext,
  createPrimitiveHandlers,
  evaluateEffectiveKeywords,
  projectedKeywordAnnotations,
  reconcileAllRuntimeKeywordActivations,
  cleanupTurnModifiers,
  definitionForInstance,
  dispatchBehaviorEvent,
  gameplayActions,
  moveCardToTrash,
  performGameplayAction,
  type BehaviorBinding,
} from "../src/server/game";
import { attachCardToTopMost } from "../src/server/game/attachment-lifecycle";
import { gameFixture } from "./helpers/game-fixture";
import { projectGame } from "../src/server/game/projection";
import { advanceGameObjectIncarnation } from "../src/server/game/primitive-handlers";

const binding = (behaviorId: string, parameters: Record<string, string | number | boolean | null>): BehaviorBinding => ({
  behaviorId,
  parameters,
  confidence: "high",
  order: 0,
});

test("applied keyword grants survive their source leaving and project safely until their lifetime ends", async () => {
  const { game, decks, place } = await gameFixture();
  const unitId = place("OGN-044", "base");
  const sourceId = place("SFD-064", "hand");
  const index = createRuntimeCardIndex(decks, game);
  const grant = binding("modifier.grant_keyword", {
    keywordBehaviorId: "keyword.assault",
    amount: 3,
    target: "unit",
    duration: "thisTurn",
    displayDuration: "This turn",
  });
  const handler = createPrimitiveHandlers(index).get("modifier.grant_keyword")!;
  handler.validate!(grant);
  handler.execute!(grant, {
    ...createBehaviorContext(game, "p1", sourceId, null, [unitId]),
    sourceBehaviorClauseId: "grant-assault",
  });

  assert.equal(evaluateEffectiveKeywords(game, unitId, index).find((entry) => entry.behaviorId === "keyword.assault")?.amount, 3);
  const opponentView = projectGame({ game, decks, viewerPlayerId: "p2" }).players[0]!.zones.flatMap((zone) => zone.cards).find((card) => card.instanceId === unitId)!;
  assert.deepEqual((opponentView.keywordAnnotations ?? []).map((entry) => [entry.displayName, entry.effectiveAmount]), [["Assault", 3]]);
  assert.deepEqual((opponentView.runtimeEffects ?? []).map((entry) => [entry.kind, entry.sourceName, entry.displayDuration]), [["keyword", "Effect", "This turn"]]);

  moveCardToTrash(game, sourceId, index);
  const afterSourceLeaves = projectGame({ game, decks, viewerPlayerId: "p2" }).players[0]!.zones.flatMap((zone) => zone.cards).find((card) => card.instanceId === unitId)!;
  assert.equal(afterSourceLeaves.runtimeEffects?.[0]?.sourceName, definitionForInstance(sourceId, index).card.name);
  assert.equal(afterSourceLeaves.keywordAnnotations?.[0]?.effectiveAmount, 3);

  cleanupTurnModifiers(game, index);
  assert.deepEqual(evaluateEffectiveKeywords(game, unitId, index).filter((entry) => entry.behaviorId === "keyword.assault"), []);
  assert.deepEqual(game.state.runtimeKeywordActivations, []);
});

test("applied keyword grants do not follow a new target incarnation", async () => {
  const { game, decks, place } = await gameFixture();
  const unitId = place("OGN-044", "base");
  const sourceId = place("SFD-064", "hand");
  const index = createRuntimeCardIndex(decks, game);
  createPrimitiveHandlers(index).get("modifier.grant_keyword")!.execute!(binding("modifier.grant_keyword", {
    keywordBehaviorId: "keyword.ganking",
    target: "unit",
  }), createBehaviorContext(game, "p1", sourceId, null, [unitId]));

  assert.equal(evaluateEffectiveKeywords(game, unitId, index).some((entry) => entry.behaviorId === "keyword.ganking"), true);
  advanceGameObjectIncarnation(game, unitId);
  assert.equal(evaluateEffectiveKeywords(game, unitId, index).some((entry) => entry.behaviorId === "keyword.ganking"), false);
  assert.deepEqual(game.state.runtimeKeywordActivations, []);
});

test("runtime annotation order follows activation and survives value changes", async () => {
  const { game, decks, place } = await gameFixture();
  const unitId = place("OGN-044", "base");
  const sourceId = place("SFD-064", "hand");
  const index = createRuntimeCardIndex(decks, game);
  const handler = createPrimitiveHandlers(index).get("modifier.grant_keyword")!;
  const grant = (keywordBehaviorId: string, amount?: number) => handler.execute!(binding("modifier.grant_keyword", {
    keywordBehaviorId,
    ...(amount === undefined ? {} : { amount }),
    target: "unit",
    duration: "thisTurn",
  }), createBehaviorContext(game, "p1", sourceId, null, [unitId]));

  grant("keyword.assault", 3);
  const firstOrder = game.state.runtimeKeywordActivations![0]!.activationOrder;
  grant("keyword.ganking");
  grant("keyword.assault", 2);
  reconcileAllRuntimeKeywordActivations(game, index);

  assert.deepEqual(projectedKeywordAnnotations(game, unitId, index).map((entry) => [entry.keywordId, entry.effectiveAmount]), [
    ["keyword.assault", 5],
    ["keyword.ganking", null],
  ]);
  assert.equal(game.state.runtimeKeywordActivations?.find((entry) => entry.keywordBehaviorId === "keyword.assault")?.activationOrder, firstOrder);
});

test("continuous keyword grants are derived from an active source instead of stamped onto units", async () => {
  const { game, decks, place } = await gameFixture();
  const sourceId = place("SFD-064", "base");
  const unitId = place("OGN-044", "base");
  const index = createRuntimeCardIndex(decks, game);
  const source = index.definitions.get("SFD-064")!;
  source.behaviorModel.clauses.push({
    id: "continuous-tank",
    sequence: source.behaviorModel.clauses.length,
    sourceText: "Your units have Tank.",
    normalizedText: "",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [],
    choices: [],
    costs: [],
    timings: [],
    effects: [binding("modifier.grant_keyword", {
      keywordBehaviorId: "keyword.tank",
      target: "controller_units",
      duration: "whileSourceOnBoard",
    })],
    keywords: [],
  });

  assert.equal(evaluateEffectiveKeywords(game, unitId, index).some((entry) => entry.behaviorId === "keyword.tank"), true);
  assert.equal(game.state.keywordGrants?.length ?? 0, 0);
  const projected = projectGame({ game, decks, viewerPlayerId: "p2" }).players[0]!.zones.flatMap((zone) => zone.cards).find((card) => card.instanceId === unitId)!;
  assert.deepEqual(projected.runtimeEffects?.map((entry) => [entry.kind, entry.sourceName]), [["keyword", definitionForInstance(sourceId, index).card.name]]);
  moveCardToTrash(game, sourceId, index);
  assert.equal(evaluateEffectiveKeywords(game, unitId, index).some((entry) => entry.behaviorId === "keyword.tank"), false);
  const afterSourceLeaves = projectGame({ game, decks, viewerPlayerId: "p2" }).players[0]!.zones.flatMap((zone) => zone.cards).find((card) => card.instanceId === unitId)!;
  assert.deepEqual(afterSourceLeaves.runtimeEffects, []);
});

test("granted trigger fragments remain executable after their source leaves", async () => {
  const { game, decks, place } = await gameFixture();
  const unitId = place("OGN-044", "base");
  const sourceId = place("SFD-064", "hand");
  const index = createRuntimeCardIndex(decks, game);
  const source = index.definitions.get("SFD-064")!;
  source.behaviorModel.fragments = {
    "draw-on-play": [{
      id: "draw-on-play",
      sequence: 0,
      sourceText: "When this unit is played, draw 1.",
      normalizedText: "",
      abilities: [],
      triggers: [binding("trigger.on_play", { subject: "source" })],
      conditions: [],
      selectors: [],
      choices: [],
      costs: [],
      timings: [],
      effects: [binding("action.draw_cards", { player: "controller", count: 1 })],
      keywords: [],
    }],
  };
  const grant = binding("modifier.grant_behavior", {
    behaviorFragmentId: "draw-on-play",
    displayText: "When this unit is played, draw 1.",
    target: "unit",
    duration: "thisTurn",
    displayDuration: "This turn",
  });
  const handler = createPrimitiveHandlers(index).get("modifier.grant_behavior")!;
  handler.validate!(grant);
  handler.execute!(grant, createBehaviorContext(game, "p1", sourceId, null, [unitId]));
  const projectedGrant = projectGame({ game, decks, viewerPlayerId: "p2" }).players[0]!.zones.flatMap((zone) => zone.cards).find((card) => card.instanceId === unitId)!;
  assert.deepEqual(projectedGrant.runtimeEffects?.map((entry) => [entry.kind, entry.sourceName, entry.displayDuration]), [["grantedBehavior", "Effect", "This turn"]]);
  moveCardToTrash(game, sourceId, index);
  const projectedAfterSourceLeaves = projectGame({ game, decks, viewerPlayerId: "p2" }).players[0]!.zones.flatMap((zone) => zone.cards).find((card) => card.instanceId === unitId)!;
  assert.equal(projectedAfterSourceLeaves.runtimeEffects?.[0]?.sourceName, definitionForInstance(sourceId, index).card.name);

  const handSize = game.state.players.p1!.zones.hand.length;
  dispatchBehaviorEvent(game, {
    type: "card.played",
    actorPlayerId: "p1",
    subjectCardInstanceId: unitId,
    values: {},
  }, decks);
  const grantedItem = game.state.chain?.items.find((item) => item.grantedBehaviorClauseSnapshot);
  assert.ok(grantedItem);
  assert.equal(grantedItem.sourceCardInstanceId, unitId);

  const itemCount = game.state.chain!.items.length;
  let current = game;
  while (current.state.chain?.items.length === itemCount) {
    const playerId = current.state.chain.priorityPlayerId;
    const pass = gameplayActions(current, playerId, decks).find((action) => action.label === "Pass priority")!;
    current = performGameplayAction({
      game: current,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: "granted-behavior-resolution",
    });
  }
  assert.equal(current.state.players.p1!.zones.hand.length, handSize + 1);
  cleanupTurnModifiers(current, index);
  const expired = projectGame({ game: current, decks, viewerPlayerId: "p2" }).players[0]!.zones.flatMap((zone) => zone.cards).find((card) => card.instanceId === unitId)!;
  assert.deepEqual(expired.runtimeEffects, []);
  dispatchBehaviorEvent(current, {
    type: "card.played",
    actorPlayerId: "p1",
    subjectCardInstanceId: unitId,
    values: {},
  }, decks);
  assert.equal(current.state.chain?.items.some((item) => item.grantedBehaviorClauseSnapshot) ?? false, false);
});

test("granted trigger fragments end with the target game-object incarnation", async () => {
  const { game, decks, place } = await gameFixture();
  const unitId = place("OGN-044", "base");
  const sourceId = place("SFD-064", "hand");
  const index = createRuntimeCardIndex(decks, game);
  index.definitions.get("SFD-064")!.behaviorModel.fragments = {
    "ready-trigger": [{
      id: "ready-trigger",
      sequence: 0,
      sourceText: "When this unit is played, draw 1.",
      normalizedText: "",
      abilities: [],
      triggers: [binding("trigger.on_play", { subject: "source" })],
      conditions: [],
      selectors: [],
      choices: [],
      costs: [],
      timings: [],
      effects: [binding("action.draw_cards", { player: "controller", count: 1 })],
      keywords: [],
    }],
  };
  createPrimitiveHandlers(index).get("modifier.grant_behavior")!.execute!(binding("modifier.grant_behavior", {
    behaviorFragmentId: "ready-trigger",
    displayText: "When this unit is played, draw 1.",
    target: "unit",
  }), createBehaviorContext(game, "p1", sourceId, null, [unitId]));

  advanceGameObjectIncarnation(game, unitId);
  const projected = projectGame({ game, decks, viewerPlayerId: "p2" }).players[0]!.zones.flatMap((zone) => zone.cards).find((card) => card.instanceId === unitId)!;
  assert.deepEqual(projected.runtimeEffects, []);
  dispatchBehaviorEvent(game, {
    type: "card.played",
    actorPlayerId: "p1",
    subjectCardInstanceId: unitId,
    values: {},
  }, decks);
  assert.equal(game.state.chain?.items.some((item) => item.grantedBehaviorClauseSnapshot) ?? false, false);
});

test("effective keyword evaluation composes native and attached characteristics", async () => {
  const { game, decks, place } = await gameFixture();
  const unitId = place("OGN-044", "base");
  const gearId = place("SFD-064", "base");
  const index = createRuntimeCardIndex(decks, game);
  const unit = index.definitions.get("OGN-044")!;
  unit.behaviorModel.clauses[0]!.keywords.push(
    binding("keyword.assault", { amount: 1 }),
    binding("keyword.tank", {}),
  );
  const gear = index.definitions.get("SFD-064")!;
  gear.effectBehaviorModel = {
    playTimings: [],
    clauses: [{
      id: "attached-keywords",
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
      keywords: [
        binding("keyword.assault", { amount: 2 }),
        binding("keyword.tank", {}),
      ],
    }],
  };
  attachCardToTopMost(game, gearId, unitId, index);

  const assault = evaluateEffectiveKeywords(game, unitId, index).find((entry) => entry.behaviorId === "keyword.assault");
  const tank = evaluateEffectiveKeywords(game, unitId, index).find((entry) => entry.behaviorId === "keyword.tank");
  assert.equal(assault?.amount, 3);
  assert.equal(assault?.contributions.length, 2);
  assert.equal(tank?.amount, null);
  assert.equal(tank?.contributions.length, 2);
});
