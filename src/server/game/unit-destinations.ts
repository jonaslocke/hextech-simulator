import type { GameCardDefinition } from "./schemas";
import type { GameDocument } from "./state";

export function legalUnitDestinationIds(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
): string[] {
  if (definition.card.classification.type !== "Unit") return [];

  const destinationIds = ["base"];
  for (const battlefield of game.state.battlefields) {
    if (battlefield.controllerPlayerId === playerId) {
      destinationIds.push(battlefield.battlefieldId);
      continue;
    }
    if (
      permitsOpenBattlefield(definition) &&
      battlefield.controllerPlayerId == null &&
      battlefield.contestedByPlayerId == null &&
      battlefield.units.length === 0
    ) {
      destinationIds.push(battlefield.battlefieldId);
    }
  }
  return destinationIds;
}

export function isLegalUnitDestination(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  destinationId: string,
): boolean {
  return legalUnitDestinationIds(game, playerId, definition).includes(
    destinationId,
  );
}

function permitsOpenBattlefield(definition: GameCardDefinition): boolean {
  return definition.behaviorModel.clauses.some((clause) =>
    clause.effects.some(
      (binding) =>
        binding.behaviorId === "modifier.play_unit_destination" &&
        binding.parameters.destination === "openBattlefield",
    ),
  );
}
