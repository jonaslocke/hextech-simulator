import assert from "node:assert/strict";
import { test } from "node:test";
import { gameplayActions, performGameplayAction, projectGame, type BehaviorBinding } from "../src/server/game";
import { adaptProjectionToBoard } from "../src/features/game-board/board-view-model";
import { paymentCardId, paymentSourceFixture, restrictedSourceId, unrestrictedSourceId } from "./helpers/payment-source-fixture";

test("one material allocation keeps one direct mode and equivalent source instances add no modes", async () => {
  const { game, decks, unrestricted } = await paymentSourceFixture();
  game.state.cardStates[restrictedSourceId]!.exhausted = true;
  const duplicate = "p1:another-unrestricted";
  decks[0]!.instances.push({ instanceId: duplicate, cardCode: unrestricted.cardCode, ownerPlayerId: "p1", source: "mainDeck" });
  game.state.cardStates[duplicate] = { exhausted: false, damage: 0, computedMight: null };
  game.state.players.p1!.zones.base.push(duplicate);
  const actions = gameplayActions(game, "p1", decks).filter((a) => a.sourceCardInstanceId === paymentCardId);
  assert.equal(actions.length, 1);
  assert.equal(actions[0]!.label, "Play Payment card");
  const after = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: actions[0]!.id, selectedIds: [], now: "single" });
  assert.equal(after.state.cardStates[unrestrictedSourceId]!.exhausted, true);
  assert.equal(after.state.cardStates[duplicate]!.exhausted, false);
});

test("already pooled eligible Power keeps pool priority and creates no source choice", async () => {
  const { game, decks } = await paymentSourceFixture();
  game.state.players.p1!.power = { Rainbow: 1 };
  game.state.players.p1!.restrictedResources!.power = { "cardOrAbility:Gear": { Rainbow: 1 } };
  const actions = gameplayActions(game, "p1", decks).filter((a) => a.sourceCardInstanceId === paymentCardId);
  assert.equal(actions.length, 1);
  const after = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: actions[0]!.id, selectedIds: [], now: "pooled" });
  assert.equal(after.state.players.p1!.power.Rainbow, 1);
  assert.equal(after.state.players.p1!.restrictedResources!.power["cardOrAbility:Gear"]!.Rainbow, 0);
  assert.equal(after.state.cardStates[unrestrictedSourceId]!.exhausted, false);
  assert.equal(after.state.cardStates[restrictedSourceId]!.exhausted, false);
});

test("automatic payment rejects stale, unavailable and forged actions through normal regeneration", async () => {
  const { game, decks } = await paymentSourceFixture();
  const action = gameplayActions(game, "p1", decks).find((a) => a.sourceCardInstanceId === paymentCardId)!;
  const submit = (state = game, actionId = action.id) => performGameplayAction({ game: state, decks, actorPlayerId: "p1", actionId, selectedIds: [], now: "stale" });
  const stale = structuredClone(game);
  stale.stateVersion++;
  assert.throws(() => submit(stale), /not legal/);
  const unavailable = structuredClone(game);
  unavailable.state.cardStates[restrictedSourceId]!.exhausted = true;
  unavailable.state.cardStates[unrestrictedSourceId]!.exhausted = true;
  assert.throws(() => submit(unavailable), /not legal/);
  assert.throws(() => submit(game, action.id + "forged"), /not legal/);
  assert.equal(game.state.cardStates[unrestrictedSourceId]!.exhausted, false);
});

test("optional costs remain real modes without automatic source alternatives", async () => {
  const { game, decks, card, unrestricted, restricted } = await paymentSourceFixture();
  const binding = (behaviorId: string, parameters: BehaviorBinding["parameters"]): BehaviorBinding => ({ behaviorId, parameters, order: 0, confidence: "high" });
  card.behaviorModel.clauses = [{
    id: "optional", sequence: 0, sourceText: "", normalizedText: "", abilities: [], triggers: [], conditions: [], choices: [], timings: [], keywords: [], effects: [],
    selectors: [binding("selector.source", { selectionKey: "extra", selectionPurpose: "optionalCost", minimumCount: 0, maximumCount: 1 })],
    costs: [binding("cost.pay", { selectionKey: "extra", optional: true, amount: 1, resource: "rune", domain: "calm" })],
  }];
  for (const [id, definition] of [["p1:unrestricted-2", unrestricted], ["p1:restricted-2", restricted]] as const) {
    decks[0]!.instances.push({ instanceId: id, cardCode: definition.cardCode, ownerPlayerId: "p1", source: "mainDeck" });
    game.state.cardStates[id] = { exhausted: false, damage: 0, computedMight: null };
    game.state.players.p1!.zones.base.push(id);
  }
  const modes = gameplayActions(game, "p1", decks).filter((a) => a.sourceCardInstanceId === paymentCardId);
  assert.equal(modes.length, 2, "normal and optional-cost modes only");
  const optional = modes.filter((a) => a.label.includes("Calm Power"));
  assert.equal(optional.length, 1);
  assert.equal(new Set(optional.map((a) => a.label)).size, 1);
  for (const mode of optional) {
    const after = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: mode.id, selectedIds: [], now: "optional" });
    const used = [unrestrictedSourceId, restrictedSourceId, "p1:unrestricted-2", "p1:restricted-2"].filter((id) => after.state.cardStates[id]!.exhausted);
    assert.equal(used.length, 2);
    assert.ok(used.every((id) => id.includes(":restricted")));
  }
});

