import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { cardSchema } from "../src/server/catalog";
import {
  acceptedActionEvent,
  cleanupBoard,
  createRuntimeCardIndex,
  gameplayActions,
  performGameplayAction,
  projectGame,
  type GameCardDefinition,
} from "../src/server/game";
import { gameFixture } from "./helpers/game-fixture";

async function hiddenGearFixture() {
  const { game, decks, id } = await gameFixture();
  const sourceCards = cardSchema.array().parse(
    JSON.parse(await readFile("data/sets/ogn.json", "utf8")),
  );
  const card = sourceCards.find((candidate) => candidate.public_code === "OGN-077/298");
  assert.ok(card, "Zhonya's Hourglass must remain available from canonical set data");
  const definition: GameCardDefinition = {
    cardCode: "OGN-077",
    sourceTextHash: "test:ogn-077",
    card,
    behaviorModel: {
      playTimings: [],
      clauses: [{
        id: "hidden",
        sequence: 0,
        sourceText: card.text.plain,
        normalizedText: card.text.plain,
        abilities: [], triggers: [], conditions: [], selectors: [], choices: [], costs: [],
        timings: [], effects: [],
        keywords: [{ behaviorId: "keyword.hidden", parameters: {}, confidence: "high", order: 0 }],
      }],
    },
  };
  decks[0]!.snapshot.cards.push(definition);
  const cardId = "p1:hidden:OGN-077:1";
  decks[0]!.instances.push({ instanceId: cardId, ownerPlayerId: "p1", source: "mainDeck", cardCode: "OGN-077" });
  game.state.cardStates[cardId] = { exhausted: false, damage: 0, computedMight: null, objectVersion: 0 };
  const battlefield = {
    battlefieldId: "field",
    cardInstanceId: id("SFD-221"),
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    contestedByPlayerId: null,
    units: [],
    attachedCardInstanceIds: [],
    facedownCardInstanceId: null,
  };
  game.state.battlefields = [battlefield];
  game.state.players.p1!.zones.hand.push(cardId);
  // Hidden's [A] payment is any domain, even though Zhonya is Calm.
  game.state.players.p1!.power = { Chaos: 1 };
  const index = createRuntimeCardIndex(decks, game);
  return { game, decks, cardId, battlefield, index };
}

test("Hide pays any-domain Power, keeps the card private, and does not open the Chain", async () => {
  const { game, decks, cardId } = await hiddenGearFixture();
  const hide = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Hide "));
  assert.ok(hide?.enabled);
  const event = acceptedActionEvent("p1", hide);
  assert.doesNotMatch(`${event.message} ${JSON.stringify(event.payload)}`, /OGN-077|Zhonya|hidden:p1/i);
  const current = performGameplayAction({ game, actorPlayerId: "p1", actionId: hide.id, selectedIds: [], decks, now: "hidden-hide" });
  assert.equal(current.state.chain, null);
  assert.equal(current.state.battlefields[0]!.facedownCardInstanceId, cardId);
  assert.equal(current.state.players.p1!.zones.hand.includes(cardId), false);
  assert.equal(current.state.players.p1!.power.Chaos, 0);
  assert.equal(current.state.cardStates[cardId]!.hiddenAtTurnNumber, current.state.turn!.turnNumber);

  const ownerProjection = projectGame({ game: current, decks, viewerPlayerId: "p1" });
  const opponentProjection = projectGame({ game: current, decks, viewerPlayerId: "p2" });
  assert.equal(ownerProjection.battlefields[0]!.facedownCard?.instanceId, cardId);
  assert.equal(opponentProjection.battlefields[0]!.facedownCard, null);
  assert.equal(opponentProjection.battlefields[0]!.facedownCardPresent, true);
  assert.doesNotMatch(JSON.stringify(opponentProjection), /OGN-077|Zhonya|p1:hidden/);
  assert.equal(opponentProjection.actions.some((action) => action.sourceCardInstanceId === cardId), false);
});

