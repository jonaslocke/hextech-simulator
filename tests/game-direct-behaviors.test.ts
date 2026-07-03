import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  analyzeCardBehaviorSuggestions, buildBehaviorDefinitionDocument,
  buildCanonicalCardDocument, buildCurrentBehaviorCatalog, hashCardRulesText
} from "../src/server/card-catalog";
import { loadCardCatalog } from "../src/server/catalog";
import { parseDeckList } from "../src/server/deck";
import {
  buildDeckSnapshot, createInitialGame, createRuntimeDeckSnapshot,
  gameplayActions, isAbilityTimingAllowed, performGameplayAction,
  type DeckSnapshotDocument
} from "../src/server/game";

test("executes projected rune abilities and ordered targeted spell effects from canonical models", async () => {
  const template = await fixtureSnapshot();
  const runtime = [createRuntimeDeckSnapshot(template, "p1"), createRuntimeDeckSnapshot(template, "p2")] as const;
  const decks: DeckSnapshotDocument[] = runtime.map((deck, index) => ({
    id: `d${index}`, createdAt: "a", updatedAt: "a", matchId: "m",
    playerId: index ? "p2" : "p1", snapshot: deck.template, instances: deck.instances
  }));
  let game = createInitialGame({ matchId: "m", gameId: "g", now: "2026-01-01T00:00:00.000Z", rngSeed: "seed", playerIds: ["p1", "p2"], decks: [runtime[0], runtime[1]] });
  game.status = "in_progress";
  game.state.setup.startingPlayerId = "p1";
  game.state.turn = { turnNumber: 1, activePlayerId: "p1", phase: "action" };
  game.state.players.p1!.energy = 20;
  game.state.players.p1!.power = { Mind: 20, Order: 20 };

  const rune = instanceNamed(decks, "p1", "Mind Rune");
  const orderRune = instanceNamed(decks, "p1", "Order Rune");
  const stupefy = instanceNamed(decks, "p1", "Stupefy");
  const friendlyOne = instanceNamed(decks, "p1", "Vanguard Sergeant");
  const friendlyTwo = instanceNamed(decks, "p1", "Daring Poro");
  const friendlyBase = instanceNamed(decks, "p1", "Mega-Mech");
  const enemy = instanceNamed(decks, "p2", "Vanguard Sergeant");
  relocate(game, rune, "base");
  relocate(game, orderRune, "base");
  relocate(game, stupefy, "hand");
  relocate(game, friendlyBase, "base");
  relocateToBattlefield(game, friendlyOne, "p1");
  relocateToBattlefield(game, friendlyTwo, "p1");
  relocateToBattlefield(game, enemy, "p2");

  const orderRuneActions = gameplayActions(game, "p1", decks).filter(
    (action) => action.sourceCardInstanceId === orderRune
  );
  assert.deepEqual(
    orderRuneActions.map((action) => action.label),
    ["Add Energy", "Add Power [Order]", "Add Energy and Power"]
  );
  const combinedAction = orderRuneActions.find(
    (action) => action.label === "Add Energy and Power"
  )!;
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: combinedAction.id,
    selectedIds: [],
    decks,
    now: "combined-rune-resource"
  });
  assert.equal(game.state.players.p1!.energy, 21);
  assert.equal(game.state.players.p1!.power.Order, 21);
  assert.equal(game.state.players.p1!.zones.base.includes(orderRune), false);
  assert.equal(game.state.players.p1!.zones.runeDeck.includes(orderRune), true);
  assert.equal(game.state.cardStates[orderRune]!.exhausted, false);

  const energyAction = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === rune && action.label === "Add Energy")!;
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: energyAction.id, selectedIds: [], decks, now: "b" });
  assert.equal(game.state.players.p1!.energy, 22);
  assert.equal(game.state.cardStates[rune]!.exhausted, true);
  const exhaustedRuneActions = gameplayActions(game, "p1", decks).filter(
    (action) => action.sourceCardInstanceId === rune
  );
  assert.deepEqual(
    exhaustedRuneActions.map((action) => [action.label, action.enabled]),
    [
      ["Add Energy", false],
      ["Add Power [Mind]", true],
      ["Add Energy and Power", false]
    ]
  );

  const handBefore = game.state.players.p1!.zones.hand.length;
  const enemyMightBefore = game.state.cardStates[enemy]!.computedMight!;
  const play = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === stupefy)!;
  assert.deepEqual(play.targets[0], { kind: "card", legalIds: [friendlyBase, friendlyOne, friendlyTwo, enemy], minimum: 1, maximum: 1 });
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: play.id, selectedIds: [enemy], decks, now: "c" });
  assert.equal(game.state.chain?.priorityPlayerId, "p1");
  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(game, playerId, decks).find((action) => action.label === "Pass priority")!;
    game = performGameplayAction({ game, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks, now: "d" });
  }
  assert.equal(game.state.cardStates[enemy]!.computedMight, enemyMightBefore - 1);
  assert.ok(game.state.players.p1!.zones.trash.includes(stupefy));
  assert.equal(game.state.players.p1!.zones.hand.length, handBefore);
});

