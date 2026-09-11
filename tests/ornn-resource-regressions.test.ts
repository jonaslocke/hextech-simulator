import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { gameplayActions, performGameplayAction } from "../src/server/game";
import { buildAbilityPaymentPlan, buildPaymentPlan, payAbilityCost, payCardCost } from "../src/server/game/payment";
import { cardSchema } from "../src/server/catalog";
import { createRuntimeCardIndex, definitionForInstance } from "../src/server/game/primitive-handlers";
import { applyStartOfTurn } from "../src/server/game/turns";
import { ornnGameFixture } from "./helpers/ornn-game-fixture";

test("canonical Seal manual Add produces ordinary Calm beside Ornn's restricted Power (429.1)", async () => {
  const fixture = await ornnGameFixture();
  let { game } = fixture;
  const { decks, id, place } = fixture;
  const seal = place("OGN-081", "base");
  for (const source of [id("SFD-189"), seal]) {
    const action = gameplayActions(game, "p1", decks).find((candidate) => candidate.sourceCardInstanceId === source && candidate.label.startsWith("Add Power"));
    assert.ok(action?.enabled);
    game = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [], now: "add" });
    assert.equal(game.state.cardStates[source]!.exhausted, true);
    assert.equal(gameplayActions(game, "p1", decks).find((candidate) => candidate.sourceCardInstanceId === source)?.enabled, false);
  }
  assert.deepEqual(game.state.players.p1!.power, { Calm: 1 });
  assert.deepEqual(game.state.players.p1!.restrictedResources, { energy: {}, power: { "cardOrAbility:Gear": { Rainbow: 1 } } });
  const index = createRuntimeCardIndex(decks, game);
  const unit = definitionForInstance(id("OGN-044"), index);
  const unitPlan = buildAbilityPaymentPlan(game, "p1", unit, { energy: 0, power: 1 }, index);
  assert.ok(unitPlan, "ordinary Calm pays a non-Gear ability");
  assert.deepEqual(unitPlan.powerFromPool, { Calm: 1 });
  assert.deepEqual(unitPlan.restrictedPower, {});
  payAbilityCost(game, "p1", unit, { energy: 0, power: 1 }, index);
  assert.equal(buildAbilityPaymentPlan(game, "p1", unit, { energy: 0, power: 1 }, index), null, "Gear restriction remains after ordinary Power is spent");
  assert.ok(buildAbilityPaymentPlan(game, "p1", definitionForInstance(id("SFD-042"), index), { energy: 0, power: 1 }, index));
});

test("Awaken readies the active Legend and attachments before Beginning (315.1.b, 415.3.a)", async () => {
  const { game, decks, id, place } = await ornnGameFixture();
  const host = place("OGN-044", "base");
  const gear = place("SFD-042", "base");
  const rune = place("OGN-042", "base");
  const enemy = place("OGN-044", "base", "p2");
  game.state.players.p1!.zones.base = [rune];
  game.state.battlefields = [{ battlefieldId: "field", cardInstanceId: id("SFD-221"), selectedByPlayerId: "p1", controllerPlayerId: "p2", contestedByPlayerId: null, units: [host], attachedCardInstanceIds: [gear] }];
  game.state.cardStates[gear]!.attachedToCardInstanceId = host;
  const active = [id("SFD-189"), host, gear, rune];
  const inactive = [id("SFD-189", "p2"), enemy, id("OGN-044", "p1", 1)];
  for (const cardId of [...active, ...inactive]) game.state.cardStates[cardId]!.exhausted = true;
  game.state.turn!.phase = "awaken";
  applyStartOfTurn(game, decks);
  for (const cardId of active) assert.equal(game.state.cardStates[cardId]!.exhausted, false, cardId);
  for (const cardId of inactive) assert.equal(game.state.cardStates[cardId]!.exhausted, true, cardId);
});

test("Seal automatic payment exhausts the same source and leaves no restricted or lost Power", async () => {
  const { game, decks, id, place } = await ornnGameFixture();
  const seal = place("OGN-081", "base");
  game.state.cardStates[id("SFD-189")]!.exhausted = true;
  const index = createRuntimeCardIndex(decks, game);
  const unit = definitionForInstance(id("OGN-044"), index);
  const plan = buildAbilityPaymentPlan(game, "p1", unit, { energy: 0, power: 1 }, index);
  assert.ok(plan);
  assert.deepEqual(plan.powerSourceUses, [{ id: seal, amount: 1, domain: "Calm", usage: "unrestricted" }]);
  payAbilityCost(game, "p1", unit, { energy: 0, power: 1 }, index);
  assert.equal(game.state.cardStates[seal]!.exhausted, true);
  assert.deepEqual(game.state.players.p1!.power, {});
  assert.deepEqual(game.state.players.p1!.restrictedResources, undefined);
});

test("accepted Kai'Sa spells-only Add remains restricted in manual and automatic payment and readies at Awaken", async () => {
  const { game: initial, decks, id } = await ornnGameFixture();
  const source = cardSchema.array().parse(JSON.parse(await readFile("data/sets/ogn.json", "utf8")))
    .find((card) => card.public_code === "OGN-247/298");
  assert.ok(source);
  const legend = decks[0]!.snapshot.cards.find((card) => card.cardCode === "SFD-189")!;
  legend.card = source;
  // The accepted OGN-247 canonical binding (read from canonicalCards), not a
  // new interpretation of its resource ability. Preserve this shared consumer.
  legend.behaviorModel.clauses[0]!.abilities[0]!.parameters.usage = "spellsOnly";
  const legendId = id("SFD-189");
  const index = createRuntimeCardIndex(decks, initial);
  const spell = definitionForInstance(id("OGN-045"), index);
  const gear = definitionForInstance(id("SFD-042"), index);
  const auto = buildPaymentPlan(initial, "p1", spell, 0, index);
  assert.ok(auto);
  assert.deepEqual(auto.powerSourceUses, [{ id: legendId, amount: 1, domain: "Rainbow", usage: "spellsOnly" }]);
  assert.equal(buildAbilityPaymentPlan(initial, "p1", gear, { energy: 0, power: 1 }, index), null);
  const autoPaid = structuredClone(initial);
  payCardCost(autoPaid, "p1", spell, 0, index);
  assert.equal(autoPaid.state.cardStates[legendId]!.exhausted, true);
  assert.deepEqual(autoPaid.state.players.p1!.power, {});
  const add = gameplayActions(initial, "p1", decks).find((action) => action.sourceCardInstanceId === legendId);
  assert.ok(add?.enabled);
  const manual = performGameplayAction({ game: initial, decks, actorPlayerId: "p1", actionId: add.id, selectedIds: [], now: "kaisa-add" });
  assert.deepEqual(manual.state.players.p1!.power, {});
  assert.deepEqual(manual.state.players.p1!.restrictedResources, { energy: {}, power: { spellsOnly: { Rainbow: 1 } } });
  assert.equal(gameplayActions(manual, "p1", decks).find((action) => action.sourceCardInstanceId === legendId)?.enabled, false);
  assert.ok(buildPaymentPlan(manual, "p1", spell, 0, index));
  assert.equal(buildAbilityPaymentPlan(manual, "p1", gear, { energy: 0, power: 1 }, index), null);
  manual.state.turn!.phase = "awaken";
  applyStartOfTurn(manual, decks);
  assert.equal(manual.state.cardStates[legendId]!.exhausted, false);
  assert.ok(gameplayActions(manual, "p1", decks).find((action) => action.sourceCardInstanceId === legendId)?.enabled);
});
