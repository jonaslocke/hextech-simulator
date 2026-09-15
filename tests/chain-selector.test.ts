import assert from "node:assert/strict";
import { test } from "node:test";
import { buildPlayerDecisionRequest } from "../src/features/game-board/decisions/use-player-decision-request";
import { compileBehaviorModel, createBehaviorContext, gameplayActions, performGameplayAction, projectGame, targetRequirementsForClause } from "../src/server/game";
import { createPrimitiveHandlers, createRuntimeCardIndex } from "../src/server/game/primitive-handlers";
import { chainSelector, chainSelectorFixture, chooserSourceId, opponentChainId, opponentSpellId, ownChainId, ownSpellId } from "./helpers/chain-selector-fixture";

for (const [controller, expected] of [
  [undefined, [ownChainId, opponentChainId]],
  ["opponent", [opponentChainId]],
  ["controller", [ownChainId]],
] as const) {
  test(`Chain spell controller ${controller ?? "unqualified"} survives compilation, legality, projection and client adaptation`, async () => {
    const { game, decks, source } = await chainSelectorFixture(chainSelector(controller));
    const handlers = createPrimitiveHandlers(createRuntimeCardIndex(decks, game));
    const compiled = compileBehaviorModel(source.behaviorModel, handlers);
    assert.deepEqual(compiled.clauses[0]!.selectors, source.behaviorModel.clauses[0]!.selectors);
    const requirements = targetRequirementsForClause(compiled.clauses[0]!, createBehaviorContext(game, "p1", chooserSourceId, null, []), handlers);
    assert.deepEqual(requirements[0]!.legalIds, expected);
    const action = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === chooserSourceId)!;
    assert.ok(action.enabled);
    assert.deepEqual(action.targets[0]!.legalIds, expected);
    const projection = projectGame({ game, decks, viewerPlayerId: "p1" });
    assert.deepEqual(projection.actions.find((entry) => entry.id === action.id)!.targets[0]!.legalIds, expected);
    const decision = buildPlayerDecisionRequest({
      sourceProjection: projection, cardsByInstanceId: {},
      activeTargetSelection: { actionId: action.id, targetKind: "chainItem", legalTargetIds: [...expected], minTargets: 1, maxTargets: 1 },
    });
    assert.equal(decision?.kind, "cardSelection");
    if (decision?.kind !== "cardSelection") return;
    assert.deepEqual(decision.cards.filter((card) => !card.disabled).map((card) => card.id), expected);
    assert.deepEqual(decision.cards.map((card) => card.diagnosticCardInstanceId), [ownSpellId, opponentSpellId]);
  });
}

for (const selectedId of [ownChainId, opponentChainId]) {
  test(`an unqualified counter submits and resolves only selected Chain item ${selectedId}`, async () => {
    const fixture = await chainSelectorFixture();
    const { decks } = fixture;
    let { game } = fixture;
    const action = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === chooserSourceId)!;
    game = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [selectedId], now: "counter" });
    for (const playerId of ["p1", "p2"]) {
      const pass = gameplayActions(game, playerId, decks).find((action) => action.label === "Pass priority")!;
      game = performGameplayAction({ game, decks, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], now: "pass" });
    }
    assert.deepEqual(game.state.chain?.items.map((item) => item.id), [ownChainId, opponentChainId].filter((id) => id !== selectedId));
    assert.equal(game.state.players.p1!.zones.trash.includes(ownSpellId), selectedId === ownChainId);
    assert.equal(game.state.players.p2!.zones.trash.includes(opponentSpellId), selectedId === opponentChainId);
  });
}

test("Chain spell selectors preserve cost, item kind, response timing, and stale Chain identity restrictions", async () => {
  const selector = chainSelector();
  Object.assign(selector.parameters, { maximumEnergyCost: 4, maximumPowerCost: 1 });
  const { game, decks, item } = await chainSelectorFixture(selector);
  game.state.chain!.items.push(
    item("chain:high-energy", "p2:high-energy", "p2"),
    item("chain:high-power", "p1:high-power", "p1"),
    { ...item("chain:ability", ownSpellId, "p1"), kind: "activatedAbility" },
    { ...item("chain:permanent", opponentSpellId, "p2"), kind: "permanent" },
  );
  const action = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === chooserSourceId)!;
  assert.deepEqual(action.targets[0]!.legalIds, [ownChainId, opponentChainId]);
  for (const invalid of ["chain:high-energy", "chain:high-power", "chain:ability", "chain:permanent", ownSpellId]) {
    assert.throws(() => performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [invalid], now: "invalid" }));
  }
  // The same source card on a new Chain item must not satisfy an old selection.
  let next = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [ownChainId], now: "counter" });
  next.state.chain!.items.find((entry) => entry.id === ownChainId)!.id = "chain:replayed-a";
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(next, playerId, decks).find((entry) => entry.label === "Pass priority")!;
    next = performGameplayAction({ game: next, decks, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], now: "pass" });
  }
  assert.ok(next.state.chain!.items.some((entry) => entry.id === "chain:replayed-a"));
  assert.ok(next.state.chain!.items.some((entry) => entry.id === opponentChainId));
  game.state.chain!.items = game.state.chain!.items.filter((entry) => entry.id !== ownChainId);
  assert.throws(() => performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: action.id, selectedIds: [ownChainId], now: "stale" }));
  game.state.chain!.priorityPlayerId = "p2";
  assert.equal(gameplayActions(game, "p1", decks).some((entry) => entry.sourceCardInstanceId === chooserSourceId && entry.enabled), false);
});
