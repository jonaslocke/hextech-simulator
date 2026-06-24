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
  buildDeckSnapshotV2, createInitialGameV2, createRuntimeDeckSnapshot,
  effectiveEnergyCostV2, gameplayActionsV2, performGameplayActionV2,
  type DeckSnapshotDocumentV2, type GameDocumentV2
} from "../src/server/game-v2";

const EXECUTABLE = [
  "Lady of Luminosity - Starter", "Lux, Illuminated", "Lux, Crownguard", "Mind Rune", "Order Rune",
  "Stupefy", "Ravenbloom Student", "Back to Back", "Eager Apprentice", "Lecturing Yordle",
  "Falling Comet", "Blast of Power", "Singularity", "Vanguard Attendant", "Final Spark",
  "Vanguard Sergeant", "Mega-Mech"
] as const;
const DEFERRED = ["Daring Poro", "The Papertree", "Targon's Peak", "Aspirant's Climb"] as const;

test("classifies every Lux card as executable or explicitly deferred", async () => {
  const template = await fixtureSnapshot();
  assert.equal(template.cards.length, 21);
  assert.deepEqual(new Set(template.cards.map((item) => item.card.name)), new Set([...EXECUTABLE, ...DEFERRED]));
});

test("executes all direct non-combat Lux spell and unit families", async () => {
  const template = await fixtureSnapshot();
  for (const spell of ["Back to Back", "Falling Comet", "Blast of Power", "Singularity", "Final Spark"] as const) {
    const fixture = runtimeFixture(template);
    let game = fixture.game;
    const decks = fixture.decks;
    const source = instanceNamed(decks, "p1", spell);
    const friendlyOne = instanceNamed(decks, "p1", "Vanguard Sergeant");
    const friendlyTwo = instanceNamed(decks, "p1", "Mega-Mech");
    const enemyOne = instanceNamed(decks, "p2", "Vanguard Sergeant");
    const enemyTwo = instanceNamed(decks, "p2", "Mega-Mech");
    relocate(game, "p1", source, "hand");
    relocateToBattlefield(game, "p1", friendlyOne);
    relocateToBattlefield(game, "p1", friendlyTwo);
    relocateToBattlefield(game, "p2", enemyOne);
    relocateToBattlefield(game, "p2", enemyTwo);
    const selected = spell === "Back to Back"
      ? [friendlyOne, friendlyTwo]
      : spell === "Singularity"
        ? [enemyOne, enemyTwo]
        : [enemyOne];
    const before = Object.fromEntries(selected.map((id) => [id, game.state.cardStates[id]!.computedMight]));
    const play = gameplayActionsV2(game, "p1", decks).find((action) => action.sourceCardInstanceId === source)!;
    assert.ok(play, `${spell} should be playable`);
    game = performGameplayActionV2({ game, actorPlayerId: "p1", actionId: play.id, selectedIds: selected, decks, now: "b" });
    game = resolveAll(game, decks);
    assert.ok(game.state.players.p1!.zones.trash.includes(source));
    if (spell === "Back to Back") {
      selected.forEach((id) => assert.equal(game.state.cardStates[id]!.computedMight, (before[id] ?? 0) + 2));
    } else {
      selected.forEach((id) => assert.ok(game.state.cardStates[id]!.damage > 0 || game.state.players.p2!.zones.trash.includes(id)));
    }
  }

  for (const unit of ["Vanguard Attendant", "Vanguard Sergeant", "Mega-Mech"] as const) {
    const fixture = runtimeFixture(template);
    let game = fixture.game;
    const decks = fixture.decks;
    const source = instanceNamed(decks, "p1", unit);
    relocate(game, "p1", source, "hand");
    const play = gameplayActionsV2(game, "p1", decks).find((action) => action.sourceCardInstanceId === source)!;
    game = performGameplayActionV2({ game, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "c" });
    assert.ok(game.state.players.p1!.zones.base.includes(source));
    assert.equal(game.state.cardStates[source]!.exhausted, unit !== "Vanguard Attendant");
  }
});

