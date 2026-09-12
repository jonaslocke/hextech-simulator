import assert from "node:assert/strict";
import { test } from "node:test";
import type { GameCardDefinition } from "../src/server/game";
import { gameplayActions, performGameplayAction } from "../src/server/game";
import { createRuntimeCardIndex, moveCardToTrash } from "../src/server/game/primitive-handlers";
import { applyStartOfTurn } from "../src/server/game/turns";
import { gameFixture } from "./helpers/game-fixture";

test("Temporary enters the Beginning trigger ordering and remains until its triggered effect resolves", async () => {
  const fixture = await gameFixture();
  let { game } = fixture;
  const { decks, id, place } = fixture;
  const temporary = addTemporaryDefinition(decks, "TEMPORARY");
  const temporaryId = place(temporary.cardCode, "base");
  const holdingUnit = place("OGN-044", "base");
  game.state.players.p1!.zones.base = game.state.players.p1!.zones.base.filter((id) => id !== holdingUnit);
  game.state.cardStates[temporaryId] = { exhausted: false, damage: 0, computedMight: 1, objectVersion: 0 };
  game.state.turn = { turnNumber: 3, activePlayerId: "p1", phase: "beginning" };
  game.state.battlefields = [{
    battlefieldId: "temporary-field",
    cardInstanceId: id("SFD-221"),
    selectedByPlayerId: "p1",
    controllerPlayerId: "p1",
    contestedByPlayerId: null,
    units: [holdingUnit],
    attachedCardInstanceIds: [],
  }];

  applyStartOfTurn(game, decks);

  assert.equal(game.state.turn.phase, "beginning");
  assert.equal(game.state.chain?.items.at(-1)?.behaviorEvent?.type, "temporary.beginning");
  assert.ok(game.state.players.p1!.zones.base.includes(temporaryId));
  assert.equal(game.state.players.p1!.points ?? 0, 0, "Hold scoring waits for beginning triggers");

  for (const playerId of ["p1", "p2"]) {
    const pass = gameplayActions(game, playerId, decks).find((action) => action.label === "Pass priority");
    assert.ok(pass, `${playerId} receives a normal response opportunity`);
    game = performGameplayAction({ game, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks, now: `temporary-${playerId}` });
  }

  assert.ok(game.state.players.p1!.zones.trash.includes(temporaryId));
  assert.equal(game.state.players.p1!.points, 1, "scoring resumes only after the Temporary trigger resolves");
});

test("multiple Beginning triggers use the generic trigger-order decision", async () => {
  const { game, decks, place } = await gameFixture();
  const first = place(addTemporaryDefinition(decks, "TEMPORARY-A").cardCode, "base");
  const second = place(addTemporaryDefinition(decks, "TEMPORARY-B").cardCode, "base");
  game.state.cardStates[first] = { exhausted: false, damage: 0, computedMight: 1, objectVersion: 0 };
  game.state.cardStates[second] = { exhausted: false, damage: 0, computedMight: 1, objectVersion: 0 };
  game.state.turn = { turnNumber: 3, activePlayerId: "p1", phase: "beginning" };

  applyStartOfTurn(game, decks);

  assert.equal(game.state.pendingChoice?.type, "orderTriggers");
  assert.equal(game.state.pendingChoice?.pendingItems.length, 2);
});

test("a stale Temporary trigger does not repeat death processing after its source left play", async () => {
  const fixture = await gameFixture();
  let { game } = fixture;
  const { decks, place } = fixture;
  const temporaryId = place(addTemporaryDefinition(decks, "TEMPORARY-DEATH", true).cardCode, "base");
  game.state.cardStates[temporaryId] = { exhausted: false, damage: 0, computedMight: 1, objectVersion: 0 };
  game.state.turn = { turnNumber: 3, activePlayerId: "p1", phase: "beginning" };
  applyStartOfTurn(game, decks);
  assert.equal(game.state.chain?.items[0]?.sourceObjectVersion, 0);

  moveCardToTrash(game, temporaryId, createRuntimeCardIndex(decks, game));
  assert.equal(game.state.players.p1!.zones.trash.filter((id) => id === temporaryId).length, 1);
  game = resolveChain(game, decks);

  assert.equal(game.state.players.p1!.zones.trash.filter((id) => id === temporaryId).length, 1);
  assert.equal(game.state.players.p1!.xp, 1, "the death trigger resolves only for the original death");
});

