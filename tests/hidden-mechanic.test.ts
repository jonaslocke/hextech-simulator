import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { adaptProjectionToBoard } from "../src/features/game-board/board-view-model";
import { createCardPaymentPreparation } from "../src/features/game-board/interactions/use-board-target-selection";
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

async function hiddenCardFixture(cardCode = "OGN-077") {
  const { game, decks, id } = await gameFixture();
  const sourceCards = cardSchema.array().parse(
    JSON.parse(await readFile("data/sets/ogn.json", "utf8")),
  );
  const card = sourceCards.find((candidate) => candidate.public_code.startsWith(`${cardCode}/`));
  assert.ok(card, `${cardCode} must remain available from canonical set data`);
  const definition: GameCardDefinition = {
    cardCode,
    sourceTextHash: `test:${cardCode.toLowerCase()}`,
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
  const cardId = `p1:hidden:${cardCode}:1`;
  decks[0]!.instances.push({ instanceId: cardId, ownerPlayerId: "p1", source: "mainDeck", cardCode });
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

const hiddenGearFixture = () => hiddenCardFixture("OGN-077");

test("Hide projects the rainbow Power cost as structured resource data", async () => {
  const { game, decks, cardId } = await hiddenGearFixture();
  const ownerProjection = projectGame({ game, decks, viewerPlayerId: "p1" });
  const hide = ownerProjection.actions.find((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Hide "));
  assert.ok(hide);
  assert.deepEqual(hide.presentation.resourceCost, {
    energy: 0,
    powerCosts: [{ amount: 1, domains: [] }],
  });
  assert.doesNotMatch(hide.label, /1 Any Power/);
  const board = adaptProjectionToBoard(ownerProjection);
  assert.deepEqual(board.projection.players.p1!.availablePaymentModes[cardId]?.[0]?.resourceCost, hide.presentation.resourceCost);
});

test("Hidden's rainbow cost accepts unrestricted off-domain Power in the Rune Pool", async () => {
  const { game, decks, cardId } = await hiddenGearFixture();
  game.state.players.p1!.power = { Fury: 1 };
  const hide = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Hide "));
  assert.ok(hide?.enabled, "the Calm Gear can be hidden using unrestricted Fury Power");
  const current = performGameplayAction({ game, actorPlayerId: "p1", actionId: hide.id, selectedIds: [], decks, now: "hidden-off-domain-payment" });
  assert.equal(current.state.players.p1!.power.Fury, 0);
  assert.equal(current.state.battlefields[0]!.facedownCardInstanceId, cardId);
});

test("Hide asks the player to add Power and spends only the selected pooled resource", async () => {
  const { game, decks, cardId } = await hiddenGearFixture();
  game.state.players.p1!.power = {};

  const sourceId = "p1:hidden-payment-source";
  const unusedSourceId = "p1:hidden-unused-payment-source";
  const source = structuredClone(decks[0]!.snapshot.cards.find((definition) => definition.cardCode === "OGN-077")!);
  source.cardCode = "Hidden payment source";
  source.card.id = source.cardCode;
  source.card.name = source.cardCode;
  source.card.public_code = "TEST-HIDDEN-POWER/1";
  source.card.classification.type = "Rune";
  source.card.classification.domain = ["Mind"];
  source.behaviorModel = {
    playTimings: [],
    clauses: [{
      id: "add-power", sequence: 0, sourceText: "", normalizedText: "",
      abilities: [{ behaviorId: "ability.exhaust_for_resource", order: 0, confidence: "high", parameters: { resourceType: "power", amount: 1, domain: "Mind", usage: "unrestricted" } }],
      triggers: [], conditions: [], selectors: [], choices: [], costs: [], timings: [], effects: [], keywords: [],
    }],
  };
  decks[0]!.snapshot.cards.push(source);
  decks[0]!.instances.push({ instanceId: sourceId, ownerPlayerId: "p1", source: "mainDeck", cardCode: source.cardCode });
  game.state.cardStates[sourceId] = { exhausted: false, damage: 0, computedMight: null, objectVersion: 0 };
  const unusedSource = structuredClone(source);
  unusedSource.cardCode = "Unused Hidden payment source";
  unusedSource.card.id = unusedSource.cardCode;
  unusedSource.card.name = unusedSource.cardCode;
  unusedSource.card.public_code = "TEST-HIDDEN-POWER-UNUSED/1";
  decks[0]!.snapshot.cards.push(unusedSource);
  decks[0]!.instances.push({ instanceId: unusedSourceId, ownerPlayerId: "p1", source: "mainDeck", cardCode: unusedSource.cardCode });
  game.state.cardStates[unusedSourceId] = { exhausted: false, damage: 0, computedMight: null, objectVersion: 0 };
  game.state.players.p1!.zones.base.push(sourceId, unusedSourceId);

  const hideBeforeAddingPower = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Hide "));
  assert.ok(hideBeforeAddingPower?.enabled, "a legal Add Power source makes Hide preparable");
  assert.equal(hideBeforeAddingPower.poolPayment?.mode, "card");
  assert.equal(hideBeforeAddingPower.poolPayment?.canPay, false);
  assert.equal(hideBeforeAddingPower.poolPayment?.power, 1);
  assert.deepEqual(hideBeforeAddingPower.poolPayment?.powerCosts, [{ amount: 1, domains: [] }]);
  assert.equal(createCardPaymentPreparation(hideBeforeAddingPower)?.targetKind, "payment");
  assert.equal(game.state.cardStates[sourceId]!.exhausted, false, "projecting Hide does not auto-use the resource source");
  assert.throws(
    () => performGameplayAction({ game, actorPlayerId: "p1", actionId: hideBeforeAddingPower.id, selectedIds: [], decks, now: "hidden-unfunded" }),
    /Add enough resources/,
    "the server rejects Hide until the player prepares its Rune Pool payment",
  );

  const addPower = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === sourceId && action.label.startsWith("Add Power"));
  assert.ok(addPower?.enabled);
  const afterAdd = performGameplayAction({ game, actorPlayerId: "p1", actionId: addPower.id, selectedIds: [], decks, now: "hidden-add-power" });
  assert.equal(afterAdd.state.players.p1!.power.Mind, 1);
  assert.equal(afterAdd.state.cardStates[sourceId]!.exhausted, true, "only the explicit Add action exhausts the selected source");

  const hideAfterAddingPower = gameplayActions(afterAdd, "p1", decks).find((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Hide "));
  assert.ok(hideAfterAddingPower?.enabled);
  assert.equal(hideAfterAddingPower.poolPayment?.canPay, true);
  const afterHide = performGameplayAction({ game: afterAdd, actorPlayerId: "p1", actionId: hideAfterAddingPower.id, selectedIds: [], decks, now: "hidden-confirm-hide" });
  assert.equal(afterHide.state.players.p1!.power.Mind, 0);
  assert.equal(afterHide.state.cardStates[sourceId]!.exhausted, true);
  assert.equal(afterHide.state.cardStates[unusedSourceId]!.exhausted, false, "Hide does not auto-exhaust another resource source");
  assert.equal(afterHide.state.battlefields[0]!.facedownCardInstanceId, cardId);
});

test("Hide remains preparable when Power requires an explicit ready-Rune recycle", async () => {
  const { game, decks, cardId } = await hiddenGearFixture();
  game.state.players.p1!.power = {};

  const sourceId = "p1:hidden-recycle-source";
  const source = structuredClone(decks[0]!.snapshot.cards.find((definition) => definition.cardCode === "OGN-077")!);
  source.cardCode = "Hidden recycle source";
  source.card.id = source.cardCode;
  source.card.name = source.cardCode;
  source.card.public_code = "TEST-HIDDEN-RECYCLE/1";
  source.card.classification.type = "Rune";
  source.card.classification.supertype = "Basic";
  source.card.classification.domain = ["Mind"];
  source.behaviorModel = {
    playTimings: [],
    clauses: [{
      id: "add-power", sequence: 0, sourceText: "", normalizedText: "",
      abilities: [{ behaviorId: "ability.recycle_for_power", order: 0, confidence: "high", parameters: { amount: 1, domain: "sourceDomain", usage: "unrestricted" } }],
      triggers: [], conditions: [], selectors: [], choices: [], costs: [], timings: [], effects: [], keywords: [],
    }],
  };
  decks[0]!.snapshot.cards.push(source);
  decks[0]!.instances.push({ instanceId: sourceId, ownerPlayerId: "p1", source: "runeDeck", cardCode: source.cardCode });
  game.state.cardStates[sourceId] = { exhausted: false, damage: 0, computedMight: null, objectVersion: 0 };
  game.state.players.p1!.zones.base.push(sourceId);

  const hideBeforeAddingPower = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Hide "),
  );
  assert.ok(hideBeforeAddingPower?.enabled, "a legal explicit Recycle for Power action makes Hide preparable");
  assert.equal(hideBeforeAddingPower.poolPayment?.canPay, false, "the Power is not in the Rune Pool yet");
  assert.equal(createCardPaymentPreparation(hideBeforeAddingPower)?.targetKind, "payment");
  assert.equal(game.state.players.p1!.zones.base.includes(sourceId), true, "projection does not auto-recycle the ready Rune");
  assert.throws(
    () => performGameplayAction({ game, actorPlayerId: "p1", actionId: hideBeforeAddingPower.id, selectedIds: [], decks, now: "hidden-unfunded-recycle" }),
    /Add enough resources/,
    "Hide still requires explicit Power preparation",
  );

  const addPower = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === sourceId && action.label.startsWith("Add Power"),
  );
  assert.ok(addPower?.enabled);
  const afterAdd = performGameplayAction({ game, actorPlayerId: "p1", actionId: addPower.id, selectedIds: [], decks, now: "hidden-recycle-add-power" });
  assert.equal(afterAdd.state.players.p1!.power.Mind, 1);
  assert.equal(afterAdd.state.players.p1!.zones.base.includes(sourceId), false, "the Rune is recycled only by the explicit Add action");

  const hideAfterAddingPower = gameplayActions(afterAdd, "p1", decks).find(
    (action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Hide "),
  );
  assert.ok(hideAfterAddingPower?.enabled);
  const afterHide = performGameplayAction({ game: afterAdd, actorPlayerId: "p1", actionId: hideAfterAddingPower.id, selectedIds: [], decks, now: "hidden-confirm-recycle-hide" });
  assert.equal(afterHide.state.players.p1!.power.Mind, 0);
  assert.equal(afterHide.state.battlefields[0]!.facedownCardInstanceId, cardId);
});
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
  const ownerBoard = adaptProjectionToBoard(ownerProjection);
  assert.equal(ownerBoard.projection.battlefields[0]!.facedownSlot, cardId);
  assert.equal(ownerBoard.projection.battlefields[0]!.units.includes(cardId), false);
  assert.equal(opponentProjection.battlefields[0]!.facedownCard, null);
  assert.equal(opponentProjection.battlefields[0]!.facedownCardPresent, true);
  const opponentBoard = adaptProjectionToBoard(opponentProjection);
  assert.equal(opponentBoard.projection.battlefields[0]!.facedownSlot, null);
  assert.equal(opponentBoard.projection.battlefields[0]!.facedownSlotPresent, true);
  assert.equal(opponentBoard.cardsByInstanceId[cardId], undefined);
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
  assert.equal(play.label, "Play from Hidden");
  current = performGameplayAction({ game: current, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "hidden-gear-play" });
  assert.ok(current.state.chain, "playing from Hidden opens the Chain");
  assert.equal(current.state.chain.items.at(-1)?.hiddenBattlefieldId, battlefield.battlefieldId);
  assert.equal(current.state.battlefields[0]!.facedownCardInstanceId, null, "the Facedown Zone clears as soon as play is accepted");
  assert.equal(current.state.cardStates[cardId]!.hiddenAtTurnNumber, null);
  assert.equal(current.state.cardStates[cardId]!.gameObjectIncarnation, 1);

  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(current, playerId, decks).find((action) => action.label === "Pass priority");
    assert.ok(pass, `${playerId} must receive priority before the Hidden Gear resolves`);
    current = performGameplayAction({ game: current, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks, now: `hidden-gear-pass-${playerId}` });
  }
  cleanupBoard(current, index);
  assert.equal(current.state.cardStates[cardId]!.gameObjectIncarnation, 2);
  assert.equal(current.state.battlefields[0]!.facedownCardInstanceId, null);
  assert.deepEqual(current.state.battlefields[0]!.attachedCardInstanceIds, []);
  assert.ok(current.state.players.p1!.zones.base.includes(cardId), "unattached Gear is recalled to its owner's Base during Cleanup");
});

test("playing Hidden moves the card to the Chain once, rejects reuse, and resolves to Trash", async () => {
  const { game, decks, cardId, battlefield } = await hiddenCardFixture("OGN-083");
  const hide = gameplayActions(game, "p1", decks).find((action) => action.sourceCardInstanceId === cardId && action.label.startsWith("Hide "))!;
  let current = performGameplayAction({ game, actorPlayerId: "p1", actionId: hide.id, selectedIds: [], decks, now: "hidden-spell-hide" });
  current.state.turn!.turnNumber += 1;
  current.state.showdown = {
    kind: "nonCombat", battlefieldId: battlefield.battlefieldId,
    relevantPlayerIds: ["p1", "p2"], focusPlayerId: "p1", passedPlayerIds: [],
  };
  const play = gameplayActions(current, "p1", decks).find((action) => action.sourceCardInstanceId === cardId && action.label === "Play from Hidden");
  assert.ok(play?.enabled, "Hidden play becomes available at the later legal timing");
  current = performGameplayAction({ game: current, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "hidden-spell-play" });

  assert.equal(current.state.battlefields[0]!.facedownCardInstanceId, null);
  assert.equal(current.state.chain?.items.length, 1);
  assert.equal(current.state.chain?.items[0]?.sourceCardInstanceId, cardId);
  assert.equal(current.state.chain?.items[0]?.hiddenBattlefieldId, battlefield.battlefieldId);
  assert.equal(current.state.cardStates[cardId]!.hiddenAtTurnNumber, null);
  assert.equal(current.state.cardStates[cardId]!.gameObjectIncarnation, 1);
  const ownerProjection = projectGame({ game: current, decks, viewerPlayerId: "p1" });
  assert.equal(ownerProjection.battlefields[0]!.facedownCard, null);
  assert.equal(ownerProjection.battlefields[0]!.facedownCardPresent, false);
  assert.equal(ownerProjection.chain?.items[0]?.sourceCardInstanceId, cardId);
  assert.equal(gameplayActions(current, "p1", decks).some((action) => action.sourceCardInstanceId === cardId && ["hide", "playHidden"].includes(action.id.split(":")[3]!)), false);
  assert.throws(
    () => performGameplayAction({ game: current, actorPlayerId: "p1", actionId: play.id, selectedIds: [], decks, now: "hidden-spell-stale-reuse" }),
    /Action is not legal for the current game state/,
  );

  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(current, playerId, decks).find((action) => action.label === "Pass priority");
    assert.ok(pass, `${playerId} must receive priority before the Hidden spell resolves`);
    current = performGameplayAction({ game: current, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks, now: `hidden-spell-pass-${playerId}` });
  }
  assert.equal(current.state.chain, null);
  assert.ok(current.state.players.p1!.zones.trash.includes(cardId), "a resolved Hidden Spell follows ordinary play and goes to Trash");
  assert.equal(current.state.cardStates[cardId]!.gameObjectIncarnation, 2);
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
