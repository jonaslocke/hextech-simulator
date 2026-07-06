import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  analyzeCardBehaviorSuggestions,
  buildBehaviorDefinitionDocument,
  buildCanonicalCardDocument,
  buildCurrentBehaviorCatalog,
  hashCardRulesText,
} from "../src/server/card-catalog";
import { loadCardCatalog } from "../src/server/catalog";
import { parseDeckList } from "../src/server/deck";
import {
  buildDeckSnapshot,
  cleanupBoard,
  compileBehaviorModel,
  createBehaviorContext,
  createInitialGame,
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  createRuntimeDeckSnapshot,
  executeBehaviorClause,
  gameplayActions,
  performGameplayAction,
  recomputeAllMight,
} from "../src/server/game";
import type { DeckSnapshotDocument } from "../src/server/game/repositories";
import type { GameDocument } from "../src/server/game/state";

test("executes Master Yi optional costs, fallbacks, and enter-ready effects", async () => {
  const { game: initial, decks } = runtimeFixture(await fixtureSnapshot());
  let game = initial;
  const meditation = instanceNamed(decks, "p1", "Meditation");
  const confront = instanceNamed(decks, "p1", "Confront");
  const mobilize = instanceNamed(decks, "p1", "Mobilize");
  const unit = instanceNamed(decks, "p1", "Playful Phantom");
  relocate(game, "p1", meditation, "hand");
  relocate(game, "p1", unit, "base");
  const beforeMeditation = game.state.players.p1!.zones.hand.length;
  game = playAndResolve(game, decks, "Meditation", [unit]);
  assert.equal(game.state.cardStates[unit]!.exhausted, true);
  assert.equal(
    game.state.players.p1!.zones.hand.length,
    beforeMeditation - 1 + 2,
  );

  relocate(game, "p1", confront, "hand");
  game = playAndResolve(game, decks, "Confront", []);
  assert.ok(
    game.state.ongoingEffects.some(
      (effect) => effect.behaviorId === "modifier.enter_ready",
    ),
  );
  relocate(game, "p1", unit, "hand");
  const playUnit = gameplayActions(game, "p1", decks).find(
    (action) =>
      action.label === "Play Playful Phantom to Base",
  )!;
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: playUnit.id,
    selectedIds: [],
    decks,
    now: "unit",
  });
  assert.equal(game.state.cardStates[unit]!.exhausted, false);

  game.state.players.p1!.zones.runeDeck = [];
  relocate(game, "p1", mobilize, "hand");
  const beforeMobilize = game.state.players.p1!.zones.hand.length;
  game = playAndResolve(game, decks, "Mobilize", []);
  assert.equal(game.state.players.p1!.zones.hand.length, beforeMobilize);
});

test("evaluates Master Yi continuous Might and Ganking permissions", async () => {
  const fixture = runtimeFixture(await fixtureSnapshot());
  let { game } = fixture;
  const { decks } = fixture;
  const index = createRuntimeCardIndex(decks);
  const legend = instanceNamed(decks, "p1", "Wuju Bladesman - Starter");
  const wielder = instanceNamed(decks, "p1", "Wielder of Water");
  const yi = instanceNamed(decks, "p1", "Yi, Meditative");
  const honed = instanceNamed(decks, "p1", "Yi, Honed");
  relocateLegend(game, "p1", legend);
  relocate(game, "p1", wielder, "base");
  relocate(game, "p1", yi, "base");
  relocateToBattlefield(game, "p1", honed);

  const runes = decks[0]!.instances
    .filter((item) => item.source === "runeDeck")
    .slice(0, 8)
    .map((item) => item.instanceId);
  for (const rune of runes) relocate(game, "p1", rune, "base");
  recomputeAllMight(game, index);
  assert.equal(game.state.cardStates[yi]!.computedMight, 8);

  game.state.cardStates[wielder]!.combatRole = "defender";
  recomputeAllMight(game, index);
  assert.equal(game.state.cardStates[wielder]!.computedMight, 6);

  const gank = gameplayActions(game, "p1", decks).find((action) =>
    action.label.startsWith("Gank "),
  );
  assert.ok(gank);
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: gank.id,
    selectedIds: [],
    decks,
    now: "gank",
  });
  assert.equal(game.state.cardStates[honed]!.exhausted, true);
  assert.ok(
    game.state.battlefields
      .find((item) => item.selectedByPlayerId === "p2")!
      .units.includes(honed),
  );
  game.state.players.p1!.zones.runeDeck.push(runes[0]!);
  game.state.players.p1!.zones.base =
    game.state.players.p1!.zones.base.filter((id) => id !== runes[0]);
  cleanupBoard(game, index);
  assert.equal(game.state.cardStates[yi]!.computedMight, 4);
});

