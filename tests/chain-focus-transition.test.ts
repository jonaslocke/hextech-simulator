import assert from "node:assert/strict";
import { test } from "node:test";
import { gameplayActions, performGameplayAction } from "../src/server/game";
import { gameFixture } from "./helpers/game-fixture";

test("a card-play Chain retains its origin through a Quick-Draw trigger and passes Focus on closure", async () => {
  const fixture = await gameFixture();
  let { game } = fixture;
  const { decks, place } = fixture;
  const host = place("OGN-044", "base");
  const gear = place("SFD-056", "hand");
  game.state.players.p1!.energy = 10;
  game.state.players.p1!.power = { Calm: 10 };
  game.state.showdown = { kind: "nonCombat", battlefieldId: "focus-field", relevantPlayerIds: ["p1", "p2"], focusPlayerId: "p1", passedPlayerIds: [] };

  const play = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === gear);
  assert.ok(play?.enabled);
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "quick-draw-play" });
  const chooseTarget = gameplayActions(game, "p1", decks).find((action) => action.choice?.kind === "effectSelection");
  assert.ok(chooseTarget);
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: chooseTarget.id, selectedIds: [host], decks, now: "quick-draw-target" });
  assert.equal(game.state.chain?.openedBy, "cardPlay");

  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(game, playerId, decks).find((action) => action.label === "Pass priority");
    assert.ok(pass);
    game = performGameplayAction({ game, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks, now: `quick-draw-${playerId}` });
  }
  assert.equal(game.state.chain, null);
  assert.equal(game.state.showdown?.focusPlayerId, "p2");
});

for (const openedBy of ["triggeredAbility", "addAbility"] as const) {
  test(`${openedBy} Chains retain Focus when they close`, async () => {
    const fixture = await gameFixture();
    let { game } = fixture;
    const { decks, id } = fixture;
    const source = id("OGN-044");
    game.state.players.p1!.zones.base.push(source);
    game.state.showdown = { kind: "nonCombat", battlefieldId: "focus-field", relevantPlayerIds: ["p1", "p2"], focusPlayerId: "p1", passedPlayerIds: [] };
    game.state.chain = {
      openedBy,
      relevantPlayerIds: ["p1", "p2"], priorityPlayerId: "p1", passedPlayerIds: [],
      items: [{ id: `${openedBy}:item`, kind: "trigger", label: "timing fixture", controllerPlayerId: "p1", sourceCardInstanceId: source, targetCardInstanceIds: [], targetObjectVersions: {}, behaviorClauseId: null, activatedBehaviorId: null, behaviorEvent: null }],
    };
    for (const playerId of ["p1", "p2"]) {
      const pass = gameplayActions(game, playerId, decks).find((action) => action.label === "Pass priority");
      assert.ok(pass);
      game = performGameplayAction({ game, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks, now: `${openedBy}-${playerId}` });
    }
    assert.equal(game.state.showdown?.focusPlayerId, "p1");
  });
}
