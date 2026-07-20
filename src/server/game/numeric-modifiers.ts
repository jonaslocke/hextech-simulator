import type { BehaviorBinding, BehaviorClause } from "./schemas";
import type { RuntimeCardIndex } from "./primitive-handlers";
import type { GameDocument } from "./state";
import { conditionMatches } from "./condition-evaluation";

type NumericValueInput = {
  attribute: string;
  baseValue: number;
  cardType?: string;
  controllerPlayerId?: string;
  game: GameDocument;
  index?: RuntimeCardIndex;
  targetCardInstanceId?: string;
  targetScope: string;
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
    value = applyNumericOperation(value, modifier);
  }

  for (const modifier of activeContinuousNumericModifiers(input)) {
    value = applyNumericOperation(value, modifier);
  }

  for (const modifier of input.game.state.modifiers) {
    if (
      modifier.attribute !== input.attribute ||
      !shouldDeferTargetModifier(input, modifier) ||
      !modifierAppliesToInput(input, modifier)
    ) {
      continue;
    }
    value = applyNumericOperation(value, modifier);
  }

  return Math.max(0, value);
}

export type ActiveContinuousNumericModifier = {
  amount: number;
  attribute: string;
  duration: string;
  minimum: number | null;
  operation: "increase" | "reduce" | "multiply" | "set";
  sourceCardInstanceId: string;
};

export function activeContinuousNumericModifiers(
  input: NumericValueInput,
): ActiveContinuousNumericModifier[] {
  if (!input.index) return [];

  return activeContinuousBindings(input.game, input.index).flatMap(
    ({ binding, conditions, controllerPlayerId, sourceId }) => {
      const targetsCandidate =
        binding.parameters.target === input.targetScope ||
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
          binding.parameters.target !== "unit") ||
        (input.targetScope === "controller_spell" && input.cardType !== "Spell") ||
        (binding.parameters.target === "source" &&
          input.targetScope === "source" &&
          input.targetCardInstanceId !== sourceId) ||
        !continuousConditionApplies(
          binding,
          input,
          controllerPlayerId,
          sourceId,
        ) ||
        !conditions.every((condition) =>
          conditionMatches(condition, {
            game: input.game,
            index: input.index!,
            controllerPlayerId,
            sourceCardInstanceId: sourceId,
            event: null,
          }),
        )
      ) {
        return [];
      }

      return [{
        amount: modifierOperandAmount(binding, input.game, controllerPlayerId),
        attribute: stringParameter(binding, "attribute"),
        duration: stringParameter(binding, "duration"),
        minimum:
          typeof binding.parameters.minimum === "number"
            ? binding.parameters.minimum
            : null,
        operation: numericOperationParameter(binding),
        sourceCardInstanceId: sourceId,
      }];
    },
  );
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
) {
  const condition = binding.parameters.condition;
  const targetId = input.targetCardInstanceId;
  const needsTarget =
    binding.parameters.excludesSource === true ||
    binding.parameters.locationRelation === "sourceLocation" ||
    binding.parameters.locationRelation === "sharedLocation" ||
    typeof condition === "string";
  if (!targetId || !input.index) return !needsTarget;
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
  if (typeof condition !== "string") return true;
  if (condition === "sourceCombatsAlone") {
    return targetId === sourceId &&
      (role === "attacker" || role === "defender") &&
      combatRoleCount(input.game, input.index, controllerPlayerId, role) === 1;
  }
  if (condition === "friendlyDefendsAlone") {
    return role === "defender" &&
      combatRoleCount(input.game, input.index, controllerPlayerId, "defender") === 1;
  }
  return true;
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
    duration === "whileSourceOnBoard"
  );
}

function activeContinuousBindings(
  game: GameDocument,
  index: RuntimeCardIndex,
) {
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

  return [...new Set(sourceIds)].flatMap((sourceId) => {
    const instance = index.instances.get(sourceId);
    const definition = instance && index.definitions.get(instance.cardCode);
    if (!instance || !definition) return [];
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
                controllerPlayerId: instance.ownerPlayerId,
                sourceId,
              },
            ]
          : [];
      }),
    );
  });
}

function continuousNumericBinding(
  clause: BehaviorClause,
  binding: BehaviorBinding,
): BehaviorBinding | null {
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

function modifierOperandAmount(
  binding: BehaviorBinding,
  game: GameDocument,
  controllerPlayerId: string,
) {
  if (binding.parameters.operand === "controllerTrashCount") {
    return game.state.players[controllerPlayerId]?.zones.trash.length ?? 0;
  }
  return numberParameter(binding, "amount");
}

function stringParameter(binding: BehaviorBinding, key: string) {
  const value = binding.parameters[key];
  if (typeof value !== "string")
    throw new Error(`Behavior parameter ${key} must be text.`);
  return value;
}

function numericOperationParameter(binding: BehaviorBinding) {
  const operation = stringParameter(binding, "operation");
  if (
    operation !== "increase" &&
    operation !== "reduce" &&
    operation !== "multiply" &&
    operation !== "set"
  ) {
    throw new Error("Numeric modifier operation is unavailable.");
  }
  return operation;
}
