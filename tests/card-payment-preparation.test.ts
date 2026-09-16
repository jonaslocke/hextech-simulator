import assert from "node:assert/strict";
import { test } from "node:test";
import { gameplayActions, performGameplayAction, projectGame } from "../src/server/game";
import { buildPaymentPlan } from "../src/server/game/payment";
import { createRuntimeCardIndex } from "../src/server/game/primitive-handlers";
import { createCardPaymentPreparation, rebindStagedSelection, stagedTargetsAreCurrent, type BoardTargetSelection } from "../src/features/game-board/interactions/use-board-target-selection";
import { combineTargetRequirements } from "../src/features/game-board/model";
import { paymentCardId, restrictedSourceId, unrestrictedSourceId } from "./helpers/payment-source-fixture";

import { preparationFixture } from "./helpers/card-payment-preparation-fixture";

const play = (f: Awaited<ReturnType<typeof preparationFixture>>) => gameplayActions(f.game, "p1", f.decks).find((a) => a.sourceCardInstanceId === paymentCardId)!;
const addPower = (f: Awaited<ReturnType<typeof preparationFixture>>) => {
  const action = gameplayActions(f.game, "p1", f.decks).find((a) => a.sourceCardInstanceId === unrestrictedSourceId && a.label.startsWith("Add Power"))!;
  f.game = performGameplayAction({ game: f.game, decks: f.decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [], now: "add" });
};

test("unaffordable resource capacity does not enumerate ready Rune combinations", async () => {
  const f = await preparationFixture(0, 7, 6);
  const before = structuredClone(f.game);
  const start = performance.now();
  assert.equal(play(f).enabled, false);
  const elapsed = performance.now() - start;
  assert.deepEqual(f.game, before);
  // A generous budget for slow CI; the regression took over eight seconds
  // with just six Runes. Fixture construction is outside the measurement.
  assert.ok(elapsed < 1000, `action projection took ${elapsed.toFixed(0)} ms`);
});

test("large Rune pools reject Energy and domain shortages while retaining manual preparation", async () => {
  const f = await preparationFixture(13, 0, 12);
  const before = structuredClone(f.game);
  const start = performance.now();
  assert.equal(play(f).enabled, false);
  f.card.card.attributes.energy = 0;
  f.card.card.attributes.power = 1;
  f.card.card.classification.domain = ["Mind"];
  assert.equal(play(f).enabled, false);
  f.card.card.classification.domain = ["Calm"];
  const preparable = play(f);
  assert.equal(preparable.enabled, true);
  assert.equal(preparable.poolPayment?.canPay, false);
  assert.deepEqual(f.game, before);
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 1000, `action projections took ${elapsed.toFixed(0)} ms`);
});

test("unrelated card-type cost modifiers do not enumerate impossible Rune preparation", async () => {
  const f = await preparationFixture(7, 0, 6);
  f.card.card.classification.type = "Unit";
  f.restricted.behaviorModel.clauses[0]!.effects = [
    { behaviorId: "modifier.modify_numeric_value", order: 0, confidence: "high",
      parameters: { attribute: "energyCost", operation: "reduce", amount: 1,
        target: "controller_card", cardType: "Gear", duration: "whileSourceOnBoard" } },
    { behaviorId: "modifier.modify_numeric_value", order: 1, confidence: "high",
      parameters: { attribute: "energyCost", operation: "increase", amount: 1,
        target: "opponent_spell", duration: "whileSourceOnBoard" } },
  ];
  const before = structuredClone(f.game);
  const start = performance.now();
  assert.equal(play(f).enabled, false);
  assert.deepEqual(f.game, before);
  const elapsed = performance.now() - start;
  assert.ok(elapsed < 1000, `action projection took ${elapsed.toFixed(0)} ms`);
});

test("opponent cost modifiers invariant under Add prune impossible Rune preparation", async () => {
  const f = await preparationFixture(7, 0, 6);
  f.card.card.classification.type = "Spell";
  f.restricted.behaviorModel.clauses[0]!.abilities = [];
  f.restricted.behaviorModel.clauses[0]!.effects = [{
    behaviorId: "modifier.modify_numeric_value", order: 0, confidence: "high",
    parameters: { attribute: "energyCost", operation: "increase", amount: 1,
      target: "opponent_spell", duration: "whileSourceOnBoard" },
  }];
  f.game.state.players.p1!.zones.legend = null;
  f.game.state.players.p2!.zones.base.push(restrictedSourceId);
  const sourceInstance = f.decks.flatMap((deck) => deck.instances)
    .find((instance) => instance.instanceId === restrictedSourceId)!;
  sourceInstance.ownerPlayerId = "p2";
  const before = structuredClone(f.game);
  const start = performance.now();
  const action = play(f);
  const elapsed = performance.now() - start;
  assert.equal(action.costPreview?.energy, 8);
  assert.equal(action.enabled, false);
  assert.deepEqual(f.game, before);
  assert.ok(elapsed < 1000, `action projection took ${elapsed.toFixed(0)} ms`);
});

