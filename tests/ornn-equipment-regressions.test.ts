import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { cardSchema } from "../src/server/catalog";
import { attachCardToTopMost, detachCard } from "../src/server/game/attachment-lifecycle";
import { cleanupBoard } from "../src/server/game/board-rules";
import { beginEffectResolution, submitEffectOption } from "../src/server/game/effect-resolution";
import { gameplayActions, performGameplayAction } from "../src/server/game/actions";
import { projectGame } from "../src/server/game/projection";
import { createRuntimeCardIndex, definitionForInstance, recomputeMight } from "../src/server/game/primitive-handlers";
import type { GameCardDefinition } from "../src/server/game/schemas";
import { ornnGameFixture } from "./helpers/ornn-game-fixture";

test("canonical Cloth Armor grants Shield 2 once, only while its host defends (814.1.c–814.2)", async () => {
  const { game, decks, place } = await ornnGameFixture();
  const host = place("OGN-044", "base");
  const other = place("OGN-044", "base", "p1", 1);
  const cloth = place("SFD-064", "base");
  const index = createRuntimeCardIndex(decks, game);
  const printed = definitionForInstance(host, index).card.attributes.might!;
  const equipment = definitionForInstance(cloth, index).card.attributes.might!;
  attachCardToTopMost(game, cloth, host, index);
  for (const role of [null, "attacker", "defender", null] as const) {
    game.state.cardStates[host]!.combatRole = role;
    game.state.cardStates[other]!.combatRole = role;
    recomputeMight(game, host, index);
    recomputeMight(game, other, index);
    assert.equal(game.state.cardStates[host]!.computedMight, printed + equipment + (role === "defender" ? 2 : 0));
    assert.equal(game.state.cardStates[other]!.computedMight, printed, "an attached grant affects only its host");
  }
  game.state.cardStates[host]!.combatRole = "defender";
  detachCard(game, cloth);
  recomputeMight(game, host, index);
  assert.equal(game.state.cardStates[host]!.computedMight, printed);
});

test("canonical Brutalizer's attachment-turn bonus belongs only to its host", async () => {
  const { game, decks, place } = await ornnGameFixture();
  const host = place("OGN-044", "base");
  const other = place("OGN-044", "base", "p1", 1);
  const brutalizer = place("SFD-042", "base");
  const index = createRuntimeCardIndex(decks, game);
  const printed = definitionForInstance(host, index).card.attributes.might!;
  const equipment = definitionForInstance(brutalizer, index).card.attributes.might!;
  attachCardToTopMost(game, brutalizer, host, index);
  recomputeMight(game, host, index);
  recomputeMight(game, other, index);
  assert.equal(game.state.cardStates[host]!.computedMight, printed + equipment + 2);
  assert.equal(game.state.cardStates[other]!.computedMight, printed);
  game.state.turn!.turnNumber += 1;
  recomputeMight(game, host, index);
  assert.equal(game.state.cardStates[host]!.computedMight, printed + equipment);
});

test("two canonical Cloth Armor grants sum their Shield values and lose only the detached contribution", async () => {
  const { game, decks, place } = await ornnGameFixture();
  const host = place("OGN-044", "base");
  const cloth = place("SFD-064", "base");
  const second = `${cloth}:second-copy`;
  const original = decks[0]!.instances.find((instance) => instance.instanceId === cloth)!;
  decks[0]!.instances.push({ ...original, instanceId: second });
  game.state.cardStates[second] = { ...game.state.cardStates[cloth]! };
  game.state.players.p1!.zones.base.push(second);
  const index = createRuntimeCardIndex(decks, game);
  const printed = definitionForInstance(host, index).card.attributes.might!;
  const equipment = definitionForInstance(cloth, index).card.attributes.might!;
  attachCardToTopMost(game, cloth, host, index);
  attachCardToTopMost(game, second, host, index);
  game.state.cardStates[host]!.combatRole = "defender";
  recomputeMight(game, host, index);
  assert.equal(game.state.cardStates[host]!.computedMight, printed + 2 * equipment + 4);
  detachCard(game, cloth);
  recomputeMight(game, host, index);
  assert.equal(game.state.cardStates[host]!.computedMight, printed + equipment + 2);
  game.state.cardStates[host]!.combatRole = null;
  recomputeMight(game, host, index);
  assert.equal(game.state.cardStates[host]!.computedMight, printed + equipment);
});

