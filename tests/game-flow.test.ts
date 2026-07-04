import assert from "node:assert/strict";
import { test } from "node:test";
import type { DeckSnapshotDocument } from "../src/server/game";
import { gameplayActions, performGameplayAction, type GameDocument } from "../src/server/game";

test("generates and validates generic turn, resource, movement, and priority actions", () => {
  const { game: initial, decks } = fixture();
  let game = initial;
  assert.equal(gameplayActions(game, "p1", decks).some((action) => action.label === "Draw a card" || action.label === "Channel a rune"), false);

  const rune = gameplayActions(game, "p1", decks).find((action) => action.label === "Add Energy")!;
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: rune.id, selectedIds: [], decks, now: "c" });
  assert.equal(game.state.players.p1?.energy, 1);

  const move = gameplayActions(game, "p1", decks).find((action) => action.label.startsWith("Move to"))!;
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: move.id, selectedIds: [], decks, now: "d" });
  assert.ok(game.state.showdown);
  assert.equal(game.state.battlefields[0]!.contestedByPlayerId, "p1");
  assert.throws(() => performGameplayAction({ game, actorPlayerId: "p1", actionId: move.id, selectedIds: [], decks, now: "e" }), /not legal/);
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(game, playerId, decks).find(
      (candidate) => candidate.label === "Pass focus"
    )!;
    game = performGameplayAction({
      game,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: "f"
    });
  }
  assert.equal(game.state.showdown, null);
  assert.equal(game.state.battlefields[0]!.controllerPlayerId, "p1");
  assert.equal(game.state.battlefields[0]!.contestedByPlayerId, null);
  assert.equal(game.state.players.p1!.points, 1);
});

test("plays a spell through priority resolution and advances the turn", () => {
  const { game: initial, decks } = fixture();
  let game = initial;
  const play = gameplayActions(game, "p1", decks).find((action) => action.label === "Play Spell")!;
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "b" });
  assert.equal(game.state.chain?.items.length, 1);
  assert.equal(game.state.chain?.priorityPlayerId, "p1");
  game.state.chain!.passedPlayerIds = ["p2"];
  const addEnergy = gameplayActions(game, "p1", decks).find(
    (action) =>
      action.sourceCardInstanceId === "p1:rune" &&
      action.label === "Add Energy"
  );
  assert.ok(addEnergy, "feature override must expose Add abilities during Priority");
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: addEnergy.id,
    selectedIds: [],
    decks,
    now: "bb"
  });
  assert.equal(game.state.players.p1!.energy, 1);
  assert.equal(game.state.cardStates["p1:rune"]!.exhausted, true);
  assert.equal(game.state.chain?.items.length, 1);
  assert.equal(game.state.chain?.priorityPlayerId, "p1");
  assert.deepEqual(game.state.chain?.passedPlayerIds, []);
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(game, playerId, decks)[0]!;
    game = performGameplayAction({ game, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks, now: "c" });
  }
  assert.equal(game.state.chain, null);
  assert.ok(game.state.players.p1?.zones.trash.includes("p1:spell"));
  const end = gameplayActions(game, "p1", decks).find((action) => action.label === "End turn")!;
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: end.id, selectedIds: [], decks, now: "d" });
  assert.equal(game.state.turn?.activePlayerId, "p2");
});

test("awakening readies only the new turn player's battlefield units", () => {
  const { game: initial, decks } = fixture();
  const game = structuredClone(initial);
  decks[1]!.instances.push({
    instanceId: "p2:unit",
    ownerPlayerId: "p2",
    source: "mainDeck",
    cardCode: "UNIT"
  });
  game.state.battlefields[0]!.units = ["p1:mover", "p2:unit"];
  game.state.players.p1!.zones.base =
    game.state.players.p1!.zones.base.filter((id) => id !== "p1:mover");
  game.state.cardStates["p1:mover"]!.exhausted = true;
  game.state.cardStates["p2:unit"] = {
    exhausted: true,
    damage: 0,
    computedMight: 1
  };

  const end = gameplayActions(game, "p1", decks).find(
    (action) => action.label === "End turn"
  )!;
  const nextTurn = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: end.id,
    selectedIds: [],
    decks,
    now: "d"
  });

  assert.equal(nextTurn.state.turn?.activePlayerId, "p2");
  assert.equal(nextTurn.state.cardStates["p2:unit"]!.exhausted, false);
  assert.equal(nextTurn.state.cardStates["p1:mover"]!.exhausted, true);
});

