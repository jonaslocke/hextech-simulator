import assert from "node:assert/strict";
import { test } from "node:test";
import { assertLegalRegisteredDeckConfiguration } from "../src/server/deck/deck-validation-service";
import {
  createInitialDeckConfiguration, createMatchGame, registeredBattlefieldIds,
} from "../src/server/game/game-factory";
import type { MatchSeat } from "../src/server/game/state";
import { gameFixture } from "./helpers/game-fixture";

test("later games consume accepted one-for-one registered exchanges", async () => {
  const { decks } = await gameFixture();
  const configurations = Object.fromEntries(decks.map((deck) => {
    const configuration = createInitialDeckConfiguration(deck.instances);
    const originalSideboardCount = configuration.sideboardRegisteredCardIds.length;
    const incoming = configuration.sideboardRegisteredCardIds[0];
    const outgoing = configuration.mainDeckRegisteredCardIds[0];
    assert.ok(incoming);
    assert.ok(outgoing);

    configuration.mainDeckRegisteredCardIds[0] = incoming;
    configuration.sideboardRegisteredCardIds[0] = outgoing;

    const result = assertLegalRegisteredDeckConfiguration({ registeredDeck: deck, configuration });
    assert.equal(result.legal, true);
    assert.equal(result.summary.activeCardCount, 40);
    assert.equal(result.summary.sideboardCount, originalSideboardCount);
    assert.equal(result.constraints.sideboard.exact, originalSideboardCount);
    return [deck.playerId, configuration];
  }));
  const players = decks.map((deck, index): MatchSeat => ({
    playerId: deck.playerId,
    seat: index === 0 ? "player-1" : "player-2",
    tokenHash: "fixture-token-hash",
    displayName: deck.playerId,
    registeredDeckSnapshotId: deck.id,
    currentDeckConfiguration: configurations[deck.playerId]!,
  })) as [MatchSeat, MatchSeat];

  for (const gameNumber of [2, 3] as const) {
    const game = createMatchGame({
      matchId: "registered-construction",
      gameNumber,
      now: "2026-09-16T00:00:00.000Z",
      players,
      registeredDecksByPlayerId: Object.fromEntries(decks.map((deck) => [deck.playerId, deck])),
      activeConfigurationsByPlayerId: configurations,
      startingPlayerChooserId: decks[0]!.playerId,
      availableBattlefieldRegisteredIdsByPlayerId: Object.fromEntries(decks.map((deck) => [
        deck.playerId, registeredBattlefieldIds(deck.instances).slice(gameNumber - 1),
      ])),
    });
    for (const deck of decks) {
      const expected = configurations[deck.playerId]!.mainDeckRegisteredCardIds;
      const actual = game.state.players[deck.playerId]!.zones.mainDeck;
      assert.equal(actual.length, expected.length);
      assert.deepEqual(new Set(actual), new Set(deck.instances
        .filter((copy) => expected.includes(copy.registeredCardId!)).map((copy) => copy.instanceId)));
      for (const registeredCardId of configurations[deck.playerId]!.sideboardRegisteredCardIds) {
        const copy = deck.instances.find((item) => item.registeredCardId === registeredCardId)!;
        assert.equal(game.state.cardStates[copy.instanceId], undefined);
      }
    }
  }
});
