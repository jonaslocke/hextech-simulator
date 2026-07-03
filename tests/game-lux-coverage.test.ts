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
  combatChoiceTargets, createRuntimeCardIndex, effectiveEnergyCost,
  gameplayActions, performGameplayAction,
  type DeckSnapshotDocument, type GameDocument
} from "../src/server/game";

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
    const play = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === source)!;
    assert.ok(play, `${spell} should be playable`);
    game = performGameplayAction({ game, actorPlayerId: "p1", actionId: play.id, selectedIds: selected, decks, now: "b" });
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
    const play = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === source)!;
    game = performGameplayAction({ game, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "c" });
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
    const addEnergy = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === rune && action.label === "Add Energy")!;
    game = performGameplayAction({ game, actorPlayerId: "p1", actionId: addEnergy.id, selectedIds: [], decks, now: "d" });
    assert.equal(game.state.cardStates[rune]!.exhausted, true);
  }
  const crownguard = instanceNamed(decks, "p1", "Lux, Crownguard");
  relocate(game, "p1", crownguard, "base");
  const energyBefore = game.state.players.p1!.conditionalEnergy;
  const ability = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === crownguard)!;
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: ability.id, selectedIds: [], decks, now: "e" });
  assert.equal(game.state.players.p1!.conditionalEnergy, energyBefore + 2);

  ({ game, decks } = runtimeFixture(template));
  const eager = instanceNamed(decks, "p1", "Eager Apprentice");
  const spellDefinition = definitionNamed(decks, "Final Spark");
  relocateToBattlefield(game, "p1", eager);
  game.state.modifiers.push({
    id: "eager", sourceCardInstanceId: eager, controllerPlayerId: "p1", targetCardInstanceId: null,
    targetScope: "controller_spell",
    attribute: "energyCost", operation: "reduce", amount: 1, minimum: 1,
    duration: "whileSourceAtBattlefield", createdAtTurn: 1
  });
  assert.equal(effectiveEnergyCost(game, "p1", spellDefinition), Math.max(1, (spellDefinition.card.attributes.energy ?? 0) - 1));
  assert.equal(effectiveEnergyCost(game, "p2", spellDefinition), spellDefinition.card.attributes.energy);
  assert.equal(
    effectiveEnergyCost(game, "p1", definitionNamed(decks, "Daring Poro")),
    definitionNamed(decks, "Daring Poro").card.attributes.energy
  );

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
  const play = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === finalSpark)!;
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: play.id, selectedIds: [target], decks, now: "f" });
  game = resolveAll(game, decks);
  assert.equal(game.state.players.p1!.zones.mainDeck.length, deckBefore - 1);
  assert.equal(game.state.cardStates[illuminated]!.computedMight, luxBefore + 3);
  assert.equal(game.state.cardStates[raven]!.computedMight, ravenBefore + 1);

  ({ game, decks } = runtimeFixture(template));
  const discountSource = instanceNamed(decks, "p1", "Eager Apprentice");
  const luminosity = instanceNamed(
    decks,
    "p1",
    "Lady of Luminosity - Starter",
  );
  const fallingComet = instanceNamed(decks, "p1", "Falling Comet");
  const discountedTarget = instanceNamed(decks, "p2", "Vanguard Sergeant");
  relocateToBattlefield(game, "p1", discountSource);
  relocateLegend(game, "p1", luminosity);
  relocate(game, "p1", fallingComet, "hand");
  relocateToBattlefield(game, "p2", discountedTarget);
  game.state.players.p1!.energy = 4;
  const discountedDefinition = definitionNamed(decks, "Falling Comet");
  assert.equal(discountedDefinition.card.attributes.energy, 5);
  assert.equal(
    effectiveEnergyCost(
      game,
      "p1",
      discountedDefinition,
      createRuntimeCardIndex(decks),
    ),
    4,
  );
  const discountedDeckBefore = game.state.players.p1!.zones.mainDeck.length;
  const discountedPlay = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === fallingComet,
  )!;
  assert.equal(discountedPlay.enabled, true);
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: discountedPlay.id,
    selectedIds: [discountedTarget],
    decks,
    now: "discounted-spell",
  });
  game = resolveAll(game, decks);
  assert.equal(
    game.state.players.p1!.zones.mainDeck.length,
    discountedDeckBefore - 1,
    "Lux must trigger from printed cost even when Eager Apprentice reduces payment",
  );

  ({ game, decks } = runtimeFixture(template));
  const yordle = instanceNamed(decks, "p1", "Lecturing Yordle");
  relocate(game, "p1", yordle, "hand");
  const yordleDeckBefore = game.state.players.p1!.zones.mainDeck.length;
  const playYordle = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === yordle)!;
  game = performGameplayAction({ game, actorPlayerId: "p1", actionId: playYordle.id, selectedIds: [], decks, now: "g" });
  game = resolveAll(game, decks);
  assert.equal(game.state.players.p1!.zones.mainDeck.length, yordleDeckBefore - 1);
});

