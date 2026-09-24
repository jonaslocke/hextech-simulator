import assert from "node:assert/strict";
import { test } from "node:test";
import { gameFixture } from "./helpers/game-fixture";
import { projectGame } from "../src/server/game/projection";
import { chainRelationships } from "../src/features/game-board/chain-relationships";
import { targetSelectionCanAdd, targetSelectionIsLegal } from "../src/features/game-board/model";
import { newPublicReveals } from "../src/features/game-board/interactions/public-reveal-events";
import { availableBoardCardActions, availablePlayableCardModes } from "../src/features/game-board/interactions/available-board-card-actions";
import { resolveDecisionInspectionRequest } from "../src/features/game-board/interactions/decision-inspection-request";
import { createRuntimeCardIndex, definitionForInstance, recomputeMight } from "../src/server/game/primitive-handlers";
import { attachCardToTopMost, detachCard } from "../src/server/game/attachment-lifecycle";

test("public reveal events exclude initial history and dismissed IDs", () => {
  const history = [{ id: "old" }];
  const seen = new Set(history.map((item) => item.id));
  assert.deepEqual(newPublicReveals(seen, history), []);
  assert.deepEqual(newPublicReveals(seen, [...history, { id: "new" }]), [{ id: "new" }]);
  assert.deepEqual(newPublicReveals(seen, [{ id: "new" }]), []);
  assert.deepEqual(newPublicReveals(new Set(["new"]), [{ id: "new" }]), []);
});

test("location selection supports board inspection without changing the selection", () => {
  const targetSelection = { actionId: "move", targetKind: "location" as const, purpose: "choice" as const, legalTargetIds: ["base"], selectedTargetIds: [], minTargets: 1, maxTargets: 1, requirement: { requirements: [], legalIds: ["base"], minimum: 1, maximum: 1 } };
  assert.equal(resolveDecisionInspectionRequest({ playerDecision: null, targetSelection })?.policy, "publicGameState");
  assert.deepEqual(targetSelection.selectedTargetIds, []);
});

test("board card menus omit unavailable projected actions", () => {
  const actions = [
    { id: "ready", enabled: true, label: "Ready a Gear" },
    { id: "unavailable", enabled: false, label: "Ready two Gears" },
    { id: "resource", enabled: true, label: "Add Energy" },
  ] as unknown as Parameters<typeof availableBoardCardActions>[0];

  assert.deepEqual(
    availableBoardCardActions(actions, false).map((action) => action.id),
    ["ready", "resource"],
  );
  assert.deepEqual(
    availableBoardCardActions(actions, true).map((action) => action.id),
    ["resource"],
  );
});

test("playable card menus omit unavailable modes and empty placeholders", () => {
  const modes = [
    { id: "available", enabled: true },
    { id: "unavailable", enabled: false },
  ];
  assert.deepEqual(availablePlayableCardModes(modes).map((mode) => mode.id), ["available"]);
  assert.deepEqual(availablePlayableCardModes(modes.slice(1)), []);
});

test("target selection honors per-location cardinality constraints", () => {
  const requirement = {
    legalIds: ["unit-a", "unit-b", "unit-c"],
    minimum: 0,
    maximum: 2,
    requirements: [{
      kind: "card" as const,
      legalIds: ["unit-a", "unit-b", "unit-c"],
      minimum: 0,
      maximum: 2,
      maximumPerLocation: 1,
      locationKeysById: {
        "unit-a": "base:p2",
        "unit-b": "base:p2",
        "unit-c": "battlefield:arena",
      },
    }],
  };

  assert.equal(targetSelectionCanAdd(requirement, ["unit-a"], "unit-b"), false);
  assert.equal(targetSelectionCanAdd(requirement, ["unit-a"], "unit-c"), true);
  assert.equal(targetSelectionIsLegal(requirement, ["unit-a", "unit-c"]), true);
  assert.equal(targetSelectionIsLegal(requirement, ["unit-a", "unit-b"]), false);

  const sharedLocationRequirement = {
    ...requirement,
    requirements: [{
      ...requirement.requirements[0]!,
      mustShareLocation: true,
    }],
  };
  assert.equal(targetSelectionCanAdd(sharedLocationRequirement, ["unit-a"], "unit-c"), false);
  assert.equal(targetSelectionIsLegal(sharedLocationRequirement, ["unit-a", "unit-c"]), false);
});

