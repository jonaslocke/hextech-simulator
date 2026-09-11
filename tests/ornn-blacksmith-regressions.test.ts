import assert from "node:assert/strict";
import { test } from "node:test";
import { gameplayActions, performGameplayAction } from "../src/server/game";
import { ornnGameFixture } from "./helpers/ornn-game-fixture";

test("Ornn, Blacksmith draws the exact selected Gear into the controller's hand and recycles the other looked cards", async () => {
  const { game, decks, id, place } = await ornnGameFixture();
  const blacksmith = place("SFD-058", "hand");
  game.state.players.p1!.zones.champion = null;
  const selectedGear = id("SFD-042");
  const remaining = [id("OGN-044"), id("OGN-043"), id("SFD-064")];
  prepareTopDeck(game, blacksmith, [selectedGear, ...remaining]);

  let current = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: playActionId(game, decks, blacksmith),
    selectedIds: [],
    decks,
    now: "2026-09-11T00:00:00.000Z",
  });
  current = passPriority(current, "p1", decks);
  current = passPriority(current, "p2", decks);

  const selection = gameplayActions(current, "p1", decks).find(
    (action) => action.choice?.kind === "effectSelection",
  );
  assert.ok(selection);
  assert.ok(selection.targets[0]?.legalIds.includes(selectedGear));
  current = performGameplayAction({
    game: current,
    actorPlayerId: "p1",
    actionId: selection.id,
    selectedIds: [selectedGear],
    decks,
    now: "2026-09-11T00:00:01.000Z",
  });

  const player = current.state.players.p1!;
  assert.equal(current.state.pendingChoice, null);
  assert.ok(player.zones.hand.includes(selectedGear));
  assert.equal(player.zones.hand.filter((id) => id === selectedGear).length, 1);
  assert.ok(!player.zones.mainDeck.includes(selectedGear));
  assert.deepEqual(
    [...player.zones.mainDeck].sort(),
    [...remaining].sort(),
    "all unselected looked cards are recycled and no duplicate draw is created",
  );
});

test("Ornn, Blacksmith permits no selection when no looked card is Gear and recycles all looked cards", async () => {
  const { game, decks, id, place } = await ornnGameFixture();
  const blacksmith = place("SFD-058", "hand");
  game.state.players.p1!.zones.champion = null;
  const looked = [id("OGN-044"), id("OGN-043"), id("OGN-087"), id("SFD-189")];
  prepareTopDeck(game, blacksmith, looked);

  let current = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: playActionId(game, decks, blacksmith),
    selectedIds: [],
    decks,
    now: "2026-09-11T00:00:00.000Z",
  });
  current = passPriority(current, "p1", decks);
  current = passPriority(current, "p2", decks);

  const selection = gameplayActions(current, "p1", decks).find(
    (action) => action.choice?.kind === "effectSelection",
  );
  assert.ok(selection);
  assert.deepEqual(selection.targets[0]?.legalIds, []);
  current = performGameplayAction({
    game: current,
    actorPlayerId: "p1",
    actionId: selection.id,
    selectedIds: [],
    decks,
    now: "2026-09-11T00:00:01.000Z",
  });

  assert.equal(current.state.pendingChoice, null);
  assert.deepEqual([...current.state.players.p1!.zones.mainDeck].sort(), [...looked].sort());
  assert.ok(!current.state.players.p1!.zones.hand.some((id) => looked.includes(id)));
});

function prepareTopDeck(
  game: Awaited<ReturnType<typeof ornnGameFixture>>["game"],
  blacksmith: string,
  topDeck: string[],
) {
  const player = game.state.players.p1!;
  player.energy = 10;
  player.power = { Calm: 10 };
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
      (id) => id !== blacksmith && !topDeck.includes(id),
    );
  }
  player.zones.hand = [blacksmith];
  player.zones.mainDeck = [...topDeck];
}

function playActionId(
  game: Awaited<ReturnType<typeof ornnGameFixture>>["game"],
  decks: Awaited<ReturnType<typeof ornnGameFixture>>["decks"],
  cardId: string,
) {
  const action = gameplayActions(game, "p1", decks).find(
    (candidate) =>
      candidate.sourceCardInstanceId === cardId &&
      candidate.label === "Play Ornn, Blacksmith to Base",
  );
  assert.ok(action?.enabled);
  return action.id;
}

function passPriority(
  game: Awaited<ReturnType<typeof ornnGameFixture>>["game"],
  playerId: string,
  decks: Awaited<ReturnType<typeof ornnGameFixture>>["decks"],
) {
  const action = gameplayActions(game, playerId, decks).find(
    (candidate) => candidate.label === "Pass priority",
  );
  assert.ok(action?.enabled);
  return performGameplayAction({
    game,
    actorPlayerId: playerId,
    actionId: action.id,
    selectedIds: [],
    decks,
    now: "2026-09-11T00:00:00.000Z",
  });
}
