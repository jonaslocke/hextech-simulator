import { gameFixture } from "./game-fixture";
import type { BehaviorBinding, GameCardDefinition } from "../../src/server/game";

export const ownSpellId = "p1:synthetic-spell-a";
export const opponentSpellId = "p2:synthetic-spell-b";
export const ownChainId = "chain:synthetic-a";
export const opponentChainId = "chain:synthetic-b";
export const chooserSourceId = "p1:synthetic-counter";

export function chainSelector(controller?: "controller" | "opponent"): BehaviorBinding {
  return {
    behaviorId: "selector.chain_item", order: 0, confidence: "high",
    parameters: {
      itemKind: "spell", minimumCount: 1, maximumCount: 1, selectionKey: "spell",
      ...(controller ? { controller } : {}),
    },
  };
}

export async function chainSelectorFixture(selector = chainSelector()) {
  const { game, decks, place } = await gameFixture();
  const template = decks[0]!.snapshot.cards.find((card) => card.card.classification.type === "Spell")!;
  const makeSpell = (cardCode: string, energy = 0, power = 0): GameCardDefinition => ({
    ...structuredClone(template), cardCode,
    card: {
      ...structuredClone(template.card), id: cardCode, name: cardCode, public_code: `${cardCode}/1`,
      attributes: { ...template.card.attributes, energy, power },
      text: { plain: "[Reaction] Counter a spell." },
    },
    behaviorModel: {
      playTimings: [{ behaviorId: "timing.reaction", order: 0, confidence: "high", parameters: {} }],
      clauses: [],
    },
  });
  const source = makeSpell("SYNTHETIC-COUNTER");
  source.behaviorModel.clauses = [{
    id: "counter", sequence: 0, sourceText: "Counter a spell.", normalizedText: "Counter a spell.",
    abilities: [], triggers: [], conditions: [], selectors: [selector], choices: [], costs: [], timings: [], keywords: [],
    effects: [{ behaviorId: "action.counter_chain_item", order: 0, confidence: "high", parameters: { selectionKey: selector.parameters.selectionKey ?? "spell" } }],
  }];
  const cards = [source, makeSpell("SYNTHETIC-A"), makeSpell("SYNTHETIC-B"), makeSpell("SYNTHETIC-HIGH-ENERGY", 5), makeSpell("SYNTHETIC-HIGH-POWER", 0, 2)];
  decks[0]!.snapshot.cards.push(...cards);
  for (const [instanceId, cardCode, ownerPlayerId] of [
    [chooserSourceId, source.cardCode, "p1"],
    [ownSpellId, "SYNTHETIC-A", "p1"],
    [opponentSpellId, "SYNTHETIC-B", "p2"],
    ["p2:high-energy", "SYNTHETIC-HIGH-ENERGY", "p2"],
    ["p1:high-power", "SYNTHETIC-HIGH-POWER", "p1"],
  ] as const) {
    decks.find((deck) => deck.playerId === ownerPlayerId)!.instances.push({ instanceId, cardCode, ownerPlayerId, source: "mainDeck" });
    game.state.cardStates[instanceId] = { exhausted: false, damage: 0, computedMight: null };
  }
  game.state.players.p1!.zones.hand.push(chooserSourceId);
  const unitId = place("OGN-060", "base");
  const item = (id: string, sourceCardInstanceId: string, controllerPlayerId: string) => ({
    id, sourceCardInstanceId, controllerPlayerId, kind: "spell" as const, label: id,
    targetCardInstanceIds: [unitId], targetObjectVersions: {}, behaviorClauseId: null,
    activatedBehaviorId: null, behaviorEvent: null,
  });
  game.state.chain = {
    items: [item(ownChainId, ownSpellId, "p1"), item(opponentChainId, opponentSpellId, "p2")],
    relevantPlayerIds: ["p1", "p2"], priorityPlayerId: "p1", passedPlayerIds: [],
  };
  return { game, decks, source, item };
}
