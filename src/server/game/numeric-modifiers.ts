import type { BehaviorBinding, BehaviorClause } from "./schemas";
import type { RuntimeCardIndex } from "./primitive-handlers";
import type { GameDocument } from "./state";
import { numericConditionMatches } from "./numeric-condition";

type NumericValueInput = {
  onContribution?: (contribution: NumericContribution) => void;
  attribute: string;
  baseValue: number;
  cardType?: string;
  controllerPlayerId?: string;
  game: GameDocument;
  index?: RuntimeCardIndex;
  targetCardInstanceId?: string;
  targetScope: string;
};

export type NumericContribution = {
  id: string;
  sourceCardInstanceId: string | null;
  amount: number;
  duration: string;
  label?: string;
};

export function effectiveNumericValue(input: NumericValueInput): number {
  let value = input.baseValue;

  for (const modifier of input.game.state.modifiers) {
    if (
      modifier.attribute !== input.attribute ||
      shouldDeferTargetModifier(input, modifier) ||
      (!modifier.targetCardInstanceId &&
        modifier.targetScope !== input.targetScope) ||
      !modifierAppliesToInput(input, modifier)
    ) {
      continue;
    }
    const before = value;
    value = applyNumericOperation(value, modifier);
    input.onContribution?.({ id: modifier.id, sourceCardInstanceId: modifier.sourceCardInstanceId, amount: value - before, duration: modifier.duration });
  }

  for (const {
    binding,
    conditions,
    controllerPlayerId,
    sourceId,
    attachedEffectSourceId,
  } of input.index
    ? activeContinuousBindings(input.game, input.index)
    : []) {
    const targetsCandidate =
      binding.parameters.target === input.targetScope ||
      binding.parameters.target === "controller_card" ||
      (binding.parameters.target === "opponent_spell" &&
        input.targetScope === "controller_spell" && input.cardType === "Spell") ||
      (binding.parameters.target === "unit" &&
        input.targetScope === "source" &&
        input.targetCardInstanceId) ||
      (binding.parameters.target === "friendly_unit" &&
        input.targetScope === "source" &&
        input.targetCardInstanceId &&
        input.controllerPlayerId === controllerPlayerId);
    if (
      binding.parameters.attribute !== input.attribute ||
      !targetsCandidate ||
      (input.controllerPlayerId &&
        controllerPlayerId !== input.controllerPlayerId &&
        binding.parameters.target !== "unit" &&
        binding.parameters.target !== "opponent_spell") ||
      (binding.parameters.target === "opponent_spell" &&
        (input.controllerPlayerId === undefined ||
          controllerPlayerId === input.controllerPlayerId)) ||
      !numericBindingMatchesCardType(binding, input) ||
      (binding.parameters.excludeTokens === true &&
        input.targetCardInstanceId !== undefined &&
        input.index?.instances.get(input.targetCardInstanceId)?.source === "token") ||
      (binding.parameters.target === "source" &&
        input.targetScope === "source" &&
        input.targetCardInstanceId !== sourceId)
    ) {
      continue;
    }
    if (
      !continuousConditionApplies(
        binding,
        input,
        controllerPlayerId,
        sourceId,
        attachedEffectSourceId,
      )
    ) continue;
    if (
      conditions.some(
        (condition) =>
          condition.behaviorId !== "condition.compare_numeric_value" ||
          !numericConditionMatches({
            binding: condition,
            controllerPlayerId,
            game: input.game,
            index: input.index!,
          }),
      )
    ) {
      continue;
    }
    const before = value;
    value = applyNumericOperation(value, {
      amount: numberParameter(binding, "amount"),
      minimum:
        typeof binding.parameters.minimum === "number"
          ? binding.parameters.minimum
          : null,
      operation: stringParameter(binding, "operation"),
    });
    input.onContribution?.({
      id: `${attachedEffectSourceId ?? sourceId}:${binding.order}:${input.attribute}`,
      sourceCardInstanceId: attachedEffectSourceId ?? sourceId,
      amount: value - before,
      duration: numericModifierConditions(binding).includes("sourceAttachedThisTurn")
        ? "thisTurn"
        : String(binding.parameters.duration ?? "continuous"),
    });
  }

  for (const modifier of input.game.state.modifiers) {
    if (
      modifier.attribute !== input.attribute ||
      !shouldDeferTargetModifier(input, modifier) ||
      !modifierAppliesToInput(input, modifier)
    ) {
      continue;
    }
    const before = value;
    value = applyNumericOperation(value, modifier);
    input.onContribution?.({ id: modifier.id, sourceCardInstanceId: modifier.sourceCardInstanceId, amount: value - before, duration: modifier.duration });
  }

  if (value < 0) input.onContribution?.({ id: "minimum", sourceCardInstanceId: null, amount: -value, duration: "continuous", label: "Minimum Might / cost" });
  return Math.max(0, value);
}

