import assert from "node:assert/strict";
import { test } from "node:test";
import { gameplayActions, performGameplayAction } from "../src/server/game";
import { ornnGameFixture } from "./helpers/ornn-game-fixture";

test("Clockwork Keeper commits its optional Calm payment as a server-issued pre-play mode", async () => {
  const { game, decks, id, place } = await ornnGameFixture();
  const clockwork = place("OGN-044", "hand");
  const drawnCard = id("SFD-042");
  prepareClockworkPayment(game, clockwork, drawnCard, true);

  const modes = gameplayActions(game, "p1", decks).filter(
    (action) => action.sourceCardInstanceId === clockwork,
  );
  assert.equal(modes.length, 2);
  assert.deepEqual(modes.map((action) => action.targets), [[], []]);
  assert.deepEqual(
    modes.map((action) => action.label),
    [
      "Play Clockwork Keeper to Base (2 Energy)",
      "Play Clockwork Keeper to Base (2 Energy + 1 Calm Power)",
    ],
  );
  assert.ok(modes.every((action) => action.enabled));

  const normal = modes.find(
    (action) => !action.label.includes("Calm Power"),
  );
  assert.ok(normal);
  const afterNormal = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: normal.id,
    selectedIds: [],
    decks,
    now: "2026-09-11T00:00:00.000Z",
  });
  assert.equal(afterNormal.state.players.p1!.energy, 0);
  assert.equal(afterNormal.state.players.p1!.power.Calm, 1);
  assert.ok(afterNormal.state.players.p1!.zones.base.includes(clockwork));
  assert.ok(afterNormal.state.players.p1!.zones.mainDeck.includes(drawnCard));
  assert.ok(!afterNormal.state.players.p1!.zones.hand.includes(drawnCard));
  assert.equal(afterNormal.state.pendingChoice, null);
});

test("Clockwork Keeper pays Calm and draws only in the selected optional mode", async () => {
  const { game, decks, id, place } = await ornnGameFixture();
  const clockwork = place("OGN-044", "hand");
  const drawnCard = id("SFD-042");
  prepareClockworkPayment(game, clockwork, drawnCard, true);

  const optional = gameplayActions(game, "p1", decks).find(
    (action) =>
      action.sourceCardInstanceId === clockwork &&
      action.label.includes("1 Calm Power"),
  );
  assert.ok(optional?.enabled);
  const afterOptional = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: optional.id,
    selectedIds: [],
    decks,
    now: "2026-09-11T00:00:00.000Z",
  });

  assert.equal(afterOptional.state.players.p1!.energy, 0);
  assert.equal(afterOptional.state.players.p1!.power.Calm, 0);
  assert.ok(afterOptional.state.players.p1!.zones.base.includes(clockwork));
  assert.ok(afterOptional.state.players.p1!.zones.hand.includes(drawnCard));
  assert.ok(!afterOptional.state.players.p1!.zones.mainDeck.includes(drawnCard));
  assert.equal(afterOptional.state.pendingChoice, null);
});

test("Clockwork Keeper keeps the normal mode available when its optional Calm payment is unavailable", async () => {
  const { game, decks, id, place } = await ornnGameFixture();
  const clockwork = place("OGN-044", "hand");
  prepareClockworkPayment(game, clockwork, id("SFD-042"), false);

  const modes = gameplayActions(game, "p1", decks).filter(
    (action) => action.sourceCardInstanceId === clockwork,
  );
  const normal = modes.find(
    (action) => !action.label.includes("Calm Power"),
  );
  const optional = modes.find((action) => action.label.includes("Calm Power"));
  assert.equal(normal?.enabled, true);
  assert.equal(optional?.enabled, false);
  assert.equal(optional?.disabledReason, "Card costs cannot be paid.");
});

function prepareClockworkPayment(
  game: Awaited<ReturnType<typeof ornnGameFixture>>["game"],
  clockwork: string,
  drawnCard: string,
  includeCalm: boolean,
) {
  const player = game.state.players.p1!;
  player.energy = 2;
  player.power = includeCalm ? { Calm: 1 } : {};
  player.conditionalEnergy = 0;
  player.restrictedResources = { energy: {}, power: {} };
  for (const zone of [
    "mainDeck",
    "runeDeck",
    "hand",
    "trash",
    "banishment",
    "base",
  ] as const) {
    player.zones[zone] = player.zones[zone].filter(
      (id) => id !== clockwork && id !== drawnCard,
    );
  }
  player.zones.hand = [clockwork];
  player.zones.mainDeck = [drawnCard];
}
