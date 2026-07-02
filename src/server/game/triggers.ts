import {
  compileBehaviorModel,
  createBehaviorContext,
  executeBehaviorEffects,
  queueTriggeredClauses,
  type BehaviorEvent
} from "./behavior-runtime";
import {
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  definitionForInstance
} from "./primitive-handlers";
import type { DeckSnapshotDocument } from "./repositories";
import type { GameDocument } from "./state";

export function dispatchBehaviorEvent(
  game: GameDocument,
  event: BehaviorEvent,
  decks: readonly DeckSnapshotDocument[]
): void {
  const index = createRuntimeCardIndex(decks);
  const handlers = createPrimitiveHandlers(index);
  for (const controllerPlayerId of game.state.setup.playerIds) {
    const sources = activeSourceIds(game, controllerPlayerId, index).map((sourceCardInstanceId) => ({
      sourceCardInstanceId,
      label: definitionForInstance(sourceCardInstanceId, index).card.name,
      model: compileBehaviorModel(
        definitionForInstance(sourceCardInstanceId, index).behaviorModel,
        handlers
      )
    }));
    queueTriggeredClauses({ game, controllerPlayerId, sources, event, handlers });
  }
}

export function resolveDelayedEffects(
  game: GameDocument,
  point: string,
  decks: readonly DeckSnapshotDocument[]
): void {
  const index = createRuntimeCardIndex(decks);
  const handlers = createPrimitiveHandlers(index);
  const due = game.state.delayedEffects.filter((effect) => effect.point === point);
  game.state.delayedEffects = game.state.delayedEffects.filter((effect) => effect.point !== point);
  for (const effect of due) {
    const definition = definitionForInstance(effect.sourceCardInstanceId, index);
    const clause = compileBehaviorModel(definition.behaviorModel, handlers).clauses
      .find((candidate) => candidate.id === effect.clauseId);
    if (!clause) throw new Error(`Delayed behavior clause is unavailable: ${effect.clauseId}`);
    executeBehaviorEffects(
      clause,
      createBehaviorContext(game, effect.controllerPlayerId, effect.sourceCardInstanceId, null, effect.selectedIds),
      handlers
    );
  }
}

export function victoryRequirement(
  game: GameDocument,
  decks: readonly DeckSnapshotDocument[],
  baseRequirement = 8
): number {
  const index = createRuntimeCardIndex(decks);
  let result = baseRequirement;
  const battlefieldCards = game.state.battlefields.map((battlefield) => battlefield.cardInstanceId);
  for (const sourceId of battlefieldCards) {
    const model = definitionForInstance(sourceId, index).behaviorModel;
    for (const binding of model.clauses.flatMap((clause) => clause.effects)) {
      if (
        binding.behaviorId === "modifier.modify_numeric_value" &&
        binding.parameters.attribute === "victoryRequirement" &&
        binding.parameters.duration === "whileSourceOnBoard" &&
        typeof binding.parameters.amount === "number"
      ) {
        if (binding.parameters.operation === "increase") result += binding.parameters.amount;
        if (binding.parameters.operation === "reduce") result -= binding.parameters.amount;
        if (binding.parameters.operation === "set") result = binding.parameters.amount;
        if (binding.parameters.operation === "multiply") result *= binding.parameters.amount;
      }
    }
  }
  return result;
}

function activeSourceIds(
  game: GameDocument,
  controllerPlayerId: string,
  index: ReturnType<typeof createRuntimeCardIndex>
): string[] {
  const player = game.state.players[controllerPlayerId]!;
  return [...new Set([
    ...(player.zones.legend ? [player.zones.legend] : []),
    ...(player.zones.champion ? [player.zones.champion] : []),
    ...player.zones.base,
    ...game.state.battlefields
      .filter((battlefield) => battlefield.selectedByPlayerId === controllerPlayerId)
      .map((battlefield) => battlefield.cardInstanceId),
    ...game.state.battlefields.flatMap((battlefield) => battlefield.units)
      .filter((id) => index.instances.get(id)?.ownerPlayerId === controllerPlayerId)
  ])];
}