test("executes Lux resource abilities, controller discounts, and play triggers", async () => {
  const template = await fixtureSnapshot();
  let { game, decks } = runtimeFixture(template);
  for (const runeName of ["Mind Rune", "Order Rune"] as const) {
    const rune = instanceNamed(decks, "p1", runeName);
    relocate(game, "p1", rune, "base");
    const addEnergy = gameplayActionsV2(game, "p1", decks).find((action) => action.sourceCardInstanceId === rune && action.label === "Add Energy")!;
    game = performGameplayActionV2({ game, actorPlayerId: "p1", actionId: addEnergy.id, selectedIds: [], decks, now: "d" });
    assert.equal(game.state.cardStates[rune]!.exhausted, true);
  }
  const crownguard = instanceNamed(decks, "p1", "Lux, Crownguard");
  relocate(game, "p1", crownguard, "base");
  const energyBefore = game.state.players.p1!.conditionalEnergy;
  const ability = gameplayActionsV2(game, "p1", decks).find((action) => action.sourceCardInstanceId === crownguard)!;
  game = performGameplayActionV2({ game, actorPlayerId: "p1", actionId: ability.id, selectedIds: [], decks, now: "e" });
  assert.equal(game.state.players.p1!.conditionalEnergy, energyBefore + 2);

  ({ game, decks } = runtimeFixture(template));
  const eager = instanceNamed(decks, "p1", "Eager Apprentice");
  const spellDefinition = definitionNamed(decks, "Final Spark");
  relocateToBattlefield(game, "p1", eager);
  game.state.modifiers.push({
    id: "eager", sourceCardInstanceId: eager, controllerPlayerId: "p1", targetCardInstanceId: null,
    attribute: "energyCost", operation: "reduce", amount: 1, minimum: 1,
    duration: "whileSourceAtBattlefield", createdAtTurn: 1
  });
  assert.equal(effectiveEnergyCostV2(game, "p1", spellDefinition), Math.max(1, (spellDefinition.card.attributes.energy ?? 0) - 1));
  assert.equal(effectiveEnergyCostV2(game, "p2", spellDefinition), spellDefinition.card.attributes.energy);

  ({ game, decks } = runtimeFixture(template));
  const lady = instanceNamed(decks, "p1", "Lady of Luminosity - Starter");
  const illuminated = instanceNamed(decks, "p1", "Lux, Illuminated");
  const raven = instanceNamed(decks, "p1", "Ravenbloom Student");
  const finalSpark = instanceNamed(decks, "p1", "Final Spark");
  const target = instanceNamed(decks, "p2", "Mega-Mech");
  relocateLegend(game, "p1", lady);
  relocate(game, "p1", illuminated, "base");
  relocate(game, "p1", raven, "base");
  relocate(game, "p1", finalSpark, "hand");
  relocateToBattlefield(game, "p2", target);
  const luxBefore = game.state.cardStates[illuminated]!.computedMight!;
  const ravenBefore = game.state.cardStates[raven]!.computedMight!;
  const deckBefore = game.state.players.p1!.zones.mainDeck.length;
  const play = gameplayActionsV2(game, "p1", decks).find((action) => action.sourceCardInstanceId === finalSpark)!;
  game = performGameplayActionV2({ game, actorPlayerId: "p1", actionId: play.id, selectedIds: [target], decks, now: "f" });
  game = resolveAll(game, decks);
  assert.equal(game.state.players.p1!.zones.mainDeck.length, deckBefore - 1);
  assert.equal(game.state.cardStates[illuminated]!.computedMight, luxBefore + 3);
  assert.equal(game.state.cardStates[raven]!.computedMight, ravenBefore + 1);

  ({ game, decks } = runtimeFixture(template));
  const yordle = instanceNamed(decks, "p1", "Lecturing Yordle");
  relocate(game, "p1", yordle, "hand");
  const yordleDeckBefore = game.state.players.p1!.zones.mainDeck.length;
  const playYordle = gameplayActionsV2(game, "p1", decks).find((action) => action.sourceCardInstanceId === yordle)!;
  game = performGameplayActionV2({ game, actorPlayerId: "p1", actionId: playYordle.id, selectedIds: [], decks, now: "g" });
  game = resolveAll(game, decks);
  assert.equal(game.state.players.p1!.zones.mainDeck.length, yordleDeckBefore - 1);
});

