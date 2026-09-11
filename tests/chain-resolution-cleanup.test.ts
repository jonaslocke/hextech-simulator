import assert from "node:assert/strict";
import { test } from "node:test";
import { gameplayActions, performGameplayAction, type GameDocument } from "../src/server/game";
import { gameDocumentSchema } from "../src/server/game/state";
import { attachCardToTopMost } from "../src/server/game/attachment-lifecycle";
import { cleanupBoard } from "../src/server/game/board-rules";
import { createRuntimeCardIndex, definitionForInstance } from "../src/server/game/primitive-handlers";
import { ornnGameFixture } from "./helpers/ornn-game-fixture";

for (const openedBy of [undefined, "triggeredAbility", "addAbility"] as const) {
  test(`a ${openedBy ?? "ordinary"} Chain stays closed through a paused detach and cleans up before Focus (319.5, 321, 323.7, 346–346.1)`, async () => {
    const fixture = await ornnGameFixture();
    let { game } = fixture;
    const { decks, id, place } = fixture;
    const host = place("OGN-044", "base");
    const gear = place("SFD-042", "base");
    const source = id("SFD-221");
    game.state.players.p1!.zones.base = [];
    game.state.battlefields = [{ battlefieldId: "field", cardInstanceId: source, selectedByPlayerId: "p1", controllerPlayerId: "p1", units: [host], attachedCardInstanceIds: [] }];
    const index = createRuntimeCardIndex(decks, game);
    attachCardToTopMost(game, gear, host, index);
    const clause = definitionForInstance(source, index).behaviorModel.clauses[0]!;
    // A second generic choice makes the transient post-detach state observable.
    // This does not change Temple's production model or add a gameplay shortcut.
    clause.effects.push({ behaviorId: "action.optional", order: 5, confidence: "high", parameters: { effectKey: "continue", prompt: "Continue resolving" } });
    game.state.showdown = { kind: "nonCombat", battlefieldId: "field", relevantPlayerIds: ["p1", "p2"], focusPlayerId: "p1", passedPlayerIds: [] };
    const itemId = "resolving-temple";
    game.state.chain = {
      openedBy,
      relevantPlayerIds: ["p1", "p2"], priorityPlayerId: "p1", passedPlayerIds: [],
      items: [{ id: itemId, kind: "trigger", label: "Veiled Temple", controllerPlayerId: "p1", sourceCardInstanceId: source, behaviorClauseId: definitionForInstance(source, index).behaviorModel.clauses[0]!.id, activatedBehaviorId: null, behaviorEvent: null, targetCardInstanceIds: [gear], targetObjectVersions: { [gear]: 0 } }],
    };
    function submit(actor: string, label: string, selectedIds: string[] = []) {
      const action = gameplayActions(game, actor, decks).find((candidate) => candidate.label === label);
      assert.ok(action?.enabled, label);
      game = performGameplayAction({ game, decks, actorPlayerId: actor, actionId: action.id, selectedIds, now: "resolve" });
    }
    submit("p1", "Pass priority");
    submit("p2", "Pass priority");
    assert.equal(game.state.pendingChoice?.type, "effectOption");
    assert.equal(game.state.chain?.items.some((item) => item.id === itemId), true, "resolving item remains on the Chain during its choice");
    assert.equal(game.state.showdown?.focusPlayerId, "p1", "Focus cannot pass during resolution");
    assert.equal(game.state.cardStates[gear]!.attachedToCardInstanceId, host);
    game = gameDocumentSchema.parse(JSON.parse(JSON.stringify(game))) as GameDocument;
    const choice = gameplayActions(game, "p1", decks).find((candidate) => candidate.choice?.kind === "effectOption");
    assert.ok(choice?.enabled);
    game = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: choice.id, selectedIds: ["yes"], now: "detach" });
    assert.equal(game.state.pendingChoice?.type, "effectOption");
    assert.equal(game.state.cardStates[gear]!.attachedToCardInstanceId, null);
    assert.ok(game.state.battlefields[0]!.attachedCardInstanceIds?.includes(gear), "Detach initially retains the former host's location");
    cleanupBoard(game, index);
    assert.ok(!game.state.players.p1!.zones.base.includes(gear), "Cleanup is deferred while the item is still resolving");
    const continuation = gameplayActions(game, "p1", decks).find((candidate) => candidate.choice?.kind === "effectOption");
    assert.ok(continuation?.enabled);
    game = performGameplayAction({ game, decks, actorPlayerId: "p1", actionId: continuation.id, selectedIds: ["yes"], now: "finish" });
    assert.equal(game.state.pendingChoice, null);
    assert.equal(game.state.chain, null);
    assert.equal(game.state.cardStates[gear]!.attachedToCardInstanceId, null);
    assert.ok(game.state.players.p1!.zones.base.includes(gear), "post-resolution Cleanup recalls detached Gear without another gameplay action");
    assert.ok(!game.state.battlefields[0]!.attachedCardInstanceIds?.includes(gear));
    assert.equal(game.state.showdown?.focusPlayerId, openedBy ? "p1" : "p2");
  });
}