test("a stale Temporary trigger cannot kill a later incarnation of the same card instance", async () => {
  const fixture = await gameFixture();
  let { game } = fixture;
  const { decks, place } = fixture;
  const temporaryId = place(addTemporaryDefinition(decks, "TEMPORARY-INCARNATION").cardCode, "base");
  game.state.cardStates[temporaryId] = { exhausted: false, damage: 0, computedMight: 1, objectVersion: 0 };
  game.state.turn = { turnNumber: 3, activePlayerId: "p1", phase: "beginning" };
  applyStartOfTurn(game, decks);

  moveCardToTrash(game, temporaryId, createRuntimeCardIndex(decks, game));
  game.state.players.p1!.zones.trash = game.state.players.p1!.zones.trash.filter((id) => id !== temporaryId);
  game.state.players.p1!.zones.base.push(temporaryId);
  assert.equal(game.state.cardStates[temporaryId]!.objectVersion, 1);

  game = resolveChain(game, decks);

  assert.ok(game.state.players.p1!.zones.base.includes(temporaryId));
  assert.ok(!game.state.players.p1!.zones.trash.includes(temporaryId));
});

function resolveChain(
  game: Awaited<ReturnType<typeof gameFixture>>["game"],
  decks: Awaited<ReturnType<typeof gameFixture>>["decks"],
) {
  for (let round = 0; round < 4 && game.state.chain; round += 1) {
    for (const playerId of ["p1", "p2"]) {
      const pass = gameplayActions(game, playerId, decks).find((action) => action.label === "Pass priority");
      assert.ok(pass, `${playerId} receives priority while the trigger resolves`);
      game = performGameplayAction({ game, actorPlayerId: playerId, actionId: pass.id, selectedIds: [], decks, now: `resolve-${round}-${playerId}` });
    }
  }
  assert.equal(game.state.chain, null);
  return game;
}

function addTemporaryDefinition(
  decks: Awaited<ReturnType<typeof gameFixture>>["decks"],
  cardCode: string,
  withDeathTrigger = false,
): GameCardDefinition {
  const template = decks[0]!.snapshot.cards.find((definition) => definition.card.classification.type === "Unit")!;
  const definition: GameCardDefinition = {
    ...structuredClone(template),
    cardCode,
    card: { ...structuredClone(template.card), id: cardCode, name: `Temporary ${cardCode}`, public_code: `${cardCode}/1` },
    behaviorModel: {
      playTimings: [],
      clauses: [
        {
          id: "temporary",
          sequence: 0,
          sourceText: "Temporary",
          normalizedText: "Temporary",
          abilities: [], triggers: [], conditions: [], selectors: [], choices: [], costs: [], timings: [], effects: [],
          keywords: [{ behaviorId: "keyword.temporary", order: 0, confidence: "high", parameters: {} }],
        },
        ...(withDeathTrigger ? [{
          id: "on-death",
          sequence: 1,
          sourceText: "When I die, gain 1 XP.",
          normalizedText: "When I die, gain 1 XP.",
          abilities: [],
          triggers: [{ behaviorId: "trigger.on_death", order: 0, confidence: "high" as const, parameters: { subject: "source" } }],
          conditions: [], selectors: [], choices: [], costs: [], timings: [],
          effects: [{ behaviorId: "action.gain_xp", order: 0, confidence: "high" as const, parameters: { amount: 1 } }],
          keywords: [],
        }] : []),
      ],
    },
  };
  decks[0]!.snapshot.cards.push(definition);
  decks[0]!.instances.push({ instanceId: `p1:mainDeck:${cardCode}:1`, ownerPlayerId: "p1", source: "mainDeck", cardCode });
  return definition;
}
