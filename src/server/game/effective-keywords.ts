import type { RuntimeCardIndex } from "./primitive-handlers";
import type { GameDocument } from "./state";
import { attachedCardIds } from "./attachment-lifecycle";
import { activeContinuousBindings } from "./numeric-modifiers";
import { numericConditionMatches } from "./numeric-condition";
import { getRuntimeCoverageStatus } from "./runtime-coverage";

export const additiveKeywordIds = new Set([
  "keyword.assault",
  "keyword.deflect",
  "keyword.shield",
]);

export type EffectiveKeywordContribution = {
  id: string;
  sourceCardInstanceId: string;
  amount: number | null;
};

export type EffectiveKeyword = {
  behaviorId: string;
  amount: number | null;
  contributions: EffectiveKeywordContribution[];
};

export type ProjectedKeywordAnnotation = {
  keywordId: string;
  displayName: string;
  effectiveAmount: number | null;
  activationOrder: number;
};

/**
 * Resolves the currently supported keyword characteristics from the object's
 * printed behavior and any attached effect-text behavior. This is the shared
 * owner used by gameplay checks and by later viewer projections.
 */
export function evaluateEffectiveKeywords(
  game: GameDocument,
  cardInstanceId: string,
  index: RuntimeCardIndex,
): EffectiveKeyword[] {
  const instance = index.instances.get(cardInstanceId);
  const definition = instance && index.definitions.get(instance.cardCode);
  if (!definition) throw new Error(`Card definition unavailable: ${cardInstanceId}`);

  const sources = [
    { id: cardInstanceId, clauses: definition.behaviorModel.clauses },
    ...attachedCardIds(game, cardInstanceId).flatMap((attachedId) => {
      const attachedInstance = index.instances.get(attachedId);
      const attachedDefinition = attachedInstance && index.definitions.get(attachedInstance.cardCode);
      return attachedDefinition?.effectBehaviorModel
        ? [{ id: attachedId, clauses: attachedDefinition.effectBehaviorModel.clauses }]
        : [];
    }),
  ];
  const contributions = new Map<string, EffectiveKeywordContribution[]>();

  for (const source of sources) {
    for (const clause of source.clauses) {
      for (const binding of clause.keywords) {
        if (!isSupportedKeyword(binding.behaviorId)) continue;
        const amount = additiveKeywordIds.has(binding.behaviorId)
          ? typeof binding.parameters.amount === "number"
            ? binding.parameters.amount
            : 1
          : null;
        const list = contributions.get(binding.behaviorId) ?? [];
        list.push({
          id: `${source.id}:${clause.id}:${binding.order}`,
          sourceCardInstanceId: source.id,
          amount,
        });
        contributions.set(binding.behaviorId, list);
      }
    }
  }

  for (const grant of game.state.keywordGrants ?? []) {
    if (
      grant.targetCardInstanceId !== cardInstanceId ||
      !isSupportedKeyword(grant.keywordBehaviorId) ||
      grant.targetGameObjectIncarnation !== (game.state.cardStates[cardInstanceId]?.gameObjectIncarnation ?? 0)
    ) continue;
    const list = contributions.get(grant.keywordBehaviorId) ?? [];
    list.push({
      id: grant.id,
      sourceCardInstanceId: grant.sourceCardInstanceId ?? cardInstanceId,
      amount: grant.amount,
    });
    contributions.set(grant.keywordBehaviorId, list);
  }

  for (const { binding, conditions, controllerPlayerId, sourceId, attachedEffectSourceId } of activeContinuousBindings(game, index)) {
    if (binding.behaviorId !== "modifier.grant_keyword") continue;
    const target = binding.parameters.target;
    const targetOwner = instance.ownerPlayerId;
    const targetDefinition = index.definitions.get(instance.cardCode);
    const targetIsUnit = Boolean(targetDefinition && (
      targetDefinition.card.classification.type === "Unit" ||
      targetDefinition.behaviorModel.clauses.some((clause) => clause.keywords.some((keyword) =>
        keyword.behaviorId === "type.additional" && keyword.parameters.type === "Unit",
      ))
    ));
    const targetMatches = target === "source"
      ? cardInstanceId === sourceId
      : target === "controller_card"
        ? targetOwner === controllerPlayerId
        : target === "controller_units" || target === "friendly_unit"
          ? targetIsUnit && targetOwner === controllerPlayerId
          : target === "enemy_unit"
            ? targetIsUnit && targetOwner !== controllerPlayerId
            : target === "unit"
              ? targetIsUnit
              : target === "attachedTopMost"
                ? cardInstanceId === sourceId && attachedEffectSourceId !== undefined
                : false;
    if (!targetMatches || !continuousGrantConditionsMatch({
      game,
      index,
      conditions,
      controllerPlayerId,
    })) continue;
    const keywordBehaviorId = binding.parameters.keywordBehaviorId;
    if (typeof keywordBehaviorId !== "string" || !isSupportedKeyword(keywordBehaviorId)) continue;
    const list = contributions.get(keywordBehaviorId) ?? [];
    list.push({
      id: `continuous:${attachedEffectSourceId ?? sourceId}:${binding.order}:${cardInstanceId}`,
      sourceCardInstanceId: attachedEffectSourceId ?? sourceId,
      amount: additiveKeywordIds.has(keywordBehaviorId)
        ? typeof binding.parameters.amount === "number" ? binding.parameters.amount : 1
        : null,
    });
    contributions.set(keywordBehaviorId, list);
  }

  return [...contributions.entries()].map(([behaviorId, entries]) => ({
    behaviorId,
    amount: additiveKeywordIds.has(behaviorId)
      ? entries.reduce((total, entry) => total + (entry.amount ?? 0), 0)
      : null,
    contributions: entries,
  }));
}

