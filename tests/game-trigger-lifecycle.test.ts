import assert from "node:assert/strict";
import { test } from "node:test";
import {
  beginDelayedEffectResolution,
  queueDelayedEffects,
  submitTriggerOrder,
  type GameCardDefinition,
  type GameDocument,
} from "../src/server/game";
import { submitBinaryChoice } from "../src/server/game/effect-resolution";
import type { DeckSnapshotDocument } from "../src/server/game/repositories";
import type { CardInstance } from "../src/server/game/state";

test("resolves a delayed effect through the chain and removes its pending record", () => {
  const fixture = triggerFixture();
  fixture.game.state.delayedEffects = [{
    id: "delayed:draw",
    point: "endOfThisTurn",
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "draw-clause",
    selectedIds: [],
  }];

  assert.equal(queueDelayedEffects(fixture.game, "endOfThisTurn", fixture.decks, "p1"), true);
  assert.equal(fixture.game.state.chain?.items[0]?.id, "delayed-trigger:delayed:draw");
  assert.equal(beginDelayedEffectResolution(fixture.game, "delayed:draw", fixture.decks, "p1"), true);
  assert.deepEqual(fixture.game.state.players.p1!.zones.mainDeck, []);
  assert.deepEqual(fixture.game.state.players.p1!.zones.hand, ["draw"]);
  assert.deepEqual(fixture.game.state.delayedEffects, []);
  assert.deepEqual(fixture.game.state.effectResolutions, []);
});

test("pauses a delayed effect for an interactive choice and resumes its effects", () => {
  const fixture = triggerFixture();
  const source = fixture.decks[0]!.snapshot.cards.find((definition) => definition.cardCode === "SOURCE")!;
  source.behaviorModel.clauses[0]!.choices = [binding("choice.optional", { prompt: "Use delayed effect?" })];
  fixture.game.state.delayedEffects = [{
    id: "delayed:optional-draw",
    point: "endOfThisTurn",
    controllerPlayerId: "p1",
    sourceCardInstanceId: "source",
    clauseId: "draw-clause",
    selectedIds: [],
  }];

  assert.equal(beginDelayedEffectResolution(fixture.game, "delayed:optional-draw", fixture.decks, "p1"), false);
  const pending = fixture.game.state.pendingChoice;
  assert.equal(pending?.type, "binary");
  if (!pending || pending.type !== "binary") throw new Error("Expected a delayed binary choice.");
  assert.equal(pending.playerId, "p1");
  assert.deepEqual(fixture.game.state.players.p1!.zones.hand, []);

  assert.throws(
    () => submitBinaryChoice(fixture.game, "p2", ["accept"], fixture.decks),
    /Optional choice is invalid/,
  );
  assert.equal(fixture.game.state.pendingChoice?.type, "binary");

  assert.equal(submitBinaryChoice(fixture.game, "p1", ["accept"], fixture.decks), true);
  assert.equal(fixture.game.state.pendingChoice, null);
  assert.deepEqual(fixture.game.state.players.p1!.zones.hand, ["draw"]);
  assert.deepEqual(fixture.game.state.delayedEffects, []);
  assert.deepEqual(fixture.game.state.effectResolutions, []);
});

test("orders simultaneous delayed triggers by player turn order and advances queued players", () => {
  const fixture = triggerFixture();
  fixture.game.state.delayedEffects = [
    delayed("p1-first", "p1", "source"),
    delayed("p1-second", "p1", "source"),
    delayed("p2-only", "p2", "opponent-source"),
  ];

  assert.equal(queueDelayedEffects(fixture.game, "endOfThisTurn", fixture.decks, "p1"), true);
  const first = fixture.game.state.pendingChoice;
  assert.equal(first?.type, "orderTriggers");
  if (!first || first.type !== "orderTriggers") throw new Error("Expected p1 trigger ordering.");
  assert.equal(first.playerId, "p1");
  assert.deepEqual(fixture.game.state.queuedTriggerChoices.map((choice) => choice.playerId), ["p2"]);

  submitTriggerOrder(fixture.game, "p1", [...first.optionIds].reverse());
  assert.equal(fixture.game.state.pendingChoice, null);
  assert.deepEqual(fixture.game.state.queuedTriggerChoices, []);
  assert.deepEqual(fixture.game.state.chain?.items.map((item) => item.controllerPlayerId), ["p1", "p1", "p2"]);
});

