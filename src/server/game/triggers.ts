import {
  compileBehaviorModelV2,
  createBehaviorContext,
  executeBehaviorEffectsV2,
  queueTriggeredClausesV2,
  type BehaviorEventV2
} from "./behavior-runtime";
import {
  createPrimitiveHandlersV2,
  createRuntimeCardIndexV2,
  definitionForInstanceV2
} from "./primitive-handlers";
import type { DeckSnapshotDocumentV2 } from "./repositories";
import type { GameDocumentV2 } from "./state";

export function dispatchBehaviorEventV2(
  game: GameDocumentV2,
  event: BehaviorEventV2,
  decks: readonly DeckSnapshotDocumentV2[]
): void {
  const index = createRuntimeCardIndexV2(decks);
  const handlers = createPrimitiveHandlersV2(index);
  for (const controllerPlayerId of game.state.setup.playerIds) {
    const sources = activeSourceIds(game, controllerPlayerId, index).map((sourceCardInstanceId) => ({
      sourceCardInstanceId,
      label: definitionForInstanceV2(sourceCardInstanceId, index).card.name,
      model: compileBehaviorModelV2(
        definitionForInstanceV2(sourceCardInstanceId, index).behaviorModel,
        handlers
      )
    }));
    queueTriggeredClausesV2({ game, controllerPlayerId, sources, event, handlers });
  }
}

export function resolveDelayedEffectsV2(
  game: GameDocumentV2,
  point: string,
  decks: readonly DeckSnapshotDocumentV2[]
): void {
  const index = createRuntimeCardIndexV2(decks);
  const handlers = createPrimitiveHandlersV2(index);
  const due = game.state.delayedEffects.filter((effect) => effect.point === point);
  game.state.delayedEffects = game.state.delayedEffects.filter((effect) => effect.point !== point);
  for (const effect of due) {
    const definition = definitionForInstanceV2(effect.sourceCardInstanceId, index);
    const clause = compileBehaviorModelV2(definition.behaviorModel, handlers).clauses
      .find((candidate) => candidate.id === effect.clauseId);
    if (!clause) throw new Error(`Delayed behavior clause is unavailable: ${effect.clauseId}`);
    executeBehaviorEffectsV2(
      clause,
      createBehaviorContext(game, effect.controllerPlayerId, effect.sourceCardInstanceId, null, effect.selectedIds),
      handlers
    );
  }
}

export function victoryRequirementV2(
  game: GameDocumentV2,
  decks: readonly DeckSnapshotDocumentV2[],
  baseRequirement = 8
): number {
  const index = createRuntimeCardIndexV2(decks);
  let result = baseRequirement;
  const battlefieldCards = game.state.battlefields.map((battlefield) => battlefield.cardInstanceId);
  for (const sourceId of battlefieldCards) {
    const model = definitionForInstanceV2(sourceId, index).behaviorModel;
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
  game: GameDocumentV2,
  controllerPlayerId: string,
  index: ReturnType<typeof createRuntimeCardIndexV2>
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

