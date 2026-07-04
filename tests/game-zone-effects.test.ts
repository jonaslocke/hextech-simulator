import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createBehaviorContext,
  buildPaymentPlan,
  createPrimitiveHandlers,
  legalUnitDestinationIds,
  type BehaviorBinding,
  type GameDocument,
  type RuntimeCardIndex,
  targetDeflectCost,
} from "../src/server/game";

test("returns selected trash cards and moves battlefield units generically", () => {
  const game = fixture();
  const index = cardIndex();
  const handlers = createPrimitiveHandlers(index);

  handlers.get("action.return_to_hand")!.execute!(
    binding("action.return_to_hand", { target: "card" }),
    createBehaviorContext(game, "p1", "source", null, ["spell"]),
  );
  assert.deepEqual(game.state.players.p1!.zones.trash, []);
  assert.deepEqual(game.state.players.p1!.zones.hand, ["spell"]);
  assert.equal(game.state.cardStates.spell!.objectVersion, 1);

  handlers.get("action.move_unit")!.execute!(
    binding("action.move_unit", { destination: "base", count: 1 }),
    createBehaviorContext(game, "p1", "source", null, ["unit"]),
  );
  assert.deepEqual(game.state.battlefields[0]!.units, []);
  assert.deepEqual(game.state.players.p2!.zones.base, ["unit"]);
  assert.equal(game.state.cardStates.unit!.exhausted, true);
});

test("applies controller Bonus Damage and records whether it killed", () => {
  const game = fixture();
  const index = cardIndex();
  const bonusDefinition = structuredClone(index.definitions.get("UNIT")!);
  bonusDefinition.cardCode = "BONUS";
  bonusDefinition.behaviorModel.clauses.push({
    id: "bonus-damage",
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
    effects: [binding("modifier.modify_numeric_value", {
      attribute: "damage",
      operation: "increase",
      amount: 1,
      target: "controller_effect",
      duration: "whileSourceOnBoard",
    })],
    keywords: [],
  });
  index.definitions.set("BONUS", bonusDefinition);
  index.instances.set("bonus", {
    instanceId: "bonus",
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "BONUS",
  });
  game.state.players.p1!.zones.base.push("bonus");
  game.state.cardStates.bonus = {
    exhausted: true,
    damage: 0,
    computedMight: 2,
  };
  const context = createBehaviorContext(game, "p1", "source", null, ["unit"]);

  createPrimitiveHandlers(index).get("action.deal_damage")!.execute!(
    binding("action.deal_damage", { amount: 1, target: "unit" }),
    context,
  );

  assert.ok(game.state.players.p2!.zones.trash.includes("unit"));
  assert.equal(context.effectOutcomes.lastDamageKilled, true);
});

test("derives Deflect as an atomic any-domain Power cost", () => {
  const game = fixture();
  const index = cardIndex();
  const targetDefinition = index.definitions.get("UNIT")!;
  targetDefinition.behaviorModel.clauses.push({
    id: "deflect", sequence: 0, sourceText: "", normalizedText: "",
    abilities: [], triggers: [], conditions: [], selectors: [], choices: [],
    costs: [], timings: [], effects: [],
    keywords: [binding("keyword.deflect", { amount: 1 })],
  });
  game.state.players.p1!.power = { Fury: 1 };
  const cost = targetDeflectCost("p1", ["unit"], index);

  assert.equal(cost, 1);
  assert.ok(
    buildPaymentPlan(
      game,
      "p1",
      index.definitions.get("SPELL")!,
      0,
      index,
      cost,
    ),
  );
  game.state.players.p1!.power = {};
  const runeDefinition = structuredClone(index.definitions.get("UNIT")!);
  runeDefinition.cardCode = "RUNE";
  runeDefinition.behaviorModel.clauses.push({
    id: "recycle", sequence: 0, sourceText: "", normalizedText: "",
    abilities: [
      binding("ability.recycle_for_power", {
        amount: 1,
        resourceType: "power",
      }),
    ],
    triggers: [], conditions: [], selectors: [], choices: [], costs: [],
    timings: [], effects: [], keywords: [],
  });
  index.definitions.set("RUNE", runeDefinition);
  index.instances.set("rune", {
    instanceId: "rune",
    ownerPlayerId: "p1",
    source: "runeDeck",
    cardCode: "RUNE",
  });
  game.state.players.p1!.zones.base.push("rune");
  game.state.cardStates.rune = {
    exhausted: false,
    damage: 0,
    computedMight: null,
  };
  assert.equal(
    buildPaymentPlan(
      game,
      "p1",
      index.definitions.get("SPELL")!,
      0,
      index,
      cost,
    ),
    null,
    "Deflect cannot auto-recycle a rune that was not manually added to the pool",
  );
});