test("capacity pruning preserves preparation that removes a continuous cost increase", async () => {
  const f = await preparationFixture(1, 0, 1);
  f.unrestricted.behaviorModel.clauses[0]!.effects = [{
    behaviorId: "modifier.modify_numeric_value", order: 0, confidence: "high",
    parameters: { attribute: "energyCost", operation: "increase", amount: 2,
      target: "controller_card", duration: "whileSourceOnBoard" },
  }];
  const before = structuredClone(f.game);
  const action = play(f);
  assert.equal(action.costPreview?.energy, 3);
  assert.equal(action.poolPayment?.canPay, false);
  assert.equal(action.enabled, true, "combined Add removes the increase and leaves enough Energy");
  assert.deepEqual(f.game, before);
});

test("capacity pruning retains relevant Spell and additional-type cost changes", async () => {
  for (const cardType of ["Spell", "Unit"] as const) {
    const f = await preparationFixture(1, 0, 1);
    f.card.card.classification.type = cardType;
    f.card.behaviorModel.clauses = [{
      ...structuredClone(f.unrestricted.behaviorModel.clauses[0]!),
      abilities: [],
      keywords: cardType === "Unit" ? [{ behaviorId: "type.additional", order: 0, confidence: "high", parameters: { type: "Gear" } }] : [],
    }];
    f.unrestricted.behaviorModel.clauses[0]!.effects = [{
      behaviorId: "modifier.modify_numeric_value", order: 0, confidence: "high",
      parameters: { attribute: "energyCost", operation: "increase", amount: 2,
        target: cardType === "Spell" ? "controller_spell" : "controller_card",
        ...(cardType === "Unit" ? { cardType: "Gear" } : {}), duration: "whileSourceOnBoard" },
    }];
    const before = structuredClone(f.game);
    const action = play(f);
    assert.equal(action.costPreview?.energy, 3);
    assert.equal(action.poolPayment?.canPay, false);
    assert.equal(action.enabled, true, "recycling the source removes a relevant increase");
    assert.deepEqual(f.game, before);
  }
});

test("capacity is only an upper bound and cannot enable incompatible resource alternatives", async () => {
  const f = await preparationFixture(1, 1, 1);
  f.unrestricted.behaviorModel.clauses[0]!.abilities[1] = {
    behaviorId: "ability.exhaust_for_resource", order: 1, confidence: "high",
    parameters: { resourceType: "power", amount: 1, domain: "sourceDomain", usage: "unrestricted" },
  };
  const before = structuredClone(f.game);
  assert.equal(play(f).enabled, false, "the only source cannot exhaust twice");
  assert.deepEqual(f.game, before);
});

test("power-only ready Rune payment is stageable without automatic mutation or execution", async () => {
  const f = await preparationFixture();
  const before = structuredClone(f.game);
  assert.equal(buildPaymentPlan(f.game, "p1", f.card, 0, createRuntimeCardIndex(f.decks, f.game)), null);
  const action = play(f);
  assert.equal(action.enabled, true);
  assert.equal(action.poolPayment?.canPay, false);
  assert.deepEqual(action.targets, []);
  const staged = createCardPaymentPreparation(action)!;
  assert.equal(staged.targetKind, "payment");
  assert.deepEqual(staged.requirement.requirements, []);
  assert.deepEqual(staged.selectedTargetIds, []);
  assert.throws(() => performGameplayAction({ game: f.game, decks: f.decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [], now: "unfunded" }), /pay|resource/i);
  assert.deepEqual(f.game, before);
});

test("safe same-plan Energy and Power remains direct and executes normally", async () => {
  const f = await preparationFixture(1, 1);
  const action = play(f);
  assert.equal(action.enabled, true);
  assert.equal(action.poolPayment?.canPay, true);
  assert.equal(createCardPaymentPreparation(action), null);
  const after = performGameplayAction({ game: f.game, decks: f.decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [], now: "play" });
  assert.ok(after.state.players.p1!.zones.base.includes(paymentCardId));
  assert.ok(after.state.players.p1!.zones.runeDeck.includes(unrestrictedSourceId));
});