test("autopayment only uses Lux Crownguard's Energy for spells", async () => {
  const template = await fixtureSnapshot();
  const { game, decks } = runtimeFixture(template);
  const crownguards = instancesNamed(decks, "p1", "Lux, Crownguard").slice(0, 2);
  const unit = instanceNamed(decks, "p1", "Daring Poro");
  const spell = instanceNamed(decks, "p1", "Stupefy");

  game.state.players.p1!.energy = 0;
  game.state.players.p1!.conditionalEnergy = 0;
  game.state.players.p1!.power = {};
  crownguards.forEach((id) => relocate(game, "p1", id, "base"));
  relocate(game, "p1", unit, "hand");
  relocate(game, "p1", spell, "hand");

  const actions = gameplayActions(game, "p1", decks);
  assert.equal(
    actions.find((action) => action.sourceCardInstanceId === unit)?.enabled,
    false,
    "spell-only Energy sources must not make a Unit payable"
  );
  const playSpell = actions.find((action) => action.sourceCardInstanceId === spell);
  assert.ok(playSpell, "Lux should remain an eligible autopayment source for a Spell");

  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: playSpell.id,
    selectedIds: [crownguards[0]!],
    decks,
    now: "spell-payment"
  });
  assert.equal(
    crownguards.filter((id) => next.state.cardStates[id]!.exhausted).length,
    1
  );
  assert.equal(next.state.players.p1!.conditionalEnergy, 1);
});

test("does not project mandatory-target spells without enough legal targets", async () => {
  const template = await fixtureSnapshot();
  const { game, decks } = runtimeFixture(template);
  const stupefy = instanceNamed(decks, "p1", "Stupefy");
  const singularity = instanceNamed(decks, "p1", "Singularity");

  relocate(game, "p1", stupefy, "hand");
  relocate(game, "p1", singularity, "hand");

  const actions = gameplayActions(game, "p1", decks);
  assert.equal(
    actions.find((action) => action.sourceCardInstanceId === stupefy)?.enabled,
    false,
    "Stupefy requires one Unit target"
  );
  assert.equal(
    actions.some((action) => action.sourceCardInstanceId === singularity),
    true,
    "Singularity permits zero targets"
  );
});

test("lethal damage moves a base Unit exclusively to trash and resets board state", async () => {
  const template = await fixtureSnapshot();
  const fixture = runtimeFixture(template);
  let game = fixture.game;
  const decks = fixture.decks;
  const finalSpark = instanceNamed(decks, "p1", "Final Spark");
  const target = instanceNamed(decks, "p2", "Daring Poro");

  relocate(game, "p1", finalSpark, "hand");
  relocate(game, "p2", target, "base");
  game.state.cardStates[target]!.exhausted = true;

  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === finalSpark
  );
  assert.ok(play);
  game = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: [target],
    decks,
    now: "lethal-base-damage"
  });
  game = resolveAll(game, decks);

  assert.equal(game.state.players.p2!.zones.base.includes(target), false);
  assert.equal(
    game.state.players.p2!.zones.trash.filter((id) => id === target).length,
    1
  );
  assert.equal(game.state.cardStates[target]!.damage, 0);
  assert.equal(game.state.cardStates[target]!.exhausted, false);
});

test("reducing Might to marked damage kills the Unit during cleanup", async () => {
  const template = await fixtureSnapshot();
  const fixture = runtimeFixture(template);
  let game = fixture.game;
  const decks = fixture.decks;
  const singularity = instanceNamed(decks, "p1", "Singularity");
  const stupefies = instancesNamed(decks, "p1", "Stupefy").slice(0, 2);
  const target = instanceNamed(decks, "p2", "Mega-Mech");

  relocate(game, "p1", singularity, "hand");
  stupefies.forEach((id) => relocate(game, "p1", id, "hand"));
  relocate(game, "p2", target, "base");

  for (const spell of [singularity, ...stupefies]) {
    const play = gameplayActions(game, "p1", decks).find(
      (action) => action.sourceCardInstanceId === spell
    );
    assert.ok(play);
    game = performGameplayAction({
      game,
      actorPlayerId: "p1",
      actionId: play.id,
      selectedIds: [target],
      decks,
      now: `play-${spell}`
    });
    game = resolveAll(game, decks);
  }

  assert.equal(game.state.players.p2!.zones.base.includes(target), false);
  assert.equal(
    game.state.players.p2!.zones.trash.filter((id) => id === target).length,
    1
  );
  assert.equal(game.state.cardStates[target]!.damage, 0);
  assert.equal(game.state.cardStates[target]!.computedMight, 6);
});