function triggerFixture(): { game: GameDocument; decks: DeckSnapshotDocument[] } {
  const definitions = [
    card("SOURCE", "Unit", {
      clauses: [{
        id: "draw-clause",
        sequence: 0,
        sourceText: "synthetic delayed draw",
        normalizedText: "synthetic delayed draw",
        abilities: [], triggers: [], conditions: [], selectors: [], choices: [], costs: [], timings: [],
        effects: [binding("action.draw_cards", { count: 1, player: "controller" })], keywords: [],
      }],
    }),
    card("OPPONENT_SOURCE", "Unit", { clauses: [] }),
    card("DRAW", "Spell", { clauses: [] }),
  ];
  const instances: CardInstance[] = [
    instance("source", "p1", "SOURCE", "mainDeck"),
    instance("opponent-source", "p2", "OPPONENT_SOURCE", "mainDeck"),
    instance("draw", "p1", "DRAW", "mainDeck"),
  ];
  const snapshot = {
    sourceText: "synthetic trigger fixture",
    catalogDigest: "synthetic-trigger-fixture",
    entries: [],
    cards: definitions,
  };
  const decks: DeckSnapshotDocument[] = [
    { id: "deck-p1", createdAt: "now", updatedAt: "now", matchId: "match", playerId: "p1", snapshot, instances: instances.filter((item) => item.ownerPlayerId === "p1") },
    { id: "deck-p2", createdAt: "now", updatedAt: "now", matchId: "match", playerId: "p2", snapshot, instances: instances.filter((item) => item.ownerPlayerId === "p2") },
  ];
  const player = (playerId: string) => ({
    playerId, points: 0, scoredBattlefieldIdsThisTurn: [], conqueredBattlefieldIdsThisTurn: [],
    energy: 0, conditionalEnergy: 0, conditionalPower: {}, power: {}, zones: {
      legend: null, champion: null, mainDeck: playerId === "p1" ? ["draw"] : [], runeDeck: [], hand: [], trash: [], banishment: [], base: playerId === "p1" ? ["source"] : ["opponent-source"],
    },
  });
  const game = {
    id: "game", matchId: "match", createdAt: "now", updatedAt: "now", gameNumber: 1,
    stateVersion: 1, status: "in_progress", winnerPlayerId: null, completionReason: null,
    state: {
      setup: { playerIds: ["p1", "p2"], startingPlayerChooserId: "p1", startingPlayerId: "p1", battlefieldPools: {}, battlefieldChoices: {}, mulligans: {} },
      players: { p1: player("p1"), p2: player("p2") }, battlefields: [],
      cardStates: Object.fromEntries(instances.map((item) => [item.instanceId, { exhausted: false, damage: 0, computedMight: 1, objectVersion: 0 }])),
      createdCardInstances: [], createdCardDefinitions: [], turn: { turnNumber: 1, activePlayerId: "p1", phase: "action" },
      chain: null, queuedChainItems: [], showdown: null, combat: null, modifiers: [], ongoingEffects: [], delayedEffects: [], effectResolutions: [], pendingChoice: null, queuedTriggerChoices: [], queuedBehaviorEvents: [],
    },
  } as unknown as GameDocument;
  return { game, decks };
}

function delayed(id: string, controllerPlayerId: string, sourceCardInstanceId: string) {
  return { id, point: "endOfThisTurn", controllerPlayerId, sourceCardInstanceId, clauseId: "draw-clause", selectedIds: [] };
}

function card(cardCode: string, type: "Spell" | "Unit", behaviorModel: { clauses: GameCardDefinition["behaviorModel"]["clauses"] }): GameCardDefinition {
  return {
    cardCode, sourceTextHash: `synthetic:${cardCode}`, behaviorModel: { playTimings: [], ...behaviorModel },
    card: { id: cardCode, name: `Synthetic ${cardCode}`, public_code: cardCode, attributes: { energy: type === "Spell" ? 1 : null, might: type === "Unit" ? 1 : null, power: null }, classification: { type, supertype: null, rarity: null, domain: ["Colorless"] }, text: { plain: "" }, set: { set_id: "synthetic", label: "Synthetic" }, media: {}, tags: [], metadata: {} },
  };
}

function instance(instanceId: string, ownerPlayerId: string, cardCode: string, source: CardInstance["source"]): CardInstance {
  return { instanceId, ownerPlayerId, cardCode, source };
}

function binding(behaviorId: string, parameters: Record<string, string | number>) {
  return { behaviorId, parameters, confidence: "high" as const, order: 0 };
}
