import assert from "node:assert/strict";
import { test } from "node:test";
import { attachCardToTopMost, detachCard } from "../src/server/game/attachment-lifecycle";
import { cleanupBoard } from "../src/server/game/board-rules";
import { beginEffectResolution, submitEffectOption } from "../src/server/game/effect-resolution";
import { createRuntimeCardIndex, definitionForInstance, recomputeMight } from "../src/server/game/primitive-handlers";
import { gameFixture } from "./helpers/game-fixture";

test("an attached Shield modifier applies once to its host only while it defends", async () => {
  const { game, decks, place } = await gameFixture();
  const host = place("OGN-044", "base");
  const other = place("OGN-044", "base", "p1", 1);
  const gear = place("SFD-064", "base");
  const index = createRuntimeCardIndex(decks, game);
  const printed = definitionForInstance(host, index).card.attributes.might!;
  const equipment = definitionForInstance(gear, index).card.attributes.might!;
  attachCardToTopMost(game, gear, host, index);
  for (const role of [null, "attacker", "defender", null] as const) {
    game.state.cardStates[host]!.combatRole = role;
    game.state.cardStates[other]!.combatRole = role;
    recomputeMight(game, host, index);
    recomputeMight(game, other, index);
    assert.equal(game.state.cardStates[host]!.computedMight, printed + equipment + (role === "defender" ? 2 : 0));
    assert.equal(game.state.cardStates[other]!.computedMight, printed);
  }
  detachCard(game, gear);
  recomputeMight(game, host, index);
  assert.equal(game.state.cardStates[host]!.computedMight, printed);
});

test("multiple attachment modifiers stack and lose only a detached contribution", async () => {
  const { game, decks, place } = await gameFixture();
  const host = place("OGN-044", "base");
  const first = place("SFD-064", "base");
  const second = `${first}:second`;
  const original = decks[0]!.instances.find((instance) => instance.instanceId === first)!;
  decks[0]!.instances.push({ ...original, instanceId: second });
  game.state.cardStates[second] = { ...game.state.cardStates[first]! };
  game.state.players.p1!.zones.base.push(second);
  const index = createRuntimeCardIndex(decks, game);
  const printed = definitionForInstance(host, index).card.attributes.might!;
  const equipment = definitionForInstance(first, index).card.attributes.might!;
  attachCardToTopMost(game, first, host, index);
  attachCardToTopMost(game, second, host, index);
  game.state.cardStates[host]!.combatRole = "defender";
  recomputeMight(game, host, index);
  assert.equal(game.state.cardStates[host]!.computedMight, printed + 2 * equipment + 4);
  detachCard(game, first);
  recomputeMight(game, host, index);
  assert.equal(game.state.cardStates[host]!.computedMight, printed + equipment + 2);
});

test("attachment cleanup offers a detach choice only when the selected Gear is attached", async () => {
  const { game, decks, id, place } = await gameFixture();
  const gear = place("SFD-042", "base");
  const host = place("OGN-044", "base");
  const index = createRuntimeCardIndex(decks, game);
  attachCardToTopMost(game, gear, host, index);
  const source = id("SFD-221");
  const clause = definitionForInstance(source, index).behaviorModel.clauses[0]!;
  beginEffectResolution({ game, decks, controllerPlayerId: "p1", sourceCardInstanceId: source, clauseId: clause.id, selectedIds: [gear] });
  assert.equal(game.state.cardStates[gear]!.exhausted, false);
  assert.equal(game.state.pendingChoice?.type, "effectOption");
  submitEffectOption(game, "p1", ["yes"], decks);
  assert.equal(game.state.cardStates[gear]!.attachedToCardInstanceId, null);
});

test("Cleanup recalls every detached Gear without restoring an earlier attachment-list entry", async () => {
  const { game, decks, id, place } = await gameFixture();
  const host = place("OGN-044", "base");
  const gears = [place("SFD-042", "base"), place("SFD-042", "base", "p1", 1)];
  game.state.players.p1!.zones.base = [];
  game.state.battlefields = [{ battlefieldId: "field", cardInstanceId: id("SFD-221"), selectedByPlayerId: "p1", controllerPlayerId: "p1", units: [host], attachedCardInstanceIds: [] }];
  const index = createRuntimeCardIndex(decks, game);
  for (const gear of gears) attachCardToTopMost(game, gear, host, index);
  for (const gear of gears) detachCard(game, gear);
  cleanupBoard(game, index);
  assert.deepEqual(game.state.players.p1!.zones.base, gears);
  assert.deepEqual(game.state.battlefields[0]!.attachedCardInstanceIds, []);
});