test("autopayment can exhaust and recycle the same rune for Energy and Power", async () => {
  const template = await fixtureSnapshot();
  const fixture = runtimeFixture(template);
  let game = fixture.game;
  const decks = fixture.decks;
  const player = game.state.players.p1!;
  const runes = decks
    .find((deck) => deck.playerId === "p1")!
    .instances.filter((instance) => instance.source === "runeDeck")
    .map((instance) => instance.instanceId);
  const attendants = instancesNamed(decks, "p1", "Vanguard Attendant").slice(0, 2);

  player.energy = 0;
  player.conditionalEnergy = 0;
  player.power = {};
  runes.forEach((id) => relocate(game, "p1", id, "base"));
  attendants.forEach((id) => relocate(game, "p1", id, "hand"));

  for (const attendant of attendants) {
    const play = gameplayActions(game, "p1", decks).find(
      (action) => action.sourceCardInstanceId === attendant
    );
    assert.ok(play, "twelve runes should pay for two Vanguard Attendants");
    game = performGameplayAction({
      game,
      actorPlayerId: "p1",
      actionId: play.id,
      selectedIds: [],
      decks,
      now: `play-${attendant}`
    });
  }

  const finalPlayer = game.state.players.p1!;
  assert.equal(
    attendants.every((id) => finalPlayer.zones.base.includes(id)),
    true
  );
  assert.equal(
    runes.filter((id) => finalPlayer.zones.runeDeck.includes(id)).length,
    2
  );
});

test("autopayment prioritizes Lux spell Energy before unrestricted rune Energy", async () => {
  const template = await fixtureSnapshot();
  const { game, decks } = runtimeFixture(template);
  const player = game.state.players.p1!;
  const lux = instanceNamed(decks, "p1", "Lux, Crownguard");
  const singularity = instanceNamed(decks, "p1", "Singularity");
  const mindRunes = instancesNamed(decks, "p1", "Mind Rune").slice(0, 2);
  const orderRunes = instancesNamed(decks, "p1", "Order Rune").slice(0, 3);

  player.energy = 0;
  player.conditionalEnergy = 0;
  player.power = {};
  [...mindRunes, ...orderRunes, lux].forEach((id) =>
    relocate(game, "p1", id, "base")
  );
  relocate(game, "p1", singularity, "hand");

  const play = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === singularity
  );
  assert.ok(play);
  const next = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: play.id,
    selectedIds: [],
    decks,
    now: "singularity-payment"
  });
  const nextPlayer = next.state.players.p1!;

  assert.equal(next.state.cardStates[lux]!.exhausted, true);
  assert.equal(nextPlayer.conditionalEnergy, 0);
  assert.equal(
    mindRunes.every((id) => nextPlayer.zones.runeDeck.includes(id)),
    true
  );
  assert.equal(
    orderRunes.filter((id) => next.state.cardStates[id]!.exhausted).length,
    2
  );
});

