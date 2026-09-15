import assert from "node:assert/strict";
import { test } from "node:test";
import { compileBehaviorModel, createBehaviorContext, targetRequirementsForClause } from "../src/server/game/behavior-runtime";
import { beginEffectResolution, submitEffectSelection } from "../src/server/game/effect-resolution";
import { createPrimitiveHandlers, createRuntimeCardIndex, definitionForInstance } from "../src/server/game/primitive-handlers";
import { gameFixture } from "./helpers/game-fixture";

test("Quick-Draw attachment may be declined while Equip still requires its target", async () => {
  const { game, decks, place } = await gameFixture();
  const source = place("SFD-064", "base");
  const host = place("OGN-044", "base");
  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const definition = definitionForInstance(source, index);
  const model = compileBehaviorModel(definition.behaviorModel, handlers);
  const context = createBehaviorContext(game, "p1", source, null, []);
  assert.equal(targetRequirementsForClause(model.clauses[0]!, context, handlers)[0]!.minimum, 0);
  assert.equal(targetRequirementsForClause(model.clauses[1]!, context, handlers)[0]!.minimum, 1);
  for (const selected of [[], [host]]) {
    const copy = structuredClone(game);
    beginEffectResolution({ game: copy, decks, controllerPlayerId: "p1", sourceCardInstanceId: source, clauseId: model.clauses[0]!.id });
    assert.equal(copy.state.pendingChoice?.type, "effectSelection");
    submitEffectSelection(copy, "p1", selected, decks);
    assert.equal(copy.state.pendingChoice, null);
    assert.equal(copy.state.cardStates[source]?.attachedToCardInstanceId ?? null, selected.length ? host : null);
  }
});