function shouldDeferTargetModifier(
  input: NumericValueInput,
  modifier: GameDocument["state"]["modifiers"][number],
) {
  return (
    input.attribute === "might" &&
    input.targetScope === "source" &&
    modifier.targetCardInstanceId !== null
  );
}

function continuousConditionApplies(
  binding: BehaviorBinding,
  input: NumericValueInput,
  controllerPlayerId: string,
  sourceId: string,
  attachedEffectSourceId?: string,
) {
  const conditions = numericModifierConditions(binding);
  const targetId = input.targetCardInstanceId;
  const needsTarget =
    binding.parameters.excludesSource === true ||
    binding.parameters.locationRelation === "sourceLocation" ||
    binding.parameters.locationRelation === "sharedLocation" ||
    conditions.length > 0;
  const index = input.index;
  if (!targetId || !index) return !needsTarget;
  if (
    binding.parameters.excludesSource === true &&
    targetId === sourceId
  ) {
    return false;
  }
  if (
    (binding.parameters.locationRelation === "sourceLocation" ||
      binding.parameters.locationRelation === "sharedLocation") &&
    !sameBoardLocation(input.game, sourceId, targetId)
  ) {
    return false;
  }
  const role = input.game.state.cardStates[targetId]?.combatRole;
  return conditions.every((condition) => continuousConditionMatches(
    condition,
    input,
    controllerPlayerId,
    sourceId,
    attachedEffectSourceId,
    binding,
    targetId,
    index,
    role,
  ));
}

function continuousConditionMatches(
  condition: string,
  input: NumericValueInput,
  controllerPlayerId: string,
  sourceId: string,
  attachedEffectSourceId: string | undefined,
  binding: BehaviorBinding,
  targetId: string,
  index: RuntimeCardIndex,
  role: string | null | undefined,
) {
  if (condition === "sourceAttachedThisTurn") {
    const attachmentSourceId = attachedEffectSourceId ?? sourceId;
    return (
      input.game.state.cardStates[attachmentSourceId]?.attachedAtTurnNumber ===
      input.game.state.turn?.turnNumber
    );
  }
  if (condition === "sourceCombatsAlone") {
    return targetId === sourceId &&
      (role === "attacker" || role === "defender") &&
      combatRoleCount(input.game, index, controllerPlayerId, role) === 1;
  }
  if (condition === "friendlyDefendsAlone") {
    return role === "defender" &&
      combatRoleCount(input.game, index, controllerPlayerId, "defender") === 1;
  }
  if (condition === "firstCardOfTypePlayedThisTurn") {
    const cardType =
      typeof binding.parameters.cardType === "string"
        ? binding.parameters.cardType
        : input.cardType;
    return !input.game.state.turn?.playedCardInstanceIds?.some((id) => {
      const instance = index.instances.get(id);
      if (!instance) return false;
      return (
        instance.ownerPlayerId === input.controllerPlayerId &&
        definitionHasType(
          index.definitions.get(instance.cardCode),
          cardType,
        )
      );
    });
  }
  if (condition === "sourceControllerControlsBattlefield") {
    return input.game.state.battlefields.some(
      (battlefield) =>
        battlefield.cardInstanceId === sourceId &&
        battlefield.controllerPlayerId === controllerPlayerId,
    );
  }
  if (condition === "sourceEmpowered") {
    return input.game.state.cardStates[sourceId]?.empowered === true;
  }
  if (condition === "sourceNotEmpowered") {
    return input.game.state.cardStates[sourceId]?.empowered !== true;
  }
  if (condition === "targetDefending") {
    return input.game.state.cardStates[targetId]?.combatRole === "defender";
  }
  return true;
}

function numericModifierConditions(binding: BehaviorBinding): string[] {
  return [binding.parameters.condition, binding.parameters.conditions]
    .flatMap((value) => typeof value === "string" ? value.split("|") : [])
    .map((condition) => condition.trim())
    .filter(Boolean);
}

/** Static type eligibility shared with payment-capacity bounds. Resource Add
 * actions can change conditions and source presence, but not the card's types. */
export function numericBindingMatchesCardType(
  binding: BehaviorBinding,
  input: Pick<NumericValueInput, "cardType" | "targetScope" | "targetCardInstanceId" | "index">,
) {
  if (input.targetScope === "controller_spell" &&
    input.cardType !== "Spell" && binding.parameters.target !== "controller_card") return false;
  if (typeof binding.parameters.cardType !== "string") return true;
  if (!input.targetCardInstanceId || !input.index) {
    return input.cardType === binding.parameters.cardType;
  }
  const instance = input.index.instances.get(input.targetCardInstanceId);
  return definitionHasType(
    instance ? input.index.definitions.get(instance.cardCode) : undefined,
    binding.parameters.cardType,
  );
}