function continuousGrantConditionsMatch(input: {
  game: GameDocument;
  index: RuntimeCardIndex;
  conditions: Array<{ behaviorId: string; parameters: Record<string, string | number | boolean | null>; confidence: "high" | "medium" | "low"; order: number }>;
  controllerPlayerId: string;
}) {
  return input.conditions.every((condition) =>
    condition.behaviorId === "condition.compare_numeric_value" &&
    numericConditionMatches({
      binding: condition,
      controllerPlayerId: input.controllerPlayerId,
      game: input.game,
      index: input.index,
    }),
  );
}

export function nativeEffectiveKeywords(
  cardInstanceId: string,
  index: RuntimeCardIndex,
): EffectiveKeyword[] {
  const instance = index.instances.get(cardInstanceId);
  const definition = instance && index.definitions.get(instance.cardCode);
  if (!definition) throw new Error(`Card definition unavailable: ${cardInstanceId}`);
  const contributions = new Map<string, EffectiveKeywordContribution[]>();
  for (const clause of definition.behaviorModel.clauses) {
    for (const binding of clause.keywords) {
      if (!isSupportedKeyword(binding.behaviorId)) continue;
      const amount = additiveKeywordIds.has(binding.behaviorId)
        ? typeof binding.parameters.amount === "number" ? binding.parameters.amount : 1
        : null;
      const list = contributions.get(binding.behaviorId) ?? [];
      list.push({
        id: `${cardInstanceId}:${clause.id}:${binding.order}`,
        sourceCardInstanceId: cardInstanceId,
        amount,
      });
      contributions.set(binding.behaviorId, list);
    }
  }
  return [...contributions.entries()].map(([behaviorId, entries]) => ({
    behaviorId,
    amount: additiveKeywordIds.has(behaviorId)
      ? entries.reduce((total, entry) => total + (entry.amount ?? 0), 0)
      : null,
    contributions: entries,
  }));
}