for (const kind of ["regular", "unattached", "attached-decline", "attached-accept"] as const) {
  test(`Veiled Temple readies ${kind} Gear and offers only a meaningful detach choice`, async () => {
    const { game, decks, id, place } = await ornnGameFixture();
    const gear = place(kind === "regular" ? "OGN-081" : "SFD-042", "base");
    const host = place("OGN-044", "base");
    const index = createRuntimeCardIndex(decks, game);
    if (kind.startsWith("attached")) attachCardToTopMost(game, gear, host, index);
    game.state.cardStates[gear]!.exhausted = true;
    const source = id("SFD-221");
    const clause = definitionForInstance(source, index).behaviorModel.clauses[0]!;
    beginEffectResolution({ game, decks, controllerPlayerId: "p1", sourceCardInstanceId: source, clauseId: clause.id, selectedIds: [gear] });
    assert.equal(game.state.cardStates[gear]!.exhausted, false);
    if (kind.startsWith("attached")) {
      assert.equal(game.state.pendingChoice?.type, "effectOption");
      submitEffectOption(game, "p1", [kind === "attached-accept" ? "yes" : "no"], decks);
      assert.equal(game.state.cardStates[gear]!.attachedToCardInstanceId, kind === "attached-accept" ? null : host);
    }
    assert.equal(game.state.pendingChoice, null);
    assert.equal(game.state.effectResolutions.length, 0);
  });
}

test("one Cleanup recalls every detached Gear without restoring an earlier attachment-list entry", async () => {
  const { game, decks, id, place } = await ornnGameFixture();
  const host = place("OGN-044", "base");
  const gears = [place("SFD-042", "base"), place("SFD-042", "base", "p1", 1), place("SFD-056", "base")];
  game.state.players.p1!.zones.base = [];
  game.state.battlefields = [{ battlefieldId: "field", cardInstanceId: id("SFD-221"), selectedByPlayerId: "p1", controllerPlayerId: "p1", units: [host], attachedCardInstanceIds: [] }];
  const index = createRuntimeCardIndex(decks, game);
  for (const gear of gears) attachCardToTopMost(game, gear, host, index);
  for (const gear of gears.slice(0, 2)) detachCard(game, gear);
  assert.deepEqual(game.state.battlefields[0]!.attachedCardInstanceIds, gears, "Detach initially retains the host's location (435.4)");
  cleanupBoard(game, index);
  assert.deepEqual(game.state.players.p1!.zones.base, gears.slice(0, 2));
  assert.deepEqual(game.state.battlefields[0]!.attachedCardInstanceIds, gears.slice(2));
  assert.equal(game.state.cardStates[gears[2]!]!.attachedToCardInstanceId, host);
});

