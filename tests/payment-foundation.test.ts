import assert from "node:assert/strict";
import { test } from "node:test";
import { gameplayActions, performGameplayAction } from "../src/server/game";
import { abilityPoolPaymentPreview, availableAnyPowerAfterBaseCost, buildPaymentPlan, payCardCost } from "../src/server/game/payment";
import { createRuntimeCardIndex } from "../src/server/game/primitive-handlers";
import { paymentCardId, paymentSourceFixture, restrictedSourceId, unrestrictedSourceId } from "./helpers/payment-source-fixture";

test("automatic Power uses a narrower legal source and exposes only the real play mode", async () => {
  const { game, decks, card } = await paymentSourceFixture();
  const plan = buildPaymentPlan(game, "p1", card, 0, createRuntimeCardIndex(decks, game));
  assert.deepEqual(plan?.powerSourceUses.map((source) => source.id), [restrictedSourceId]);
  const actions = gameplayActions(game, "p1", decks).filter((a) => a.sourceCardInstanceId === paymentCardId);
  assert.equal(actions.length, 1);
  const after = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: actions[0]!.id, selectedIds: [], now: "automatic" });
  assert.equal(after.state.cardStates[restrictedSourceId]!.exhausted, true);
  assert.equal(after.state.cardStates[unrestrictedSourceId]!.exhausted, false);
});

test("automatic Energy uses a narrower legal source even when it follows an unrestricted source", async () => {
  const { game, decks, card, restricted, unrestricted } = await paymentSourceFixture();
  card.card.attributes.power = 0;
  for (const source of [restricted, unrestricted]) source.behaviorModel.clauses[0]!.abilities[0]!.parameters.resourceType = "energy";
  const plan = buildPaymentPlan(game, "p1", card, 1, createRuntimeCardIndex(decks, game));
  assert.deepEqual(plan?.energySourceIds, [restrictedSourceId]);
});

test("automatic Power does not recycle a still-ready Rune", async () => {
  const { game, decks, card, unrestricted } = await paymentSourceFixture();
  game.state.cardStates[restrictedSourceId]!.exhausted = true;
  unrestricted.card.classification.type = "Rune";
  unrestricted.behaviorModel.clauses[0]!.abilities = [{ behaviorId: "ability.recycle_for_power", order: 0, confidence: "high", parameters: {} }];
  assert.equal(buildPaymentPlan(game, "p1", card, 0, createRuntimeCardIndex(decks, game)), null);
});

test("Energy looks ahead to exhaust the matching Rune for same-plan Power", async () => {
  const { game, decks, card, unrestricted, restricted } = await paymentSourceFixture();
  for (const source of [unrestricted, restricted]) {
    source.card.classification.type = "Rune";
    source.behaviorModel.clauses[0]!.abilities = [
      { behaviorId: "ability.exhaust_for_resource", order: 0, confidence: "high", parameters: { resourceType: "energy", amount: 1, usage: "unrestricted" } },
      { behaviorId: "ability.recycle_for_power", order: 1, confidence: "high", parameters: {} },
    ];
  }
  unrestricted.card.classification.domain = ["Mind"];
  game.state.players.p1!.zones.base = [unrestrictedSourceId, restrictedSourceId];
  game.state.players.p1!.zones.legend = null;
  const plan = buildPaymentPlan(game, "p1", card, 1, createRuntimeCardIndex(decks, game));
  assert.deepEqual(plan?.energySourceIds, [restrictedSourceId]);
  assert.deepEqual(plan?.powerRuneIds, [restrictedSourceId]);
  payCardCost(game, "p1", card, 1, createRuntimeCardIndex(decks, game));
  assert.ok(game.state.players.p1!.zones.runeDeck.includes(restrictedSourceId));
  assert.equal(game.state.cardStates[unrestrictedSourceId]!.exhausted, false);
});

