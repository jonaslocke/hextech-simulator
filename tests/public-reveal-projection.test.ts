import assert from "node:assert/strict";
import { test } from "node:test";
import { createBehaviorContext, projectGame } from "../src/server/game";
import { createPrimitiveHandlers, createRuntimeCardIndex } from "../src/server/game/primitive-handlers";
import { stateChangeEvents } from "../src/server/game/transitions";
import { gameFixture } from "./helpers/game-fixture";

test("hand reveals resolve display names, preserve duplicate copies in the public log, and do not expose other private zones", async () => {
  const { game, decks, place } = await gameFixture();
  const revealDefinition = decks[0]!.snapshot.cards.find((definition) => definition.behaviorModel.clauses.some((clause) => clause.effects.some((binding) => binding.behaviorId === "action.reveal_opponent_hand")))!;
  assert.ok(revealDefinition);
  const source = place(revealDefinition.cardCode, "base");
  const hand = [place("SFD-042", "hand", "p2"), place("SFD-042", "hand", "p2", 1), place("SFD-056", "hand", "p2")];
  const before = structuredClone(game);
  const index = createRuntimeCardIndex(decks, game);
  const binding = revealDefinition.behaviorModel.clauses.flatMap((clause) => clause.effects).find((candidate) => candidate.behaviorId === "action.reveal_opponent_hand")!;
  createPrimitiveHandlers(index).get(binding.behaviorId)!.execute!(binding, createBehaviorContext(game, "p1", source, null, []));
  assert.equal(game.state.pendingChoice, null);
  assert.deepEqual(game.state.players.p2!.zones.hand, hand);
  const events = stateChangeEvents(before, game).map((event, i) => ({ ...event, id: `event-${i}`, createdAt: "now", updatedAt: "now", gameId: game.id, matchId: game.matchId, sequence: i }));
  const expected = `${revealDefinition.card.name} revealed Jonas's hand: Brutalizer, Brutalizer, Sterak's Gage.`;
  for (const viewerPlayerId of ["p1", "p2"]) {
    const projection = projectGame({ game, decks, events, viewerPlayerId, playerNames: { p1: "Opponent", p2: "Jonas" } });
    assert.equal(projection.publicReveals?.[0]?.message, expected);
    assert.deepEqual(projection.publicReveals?.[0]?.cards.map((card) => card.instanceId), hand);
    assert.equal(projection.logEntries.find((event) => event.id === "event-0")?.message, expected);
    assert.equal(projection.players.find((player) => player.playerId === "p2")?.zones.find((zone) => zone.kind === "mainDeck")?.cards.length, 0);
  }
  game.state.publicReveals = [];
  const later = projectGame({ game, decks, events, viewerPlayerId: "p1", playerNames: { p2: "Jonas" } });
  assert.equal(later.publicReveals?.length, 0);
  assert.equal(later.logEntries.find((event) => event.id === "event-0")?.message, expected, "public information remains available after the transient surface is gone");
  assert.equal(later.players.find((player) => player.playerId === "p2")?.zones.find((zone) => zone.kind === "hand")?.cards.length, 0);
});