test("adds open battlefields only through a card destination permission", () => {
  const game = fixture();
  const definition = cardIndex().definitions.get("UNIT")!;
  game.state.battlefields[0]!.controllerPlayerId = null;
  game.state.battlefields[0]!.units = [];

  assert.deepEqual(legalUnitDestinationIds(game, "p1", definition), ["base"]);

  definition.behaviorModel.clauses.push({
    id: "destination", sequence: 0, sourceText: "", normalizedText: "",
    abilities: [], triggers: [], conditions: [], selectors: [], choices: [],
    costs: [], timings: [], keywords: [],
    effects: [
      binding("modifier.play_unit_destination", {
        destination: "openBattlefield",
      }),
    ],
  });
  assert.deepEqual(
    legalUnitDestinationIds(game, "p1", definition),
    ["base", "bf"],
  );
});

test("keeps legacy bounded each-unit selectors interactive", () => {
  const game = fixture();
  const handlers = createPrimitiveHandlers(cardIndex());
  const requirement = handlers.get("selector.unit")!.targets!(
    binding("selector.unit", {
      scope: "each",
      minimumCount: 0,
      maximumCount: 2,
      area: "board",
    }),
    createBehaviorContext(game, "p1", "source", null, []),
  );

  assert.equal(requirement.minimum, 0);
  assert.equal(requirement.maximum, 2);
  assert.deepEqual(requirement.legalIds, ["unit"]);
});

test("describes non-board selector source zones", () => {
  const game = fixture();
  const index = cardIndex();
  const requirement = createPrimitiveHandlers(index)
    .get("selector.card")!
    .targets!(
      binding("selector.card", {
        zone: "trash",
        cardType: "Spell",
        minimumCount: 1,
        maximumCount: 1,
      }),
      createBehaviorContext(game, "p1", "source", null, []),
    );

  assert.equal(requirement.sourceZone, "trash");
  assert.deepEqual(requirement.legalIds, ["spell"]);
});

function binding(
  behaviorId: string,
  parameters: Record<string, string | number>,
): BehaviorBinding {
  return { behaviorId, parameters, confidence: "high", order: 0 };
}

function cardIndex(): RuntimeCardIndex {
  const definition = (cardCode: string, type: "Spell" | "Unit") => ({
    cardCode,
    sourceTextHash: "hash",
    behaviorModel: { playTimings: [], clauses: [] },
    card: {
      id: cardCode,
      name: cardCode,
      public_code: `${cardCode}/1`,
      attributes: { energy: 0, might: type === "Unit" ? 2 : null, power: 0 },
      classification: { type, supertype: null, domain: ["Fury"] },
      text: { plain: "" },
      set: { set_id: "TEST", label: "Test" },
      media: {},
      tags: [],
      metadata: {},
    },
  });
  return {
    definitions: new Map([
      ["SPELL", definition("SPELL", "Spell")],
      ["UNIT", definition("UNIT", "Unit")],
    ]) as RuntimeCardIndex["definitions"],
    instances: new Map([
      ["spell", { instanceId: "spell", ownerPlayerId: "p1", source: "mainDeck", cardCode: "SPELL" }],
      ["unit", { instanceId: "unit", ownerPlayerId: "p2", source: "mainDeck", cardCode: "UNIT" }],
    ]),
  };
}

function fixture(): GameDocument {
  const zones = (): GameDocument["state"]["players"][string]["zones"] => ({
    legend: null,
    champion: null,
    mainDeck: [],
    runeDeck: [],
    hand: [],
    trash: [],
    banishment: [],
    base: [],
  });
  const p1 = zones();
  const p2 = zones();
  p1.trash.push("spell");
  return {
    id: "g", matchId: "m", createdAt: "a", updatedAt: "a", stateVersion: 1,
    status: "in_progress", winnerPlayerId: null,
    state: {
      setup: { playerIds: ["p1", "p2"], startingPlayerChooserId: "p1", startingPlayerId: "p1", battlefieldPools: {}, battlefieldChoices: {}, mulligans: {} },
      players: {
        p1: { playerId: "p1", energy: 0, conditionalEnergy: 0, power: {}, zones: p1 },
        p2: { playerId: "p2", energy: 0, conditionalEnergy: 0, power: {}, zones: p2 },
      },
      battlefields: [{ battlefieldId: "bf", cardInstanceId: "bf", selectedByPlayerId: "p1", units: ["unit"] }],
      cardStates: {
        spell: { exhausted: false, damage: 0, computedMight: null, objectVersion: 0 },
        unit: { exhausted: true, damage: 0, computedMight: 2, objectVersion: 0 },
      },
      turn: { turnNumber: 1, activePlayerId: "p1", phase: "action" },
      chain: null, showdown: null, combat: null, modifiers: [], delayedEffects: [],
      effectResolutions: [], pendingChoice: null, queuedTriggerChoices: [],
    },
  };
}