test("resolves Master Yi combat damage, duel, and death replacement", async () => {
  const { game, decks } = runtimeFixture(await fixtureSnapshot());
  const index = createRuntimeCardIndex(decks);
  const handlers = createPrimitiveHandlers(index);
  const friendly = instanceNamed(decks, "p1", "Wielder of Water");
  const enemy = instanceNamed(decks, "p2", "Mountain Drake");
  const highlander = instanceNamed(decks, "p1", "Highlander");
  relocate(game, "p1", friendly, "base");
  relocate(game, "p2", enemy, "base");

  executeCardClause(game, decks, handlers, "p1", "En Garde", [friendly]);
  assert.equal(game.state.cardStates[friendly]!.computedMight, 4);

  relocateToBattlefield(game, "p1", friendly);
  relocate(game, "p2", enemy, "base");
  game.state.players.p2!.zones.base =
    game.state.players.p2!.zones.base.filter((id) => id !== enemy);
  game.state.battlefields.find(
    (item) => item.selectedByPlayerId === "p1",
  )!.units.push(enemy);
  game.state.combat = {
    battlefieldId: game.state.battlefields.find(
      (item) => item.selectedByPlayerId === "p1",
    )!.battlefieldId,
    stage: "showdown",
    attackerPlayerId: "p1",
    defenderPlayerId: "p2",
    attackerUnitIds: [friendly],
    defenderUnitIds: [enemy],
    attackerMight: null,
    defenderMight: null,
    attackerAssignments: [],
    defenderAssignments: [],
  };
  executeCardClause(game, decks, handlers, "p1", "Cannon Barrage", []);
  assert.equal(game.state.cardStates[enemy]!.damage, 2);
  game.state.modifiers = [];
  recomputeAllMight(game, index);

  executeCardClause(
    game,
    decks,
    handlers,
    "p1",
    "Gentlemen's Duel",
    [friendly, enemy],
  );
  assert.equal(game.state.cardStates[friendly]!.computedMight, 5);
  assert.equal(game.state.players.p1!.zones.trash.includes(friendly), true);
  assert.equal(game.state.cardStates[enemy]!.damage, 7);

  const protectedUnit = instanceNamed(decks, "p1", "Zephyr Sage");
  relocate(game, "p1", protectedUnit, "base");
  executeCardClause(
    game,
    decks,
    handlers,
    "p1",
    "Highlander",
    [protectedUnit],
    highlander,
  );
  game.state.cardStates[protectedUnit]!.damage = 6;
  cleanupBoard(game, index);
  assert.equal(game.state.players.p1!.zones.trash.includes(protectedUnit), false);
  assert.equal(game.state.players.p1!.zones.base.includes(protectedUnit), true);
  assert.equal(game.state.cardStates[protectedUnit]!.exhausted, true);
  cleanupBoard(game, index);
  assert.equal(game.state.players.p1!.zones.base.includes(protectedUnit), true);
});

function executeCardClause(
  game: GameDocument,
  decks: DeckSnapshotDocument[],
  handlers: ReturnType<typeof createPrimitiveHandlers>,
  playerId: string,
  cardName: string,
  selectedIds: string[],
  sourceId = instanceNamed(decks, playerId, cardName),
) {
  const definition = definitionNamed(decks, cardName);
  const clause = compileBehaviorModel(
    definition.behaviorModel,
    handlers,
  ).clauses[0]!;
  executeBehaviorClause({
    clause,
    context: createBehaviorContext(
      game,
      playerId,
      sourceId,
      null,
      selectedIds,
    ),
    handlers,
  });
}

function playAndResolve(
  initial: GameDocument,
  decks: DeckSnapshotDocument[],
  cardName: string,
  selectedIds: string[],
) {
  const play = gameplayActions(initial, "p1", decks).find(
    (action) => action.label === `Play ${cardName}`,
  )!;
  let game = performGameplayAction({
    game: initial,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds,
    decks,
    now: `play-${cardName}`,
  });
  while (game.state.chain) {
    const actor = game.state.chain.priorityPlayerId;
    const pass = gameplayActions(game, actor, decks).find(
      (action) => action.label === "Pass priority",
    )!;
    game = performGameplayAction({
      game,
      actorPlayerId: actor,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `pass-${cardName}`,
    });
  }
  return game;
}