test("Chain relationships distinguish object, location and Chain identities", async () => {
  const { game, decks, place } = await gameFixture();
  const unit = place("OGN-044", "base");
  const projection = projectGame({ game, decks, viewerPlayerId: "p1" });
  const target = { id: "chain-target", label: "Target spell", controllerPlayerId: "p2", sourceCardInstanceId: null, targetCardInstanceIds: [], kind: "spell" as const, card: null };
  projection.chain = { items: [target], relevantPlayerIds: ["p1", "p2"], priorityPlayerId: "p1", passedPlayerIds: [] };
  const result = chainRelationships(projection, { ...target, id: "source", controllerPlayerId: "p1", targetCardInstanceIds: [unit, "base", target.id] });
  assert.deepEqual(result.cardIds, [unit]);
  assert.deepEqual(result.basePlayerIds, ["p1"]);
  assert.deepEqual(result.chainIds, [target.id]);
  assert.ok(result.labels.includes("Targets Chain: Target spell"));
});

test("projected Might lists separate attachment instances and removes detached contributions", async () => {
  const { game, decks, place } = await gameFixture();
  const unit = place("OGN-044", "base");
  const gear = place("SFD-064", "base");
  const index = createRuntimeCardIndex(decks, game);
  attachCardToTopMost(game, gear, unit, index);
  game.state.cardStates[unit]!.combatRole = "defender";
  recomputeMight(game, unit, index);
  const read = () => projectGame({ game, decks, viewerPlayerId: "p1" }).players[0]!.zones.flatMap((zone) => zone.cards).find((card) => card.instanceId === unit)!;
  const card = read();
  assert.equal(card.might! + card.mightModifiers!.reduce((sum, entry) => sum + entry.amount, 0), card.computedMight);
  assert.ok(card.mightModifiers!.some((entry) => entry.label === "Shield" && entry.sourceName === definitionForInstance(gear, index).card.name));
  detachCard(game, gear);
  recomputeMight(game, unit, index);
  assert.equal(read().mightModifiers!.length, 0);
});

test("play projection shows final costs only for altered or alternative modes and excludes unavailable modes", async () => {
  const { game, decks, place } = await gameFixture();
  const unit = place("OGN-044", "hand");
  const read = () => projectGame({ game, decks, viewerPlayerId: "p1" }).actions.filter((action) => action.sourceCardInstanceId === unit);
  assert.equal(read().length, 0);
  game.state.players.p1!.energy = 10;
  game.state.players.p1!.power.Calm = 5;
  const modes = read();
  assert.equal(modes.length, 2);
  assert.deepEqual(modes.map((mode) => mode.presentation.playCost?.showCost), [false, true]);
  assert.ok(modes.every((mode) => mode.label === "Play Clockwork Keeper to Base"));
  assert.equal(modes[1]!.costPreview!.energy, 2);
  assert.deepEqual(modes[1]!.poolPayment!.powerCosts, [{ amount: 1, domains: ["Calm"] }]);
  const source = place("SFD-064", "base");
  // Persisted controller-spell modifiers are deliberately restricted to Spells.
  definitionForInstance(unit, createRuntimeCardIndex(decks, game)).card.classification.type = "Spell";
  for (const operation of ["increase", "reduce"] as const) {
    game.state.modifiers = [{ id: "cost", attribute: "energyCost", amount: 1, operation, sourceCardInstanceId: source, targetCardInstanceId: unit, targetScope: "controller_spell", minimum: null, duration: "thisTurn", createdAtTurn: 3 }];
    const normal = read()[0]!;
    assert.equal(normal.presentation.playCost!.showCost, true);
    assert.equal(normal.costPreview!.energy, operation === "increase" ? 3 : 1);
    assert.deepEqual(normal.presentation.playCost!.modifierSources, [definitionForInstance(source, createRuntimeCardIndex(decks, game)).card.name]);
  }
});