function definitionHasType(
  definition: RuntimeCardIndex["definitions"] extends Map<string, infer T>
    ? T | undefined
    : never,
  type: string | undefined,
) {
  if (!definition || !type) return false;
  return (
    definition.card.classification.type === type ||
    definition.behaviorModel.clauses.some((clause) =>
      clause.keywords.some(
        (binding) =>
          binding.behaviorId === "type.additional" &&
          binding.parameters.type === type,
      ),
    )
  );
}

function sameBoardLocation(
  game: GameDocument,
  sourceId: string,
  targetId: string,
) {
  const sourceLocation = boardLocationForCard(game, sourceId);
  const targetLocation = boardLocationForCard(game, targetId);
  return (
    sourceLocation !== null &&
    targetLocation !== null &&
    sourceLocation.kind === targetLocation.kind &&
    sourceLocation.id === targetLocation.id
  );
}

function boardLocationForCard(game: GameDocument, id: string) {
  for (const battlefield of game.state.battlefields) {
    if (
      battlefield.cardInstanceId === id ||
      battlefield.units.includes(id)
    ) {
      return { kind: "battlefield" as const, id: battlefield.battlefieldId };
    }
  }
  for (const playerId of game.state.setup.playerIds) {
    if (game.state.players[playerId]?.zones.base.includes(id)) {
      return { kind: "base" as const, id: playerId };
    }
  }
  return null;
}

function combatRoleCount(
  game: GameDocument,
  index: RuntimeCardIndex,
  playerId: string,
  role: "attacker" | "defender",
) {
  return Object.entries(game.state.cardStates).filter(
    ([id, state]) =>
      state.combatRole === role &&
      index.instances.get(id)?.ownerPlayerId === playerId,
  ).length;
}

export function isContinuousDuration(duration: unknown): boolean {
  return (
    duration === "whileSourceAtBattlefield" ||
    duration === "whileSourceOnBoard" ||
    duration === "whileAttached"
  );
}

type ActiveContinuousBinding = {
  binding: BehaviorBinding;
  conditions: BehaviorClause["conditions"];
  controllerPlayerId: string;
  sourceId: string;
  attachedEffectSourceId?: string;
};

export function activeContinuousBindings(
  game: GameDocument,
  index: RuntimeCardIndex,
): ActiveContinuousBinding[] {
  const sourceIds = [
    ...game.state.setup.playerIds.flatMap((playerId) => {
      const player = game.state.players[playerId]!;
      return [
        ...(player.zones.legend ? [player.zones.legend] : []),
        ...(player.zones.champion ? [player.zones.champion] : []),
        ...player.zones.base,
      ];
    }),
    ...game.state.battlefields.flatMap((battlefield) => [
      battlefield.cardInstanceId,
      ...battlefield.units,
    ]),
  ];

  const printedRuleBindings = [...new Set(sourceIds)].flatMap((sourceId) => {
    const instance = index.instances.get(sourceId);
    const definition = instance && index.definitions.get(instance.cardCode);
    if (
      !instance ||
      !definition ||
      game.state.cardStates[sourceId]?.attachedToCardInstanceId
    ) return [];
    return definition.behaviorModel.clauses.flatMap((clause) =>
      clause.effects.flatMap((binding) => {
        const continuousBinding = continuousNumericBinding(clause, binding);
        return continuousBinding &&
          sourceIsActive(
            game,
            sourceId,
            continuousBinding.parameters.duration,
          )
          ? [
              {
                binding: continuousBinding,
                conditions: clause.conditions,
                controllerPlayerId: continuousSourceController(
                  game,
                  sourceId,
                  instance.ownerPlayerId,
                ),
                sourceId,
              },
            ]
          : [];
      }),
    );
  });
  const effectTextBindings = Object.entries(game.state.cardStates).flatMap(
    ([attachedEffectSourceId, state]) => {
      const sourceId = state.attachedToCardInstanceId;
      if (!sourceId) return [];
      const instance = index.instances.get(attachedEffectSourceId);
      const definition = instance && index.definitions.get(instance.cardCode);
      if (!instance || !definition?.effectText || !definition.effectBehaviorModel) {
        return [];
      }
      return definition.effectBehaviorModel.clauses.flatMap((clause) =>
        clause.effects.flatMap((binding) => {
          const continuousBinding = continuousNumericBinding(clause, binding);
          return continuousBinding &&
            continuousBinding.parameters.duration === "whileAttached"
            ? [{
                binding: continuousBinding,
                conditions: clause.conditions,
                controllerPlayerId: instance.ownerPlayerId,
                sourceId,
                attachedEffectSourceId,
              }]
            : [];
        }),
      );
    },
  );
  return [...printedRuleBindings, ...effectTextBindings];
}

