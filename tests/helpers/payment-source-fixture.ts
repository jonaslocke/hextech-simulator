import type { GameCardDefinition } from "../../src/server/game";
import { gameFixture } from "./game-fixture";

export const paymentCardId = "p1:payment-card";
export const unrestrictedSourceId = "p1:unrestricted-source";
export const restrictedSourceId = "p1:restricted-source";

export async function paymentSourceFixture() {
  const { game, decks } = await gameFixture();
  const template = decks[0]!.snapshot.cards[0]!;
  const makeCard = (code: string, type: "Gear" | "Legend", power = 0): GameCardDefinition => ({
    ...structuredClone(template), cardCode: code,
    card: {
      ...structuredClone(template.card), id: code, name: code, public_code: `${code}/1`,
      classification: { ...template.card.classification, type, supertype: null, domain: ["Calm"] },
      attributes: { energy: 0, might: null, power }, text: { plain: "" },
    },
    behaviorModel: { playTimings: [], clauses: [] },
  });
  const card = makeCard("Payment card", "Gear", 1);
  const unrestricted = makeCard("Unrestricted source", "Gear");
  const restricted = makeCard("Restricted source", "Legend");
  for (const [definition, usage] of [[unrestricted, "unrestricted"], [restricted, "cardOrAbility:Gear"]] as const) {
    definition.behaviorModel.clauses = [{
      id: "add-power", sequence: 0, sourceText: "", normalizedText: "",
      abilities: [{ behaviorId: "ability.exhaust_for_resource", order: 0, confidence: "high",
        parameters: { resourceType: "power", amount: 1, domain: "rainbow", usage } }],
      triggers: [], conditions: [], selectors: [], choices: [], costs: [], timings: [], keywords: [], effects: [],
    }];
  }
  decks[0]!.snapshot.cards.push(card, unrestricted, restricted);
  for (const [instanceId, definition] of [[paymentCardId, card], [unrestrictedSourceId, unrestricted], [restrictedSourceId, restricted]] as const) {
    decks[0]!.instances.push({ instanceId, cardCode: definition.cardCode, ownerPlayerId: "p1", source: "mainDeck" });
    game.state.cardStates[instanceId] = { exhausted: false, damage: 0, computedMight: null };
  }
  const player = game.state.players.p1!;
  player.energy = 0;
  player.conditionalEnergy = 0;
  player.power = {};
  player.restrictedResources = { energy: {}, power: {} };
  player.zones.hand = [paymentCardId];
  player.zones.base = [unrestrictedSourceId];
  player.zones.legend = restrictedSourceId;
  player.zones.champion = null;
  return { game, decks, card, unrestricted, restricted };
}