test("zero-target manual Add reprojects readiness and rejects the stale play before confirming once", async () => {
  const f = await preparationFixture();
  const before = play(f);
  addPower(f);
  const projection = projectGame({ game: f.game, decks: f.decks, viewerPlayerId: "p1" });
  const action = projection.actions.find((a) => a.sourceCardInstanceId === paymentCardId)!;
  assert.equal(action.poolPayment?.canPay, true);
  assert.equal(action.poolPayment?.availablePower, 1);
  assert.deepEqual(action.targets, []);
  assert.notEqual(action.id, before.id);
  assert.throws(() => performGameplayAction({ game: f.game, decks: f.decks, actorPlayerId: "p1", actionId: before.id, selectedIds: [], now: "stale" }), /not legal/);
  const after = performGameplayAction({ game: f.game, decks: f.decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [], now: "confirm" });
  assert.equal(after.state.players.p1!.power.Calm, 0);
  assert.equal(after.state.players.p1!.zones.base.filter((id) => id === paymentCardId).length, 1);
  assert.throws(() => performGameplayAction({ game: after, decks: f.decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [], now: "duplicate" }), /not legal/);
});

test("manual remainder composes with safe automatic Energy and Power without partial payment", async () => {
  const f = await preparationFixture(1, 2, 2);
  const before = structuredClone(f.game);
  assert.equal(play(f).poolPayment?.canPay, false);
  assert.equal(play(f).enabled, true);
  assert.deepEqual(f.game, before);
  addPower(f);
  assert.equal(f.game.state.players.p1!.energy, 0);
  const action = play(f);
  assert.equal(action.poolPayment?.canPay, true, "complete printed cost need not be pooled");
  const after = performGameplayAction({ game: f.game, decks: f.decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [], now: "confirm" });
  assert.equal(after.state.players.p1!.energy, 0);
  assert.equal(after.state.players.p1!.power.Calm, 0);
  assert.ok(after.state.players.p1!.zones.runeDeck.includes("p1:rune-1"));
});

test("truly unpayable cards remain disabled, including insufficient or incompatible manual resources", async () => {
  for (const [energy, power] of [[0, 2], [3, 0], [0, 1]]) {
    const f = await preparationFixture(energy, power);
    if (energy === 0 && power === 1) f.unrestricted.card.classification.domain = ["Mind"];
    assert.equal(play(f).enabled, false);
    assert.equal(createCardPaymentPreparation(play(f)), null);
    assert.equal(play(f).disabledReason, "Card costs cannot be paid.");
  }
});

test("manual resource feasibility respects Energy and Power restrictions", async () => {
  for (const kind of ["energy", "power"]) {
    const f = await preparationFixture(kind === "energy" ? 1 : 0, kind === "power" ? 1 : 0);
    f.unrestricted.behaviorModel.clauses[0]!.abilities = [{ behaviorId: "ability.exhaust_for_resource", order: 0, confidence: "high",
      parameters: { resourceType: kind, amount: 1, usage: "card:Spell", domain: "rainbow" } }];
    assert.equal(play(f).enabled, false, "Spell resources cannot prepare a Gear payment");
  }
});

test("optional cost modes independently stage preparation without duplicating normal play", async () => {
  const f = await preparationFixture(0, 0);
  f.card.behaviorModel.clauses = [{ id: "optional", sequence: 0, sourceText: "", normalizedText: "", abilities: [], triggers: [], conditions: [], choices: [], timings: [], keywords: [], effects: [],
    selectors: [{ behaviorId: "selector.source", order: 0, confidence: "high", parameters: { selectionKey: "extra", selectionPurpose: "optionalCost", minimumCount: 0, maximumCount: 1 } }],
    costs: [{ behaviorId: "cost.pay", order: 0, confidence: "high", parameters: { selectionKey: "extra", optional: true, amount: 1, resource: "rune", domain: "calm" } }],
  }];
  const modes = gameplayActions(f.game, "p1", f.decks).filter((a) => a.sourceCardInstanceId === paymentCardId);
  assert.equal(modes.length, 2);
  assert.ok(modes.every((a) => a.enabled));
  assert.equal(modes.filter((a) => a.poolPayment?.canPay).length, 1);
  addPower(f);
  const optional = gameplayActions(f.game, "p1", f.decks).find((a) => a.sourceCardInstanceId === paymentCardId && a.label.includes("Calm Power"))!;
  assert.equal(optional.poolPayment?.canPay, true);
  assert.equal(optional.costPreview?.effectivePower, 1, "Deflect display includes the chosen optional Power cost");
  assert.equal(optional.costPreview?.availableAnyPower, 0, "optional cost reserves Power before Deflect readiness");
});

