import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createBehaviorContext,
  createPrimitiveHandlers,
  type BehaviorBinding,
  type GameDocument,
  type RuntimeCardIndex,
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
