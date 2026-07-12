import {
  clauseHasAutomaticAffectedGroup,
  compileBehaviorModel,
  createBehaviorContext,
  selectionRequirementsForClause,
} from "./behavior-runtime";
import type { BehaviorEvent } from "./behavior-runtime";
import {
  createPrimitiveHandlers,
  createRuntimeCardIndex,
  definitionForInstance,
} from "./primitive-handlers";
import type { DeckSnapshotDocument } from "./repositories";
import type { GameDocument } from "./state";

export type TokenPlacement = {
  destinationId: string;
  count: number;
};

export function beginEffectResolution(input: {
  game: GameDocument;
  controllerPlayerId: string;
  sourceCardInstanceId: string;
  clauseId: string;
  delayedEffectId?: string;
  endingPlayerId?: string;
  selectedIds?: string[];
  targetsLocked?: boolean;
  behaviorEvent?: BehaviorEvent | null;
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
    initialSelectedIds: input.selectedIds ?? [],
    targetsLocked: input.targetsLocked ?? input.selectedIds !== undefined,
    selectionsByBinding: {},
    behaviorEvent: input.behaviorEvent ?? null,
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
  if (!pending.resolutionId) {
    throw new Error("Effect resolution is unavailable.");
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

export function submitTokenPlacement(
  game: GameDocument,
  playerId: string,
  placements: readonly TokenPlacement[],
  decks: readonly DeckSnapshotDocument[],
) {
  const pending = game.state.pendingChoice;
  if (
    !pending ||
    pending.type !== "tokenPlacement" ||
    pending.playerId !== playerId
  ) {
    throw new Error("Token placement is not available.");
  }
  const total = placements.reduce((sum, placement) => sum + placement.count, 0);
  if (
    total !== pending.count ||
    placements.length === 0 ||
    placements.some(
      (placement) =>
        placement.count < 1 ||
        !pending.legalDestinationIds.includes(placement.destinationId),
    )
  ) {
    throw new Error("Token placement does not satisfy its requirements.");
  }
  const frame = game.state.effectResolutions.find(
    (candidate) => candidate.id === pending.resolutionId,
  );
  if (!frame) throw new Error("Effect resolution is unavailable.");
  frame.selectionsByBinding[pending.bindingKey] = placements.flatMap(
    (placement) =>
      Array.from({ length: placement.count }, () => placement.destinationId),
  );
  game.state.pendingChoice = null;
  return resumeEffectResolution(game, frame.id, decks);
}

export function submitBinaryChoice(game: GameDocument, playerId: string, selectedIds: string[], decks: readonly DeckSnapshotDocument[]) {
  const pending = game.state.pendingChoice;
  if (!pending || pending.type !== "binary" || pending.playerId !== playerId || selectedIds.length !== 1 || !["accept", "decline"].includes(selectedIds[0]!)) throw new Error("Optional choice is invalid.");
  const frame = game.state.effectResolutions.find((item) => item.id === pending.resolutionId);
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
  const index = createRuntimeCardIndex(decks, game);
  const handlers = createPrimitiveHandlers(index);
  const definition = definitionForInstance(frame.sourceCardInstanceId, index);
  const clause = compileBehaviorModel(
    definition.behaviorModel,
    handlers,
  ).clauses.find((candidate) => candidate.id === frame.clauseId);
  if (!clause)
    throw new Error(`Behavior clause is unavailable: ${frame.clauseId}`);
  if (
    clause.keywords.some((binding) => binding.behaviorId === "keyword.legion") &&
    !(game.state.players[frame.controllerPlayerId]
      ?.legionSatisfiedCardIdsThisTurn ?? []).includes(frame.sourceCardInstanceId)
  ) {
    finishResolutionFrame(game, frame.id, frame.delayedEffectId);
    return true;
  }

  const selectorContext = createBehaviorContext(
    game,
    frame.controllerPlayerId,
    frame.sourceCardInstanceId,
    frame.behaviorEvent,
    [],
  );
  for (const { binding, requirement } of selectionRequirementsForClause(
    clause,
    selectorContext,
    handlers,
  )) {
    const bindingKey = `${clause.id}:selectors:${binding.order}`;
    if (frame.selectionsByBinding[bindingKey]) continue;
    if (frame.targetsLocked) {
      const lockedSelections = frame.initialSelectedIds
        .filter((id) => requirement.legalIds.includes(id))
        .slice(0, requirement.maximum);
      if (lockedSelections.length < requirement.minimum) {
        finishResolutionFrame(game, frame.id, frame.delayedEffectId);
        return true;
      }
      frame.selectionsByBinding[bindingKey] = lockedSelections;
      continue;
    }
    if (requirement.legalIds.length < requirement.minimum) {
      finishResolutionFrame(game, frame.id, frame.delayedEffectId);
      return true;
    }
    game.state.pendingChoice = {
      id: `choice:${frame.id}:${binding.order}`,
      playerId: frame.controllerPlayerId,
      type: "effectSelection",
      resolutionId: frame.id,
      bindingKey,
      prompt:
        requirement.selectionPurpose === "optionalCost"
          ? "Optional Cost: Exhaust a ready friendly unit, or decline."
          : requirement.label
            ? `Choose ${requirement.label}`
            : "Choose effect target",
      optionKind:
        requirement.kind === "battlefield" ? "battlefield" : "card",
      sourceZone: requirement.sourceZone ?? null,
      presentation: "cardSelection",
      legalCardIds: requirement.legalIds,
      minimum: requirement.minimum,
      maximum: requirement.maximum,
      targetRequirements: [requirement],
    };
    return false;
  }

  for (const binding of clause.choices as import("./schemas").BehaviorBinding[]) {
    const bindingKey = `${clause.id}:choices:${binding.order}`;
    if (frame.selectionsByBinding[bindingKey]) continue;
    const requirement = handlers.get(binding.behaviorId)?.choice?.(binding, selectorContext);
    if (!requirement || requirement.kind !== "binary") continue;
    game.state.pendingChoice = { id: `choice:${frame.id}:${binding.order}`, playerId: frame.controllerPlayerId, type: "binary", resolutionId: frame.id, bindingKey, prompt: requirement.prompt, acceptLabel: requirement.acceptLabel ?? "Accept", declineLabel: requirement.declineLabel ?? "Decline" };
    return false;
  }

  while (frame.nextEffectIndex < clause.orderedEffects.length) {
    const binding: import("./schemas").BehaviorBinding =
      clause.orderedEffects[frame.nextEffectIndex]!;
    const bindingKey = `${clause.id}:effects:${binding.order}`;
    const selectorSelections = clause.selectors.flatMap(
      (selector) =>
        frame.selectionsByBinding[
          `${clause.id}:selectors:${selector.order}`
        ] ?? [],
    );
    const context = createBehaviorContext(
      game,
      frame.controllerPlayerId,
      frame.sourceCardInstanceId,
      frame.behaviorEvent,
      [
        ...new Set([
          ...frame.initialSelectedIds,
          ...selectorSelections,
        ]),
        ...(frame.selectionsByBinding[bindingKey] ?? []),
      ],
      clauseHasAutomaticAffectedGroup(clause, selectorContext, handlers)
        ? { automaticTargets: true }
        : {},
    );
    for (const selector of clause.selectors) {
      const selected =
        frame.selectionsByBinding[
          `${clause.id}:selectors:${selector.order}`
        ] ?? [];
      context.selectedBySelector[`${clause.id}:selectors:${selector.order}`] = selected;
      if (typeof selector.parameters.selectionKey === "string") {
        context.selectedBySelector[selector.parameters.selectionKey] = selected;
      }
    }
    const handler = handlers.get(binding.behaviorId);
    if (!handler?.execute)
      throw new Error(`Behavior handler cannot execute: ${binding.behaviorId}`);
    const requiredChoiceKey = binding.parameters.requiresChoiceKey;
    if (typeof requiredChoiceKey === "string" && frame.selectionsByBinding[requiredChoiceKey]?.[0] !== "accept") {
      frame.nextEffectIndex += 1;
      continue;
    }
    const requirement = handler.choice?.(binding, context) ?? null;
    if (requirement && !frame.selectionsByBinding[bindingKey]) {
      if (requirement.kind === "tokenPlacement") {
        game.state.pendingChoice = {
          id: `choice:${frame.id}:${binding.order}`,
          playerId: frame.controllerPlayerId,
          type: "tokenPlacement",
          resolutionId: frame.id,
          bindingKey,
          prompt: requirement.prompt,
          tokenName: requirement.tokenName ?? "Token",
          count: requirement.maximum,
          legalDestinationIds: requirement.legalIds,
          destinationLabels: Object.fromEntries(
            (requirement.destinations ?? []).map((destination) => [
              destination.id,
              destination.label,
            ]),
          ),
        };
        return false;
      }
      game.state.pendingChoice = {
        id: `choice:${frame.id}:${binding.order}`,
        playerId: frame.controllerPlayerId,
        type: "effectSelection",
        resolutionId: frame.id,
        bindingKey,
        prompt: requirement.prompt,
        optionKind: "card",
        sourceZone: requirement.sourceZone ?? null,
        presentation: requirement.presentation ?? "cardSelection",
        legalCardIds: requirement.legalIds,
        minimum: requirement.minimum,
        maximum: requirement.maximum,
      };
      return false;
    }
    handler.execute(binding, context);
    frame.nextEffectIndex += 1;
  }

  finishResolutionFrame(game, frame.id, frame.delayedEffectId);
  return true;
}

function finishResolutionFrame(
  game: GameDocument,
  frameId: string,
  delayedEffectId: string | null,
) {
  game.state.effectResolutions = game.state.effectResolutions.filter(
    (candidate) => candidate.id !== frameId,
  );
  if (delayedEffectId) {
    game.state.delayedEffects = game.state.delayedEffects.filter(
      (candidate) => candidate.id !== delayedEffectId,
    );
  }
}