test("chosen Unit destination rebinds across preparation without changing the mode", async () => {
  const f = await preparationFixture();
  f.card.card.classification.type = "Unit";
  const field = f.decks[0]!.instances.find((instance) => instance.source === "battlefield")!;
  f.game.state.battlefields = [{ battlefieldId: "destination", cardInstanceId: field.instanceId, selectedByPlayerId: "p1", controllerPlayerId: "p1", units: [] }];
  const modes = gameplayActions(f.game, "p1", f.decks).filter((a) => a.sourceCardInstanceId === paymentCardId);
  assert.equal(modes.length, 2);
  const chosen = modes.find((a) => a.presentation.boardLocation?.kind === "battlefield")!;
  const staged: BoardTargetSelection = { actionId: chosen.id, targetKind: "payment", purpose: "play", preparingPayment: true,
    legalTargetIds: [], selectedTargetIds: [], minTargets: 0, maxTargets: 0, requirement: { requirements: [], legalIds: [], minimum: 0, maximum: 0 } };
  addPower(f);
  const current = gameplayActions(f.game, "p1", f.decks).find((a) => a.sourceCardInstanceId === paymentCardId && a.presentation.boardLocation?.kind === "battlefield")!;
  const rebound = rebindStagedSelection(staged, current);
  assert.equal(rebound.actionId, current.id);
  assert.equal(stagedTargetsAreCurrent(rebound, current), true);
  const after = performGameplayAction({ game: f.game, decks: f.decks, actorPlayerId: "p1", actionId: rebound.actionId, selectedIds: [], now: "destination" });
  assert.ok(after.state.battlefields[0]!.units.includes(paymentCardId));
});

test("target selection and Deflect survive manual preparation and revalidate current targets", async () => {
  const f = await preparationFixture(0, 1, 2);
  const targetId = "p2:synthetic-target";
  const target = structuredClone(f.card);
  target.cardCode = "Synthetic target";
  target.card.classification.type = "Unit";
  target.behaviorModel.clauses = [{ id: "deflect", sequence: 0, sourceText: "", normalizedText: "", abilities: [], triggers: [], conditions: [], choices: [], costs: [], timings: [], effects: [], selectors: [],
    keywords: [{ behaviorId: "keyword.deflect", order: 0, confidence: "high", parameters: { amount: 1 } }] }];
  f.decks[1]!.snapshot.cards.push(target);
  f.decks[1]!.instances.push({ instanceId: targetId, cardCode: target.cardCode, ownerPlayerId: "p2", source: "mainDeck" });
  f.game.state.cardStates[targetId] = { exhausted: false, damage: 0, computedMight: 1 };
  f.game.state.players.p2!.zones.base = [targetId];
  f.card.behaviorModel.clauses = [{ ...structuredClone(target.behaviorModel.clauses[0]!), keywords: [],
    selectors: [{ behaviorId: "selector.unit", order: 0, confidence: "high", parameters: { controller: "opponent", scope: "board", selectionKey: "target", minimumCount: 1, maximumCount: 1 } }] }];
  const action = play(f);
  const requirement = combineTargetRequirements(action, "card")!;
  const staged: BoardTargetSelection = { actionId: action.id, targetKind: "card", purpose: "play", preparingPayment: true,
    requirement, legalTargetIds: requirement.legalIds, selectedTargetIds: [targetId], minTargets: 1, maxTargets: 1 };
  addPower(f);
  const first = play(f);
  assert.equal(first.poolPayment?.canPay, true);
  assert.equal(first.costPreview?.availableAnyPower, 0);
  assert.throws(() => performGameplayAction({ game: f.game, decks: f.decks, actorPlayerId: "p1", actionId: first.id, selectedIds: [targetId], now: "deflect-unfunded" }), /cost|pay/i);
  const secondAdd = gameplayActions(f.game, "p1", f.decks).find((a) => a.sourceCardInstanceId === "p1:rune-1" && a.label.startsWith("Add Power"))!;
  f.game = performGameplayAction({ game: f.game, decks: f.decks, actorPlayerId: "p1", actionId: secondAdd.id, selectedIds: [], now: "add-target-power" });
  const current = play(f);
  const rebound = rebindStagedSelection(staged, current);
  assert.deepEqual(rebound.selectedTargetIds, [targetId]);
  assert.equal(current.costPreview?.availableAnyPower, 1);
  assert.equal(stagedTargetsAreCurrent(rebound, current), true);
  const invalid = structuredClone(current);
  invalid.targets[0]!.legalIds = [];
  assert.equal(stagedTargetsAreCurrent(staged, invalid), false);
  assert.deepEqual(rebindStagedSelection(staged, invalid).selectedTargetIds, []);
  const after = performGameplayAction({ game: f.game, decks: f.decks, actorPlayerId: "p1", actionId: current.id, selectedIds: rebound.selectedTargetIds, now: "confirmed" });
  assert.equal(after.state.players.p1!.power.Calm, 0);
  assert.ok(after.state.players.p1!.zones.base.includes(paymentCardId));
});