test("canonical Hidden Gear hides, reacts from its required Battlefield, and is recalled by Cleanup (149.3, 323.7, 811.1)", async () => {
  const { game, decks, id } = await ornnGameFixture();
  const sourceCards = cardSchema.array().parse(
    JSON.parse(await readFile("data/sets/ogn.json", "utf8")),
  );
  const card = sourceCards.find(
    (candidate) => candidate.public_code === "OGN-077/298",
  );
  assert.ok(card, "Zhonya's Hourglass must remain available from canonical set data");
  const zhonya: GameCardDefinition = {
    cardCode: "OGN-077",
    sourceTextHash: "test:ogn-077",
    card,
    behaviorModel: {
      playTimings: [],
      clauses: [
        {
          id: "hidden",
          sequence: 0,
          sourceText: card.text.plain,
          normalizedText: card.text.plain,
          abilities: [],
          triggers: [],
          conditions: [],
          selectors: [],
          choices: [],
          costs: [],
          timings: [],
          effects: [],
          keywords: [
            {
              behaviorId: "keyword.hidden",
              parameters: {},
              confidence: "high",
              order: 0,
            },
          ],
        },
      ],
    },
  };
  decks[0]!.snapshot.cards.push(zhonya);
  const zhonyaId = "p1:hidden:OGN-077:1";
  decks[0]!.instances.push({
    instanceId: zhonyaId,
    ownerPlayerId: "p1",
    source: "mainDeck",
    cardCode: "OGN-077",
  });
  game.state.cardStates[zhonyaId] = {
    exhausted: false,
    damage: 0,
    computedMight: null,
    objectVersion: 0,
  };
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
  game.state.players.p1!.zones.hand.push(zhonyaId);
  // [A] is an any-domain Power payment, independent of Zhonya's Calm domain.
  game.state.players.p1!.power = { Chaos: 1 };

  const hide = gameplayActions(game, "p1", decks).find(
    (action) => action.sourceCardInstanceId === zhonyaId && action.label.startsWith("Hide "),
  );
  assert.ok(hide?.enabled);
  let current = performGameplayAction({
    game,
    actorPlayerId: "p1",
    actionId: hide.id,
    selectedIds: [],
    decks,
    now: "hidden-hide",
  });
  assert.equal(current.state.chain, null, "Hide is not a Play and never opens a Chain");
  assert.equal(current.state.battlefields[0]!.facedownCardInstanceId, zhonyaId);
  assert.equal(current.state.players.p1!.zones.hand.includes(zhonyaId), false);
  assert.equal(current.state.players.p1!.power.Chaos, 0);
  assert.equal(
    projectGame({ game: current, viewerPlayerId: "p1", decks }).battlefields[0]?.facedownCard?.instanceId,
    zhonyaId,
    "the owner can inspect their Hidden card",
  );
  assert.equal(
    projectGame({ game: current, viewerPlayerId: "p2", decks }).battlefields[0]?.facedownCard,
    null,
    "the opposing projection does not expose a Hidden card",
  );
  assert.equal(
    gameplayActions(current, "p1", decks).some(
      (action) => action.sourceCardInstanceId === zhonyaId && action.label.startsWith("Play "),
    ),
    false,
    "a card cannot be played from Hidden until the next turn",
  );

  current.state.turn!.turnNumber += 1;
  current.state.showdown = {
    kind: "nonCombat",
    battlefieldId: battlefield.battlefieldId,
    relevantPlayerIds: ["p1", "p2"],
    focusPlayerId: "p1",
    passedPlayerIds: [],
  };
  const playHidden = gameplayActions(current, "p1", decks).find(
    (action) => action.sourceCardInstanceId === zhonyaId && action.label.startsWith("Play "),
  );
  assert.ok(playHidden?.enabled);
  assert.deepEqual(playHidden.presentation.boardLocation, {
    kind: "battlefield",
    battlefieldId: battlefield.battlefieldId,
  });
  current = performGameplayAction({
    game: current,
    actorPlayerId: "p1",
    actionId: playHidden.id,
    selectedIds: [],
    decks,
    now: "hidden-play",
  });
  assert.equal(current.state.chain?.items.at(-1)?.hiddenBattlefieldId, battlefield.battlefieldId);
  assert.equal(current.state.battlefields[0]!.facedownCardInstanceId, zhonyaId);

  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(current, playerId, decks).find(
      (action) => action.label === "Pass priority",
    );
    assert.ok(pass, `${playerId} must receive priority before Hidden Gear resolves`);
    current = performGameplayAction({
      game: current,
      actorPlayerId: playerId,
      actionId: pass.id,
      selectedIds: [],
      decks,
      now: `hidden-pass-${playerId}`,
    });
  }

  assert.equal(current.state.battlefields[0]!.facedownCardInstanceId, null);
  assert.deepEqual(current.state.battlefields[0]!.attachedCardInstanceIds, []);
  assert.ok(
    current.state.players.p1!.zones.base.includes(zhonyaId),
    "a Hidden Gear is first played to the associated Battlefield, then recalled as unattached Gear during Cleanup",
  );
});