function runtimeFixture(template: Awaited<ReturnType<typeof fixtureSnapshot>>) {
  const runtime = [
    createRuntimeDeckSnapshot(template, "p1"),
    createRuntimeDeckSnapshot(template, "p2"),
  ] as const;
  const decks: DeckSnapshotDocument[] = runtime.map((deck, index) => ({
    id: `d${index}`,
    createdAt: "a",
    updatedAt: "a",
    matchId: "m",
    playerId: index ? "p2" : "p1",
    snapshot: deck.template,
    instances: deck.instances,
  }));
  const game = createInitialGame({
    matchId: "m",
    gameId: "g",
    now: "a",
    rngSeed: "seed",
    playerIds: ["p1", "p2"],
    decks: [runtime[0], runtime[1]],
  });
  game.status = "in_progress";
  game.state.setup.startingPlayerId = "p1";
  game.state.turn = {
    turnNumber: 1,
    activePlayerId: "p1",
    phase: "action",
  };
  game.state.players.p1!.energy = 50;
  game.state.players.p1!.power = { Calm: 20, Body: 20, Rainbow: 20 };
  for (const playerId of ["p1", "p2"] as const) {
    const battlefield = decks
      .find((deck) => deck.playerId === playerId)!
      .instances.find((item) => item.source === "battlefield")!;
    game.state.battlefields.push({
      battlefieldId: battlefield.instanceId,
      cardInstanceId: battlefield.instanceId,
      selectedByPlayerId: playerId,
      units: [],
    });
  }
  return { game, decks };
}

async function fixtureSnapshot() {
  const sourceText = await readFile("data/decks/masteryi.dec.txt", "utf8");
  const catalog = await loadCardCatalog();
  const cards = [...new Set(
    parseDeckList(sourceText).entries.map((entry) => entry.name),
  )].map((name) => catalog.byName.get(name)!);
  const primitives = await buildCurrentBehaviorCatalog();
  const report = analyzeCardBehaviorSuggestions(cards, [], primitives);
  const documents = cards.map((card) => {
    const cardCode = card.public_code.split("/")[0]!;
    const suggestion = report.cards.find((item) => item.cardCode === cardCode)!;
    return buildCanonicalCardDocument(
      {
        cardCode,
        card,
        sourceTextHash: hashCardRulesText(card),
        modelingStatus: "approved",
        adminNotes: "",
        clauses: suggestion.clauses.map((clause) => ({
          id: clause.id,
          sourceText: clause.sourceText,
          normalizedText: clause.normalizedText,
          unsupportedReason: clause.unsupportedReason,
          assignments: clause.assignments.map((item) => item.assignment),
        })),
      },
      primitives,
      "a",
      "b",
    );
  });
  return buildDeckSnapshot(
    sourceText,
    documents,
    primitives.map((item) => buildBehaviorDefinitionDocument(item, "a")),
  );
}

function instanceNamed(
  decks: DeckSnapshotDocument[],
  playerId: string,
  name: string,
) {
  const deck = decks.find((item) => item.playerId === playerId)!;
  const code = deck.snapshot.cards.find((item) => item.card.name === name)!
    .cardCode;
  return deck.instances.find((item) => item.cardCode === code)!.instanceId;
}

function definitionNamed(decks: DeckSnapshotDocument[], name: string) {
  return decks[0]!.snapshot.cards.find((item) => item.card.name === name)!;
}

function relocate(
  game: GameDocument,
  playerId: string,
  id: string,
  zone: "base" | "hand",
) {
  const player = game.state.players[playerId]!;
  for (const [key, value] of Object.entries(player.zones)) {
    if (Array.isArray(value)) {
      (player.zones as unknown as Record<string, string[]>)[key] =
        value.filter((item) => item !== id);
    }
  }
  game.state.battlefields.forEach((battlefield) => {
    battlefield.units = battlefield.units.filter((item) => item !== id);
  });
  player.zones[zone].push(id);
  game.state.cardStates[id]!.exhausted = false;
}

function relocateToBattlefield(
  game: GameDocument,
  playerId: string,
  id: string,
) {
  relocate(game, playerId, id, "base");
  game.state.players[playerId]!.zones.base =
    game.state.players[playerId]!.zones.base.filter((item) => item !== id);
  game.state.battlefields.find(
    (item) => item.selectedByPlayerId === playerId,
  )!.units.push(id);
}

function relocateLegend(game: GameDocument, playerId: string, id: string) {
  relocate(game, playerId, id, "base");
  game.state.players[playerId]!.zones.base =
    game.state.players[playerId]!.zones.base.filter((item) => item !== id);
  game.state.players[playerId]!.zones.legend = id;
}