export function reconcileRuntimeKeywordActivation(
  game: GameDocument,
  cardInstanceId: string,
  behaviorId: string,
  index: RuntimeCardIndex,
): void {
  const incarnation = game.state.cardStates[cardInstanceId]?.gameObjectIncarnation ?? 0;
  const effective = evaluateEffectiveKeywords(game, cardInstanceId, index).find((entry) => entry.behaviorId === behaviorId);
  const native = nativeEffectiveKeywords(cardInstanceId, index).find((entry) => entry.behaviorId === behaviorId);
  const differs = additiveKeywordIds.has(behaviorId)
    ? (effective?.amount ?? 0) !== (native?.amount ?? 0)
    : Boolean(effective) !== Boolean(native);
  const activations = game.state.runtimeKeywordActivations ?? (game.state.runtimeKeywordActivations = []);
  const existingIndex = activations.findIndex((entry) =>
    entry.targetCardInstanceId === cardInstanceId &&
    entry.targetGameObjectIncarnation === incarnation &&
    entry.keywordBehaviorId === behaviorId,
  );
  if (!differs) {
    if (existingIndex >= 0) activations.splice(existingIndex, 1);
  } else if (existingIndex < 0) {
    activations.push({
      targetCardInstanceId: cardInstanceId,
      targetGameObjectIncarnation: incarnation,
      keywordBehaviorId: behaviorId,
      activationOrder: game.state.nextRuntimeEffectOrder ?? 0,
    });
    game.state.nextRuntimeEffectOrder = (game.state.nextRuntimeEffectOrder ?? 0) + 1;
  }
}

/**
 * Capture effective keyword transitions after an authoritative game action.
 * This includes keywords that become active through attachment or continuous
 * effects, so their ordering does not depend on a later viewer projection.
 */
export function reconcileAllRuntimeKeywordActivations(
  game: GameDocument,
  index: RuntimeCardIndex,
): void {
  for (const cardInstanceId of index.instances.keys()) {
    const behaviorIds = new Set([
      ...evaluateEffectiveKeywords(game, cardInstanceId, index).map((entry) => entry.behaviorId),
      ...(game.state.runtimeKeywordActivations ?? [])
        .filter((entry) => entry.targetCardInstanceId === cardInstanceId)
        .map((entry) => entry.keywordBehaviorId),
    ]);
    for (const behaviorId of behaviorIds) {
      reconcileRuntimeKeywordActivation(game, cardInstanceId, behaviorId, index);
    }
  }
}

export function projectedKeywordAnnotations(
  game: GameDocument,
  cardInstanceId: string,
  index: RuntimeCardIndex,
): ProjectedKeywordAnnotation[] {
  const native = new Map(nativeEffectiveKeywords(cardInstanceId, index).map((entry) => [entry.behaviorId, entry]));
  const activations = new Map((game.state.runtimeKeywordActivations ?? [])
    .filter((entry) => entry.targetCardInstanceId === cardInstanceId && entry.targetGameObjectIncarnation === (game.state.cardStates[cardInstanceId]?.gameObjectIncarnation ?? 0))
    .map((entry) => [entry.keywordBehaviorId, entry.activationOrder]));
  return evaluateEffectiveKeywords(game, cardInstanceId, index).flatMap((entry) => {
    const printed = native.get(entry.behaviorId);
    const differs = additiveKeywordIds.has(entry.behaviorId)
      ? entry.amount !== (printed?.amount ?? 0)
      : !printed;
    if (!differs) return [];
    return [{
      keywordId: entry.behaviorId,
      displayName: displayKeywordName(entry.behaviorId),
      effectiveAmount: entry.amount,
      activationOrder: activations.get(entry.behaviorId) ?? Number.MAX_SAFE_INTEGER,
    }];
  }).sort((left, right) => left.activationOrder - right.activationOrder);
}

function displayKeywordName(behaviorId: string): string {
  return behaviorId.replace(/^keyword\./, "").split("_").map((word) =>
    word.slice(0, 1).toUpperCase() + word.slice(1),
  ).join(" ");
}

function isSupportedKeyword(behaviorId: string): boolean {
  return behaviorId.startsWith("keyword.") && getRuntimeCoverageStatus(behaviorId) === "executable";
}

export function hasEffectiveKeyword(
  game: GameDocument,
  cardInstanceId: string,
  behaviorId: string,
  index: RuntimeCardIndex,
): boolean {
  return evaluateEffectiveKeywords(game, cardInstanceId, index).some(
    (keyword) => keyword.behaviorId === behaviorId,
  );
}

export function effectiveKeywordAmount(
  game: GameDocument,
  cardInstanceId: string,
  behaviorId: string,
  index: RuntimeCardIndex,
): number {
  return evaluateEffectiveKeywords(game, cardInstanceId, index).find(
    (keyword) => keyword.behaviorId === behaviorId,
  )?.amount ?? 0;
}