test("pooled and generated Energy/Power consume card-only before card-or-ability before unrestricted", async () => {
  for (const kind of ["energy", "power"] as const) for (const origin of ["pool", "source"] as const) {
    for (const cost of [1, 2, 3]) {
      const { game, decks, card, restricted, unrestricted } = await paymentSourceFixture();
      card.card.attributes.power = kind === "power" ? cost : 0;
      const narrowId = "p1:narrow";
      if (origin === "pool") {
        game.state.cardStates[restrictedSourceId]!.exhausted = true;
        game.state.cardStates[unrestrictedSourceId]!.exhausted = true;
        if (kind === "energy") {
          game.state.players.p1!.energy = 1;
          game.state.players.p1!.restrictedResources!.energy = { "cardOrAbility:Gear": 1, "card:Gear": 1 };
        } else {
          game.state.players.p1!.power = { Calm: 1 };
          game.state.players.p1!.restrictedResources!.power = { "cardOrAbility:Gear": { Calm: 1 }, "card:Gear": { Calm: 1 } };
        }
      } else {
        for (const source of [restricted, unrestricted]) source.behaviorModel.clauses[0]!.abilities[0]!.parameters.resourceType = kind;
        const narrow = structuredClone(restricted);
        narrow.cardCode = "Narrow synthetic source";
        narrow.behaviorModel.clauses[0]!.abilities[0]!.parameters.usage = "card:Gear";
        decks[0]!.snapshot.cards.push(narrow);
        decks[0]!.instances.push({ instanceId: narrowId, cardCode: narrow.cardCode, ownerPlayerId: "p1", source: "mainDeck" });
        game.state.players.p1!.zones.base.push(narrowId);
        game.state.cardStates[narrowId] = { exhausted: false, damage: 0, computedMight: null };
      }
      const plan = buildPaymentPlan(game, "p1", card, kind === "energy" ? cost : 0, createRuntimeCardIndex(decks, game))!;
      assert.ok(plan);
      if (origin === "source") {
        assert.deepEqual(kind === "energy" ? plan.energySourceIds : plan.powerSourceUses.map((source) => source.id),
          [narrowId, restrictedSourceId, unrestrictedSourceId].slice(0, cost));
      } else if (kind === "energy") {
        assert.deepEqual(plan.restrictedEnergy, cost === 1 ? { "card:Gear": 1 } : { "card:Gear": 1, "cardOrAbility:Gear": 1 });
        assert.equal(plan.pooledEnergy, cost === 3 ? 1 : 0);
      } else {
        assert.deepEqual(plan.restrictedPower, cost === 1 ? { "card:Gear": { Calm: 1 } } : { "card:Gear": { Calm: 1 }, "cardOrAbility:Gear": { Calm: 1 } });
        assert.deepEqual(plan.powerFromPool, cost === 3 ? { Calm: 1 } : {});
      }
    }
  }
});

test("automatic generated Energy overflow retains its restriction and agrees with manual Add", async () => {
  const { game, decks, card, restricted } = await paymentSourceFixture();
  card.card.attributes.power = 0;
  restricted.behaviorModel.clauses[0]!.abilities[0]!.parameters = { resourceType: "energy", amount: 3, usage: "card:Gear" };
  const index = createRuntimeCardIndex(decks, game);
  const automatic = structuredClone(game);
  payCardCost(automatic, "p1", card, 1, index);
  assert.equal(automatic.state.players.p1!.energy, 0);
  assert.deepEqual(automatic.state.players.p1!.restrictedResources!.energy, { "card:Gear": 2 });
  const add = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === restrictedSourceId)!;
  const manual = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: add.id, selectedIds: [], now: "add" });
  payCardCost(manual, "p1", card, 1, createRuntimeCardIndex(decks, manual));
  assert.deepEqual(manual.state.players.p1!.restrictedResources, automatic.state.players.p1!.restrictedResources);
  assert.equal(abilityPoolPaymentPreview(automatic, "p1", card, { energy: 1, power: 0 }, index).canPay, false, "card-only Energy cannot pay an ability");
});