function continuousSourceController(
  game: GameDocument,
  sourceId: string,
  ownerPlayerId: string,
) {
  return game.state.battlefields.find(
    (battlefield) => battlefield.cardInstanceId === sourceId,
  )?.controllerPlayerId ?? ownerPlayerId;
}

function continuousNumericBinding(
  clause: BehaviorClause,
  binding: BehaviorBinding,
): BehaviorBinding | null {
  if (binding.behaviorId === "modifier.grant_keyword") {
    return isContinuousDuration(binding.parameters.duration) ? binding : null;
  }
  if (binding.behaviorId !== "modifier.modify_numeric_value") return null;
  if (isContinuousDuration(binding.parameters.duration)) return binding;
  if (!looksLikeStaticNumericModifier(clause.sourceText)) return null;

  const selector = clause.selectors.find((item) =>
    ["selector.unit", "selector.friendly_unit", "selector.enemy_unit"].includes(
      item.behaviorId,
    ),
  );
  return {
    ...binding,
    parameters: {
      ...binding.parameters,
      ...(selector?.parameters.locationRelation &&
      !binding.parameters.locationRelation
        ? { locationRelation: selector.parameters.locationRelation }
        : {}),
      ...((selector?.parameters.excludesSource === true ||
      /\bother\b/.test(clause.sourceText.toLowerCase())) &&
      binding.parameters.excludesSource !== true
        ? { excludesSource: true }
        : {}),
      duration: "whileSourceOnBoard",
    },
  };
}

function looksLikeStaticNumericModifier(sourceText: string) {
  const text = sourceText.trim().toLowerCase();
  return (
    !/^when\b/.test(text) &&
    !/\bchoose\b|\bgive\b|\bthis turn\b/.test(text) &&
    /\b(?:units?|friendly units?|enemy units?)\b[^.]{0,50}\bhave\b/.test(text)
  );
}

function sourceIsActive(
  game: GameDocument,
  sourceId: string,
  duration: unknown,
) {
  if (duration === "whileAttached") {
    return Boolean(game.state.cardStates[sourceId]?.attachedToCardInstanceId);
  }
  if (duration === "whileSourceAtBattlefield") {
    return game.state.battlefields.some((battlefield) =>
      battlefield.cardInstanceId === sourceId ||
      battlefield.units.includes(sourceId),
    );
  }
  return (
    game.state.setup.playerIds.some((playerId) => {
      const player = game.state.players[playerId]!;
      return (
        player.zones.legend === sourceId ||
        player.zones.base.includes(sourceId)
      );
    }) ||
    game.state.battlefields.some(
      (battlefield) =>
        battlefield.cardInstanceId === sourceId ||
        battlefield.units.includes(sourceId),
    )
  );
}

function modifierAppliesToInput(
  input: NumericValueInput,
  modifier: GameDocument["state"]["modifiers"][number],
) {
  if (
    !modifier.targetCardInstanceId &&
    modifier.controllerPlayerId &&
    modifier.controllerPlayerId !== input.controllerPlayerId
  ) {
    return false;
  }
  if (
    modifier.targetCardInstanceId &&
    modifier.targetCardInstanceId !== input.targetCardInstanceId
  ) {
    return false;
  }
  return input.targetScope !== "controller_spell" || input.cardType === "Spell";
}

function applyNumericOperation(
  value: number,
  modifier: {
    amount: number;
    minimum: number | null;
    operation: string;
  },
) {
  let result = value;
  if (modifier.operation === "increase") result += modifier.amount;
  if (modifier.operation === "reduce") result -= modifier.amount;
  if (modifier.operation === "multiply") result *= modifier.amount;
  if (modifier.operation === "set") result = modifier.amount;
  if (modifier.minimum !== null) result = Math.max(result, modifier.minimum);
  return result;
}

function numberParameter(binding: BehaviorBinding, key: string) {
  const value = binding.parameters[key];
  if (typeof value !== "number")
    throw new Error(`Behavior parameter ${key} must be numeric.`);
  return value;
}

function stringParameter(binding: BehaviorBinding, key: string) {
  const value = binding.parameters[key];
  if (typeof value !== "string")
    throw new Error(`Behavior parameter ${key} must be text.`);
  return value;
}
