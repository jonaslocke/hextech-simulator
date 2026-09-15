import { paymentSourceFixture, restrictedSourceId } from "./payment-source-fixture";

export async function preparationFixture(energy = 0, power = 1, runes = 1) {
  const fixture = await paymentSourceFixture();
  const { game, decks, card, unrestricted } = fixture;
  card.card.attributes.energy = energy;
  card.card.attributes.power = power;
  game.state.cardStates[restrictedSourceId]!.exhausted = true;
  unrestricted.card.classification.type = "Rune";
  unrestricted.behaviorModel.clauses[0]!.abilities = [
    { behaviorId: "ability.exhaust_for_resource", order: 0, confidence: "high", parameters: { resourceType: "energy", amount: 1, usage: "unrestricted" } },
    { behaviorId: "ability.recycle_for_power", order: 1, confidence: "high", parameters: { amount: 1, resourceType: "power" } },
  ];
  for (let i = 1; i < runes; i++) {
    const id = `p1:rune-${i}`;
    decks[0]!.instances.push({ instanceId: id, cardCode: unrestricted.cardCode, ownerPlayerId: "p1", source: "runeDeck" });
    game.state.cardStates[id] = { exhausted: false, damage: 0, computedMight: null };
    game.state.players.p1!.zones.base.push(id);
  }
  return fixture;
}