test("already exhausted Runes can auto-recycle while ready equivalent Runes stay ready", async () => {
  const { game, decks, card, unrestricted, restricted } = await paymentSourceFixture();
  for (const source of [unrestricted, restricted]) {
    source.card.classification.type = "Rune";
    source.behaviorModel.clauses[0]!.abilities = [{ behaviorId: "ability.recycle_for_power", order: 0, confidence: "high", parameters: {} }];
  }
  game.state.players.p1!.zones.base = [unrestrictedSourceId, restrictedSourceId];
  game.state.players.p1!.zones.legend = null;
  game.state.cardStates[restrictedSourceId]!.exhausted = true;
  const index = createRuntimeCardIndex(decks, game);
  const plan = buildPaymentPlan(game, "p1", card, 0, index)!;
  assert.deepEqual(plan.powerRuneIds, [restrictedSourceId]);
  payCardCost(game, "p1", card, 0, index);
  assert.equal(game.state.cardStates[unrestrictedSourceId]!.exhausted, false);
  assert.ok(game.state.players.p1!.zones.base.includes(unrestrictedSourceId));
});

test("restricted pooled Power uses the same matcher for any-domain target costs and preview", async () => {
  const { game, decks, card } = await paymentSourceFixture();
  card.card.attributes.power = 0;
  game.state.players.p1!.restrictedResources!.power = { "card:Gear": { Mind: 1 }, "card:Spell": { Mind: 3 } };
  const index = createRuntimeCardIndex(decks, game);
  const base = buildPaymentPlan(game, "p1", card, 0, index)!;
  assert.equal(availableAnyPowerAfterBaseCost(game, "p1", base, { kind: "card", cardType: "Gear" }), 1);
  const paid = buildPaymentPlan(game, "p1", card, 0, index, 1)!;
  assert.deepEqual(paid.restrictedPower, { "card:Gear": { Mind: 1 } });
});

test("equivalent and incomparable source restrictions stay deterministic without extra play modes", async () => {
  for (const usage of ["gearAndGearAbilitiesOnly", "card:Gear|Unit"]) {
    const { game, decks, unrestricted } = await paymentSourceFixture();
    unrestricted.behaviorModel.clauses[0]!.abilities[0]!.parameters.usage = usage;
    const modes = gameplayActions(game, "p1", decks).filter((action) => action.sourceCardInstanceId === paymentCardId);
    assert.equal(modes.length, 1);
    const after = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: modes[0]!.id, selectedIds: [], now: "tie" });
    assert.equal(after.state.cardStates[unrestrictedSourceId]!.exhausted, true, "earlier Base source wins the tie");
    assert.equal(after.state.cardStates[restrictedSourceId]!.exhausted, false);
  }
});

test("generated matching domain Power precedes Rainbow for equal restrictions", async () => {
  const { game, decks, card, restricted, unrestricted } = await paymentSourceFixture();
  unrestricted.behaviorModel.clauses[0]!.abilities[0]!.parameters.usage = "cardOrAbility:Gear";
  restricted.behaviorModel.clauses[0]!.abilities[0]!.parameters.domain = "calm";
  const plan = buildPaymentPlan(game, "p1", card, 0, createRuntimeCardIndex(decks, game))!;
  assert.deepEqual(plan.powerSourceUses.map((source) => source.id), [restrictedSourceId]);
});

test("Spell-only pooled and generated Energy preserves unrestricted Energy", async () => {
  for (const origin of ["pool", "source"]) {
    const { game, decks, card, restricted, unrestricted } = await paymentSourceFixture();
    card.card.classification.type = "Spell";
    card.card.attributes.power = 0;
    for (const source of [restricted, unrestricted]) source.behaviorModel.clauses[0]!.abilities[0]!.parameters.resourceType = "energy";
    restricted.behaviorModel.clauses[0]!.abilities[0]!.parameters.usage = "spellsOnly";
    if (origin === "pool") {
      game.state.players.p1!.conditionalEnergy = 1;
      game.state.players.p1!.energy = 1;
    }
    const plan = buildPaymentPlan(game, "p1", card, 1, createRuntimeCardIndex(decks, game))!;
    assert.equal(plan.pooledEnergy, 0);
    assert.deepEqual(plan.energySourceIds, origin === "pool" ? [] : [restrictedSourceId]);
    assert.equal(plan.conditionalEnergy, origin === "pool" ? 1 : 0);
  }
});
