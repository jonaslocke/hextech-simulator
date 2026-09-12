import assert from "node:assert/strict";
import { test } from "node:test";
import { createBehaviorContext, type BehaviorBinding, type GameCardDefinition } from "../src/server/game";
import { createPrimitiveHandlers, createRuntimeCardIndex } from "../src/server/game/primitive-handlers";
import { gameFixture } from "./helpers/game-fixture";

test("enemy spell-domain selection uses the target controller's player identity", async () => {
  const { game, decks, id, place } = await gameFixture();
  const source = id("OGN-044");
  const target = place("OGN-044", "base");
  const fury = addSpell(decks, "FURY", "Fury");
  const nonFury = addSpell(decks, "NON_FURY", "Mind");
  const enemyFury = addInstance(decks, "p2", fury.cardCode);
  const friendlyFury = addInstance(decks, "p1", fury.cardCode);
  const enemyNonFury = addInstance(decks, "p2", nonFury.cardCode);
  const binding: BehaviorBinding = {
    behaviorId: "selector.friendly_unit", order: 0, confidence: "high",
    parameters: { area: "board", locationRelation: "any", minimumCount: 1, maximumCount: 1, targetedByEnemySpellDomain: "fury" },
  };
  const handler = createPrimitiveHandlers(createRuntimeCardIndex(decks, game)).get(binding.behaviorId)!;
  const legalTargets = () => handler.targets!(binding, createBehaviorContext(game, "p1", source, null, []));

  game.state.chain = chainItem(enemyFury, "p2", [target]);
  assert.deepEqual(legalTargets().legalIds, [target]);
  game.state.chain = chainItem(friendlyFury, "p1", [target]);
  assert.deepEqual(legalTargets().legalIds, []);
  game.state.chain = chainItem(enemyNonFury, "p2", [target]);
  assert.deepEqual(legalTargets().legalIds, []);
  game.state.chain = chainItem(enemyFury, "p2", []);
  assert.deepEqual(legalTargets().legalIds, []);
});

function addSpell(
  decks: Awaited<ReturnType<typeof gameFixture>>["decks"],
  cardCode: string,
  domain: string,
): GameCardDefinition {
  const template = decks[0]!.snapshot.cards.find((definition) => definition.card.classification.type === "Spell")!;
  const definition: GameCardDefinition = {
    ...structuredClone(template),
    cardCode,
    card: { ...structuredClone(template.card), id: cardCode, name: cardCode, public_code: `${cardCode}/1`, classification: { ...template.card.classification, domain: [domain] } },
  };
  for (const deck of decks) deck.snapshot.cards.push(definition);
  return definition;
}

function addInstance(
  decks: Awaited<ReturnType<typeof gameFixture>>["decks"],
  playerId: "p1" | "p2",
  cardCode: string,
) {
  const instanceId = `${playerId}:mainDeck:${cardCode}:1`;
  decks.find((deck) => deck.playerId === playerId)!.instances.push({ instanceId, ownerPlayerId: playerId, source: "mainDeck", cardCode });
  return instanceId;
}

function chainItem(sourceCardInstanceId: string, controllerPlayerId: string, targetCardInstanceIds: string[]) {
  return {
    items: [{ id: `chain:${sourceCardInstanceId}`, kind: "spell" as const, label: "spell", controllerPlayerId, sourceCardInstanceId, targetCardInstanceIds, targetObjectVersions: {}, behaviorClauseId: null, activatedBehaviorId: null, behaviorEvent: null }],
    relevantPlayerIds: ["p1", "p2"], priorityPlayerId: controllerPlayerId, passedPlayerIds: [],
  };
}