test("projects combined Add and evaluates automatic showdown resources for targeted Actions", async () => {
  const template = await fixtureSnapshot();
  const runtime = [
    createRuntimeDeckSnapshot(template, "p1"),
    createRuntimeDeckSnapshot(template, "p2"),
  ] as const;
  const decks: DeckSnapshotDocument[] = runtime.map((deck, index) => ({
    id: `showdown-d${index}`,
    createdAt: "a",
    updatedAt: "a",
    matchId: "showdown",
    playerId: index ? "p2" : "p1",
    snapshot: deck.template,
    instances: deck.instances,
  }));
  const game = createInitialGame({
    matchId: "showdown",
    gameId: "showdown-game",
    now: "2026-01-01T00:00:00.000Z",
    rngSeed: "showdown-seed",
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
  const orderRune = instanceNamed(decks, "p1", "Order Rune");
  const fallingComet = instanceNamed(decks, "p1", "Falling Comet");
  const blastOfPower = instanceNamed(decks, "p1", "Blast of Power");
  const enemy = instanceNamed(decks, "p2", "Vanguard Sergeant");
  relocate(game, orderRune, "base");
  relocate(game, fallingComet, "hand");
  relocate(game, blastOfPower, "hand");
  relocateToBattlefield(game, enemy, "p2");
  const battlefield = game.state.battlefields[0]!;
  game.state.showdown = {
    kind: "nonCombat",
    battlefieldId: battlefield.battlefieldId,
    relevantPlayerIds: ["p1", "p2"],
    focusPlayerId: "p1",
    passedPlayerIds: [],
  };
  game.state.players.p1!.energy = 0;
  game.state.players.p1!.power = {};

  let actions = gameplayActions(game, "p1", decks);
  assert.deepEqual(
    actions
      .filter((action) => action.sourceCardInstanceId === orderRune)
      .map((action) => action.label),
    ["Add Energy", "Add Power [Order]", "Add Energy and Power"],
  );
  const cometAction = actions.find(
    (action) => action.sourceCardInstanceId === fallingComet,
  )!;
  assert.equal(cometAction.enabled, false);
  assert.equal(cometAction.disabledReason, "Card costs cannot be paid.");
  assert.deepEqual(cometAction.targets[0]?.legalIds, [enemy]);

  game.state.players.p1!.energy = 6;
  actions = gameplayActions(game, "p1", decks);
  assert.equal(
    actions.find((action) => action.sourceCardInstanceId === fallingComet)
      ?.enabled,
    true,
  );
  const payableBlast = actions.find(
    (action) => action.sourceCardInstanceId === blastOfPower,
  )!;
  assert.equal(payableBlast.enabled, true);
  const paidGame = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: payableBlast.id,
    selectedIds: [enemy],
    decks,
    now: "showdown-payment",
  });
  assert.equal(
    paidGame.state.players.p1!.zones.runeDeck.includes(orderRune),
    true,
    "Showdown payment should automatically recycle a matching Rune for Power",
  );
});

