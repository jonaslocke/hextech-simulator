import type { GameCardDefinition } from "./schemas";
import type { GameDocument } from "./state";
import type { RuntimeCardIndex } from "./primitive-handlers";

export function legalUnitDestinationIds(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  index?: RuntimeCardIndex,
): string[] {
  if (definition.card.classification.type !== "Unit") return [];

  const destinationIds = ["base"];
  if (index && isRestrictedToBase(game, playerId, index)) return destinationIds;
  for (const battlefield of game.state.battlefields) {
    if (battlefield.controllerPlayerId === playerId) {
      destinationIds.push(battlefield.battlefieldId);
      continue;
    }
    if (
      permitsOpenBattlefield(game, playerId, definition, index) &&
      battlefield.controllerPlayerId == null &&
      battlefield.contestedByPlayerId == null &&
      battlefield.units.length === 0
    ) {
      destinationIds.push(battlefield.battlefieldId);
      continue;
    }
    if (
      permitsOccupiedEnemyBattlefield(definition) &&
      battlefield.controllerPlayerId !== null &&
      battlefield.controllerPlayerId !== playerId
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
  index?: RuntimeCardIndex,
): boolean {
  return legalUnitDestinationIds(game, playerId, definition, index).includes(
    destinationId,
  );
}

function permitsOpenBattlefield(
  game: GameDocument,
  playerId: string,
  definition: GameCardDefinition,
  index?: RuntimeCardIndex,
): boolean {
  if (hasDestinationPermission(definition, "openBattlefield")) return true;
  if (!index) return false;
  return activeBoardSources(game, playerId, index).some((source) =>
    hasDestinationPermission(source, "openBattlefield"),
  );
}

function permitsOccupiedEnemyBattlefield(definition: GameCardDefinition) {
  return hasDestinationPermission(definition, "occupiedEnemyBattlefield");
}

function hasDestinationPermission(
  definition: GameCardDefinition,
  destination: string,
) {
  return definition.behaviorModel.clauses.some((clause) =>
    clause.effects.some(
      (binding) =>
        binding.behaviorId === "modifier.play_unit_destination" &&
        binding.parameters.destination === destination,
    ),
  );
}

function isRestrictedToBase(
  game: GameDocument,
  playerId: string,
  index: RuntimeCardIndex,
) {
  return game.state.battlefields.some((battlefield) =>
    battlefield.units.some((id) => {
      const instance = index.instances.get(id);
      if (!instance || instance.ownerPlayerId === playerId) return false;
      const definition = index.definitions.get(instance.cardCode);
      return definition?.behaviorModel.clauses.some((clause) =>
        clause.effects.some(
          (binding) =>
            binding.behaviorId === "modifier.unit_play_restriction" &&
            binding.parameters.destination === "baseOnly" &&
            binding.parameters.affectedPlayer === "opponent",
        ),
      );
    }),
  );
}

function activeBoardSources(
  game: GameDocument,
  playerId: string,
  index: RuntimeCardIndex,
) {
  return game.state.battlefields.flatMap((battlefield) => battlefield.units)
    .filter((id) => index.instances.get(id)?.ownerPlayerId === playerId)
    .map((id) => index.definitions.get(index.instances.get(id)!.cardCode))
    .filter((definition): definition is GameCardDefinition => Boolean(definition));
}
