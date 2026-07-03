import { definitionForInstance } from "./primitive-handlers";
import type { DeckSnapshotDocument } from "./repositories";
import type { GameDocument } from "./state";

export const BASE_VICTORY_SCORE = 8;

export function victoryRequirement(
  game: GameDocument,
  decks: readonly DeckSnapshotDocument[],
  baseRequirement = BASE_VICTORY_SCORE,
): number {
  const definitions = new Map(
    decks.flatMap((deck) =>
      deck.snapshot.cards.map((definition) => [
        definition.cardCode,
        definition,
      ]),
    ),
  );
  const instances = new Map(
    decks.flatMap((deck) =>
      deck.instances.map((instance) => [instance.instanceId, instance]),
    ),
  );
  const index = { definitions, instances };
  let result = baseRequirement;
  const battlefieldCards = game.state.battlefields.map(
    (battlefield) => battlefield.cardInstanceId,
  );
  for (const sourceId of battlefieldCards) {
    const model = definitionForInstance(sourceId, index).behaviorModel;
    for (const binding of model.clauses.flatMap((clause) => clause.effects)) {
      if (
        binding.behaviorId === "modifier.modify_numeric_value" &&
        binding.parameters.attribute === "victoryRequirement" &&
        binding.parameters.duration === "whileSourceOnBoard" &&
        typeof binding.parameters.amount === "number"
      ) {
        if (binding.parameters.operation === "increase")
          result += binding.parameters.amount;
        if (binding.parameters.operation === "reduce")
          result -= binding.parameters.amount;
        if (binding.parameters.operation === "set")
          result = binding.parameters.amount;
        if (binding.parameters.operation === "multiply")
          result *= binding.parameters.amount;
      }
    }
  }
  return result;
}