test("automatically pays card costs with behavior-backed rune abilities", () => {
  const { game: initial, decks } = fixture();
  const play = gameplayActions(initial, "p1", decks).find(
    (action) => action.label === "Play Unit to Base"
  )!;
  const game = performGameplayAction({ game: initial, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "b" });
  assert.ok(game.state.players.p1!.zones.runeDeck.includes("p1:rune"));
  assert.equal(game.state.cardStates["p1:rune"]!.exhausted, false);
  assert.ok(game.state.players.p1!.zones.base.includes("p1:rune-b"));
  assert.equal(game.state.cardStates["p1:rune-b"]!.exhausted, false);
  assert.ok(game.state.players.p1!.zones.base.includes("p1:unit"));
});

test("plays Units to Base or a controlled battlefield and rejects forged destinations", () => {
  const { game, decks } = fixture();
  game.state.battlefields[0]!.controllerPlayerId = "p1";

  const actions = gameplayActions(game, "p1", decks).filter(
    (action) => action.sourceCardInstanceId === "p1:unit"
  );
  assert.deepEqual(
    actions.map((action) => action.label),
    ["Play Unit to Base", "Play Unit to Arena"]
  );

  const battlefieldPlay = actions.find(
    (action) => action.label === "Play Unit to Arena"
  )!;
  assert.throws(
    () => performGameplayAction({
      game,
      actorPlayerId: "p1",
      actionId: battlefieldPlay.id.replace(
        encodeURIComponent("p1:bf"),
        encodeURIComponent("forged-battlefield")
      ),
      selectedIds: [],
      decks,
      now: "forged"
    }),
    /Action is not legal/
  );

  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: battlefieldPlay.id,
    selectedIds: [],
    decks,
    now: "battlefield-play"
  });
  assert.ok(next.state.battlefields[0]!.units.includes("p1:unit"));
  assert.equal(next.state.players.p1!.zones.base.includes("p1:unit"), false);
  assert.equal(next.state.cardStates["p1:unit"]!.exhausted, true);
});

test("plays a permitted Unit directly to an open battlefield", () => {
  const { game, decks } = fixture();
  const definition = decks[0]!.snapshot.cards.find(
    (card) => card.cardCode === "UNIT",
  )!;
  definition.behaviorModel.clauses.push({
    id: "open-battlefield",
    sequence: 0,
    sourceText: "",
    normalizedText: "",
    abilities: [],
    triggers: [],
    conditions: [],
    selectors: [],
    choices: [],
    costs: [],
    timings: [],
    effects: [{
      behaviorId: "modifier.play_unit_destination",
      parameters: { destination: "openBattlefield" },
      confidence: "high",
      order: 0,
    }],
    keywords: [],
  });

  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.label === "Play Unit to Arena",
  );
  assert.ok(play);
  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: [],
    decks,
    now: "open-battlefield-play",
  });

  assert.ok(next.state.battlefields[0]!.units.includes("p1:unit"));
  assert.equal(next.state.battlefields[0]!.controllerPlayerId, "p1");
});

