import assert from "node:assert/strict";
import { test } from "node:test";
import { projectGame, type GameDocument } from "../src/server/game";
import type { DeckSnapshotDocument, GameEventDocument } from "../src/server/game/repositories";
import type { GameCardDefinition } from "../src/server/game/schemas";
import type { CardInstance } from "../src/server/game/state";

test("projects private hands and decks without exposing opponent card identities", () => {
  const fixture = projectionFixture();
  const viewer = projectGame({ game: fixture.game, viewerPlayerId: "p1", decks: fixture.decks });
  const opponent = projectGame({ game: fixture.game, viewerPlayerId: "p2", decks: fixture.decks });

  const viewerHand = zone(viewer, "p1", "hand");
  const opponentHand = zone(viewer, "p2", "hand");
  assert.equal(viewerHand.visibility, "private");
  assert.deepEqual(viewerHand.cards.map((card) => card.instanceId), ["p1-hand"]);
  assert.equal(opponentHand.visibility, "secret");
  assert.deepEqual(opponentHand.cards, []);
  assert.deepEqual(zone(viewer, "p2", "mainDeck").cards, []);
  assert.deepEqual(zone(viewer, "p2", "runeDeck").cards, []);

  assert.deepEqual(zone(opponent, "p2", "hand").cards.map((card) => card.instanceId), ["p2-hand"]);
  assert.deepEqual(zone(opponent, "p1", "hand").cards, []);
});

test("projects only the viewer's facedown cards while preserving public counts", () => {
  const fixture = projectionFixture();
  fixture.game.state.battlefields[0]!.facedownCards = [
    { cardInstanceId: "p1-hidden", controllerPlayerId: "p1", hiddenAtTurnNumber: 1 },
    { cardInstanceId: "p2-hidden", controllerPlayerId: "p2", hiddenAtTurnNumber: 1 },
  ];

  const p1 = projectGame({ game: fixture.game, viewerPlayerId: "p1", decks: fixture.decks });
  const p2 = projectGame({ game: fixture.game, viewerPlayerId: "p2", decks: fixture.decks });
  const p1Battlefield = p1.battlefields[0]!;
  const p2Battlefield = p2.battlefields[0]!;

  assert.equal(p1Battlefield.facedownCardCount, 2);
  assert.equal(p1Battlefield.hasFacedownCard, true);
  assert.deepEqual(p1Battlefield.facedownCards.map((card) => card.instanceId), ["p1-hidden"]);
  assert.deepEqual(p2Battlefield.facedownCards.map((card) => card.instanceId), ["p2-hidden"]);
  assert.equal(p1Battlefield.facedownCard?.instanceId, "p1-hidden");
  assert.equal(p2Battlefield.facedownCard?.instanceId, "p2-hidden");
});

test("revealed hand selection is private to the player who must choose", () => {
  const fixture = projectionFixture();
  fixture.game.state.pendingChoice = {
    id: "choice:reveal",
    type: "effectSelection",
    resolutionId: "resolution:reveal",
    bindingKey: "hand-target",
    playerId: "p1",
    prompt: "Choose an opponent card",
    title: "Synthetic effect",
    optionKind: "card",
    sourceZone: "hand",
    presentation: "cardSelection",
    visionAction: "recycle",
    legalCardIds: ["p2-hand"],
    minimum: 1,
    maximum: 1,
    targetRequirements: [{
      kind: "card",
      legalIds: ["p2-hand"],
      minimum: 1,
      maximum: 1,
      sourceZone: "hand",
      revealZone: true,
    }],
  };

  const chooser = projectGame({ game: fixture.game, viewerPlayerId: "p1", decks: fixture.decks });
  const waiting = projectGame({ game: fixture.game, viewerPlayerId: "p2", decks: fixture.decks });

  assert.deepEqual(chooser.pendingChoice?.type, "effectSelection");
  assert.deepEqual(waiting.pendingChoice?.type, "effectSelection");
  if (waiting.pendingChoice?.type !== "effectSelection") {
    throw new Error("Expected the waiting projection to retain the effect-selection shape.");
  }
  assert.deepEqual(chooser.pendingChoice?.revealedCards.map((card) => card.instanceId), ["p2-hand"]);
  assert.deepEqual(waiting.pendingChoice?.revealedCards, []);
  assert.match(waiting.pendingChoice?.waitingMessage ?? "", /Waiting for the other player/);
  assert.deepEqual(zone(waiting, "p1", "hand").cards, []);
  assert.deepEqual(zone(waiting, "p2", "hand").cards.map((card) => card.instanceId), ["p2-hand"]);
});