function runtimeFixture(template: Awaited<ReturnType<typeof fixtureSnapshot>>) {
  const runtime = [createRuntimeDeckSnapshot(template, "p1"), createRuntimeDeckSnapshot(template, "p2")] as const;
  const decks: DeckSnapshotDocumentV2[] = runtime.map((deck, index) => ({
    id: `d${index}`, createdAt: "a", updatedAt: "a", matchId: "m", playerId: index ? "p2" : "p1", snapshot: deck.template, instances: deck.instances
  }));
  const game = createInitialGameV2({ matchId: "m", gameId: "g", now: "a", rngSeed: "seed", playerIds: ["p1", "p2"], decks: [runtime[0], runtime[1]] });
  game.status = "in_progress";
  game.state.setup.startingPlayerId = "p1";
  game.state.turn = { turnNumber: 1, activePlayerId: "p1", phase: "action" };
  game.state.players.p1!.energy = 30;
  game.state.players.p1!.power = { Mind: 30, Order: 30, Rainbow: 30 };
  for (const playerId of ["p1", "p2"] as const) {
    const battlefield = decks.find((deck) => deck.playerId === playerId)!.instances.find((item) => item.source === "battlefield")!;
    game.state.battlefields.push({ battlefieldId: battlefield.instanceId, cardInstanceId: battlefield.instanceId, selectedByPlayerId: playerId, units: [] });
  }
  return { game, decks };
}

function resolveAll(initial: GameDocumentV2, decks: DeckSnapshotDocumentV2[]) {
  let game = initial;
  while (game.state.pendingChoice || game.state.chain) {
    if (game.state.pendingChoice) {
      const actor = game.state.pendingChoice.playerId;
      const order = gameplayActionsV2(game, actor, decks)[0]!;
      game = performGameplayActionV2({ game, actorPlayerId: actor, actionId: order.id, selectedIds: [], decks, now: "r" });
      continue;
    }
    const actor = game.state.chain!.priorityPlayerId;
    const pass = gameplayActionsV2(game, actor, decks).find((action) => action.label === "Pass priority")!;
    game = performGameplayActionV2({ game, actorPlayerId: actor, actionId: pass.id, selectedIds: [], decks, now: "r" });
  }
  return game;
}

function instanceNamed(decks: DeckSnapshotDocumentV2[], playerId: string, name: string) {
  const deck = decks.find((item) => item.playerId === playerId)!;
  const code = deck.snapshot.cards.find((item) => item.card.name === name)!.cardCode;
  return deck.instances.find((item) => item.cardCode === code)!.instanceId;
}
function definitionNamed(decks: DeckSnapshotDocumentV2[], name: string) {
  return decks[0]!.snapshot.cards.find((item) => item.card.name === name)!;
}
function relocate(game: GameDocumentV2, playerId: string, id: string, zone: "base" | "hand") {
  const player = game.state.players[playerId]!;
  for (const [key, value] of Object.entries(player.zones)) if (Array.isArray(value)) (player.zones as unknown as Record<string, string[]>)[key] = value.filter((item) => item !== id);
  game.state.battlefields.forEach((battlefield) => { battlefield.units = battlefield.units.filter((item) => item !== id); });
  player.zones[zone].push(id);
  game.state.cardStates[id]!.exhausted = false;
}
function relocateToBattlefield(game: GameDocumentV2, playerId: string, id: string) {
  relocate(game, playerId, id, "base");
  game.state.players[playerId]!.zones.base = game.state.players[playerId]!.zones.base.filter((item) => item !== id);
  game.state.battlefields.find((item) => item.selectedByPlayerId === playerId)!.units.push(id);
}
function relocateLegend(game: GameDocumentV2, playerId: string, id: string) {
  relocate(game, playerId, id, "base");
  game.state.players[playerId]!.zones.base = game.state.players[playerId]!.zones.base.filter((item) => item !== id);
  game.state.players[playerId]!.zones.legend = id;
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
  return buildDeckSnapshotV2(sourceText, documents, primitives.map((item) => buildBehaviorDefinitionDocument(item, "a")));
}
