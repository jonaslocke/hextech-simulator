import type { GameCardDefinition } from "./schemas";
import type { GameDocument } from "./state";
import type { RuntimeCardIndex } from "./primitive-handlers";

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

/**
 * Legal destinations for a Move created by a spell or ability. This is
 * deliberately distinct from a unit's standard-move destinations: rules
 * 355.4 and 449 allow an effect to provide its own movement permission.
 */
export function legalEffectMoveDestinationIds(
  game: GameDocument,
  unitId: string,
  index: RuntimeCardIndex,
): string[] {
  const ownerPlayerId = index.instances.get(unitId)?.ownerPlayerId;
  if (!ownerPlayerId) return [];
  const currentLocation = unitLocationId(game, unitId);
  const destinations = currentLocation === "base" ? [] : ["base"];

  for (const battlefield of game.state.battlefields) {
    if (battlefield.battlefieldId === currentLocation) continue;
    const otherControllers = new Set(
      battlefield.units
        .map((id) => index.instances.get(id)?.ownerPlayerId)
        .filter(
          (playerId): playerId is string =>
            Boolean(playerId && playerId !== ownerPlayerId),
        ),
    );
    // Core Rules 449.2: a unit cannot move to a battlefield occupied by two
    // other players. This is relevant in multiplayer and harmless in 1v1.
    if (otherControllers.size >= 2) continue;
    destinations.push(battlefield.battlefieldId);
  }
  return destinations;
}

function unitLocationId(game: GameDocument, unitId: string): string | null {
  if (
    Object.values(game.state.players).some((player) =>
      player.zones.base.includes(unitId),
    )
  ) {
    return "base";
  }
  return (
    game.state.battlefields.find((battlefield) =>
      battlefield.units.includes(unitId),
    )?.battlefieldId ?? null
  );
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