test("uses real Lux Assault and Tank models during combat", async () => {
  const template = await fixtureSnapshot();
  const { game, decks } = runtimeFixture(template);
  const daringPoro = instanceNamed(decks, "p1", "Daring Poro");
  const attackerSupport = instanceNamed(decks, "p1", "Vanguard Sergeant");
  const lecturingYordle = instanceNamed(decks, "p2", "Lecturing Yordle");
  const defenderSupport = instanceNamed(decks, "p2", "Daring Poro");
  const battlefield = game.state.battlefields.find(
    (candidate) => candidate.selectedByPlayerId === "p2"
  )!;

  relocate(game, "p1", daringPoro, "base");
  relocate(game, "p1", attackerSupport, "base");
  relocateToBattlefield(game, "p2", lecturingYordle);
  relocateToBattlefield(game, "p2", defenderSupport);
  battlefield.controllerPlayerId = "p2";

  const move = gameplayActions(game, "p1", decks).find(
    (action) =>
      action.id.split(":")[3] === "moveMany" &&
      decodeURIComponent(action.id.split(":")[5] ?? "") ===
        battlefield.battlefieldId &&
      action.targets.some(
        (target) =>
          target.legalIds.includes(daringPoro) &&
          target.legalIds.includes(attackerSupport)
      )
  )!;
  let combat = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: move.id,
    selectedIds: [daringPoro, attackerSupport],
    decks,
    now: "combat-move"
  });
  assert.equal(combat.state.cardStates[daringPoro]!.computedMight, 3);

  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(combat, playerId, decks).find(
      (action) => action.label === "Pass focus"
    )!;
    combat = performGameplayAction({
      game: combat,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `combat-pass-${playerId}`
    });
  }

  assert.equal(combat.state.pendingChoice?.type, "assignCombatDamage");
  const targets = combatChoiceTargets(
    combat,
    createRuntimeCardIndex(decks)
  );
  assert.equal(
    targets.find((target) => target.unitId === lecturingYordle)?.hasTank,
    true
  );
  assert.equal(
    targets.find((target) => target.unitId === defenderSupport)?.hasTank,
    false
  );
});

function runtimeFixture(template: Awaited<ReturnType<typeof fixtureSnapshot>>) {
  const runtime = [createRuntimeDeckSnapshot(template, "p1"), createRuntimeDeckSnapshot(template, "p2")] as const;
  const decks: DeckSnapshotDocument[] = runtime.map((deck, index) => ({
    id: `d${index}`, createdAt: "a", updatedAt: "a", matchId: "m", playerId: index ? "p2" : "p1", snapshot: deck.template, instances: deck.instances
  }));
  const game = createInitialGame({ matchId: "m", gameId: "g", now: "a", rngSeed: "seed", playerIds: ["p1", "p2"], decks: [runtime[0], runtime[1]] });
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

function resolveAll(initial: GameDocument, decks: DeckSnapshotDocument[]) {
  let game = initial;
  while (game.state.pendingChoice || game.state.chain) {
    if (game.state.pendingChoice) {
      const actor = game.state.pendingChoice.playerId;
      const choice = gameplayActions(game, actor, decks)[0]!;
      const requirement = choice.targets[0];
      game = performGameplayAction({
        game,
        actorPlayerId: actor,
        actionId: choice.id,
        selectedIds: requirement
          ? requirement.legalIds.slice(0, requirement.minimum)
          : [],
        decks,
        now: "r",
      });
      continue;
    }
    const actor = game.state.chain!.priorityPlayerId;
    const pass = gameplayActions(game, actor, decks).find((action) => action.label === "Pass priority")!;
    game = performGameplayAction({ game, actorPlayerId: actor, actionId: pass.id, selectedIds: [], decks, now: "r" });
  }
  return game;
}

function instanceNamed(decks: DeckSnapshotDocument[], playerId: string, name: string) {
  return instancesNamed(decks, playerId, name)[0]!;
}
function instancesNamed(decks: DeckSnapshotDocument[], playerId: string, name: string) {
  const deck = decks.find((item) => item.playerId === playerId)!;
  const code = deck.snapshot.cards.find((item) => item.card.name === name)!.cardCode;
  return deck.instances
    .filter((item) => item.cardCode === code)
    .map((item) => item.instanceId);
}
function definitionNamed(decks: DeckSnapshotDocument[], name: string) {
  return decks[0]!.snapshot.cards.find((item) => item.card.name === name)!;
}
function relocate(game: GameDocument, playerId: string, id: string, zone: "base" | "hand") {
  const player = game.state.players[playerId]!;
  for (const [key, value] of Object.entries(player.zones)) if (Array.isArray(value)) (player.zones as unknown as Record<string, string[]>)[key] = value.filter((item) => item !== id);
  game.state.battlefields.forEach((battlefield) => { battlefield.units = battlefield.units.filter((item) => item !== id); });
  player.zones[zone].push(id);
  game.state.cardStates[id]!.exhausted = false;
}
function relocateToBattlefield(game: GameDocument, playerId: string, id: string) {
  relocate(game, playerId, id, "base");
  game.state.players[playerId]!.zones.base = game.state.players[playerId]!.zones.base.filter((item) => item !== id);
  game.state.battlefields.find((item) => item.selectedByPlayerId === playerId)!.units.push(id);
}
function relocateLegend(game: GameDocument, playerId: string, id: string) {
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
  return buildDeckSnapshot(sourceText, documents, primitives.map((item) => buildBehaviorDefinitionDocument(item, "a")));
}