test("projects public modifiers and event log entries consistently for both viewers", () => {
  const fixture = projectionFixture();
  const unitDefinition = fixture.decks[0]!.snapshot.cards.find(
    (definition) => definition.cardCode === "UNIT",
  )!;
  unitDefinition.behaviorModel.clauses = [{
    id: "conditional-continuous-might",
    sequence: 0,
    sourceText: "While this synthetic Unit is buffed, it has +1 Might.",
    normalizedText: "While this synthetic Unit is buffed, it has +1 Might.",
    abilities: [],
    triggers: [],
    conditions: [{
      behaviorId: "condition.state",
      parameters: {
        subject: "source",
        property: "buffed",
        operator: "equal",
        comparisonValue: 1,
      },
      confidence: "high",
      order: 0,
    }],
    selectors: [],
    choices: [],
    costs: [],
    timings: [],
    effects: [{
      behaviorId: "modifier.modify_numeric_value",
      parameters: {
        attribute: "might",
        operation: "increase",
        operand: "constant",
        amount: 1,
        target: "source",
        duration: "whileSourceOnBoard",
      },
      confidence: "high",
      order: 1,
    }],
    keywords: [],
  }];
  fixture.game.state.cardStates["p1-unit"]!.buffed = true;
  fixture.game.state.modifiers = [{
    id: "modifier:public",
    sourceCardInstanceId: "p1-unit",
    controllerPlayerId: "p1",
    targetCardInstanceId: "p1-unit",
    attribute: "might",
    targetScope: "unit",
    operation: "increase",
    amount: 2,
    minimum: null,
    duration: "thisTurn",
    createdAtTurn: 1,
  }];
  const events: GameEventDocument[] = [{
    id: "event:public",
    createdAt: "now",
    updatedAt: "now",
    matchId: "match",
    gameId: "game",
    sequence: 1,
    actorPlayerId: "p1",
    type: "unit.damaged",
    message: "A public unit was damaged.",
  }];

  const p1 = projectGame({ game: fixture.game, viewerPlayerId: "p1", decks: fixture.decks, events });
  const p2 = projectGame({ game: fixture.game, viewerPlayerId: "p2", decks: fixture.decks, events });
  const p1Unit = zone(p1, "p1", "base").cards[0]!;
  const p2Unit = zone(p2, "p1", "base").cards[0]!;

  assert.deepEqual(p1Unit.activeModifiers, [
    { label: "Buff +1", duration: "Until leaving board" },
    { label: "Might +2", duration: "This turn" },
    { label: "Might +1", duration: "While source is on board" },
  ]);
  assert.deepEqual(p2Unit.activeModifiers, p1Unit.activeModifiers);
  assert.deepEqual(p1.logEntries, [{ id: "event:public", message: "A public unit was damaged.", createdAt: "now" }]);
  assert.deepEqual(p2.logEntries, p1.logEntries);
});

function zone(
  projection: ReturnType<typeof projectGame>,
  playerId: string,
  kind: "hand" | "mainDeck" | "runeDeck" | "base",
) {
  return projection.players.find((player) => player.playerId === playerId)!.zones.find((candidate) => candidate.kind === kind)!;
}

