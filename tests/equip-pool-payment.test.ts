import assert from "node:assert/strict";
import { test } from "node:test";
import { gameplayActions, performGameplayAction } from "../src/server/game";
import { gameFixture } from "./helpers/game-fixture";
import { createRuntimeCardIndex, definitionForInstance } from "../src/server/game/primitive-handlers";

test("Equip requires pooled resources even when automatic payment sources are ready", async () => {
  const { game, decks, place } = await gameFixture();
  const gear = place("SFD-042", "base");
  const host = place("OGN-044", "base");
  place("OGN-081", "base");
  place("OGN-042", "base");
  const equip = gameplayActions(game, "p1", decks).find((a) => a.sourceCardInstanceId === gear && a.label === "Equip")!;
  assert.equal(equip.enabled, true, "the player can open Equip before adding resources");
  const before = structuredClone(game);
  assert.throws(() => performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: equip.id, selectedIds: [host], now: "unfunded" }), /Rune Pool/);
  assert.deepEqual(game, before, "rejected payment does not mutate the game");
});

test("Equip uses the full activation cost and counts only eligible pooled Energy and Power", async () => {
  const { game, decks, place } = await gameFixture();
  const gear = place("SFD-042", "base");
  const host = place("OGN-044", "base");
  const index = createRuntimeCardIndex(decks, game);
  const definition = definitionForInstance(gear, index);
  const clause = definition.behaviorModel.clauses.find((entry) => entry.abilities.some((a) => a.behaviorId === "ability.equip"))!;
  clause.costs.push({ ...structuredClone(clause.costs[0]!), order: 1, parameters: { amount: 3, resource: "energy" } });
  definition.card.attributes.energy = 99; // Printed play cost is not the Equip cost.
  const player = game.state.players.p1!;
  player.energy = 2;
  player.power = { Mind: 9 };
  player.restrictedResources = { energy: { spellsOnly: 10 }, power: { spellsOnly: { Rainbow: 9 } } };
  const getAction = () => gameplayActions(game, "p1", decks).find((a) => a.sourceCardInstanceId === gear && a.label === "Equip")!;
  assert.deepEqual(getAction().poolPayment, { energy: 3, power: 1, powerDomains: ["Calm"], availableEnergy: 2, availablePower: 0, canPay: false });
  player.restrictedResources.energy["cardOrAbility:Gear"] = 2;
  player.restrictedResources.power["cardOrAbility:Gear"] = { Rainbow: 2 };
  const funded = getAction();
  assert.equal(funded.poolPayment?.canPay, true);
  const next = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: funded.id, selectedIds: [host], now: "combined" });
  assert.equal(next.state.players.p1!.energy, 1);
  assert.equal(next.state.players.p1!.restrictedResources?.energy["cardOrAbility:Gear"], 0);
  assert.equal(next.state.players.p1!.restrictedResources?.energy.spellsOnly, 10);
  assert.equal(next.state.players.p1!.restrictedResources?.power["cardOrAbility:Gear"]?.Rainbow, 1);
  assert.equal(next.state.players.p1!.power.Mind, 9);
});

test("Equip rechecks the pool on submission and reflects changed activation costs including zero", async () => {
  const { game, decks, place } = await gameFixture();
  const gear = place("SFD-042", "base");
  const host = place("OGN-044", "base");
  const player = game.state.players.p1!;
  player.power = { Calm: 1 };
  const getAction = () => gameplayActions(game, "p1", decks).find((a) => a.sourceCardInstanceId === gear && a.label === "Equip")!;
  const staged = getAction();
  assert.equal(staged.poolPayment?.canPay, true);
  player.power = {};
  assert.throws(() => performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: staged.id, selectedIds: [host], now: "spent" }), /Rune Pool/);
  const definition = definitionForInstance(gear, createRuntimeCardIndex(decks, game));
  const clause = definition.behaviorModel.clauses.find((entry) => entry.abilities.some((a) => a.behaviorId === "ability.equip"))!;
  clause.costs[0]!.parameters.amount = 2;
  assert.equal(getAction().poolPayment?.power, 2);
  assert.equal(getAction().poolPayment?.canPay, false);
  clause.costs[0]!.parameters.amount = 0;
  const free = getAction();
  assert.equal(free.poolPayment?.power, 0);
  assert.equal(free.poolPayment?.canPay, true);
  assert.doesNotThrow(() => performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: free.id, selectedIds: [host], now: "free" }));
});

test("Equip projects its complete pool requirement and accepts a manually chosen restricted source", async () => {
  const fixture = await gameFixture();
  let { game } = fixture;
  const { decks, id, place } = fixture;
  const gear = place("SFD-042", "base");
  const host = place("OGN-044", "base");
  const seal = place("OGN-081", "base");
  const rune = place("OGN-042", "base");
  const findEquip = () => gameplayActions(game, "p1", decks).find((a) => a.sourceCardInstanceId === gear && a.label === "Equip")!;
  assert.deepEqual(findEquip().poolPayment, { energy: 0, power: 1, powerDomains: ["Calm"], availableEnergy: 0, availablePower: 0, canPay: false });
  const add = gameplayActions(game, "p1", decks).find((a) => a.sourceCardInstanceId === id("SFD-189") && a.label.startsWith("Add Power"))!;
  game = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: add.id, selectedIds: [], now: "add" });
  assert.equal(findEquip().poolPayment?.canPay, true);
  assert.equal(game.state.chain, null, "Add remains immediate");
  const funded = structuredClone(game);
  const equip = findEquip();
  game = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: equip.id, selectedIds: [host], now: "equip" });
  assert.equal(game.state.players.p1!.restrictedResources?.power["cardOrAbility:Gear"]?.Rainbow, 0);
  assert.equal(game.state.cardStates[seal]!.exhausted, false);
  assert.equal(game.state.cardStates[rune]!.exhausted, false);
  assert.ok(game.state.players.p1!.zones.base.includes(rune));
  assert.equal(game.state.chain?.items.at(-1)?.activatedBehaviorId, "ability.equip");
  assert.equal(funded.state.players.p1!.restrictedResources?.power["cardOrAbility:Gear"]?.Rainbow, 1, "leaving the staged action unsubmitted preserves the pool");
});