test("Hidden Gear waits until the next turn, then resolves through Chain and Cleanup at its Battlefield", async () => {
  const { game, decks, cardId, battlefield, index } = await hiddenGearFixture();
  const hide = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Hide "))!;
  let current = performGameplayAction({ game, actorPlayerId: "p1", actionId: hide.id, selectedIds: [], decks, now: "hidden-gear-hide" });
  assert.equal(gameplayActions(current, "p1", decks).some((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Play ")), false);
  current.state.turn!.turnNumber += 1;
  current.state.showdown = {
    kind: "nonCombat", battlefieldId: battlefield.battlefieldId,
    relevantPlayerIds: ["p1", "p2"], focusPlayerId: "p1", passedPlayerIds: [],
  };
  const play = gameplayActions(current, "p1", decks).find((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Play "));
  assert.ok(play?.enabled);
  current = performGameplayAction({ game: current, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "hidden-gear-play" });
  assert.ok(current.state.chain, "playing from Hidden opens the Chain");
  assert.equal(current.state.chain.items.at(-1)?.hiddenBattlefieldId, battlefield.battlefieldId);
  assert.equal(current.state.battlefields[0]!.facedownCardInstanceId, cardId);

  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(current, playerId, decks).find((action) => action.label === "Pass priority");
    assert.ok(pass, `${playerId} must receive priority before the Hidden Gear resolves`);
    current = performGameplayAction({ game: current, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks, now: `hidden-gear-pass-${playerId}` });
  }
  cleanupBoard(current, index);
  assert.equal(current.state.battlefields[0]!.facedownCardInstanceId, null);
  assert.deepEqual(current.state.battlefields[0]!.attachedCardInstanceIds, []);
  assert.ok(current.state.players.p1!.zones.base.includes(cardId), "unattached Gear is recalled to its owner's Base during Cleanup");
});

test("an occupied Facedown Zone is not offered as a Hide destination", async () => {
  const { game, decks, cardId } = await hiddenGearFixture();
  game.state.battlefields[0]!.facedownCardInstanceId = "another-hidden-card";
  game.state.cardStates["another-hidden-card"] = { exhausted: false, damage: 0, computedMight: null, objectVersion: 0 };
  const hide = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Hide "));
  assert.equal(hide, undefined);
});

test("Hidden adds Hide without replacing ordinary hand play", async () => {
  const { game, decks, cardId } = await hiddenGearFixture();
  game.state.players.p1!.energy = 100;
  game.state.players.p1!.power = { Calm: 20 };
  const actions = gameplayActions(game, "p1", decks).filter((action) => action.sourceCardInstanceId === cardId);
  assert.ok(actions.some((action) => action.label.startsWith("Hide ")));
  const normalPlay = actions.find((action) => action.label.startsWith("Play ") && !action.label.includes("from Hidden"));
  assert.ok(normalPlay?.enabled, "normal hand play uses its ordinary cost and timing alongside Hide");
});

test("Hidden target restrictions apply to each target separately in a multi-target clause", async () => {
  const { game, decks, cardId, battlefield } = await hiddenGearFixture();
  const definition = decks[0]!.snapshot.cards.find((candidate) => candidate.cardCode === "OGN-077")!;
  definition.behaviorModel.clauses[0]!.sourceText = "Choose a friendly unit here and another friendly unit at a different location.";
  definition.behaviorModel.clauses[0]!.selectors.push({
    behaviorId: "selector.friendly_unit", order: 1, confidence: "high",
    parameters: { area: "board", selectionKey: "target", minimumCount: 1, maximumCount: 1 },
  });
  definition.behaviorModel.clauses[0]!.selectors.push({
    behaviorId: "selector.friendly_unit", order: 2, confidence: "high",
    parameters: {
      area: "board", controller: "controller", locationRelation: "differentSourceLocation",
      selectionKey: "targetElsewhere", minimumCount: 1, maximumCount: 1,
    },
  });
  const unitDefinition = decks[0]!.snapshot.cards.find((candidate) => candidate.card.classification.type === "Unit");
  assert.ok(unitDefinition, "fixture needs a canonical Unit target");
  const unitCodes = new Set(decks[0]!.snapshot.cards.filter((candidate) => candidate.card.classification.type === "Unit").map((candidate) => candidate.cardCode));
  const unitIds = decks[0]!.instances.filter((instance) => unitCodes.has(instance.cardCode)).slice(0, 2).map((instance) => instance.instanceId);
  assert.equal(unitIds.length, 2, "fixture needs two copies for battlefield and off-Battlefield targets");
  for (const unitId of unitIds) game.state.players.p1!.zones.mainDeck = game.state.players.p1!.zones.mainDeck.filter((candidate) => candidate !== unitId);
  game.state.battlefields[0]!.units.push(unitIds[0]!);
  game.state.players.p1!.zones.base.push(unitIds[1]!);

  const hide = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Hide "))!;
  const current = performGameplayAction({ game, actorPlayerId: "p1", actionId: hide.id, selectedIds: [], decks, now: "hidden-target-hide" });
  current.state.turn!.turnNumber += 1;
  current.state.showdown = { kind: "nonCombat", battlefieldId: battlefield.battlefieldId, relevantPlayerIds: ["p1", "p2"], focusPlayerId: "p1", passedPlayerIds: [] };
  const play = gameplayActions(current, "p1", decks).find((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Play "));
  assert.deepEqual(play?.targets[0]?.legalIds, [unitIds[0]], "the first target stays at the associated Battlefield");
  assert.deepEqual(play?.targets[1]?.legalIds, [unitIds[1]], "only the second target may use its explicit different-location exception");

  current.state.battlefields[0]!.units = [];
  assert.equal(gameplayActions(current, "p1", decks).some((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Play ")), false, "a required target cannot be satisfied at the associated Battlefield");
});

test("losing Battlefield control sends its facedown card to its owner's Trash during Cleanup", async () => {
  const { game, decks, cardId, index } = await hiddenGearFixture();
  const hide = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Hide "))!;
  const current = performGameplayAction({ game, actorPlayerId: "p1", actionId: hide.id, selectedIds: [], decks, now: "hidden-control-hide" });
  current.state.battlefields[0]!.controllerPlayerId = "p2";
  cleanupBoard(current, index);
  assert.equal(current.state.battlefields[0]!.facedownCardInstanceId, null);
  assert.ok(current.state.players.p1!.zones.trash.includes(cardId));
  assert.equal(current.state.cardStates[cardId]!.hiddenAtTurnNumber, null);
});