function projectionFixture(): { game: GameDocument; decks: DeckSnapshotDocument[] } {
  const definitions = [
    card("HAND", "Spell"),
    card("DECK", "Spell"),
    card("RUNE", "Rune"),
    card("UNIT", "Unit", 2),
    card("BATTLEFIELD", "Battlefield"),
  ];
  const instances: CardInstance[] = [
    instance("p1-hand", "p1", "HAND", "mainDeck"),
    instance("p1-deck", "p1", "DECK", "mainDeck"),
    instance("p1-rune", "p1", "RUNE", "runeDeck"),
    instance("p1-unit", "p1", "UNIT", "mainDeck"),
    instance("p1-hidden", "p1", "HAND", "mainDeck"),
    instance("p1-battlefield", "p1", "BATTLEFIELD", "battlefield"),
    instance("p2-hand", "p2", "HAND", "mainDeck"),
    instance("p2-deck", "p2", "DECK", "mainDeck"),
    instance("p2-rune", "p2", "RUNE", "runeDeck"),
    instance("p2-unit", "p2", "UNIT", "mainDeck"),
    instance("p2-hidden", "p2", "HAND", "mainDeck"),
    instance("p2-battlefield", "p2", "BATTLEFIELD", "battlefield"),
  ];
  const snapshot = { sourceText: "synthetic", catalogDigest: "synthetic", entries: [], cards: definitions };
  const decks = ["p1", "p2"].map((playerId) => ({
    id: `deck-${playerId}`,
    createdAt: "now",
    updatedAt: "now",
    matchId: "match",
    playerId,
    snapshot,
    instances: instances.filter((item) => item.ownerPlayerId === playerId),
  })) as DeckSnapshotDocument[];
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
        p1: player("p1", ["p1-hand"], ["p1-deck"], ["p1-rune"], ["p1-unit"]),
        p2: player("p2", ["p2-hand"], ["p2-deck"], ["p2-rune"], ["p2-unit"]),
      },
      battlefields: [{
        battlefieldId: "middle",
        cardInstanceId: "p1-battlefield",
        selectedByPlayerId: "p1",
        controllerPlayerId: "p1",
        contestedByPlayerId: null,
        units: ["p1-unit", "p2-unit"],
      }],
      cardStates: Object.fromEntries(instances.map((item) => [item.instanceId, {
        exhausted: false,
        damage: 0,
        computedMight: definitions.find((definition) => definition.cardCode === item.cardCode)?.card.attributes.might ?? null,
        objectVersion: 0,
      }])),
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
    },
  } as unknown as GameDocument;
  return { game, decks };
}

function player(playerId: string, hand: string[], mainDeck: string[], runeDeck: string[], base: string[]) {
  return {
    playerId,
    points: 0,
    energy: 0,
    conditionalEnergy: 0,
    conditionalPower: {},
    power: {},
    zones: { legend: null, champion: null, mainDeck, runeDeck, hand, trash: [], banishment: [], base },
  };
}

function card(cardCode: string, type: "Battlefield" | "Rune" | "Spell" | "Unit", might: number | null = null): GameCardDefinition {
  return {
    cardCode,
    sourceTextHash: `hash:${cardCode}`,
    card: {
      id: cardCode,
      name: `Synthetic ${cardCode}`,
      public_code: cardCode,
      attributes: { energy: type === "Spell" ? 1 : null, might, power: null },
      classification: { type, supertype: null, rarity: null, domain: ["Colorless"] },
      text: { plain: "" },
      set: { set_id: "synthetic", label: "Synthetic" },
      media: {},
      tags: [],
      metadata: {},
    },
    behaviorModel: { playTimings: [], clauses: [] },
  };
}

function instance(instanceId: string, ownerPlayerId: string, cardCode: string, source: CardInstance["source"]): CardInstance {
  return { instanceId, ownerPlayerId, cardCode, source };
}
