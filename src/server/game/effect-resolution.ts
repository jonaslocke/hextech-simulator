import {
  compileBehaviorModel,
  createBehaviorContext,
} from "./behavior-runtime";
import {
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  definitionForInstance,
} from "./primitive-handlers";
import type { DeckSnapshotDocument } from "./repositories";
import type { GameDocument } from "./state";

export function beginEffectResolution(input: {
  game: GameDocument;
  controllerPlayerId: string;
  sourceCardInstanceId: string;
  clauseId: string;
  delayedEffectId?: string;
  endingPlayerId?: string;
  decks: readonly DeckSnapshotDocument[];
}): boolean {
  const id = `resolution:${input.game.stateVersion}:${input.sourceCardInstanceId}:${input.clauseId}:${input.game.state.effectResolutions.length}`;
  input.game.state.effectResolutions.push({
    id,
    controllerPlayerId: input.controllerPlayerId,
    sourceCardInstanceId: input.sourceCardInstanceId,
    clauseId: input.clauseId,
    nextEffectIndex: 0,
    delayedEffectId: input.delayedEffectId ?? null,
    endingPlayerId: input.endingPlayerId ?? null,
    selectionsByBinding: {},
  });
  return resumeEffectResolution(input.game, id, input.decks);
}

export function submitEffectSelection(
  game: GameDocument,
  playerId: string,
  selectedIds: string[],
  decks: readonly DeckSnapshotDocument[],
) {
  const pending = game.state.pendingChoice;
  if (
    !pending ||
    pending.type !== "effectSelection" ||
    pending.playerId !== playerId
  ) {
    throw new Error("Effect selection is not available.");
  }
  if (
    selectedIds.length < pending.minimum ||
    selectedIds.length > pending.maximum ||
    new Set(selectedIds).size !== selectedIds.length ||
    selectedIds.some((id) => !pending.legalCardIds.includes(id))
  ) {
    throw new Error("Effect selection does not satisfy its requirements.");
  }
  const frame = game.state.effectResolutions.find(
    (candidate) => candidate.id === pending.resolutionId,
  );
  if (!frame) throw new Error("Effect resolution is unavailable.");
  frame.selectionsByBinding[pending.bindingKey] = [...selectedIds];
  game.state.pendingChoice = null;
  return resumeEffectResolution(game, frame.id, decks);
}

export function resumeEffectResolution(
  game: GameDocument,
  resolutionId: string,
  decks: readonly DeckSnapshotDocument[],
): boolean {
  const frame = game.state.effectResolutions.find(
    (candidate) => candidate.id === resolutionId,
  );
  if (!frame) throw new Error("Effect resolution is unavailable.");
  const index = createRuntimeCardIndex(decks);
  const handlers = createPrimitiveHandlers(index);
  const definition = definitionForInstance(frame.sourceCardInstanceId, index);
  const clause = compileBehaviorModel(
    definition.behaviorModel,
    handlers,
  ).clauses.find((candidate) => candidate.id === frame.clauseId);
  if (!clause)
    throw new Error(`Behavior clause is unavailable: ${frame.clauseId}`);

  while (frame.nextEffectIndex < clause.orderedEffects.length) {
    const binding = clause.orderedEffects[frame.nextEffectIndex]!;
    const bindingKey = `${clause.id}:effects:${binding.order}`;
    const context = createBehaviorContext(
      game,
      frame.controllerPlayerId,
      frame.sourceCardInstanceId,
      null,
      frame.selectionsByBinding[bindingKey] ?? [],
    );
    const handler = handlers.get(binding.behaviorId);
    if (!handler?.execute)
      throw new Error(`Behavior handler cannot execute: ${binding.behaviorId}`);
    const requirement = handler.choice?.(binding, context) ?? null;
    if (requirement && !frame.selectionsByBinding[bindingKey]) {
      game.state.pendingChoice = {
        id: `choice:${frame.id}:${binding.order}`,
        playerId: frame.controllerPlayerId,
        type: "effectSelection",
        resolutionId: frame.id,
        bindingKey,
        prompt: requirement.prompt,
        legalCardIds: requirement.legalIds,
        minimum: requirement.minimum,
        maximum: requirement.maximum,
      };
      return false;
    }
    handler.execute(binding, context);
    frame.nextEffectIndex += 1;
  }

  game.state.effectResolutions = game.state.effectResolutions.filter(
    (candidate) => candidate.id !== frame.id,
  );
  if (frame.delayedEffectId) {
    game.state.delayedEffects = game.state.delayedEffects.filter(
      (candidate) => candidate.id !== frame.delayedEffectId,
    );
  }
  return true;
}