test("automatic sources never become extra modes in the existing projection", async () => {
  const { game, decks } = await paymentSourceFixture();
  const actions = gameplayActions(game, "p1", decks).filter((a) => a.sourceCardInstanceId === paymentCardId);
  assert.equal(actions.length, 1);
  assert.ok(actions.every((a) => a.enabled));
  assert.equal(new Set(actions.map((a) => a.id)).size, 1);
  assert.equal(actions[0]!.label, "Play Payment card");
  const board = adaptProjectionToBoard(projectGame({ game, decks, viewerPlayerId: "p1" }));
  assert.deepEqual(board.projection.players.p1!.availablePaymentModes[paymentCardId]?.map((m) => m.label), actions.map((a) => a.label));
});

test("restriction priority preserves a shared Energy source for an optional cost", async () => {
  const { game, decks, card, unrestricted } = await paymentSourceFixture();
  unrestricted.behaviorModel.clauses[0]!.abilities.push({ behaviorId: "ability.exhaust_for_resource", order: 1, confidence: "high",
    parameters: { resourceType: "energy", amount: 1, usage: "unrestricted" } });
  card.behaviorModel.clauses = [{
    id: "optional-energy", sequence: 0, sourceText: "", normalizedText: "", abilities: [], triggers: [], conditions: [], choices: [], timings: [], keywords: [], effects: [],
    selectors: [{ behaviorId: "selector.source", order: 0, confidence: "high", parameters: { selectionKey: "energy", selectionPurpose: "optionalCost", minimumCount: 0, maximumCount: 1 } }],
    costs: [{ behaviorId: "cost.pay", order: 0, confidence: "high", parameters: { selectionKey: "energy", optional: true, amount: 1, resource: "energy" } }],
  }];
  const modes = gameplayActions(game, "p1", decks).filter((a) => a.sourceCardInstanceId === paymentCardId && a.label.includes(" + 1 Energy"));
  assert.equal(modes.length, 1);
  assert.equal(modes[0]!.enabled, true);
  const after = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: modes[0]!.id, selectedIds: [], now: "combined" });
  assert.equal(after.state.cardStates[unrestrictedSourceId]!.exhausted, true);
  assert.equal(after.state.cardStates[restrictedSourceId]!.exhausted, true);
});

test("combined resource actions project and produce the empowered Energy amount", async () => {
  const { game, decks, unrestricted } = await paymentSourceFixture();
  unrestricted.behaviorModel.clauses[0]!.abilities = [
    { behaviorId: "ability.exhaust_for_resource", order: 0, confidence: "high",
      parameters: { resourceType: "energy", amount: 1, empoweredAmount: 2, usage: "unrestricted" } },
    { behaviorId: "ability.recycle_for_power", order: 1, confidence: "high",
      parameters: { amount: 1, resourceType: "power" } },
  ];
  game.state.cardStates[unrestrictedSourceId]!.empowered = true;
  const combined = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === unrestrictedSourceId && action.label === "Add 2 Energy and Power",
  );
  assert.ok(combined);
  assert.deepEqual(combined.presentation.resourceOutput, {
    energy: 2,
    power: 1,
    powerDomains: ["Calm"],
  });
  const next = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: combined.id, selectedIds: [], now: "combined-empowered-resource" });
  assert.equal(next.state.players.p1!.energy, 2);
  assert.ok(next.state.players.p1!.zones.runeDeck.includes(unrestrictedSourceId));
});

test("automatic payment preserves Unit destinations and target-specific Deflect requirements", async () => {
  const { game, decks, card, restricted } = await paymentSourceFixture();
  card.card.classification.type = "Unit";
  restricted.behaviorModel.clauses[0]!.abilities[0]!.parameters.usage = "card:Unit";
  const field = decks[0]!.instances.find((instance) => instance.source === "battlefield")!;
  game.state.battlefields = [{ battlefieldId: "destination", cardInstanceId: field.instanceId, selectedByPlayerId: "p1", controllerPlayerId: "p1", units: [] }];
  card.behaviorModel.clauses = [{
    id: "target", sequence: 0, sourceText: "", normalizedText: "", abilities: [], triggers: [], conditions: [], choices: [], costs: [], timings: [], keywords: [], effects: [],
    selectors: [{ behaviorId: "selector.unit", order: 0, confidence: "high", parameters: { controller: "opponent", scope: "board", minimumCount: 1, maximumCount: 1, selectionKey: "recipient" } }],
  }];
  const targetId = "p2:target";
  decks[1]!.instances.push({ instanceId: targetId, cardCode: card.cardCode, ownerPlayerId: "p2", source: "mainDeck" });
  game.state.cardStates[targetId] = { exhausted: false, damage: 0, computedMight: 1 };
  game.state.players.p2!.zones.base = [targetId];
  game.state.players.p1!.power = { Mind: 1 };
  card.behaviorModel.clauses[0]!.keywords.push({ behaviorId: "keyword.deflect", order: 0, confidence: "high", parameters: { amount: 1 } });
  const modes = gameplayActions(game, "p1", decks).filter((a) => a.sourceCardInstanceId === paymentCardId);
  assert.equal(modes.length, 2);
  assert.deepEqual(new Set(modes.map((a) => a.presentation.boardLocation?.kind)), new Set(["base", "battlefield"]));
  assert.ok(modes.every((mode) => mode.targets.some((target) => target.legalIds.includes(targetId))));
  for (const mode of modes) {
    const after = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: mode.id, selectedIds: [targetId], now: "destination" });
    const used = restrictedSourceId;
    assert.equal(after.state.cardStates[used]!.exhausted, true);
    assert.equal(after.state.players.p1!.power.Mind, 0, "target-specific Deflect remains part of the selected payment");
  }
});