function fixture(): { game: GameDocument; decks: DeckSnapshotDocument[] } {
  const cards = [
    definition("RUNE", "Rune", "Rune", 0, 0),
    definition("UNIT", "Unit", "Unit", 1, 1, 1),
    definition("SPELL", "Spell", "Spell", 0, 0),
    definition("BF", "Arena", "Battlefield", 0, 0)
  ];
  const instances = [
    { instanceId: "p1:rune", ownerPlayerId: "p1", source: "runeDeck" as const, cardCode: "RUNE" },
    { instanceId: "p1:rune-b", ownerPlayerId: "p1", source: "runeDeck" as const, cardCode: "RUNE" },
    { instanceId: "p1:unit", ownerPlayerId: "p1", source: "mainDeck" as const, cardCode: "UNIT" },
    { instanceId: "p1:mover", ownerPlayerId: "p1", source: "mainDeck" as const, cardCode: "UNIT" },
    { instanceId: "p1:spell", ownerPlayerId: "p1", source: "mainDeck" as const, cardCode: "SPELL" },
    { instanceId: "p1:draw", ownerPlayerId: "p1", source: "mainDeck" as const, cardCode: "UNIT" },
    { instanceId: "p1:bf", ownerPlayerId: "p1", source: "battlefield" as const, cardCode: "BF" }
  ];
  const snapshot = { sourceText: "", catalogDigest: "x", entries: [], cards };
  const decks = [{ id: "d1", createdAt: "a", updatedAt: "a", matchId: "m", playerId: "p1", snapshot, instances }, { id: "d2", createdAt: "a", updatedAt: "a", matchId: "m", playerId: "p2", snapshot, instances: [] }];
  const zones = (base: string[], mainDeck: string[], hand: string[]) => ({ legend: null, champion: null, mainDeck, runeDeck: [], hand, trash: [], banishment: [], base });
  const game: GameDocument = {
    id: "g", matchId: "m", createdAt: "a", updatedAt: "a", stateVersion: 0,
    status: "in_progress", winnerPlayerId: null,
    state: {
      setup: { playerIds: ["p1", "p2"], startingPlayerChooserId: "p1", startingPlayerId: "p1", battlefieldPools: {}, battlefieldChoices: {}, mulligans: {} },
      players: { p1: { playerId: "p1", energy: 0, conditionalEnergy: 0, power: {}, zones: zones(["p1:rune", "p1:rune-b", "p1:mover"], ["p1:draw"], ["p1:unit", "p1:spell"]) }, p2: { playerId: "p2", energy: 0, conditionalEnergy: 0, power: {}, zones: zones([], [], []) } },
      battlefields: [{ battlefieldId: "p1:bf", cardInstanceId: "p1:bf", selectedByPlayerId: "p1", units: [] }],
      cardStates: { "p1:rune": { exhausted: false, damage: 0, computedMight: null }, "p1:rune-b": { exhausted: false, damage: 0, computedMight: null }, "p1:unit": { exhausted: false, damage: 0, computedMight: 1 }, "p1:mover": { exhausted: false, damage: 0, computedMight: 1 }, "p1:spell": { exhausted: false, damage: 0, computedMight: null }, "p1:draw": { exhausted: false, damage: 0, computedMight: 1 }, "p1:bf": { exhausted: false, damage: 0, computedMight: null } },
      turn: { turnNumber: 1, activePlayerId: "p1", phase: "action" }, chain: null, showdown: null, combat: null,
      modifiers: [], delayedEffects: [], effectResolutions: [], pendingChoice: null, queuedTriggerChoices: []
    }
  };
  return { game, decks };
}

function definition(code: string, name: string, type: "Rune" | "Unit" | "Spell" | "Battlefield", energy: number, might: number, power = 0) {
  const runeClauses = type === "Rune" ? [{
    id: "energy", sequence: 0, sourceText: "", normalizedText: "",
    abilities: [{ behaviorId: "ability.exhaust_for_resource", parameters: { resourceType: "energy", amountSource: "constant", amount: 1, usage: "unrestricted" }, confidence: "high" as const, order: 0 }],
    triggers: [], conditions: [], selectors: [], choices: [], costs: [], timings: [], effects: [], keywords: []
  }, {
    id: "power", sequence: 1, sourceText: "", normalizedText: "",
    abilities: [{ behaviorId: "ability.recycle_for_power", parameters: { amount: 1, domain: "sourceDomain", usage: "unrestricted" }, confidence: "high" as const, order: 0 }],
    triggers: [], conditions: [], selectors: [], choices: [], costs: [], timings: [], effects: [], keywords: []
  }] : [];
  return { cardCode: code, sourceTextHash: "h", behaviorModel: { playTimings: [], clauses: runeClauses }, card: { id: code, name, public_code: `${code}/1`, attributes: { energy, might, power }, classification: { type, supertype: type === "Rune" ? "Basic" as const : null, domain: ["Mind"] }, text: { plain: "" }, set: { set_id: "T", label: "Test" }, media: {}, tags: [], metadata: {} } };
}