test("restores standard Add timing when the priority override is disabled", () => {
  assert.equal(
    isAbilityTimingAllowed({
      allowPriorityAddOverride: true,
      hasActionTiming: false,
      hasReactionTiming: false,
      isAddAbility: true,
      timing: "showdownClosed"
    }),
    true
  );
  assert.equal(
    isAbilityTimingAllowed({
      allowPriorityAddOverride: false,
      hasActionTiming: false,
      hasReactionTiming: false,
      isAddAbility: true,
      timing: "showdownClosed"
    }),
    false
  );
  assert.equal(
    isAbilityTimingAllowed({
      allowPriorityAddOverride: false,
      hasActionTiming: false,
      hasReactionTiming: true,
      isAddAbility: true,
      timing: "showdownClosed"
    }),
    true
  );
});

function instanceNamed(decks: DeckSnapshotDocument[], playerId: string, name: string) {
  const deck = decks.find((item) => item.playerId === playerId)!;
  const code = deck.snapshot.cards.find((item) => item.card.name === name)!.cardCode;
  return deck.instances.find((item) => item.cardCode === code)!.instanceId;
}
function relocate(game: ReturnType<typeof createInitialGame>, id: string, zone: "base" | "hand") {
  const player = Object.values(game.state.players).find((item) => Object.values(item.zones).some((value) => Array.isArray(value) ? value.includes(id) : value === id))!;
  for (const [key, value] of Object.entries(player.zones)) {
    if (Array.isArray(value)) (player.zones as unknown as Record<string, string[]>)[key] = value.filter((item) => item !== id);
  }
  player.zones[zone].push(id);
}
function relocateToBattlefield(game: ReturnType<typeof createInitialGame>, id: string, owner: string) {
  relocate(game, id, "base");
  let battlefield = game.state.battlefields.find((item) => item.selectedByPlayerId === owner);
  if (!battlefield) {
    const battlefieldCard = Object.values(game.state.setup.battlefieldPools)[0]?.[0] ?? `bf:${owner}`;
    battlefield = { battlefieldId: battlefieldCard, cardInstanceId: battlefieldCard, selectedByPlayerId: owner, units: [] };
    game.state.battlefields.push(battlefield);
  }
  game.state.players[owner]!.zones.base = game.state.players[owner]!.zones.base.filter((item) => item !== id);
  battlefield.units.push(id);
}

async function fixtureSnapshot() {
  const sourceText = await readFile("data/decks/lux.dec.txt", "utf8");
  const catalog = await loadCardCatalog();
  const cards = [...new Set(parseDeckList(sourceText).entries.map((entry) => entry.name))].map((name) => catalog.byName.get(name)!);
  const primitives = await buildCurrentBehaviorCatalog();
  const report = analyzeCardBehaviorSuggestions(cards, [], primitives);
  const documents = cards.map((card) => {
    const cardCode = card.public_code.split("/")[0]!;
    const suggestion = report.cards.find((item) => item.cardCode === cardCode)!;
    return buildCanonicalCardDocument({ cardCode, card, sourceTextHash: hashCardRulesText(card), modelingStatus: "approved", adminNotes: "", clauses: suggestion.clauses.map((clause) => ({ id: clause.id, sourceText: clause.sourceText, normalizedText: clause.normalizedText, unsupportedReason: clause.unsupportedReason, assignments: clause.assignments.map((item) => item.assignment) })) }, primitives, "a", "b");
  });
  return buildDeckSnapshot(sourceText, documents, primitives.map((entry) => buildBehaviorDefinitionDocument(entry, "a")));
}
